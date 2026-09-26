import React from "react";
import { motion } from "motion/react";
import {
  Activity, Shield, Clock, Cpu, HardDrive,
  Database, RefreshCw, Paperclip, Sparkles, FileCode, Radio
} from "lucide-react";
import { CodeFile, TelemetryPackage, ThreatRadarTarget, SynthesizedSkill } from "../types";

export interface TacticalTelemetryHUDProps {
  cpuPct: number;
  ramPct: number;
  ramUsed: string;
  ramTotal: string;
  diskUsage: string;
  uptimeFormatted: string;
  commandCount: number;
  telemetryPackage?: TelemetryPackage | null;
  synthesizedSkills?: SynthesizedSkill[];
  onExecuteSkill?: (name: string) => void;
  weather: {
    temp: string;
    condition: string;
    location: string;
    humidity?: string;
    wind?: string;
    feelsLike?: string;
    visualIcon?: React.ReactNode;
  };
  workspaceFiles: CodeFile[];
  selectedVaultPath: string | null;
  activeFileContent: string;
  vaultSearchQuery: string;
  attachedContextFiles: { name: string; path: string; content: string }[];
  onSelectVaultFile: (path: string) => void;
  onVaultSearchChange: (q: string) => void;
  onAttachFile: (name: string, path: string, content: string) => void;
  onAskSnowAboutFile: (name: string, path: string, content: string) => void;
  onIngestFileToRAG: (path: string, content: string) => void;
  onRefreshStats: () => void;
}

