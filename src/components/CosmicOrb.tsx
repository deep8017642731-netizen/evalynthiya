import React from 'react';
import { motion } from 'motion/react';
import { AssistantState } from '../types';

interface CosmicOrbProps {
  state: AssistantState;
  volume: number; // 0 to 1
  onClick?: () => void;
}

export const CosmicOrb: React.FC<CosmicOrbProps> = ({ state, volume, onClick }) => {
  // Dynamic scale based on mic or speech volume
  const reactiveScale = 1 + Math.min(volume * 1.5, 0.45);

  return (
    <div
      id="cosmic-orb-container"
      onClick={onClick}
      className="relative flex items-center justify-center w-64 h-64 sm:w-80 sm:h-80 cursor-pointer select-none"
      title="EVALYNTHIYA Presence - Click to interact"
    >
      {/* Outer ambient cosmic nebula aura */}
      <motion.div
        className="absolute inset-0 rounded-full blur-3xl pointer-events-none opacity-40 transition-colors duration-700"
        style={{
          background:
            state === 'listening'
              ? 'radial-gradient(circle, rgba(6,182,212,0.4) 0%, rgba(124,58,237,0.2) 60%, transparent 80%)'
              : state === 'thinking'
              ? 'radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(59,130,246,0.25) 60%, transparent 80%)'
              : state === 'speaking'
              ? 'radial-gradient(circle, rgba(192,132,252,0.5) 0%, rgba(6,182,212,0.25) 65%, transparent 80%)'
              : 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, rgba(79,70,229,0.15) 60%, transparent 80%)',
        }}
        animate={{
          scale: state === 'speaking' || state === 'listening' ? reactiveScale : [0.95, 1.05, 0.95],
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'thinking' ? 2 : 4,
          ease: 'easeInOut',
        }}
      />

      {/* Outermost resonant ring for Speaking & Listening */}
      {(state === 'speaking' || state === 'listening') && (
        <motion.div
          className="absolute inset-2 rounded-full border border-cyan-400/20 pointer-events-none"
          animate={{
            scale: [1, 1.25, 1.35],
            opacity: [0.6, 0.2, 0],
          }}
          transition={{
            repeat: Infinity,
            duration: 2.2,
            ease: 'easeOut',
          }}
        />
      )}

      {/* Middle orbital particle ring */}
      <motion.div
        className="absolute inset-6 rounded-full border border-violet-400/20 border-dashed pointer-events-none"
        animate={{
          rotate: state === 'thinking' ? 360 : -360,
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'thinking' ? 4 : 24,
          ease: 'linear',
        }}
      />

      {/* Main Core Cosmic Sphere */}
      <motion.div
        className="relative z-10 w-40 h-40 sm:w-48 sm:h-48 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 overflow-hidden"
        style={{
          background:
            state === 'listening'
              ? 'radial-gradient(circle at 35% 35%, #22d3ee, #7c3aed 50%, #0f172a 90%)'
              : state === 'thinking'
              ? 'radial-gradient(circle at 35% 35%, #c084fc, #6366f1 55%, #090d16 90%)'
              : state === 'speaking'
              ? 'radial-gradient(circle at 35% 35%, #e879f9, #818cf8 50%, #0f172a 90%)'
              : 'radial-gradient(circle at 35% 35%, #a78bfa, #4c1d95 60%, #0b0914 90%)',
          boxShadow:
            state === 'listening'
              ? '0 0 45px rgba(6, 182, 212, 0.45), inset 0 0 25px rgba(255,255,255,0.4)'
              : state === 'thinking'
              ? '0 0 40px rgba(168, 85, 247, 0.4), inset 0 0 20px rgba(255,255,255,0.3)'
              : state === 'speaking'
              ? '0 0 50px rgba(232, 121, 249, 0.45), inset 0 0 30px rgba(255,255,255,0.45)'
              : '0 0 30px rgba(124, 58, 237, 0.25), inset 0 0 15px rgba(255,255,255,0.2)',
        }}
        animate={{
          scale: state === 'listening' || state === 'speaking' ? reactiveScale : [0.98, 1.02, 0.98],
        }}
        transition={{
          scale: {
            duration: state === 'listening' || state === 'speaking' ? 0.08 : 3.5,
            ease: 'easeOut',
            repeat: state === 'idle' ? Infinity : 0,
          },
        }}
      >
        {/* Shimmering fluid internal waves */}
        <motion.div
          className="absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, transparent 70%)',
          }}
          animate={{
            rotate: [0, 180, 360],
            scale: [1, 1.15, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: state === 'thinking' ? 3 : 8,
            ease: 'linear',
          }}
        />

        {/* Center luminous crystal icon / status pulse */}
        <div className="relative z-20 flex flex-col items-center justify-center text-center pointer-events-none">
          {state === 'thinking' ? (
            <div className="flex gap-1.5 items-center">
              <motion.span
                className="w-2 h-2 rounded-full bg-white shadow-sm"
                animate={{ y: [-4, 4, -4] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
              />
              <motion.span
                className="w-2 h-2 rounded-full bg-white shadow-sm"
                animate={{ y: [-4, 4, -4] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
              />
              <motion.span
                className="w-2 h-2 rounded-full bg-white shadow-sm"
                animate={{ y: [-4, 4, -4] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }}
              />
            </div>
          ) : state === 'listening' ? (
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-cyan-100 rounded-full"
                  animate={{
                    height: [8, Math.max(12, volume * 70 + (i % 2) * 10), 8],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.25,
                    delay: i * 0.05,
                  }}
                />
              ))}
            </div>
          ) : state === 'speaking' ? (
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-fuchsia-100 rounded-full"
                  animate={{
                    height: [10, 28, 10],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.4 + i * 0.1,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          ) : (
            <motion.div
              className="w-3.5 h-3.5 rounded-full bg-violet-200/90 shadow-lg"
              animate={{ opacity: [0.6, 1, 0.6], scale: [0.9, 1.1, 0.9] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            />
          )}
        </div>
      </motion.div>

      {/* Ambient ring rays */}
      <div className="absolute -inset-4 rounded-full border border-purple-500/10 pointer-events-none" />
    </div>
  );
};
