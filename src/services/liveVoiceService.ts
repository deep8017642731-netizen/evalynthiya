// Real-time bidirectional voice service using Gemini Live API.
// Gemini Live:
//   Input  -> 16-bit PCM, 16kHz
//   Output -> 16-bit PCM, 24kHz
//
// This implementation:
// - Connects to the Render Live WebSocket backend
// - Waits for the backend/Gemini session to be ready
// - Captures microphone audio at the browser's native sample rate
// - Explicitly resamples microphone audio to 16kHz
// - Sends little-endian 16-bit PCM to Gemini
// - Receives 24kHz PCM audio from Gemini
// - Plays audio continuously/gaplessly
// - Handles interruption / barge-in
// - Provides user/model transcription callbacks
// - Cleans up all resources safely

export interface LiveVoiceCallbacks {
  onStateChange: (
    state: "idle" | "listening" | "thinking" | "speaking"
  ) => void;

  onVolume: (volume: number) => void;

  onTranscript: (
    text: string,
    role: "user" | "assistant",
    isFinal?: boolean
  ) => void;

  onError: (error: string) => void;
}


// ============================================================
// CONSTANTS
// ============================================================

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const INPUT_BUFFER_SIZE = 2048;


// ============================================================
// PCM UTILITIES
// ============================================================

/**
 * Convert Float32 PCM samples to signed 16-bit little-endian PCM
 * and encode them as base64.
 */
function float32To16BitPCM(
  float32Array: Float32Array
): string {
  const buffer = new ArrayBuffer(
    float32Array.length * 2
  );

  const view = new DataView(buffer);

  for (
    let i = 0;
    i < float32Array.length;
    i++
  ) {
    const sample = Math.max(
      -1,
      Math.min(1, float32Array[i])
    );

    const value =
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff;

    view.setInt16(
      i * 2,
      value,
      true
    );
  }

  const bytes = new Uint8Array(buffer);

  // Efficient base64 conversion for browser environments.
  let binary = "";

  const chunkSize = 0x8000;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk = bytes.subarray(
      offset,
      Math.min(
        offset + chunkSize,
        bytes.length
      )
    );

    binary += String.fromCharCode(
      ...chunk
    );
  }

  return btoa(binary);
}


/**
 * Decode base64 16-bit little-endian PCM into an AudioBuffer.
 */
function pcmToAudioBuffer(
  audioCtx: AudioContext,
  base64: string,
  sampleRate: number
): AudioBuffer {
  const binary = atob(base64);

  const bytes = new Uint8Array(
    binary.length
  );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] = binary.charCodeAt(i);
  }

  // PCM16 must contain complete 2-byte samples.
  const sampleCount =
    Math.floor(bytes.length / 2);

  const buffer =
    audioCtx.createBuffer(
      1,
      sampleCount,
      sampleRate
    );

  const channelData =
    buffer.getChannelData(0);

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    sampleCount * 2
  );

  for (
    let i = 0;
    i < sampleCount;
    i++
  ) {
    channelData[i] =
      view.getInt16(
        i * 2,
        true
      ) / 32768;
  }

  return buffer;
}


// ============================================================
// RESAMPLER
// ============================================================

/**
 * Resample microphone Float32 audio to exactly 16kHz.
 *
 * Browsers frequently run AudioContext at 44.1kHz or 48kHz,
 * even when 16kHz is requested. Gemini Live expects 16kHz,
 * so we explicitly resample before sending.
 */
function resampleTo16k(
  input: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (
    inputSampleRate === INPUT_SAMPLE_RATE
  ) {
    return new Float32Array(input);
  }

  const ratio =
    inputSampleRate /
    INPUT_SAMPLE_RATE;

  const outputLength =
    Math.floor(
      input.length / ratio
    );

  if (outputLength <= 0) {
    return new Float32Array(0);
  }

  const output =
    new Float32Array(
      outputLength
    );

  for (
    let i = 0;
    i < outputLength;
    i++
  ) {
    const position = i * ratio;

    const index =
      Math.floor(position);

    const fraction =
      position - index;

    const sample1 =
      input[
        Math.min(
          index,
          input.length - 1
        )
      ];

    const sample2 =
      input[
        Math.min(
          index + 1,
          input.length - 1
        )
      ];

    output[i] =
      sample1 +
      (sample2 - sample1) *
        fraction;
  }

  return output;
}


