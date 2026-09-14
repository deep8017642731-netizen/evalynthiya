import React, { useState } from 'react';
import { Mic, MicOff, Square, Send, Keyboard, RefreshCw, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { AssistantState } from '../types';

interface VoiceControlsProps {
  state: AssistantState;
  onToggleMic: () => void;
  onInterrupt: () => void;
  onSendText: (text: string) => void;
  continuousMode: boolean;
  onToggleContinuous: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  onToggleMic,
  onInterrupt,
  onSendText,
  continuousMode,
  onToggleContinuous,
  isMuted,
  onToggleMute,
}) => {
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || state === 'thinking') return;
    onSendText(typedMessage.trim());
    setTypedMessage('');
    setShowTextInput(false);
  };

  return (
    <div
      id="voice-controls-panel"
      className="w-full max-w-lg flex flex-col items-center gap-3 px-4 z-20"
    >
      {/* Optional typed input expansion */}
      {showTextInput && (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          onSubmit={handleSubmit}
          className="w-full flex items-center gap-2 bg-slate-900/90 border border-white/15 rounded-2xl p-2 backdrop-blur-xl shadow-2xl"
        >
          <input
            id="user-text-input"
            type="text"
            value={typedMessage}
            onChange={(e) => setTypedMessage(e.target.value)}
            placeholder="Type in English, বাংলা, or हिन्दी..."
            disabled={state === 'thinking'}
            className="flex-1 bg-transparent px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none"
            autoFocus
          />
          <button
            id="send-text-btn"
            type="submit"
            disabled={!typedMessage.trim() || state === 'thinking'}
            className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </motion.form>
      )}

      {/* Main Action Bar */}
      <div className="flex items-center gap-4 sm:gap-6 bg-black/40 backdrop-blur-xl border border-white/10 px-5 py-2.5 rounded-full shadow-2xl">
        {/* Toggle Text Input */}
        <button
          id="toggle-keyboard-btn"
          onClick={() => setShowTextInput(!showTextInput)}
          className={`p-2.5 rounded-full transition-colors ${
            showTextInput
              ? 'bg-violet-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
          title={showTextInput ? 'Close text input' : 'Type a message'}
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Primary Interactive Voice Button */}
        {state === 'speaking' ? (
          // When speaking: user can tap to instantly interrupt/barge-in
          <button
            id="interrupt-speech-btn"
            onClick={onInterrupt}
            className="relative flex items-center justify-center w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all transform hover:scale-105"
            title="Interrupt EVALYNTHIYA & listen"
          >
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-rose-400/40"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            />
            <Square className="w-5 h-5 fill-current" />
          </button>
        ) : state === 'listening' ? (
          // When listening: active pulsing cyan button
          <button
            id="active-listening-btn"
            onClick={onToggleMic}
            className="relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 to-violet-600 text-white shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
            title="Listening... Tap to finish"
          >
            <motion.div
              className="absolute -inset-1 rounded-full border border-cyan-400/50"
              animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <Mic className="w-6 h-6 text-white animate-pulse" />
          </button>
        ) : state === 'thinking' ? (
          // When thinking: spinning amethyst orb
          <div
            id="thinking-state-indicator"
            className="flex items-center justify-center w-14 h-14 rounded-full bg-purple-900/60 border border-purple-500/40 text-purple-300"
            title="EVALYNTHIYA is thinking..."
          >
            <RefreshCw className="w-6 h-6 animate-spin text-purple-300" />
          </div>
        ) : (
          // Idle state: tap to talk
          <button
            id="start-talking-btn"
            onClick={onToggleMic}
            className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-600/30 transition-all transform hover:scale-105"
            title="Start talking with EVALYNTHIYA"
          >
            <Mic className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          </button>
        )}

        {/* Hands-free continuous loop toggle */}
        <button
          id="continuous-mode-toggle"
          onClick={onToggleContinuous}
          className={`p-2.5 rounded-full transition-colors ${
            continuousMode
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
          title={
            continuousMode
              ? 'Hands-free Conversation: Active (Auto-listens after response)'
              : 'Turn on Hands-free Conversation'
          }
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Mute Voice Audio toggle */}
        <button
          id="mute-audio-btn"
          onClick={onToggleMute}
          className={`p-2.5 rounded-full transition-colors ${
            isMuted
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
          title={isMuted ? 'Unmute voice' : 'Mute voice audio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-400 select-none">
        <span>{continuousMode ? 'Hands-Free Loop On' : 'Push-to-Talk'}</span>
        <span>•</span>
        <span>Barge-in Supported</span>
      </div>
    </div>
  );
};
