import React from 'react';
import { Sparkles, Settings2, MessageSquare, Volume2, Globe, Zap, Radio } from 'lucide-react';
import { AssistantState, LanguageCode } from '../types';

interface CompanionHeaderProps {
  state: AssistantState;
  selectedLanguage: LanguageCode;
  detectedLanguageLabel?: string;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onLanguageChange: (lang: LanguageCode) => void;
  isConfigured: boolean;
  isFastVoice?: boolean;
  currentEngine?: 'browser' | 'gemini' | 'live';
  onToggleFastVoice?: () => void;
}

export const CompanionHeader: React.FC<CompanionHeaderProps> = ({
  state,
  selectedLanguage,
  detectedLanguageLabel,
  onOpenSettings,
  onOpenHistory,
  onLanguageChange,
  isConfigured,
  isFastVoice = true,
  currentEngine = 'browser',
  onToggleFastVoice,
}) => {
  const getStatePill = () => {
    switch (state) {
      case 'listening':
        return {
          text: 'Listening...',
          color: 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300',
          dot: 'bg-cyan-400 animate-pulse',
        };
      case 'thinking':
        return {
          text: 'Thinking...',
          color: 'bg-purple-950/70 border-purple-500/40 text-purple-300',
          dot: 'bg-purple-400 animate-ping',
        };
      case 'speaking':
        return {
          text: 'Speaking (Interruptible)',
          color: 'bg-fuchsia-950/70 border-fuchsia-500/40 text-fuchsia-300',
          dot: 'bg-fuchsia-400 animate-pulse',
        };
      case 'idle':
      default:
        return {
          text: 'Ready to talk',
          color: 'bg-slate-900/60 border-violet-500/20 text-slate-300',
          dot: isConfigured ? 'bg-emerald-400' : 'bg-amber-400',
        };
    }
  };

  const pill = getStatePill();

  return (
    <header
      id="evalynthiya-header"
      className="w-full flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/5 backdrop-blur-md bg-black/20 z-30 select-none"
    >
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-semibold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-fuchsia-200 to-cyan-200">
              EVALYNTHIYA
            </h1>
            <span className="text-[10px] tracking-widest uppercase font-medium px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
              AI Companion
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Voice-First • English • বাংলা • हिन्दी
          </p>
        </div>
      </div>

      {/* State & Language Indicator */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Dynamic Status Pill */}
        <div
          id="status-pill"
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border shadow-inner ${pill.color} transition-all duration-300`}
        >
          <span className={`w-2 h-2 rounded-full ${pill.dot}`} />
          <span>{pill.text}</span>
        </div>

        {/* Engine Voice Mode Switcher */}
        {onToggleFastVoice && (
          <button
            id="toggle-fast-voice-header-btn"
            onClick={onToggleFastVoice}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              currentEngine === 'live'
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 shadow-sm shadow-emerald-500/20'
                : currentEngine === 'browser'
                ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200 shadow-sm shadow-cyan-500/20'
                : 'bg-purple-500/20 border-purple-400/40 text-purple-200 shadow-sm shadow-purple-500/20'
            }`}
            title={`Mode: ${
              currentEngine === 'live'
                ? 'Live Bidirectional Streaming (Gemini Live API)'
                : currentEngine === 'browser'
                ? 'Ultra-Fast Zero-Latency Voice (Fast talking)'
                : 'Studio Neural Voice (Gemini TTS)'
            }. Click to cycle.`}
          >
            {currentEngine === 'live' ? (
              <Radio className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-cyan-300 fill-cyan-300" />
            )}
            <span>
              {currentEngine === 'live'
                ? 'Live API'
                : currentEngine === 'browser'
                ? 'Fast Voice (1.2x)'
                : 'Studio Voice'}
            </span>
          </button>
        )}

        {/* Language quick switcher */}
        <div className="relative hidden md:flex items-center bg-white/5 border border-white/10 rounded-full p-0.5 text-xs text-slate-300">
          <Globe className="w-3.5 h-3.5 ml-2 mr-1 text-cyan-400" />
          <button
            id="lang-btn-auto"
            onClick={() => onLanguageChange('auto')}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              selectedLanguage === 'auto'
                ? 'bg-violet-600 text-white font-medium shadow-sm'
                : 'hover:text-white'
            }`}
          >
            Auto
          </button>
          <button
            id="lang-btn-bn"
            onClick={() => onLanguageChange('bn')}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              selectedLanguage === 'bn'
                ? 'bg-violet-600 text-white font-medium shadow-sm'
                : 'hover:text-white'
            }`}
          >
            বাংলা
          </button>
          <button
            id="lang-btn-hi"
            onClick={() => onLanguageChange('hi')}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              selectedLanguage === 'hi'
                ? 'bg-violet-600 text-white font-medium shadow-sm'
                : 'hover:text-white'
            }`}
          >
            हिन्दी
          </button>
          <button
            id="lang-btn-en"
            onClick={() => onLanguageChange('en')}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              selectedLanguage === 'en'
                ? 'bg-violet-600 text-white font-medium shadow-sm'
                : 'hover:text-white'
            }`}
          >
            EN
          </button>
        </div>

        {/* History drawer button */}
        <button
          id="open-history-btn"
          onClick={onOpenHistory}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
          title="Conversation History"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* Settings modal button */}
        <button
          id="open-settings-btn"
          onClick={onOpenSettings}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
          title="Voice & Language Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
