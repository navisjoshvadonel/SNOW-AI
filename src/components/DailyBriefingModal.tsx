import React, { useState, useEffect } from "react";
import {
  X, Sun, CloudRain, Cpu, GitBranch, RefreshCw, Volume2,
  VolumeX, Bell, CheckCircle2, AlertTriangle, ShieldCheck,
  Sparkles, Terminal, Activity, Eye, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DailyBriefingData, ScheduledRoutine } from "../services/routineScheduler";

interface DailyBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayAudio: (script: string) => void;
  isSpeaking: boolean;
  onOpenVisualMemory?: () => void;
}

export default function DailyBriefingModal({
  isOpen,
  onClose,
  onPlayAudio,
  isSpeaking,
  onOpenVisualMemory
}: DailyBriefingModalProps) {
  const [briefing, setBriefing] = useState<DailyBriefingData | null>(null);
  const [routines, setRoutines] = useState<ScheduledRoutine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchBriefing = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/snow/briefing");
      if (res.ok) {
        const data = await res.json();
        setBriefing(data);
      }
    } catch (e) {
      console.warn("Failed to fetch daily briefing:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoutines = async () => {
    try {
      const res = await fetch("/api/snow/routines");
      if (res.ok) {
        const data = await res.json();
        setRoutines(data.routines || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchBriefing();
      fetchRoutines();
    }
  }, [isOpen]);

  const triggerDesktopNotification = async () => {
    setActionFeedback("Dispatching desktop notification...");
    try {
      const res = await fetch("/api/snow/briefing/trigger", { method: "POST" });
      if (res.ok) {
        setActionFeedback("✅ Desktop alert sent via notify-send");
      } else {
        setActionFeedback("⚠️ Failed to dispatch alert");
      }
    } catch {
      setActionFeedback("⚠️ Error triggering notification");
    }
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const runRoutineNow = async (id: string) => {
    setActionFeedback(`Running ${id}...`);
    try {
      const res = await fetch(`/api/snow/routines/run/${id}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setActionFeedback(`✅ ${data.message}`);
        fetchRoutines();
      }
    } catch {
      setActionFeedback(`⚠️ Failed to run routine`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden font-sans"
        >
          {/* Top Cybernetic Accent Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-slate-950/90">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-400/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Sun className="w-5 h-5 animate-pulse text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black tracking-widest text-white uppercase font-mono">
                    Snow Daily Intelligence Briefing
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-400/50 text-emerald-300 text-[10px] font-mono tracking-wider font-semibold">
                    100% LIVE TELEMETRY
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Autonomous Multi-Source Workstation & Environmental Health Digest
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchBriefing}
                disabled={isLoading}
                className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-cyan-300 transition cursor-pointer"
                title="Refresh Live Data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-rose-400 transition cursor-pointer"
                title="Close Briefing"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action Feedback Banner */}
          {actionFeedback && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="px-6 py-1.5 bg-cyan-950/90 border-b border-cyan-500/30 text-cyan-300 text-xs font-mono flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>{actionFeedback}</span>
            </motion.div>
          )}

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. Spoken Script Card & Audio Broadcast Bar */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-950/70 to-slate-900/50 border border-cyan-500/30 relative overflow-hidden shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-cyan-500/20">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/80 font-bold">
                    Executive Audio Script
                  </span>
                  <h3 className="text-xl font-bold text-white tracking-wide">
                    {briefing ? briefing.greeting : "Good day, NJ."}
                  </h3>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => briefing && onPlayAudio(briefing.spokenScript)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold font-mono tracking-wider transition cursor-pointer shadow-md ${
                      isSpeaking
                        ? "bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
                        : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 border-cyan-300"
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>{isSpeaking ? "READING ALOUD..." : "PLAY AUDIO BRIEFING"}</span>
                  </button>

                  <button
                    onClick={triggerDesktopNotification}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 text-slate-200 text-xs font-mono transition cursor-pointer"
                    title="Send native Linux desktop notification"
                  >
                    <Bell className="w-3.5 h-3.5 text-amber-300" />
                    <span>NOTIFY OS</span>
                  </button>
                </div>
              </div>

              {/* Script Text */}
              <p className="pt-4 text-slate-300 text-sm leading-relaxed font-sans italic">
                "{briefing?.spokenScript || (isLoading ? "Synthesizing live system briefing with Gemini 2.5 Flash..." : "Generating intelligence digest...")}"
              </p>
            </div>

            {/* 2. 4-Quadrant Live Telemetry Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Weather & Location */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-cyan-400 font-semibold uppercase">
                    <Sun className="w-4 h-4 text-amber-300" /> Atmosphere & Weather
                  </span>
                  <span>{briefing?.weather.location || "Live Fetch"}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-3xl font-black text-white font-mono">
                    {briefing?.weather.tempC || "--"}
                  </span>
                  <span className="text-sm font-semibold text-cyan-300">
                    {briefing?.weather.condition || "Loading"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                  <div>Humidity: <span className="text-slate-200">{briefing?.weather.humidity || "--"}</span></div>
                  <div>Wind: <span className="text-slate-200">{briefing?.weather.windSpeed || "--"}</span></div>
                </div>
              </div>

              {/* Hardware Sentinel Health */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold uppercase">
                    <Cpu className="w-4 h-4 text-emerald-400" /> Hardware Vitals
                  </span>
                  <span className={`font-semibold ${
                    (briefing?.system.tempC || 0) > 75 ? "text-rose-400" : "text-emerald-400"
                  }`}>
                    {briefing?.system.tempC || 45}°C Core Temp
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 block">CPU LOAD</span>
                    <span className="text-base font-bold text-white font-mono">{briefing?.system.cpuPct || 0}%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 block">RAM USED</span>
                    <span className="text-base font-bold text-white font-mono">{briefing?.system.ramUsedGb || "0"}G</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 block">DISK USED</span>
                    <span className="text-base font-bold text-white font-mono">{briefing?.system.diskPct || 0}%</span>
                  </div>
                </div>
              </div>

              {/* Git & Workspace Status */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-purple-400 font-semibold uppercase">
                    <GitBranch className="w-4 h-4 text-purple-400" /> Workspace Git
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/40 text-purple-300 font-bold">
                    {briefing?.git.branch || "main"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Pending Changes:</span>
                  <span className="text-amber-400 font-bold">
                    {(briefing?.git.modifiedFiles || 0) + (briefing?.git.untrackedFiles || 0)} files
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 truncate border-t border-slate-800/80 pt-2">
                  Last commit: <span className="text-slate-300">{briefing?.git.lastCommit || "Recent commit"}</span>
                </div>
              </div>

              {/* Episodic Visual Memory Recap */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-cyan-400 font-semibold uppercase">
                    <Eye className="w-4 h-4 text-cyan-400" /> Visual RAG Memory
                  </span>
                  <span className="text-cyan-300 font-semibold font-mono">
                    {briefing?.visualEpisodesCount || 0} Episodes Stored
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Snow has indexed key visual observations from camera and screen feed in local SQLite memory.
                </p>
                {onOpenVisualMemory && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenVisualMemory();
                    }}
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono font-semibold transition cursor-pointer pt-1"
                  >
                    <span>Open Visual Memory Explorer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 3. Actionable Priority Directives */}
            <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Today's Focus Directives</span>
              </div>
              <ul className="space-y-2">
                {(briefing?.directives || [
                  "Review and commit modified files on your active branch",
                  "Maintain optimal system thermal performance",
                  "Continuous multimodal vision and ambient wake word active"
                ]).map((directive, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 font-sans">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] mt-0.5">
                      0{idx + 1}
                    </span>
                    <span>{directive}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 4. Autonomous Scheduled Background Routines */}
            <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Autonomous Background Routines</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">Continuous Cron Loops</span>
              </div>

              <div className="space-y-2">
                {routines.map((routine) => (
                  <div
                    key={routine.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800 gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-white font-mono">{routine.name}</span>
                        <span className="text-[10px] font-mono text-slate-500">({routine.intervalMinutes}m cycle)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate max-w-md">
                        {routine.lastResult || "Awaiting initial scheduled cycle..."}
                      </p>
                    </div>

                    <button
                      onClick={() => runRoutineNow(routine.id)}
                      className="self-start sm:self-auto px-3 py-1 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-400/50 text-slate-300 hover:text-cyan-300 text-xs font-mono transition cursor-pointer"
                    >
                      Run Now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
