import { ChatMessage, GroundingSource } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

export interface HealthStatus {
  status: string;
  name: string;
  version: string;
  configured: boolean;
}

export async function checkServerHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${API_URL}/api/health`)
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return {
      status: 'error',
      name: 'EVALYNTHIYA',
      version: '1.2.0',
      configured: false,
    };
  }
}

export async function streamChatResponse({
  messages,
  languageHint,
  useSearchGrounding = false,
  onChunk,
  onGroundingSources,
  onComplete,
  onError,
  signal,
}: {
  messages: ChatMessage[];
  languageHint?: string;
  useSearchGrounding?: boolean;
  onChunk: (chunk: string) => void;
  onGroundingSources?: (sources: GroundingSource[]) => void;
  onComplete: (fullText: string, sources?: GroundingSource[]) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        languageHint,
        useSearchGrounding,
      }),
      signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to read response stream.');
    }

    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let buffer = '';
    let accumulatedSources: GroundingSource[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.error) {
              onError(data.error);
              return;
            }
            if (data.groundingSources && Array.isArray(data.groundingSources)) {
              accumulatedSources = data.groundingSources;
              onGroundingSources?.(data.groundingSources);
            }
            if (data.text) {
              accumulatedText += data.text;
              onChunk(data.text);
            }
            if (data.done) {
              onComplete(accumulatedText, accumulatedSources.length > 0 ? accumulatedSources : undefined);
              return;
            }
          } catch {
            // Non-JSON SSE line or keepalive
          }
        }
      }
    }

    onComplete(accumulatedText, accumulatedSources.length > 0 ? accumulatedSources : undefined);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return; // Request was aborted by user interruption
    }
    onError(err?.message || 'Connection lost during conversation.');
  }
}

export async function requestGeminiTTS(
  text: string,
  voice: string = 'Kore'
): Promise<{ audio: string; sampleRate: number } | null> {
  try {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.audio) {
      return { audio: data.audio, sampleRate: data.sampleRate || 24000 };
    }
    return null;
  } catch {
    return null;
  }
}

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await fetch(`${API_URL}/api/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioData: base64Data,
            mimeType: blob.type || 'audio/webm',
          }),
        });
        const data = await res.json();
        if (data.transcript) {
          resolve(data.transcript);
        } else {
          reject(new Error(data.error || 'Failed to transcribe audio'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
