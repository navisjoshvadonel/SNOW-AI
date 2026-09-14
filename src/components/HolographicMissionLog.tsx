import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send, Download, Trash2, Copy, ThumbsUp, ThumbsDown,
  Mic, MicOff, Volume2, VolumeX, Paperclip, X,
  Terminal, ShieldCheck, Sparkles, BrainCircuit
} from "lucide-react";

export interface ChatItem {
  id: string;
  sender: "user" | "snow";
  text: string;
  timestamp: string;
  widget?: {
    type: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system";
    data: any;
  };
  toolActivity?: string[];
  userPrompt?: string;
  feedbackGiven?: "thumbs_up" | "thumbs_down";
}

export interface HolographicMissionLogProps {
  chatHistory: ChatItem[];
  inputText: string;
  isLoading: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  attachedContextFiles: { name: string; path: string; content: string }[];
  isJarvisMode?: boolean;
  onToggleJarvisMode?: () => void;
  micVolume?: number;
  onInputChange: (text: string) => void;
  onSendMessage: (textToSend?: string) => void;
  onToggleListening: () => void;
  onToggleMute: () => void;
  onClearHistory: () => void;
  onExtractConversation: () => void;
  onRemoveAttachment: (path: string) => void;
  onSendFeedback: (msgId: string, feedback: "thumbs_up" | "thumbs_down") => void;
  renderFormattedMessage: (text: string) => React.ReactNode;
  renderWidgetContent: (widget: { type: string; data: any }) => React.ReactNode;
}

