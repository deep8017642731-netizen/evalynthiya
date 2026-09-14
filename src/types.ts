export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type LanguageCode = 'auto' | 'en' | 'bn' | 'hi';

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  language?: string;
  interrupted?: boolean;
  groundingSources?: GroundingSource[];
}

export interface VoiceSettings {
  ttsEngine: 'live' | 'browser' | 'gemini';
  geminiVoice: 'Kore' | 'Zephyr' | 'Puck';
  rate: number; // 1.0 to 1.5
  pitch: number;
  autoListen: boolean; // Continuous conversation loop
  vadSensitivity: number; // 0 to 1
  silenceThresholdMs: number; // ms to wait before sending voice
  searchGrounding: boolean; // Use Google Search Grounding for accurate real-time knowledge
}

export interface AudioVisualizerData {
  volume: number; // 0 to 1 normalized
  isSpeaking: boolean;
  frequencies: Uint8Array;
}
