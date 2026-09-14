import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AssistantState } from '../types';
import { Mic, Volume2, Sparkles, Brain, Radio } from 'lucide-react';

interface EvalynthiyaAvatarProps {
  state: AssistantState;
  volume: number; // 0 to 1 normalized
  onClick?: () => void;
  fastMode?: boolean;
}

export const EvalynthiyaAvatar: React.FC<EvalynthiyaAvatarProps> = ({
  state,
  volume,
  onClick,
  fastMode = true,
}) => {
  // Reactive audio scale (expands with speech/mic volume)
  const reactiveScale = 1 + Math.min(volume * 0.4, 0.15);

  return (
    <div
      id="evalynthiya-character-stage"
      onClick={onClick}
      className="relative flex flex-col items-center justify-center cursor-pointer select-none group"
      title="EVALYNTHIYA - Tap to talk or interrupt"
    >
      {/* Outer ambient cosmic glow that reacts to states */}
      <motion.div
        className="absolute -inset-6 sm:-inset-10 rounded-full blur-3xl pointer-events-none transition-all duration-700 opacity-60"
        style={{
          background:
            state === 'listening'
              ? 'radial-gradient(circle, rgba(34,211,238,0.45) 0%, rgba(139,92,246,0.3) 50%, transparent 75%)'
              : state === 'thinking'
              ? 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, rgba(99,102,241,0.3) 50%, transparent 75%)'
              : state === 'speaking'
              ? 'radial-gradient(circle, rgba(232,121,249,0.55) 0%, rgba(56,189,248,0.3) 55%, transparent 75%)'
              : 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(76,29,149,0.2) 60%, transparent 80%)',
        }}
        animate={{
          scale: state === 'speaking' || state === 'listening' ? reactiveScale : [0.96, 1.04, 0.96],
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'thinking' ? 2 : 4,
          ease: 'easeInOut',
        }}
      />

      {/* Outer Celestial Orbital Ring - matches the artwork's celestial rings */}
      <motion.div
        className="absolute w-[330px] h-[330px] sm:w-[410px] sm:h-[410px] -top-6 rounded-full border border-violet-400/20 pointer-events-none"
        animate={{
          rotate: 360,
          scale: state === 'speaking' ? [1, 1.03, 1] : 1,
        }}
        transition={{
          rotate: { repeat: Infinity, duration: state === 'thinking' ? 6 : 40, ease: 'linear' },
          scale: { repeat: Infinity, duration: 1.5, ease: 'easeInOut' },
        }}
      >
        {/* Tiny orbiting starlight particle on the ring */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-violet-300 shadow-[0_0_12px_#c084fc]" />
      </motion.div>

      {/* Second inclined counter-orbit ring */}
      <motion.div
        className="absolute w-[300px] h-[300px] sm:w-[370px] sm:h-[370px] -top-3 rounded-full border border-cyan-400/20 border-dashed pointer-events-none"
        animate={{
          rotate: -360,
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'thinking' ? 8 : 50,
          ease: 'linear',
        }}
      />

      {/* Speaking/Listening Sonic Shockwave Ring */}
      {(state === 'speaking' || state === 'listening') && (
        <motion.div
          className="absolute inset-0 rounded-[32px] sm:rounded-[38px] border-2 border-cyan-400/40 pointer-events-none"
          animate={{
            scale: [1, 1.15, 1.25],
            opacity: [0.8, 0.3, 0],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.8,
            ease: 'easeOut',
          }}
        />
      )}

      {/* Main Character Portrait Card */}
      <motion.div
        className="relative z-10 w-[270px] sm:w-[320px] md:w-[340px] h-[400px] sm:h-[470px] md:h-[500px] rounded-[32px] sm:rounded-[38px] overflow-hidden border-2 shadow-2xl transition-all duration-500"
        style={{
          borderColor:
            state === 'listening'
              ? 'rgba(34, 211, 238, 0.6)'
              : state === 'thinking'
              ? 'rgba(168, 85, 247, 0.6)'
              : state === 'speaking'
              ? 'rgba(232, 121, 249, 0.7)'
              : 'rgba(167, 139, 250, 0.3)',
          boxShadow:
            state === 'listening'
              ? '0 0 50px rgba(34, 211, 238, 0.35), inset 0 0 30px rgba(34, 211, 238, 0.2)'
              : state === 'thinking'
              ? '0 0 45px rgba(168, 85, 247, 0.35), inset 0 0 25px rgba(168, 85, 247, 0.2)'
              : state === 'speaking'
              ? '0 0 60px rgba(232, 121, 249, 0.4), inset 0 0 30px rgba(232, 121, 249, 0.25)'
              : '0 0 35px rgba(139, 92, 246, 0.2), inset 0 0 20px rgba(139, 92, 246, 0.15)',
        }}
        animate={{
          scale: state === 'listening' || state === 'speaking' ? reactiveScale : [0.99, 1.01, 0.99],
        }}
        transition={{
          scale: {
            duration: state === 'listening' || state === 'speaking' ? 0.08 : 4,
            repeat: state === 'listening' || state === 'speaking' ? 0 : Infinity,
            ease: 'easeInOut',
          },
        }}
      >
        {/* The User-Provided Celestial Artwork */}
        <img
          src="/evalynthiya_avatar.jpg"
          alt="EVALYNTHIYA Celestial AI Companion"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
        />

        {/* Ethereal Gradient Overlay for blending bottom & top nicely */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-violet-950/30 pointer-events-none" />

        {/* Hand Ripple Touchpoint (She reaches toward the user) */}
        <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 pointer-events-none flex items-center justify-center">
          <motion.div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-violet-300/40 bg-violet-400/10 backdrop-blur-xs flex items-center justify-center"
            animate={{
              scale: state === 'listening' ? [1, 1.4, 1] : state === 'speaking' ? [1, 1.25, 1] : [0.95, 1.05, 0.95],
              opacity: state === 'listening' ? [0.6, 1, 0.6] : state === 'speaking' ? 0.9 : 0.5,
            }}
            transition={{
              repeat: Infinity,
              duration: state === 'listening' ? 1.2 : state === 'speaking' ? 1.6 : 3,
              ease: 'easeInOut',
            }}
          >
            <Sparkles className="w-5 h-5 text-violet-200 animate-pulse" />
          </motion.div>
        </div>

        {/* Bottom Audio Visualizer Soundwaves across the frame */}
        <div className="absolute bottom-3 inset-x-4 flex items-end justify-center gap-1 h-8 pointer-events-none">
          {Array.from({ length: 18 }).map((_, i) => {
            const isSpeaking = state === 'speaking';
            const isListening = state === 'listening';
            // Simulated or real volume wave height
            const height = isSpeaking
              ? Math.max(6, Math.sin((i / 18) * Math.PI + Date.now() / 200) * 26 + 6)
              : isListening
              ? Math.max(4, volume * 35 * Math.sin((i / 18) * Math.PI) + 4)
              : 4;

            return (
              <motion.div
                key={i}
                className="flex-1 rounded-full transition-all duration-75"
                style={{
                  height: `${height}px`,
                  backgroundColor: isListening
                    ? '#22d3ee'
                    : isSpeaking
                    ? '#e879f9'
                    : 'rgba(255,255,255,0.2)',
                  boxShadow:
                    isSpeaking || isListening
                      ? `0 0 8px ${isListening ? '#22d3ee' : '#e879f9'}`
                      : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Fast Mode Indicator Badge in Top-Right of Avatar */}
        {fastMode && (
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[10px] font-medium flex items-center gap-1 backdrop-blur-md">
            <Radio className="w-3 h-3 text-cyan-300 animate-pulse" />
            <span>Fast Voice</span>
          </div>
        )}
      </motion.div>

      {/* Floating State Badge below Portrait */}
      <div className="relative mt-3.5 z-20">
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div
              key="state-idle"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-violet-500/30 backdrop-blur-md text-xs text-violet-200 shadow-lg group-hover:border-violet-400/50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-medium">EVALYNTHIYA</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-300">Tap anywhere to talk</span>
            </motion.div>
          )}

          {state === 'listening' && (
            <motion.div
              key="state-listening"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-400/50 backdrop-blur-md text-xs text-cyan-200 shadow-lg shadow-cyan-500/20"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
              <span className="font-semibold text-white">Listening...</span>
              <span className="text-cyan-400/60">•</span>
              <span className="text-cyan-300">Speak now</span>
            </motion.div>
          )}

          {state === 'thinking' && (
            <motion.div
              key="state-thinking"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-950/80 border border-purple-400/50 backdrop-blur-md text-xs text-purple-200 shadow-lg shadow-purple-500/20"
            >
              <Brain className="w-3.5 h-3.5 text-purple-300 animate-spin" />
              <span className="font-semibold text-white">Thinking...</span>
              <span className="text-purple-400/60">•</span>
              <span className="text-purple-300">Fast response</span>
            </motion.div>
          )}

          {state === 'speaking' && (
            <motion.div
              key="state-speaking"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-fuchsia-950/80 border border-fuchsia-400/50 backdrop-blur-md text-xs text-fuchsia-200 shadow-lg shadow-fuchsia-500/20"
            >
              <Volume2 className="w-3.5 h-3.5 text-fuchsia-300 animate-bounce" />
              <span className="font-semibold text-white">EVALYNTHIYA Speaking</span>
              <span className="text-fuchsia-400/60">•</span>
              <span className="text-fuchsia-300">Tap to interrupt</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
