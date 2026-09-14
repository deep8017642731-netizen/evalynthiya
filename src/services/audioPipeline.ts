import { detectLanguage } from '../utils/languageDetector';
import { requestGeminiTTS } from './geminiService';

export type SpeechCallback = (text: string, isFinal: boolean) => void;
export type VolumeCallback = (volume: number, frequencies: Uint8Array) => void;
export type InterruptionCallback = () => void;

// Helper to convert base64 PCM to AudioBuffer
function pcmToAudioBuffer(
  audioCtx: AudioContext,
  base64Data: string,
  sampleRate: number = 24000
): AudioBuffer {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 16-bit PCM little endian
  const int16Array = new Int16Array(bytes.buffer);
  const audioBuffer = audioCtx.createBuffer(1, int16Array.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / 32768.0;
  }

  return audioBuffer;
}

export class VoicePipeline {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;

  // Speech Recognition
  private recognition: any = null;
  private isRecognitionActive: boolean = false;
  private currentLanguage: string = 'en-IN';

  // Audio Playback
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private isSpeakingAudio: boolean = false;
  private sentenceQueue: string[] = [];
  private isProcessingQueue: boolean = false;

  // VAD & Barge-in
  private isAssistantPlaying: boolean = false;
  private vadSilenceTimer: any = null;
  private userSpokeRecently: boolean = false;

  // Callbacks
  private onSpeechResult: SpeechCallback | null = null;
  private onVolumeChange: VolumeCallback | null = null;
  private onBargeIn: InterruptionCallback | null = null;
  private onPlaybackStateChange: ((isPlaying: boolean) => void) | null = null;
  private onEngineFallback: ((engine: 'browser') => void) | null = null;

  // Configuration
  private ttsEngine: 'gemini' | 'browser' = 'browser';
  private speechSpeed: number = 1.2; // 1.2x: lively, snappy, human conversational speed
  private vadThreshold: number = 0.045; // Energy threshold for barge-in detection
  private consecutiveLoudFrames: number = 0;

  constructor() {
    this.initSpeechRecognition();
  }

  public setEngineFallbackCallback(cb: (engine: 'browser') => void) {
    this.onEngineFallback = cb;
  }

  private initSpeechRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech Recognition API is not supported in this browser.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.currentLanguage;

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Barge-in check on transcript arrival:
        if (this.isAssistantPlaying && (interimTranscript.trim() || finalTranscript.trim())) {
          this.triggerBargeIn();
        }

