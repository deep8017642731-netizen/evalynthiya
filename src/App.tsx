import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AssistantState, ChatMessage, LanguageCode, VoiceSettings, GroundingSource } from './types';
import { CosmicOrb } from './components/CosmicOrb';
import { EvalynthiyaAvatar } from './components/EvalynthiyaAvatar';
import { CompanionHeader } from './components/CompanionHeader';
import { TranscriptView } from './components/TranscriptView';
import { VoiceControls } from './components/VoiceControls';
import { ConversationDrawer } from './components/ConversationDrawer';
import { SettingsModal } from './components/SettingsModal';
import { VoicePipeline } from './services/audioPipeline';
import { LiveVoiceSession } from './services/liveVoiceService';
import { streamChatResponse, checkServerHealth, HealthStatus } from './services/geminiService';
import { detectLanguage } from './utils/languageDetector';
import { AlertCircle, Mic, Image as ImageIcon, Sparkles } from 'lucide-react';

const DEFAULT_SETTINGS: VoiceSettings = {
  ttsEngine: 'browser', // Ultra-fast zero-latency browser voice by default (instant 1-click switch to Live API or Studio Voice)
  geminiVoice: 'Kore',
  rate: 1.2, // Fast, natural human talking cadence
  pitch: 1.08,
  autoListen: true, // Hands-free continuous conversation default
  vadSensitivity: 0.05,
  silenceThresholdMs: 550, // Rapid turn-taking (550ms)
  searchGrounding: false, // Default false to avoid 429 quota exhaustion and preserve instant voice response
};