// ============================================================
// LIVE VOICE SESSION
// ============================================================

export class LiveVoiceSession {
  private ws: WebSocket | null = null;

  private inputAudioCtx:
    AudioContext | null = null;

  private outputAudioCtx:
    AudioContext | null = null;

  private micStream:
    MediaStream | null = null;

  private processorNode:
    ScriptProcessorNode | null = null;

  private micSourceNode:
    MediaStreamAudioSourceNode | null = null;

  private outputAnalyser:
    AnalyserNode | null = null;

  private outputGain:
    GainNode | null = null;

  private callbacks:
    LiveVoiceCallbacks;

  private isConnected = false;

  private isReady = false;

  private isMuted = false;

  private playbackRate = 1.15;

  private nextStartTime = 0;

  private activeSources:
    AudioBufferSourceNode[] = [];

  private animFrame:
    number | null = null;

  private currentAssistantTranscript = "";

  private userTranscript = "";

  private destroyed = false;


  // ==========================================================
  // CONSTRUCTOR
  // ==========================================================

  constructor(
    callbacks: LiveVoiceCallbacks
  ) {
    this.callbacks = callbacks;
  }


  // ==========================================================
  // PLAYBACK RATE
  // ==========================================================

  public setPlaybackRate(
    rate: number
  ) {
    this.playbackRate =
      Math.min(
        1.4,
        Math.max(0.9, rate)
      );
  }


  // ==========================================================
  // START
  // ==========================================================

  public async start(): Promise<boolean> {
    try {
      this.destroyed = false;

      // ------------------------------------------------------
      // 1. CHECK MICROPHONE SUPPORT
      // ------------------------------------------------------

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          "Microphone access is not supported by this browser."
        );
      }


      // ------------------------------------------------------
      // 2. CONNECT TO RENDER WEBSOCKET
      // ------------------------------------------------------

      const API_URL =
        import.meta.env.VITE_API_URL || "";

      const wsBase =
        API_URL.replace(
          /^http/,
          "ws"
        );

      const wsUrl =
        `${wsBase}/api/live`;

      console.log(
        "[LIVE CLIENT] Connecting:",
        wsUrl
      );

      this.callbacks.onStateChange(
        "thinking"
      );


      // ------------------------------------------------------
      // WAIT FOR BACKEND READY
      // ------------------------------------------------------

      await new Promise<void>(
        (resolve, reject) => {
          const socket =
            new WebSocket(wsUrl);

          this.ws = socket;

          let settled = false;

          const timeout =
            window.setTimeout(() => {
              if (settled) return;

              settled = true;

              try {
                socket.close();
              } catch {}

              reject(
                new Error(
                  "Live voice connection timed out."
                )
              );
            }, 12000);


          socket.onopen = () => {
            console.log(
              "[LIVE CLIENT] WebSocket connected"
            );

            this.isConnected = true;
          };


          socket.onerror = () => {
            if (settled) return;

            settled = true;

            clearTimeout(timeout);

            reject(
              new Error(
                "Could not connect to Live voice server."
              )
            );
          };


          socket.onclose = () => {
            console.log(
              "[LIVE CLIENT] WebSocket closed"
            );

            this.isConnected = false;
            this.isReady = false;

            if (!settled) {
              settled = true;

              clearTimeout(timeout);

              reject(
                new Error(
                  "Live voice server closed the connection before becoming ready."
                )
              );
            }

            this.callbacks.onStateChange(
              "idle"
            );
          };


          socket.onmessage = (
            event
          ) => {
            try {
              const msg =
                JSON.parse(
                  event.data
                );

              // Backend/Gemini session ready
              if (msg.ready) {
                console.log(
                  "[LIVE CLIENT] Backend is ready"
                );

                this.isReady = true;

                if (!settled) {
                  settled = true;

                  clearTimeout(timeout);

                  resolve();
                }

                return;
              }

              // Process normal Live messages
              this.handleServerMessage(
                event.data
              );
            } catch (error) {
              console.warn(
                "[LIVE CLIENT] Message parsing error:",
                error
              );
            }
          };
        }
      );