        if (finalTranscript.trim() && this.onSpeechResult) {
          this.onSpeechResult(finalTranscript.trim(), true);
        } else if (interimTranscript.trim() && this.onSpeechResult) {
          this.onSpeechResult(interimTranscript.trim(), false);
        }
      };

      this.recognition.onerror = (event: any) => {
        // Ignore aborted errors during barge-in/stop
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        console.warn('Speech recognition status:', event.error);
      };

      this.recognition.onend = () => {
        this.isRecognitionActive = false;
      };
    } catch (e) {
      console.error('Failed to initialize speech recognition', e);
    }
  }

  public async startMicrophone({
    onVolume,
    onSpeech,
    onInterruption,
    onPlaybackChange,
  }: {
    onVolume: VolumeCallback;
    onSpeech: SpeechCallback;
    onInterruption: InterruptionCallback;
    onPlaybackChange: (isPlaying: boolean) => void;
  }): Promise<boolean> {
    this.onVolumeChange = onVolume;
    this.onSpeechResult = onSpeech;
    this.onBargeIn = onInterruption;
    this.onPlaybackStateChange = onPlaybackChange;

    try {
      if (!this.audioCtx) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.5;

        this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
        this.micSource.connect(this.analyser);
      }

      this.startAudioAnalysisLoop();
      this.startListening();
      return true;
    } catch (err: any) {
      console.error('Microphone access denied or error:', err);
      return false;
    }
  }

  public setLanguage(langCode: string) {
    let tag = 'en-IN';
    if (langCode === 'bn') tag = 'bn-IN';
    else if (langCode === 'hi') tag = 'hi-IN';
    else if (langCode === 'en') tag = 'en-IN';
    else tag = 'en-IN';

    this.currentLanguage = tag;
    if (this.recognition) {
      this.recognition.lang = tag;
      if (this.isRecognitionActive) {
        try {
          this.recognition.stop();
          setTimeout(() => {
            this.startListening();
          }, 150);
        } catch {}
      }
    }
  }

  public setTTSEngine(engine: 'gemini' | 'browser') {
    this.ttsEngine = engine;
  }

  public setSpeechSpeed(speed: number) {
    this.speechSpeed = Math.min(1.5, Math.max(0.85, speed));
  }

  public startListening() {
    if (!this.recognition) return;
    if (this.isRecognitionActive) return;

    try {
      this.recognition.start();
      this.isRecognitionActive = true;
    } catch (e: any) {
      // Already running or starting
    }
  }

  public stopListening() {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
      this.isRecognitionActive = false;
    } catch {}
  }

  private startAudioAnalysisLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const freqData = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 128);
    const timeData = new Uint8Array(this.analyser ? this.analyser.fftSize : 256);

    const checkAudio = () => {
      if (!this.analyser) return;

      this.analyser.getByteFrequencyData(freqData);
      this.analyser.getByteTimeDomainData(timeData);

      // Calculate root mean square (RMS)
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const norm = (timeData[i] - 128) / 128;
        sum += norm * norm;
      }
      const rms = Math.sqrt(sum / timeData.length);

      if (this.onVolumeChange) {
        this.onVolumeChange(rms, freqData);
      }

      // Barge-in (interruption) detection:
      // If assistant is currently speaking and user speaks loudly for 2 consecutive frames
      if (this.isAssistantPlaying) {
        if (rms > this.vadThreshold) {
          this.consecutiveLoudFrames++;
          if (this.consecutiveLoudFrames >= 2) {
            this.triggerBargeIn();
            this.consecutiveLoudFrames = 0;
          }
        } else {
          this.consecutiveLoudFrames = Math.max(0, this.consecutiveLoudFrames - 1);
        }
      }

      this.animFrameId = requestAnimationFrame(checkAudio);
    };

    this.animFrameId = requestAnimationFrame(checkAudio);
  }

  public triggerBargeIn() {
    if (!this.isAssistantPlaying) return;
    this.stopPlayback();
    if (this.onBargeIn) {
      this.onBargeIn();
    }
  }

  // Queue sentence for streaming speech
  public queueSentence(sentence: string) {
    const clean = sentence.trim();
    if (!clean) return;
    this.sentenceQueue.push(clean);
    if (!this.isProcessingQueue) {
      this.processNextSentence();
    }
  }

  private async processNextSentence() {
    if (this.sentenceQueue.length === 0) {
      this.isProcessingQueue = false;
      this.isAssistantPlaying = false;
      if (this.onPlaybackStateChange) {
        this.onPlaybackStateChange(false);
      }
      return;
    }

    this.isProcessingQueue = true;
    this.isAssistantPlaying = true;
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(true);
    }

    const nextSentence = this.sentenceQueue.shift()!;
    try {
      await this.speakSentence(nextSentence);
    } catch (err) {
      console.warn('Speech playback error, falling back:', err);
    }

    // Process next sentence if not interrupted
    if (this.isAssistantPlaying) {
      this.processNextSentence();
    }
  }

  private async speakSentence(text: string): Promise<void> {
    if (!this.isAssistantPlaying) return;

    // First try Gemini Neural TTS if selected
    if (this.ttsEngine === 'gemini') {
      try {
        const ttsResult = await requestGeminiTTS(text, 'Kore');
        if (ttsResult && this.audioCtx && this.isAssistantPlaying) {
          await this.playAudioBuffer(ttsResult.audio, ttsResult.sampleRate);
          return;
        } else {
          // If Gemini TTS is unavailable or quota exceeded, switch to browser voice automatically
          this.ttsEngine = 'browser';
          this.onEngineFallback?.('browser');
        }
      } catch (err) {
        console.warn('Gemini TTS unavailable, using fast browser synthesis fallback', err);
        this.ttsEngine = 'browser';
        this.onEngineFallback?.('browser');
      }
    }

    // Fallback or selected Browser Speech Synthesis
    await this.speakWithBrowserSynthesis(text);
  }

  private playAudioBuffer(base64Audio: string, sampleRate: number = 24000): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioCtx || !this.isAssistantPlaying) {
        resolve();
        return;
      }

      try {
        const audioBuffer = pcmToAudioBuffer(this.audioCtx, base64Audio, sampleRate);
        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioCtx.destination);

        this.currentSourceNode = source;
        // Apply fast, lively human playback rate
        source.playbackRate.value = Math.min(1.35, Math.max(0.9, this.speechSpeed));

        source.onended = () => {
          this.currentSourceNode = null;
          resolve();
        };

        source.start(0);
      } catch (e) {
        console.error('Audio playback error', e);
        resolve();
      }
    });
  }

  private speakWithBrowserSynthesis(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !this.isAssistantPlaying) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.min(1.5, Math.max(0.9, this.speechSpeed)); // Fast, responsive human speaking cadence (1.2x)
      utterance.pitch = 1.08; // Sweet, warm feminine companion pitch for EVALYNTHIYA

      // Select female voice matching language
      const langInfo = detectLanguage(text);
      const voices = window.speechSynthesis.getVoices();

      let targetVoice = null;

      if (langInfo.code === 'bn') {
        targetVoice = voices.find(
          (v) =>
            (v.lang.startsWith('bn') || v.name.includes('Bangla') || v.name.includes('Bengali')) &&
            (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('lekha') || v.name.includes('Google বাংলা'))
        ) || voices.find((v) => v.lang.startsWith('bn'));
        utterance.lang = 'bn-IN';
      } else if (langInfo.code === 'hi') {
        targetVoice = voices.find(
          (v) =>
            (v.lang.startsWith('hi') || v.name.includes('Hindi')) &&
            (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('veena'))
        ) || voices.find((v) => v.lang.startsWith('hi'));
        utterance.lang = 'hi-IN';
      } else {
        // English
        targetVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.toLowerCase().includes('female') ||
              v.name.includes('Zira') ||
              v.name.includes('Samantha') ||
              v.name.includes('Google UK English Female') ||
              v.name.includes('India') ||
              v.name.includes('Natural'))
        );
        utterance.lang = 'en-IN';
      }

      if (targetVoice) {
        utterance.voice = targetVoice;
      }

      utterance.onend = () => {
        resolve();
      };

      utterance.onerror = (e) => {
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  public stopPlayback() {
    this.isAssistantPlaying = false;
    this.sentenceQueue = [];
    this.isProcessingQueue = false;

    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {}
      this.currentSourceNode = null;
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(false);
    }
  }

  public dispose() {
    this.stopPlayback();
    this.stopListening();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
