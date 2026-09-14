import React from 'react';
import { X, Mic, Volume2, Globe, Sliders, CheckCircle2, AlertCircle, Zap, Radio, Search } from 'lucide-react';
import { LanguageCode, VoiceSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onUpdateSettings: (newSettings: Partial<VoiceSettings>) => void;
  selectedLanguage: LanguageCode;
  onSelectLanguage: (lang: LanguageCode) => void;
  isConfigured: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  selectedLanguage,
  onSelectLanguage,
  isConfigured,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div
        id="settings-modal-panel"
        className="w-full max-w-lg bg-slate-950 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Voice & Conversation Settings</h2>
              <p className="text-xs text-slate-400">Customize EVALYNTHIYA's conversational speed & voice core</p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Language Preference */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            Conversation Language
          </label>
          <p className="text-xs text-slate-400">
            EVALYNTHIYA automatically detects English, Bengali, Hindi, and code-switching.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              { id: 'auto', name: 'Auto-Detect', sub: 'Seamless multilingual' },
              { id: 'bn', name: 'Bengali (বাংলা)', sub: 'Kolkata conversational' },
              { id: 'hi', name: 'Hindi (हिन्दी)', sub: 'Sweet & respectful' },
              { id: 'en', name: 'English', sub: 'Gentle conversational' },
            ].map((lang) => (
              <button
                key={lang.id}
                id={`lang-option-${lang.id}`}
                onClick={() => onSelectLanguage(lang.id as LanguageCode)}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                  selectedLanguage === lang.id
                    ? 'bg-violet-600/20 border-violet-500 text-white shadow-sm'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-medium">{lang.name}</span>
                <span className="text-[10px] text-slate-400">{lang.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Voice Generation Engine */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Volume2 className="w-3.5 h-3.5 text-fuchsia-400" />
            Voice Architecture
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              id="voice-engine-browser"
              onClick={() => onUpdateSettings({ ttsEngine: 'browser' })}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                settings.ttsEngine === 'browser'
                  ? 'bg-cyan-600/20 border-cyan-500 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-cyan-300">⚡ Fast Voice</span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/30 text-cyan-200 font-semibold">
                    Fastest
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ultra-rapid device synthesis with zero network latency.
                </p>
              </div>
            </button>

            <button
              id="voice-engine-live"
              onClick={() => onUpdateSettings({ ttsEngine: 'live' })}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                settings.ttsEngine === 'live'
                  ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-300">🎙️ Live API</span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-semibold">
                    Real-time
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Bidirectional live streaming via Gemini 3.1 Flash Live.
                </p>
              </div>
            </button>

            <button
              id="voice-engine-gemini"
              onClick={() => onUpdateSettings({ ttsEngine: 'gemini' })}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                settings.ttsEngine === 'gemini'
                  ? 'bg-fuchsia-600/20 border-fuchsia-500 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-fuchsia-300">🌸 Studio Voice</span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-fuchsia-500/30 text-fuchsia-200">
                    Neural
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Warm, expressive neural voice "Kore" generated by Gemini TTS.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 3. Speaking Speed & Tone */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-300">
            <span className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Speaking Speed (Human Cadence)
            </span>
            <span className="font-mono text-amber-400 font-bold">{settings.rate}x</span>
          </div>
          <p className="text-xs text-slate-400">
            Controls how fast and briskly EVALYNTHIYA speaks. Higher speeds sound snappy and natural.
          </p>
          <input
            type="range"
            min="1.0"
            max="1.45"
            step="0.05"
            value={settings.rate}
            onChange={(e) => onUpdateSettings({ rate: Number(e.target.value) })}
            className="w-full accent-amber-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>1.0x (Standard)</span>
            <span className="text-amber-400 font-semibold">1.2x (Natural Human Fast)</span>
            <span>1.45x (Ultra Fast)</span>
          </div>
        </div>

        {/* 4. Google Search Grounding */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div className="space-y-0.5 pr-3">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-white">Google Search Grounding</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                Gemini 3.5 Flash
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Ground answers with real-time web facts, news, and citation links.
            </p>
          </div>
          <button
            id="toggle-grounding-btn"
            onClick={() => onUpdateSettings({ searchGrounding: !settings.searchGrounding })}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors flex-shrink-0 ${
              settings.searchGrounding ? 'bg-emerald-500 justify-end' : 'bg-white/20 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-md" />
          </button>
        </div>

        {/* 5. Turn-Taking & Interruption */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-200">Continuous Conversation Mode</span>
              <p className="text-[11px] text-slate-400">
                Automatically listen for your voice after EVALYNTHIYA finishes speaking.
              </p>
            </div>
            <button
              id="toggle-hands-free-btn"
              onClick={() => onUpdateSettings({ autoListen: !settings.autoListen })}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                settings.autoListen ? 'bg-cyan-500 justify-end' : 'bg-white/20 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-md" />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Turn-Taking Silence Window (Response Latency)</span>
              <span className="font-mono text-cyan-400">{settings.silenceThresholdMs}ms</span>
            </div>
            <input
              type="range"
              min="400"
              max="1200"
              step="50"
              value={settings.silenceThresholdMs}
              onChange={(e) =>
                onUpdateSettings({ silenceThresholdMs: Number(e.target.value) })
              }
              className="w-full accent-cyan-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Fastest (400ms)</span>
              <span>Balanced (600ms)</span>
              <span>Patient (1200ms)</span>
            </div>
          </div>
        </div>

        {/* 6. Service Status */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isConfigured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <div>
              <span className="text-xs font-medium text-white">Backend Voice Core</span>
              <p className="text-[11px] text-slate-400">
                {isConfigured ? 'Connected & Ready' : 'API Key check pending'}
              </p>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">
            Low Latency & Live Audio
          </span>
        </div>

        {/* Close button */}
        <button
          id="save-settings-btn"
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-lg shadow-violet-600/20"
        >
          Done
        </button>
      </div>
    </div>
  );
};
