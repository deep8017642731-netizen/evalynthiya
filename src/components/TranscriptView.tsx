import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, ExternalLink, Sparkles } from 'lucide-react';
import { AssistantState, ChatMessage } from '../types';
import { detectLanguage } from '../utils/languageDetector';

interface TranscriptViewProps {
  state: AssistantState;
  interimUserSpeech: string;
  streamingAssistantText: string;
  lastMessages: ChatMessage[];
  onSelectPrompt: (promptText: string) => void;
}

const SAMPLE_STARTERS = [
  {
    lang: 'বাংলা',
    text: 'কেমন আছো ইভ্যালিন্থিয়া? আজ তোমার সাথে কথা বলতে এলাম।',
    sub: 'Bengali Kolkata Greeting',
  },
  {
    lang: 'English',
    text: 'Hello Evalynthiya, how are you feeling today?',
    sub: 'English Conversation',
  },
  {
    lang: 'हिन्दी',
    text: 'नमस्ते इवैलिनथिया, आज का दिन कैसा है?',
    sub: 'Hindi Warm Greeting',
  },
  {
    lang: 'Mixed (Benglish)',
    text: 'Hey Evalynthiya, ajker weather kemon bolo to?',
    sub: 'Natural Code-switching',
  },
];

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  state,
  interimUserSpeech,
  streamingAssistantText,
  lastMessages,
  onSelectPrompt,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get the most recent conversation pair to display in focus
  const recentAssistantMsg = lastMessages
    .filter((m) => m.role === 'assistant')
    .slice(-1)[0];
  const recentUserMsg = lastMessages
    .filter((m) => m.role === 'user')
    .slice(-1)[0];

  const currentAssistantSpeech =
    streamingAssistantText || (state === 'speaking' ? recentAssistantMsg?.content : '');

  const activeLang = detectLanguage(
    currentAssistantSpeech || interimUserSpeech || recentAssistantMsg?.content || ''
  );

  return (
    <div
      id="transcript-view-container"
      className="w-full max-w-2xl px-4 flex flex-col items-center justify-center min-h-[160px] text-center"
    >
      <AnimatePresence mode="wait">
        {/* State 1: User is speaking in real-time */}
        {state === 'listening' && (
          <motion.div
            key="user-speaking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-2 max-w-xl"
          >
            <span className="text-[11px] uppercase tracking-widest text-cyan-400 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              You are speaking ({interimUserSpeech ? activeLang.nativeName : 'Listening...'})
            </span>
            <p className="text-lg sm:text-xl font-medium text-cyan-100 leading-relaxed break-words font-sans">
              {interimUserSpeech ? `"${interimUserSpeech}"` : 'EVALYNTHIYA is listening to your voice...'}
            </p>
          </motion.div>
        )}

        {/* State 2: EVALYNTHIYA is thinking */}
        {state === 'thinking' && (
          <motion.div
            key="assistant-thinking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-2 max-w-xl"
          >
            {recentUserMsg && (
              <p className="text-xs text-slate-400 italic mb-1">
                You: "{recentUserMsg.content}"
              </p>
            )}
            <span className="text-[11px] uppercase tracking-widest text-purple-400 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              EVALYNTHIYA is reflecting...
            </span>
            <p className="text-sm text-slate-300 animate-pulse">
              Crafting a heartfelt response in {activeLang.nativeName}...
            </p>
          </motion.div>
        )}

        {/* State 3: EVALYNTHIYA is speaking or has spoken */}
        {(state === 'speaking' || (state === 'idle' && currentAssistantSpeech)) && (
          <motion.div
            key="assistant-speaking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-2 max-w-xl w-full"
          >
            {recentUserMsg && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 border border-white/5 text-xs text-slate-400 max-w-md truncate">
                <span className="text-cyan-400 font-medium">You:</span>
                <span className="truncate">"{recentUserMsg.content}"</span>
              </div>
            )}
            <div className="w-full bg-slate-900/80 border border-violet-500/20 backdrop-blur-xl rounded-2xl p-3.5 sm:p-4 shadow-xl shadow-black/40">
              <div className="flex items-center justify-between gap-2 mb-1.5 border-b border-white/5 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
                  <span className="text-[11px] uppercase tracking-widest text-fuchsia-300 font-semibold">
                    EVALYNTHIYA
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/20 text-fuchsia-300">
                  {activeLang.nativeName}
                </span>
              </div>
              <p className="text-base sm:text-lg font-medium text-slate-100 leading-relaxed break-words text-left sm:text-center">
                {currentAssistantSpeech}
              </p>

              {recentAssistantMsg?.groundingSources && recentAssistantMsg.groundingSources.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-white/10 text-left">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 mb-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Google Search Grounding Sources</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentAssistantMsg.groundingSources.slice(0, 3).map((source, sIdx) => (
                      <a
                        key={sIdx}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/20 hover:border-emerald-400/40 text-[11px] text-emerald-200 transition-colors truncate max-w-xs"
                      >
                        <span className="truncate">{source.title || new URL(source.uri).hostname}</span>
                        <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* State 4: Idle with no prior conversation: show welcoming prompt chips */}
        {state === 'idle' && !currentAssistantSpeech && (
          <motion.div
            key="idle-starters"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 max-w-xl"
          >
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-medium text-slate-200">
                Talk with EVALYNTHIYA
              </h2>
              <p className="text-xs text-slate-400">
                Speak naturally in English, Bengali (বাংলা), or Hindi (हिन्दी) — with seamless interruption support.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
              {SAMPLE_STARTERS.map((s, idx) => (
                <button
                  key={idx}
                  id={`starter-chip-${idx}`}
                  onClick={() => onSelectPrompt(s.text)}
                  className="flex flex-col items-start p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all hover:border-violet-500/40 hover:scale-[1.01] group"
                >
                  <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider group-hover:text-cyan-300 transition-colors">
                    {s.lang} • {s.sub}
                  </span>
                  <span className="text-xs text-slate-300 font-normal mt-0.5 line-clamp-1">
                    "{s.text}"
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
