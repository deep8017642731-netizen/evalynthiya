// Real-time bidirectional voice service using Gemini Live API (gemini-3.1-flash-live-preview)
// Handles 16kHz microphone stream capture and 24kHz gapless PCM playback.

export interface LiveVoiceCallbacks {
  onStateChange: (state: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
  onVolume: (volume: number) => void;
  onTranscript: (text: string, role: 'user' | 'assistant', isFinal?: boolean) => void;
  onError: (error: string) => void;
}

function float32To16BitPCM(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function pcm24kToBuffer(audioCtx: AudioContext, base64: string): AudioBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const buffer = audioCtx.createBuffer(1, int16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < int16.length; i++) {
    channelData[i] = int16[i] / 32768.0;
  }
  return buffer;
}

export class LiveVoiceSession {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  private callbacks: LiveVoiceCallbacks;
  private isConnected: boolean = false;
  private isMuted: boolean = false;
  private playbackRate: number = 1.15; // Natural fast speech rate
  private nextStartTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private animFrame: number | null = null;
  private currentAssistantTranscript: string = '';

  constructor(callbacks: LiveVoiceCallbacks) {
    this.callbacks = callbacks;
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.min(1.4, Math.max(0.9, rate));
  }

  public async start(): Promise<boolean> {
    try {
      // 1. Establish WebSocket connection to backend /api/live
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;

      this.callbacks.onStateChange('thinking');

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        this.ws = socket;

        const timeout = setTimeout(() => {
          reject(new Error('Live voice connection timed out.'));
        }, 8000);

        socket.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve();
        };

        socket.onerror = (err) => {
          clearTimeout(timeout);
          reject(new Error('Could not connect to Live voice server.'));
        };

        socket.onclose = () => {
          this.isConnected = false;
          this.callbacks.onStateChange('idle');
        };

        socket.onmessage = (event) => {
          this.handleServerMessage(event.data);
        };
      });

      // 2. Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioCtx = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioCtx = new AudioContextClass({ sampleRate: 24000 });

      if (this.inputAudioCtx.state === 'suspended') {
        await this.inputAudioCtx.resume();
      }
      if (this.outputAudioCtx.state === 'suspended') {
        await this.outputAudioCtx.resume();
      }

      // Output Analyser for visualizing assistant speaking
      this.outputAnalyser = this.outputAudioCtx.createAnalyser();
      this.outputAnalyser.fftSize = 128;

      // 3. Capture Microphone at 16kHz
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.micSourceNode = this.inputAudioCtx.createMediaStreamSource(this.micStream);
      this.processorNode = this.inputAudioCtx.createScriptProcessor(2048, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isConnected || this.isMuted) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Compute input volume
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const volume = Math.min(1, rms * 5);

        // If user is speaking, report mic volume
        if (this.activeSources.length === 0) {
          this.callbacks.onVolume(volume);
        }

        // Stream PCM data to WebSocket
        const pcmBase64 = float32To16BitPCM(inputData);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ audio: pcmBase64 }));
        }
      };

      this.micSourceNode.connect(this.processorNode);
      this.processorNode.connect(this.inputAudioCtx.destination);

      // Start volume monitor loop for output audio
      this.startOutputVisualizer();

      this.callbacks.onStateChange('listening');
      return true;
    } catch (err: any) {
      console.error('Failed to start Live Voice session:', err);
      this.callbacks.onError(err?.message || 'Failed to start microphone or live stream');
      this.stop();
      return false;
    }
  }

  private handleServerMessage(rawData: string) {
    try {
      const msg = JSON.parse(rawData);

      if (msg.error) {
        this.callbacks.onError(msg.error);
        return;
      }

      // User interrupted model or model stopped
      if (msg.interrupted) {
        this.interruptPlayback();
        this.callbacks.onStateChange('listening');
        return;
      }

      // Incoming audio chunk from Gemini Live
      if (msg.audio && this.outputAudioCtx) {
        this.callbacks.onStateChange('speaking');
        this.playAudioChunk(msg.audio);
      }

      // Transcript chunks
      if (msg.text) {
        this.currentAssistantTranscript += msg.text;
        this.callbacks.onTranscript(this.currentAssistantTranscript, 'assistant', false);
      }

      if (msg.turnComplete) {
        if (this.currentAssistantTranscript.trim()) {
          this.callbacks.onTranscript(this.currentAssistantTranscript.trim(), 'assistant', true);
          this.currentAssistantTranscript = '';
        }
      }
    } catch (e) {
      console.warn('Error parsing live server message:', e);
    }
  }

  private playAudioChunk(base64Pcm: string) {
    if (!this.outputAudioCtx || !this.outputAnalyser) return;

    try {
      const buffer = pcm24kToBuffer(this.outputAudioCtx, base64Pcm);
      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.playbackRate;

      source.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.outputAudioCtx.destination);

      const currentTime = this.outputAudioCtx.currentTime;
      // Gapless scheduling accounting for playbackRate
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration / this.playbackRate;

      this.activeSources.push(source);

      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
        if (this.activeSources.length === 0) {
          this.callbacks.onStateChange('listening');
        }
      };
    } catch (err) {
      console.error('Audio chunk playback error in live session:', err);
    }
  }

  private interruptPlayback() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeSources = [];
    if (this.outputAudioCtx) {
      this.nextStartTime = this.outputAudioCtx.currentTime;
    }
    this.currentAssistantTranscript = '';
  }

  private startOutputVisualizer() {
    const dataArray = new Uint8Array(128);

    const checkVolume = () => {
      if (this.activeSources.length > 0 && this.outputAnalyser) {
        this.outputAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        this.callbacks.onVolume(Math.min(1, avg * 1.6));
      }
      this.animFrame = requestAnimationFrame(checkVolume);
    };

    this.animFrame = requestAnimationFrame(checkVolume);
  }

  public sendText(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text }));
      this.callbacks.onStateChange('thinking');
    }
  }

  public stop() {
    this.isConnected = false;
    this.interruptPlayback();

    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.inputAudioCtx && this.inputAudioCtx.state !== 'closed') {
      this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx && this.outputAudioCtx.state !== 'closed') {
      this.outputAudioCtx.close();
      this.outputAudioCtx = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.callbacks.onStateChange('idle');
  }
}
