import React from 'react';
import { X, Trash2, Volume2, Download, User, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types';
import { detectLanguage } from '../utils/languageDetector';

interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onClearHistory: () => void;
  onReplayAudio: (text: string) => void;
}

export const ConversationDrawer: React.FC<ConversationDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onClearHistory,
  onReplayAudio,
}) => {
  if (!isOpen) return null;

  const handleExport = () => {
    const transcript = messages
      .map((m) => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role === 'assistant' ? 'EVALYNTHIYA' : 'User'}: ${m.content}`)
      .join('\n\n');

    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evalynthiya-conversation-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="conversation-drawer-overlay"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
    >
      <div
        id="conversation-drawer-panel"
        className="w-full max-w-md h-full bg-slate-950 border-l border-white/10 flex flex-col shadow-2xl p-6 overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-semibold text-white">Conversation Memory</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-mono">
              {messages.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <>
                <button
                  id="export-convo-btn"
                  onClick={handleExport}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                  title="Export Transcript"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  id="clear-convo-btn"
                  onClick={onClearHistory}
                  className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                  title="Clear Memory"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              id="close-drawer-btn"
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Log List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Sparkles className="w-8 h-8 mb-2 text-slate-600 opacity-60" />
              <p className="text-sm">No messages yet in this session.</p>
              <p className="text-xs mt-1">Start talking with EVALYNTHIYA to see live transcripts here.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const lang = detectLanguage(msg.content);

              return (
                <div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
                    {isAssistant ? (
                      <>
                        <span className="font-semibold text-violet-300">EVALYNTHIYA</span>
                        <span>•</span>
                        <span className="text-[10px] text-slate-500">{lang.nativeName}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] text-slate-500">{lang.nativeName}</span>
                        <span>•</span>
                        <span className="font-medium text-slate-300">You</span>
                      </>
                    )}
                  </div>

                  <div
                    className={`p-3.5 rounded-2xl max-w-[90%] text-sm leading-relaxed ${
                      isAssistant
                        ? 'bg-violet-950/40 border border-violet-500/20 text-violet-100 rounded-tl-sm'
                        : 'bg-white/10 border border-white/15 text-slate-100 rounded-tr-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                    {isAssistant && (
                      <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2">
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          id={`replay-msg-${msg.id}`}
                          onClick={() => onReplayAudio(msg.content)}
                          className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-cyan-300 transition-colors"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>Replay</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-white/10 text-center">
          <p className="text-[11px] text-slate-500">
            Session context is continuously maintained for multi-turn conversations.
          </p>
        </div>
      </div>
    </div>
  );
};
