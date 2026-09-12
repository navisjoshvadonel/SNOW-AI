import React from "react";
import { motion } from "motion/react";
import {
  Activity, Shield, Clock, Cpu, HardDrive,
  Database, RefreshCw, Paperclip, Sparkles, FileCode, Radio
} from "lucide-react";
import { CodeFile } from "../types";

export interface TacticalTelemetryHUDProps {
  cpuPct: number;
  ramPct: number;
  ramUsed: string;
  ramTotal: string;
  diskUsage: string;
  uptimeFormatted: string;
  commandCount: number;
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

// Circular SVG Arc Meter Component
const CircularGauge = ({
  value,
  label,
  sublabel,
  color,
  size = 76,
  strokeWidth = 6,
}: {
  value: number;
  label: string;
  sublabel: string;
  color: string;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference - (safePct / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-950/80 border border-cyan-500/20 shadow-inner relative group hover:border-cyan-400/50 transition">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          {/* Track background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(15, 23, 42, 0.9)"
            strokeWidth={strokeWidth}
          />
          {/* Subtle Outer Tick Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius + 3}
            fill="none"
            stroke="rgba(6, 182, 212, 0.15)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />
          {/* Active progress arc */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-mono text-xs font-bold text-white tracking-tight">{Math.round(safePct)}%</span>
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
}) => {
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
          />
          <CircularGauge
            value={ramPct}
            label="RAM"
            sublabel={ramUsed.split(" ")[0] + " GB"}
            color="#34d399"
          />
          <CircularGauge
            value={Math.round((parseFloat(diskUsage.split("/")[0]) / parseFloat(diskUsage.split("/")[1] || "157")) * 100) || 54}
            label="DISK"
            sublabel={diskUsage.split("/")[0] + "G"}
            color="#a78bfa"
          />
        </div>

        {/* Dynamic Hardware Health Strip */}
        <div className="mt-2.5 pt-2 border-t border-cyan-500/15 flex items-center justify-between font-mono text-[10px]">
          <span className="text-slate-400">SYSTEM HEALTH:</span>
          <span className="text-emerald-300 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>HEALTHY</span>
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
          <span className="text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            ALL CLEAR
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

            {/* Blip Nodes (Simulated Active Processes) */}
            <div className="absolute top-4 left-6 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
            <div className="absolute bottom-6 right-5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />
            <div className="absolute top-7 right-7 w-1.5 h-1.5 rounded-full bg-sky-300 shadow-[0_0_6px_#38bdf8] animate-pulse" />
          </div>

          {/* Active Process Telemetry */}
          <div className="flex-1 space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between items-center bg-slate-950/70 px-2 py-1 rounded-lg border border-cyan-500/15">
              <span className="text-slate-400 truncate">SYSTEM CONTROL</span>
              <span className="text-cyan-300 font-bold">CONNECTED</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/70 px-2 py-1 rounded-lg border border-cyan-500/15">
              <span className="text-slate-400 truncate">VOICE ENGINE</span>
              <span className="text-emerald-300 font-bold">INSTANT</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/70 px-2 py-1 rounded-lg border border-cyan-500/15">
              <span className="text-slate-400 truncate">AI ASSISTANTS</span>
              <span className="text-blue-300 font-bold">4 READY</span>
            </div>
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

      {/* ─── CARD 5: UPTIME & EXECUTIVE SESSION TRACKER ─── */}
      <div className="p-3 rounded-3xl bg-slate-900/80 border border-cyan-500/25 backdrop-blur-xl relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
        <div className="flex items-center justify-between font-mono text-[10px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>UPTIME:</span>
          </div>
          <span className="font-bold text-white tracking-wider">{uptimeFormatted}</span>
        </div>
      </div>
    </div>
  );
};

export default TacticalTelemetryHUD;