export const HolographicMissionLog: React.FC<HolographicMissionLogProps> = ({
  chatHistory,
  inputText,
  isLoading,
  isListening,
  isSpeaking,
  isMuted,
  attachedContextFiles,
  isJarvisMode = true,
  onToggleJarvisMode,
  micVolume = 0,
  onInputChange,
  onSendMessage,
  onToggleListening,
  onToggleMute,
  onClearHistory,
  onExtractConversation,
  onRemoveAttachment,
  onSendFeedback,
  renderFormattedMessage,
  renderWidgetContent,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isLoading]);

  return (
    <div className="col-span-4 flex flex-col rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-2xl shadow-[0_0_40px_rgba(6,182,212,0.08)] overflow-hidden relative select-none">
      {/* HUD Corner Reticles */}
      <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-cyan-400/80 pointer-events-none" />
      <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-cyan-400/80 pointer-events-none" />
      <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-cyan-400/80 pointer-events-none" />
      <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-cyan-400/80 pointer-events-none" />

      {/* Top Cyber Animated Laser Line */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/90 to-transparent animate-pulse" />

      {/* ─── Header ─── */}
      <div className="p-3.5 border-b border-cyan-500/20 flex items-center justify-between bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
          </span>
          <div className="flex flex-col">
            <span className="font-extrabold text-xs text-cyan-200 tracking-widest uppercase font-mono">
              CONVERSATION
            </span>
            <span className="text-[9px] font-mono text-cyan-500/60 font-semibold tracking-wider">
              LIVE CHAT
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <button
            onClick={onClearHistory}
            className="px-2.5 py-1 rounded-xl border border-cyan-500/20 bg-slate-900/90 text-[10px] font-bold text-slate-400 hover:text-white hover:border-cyan-400/40 transition cursor-pointer flex items-center gap-1"
            title="Clear active conversation stream"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>

          <button
            onClick={onExtractConversation}
            className="px-2.5 py-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer flex items-center gap-1"
            title="Export conversation transcript"
          >
            <Download className="w-3 h-3" />
            <span>Extract</span>
          </button>
        </div>
      </div>

      {/* ─── Scrollable Message Feed ─── */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans scrollbar-none">
        {chatHistory.map((msg, index) => {
          const isUser = msg.sender === "user";
          const isLast = index === chatHistory.length - 1;
          const isSnowSpeaking = !isUser && isSpeaking && isLast;

          return (
            <div
              key={msg.id}
              className={`w-full flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
            >
              {/* Message Header Badge */}
              <div className="text-[10px] text-slate-400 px-1 font-mono flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isUser ? "bg-cyan-400" : isSnowSpeaking ? "bg-emerald-400 animate-ping" : "bg-emerald-400"
                  }`}
                />
                <span className="font-bold tracking-wider uppercase text-cyan-300">
                  {isUser ? "NJ" : "SNOW"}
                </span>

                {/* Vocal Equalizer Pills when S.N.O.W. is Speaking */}
                {isSnowSpeaking && (
                  <div className="flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40">
                    {[...Array(4)].map((_, i) => (
                      <motion.span
                        key={i}
                        animate={{ height: [3, 10, 4, 12, 3] }}
                        transition={{
                          duration: 0.4 + i * 0.1,
                          repeat: Infinity,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                        className="w-0.5 bg-emerald-300 rounded-full"
                      />
                    ))}
                    <span className="text-[8px] font-mono text-emerald-300 ml-1 font-bold uppercase">VOICE</span>
                  </div>
                )}

                <span className="text-slate-500">•</span>
                <span className="text-slate-400">{msg.timestamp}</span>
              </div>

              {/* Message Bubble Card */}
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className={`max-w-[92%] p-3.5 rounded-2xl leading-relaxed text-xs shadow-xl backdrop-blur-md relative border transition-all duration-300 ${
                  isUser
                    ? "bg-gradient-to-br from-cyan-950/80 to-slate-900/90 border-cyan-500/40 text-cyan-50 rounded-tr-none shadow-[0_0_20px_rgba(6,182,212,0.12)] hover:border-cyan-400"
                    : isSnowSpeaking
                    ? "bg-slate-950/95 border-emerald-400/60 text-slate-100 rounded-tl-none shadow-[0_0_28px_rgba(52,211,153,0.3)] snow-speech-active"
                    : "bg-slate-950/90 border-cyan-500/25 text-slate-100 rounded-tl-none shadow-[0_0_20px_rgba(0,0,0,0.6)] hover:border-cyan-500/40"
                }`}
              >
                {/* Tool Activity Execution Pills */}
                {msg.toolActivity && msg.toolActivity.length > 0 && (
                  <div className="mb-2.5 pb-2 border-b border-cyan-500/15 space-y-1 font-mono">
                    <div className="text-[9px] text-cyan-400/80 font-bold uppercase tracking-widest flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-cyan-400" />
                      <span>ACTIONS TAKEN</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {msg.toolActivity.map((tool, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-400/30 text-[9px] text-cyan-300 font-mono flex items-center gap-1"
                        >
                          <span className="w-1 h-1 rounded-full bg-emerald-400" />
                          <span>{tool}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formatted Content */}
                <div className="font-sans leading-relaxed">
                  {renderFormattedMessage(msg.text)}
                </div>

                {/* Integrated Widgets (Weather, Stocks, etc.) */}
                {msg.widget && renderWidgetContent(msg.widget)}

                {/* Footer Controls for Snow Messages */}
                {!isUser && (
                  <div className="mt-2.5 pt-1.5 border-t border-cyan-500/15 flex items-center justify-between font-mono text-[10px] text-slate-400">
                    <div className="flex items-center gap-1.5 text-cyan-400/70 font-bold">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>VERIFIED SECURE</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(msg.text)}
                        className="hover:text-cyan-300 transition cursor-pointer p-0.5"
                        title="Copy response"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onSendFeedback(msg.id, "thumbs_up")}
                        className={`hover:text-emerald-300 transition cursor-pointer p-0.5 ${
                          msg.feedbackGiven === "thumbs_up" ? "text-emerald-400" : ""
                        }`}
                        title="Positive feedback"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onSendFeedback(msg.id, "thumbs_down")}
                        className={`hover:text-rose-300 transition cursor-pointer p-0.5 ${
                          msg.feedbackGiven === "thumbs_down" ? "text-rose-400" : ""
                        }`}
                        title="Negative feedback"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          );
        })}

        {/* Live Autonomous Quantum Processing Loader */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2"
          >
            <div className="p-3 rounded-2xl bg-slate-950/95 border border-cyan-500/40 rounded-tl-none flex items-center gap-3 text-xs font-mono text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.25)] relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scanline" />
              <div className="relative flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span className="absolute w-1.5 h-1.5 rounded-full bg-cyan-200" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold tracking-wider uppercase text-[11px] text-cyan-200">
                  Synthesizing Neural Response...
                </span>
                <span className="text-[9px] text-cyan-400/60 font-medium tracking-wide">
                  Processing situational context & telemetry
                </span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ─── Floating Acoustic Voice & Input Dock ─── */}
      <div className="p-3 border-t border-cyan-500/20 bg-slate-950/95 relative space-y-2">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-1 text-[10px] font-mono">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isSpeaking
                  ? "bg-emerald-400 animate-ping"
                  : isListening
                  ? "bg-rose-400 animate-ping"
                  : isLoading
                  ? "bg-cyan-400 animate-spin"
                  : "bg-slate-500"
              }`}
            />
            <span className="text-slate-300 font-semibold uppercase tracking-wider">
              {isSpeaking
                ? "Snow is speaking..."
                : isListening
                ? "Listening (speak now)..."
                : isLoading
                ? "Thinking..."
                : "Snow is ready"}
            </span>
            <span
              className="px-1.5 py-0.2 rounded bg-slate-900 border border-cyan-500/20 text-cyan-300 text-[9px] hidden sm:inline"
              title="Double tap Space anywhere to speak"
            >
              Space ×2 to Speak
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Jarvis Hands-Free Mode Toggle */}
            <button
              type="button"
              onClick={onToggleJarvisMode}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] transition cursor-pointer font-mono font-bold ${
                isJarvisMode
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
              title={isJarvisMode ? "Continuous Hands-Free J.A.R.V.I.S. Conversation Active" : "Click to enable Continuous Hands-Free J.A.R.V.I.S. Mode"}
            >
              <BrainCircuit className={`w-3 h-3 ${isJarvisMode ? "text-cyan-400 animate-pulse" : "text-slate-500"}`} />
              <span>{isJarvisMode ? "JARVIS LOOP" : "PUSH TALK"}</span>
            </button>

            <button
              onClick={onToggleMute}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] transition cursor-pointer font-mono ${
                isMuted
                  ? "bg-rose-950/60 border-rose-500/30 text-rose-300 hover:bg-rose-900/60"
                  : "bg-cyan-950/60 border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60"
              }`}
              title={isMuted ? "Unmute Voice" : "Mute Voice"}
            >
              {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3 text-cyan-400" />}
              <span>{isMuted ? "Muted" : "Voice On"}</span>
            </button>
          </div>
        </div>

        {/* Attached Context Files Chips */}
        {attachedContextFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {attachedContextFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/90 border border-cyan-400/40 text-cyan-300 text-[10px] shadow-sm font-mono"
              >
                <Paperclip className="w-2.5 h-2.5 text-cyan-400" />
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button
                  onClick={() => onRemoveAttachment(file.path)}
                  className="hover:text-rose-400 transition ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tactical Input Dock Field */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] focus-within:border-cyan-400 transition-all">
          <input
            type="text"
            placeholder={
              isListening
                ? isJarvisMode
                  ? "⚡ Say 'Hey Snow' or speak freely (Hands-free active)..."
                  : "Listening to your voice..."
                : attachedContextFiles.length > 0
                ? "Ask Snow about attached files..."
                : "Ask Snow anything, say 'Hey Snow', or press Space ×2..."
            }
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSendMessage()}
            className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-slate-500 focus:ring-0 font-sans px-2"
          />

          {/* Live Voice Audio Waveform Equalizer when Listening */}
          {isListening && (
            <div className="hidden sm:flex items-center gap-0.5 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30">
              {[0.4, 0.8, 1.0, 0.7, 0.5].map((factor, i) => (
                <span
                  key={i}
                  className="w-1 bg-rose-400 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(16, Math.round(((micVolume || 10) * factor * 0.4) + 4)))}px`
                  }}
                />
              ))}
              <span className="text-[9px] font-mono font-bold text-rose-300 ml-1">REC</span>
            </div>
          )}

          {/* Microphone Toggle Button */}
          <button
            type="button"
            onClick={onToggleListening}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isListening
                ? "bg-rose-500/20 border-rose-400 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse"
                : "bg-slate-800/80 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400"
            }`}
            title={isListening ? "Stop Voice Listening" : "Start Voice Listening (or press Space ×2)"}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          {/* Send Directive Button */}
          <button
            onClick={() => onSendMessage()}
            disabled={(!inputText.trim() && attachedContextFiles.length === 0) || isLoading}
            className="p-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 disabled:opacity-30 transition cursor-pointer font-bold shadow-[0_0_12px_rgba(34,211,238,0.3)]"
            title="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HolographicMissionLog;