export default function App() {
  const [state, setState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('evalynthiya_conversation');
    return saved ? JSON.parse(saved) : [];
  });
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('auto');
  const [volume, setVolume] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    try {
      const saved = localStorage.getItem('evalynthiya_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          ttsEngine: parsed.ttsEngine === 'live' ? 'live' : 'browser',
          searchGrounding: parsed.searchGrounding === true,
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const [avatarMode, setAvatarMode] = useState<'portrait' | 'orb'>('portrait');
  const [serverHealth, setServerHealth] = useState<HealthStatus | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // References
  const pipelineRef = useRef<VoicePipeline | null>(null);
  const liveSessionRef = useRef<LiveVoiceSession | null>(null);
  const currentAbortController = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const lastInterimSpeechRef = useRef<string>('');
  const stateRef = useRef<AssistantState>(state);
  const settingsRef = useRef<VoiceSettings>(settings);
  const isMutedRef = useRef<boolean>(isMuted);

  stateRef.current = state;
  settingsRef.current = settings;
  isMutedRef.current = isMuted;

  // Save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('evalynthiya_conversation', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Save settings and sync with pipeline/live session
  useEffect(() => {
    try {
      localStorage.setItem('evalynthiya_settings', JSON.stringify(settings));
    } catch {}

    if (pipelineRef.current) {
      pipelineRef.current.setTTSEngine(settings.ttsEngine === 'gemini' ? 'gemini' : 'browser');
      pipelineRef.current.setSpeechSpeed(settings.rate);
    }
    if (liveSessionRef.current) {
      liveSessionRef.current.setPlaybackRate(settings.rate);
      if (settings.ttsEngine !== 'live') {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
    }
  }, [settings]);

  // Check health on mount
  useEffect(() => {
    checkServerHealth().then(setServerHealth);
  }, []);

  // Initialize pipeline on mount
  useEffect(() => {
    const pipeline = new VoicePipeline();
    pipelineRef.current = pipeline;
    pipeline.setTTSEngine(settings.ttsEngine === 'gemini' ? 'gemini' : 'browser');
    pipeline.setSpeechSpeed(settings.rate);
    pipeline.setEngineFallbackCallback((fallbackEngine) => {
      setSettings((prev) => ({ ...prev, ttsEngine: fallbackEngine }));
    });

    return () => {
      pipeline.dispose();
      pipelineRef.current = null;
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
    };
  }, []);

  // Sync selected language with pipeline
  useEffect(() => {
    if (pipelineRef.current) {
      pipelineRef.current.setLanguage(selectedLanguage);
    }
  }, [selectedLanguage]);

  // Handle interruption / barge-in
  const handleInterrupt = useCallback(() => {
    if (currentAbortController.current) {
      currentAbortController.current.abort();
      currentAbortController.current = null;
    }

    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }

    if (pipelineRef.current) {
      pipelineRef.current.stopPlayback();
    }

    setStreamingText('');
    setInterimSpeech('');
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Immediately enter listening state
    setState('listening');
    if (pipelineRef.current && settingsRef.current.ttsEngine !== 'live') {
      pipelineRef.current.startListening();
    }
  }, []);

  // Process user speech turn
  const handleProcessSpeech = useCallback(
    async (userText: string) => {
      const cleanText = userText.trim();
      if (!cleanText) return;

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      setInterimSpeech('');
      lastInterimSpeechRef.current = '';

      // Stop speech recognition while processing and speaking to avoid self-echo
      if (pipelineRef.current) {
        pipelineRef.current.stopListening();
      }

      setState('thinking');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: cleanText,
        timestamp: Date.now(),
        language: detectLanguage(cleanText).code,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      if (currentAbortController.current) {
        currentAbortController.current.abort();
      }
      const abortController = new AbortController();
      currentAbortController.current = abortController;

      let accumulatedResponse = '';
      let sentenceBuffer = '';
      setStreamingText('');

      // Fast clause-aware chunking: triggers speech on sentence ends or early comma pauses
      const sentenceDelimiters = /(?:[.!?।\n]|(?<=.{26,})[,;])/;
      let collectedSources: GroundingSource[] | undefined = undefined;

      await streamChatResponse({
        messages: updatedMessages,
        languageHint: selectedLanguage,
        useSearchGrounding: Boolean(settingsRef.current.searchGrounding),
        signal: abortController.signal,
        onChunk: (chunk: string) => {
          accumulatedResponse += chunk;
          sentenceBuffer += chunk;
          setStreamingText(accumulatedResponse);

          // Sentence streaming for low-latency voice
          const match = sentenceBuffer.match(sentenceDelimiters);
          if (match && match.index !== undefined) {
            const cutIndex = match.index + 1;
            const completeSentence = sentenceBuffer.slice(0, cutIndex).trim();
            sentenceBuffer = sentenceBuffer.slice(cutIndex);

            if (completeSentence && !isMutedRef.current && pipelineRef.current) {
              pipelineRef.current.queueSentence(completeSentence);
            }
          }
        },
        onGroundingSources: (sources) => {
          collectedSources = sources;
        },
        onComplete: (fullText: string, sources?: GroundingSource[]) => {
          // Flush any remaining partial sentence
          const remaining = sentenceBuffer.trim();
          if (remaining && !isMutedRef.current && pipelineRef.current) {
            pipelineRef.current.queueSentence(remaining);
          }

          const finalSources = sources || collectedSources;
          const assistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: fullText || accumulatedResponse,
            timestamp: Date.now(),
            language: detectLanguage(fullText || accumulatedResponse).code,
            groundingSources: finalSources && finalSources.length > 0 ? finalSources : undefined,
          };

          setMessages((prev) => [...prev, assistantMsg]);

          // If muted or empty, resolve state
          if (isMutedRef.current || !fullText.trim()) {
            setState('idle');
            if (settingsRef.current.autoListen) {
              setTimeout(() => {
                handleStartListening();
              }, 400);
            }
          }
        },
        onError: (err: string) => {
          console.warn('Chat error recovered:', err);
          const friendlyFallback = "I'm right here with you! The cloud neural connection had a brief moment of high demand, but I'm listening. What's on your mind?";
          setStreamingText('');
          setState('speaking');
          if (pipelineRef.current && !isMutedRef.current) {
            pipelineRef.current.queueSentence(friendlyFallback);
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-fallback-${Date.now()}`,
              role: 'assistant',
              content: friendlyFallback,
              timestamp: Date.now(),
              language: 'en',
            },
          ]);
        },
      });
    },
    [messages, selectedLanguage]
  );

  // Activate microphone and start listening (supports Live API WebSocket or VoicePipeline)
  const handleStartListening = useCallback(async () => {
    setMicError(null);

    // 1. Live API Bidirectional Mode
    if (settingsRef.current.ttsEngine === 'live') {
      if (pipelineRef.current) {
        pipelineRef.current.stopListening();
        pipelineRef.current.stopPlayback();
      }

      if (!liveSessionRef.current) {
        liveSessionRef.current = new LiveVoiceSession({
          onStateChange: (newState) => {
            setState(newState);
          },
          onVolume: (vol) => {
            setVolume(vol);
          },
          onTranscript: (txt, role, isFinal) => {
            if (role === 'assistant') {
              setStreamingText(txt);
              if (isFinal) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `live-assistant-${Date.now()}`,
                    role: 'assistant',
                    content: txt,
                    timestamp: Date.now(),
                    language: detectLanguage(txt).code,
                  },
                ]);
                setStreamingText('');
              }
            } else {
              setInterimSpeech(txt);
              if (isFinal) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `live-user-${Date.now()}`,
                    role: 'user',
                    content: txt,
                    timestamp: Date.now(),
                    language: detectLanguage(txt).code,
                  },
                ]);
                setInterimSpeech('');
              }
            }
          },
          onError: (err) => {
            console.warn('Live session error:', err);
            setMicError(`Live API: ${err}. Falling back to Fast Voice.`);
            setSettings((prev) => ({ ...prev, ttsEngine: 'browser' }));
          },
        });
      }

      liveSessionRef.current.setPlaybackRate(settingsRef.current.rate);
      const ok = await liveSessionRef.current.start();
      if (!ok) {
        setMicError('Failed to start Live audio stream. Switching to Fast Voice.');
        setSettings((prev) => ({ ...prev, ttsEngine: 'browser' }));
      }
      return;
    }

    // 2. Standard VoicePipeline Mode (Fast Voice / Studio Voice)
    if (!pipelineRef.current) return;

    const success = await pipelineRef.current.startMicrophone({
      onVolume: (vol) => {
        setVolume(vol);
      },
      onSpeech: (transcript, isFinal) => {
        setInterimSpeech(transcript);
        lastInterimSpeechRef.current = transcript;

        // Reset silence timer on every speech event
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        if (isFinal) {
          handleProcessSpeech(transcript);
        } else {
          // VAD silence detection: trigger turn when user stops talking
          silenceTimerRef.current = setTimeout(() => {
            if (lastInterimSpeechRef.current.trim() && stateRef.current === 'listening') {
              handleProcessSpeech(lastInterimSpeechRef.current);
            }
          }, settingsRef.current.silenceThresholdMs);
        }
      },
      onInterruption: () => {
        handleInterrupt();
      },
      onPlaybackChange: (isPlaying) => {
        if (isPlaying) {
          setState('speaking');
        } else {
          // Playback finished
          if (stateRef.current === 'speaking') {
            if (settingsRef.current.autoListen) {
              // Smooth hands-free conversation turnaround
              setTimeout(() => {
                handleStartListening();
              }, 300);
            } else {
              setState('idle');
            }
          }
        }
      },
    });

    if (success) {
      setState('listening');
    } else {
      setMicError('Microphone access is unavailable or denied. Please check permissions.');
    }
  }, [handleInterrupt, handleProcessSpeech]);

  // Toggle mic action from UI
  const handleToggleMic = () => {
    if (state === 'listening') {
      if (settings.ttsEngine === 'live') {
        if (liveSessionRef.current) {
          liveSessionRef.current.stop();
          liveSessionRef.current = null;
        }
        setState('idle');
      } else if (interimSpeech.trim()) {
        handleProcessSpeech(interimSpeech);
      } else {
        if (pipelineRef.current) {
          pipelineRef.current.stopListening();
        }
        setState('idle');
      }
    } else if (state === 'speaking') {
      handleInterrupt();
    } else {
      handleStartListening();
    }
  };

  // Replay message
  const handleReplay = (text: string) => {
    if (!pipelineRef.current) return;
    setIsHistoryOpen(false);
    setState('speaking');
    pipelineRef.current.stopPlayback();
    pipelineRef.current.queueSentence(text);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between bg-[#08070e] text-slate-100 selection:bg-violet-500 selection:text-white overflow-hidden">
      {/* Background Cosmic Atmosphere */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Deep violet celestial glow */}
        <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-violet-900/25 via-purple-950/15 to-transparent rounded-full blur-[120px]" />
        {/* Electric cyan ambient accent */}
        <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[450px] bg-gradient-to-t from-cyan-950/20 via-slate-950/30 to-transparent rounded-full blur-[130px]" />
        {/* Subtle starlight grain */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      {/* Header */}
      <CompanionHeader
        state={state}
        selectedLanguage={selectedLanguage}
        onLanguageChange={setSelectedLanguage}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isConfigured={serverHealth?.configured ?? true}
        isFastVoice={settings.ttsEngine === 'browser'}
        currentEngine={settings.ttsEngine}
        onToggleFastVoice={() => {
          const nextEngine =
            settings.ttsEngine === 'browser'
              ? 'live'
              : settings.ttsEngine === 'live'
              ? 'gemini'
              : 'browser';
          setSettings((prev) => ({ ...prev, ttsEngine: nextEngine }));
        }}
      />

      {/* Center Stage: EVALYNTHIYA Character Avatar & Live Subtitle View */}
      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 py-4 z-10 gap-4 sm:gap-6">
        {/* Microphone Error Alert if needed */}
        {micError && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs shadow-lg animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>{micError}</span>
            <button
              onClick={handleStartListening}
              className="underline ml-2 hover:text-white font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* The Central Character Avatar Interface */}
        <div className="flex flex-col items-center justify-center">
          {avatarMode === 'portrait' ? (
            <EvalynthiyaAvatar
              state={state}
              volume={volume}
              onClick={handleToggleMic}
              fastMode={settings.ttsEngine === 'browser'}
            />
          ) : (
            <CosmicOrb
              state={state}
              volume={volume}
              onClick={handleToggleMic}
            />
          )}

          {/* Subtle Visual Style Switcher Pill */}
          <div className="flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-400">
            <button
              id="switch-to-portrait-btn"
              onClick={() => setAvatarMode('portrait')}
              className={`px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                avatarMode === 'portrait'
                  ? 'bg-violet-600 text-white font-medium shadow-sm'
                  : 'hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Portrait</span>
            </button>
            <button
              id="switch-to-orb-btn"
              onClick={() => setAvatarMode('orb')}
              className={`px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                avatarMode === 'orb'
                  ? 'bg-violet-600 text-white font-medium shadow-sm'
                  : 'hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Cosmic Orb</span>
            </button>
          </div>
        </div>

        {/* Live Conversation Transcript & Suggestions */}
        <TranscriptView
          state={state}
          interimUserSpeech={interimSpeech}
          streamingAssistantText={streamingText}
          lastMessages={messages}
          onSelectPrompt={(prompt) => {
            handleProcessSpeech(prompt);
          }}
        />
      </main>

      {/* Bottom Voice Controls */}
      <footer className="w-full pb-8 pt-2 flex justify-center z-20">
        <VoiceControls
          state={state}
          onToggleMic={handleToggleMic}
          onInterrupt={handleInterrupt}
          onSendText={handleProcessSpeech}
          continuousMode={settings.autoListen}
          onToggleContinuous={() =>
            setSettings((prev) => ({ ...prev, autoListen: !prev.autoListen }))
          }
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
        />
      </footer>

      {/* Drawers & Modals */}
      <ConversationDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        messages={messages}
        onClearHistory={() => setMessages([])}
        onReplayAudio={handleReplay}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={setSelectedLanguage}
        isConfigured={serverHealth?.configured ?? true}
      />
    </div>
  );
}