// Circular SVG Arc Meter Component with dynamic glowing gradients
const CircularGauge = ({
  value,
  label,
  sublabel,
  color,
  gradientId,
  size = 76,
  strokeWidth = 6,
}: {
  value: number;
  label: string;
  sublabel: string;
  color: string;
  gradientId?: string;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference - (safePct / 100) * circumference;
  const gid = gradientId || `gauge-grad-${label.toLowerCase()}`;

  return (
    <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-950/85 border border-cyan-500/25 shadow-inner relative group hover:border-cyan-400/60 transition-all duration-300">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
            </linearGradient>
            <filter id={`glow-${gid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={color} floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Track background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(15, 23, 42, 0.95)"
            strokeWidth={strokeWidth}
          />
          {/* Outer Precision Tick Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius + 3}
            fill="none"
            stroke="rgba(6, 182, 212, 0.2)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />
          {/* Active progress arc */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            filter={`url(#glow-${gid})`}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-mono text-xs font-bold text-white tracking-tight flex items-center">
            {Math.round(safePct)}%
          </span>
        </div>
      </div>

      <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase mt-1 tracking-wider">{label}</span>
      <span className="text-[9px] font-mono text-slate-400 truncate max-w-[80px]">{sublabel}</span>
    </div>
  );
};

export const TacticalTelemetryHUD: React.FC<TacticalTelemetryHUDProps> = ({
  cpuPct,
  ramPct,
  ramUsed,
  ramTotal,
  diskUsage,
  uptimeFormatted,
  commandCount,
  telemetryPackage,
  weather,
  workspaceFiles,
  selectedVaultPath,
  activeFileContent,
  vaultSearchQuery,
  attachedContextFiles,
  onSelectVaultFile,
  onVaultSearchChange,
  onAttachFile,
  onAskSnowAboutFile,
  onIngestFileToRAG,
  onRefreshStats,
  synthesizedSkills = [],
  onExecuteSkill,
}) => {
  const radarTargets: ThreatRadarTarget[] =
    telemetryPackage?.radarTargets && telemetryPackage.radarTargets.length > 0
      ? telemetryPackage.radarTargets
      : [
          { angleDeg: 42, distancePct: 30, type: "SECURE", label: "Snow Core Server (Port 3000)" },
          { angleDeg: 125, distancePct: 45, type: "SECURE", label: "Subprocess Guardian" },
          { angleDeg: 215, distancePct: 68, type: "TRACKING", label: "Neural Cloud Relay" },
          { angleDeg: 305, distancePct: 52, type: "SECURE", label: "Port Sentinel" },
        ];

  const gridStatus = telemetryPackage?.gridStatus || "OPTIMAL";

  return (
    <div className="col-span-3 flex flex-col gap-3 overflow-y-auto pr-1 scrollbar-none select-none">
      {/* ─── CARD 1: HARDWARE TELEMETRY ARC METERS ─── */}
      <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.06)]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-2.5">
          <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold text-xs tracking-wider">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>SYSTEM PERFORMANCE</span>
          </div>
          <button
            onClick={onRefreshStats}
            className="text-cyan-400/60 hover:text-cyan-300 transition cursor-pointer"
            title="Poll fresh system telemetry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3 Circular SVG Gauges */}
        <div className="grid grid-cols-3 gap-2">
          <CircularGauge
            value={cpuPct}
            label="CPU"
            sublabel={`${cpuPct}% Load`}
            color="#22d3ee"
            gradientId="grad-cpu"
          />
          <CircularGauge
            value={ramPct}
            label="RAM"
            sublabel={ramUsed.split(" ")[0] + " GB"}
            color="#34d399"
            gradientId="grad-ram"
          />
          <CircularGauge
            value={Math.round((parseFloat(diskUsage.split("/")[0]) / parseFloat(diskUsage.split("/")[1] || "157")) * 100) || 54}
            label="DISK"
            sublabel={diskUsage.split("/")[0] + "G"}
            color="#a78bfa"
            gradientId="grad-disk"
          />
        </div>

        {/* Live Dynamic Bus Activity Wave / Sparkline */}
        <div className="mt-3 p-2 rounded-xl bg-slate-950/80 border border-cyan-500/20 overflow-hidden relative">
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-1">
            <span className="text-cyan-300 font-bold uppercase tracking-wider">DYNAMIC WORKLOAD WAVE</span>
            <span className="text-emerald-400 font-semibold">{cpuPct > 50 ? "ACTIVE BUS" : "NOMINAL"}</span>
          </div>
          <div className="h-6 w-full flex items-center justify-between gap-1">
            {Array.from({ length: 24 }).map((_, i) => {
              const baseHeight = Math.max(3, Math.min(22, Math.sin(i * 0.6) * 8 + (cpuPct / 100) * 14 + (i % 3) * 2));
              return (
                <motion.div
                  key={i}
                  animate={{ height: [baseHeight * 0.6, baseHeight, baseHeight * 0.4] }}
                  transition={{
                    duration: 1.2 + (i % 4) * 0.2,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                    delay: i * 0.05,
                  }}
                  className="flex-1 rounded-full"
                  style={{
                    backgroundColor: i % 4 === 0 ? "#22d3ee" : i % 3 === 0 ? "#34d399" : "rgba(6, 182, 212, 0.45)",
                    boxShadow: i % 4 === 0 ? "0 0 6px rgba(34, 211, 238, 0.8)" : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Dynamic Hardware Health Strip */}
        <div className="mt-2.5 pt-2 border-t border-cyan-500/15 flex items-center justify-between font-mono text-[10px]">
          <span className="text-slate-400">SYSTEM HEALTH:</span>
          <span className="text-emerald-300 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>OPTIMAL & PROTECTED</span>
          </span>
        </div>
      </div>

      {/* ─── CARD 2: SENTINEL THREAT RADAR & PROCESS WATCHDOG ─── */}
      <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.06)]">

        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-2">
          <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold text-xs tracking-wider">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>SECURITY & ENGINES</span>
          </div>
          <span
            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
              gridStatus === "OPTIMAL"
                ? "text-emerald-400 bg-emerald-950/70 border-emerald-500/30"
                : gridStatus === "ENGAGED"
                ? "text-cyan-300 bg-cyan-950/70 border-cyan-500/30"
                : "text-rose-400 bg-rose-950/70 border-rose-500/30 animate-pulse"
            }`}
          >
            {gridStatus === "OPTIMAL" ? "ALL CLEAR" : gridStatus}
          </span>
        </div>

        {/* Circular Radar Sweep Screen */}
        <div className="flex items-center gap-3 py-1">
          <div className="relative w-24 h-24 rounded-full bg-slate-950 border border-cyan-500/40 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            {/* Range Rings */}
            <div className="absolute inset-2 rounded-full border border-cyan-500/20" />
            <div className="absolute inset-5 rounded-full border border-cyan-500/20" />
            <div className="absolute inset-8 rounded-full border border-cyan-500/20" />
            {/* Crosshairs */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-[1px] bg-cyan-500/20" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-full w-[1px] bg-cyan-500/20" />
            </div>

            {/* Rotating Conical Sweep Beam */}
            <div className="absolute inset-0 radar-sweep opacity-70" />

            {/* Dynamic Blip Nodes mapped from Polar Coordinates */}
            {radarTargets.map((target, idx) => {
              const angleRad = ((target.angleDeg - 90) * Math.PI) / 180;
              const r = (Math.max(12, Math.min(88, target.distancePct)) / 100) * 40;
              const x = 48 + r * Math.cos(angleRad);
              const y = 48 + r * Math.sin(angleRad);
              const colorClass =
                target.type === "SECURE"
                  ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                  : target.type === "TRACKING"
                  ? "bg-cyan-400 shadow-[0_0_6px_#22d3ee]"
                  : "bg-rose-400 shadow-[0_0_6px_#f43f5e]";

              return (
                <div
                  key={idx}
                  className={`absolute w-1.5 h-1.5 rounded-full ${colorClass} animate-pulse cursor-pointer transition-transform hover:scale-150`}
                  style={{ left: `${x - 3}px`, top: `${y - 3}px` }}
                  title={`${target.label} (${target.type})`}
                />
              );
            })}
          </div>

          {/* Dynamic Active Process & Socket Telemetry */}
          <div className="flex-1 space-y-1.5 font-mono text-[10px]">
            {radarTargets.slice(0, 3).map((t, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center bg-slate-950/70 px-2 py-1 rounded-lg border border-cyan-500/15"
                title={t.label}
              >
                <span className="text-slate-400 truncate max-w-[95px]">
                  {t.label.replace(/\s*\(Port \d+\)/, "")}
                </span>
                <span
                  className={`font-bold ${
                    t.type === "SECURE"
                      ? "text-emerald-300"
                      : t.type === "TRACKING"
                      ? "text-cyan-300"
                      : "text-rose-400"
                  }`}
                >
                  {t.type === "SECURE" ? "SECURE" : t.type === "TRACKING" ? "SYNC" : "ALERT"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── CARD 3: TACTICAL ATMOSPHERE & WEATHER ─── */}
      <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.06)]">

        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-2">
          <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold text-xs tracking-wider">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>WEATHER</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">
            {weather.condition}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-black font-mono text-white tracking-tight drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              {weather.temp}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]">
              {weather.location}
            </div>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-950 border border-cyan-500/20 shadow-inner">
            {weather.visualIcon}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2 border-t border-cyan-500/15 font-mono text-[9px] text-center">
          <div className="bg-slate-950/70 p-1 rounded-lg border border-cyan-500/15">
            <span className="text-slate-500 block">HUMIDITY</span>
            <span className="text-cyan-200 font-bold">{weather.humidity || "65%"}</span>
          </div>
          <div className="bg-slate-950/70 p-1 rounded-lg border border-cyan-500/15">
            <span className="text-slate-500 block">WIND</span>
            <span className="text-cyan-200 font-bold">{weather.wind || "8 km/h"}</span>
          </div>
          <div className="bg-slate-950/70 p-1 rounded-lg border border-cyan-500/15">
            <span className="text-slate-500 block">FEELS LIKE</span>
            <span className="text-cyan-200 font-bold">{weather.feelsLike || weather.temp}</span>
          </div>
        </div>
      </div>

      {/* ─── CARD 4: WORKSPACE VAULT & COGNITIVE REPOSITORY ─── */}
      <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.06)]">

        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-2">
          <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold text-xs tracking-wider">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>PROJECT FILES</span>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 font-bold">{workspaceFiles.length} FILES</span>
        </div>

        {/* Vault Search Input */}
        <input
          type="text"
          placeholder="Search project files..."
          value={vaultSearchQuery}
          onChange={(e) => onVaultSearchChange(e.target.value)}
          className="w-full bg-slate-950 border border-cyan-500/25 rounded-xl px-2.5 py-1.5 text-xs text-cyan-200 placeholder-slate-500 outline-none focus:border-cyan-400 font-mono mb-2"
        />

        {/* File List Stream */}
        <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px] pr-1 scrollbar-none">
          {workspaceFiles
            .filter((f) => f.name.toLowerCase().includes(vaultSearchQuery.toLowerCase()))
            .slice(0, 8)
            .map((file) => {
              const isSelected = selectedVaultPath === file.path;
              const isAttached = attachedContextFiles.some((a) => a.path === file.path);
              return (
                <div
                  key={file.path}
                  onClick={() => onSelectVaultFile(file.path)}
                  className={`flex items-center justify-between p-1.5 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                      : "bg-slate-950/60 border-cyan-500/10 text-slate-300 hover:border-cyan-500/30 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <FileCode className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-slate-900 text-cyan-400/80 border border-cyan-500/20 font-bold">
                      {file.ext}
                    </span>
                    {isAttached && <Paperclip className="w-2.5 h-2.5 text-cyan-400" />}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Quick File Action Dock */}
        {selectedVaultPath && (
          <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-cyan-500/15">
            <button
              onClick={() =>
                onAttachFile(
                  selectedVaultPath.split("/").pop() || selectedVaultPath,
                  selectedVaultPath,
                  activeFileContent
                )
              }
              className="p-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[9px] font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
              title="Attach file to message context"
            >
              <Paperclip className="w-2.5 h-2.5" />
              <span>Attach</span>
            </button>
            <button
              onClick={() =>
                onAskSnowAboutFile(
                  selectedVaultPath.split("/").pop() || selectedVaultPath,
                  selectedVaultPath,
                  activeFileContent
                )
              }
              className="p-1 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[9px] font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
              title="Audit & analyze file"
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>Audit</span>
            </button>
            <button
              onClick={() => onIngestFileToRAG(selectedVaultPath, activeFileContent)}
              className="p-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[9px] font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
              title="Index into vector RAG memory"
            >
              <Database className="w-2.5 h-2.5" />
              <span>RAG</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── CARD 4.5: AUTONOMOUS DYNAMIC SKILLS ─── */}
      {synthesizedSkills.length > 0 && (
        <div className="p-3.5 rounded-3xl bg-slate-900/80 border border-indigo-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_25px_rgba(99,102,241,0.06)]">
          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2 mb-2">
            <div className="flex items-center gap-2 text-indigo-300 font-mono font-bold text-xs tracking-wider">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>DYNAMIC SKILLS</span>
            </div>
            <span className="text-[10px] font-mono text-indigo-400 font-bold">{synthesizedSkills.length} ACTIVE</span>
          </div>
          
          <div className="max-h-24 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1 scrollbar-none">
            {synthesizedSkills.map((skill) => (
              <div key={skill.id} className="p-2 rounded-xl bg-slate-950/60 border border-indigo-500/10 hover:border-indigo-500/30 transition group">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="text-indigo-300 font-bold">{skill.name}</span>
                    <span className="text-[9px] text-slate-500 truncate max-w-[150px]">{skill.description}</span>
                  </div>
                  <button
                    onClick={() => onExecuteSkill && onExecuteSkill(skill.name)}
                    className="shrink-0 p-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 transition"
                    title="Manually trigger skill"
                  >
                    <Activity className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── CARD 5: UPTIME & EXECUTIVE SESSION TRACKER ─── */}
      <div className="p-3 rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
        <div className="flex items-center justify-between font-mono text-[10px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>UPTIME:</span>
          </div>
          <span className="font-bold text-white tracking-wider">{uptimeFormatted}</span>
        </div>

        {telemetryPackage && (
          <div className="mt-2 pt-2 border-t border-cyan-500/15 flex items-center justify-between font-mono text-[9px] text-cyan-400/80">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>ORBIT: {telemetryPackage.orbitalAltitudeKm} KM</span>
            </span>
            <span className="text-emerald-300 font-bold tracking-wider">
              {telemetryPackage.activeCoordinates[0]?.name.split("(")[1]?.replace(")", "") || "PRIMARY"} •{" "}
              {telemetryPackage.activeCoordinates[0]?.pingMs || 1}ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TacticalTelemetryHUD;