      // ------------------------------------------------------
      // 3. INITIALIZE AUDIO CONTEXTS
      // ------------------------------------------------------

      const AudioContextClass =
        window.AudioContext ||
        (window as any)
          .webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error(
          "Web Audio API is not supported by this browser."
        );
      }


      // Do NOT assume browser actually uses 16kHz.
      // We capture at the browser's native rate and
      // explicitly resample to 16kHz below.

      this.inputAudioCtx =
        new AudioContextClass();

      this.outputAudioCtx =
        new AudioContextClass();


      console.log(
        "[LIVE CLIENT] Input AudioContext sample rate:",
        this.inputAudioCtx.sampleRate
      );

      console.log(
        "[LIVE CLIENT] Output AudioContext sample rate:",
        this.outputAudioCtx.sampleRate
      );


      // ------------------------------------------------------
      // RESUME AUDIO CONTEXTS
      // ------------------------------------------------------

      if (
        this.inputAudioCtx.state ===
        "suspended"
      ) {
        await this.inputAudioCtx.resume();
      }

      if (
        this.outputAudioCtx.state ===
        "suspended"
      ) {
        await this.outputAudioCtx.resume();
      }


      // ------------------------------------------------------
      // 4. OUTPUT AUDIO GRAPH
      // ------------------------------------------------------

      this.outputAnalyser =
        this.outputAudioCtx.createAnalyser();

      this.outputAnalyser.fftSize =
        128;

      this.outputAnalyser.smoothingTimeConstant =
        0.75;


      this.outputGain =
        this.outputAudioCtx.createGain();

      this.outputGain.gain.value =
        1.0;


      // IMPORTANT:
      // Connect the output graph ONCE.
      this.outputAnalyser.connect(
        this.outputGain
      );

      this.outputGain.connect(
        this.outputAudioCtx.destination
      );


      // ------------------------------------------------------
      // 5. GET MICROPHONE
      // ------------------------------------------------------

      this.micStream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
          }
        );


      console.log(
        "[LIVE CLIENT] Microphone access granted"
      );


      // ------------------------------------------------------
      // 6. CREATE MICROPHONE SOURCE
      // ------------------------------------------------------

      this.micSourceNode =
        this.inputAudioCtx.createMediaStreamSource(
          this.micStream
        );


      this.processorNode =
        this.inputAudioCtx.createScriptProcessor(
          INPUT_BUFFER_SIZE,
          1,
          1
        );


      // ------------------------------------------------------
      // 7. PROCESS MICROPHONE AUDIO
      // ------------------------------------------------------

      this.processorNode.onaudioprocess =
        (event) => {
          if (
            !this.isConnected ||
            !this.isReady ||
            this.isMuted ||
            !this.ws ||
            this.ws.readyState !==
              WebSocket.OPEN
          ) {
            return;
          }


          const inputData =
            event.inputBuffer.getChannelData(
              0
            );


          // -----------------------------------------------
          // INPUT VOLUME
          // -----------------------------------------------

          let sum = 0;

          for (
            let i = 0;
            i < inputData.length;
            i++
          ) {
            const sample =
              inputData[i];

            sum +=
              sample * sample;
          }

          const rms =
            Math.sqrt(
              sum /
                inputData.length
            );

          const volume =
            Math.min(
              1,
              rms * 5
            );


          // Only show mic volume when
          // assistant isn't currently speaking.
          if (
            this.activeSources.length ===
            0
          ) {
            this.callbacks.onVolume(
              volume
            );
          }


          // -----------------------------------------------
          // RESAMPLE TO EXACTLY 16KHz
          // -----------------------------------------------

          const resampled =
            resampleTo16k(
              inputData,
              this.inputAudioCtx
                ?.sampleRate ||
                INPUT_SAMPLE_RATE
            );


          if (
            resampled.length === 0
          ) {
            return;
          }


          // -----------------------------------------------
          // FLOAT32 → PCM16 → BASE64
          // -----------------------------------------------

          const pcmBase64 =
            float32To16BitPCM(
              resampled
            );


          // -----------------------------------------------
          // SEND TO RENDER
          // -----------------------------------------------

          try {
            this.ws.send(
              JSON.stringify({
                audio: pcmBase64,
              })
            );
          } catch (error) {
            console.error(
              "[LIVE CLIENT] Failed to send microphone audio:",
              error
            );
          }
        };


      // ------------------------------------------------------
      // CONNECT AUDIO NODES
      // ------------------------------------------------------

      this.micSourceNode.connect(
        this.processorNode
      );

      // ScriptProcessorNode needs to be connected
      // to an output to keep processing alive.
      this.processorNode.connect(
        this.inputAudioCtx.destination
      );


      // ------------------------------------------------------
      // 8. START OUTPUT VISUALIZER
      // ------------------------------------------------------

      this.startOutputVisualizer();


      // ------------------------------------------------------
      // 9. READY FOR USER
      // ------------------------------------------------------

      this.callbacks.onStateChange(
        "listening"
      );

      console.log(
        "[LIVE CLIENT] Voice session ready"
      );

      return true;
    } catch (error: any) {
      console.error(
        "[LIVE CLIENT] Failed to start Live Voice session:",
        error
      );

      this.callbacks.onError(
        error?.message ||
          "Failed to start microphone or live stream."
      );

      this.stop();

      return false;
    }
  }


  // ==========================================================
  // SERVER MESSAGE HANDLER
  // ==========================================================

  private handleServerMessage(
    rawData: string
  ) {
    try {
      const msg =
        JSON.parse(rawData);


      // ------------------------------------------------------
      // ERROR
      // ------------------------------------------------------

      if (msg.error) {
        console.error(
          "[LIVE CLIENT] Server error:",
          msg.error
        );

        this.callbacks.onError(
          msg.error
        );

        return;
      }


      // ------------------------------------------------------
      // INTERRUPTION / BARGE-IN
      // ------------------------------------------------------

      if (msg.interrupted) {
        console.log(
          "[LIVE CLIENT] Gemini interrupted playback"
        );

        this.interruptPlayback();

        this.callbacks.onStateChange(
          "listening"
        );

        return;
      }


      // ------------------------------------------------------
      // USER TRANSCRIPT
      // ------------------------------------------------------

      if (
        msg.inputTranscript
      ) {
        this.userTranscript +=
          msg.inputTranscript;

        this.callbacks.onTranscript(
          this.userTranscript,
          "user",
          false
        );
      }


      // ------------------------------------------------------
      // ASSISTANT TRANSCRIPT
      // ------------------------------------------------------

      if (
        msg.outputTranscript
      ) {
        this.currentAssistantTranscript +=
          msg.outputTranscript;

        this.callbacks.onTranscript(
          this.currentAssistantTranscript,
          "assistant",
          false
        );
      }


      // ------------------------------------------------------
      // LEGACY / DIRECT TEXT
      // ------------------------------------------------------

      if (msg.text) {
        this.currentAssistantTranscript +=
          msg.text;

        this.callbacks.onTranscript(
          this.currentAssistantTranscript,
          "assistant",
          false
        );
      }


      // ------------------------------------------------------
      // GEMINI AUDIO
      // ------------------------------------------------------

      if (
        msg.audio &&
        this.outputAudioCtx
      ) {
        console.log(
          "[LIVE CLIENT] Received audio chunk"
        );

        this.callbacks.onStateChange(
          "speaking"
        );

        this.playAudioChunk(
          msg.audio
        );
      }


      // ------------------------------------------------------
      // TURN COMPLETE
      // ------------------------------------------------------

      if (msg.turnComplete) {
        console.log(
          "[LIVE CLIENT] Turn complete"
        );

        if (
          this.userTranscript.trim()
        ) {
          this.callbacks.onTranscript(
            this.userTranscript.trim(),
            "user",
            true
          );

          this.userTranscript = "";
        }

        if (
          this.currentAssistantTranscript.trim()
        ) {
          this.callbacks.onTranscript(
            this.currentAssistantTranscript.trim(),
            "assistant",
            true
          );

          this.currentAssistantTranscript =
            "";
        }


        // If no audio is still playing,
        // return to listening immediately.
        if (
          this.activeSources.length ===
          0
        ) {
          this.callbacks.onStateChange(
            "listening"
          );
        }
      }
    } catch (error) {
      console.warn(
        "[LIVE CLIENT] Error parsing server message:",
        error
      );
    }
  }


  // ==========================================================
  // AUDIO PLAYBACK
  // ==========================================================

  private playAudioChunk(
    base64Pcm: string
  ) {
    if (
      !this.outputAudioCtx
    ) {
      console.warn(
        "[LIVE CLIENT] Output AudioContext unavailable"
      );

      return;
    }


    try {
      // ------------------------------------------------------
      // RESUME OUTPUT CONTEXT IF NECESSARY
      // ------------------------------------------------------

      if (
        this.outputAudioCtx.state ===
        "suspended"
      ) {
        void this.outputAudioCtx.resume();
      }


      // ------------------------------------------------------
      // DECODE 24KHz GEMINI PCM
      // ------------------------------------------------------

      const buffer =
        pcmToAudioBuffer(
          this.outputAudioCtx,
          base64Pcm,
          OUTPUT_SAMPLE_RATE
        );


      if (
        buffer.length === 0
      ) {
        return;
      }


      // ------------------------------------------------------
      // CREATE AUDIO SOURCE
      // ------------------------------------------------------

      const source =
        this.outputAudioCtx.createBufferSource();

      source.buffer = buffer;

      source.playbackRate.value =
        this.playbackRate;


      // ------------------------------------------------------
      // AUDIO GRAPH
      // ------------------------------------------------------

      if (
        this.outputAnalyser
      ) {
        source.connect(
          this.outputAnalyser
        );
      } else {
        source.connect(
          this.outputAudioCtx.destination
        );
      }


      // ------------------------------------------------------
      // GAPLESS SCHEDULING
      // ------------------------------------------------------

      const currentTime =
        this.outputAudioCtx.currentTime;


      if (
        this.nextStartTime <
        currentTime
      ) {
        this.nextStartTime =
          currentTime;
      }


      source.start(
        this.nextStartTime
      );


      this.nextStartTime +=
        buffer.duration /
        this.playbackRate;


      // ------------------------------------------------------
      // TRACK ACTIVE SOURCE
      // ------------------------------------------------------

      this.activeSources.push(
        source
      );


      source.onended = () => {
        const index =
          this.activeSources.indexOf(
            source
          );

        if (index > -1) {
          this.activeSources.splice(
            index,
            1
          );
        }


        try {
          source.disconnect();
        } catch {}


        if (
          this.activeSources.length ===
          0
        ) {
          this.callbacks.onVolume(
            0
          );

          this.callbacks.onStateChange(
            "listening"
          );
        }
      };
    } catch (error) {
      console.error(
        "[LIVE CLIENT] Audio playback error:",
        error
      );

      this.callbacks.onError(
        "Unable to play EVALYNTHIYA's voice."
      );
    }
  }


  // ==========================================================
  // INTERRUPTION
  // ==========================================================

  private interruptPlayback() {
    for (
      const source of this.activeSources
    ) {
      try {
        source.stop();
      } catch {}

      try {
        source.disconnect();
      } catch {}
    }


    this.activeSources = [];


    if (
      this.outputAudioCtx
    ) {
      this.nextStartTime =
        this.outputAudioCtx.currentTime;
    }


    this.currentAssistantTranscript =
      "";
  }


  // ==========================================================
  // OUTPUT VISUALIZER
  // ==========================================================

  private startOutputVisualizer() {
    const dataArray =
      new Uint8Array(128);


    const checkVolume = () => {
      if (
        this.outputAnalyser &&
        this.activeSources.length >
          0
      ) {
        this.outputAnalyser.getByteFrequencyData(
          dataArray
        );


        let sum = 0;

        for (
          let i = 0;
          i < dataArray.length;
          i++
        ) {
          sum += dataArray[i];
        }


        const average =
          sum /
          dataArray.length /
          255;


        this.callbacks.onVolume(
          Math.min(
            1,
            average * 1.6
          )
        );
      }


      if (!this.destroyed) {
        this.animFrame =
          requestAnimationFrame(
            checkVolume
          );
      }
    };


    this.animFrame =
      requestAnimationFrame(
        checkVolume
      );
  }


  // ==========================================================
  // SEND TEXT THROUGH LIVE SESSION
  // ==========================================================

  public sendText(
    text: string
  ) {
    const trimmed =
      text.trim();

    if (!trimmed) {
      return;
    }


    if (
      this.ws &&
      this.ws.readyState ===
        WebSocket.OPEN &&
      this.isReady
    ) {
      console.log(
        "[LIVE CLIENT] Sending text:",
        trimmed
      );

      this.ws.send(
        JSON.stringify({
          text: trimmed,
        })
      );

      this.callbacks.onStateChange(
        "thinking"
      );
    } else {
      console.warn(
        "[LIVE CLIENT] Cannot send text: Live session is not ready"
      );
    }
  }


  // ==========================================================
  // MUTE
  // ==========================================================

  public setMuted(
    muted: boolean
  ) {
    this.isMuted = muted;
  }


  // ==========================================================
  // STOP
  // ==========================================================

  public stop() {
    console.log(
      "[LIVE CLIENT] Stopping voice session"
    );


    this.destroyed = true;

    this.isConnected = false;

    this.isReady = false;


    // --------------------------------------------------------
    // STOP AUDIO PLAYBACK
    // --------------------------------------------------------

    this.interruptPlayback();


    // --------------------------------------------------------
    // STOP VISUALIZER
    // --------------------------------------------------------

    if (
      this.animFrame !== null
    ) {
      cancelAnimationFrame(
        this.animFrame
      );

      this.animFrame = null;
    }


    // --------------------------------------------------------
    // DISCONNECT PROCESSOR
    // --------------------------------------------------------

    if (
      this.processorNode
    ) {
      try {
        this.processorNode.disconnect();
      } catch {}

      this.processorNode =
        null;
    }


    // --------------------------------------------------------
    // DISCONNECT MIC SOURCE
    // --------------------------------------------------------

    if (
      this.micSourceNode
    ) {
      try {
        this.micSourceNode.disconnect();
      } catch {}

      this.micSourceNode =
        null;
    }


    // --------------------------------------------------------
    // STOP MICROPHONE
    // --------------------------------------------------------

    if (
      this.micStream
    ) {
      this.micStream
        .getTracks()
        .forEach(
          (track) => {
            try {
              track.stop();
            } catch {}
          }
        );

      this.micStream =
        null;
    }


    // --------------------------------------------------------
    // CLOSE INPUT AUDIO CONTEXT
    // --------------------------------------------------------

    if (
      this.inputAudioCtx &&
      this.inputAudioCtx.state !==
        "closed"
    ) {
      void this.inputAudioCtx.close();
    }

    this.inputAudioCtx =
      null;


    // --------------------------------------------------------
    // CLOSE OUTPUT AUDIO CONTEXT
    // --------------------------------------------------------

    if (
      this.outputAudioCtx &&
      this.outputAudioCtx.state !==
        "closed"
    ) {
      void this.outputAudioCtx.close();
    }

    this.outputAudioCtx =
      null;


    // --------------------------------------------------------
    // CLOSE WEBSOCKET
    // --------------------------------------------------------

    if (
      this.ws
    ) {
      try {
        this.ws.close();
      } catch {}

      this.ws = null;
    }


    // --------------------------------------------------------
    // RESET STATE
    // --------------------------------------------------------

    this.outputAnalyser =
      null;

    this.outputGain =
      null;

    this.nextStartTime =
      0;

    this.activeSources =
      [];

    this.currentAssistantTranscript =
      "";

    this.userTranscript =
      "";


    this.callbacks.onStateChange(
      "idle"
    );
  }
}