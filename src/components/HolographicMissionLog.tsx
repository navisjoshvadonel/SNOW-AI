import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send, Download, Trash2, Copy, Check, ThumbsUp, ThumbsDown,
  Mic, MicOff, Volume2, VolumeX, Paperclip, X, Eye, FileCode,
  Terminal, ShieldCheck, Sparkles, BrainCircuit, Workflow,
  CheckCircle2, Clock, AlertTriangle, Layers, Play, Pause,
  Shield, Cpu, ArrowRight, RotateCw
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
  isContinuousMode?: boolean;
  onToggleContinuousMode?: () => void;
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
  autonomousGoals?: any[];
  onRefreshGoals?: () => void;
  onSeedGoal?: (title: string, description: string, priority?: number) => void;
}

export const HolographicMissionLog: React.FC<HolographicMissionLogProps> = ({
  chatHistory,
  inputText,
  isLoading,
  isListening,
  isSpeaking,
  isMuted,
  attachedContextFiles,
  isContinuousMode = true,
  onToggleContinuousMode,
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
  autonomousGoals = [],
  onRefreshGoals,
  onSeedGoal,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; path: string; content: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "missions">("chat");

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  useEffect(() => {
    if (activeTab === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isLoading, activeTab]);

  const activeGoal = autonomousGoals.find((g: any) => g.status === "active" || g.status === "planning");

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
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-xl border border-cyan-500/20">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "chat" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30" : "text-slate-400 hover:text-white"
              }`}
            >
              <Terminal className="w-3 h-3" />
              <span>CHAT</span>
            </button>
            <button
              onClick={() => setActiveTab("missions")}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 relative ${
                activeTab === "missions" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30" : "text-slate-400 hover:text-white"
              }`}
            >
              <Workflow className="w-3 h-3" />
              <span>SWARM DAG</span>
              {autonomousGoals && autonomousGoals.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse ml-0.5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          {activeTab === "chat" ? (
            <>
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
            </>
          ) : (
            onRefreshGoals && (
              <button
                onClick={onRefreshGoals}
                className="px-2.5 py-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer flex items-center gap-1"
                title="Refresh Swarm Telemetry"
              >
                <RotateCw className="w-3 h-3" />
                <span>Sync</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* ─── Body: Chat Feed vs Swarm Missions View ─── */}
      {activeTab === "missions" ? (
        <div className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans scrollbar-none">
          {/* Swarm Status Bar */}
          <div className="p-2.5 rounded-2xl bg-slate-950/90 border border-cyan-500/30 flex items-center justify-between font-mono text-[10px]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-cyan-300 font-bold tracking-wider">SWARM ORCHESTRATOR</span>
              <span className="text-slate-500">• 8 Specialists Ready</span>
            </div>
            <span className="text-cyan-400 font-bold">OODA 4s</span>
          </div>

          {/* Quick Seed Action Cards if no goals */}
          {(!autonomousGoals || autonomousGoals.length === 0) && (
            <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 flex flex-col gap-3 font-mono">
              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
                <Workflow className="w-4 h-4 text-cyan-400" />
                <span>Autonomous Swarm Standing By</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                The continuous OODA goal engine is online. Seed initial continuous autonomous directives to begin multi-agent milestone dispatching:
              </p>
              <div className="grid grid-cols-1 gap-2 pt-1">
                {onSeedGoal && (
                  <>
                    <button
                      onClick={() => onSeedGoal("Daily Morning System Briefing", "Pre-compute weather for Madurai, Git cleanliness, and telemetry summary", 1)}
                      className="p-2.5 rounded-xl border border-cyan-500/40 bg-slate-900/90 hover:bg-cyan-950/60 text-left transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200">
                          🎯 Daily Morning System Briefing
                        </span>
                        <span className="text-[9px] text-slate-500 font-sans">
                          Madurai weather telemetry, Git cleanliness, and OS vitals
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-400 opacity-60 group-hover:opacity-100 transition" />
                    </button>

                    <button
                      onClick={() => onSeedGoal("Proactive Git & Workspace Health", "Automated verification of clean state and repo integrity", 2)}
                      className="p-2.5 rounded-xl border border-emerald-500/40 bg-slate-900/90 hover:bg-emerald-950/60 text-left transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">
                          🛡️ Proactive Git & Workspace Health
                        </span>
                        <span className="text-[9px] text-slate-500 font-sans">
                          Git object database sweep, zero-touch Windows isolation audit
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-400 opacity-60 group-hover:opacity-100 transition" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Goals List with Interactive DAG Milestones */}
          {autonomousGoals && autonomousGoals.map((goal) => {
            const isCompleted = goal.status === "completed";
            const isActive = goal.status === "active";
            const isPlanning = goal.status === "planning";

            return (
              <div
                key={goal.id}
                className="p-3.5 rounded-2xl bg-slate-950/90 border border-cyan-500/30 flex flex-col gap-2.5 shadow-lg"
              >
                {/* Goal Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-cyan-200 font-mono tracking-wide">
                      {goal.title}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                      {goal.description}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase shrink-0 ${
                      isCompleted
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                        : isActive
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 animate-pulse"
                        : isPlanning
                        ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {goal.status}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span>PROGRESS</span>
                    <span className="text-cyan-400 font-bold">{goal.progressPct}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-cyan-500/20">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-500"
                      style={{ width: `${goal.progressPct}%` }}
                    />
                  </div>
                </div>

                {/* DAG Milestones Tree */}
                {goal.subtasks && goal.subtasks.length > 0 && (
                  <div className="pt-2 border-t border-cyan-500/15 space-y-1.5">
                    <span className="text-[9px] font-mono text-cyan-400/70 tracking-wider font-semibold">
                      DAG MILESTONES ({goal.subtasks.length}):
                    </span>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {goal.subtasks.map((step: any) => {
                        const isStepDone = step.status === "completed";
                        const isStepRunning = step.status === "running";
                        const isStepFailed = step.status === "failed";

                        // Specialist Agent Styling
                        let agentBadge = "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
                        if (step.assignedTool === "SecurityGuard") agentBadge = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                        else if (step.assignedTool === "Coder" || step.assignedTool === "PythonSandbox") agentBadge = "bg-purple-500/20 text-purple-300 border-purple-500/30";
                        else if (step.assignedTool === "MemoryStore") agentBadge = "bg-blue-500/20 text-blue-300 border-blue-500/30";
                        else if (step.assignedTool === "Notification") agentBadge = "bg-amber-500/20 text-amber-300 border-amber-500/30";

                        return (
                          <div
                            key={step.id}
                            className={`p-2 rounded-xl border transition-all ${
                              isStepRunning
                                ? "bg-cyan-950/50 border-cyan-400/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                : isStepDone
                                ? "bg-slate-900/60 border-emerald-500/25"
                                : "bg-slate-900/30 border-slate-800 text-slate-500"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-slate-500 shrink-0">#{step.stepOrder}</span>
                                <span className={`px-1.5 py-0.2 rounded border text-[8px] font-bold shrink-0 ${agentBadge}`}>
                                  {step.assignedTool}
                                </span>
                                <span className={`truncate font-medium ${isStepDone ? "text-slate-300" : isStepRunning ? "text-cyan-200" : "text-slate-500"}`}>
                                  {step.title}
                                </span>
                              </div>
                              <span className="shrink-0">
                                {isStepDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                {isStepRunning && <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping inline-block" />}
                                {!isStepDone && !isStepRunning && !isStepFailed && <Clock className="w-3 h-3 text-slate-600" />}
                                {isStepFailed && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                              </span>
                            </div>

                            {/* Result Summary snippet when completed */}
                            {step.resultSummary && (
                              <div className="mt-1 pl-3 border-l-2 border-emerald-500/40 text-[9px] text-emerald-300/80 truncate font-sans">
                                {step.resultSummary}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Scrollable Message Feed ─── */
        <div className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans scrollbar-none">
          {/* Active Mission HUD Mini-Banner */}
          {activeGoal && (
            <div
              onClick={() => setActiveTab("missions")}
              className="p-2.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-md flex items-center justify-between cursor-pointer hover:border-cyan-400/60 transition group"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
                <span className="text-[10px] font-mono text-cyan-300 font-bold truncate">
                  SWARM MISSION: {activeGoal.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono font-extrabold text-cyan-400">
                  {activeGoal.progressPct}%
                </span>
                <span className="text-[9px] font-mono text-slate-400 group-hover:text-cyan-300 flex items-center">
                  DAG <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
                </span>
              </div>
            </div>
          )}
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
                  <div className="mb-2.5 pb-2 border-b border-cyan-500/15 space-y-1.5 font-mono">
                    <div className="text-[9px] text-cyan-400/90 font-bold uppercase tracking-widest flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="w-3 h-3 text-cyan-400" />
                        <span>TACTICAL ACTIONS EXECUTED</span>
                      </span>
                      <span className="text-[8px] text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                        {msg.toolActivity.length} VERIFIED
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {msg.toolActivity.map((tool, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-400/30 text-[9px] text-cyan-200 font-mono flex items-center gap-1 shadow-sm"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="hover:text-cyan-300 transition cursor-pointer p-0.5 flex items-center gap-1"
                        title={copiedId === msg.id ? "Copied to clipboard" : "Copy response"}
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedId === msg.id && (
                          <span className="text-[9px] text-emerald-400 font-bold">Copied</span>
                        )}
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
      )}

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
            {/* SNOW Hands-Free Mode Toggle */}
            <button
              type="button"
              onClick={onToggleContinuousMode}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] transition cursor-pointer font-mono font-bold ${
                isContinuousMode
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
              title={isContinuousMode ? "Continuous Hands-Free S.N.O.W. Conversation Active" : "Click to enable Continuous Hands-Free S.N.O.W. Mode"}
            >
              <BrainCircuit className={`w-3 h-3 ${isContinuousMode ? "text-cyan-400 animate-pulse" : "text-slate-500"}`} />
              <span>{isContinuousMode ? "CONTINUOUS LOOP" : "PUSH TALK"}</span>
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
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-950/90 border border-cyan-400/40 text-cyan-300 text-[10px] shadow-sm font-mono group"
              >
                <button
                  type="button"
                  onClick={() => setPreviewFile(file)}
                  className="flex items-center gap-1 hover:text-cyan-100 transition cursor-pointer"
                  title="Click to preview file contents"
                >
                  <Paperclip className="w-2.5 h-2.5 text-cyan-400" />
                  <span className="truncate max-w-[110px]">{file.name}</span>
                  <Eye className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 text-cyan-300 ml-0.5" />
                </button>
                <button
                  onClick={() => onRemoveAttachment(file.path)}
                  className="hover:text-rose-400 transition ml-0.5 cursor-pointer"
                  title="Remove attachment"
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
                ? isContinuousMode
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
            <div className="hidden sm:flex items-center gap-0.5 px-2.5 py-1 rounded-xl bg-rose-500/15 border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
              {[0.3, 0.6, 0.9, 1.2, 0.8, 1.0, 0.5, 0.3].map((factor, i) => (
                <span
                  key={i}
                  className="w-1 bg-gradient-to-t from-rose-500 to-rose-300 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(20, Math.round(((micVolume || 12) * factor * 0.45) + 4)))}px`,
                    boxShadow: (micVolume || 0) > 15 ? "0 0 8px rgba(244, 63, 94, 0.8)" : "none"
                  }}
                />
              ))}
              <span className="text-[9px] font-mono font-bold text-rose-300 ml-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                <span>{(micVolume || 0) > 15 ? "SPEAKING" : "LISTENING"}</span>
              </span>
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

      {/* Attached Context File Holographic Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-3 z-50 rounded-2xl bg-slate-950/95 border border-cyan-500/50 backdrop-blur-2xl p-3.5 flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.35)]"
          >
            <div className="flex items-center justify-between pb-2 border-b border-cyan-500/20 font-mono">
              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold truncate">
                <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">{previewFile.name}</span>
                <span className="text-[9px] text-slate-500 font-normal">
                  ({previewFile.content.split("\n").length} lines)
                </span>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 rounded-lg hover:bg-cyan-500/20 text-slate-400 hover:text-white transition cursor-pointer"
                title="Close preview"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto mt-2 p-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/15 font-mono text-[10px] text-slate-300 whitespace-pre-wrap select-text scrollbar-thin leading-relaxed">
              {previewFile.content.slice(0, 10000)}
              {previewFile.content.length > 10000 && "\n\n... [Content truncated for preview]"}
            </div>
            <div className="pt-2 mt-2 border-t border-cyan-500/20 flex justify-between items-center font-mono text-[10px]">
              <span className="text-slate-500 truncate max-w-[180px]">{previewFile.path}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onRemoveAttachment(previewFile.path);
                    setPreviewFile(null);
                  }}
                  className="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-950/60 text-rose-300 hover:bg-rose-900/60 transition cursor-pointer"
                >
                  Remove Attachment
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer font-bold"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HolographicMissionLog;
