import React, { useState } from "react";
import { Camera, Monitor, VideoOff, Eye, EyeOff, Maximize2, Minimize2, Sparkles, RefreshCw, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "observing";

interface AstraVisionOrbProps {
  state: OrbState;
  isCameraActive: boolean;
  isScreenActive: boolean;
  activeVisionSource: "camera" | "screen" | "none";
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onCaptureSnapshot: () => void;
  autoObserve: boolean;
  onToggleAutoObserve: () => void;
  latestSnapshot?: string | null;
  onOrbClick?: () => void;
}

export const AstraVisionOrb: React.FC<AstraVisionOrbProps> = ({
  state,
  isCameraActive,
  isScreenActive,
  activeVisionSource,
  videoRef,
  onToggleCamera,
  onToggleScreen,
  onCaptureSnapshot,
  autoObserve,
  onToggleAutoObserve,
  latestSnapshot,
  onOrbClick
}) => {
  const [isPipExpanded, setIsPipExpanded] = useState(false);
  const [showPip, setShowPip] = useState(true);

  // State-based dynamic colors & aura
  const getStateColors = () => {
    switch (state) {
      case "listening":
        return {
          glow: "rgba(34, 211, 238, 0.7)",
          ring: "border-cyan-400",
          core: "bg-cyan-400",
          statusText: "LISTENING & PERCEIVING",
          badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
          radar: "text-cyan-400"
        };
      case "thinking":
        return {
          glow: "rgba(168, 85, 247, 0.8)",
          ring: "border-purple-400",
          core: "bg-purple-400",
          statusText: "SYNTHESIZING CONTEXT",
          badgeColor: "bg-purple-500/20 text-purple-300 border-purple-400/40",
          radar: "text-purple-400"
        };
      case "speaking":
        return {
          glow: "rgba(56, 189, 248, 0.9)",
          ring: "border-sky-300",
          core: "bg-sky-400",
          statusText: "VOCAL TRANSMISSION",
          badgeColor: "bg-sky-500/20 text-sky-200 border-sky-400/40",
          radar: "text-sky-300"
        };
      case "observing":
        return {
          glow: "rgba(16, 185, 129, 0.8)",
          ring: "border-emerald-400",
          core: "bg-emerald-400",
          statusText: "ACTIVE MULTIMODAL FEED",
          badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
          radar: "text-emerald-400"
        };
      default:
        return {
          glow: "rgba(6, 182, 212, 0.35)",
          ring: "border-cyan-500/30",
          core: "bg-cyan-500/60",
          statusText: "ASTRA COGNITIVE CORE",
          badgeColor: "bg-slate-800/80 text-cyan-400 border-cyan-500/20",
          radar: "text-cyan-500/50"
        };
    }
  };

  const currentTheme = getStateColors();

  return (
    <div className="flex flex-col items-center">
      {/* ── ASTRA HOLOGRAPHIC ORB ── */}
      <div 
        onClick={onOrbClick}
        className="relative w-28 h-28 flex items-center justify-center cursor-pointer group select-none my-1"
        title="Snow Cognitive Orb — Click to toggle Voice"
      >
        {/* Outer Pulsing Aura */}
        <motion.div
          animate={{
            scale: state === "speaking" ? [1, 1.28, 1.05, 1.25, 1] : state === "listening" ? [1, 1.22, 1] : [1, 1.08, 1],
            opacity: state === "idle" ? [0.35, 0.55, 0.35] : [0.65, 0.95, 0.65],
          }}
          transition={{
            duration: state === "speaking" ? 1.4 : state === "listening" ? 1.2 : 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 rounded-full blur-xl pointer-events-none"
          style={{ background: currentTheme.glow }}
        />

        {/* Orbiting Scanning Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: state === "thinking" ? 3 : 12, repeat: Infinity, ease: "linear" }}
          className={`absolute w-24 h-24 rounded-full border border-dashed ${currentTheme.ring} opacity-60 pointer-events-none`}
        />

        {/* Counter-rotating Secondary Ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          className="absolute w-20 h-20 rounded-full border border-dotted border-cyan-400/40 pointer-events-none"
        />

        {/* Core Glowing Sphere */}
        <div className="relative w-14 h-14 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-400/50 flex items-center justify-center shadow-[inset_0_0_20px_rgba(34,211,238,0.4)]">
          <motion.div
            animate={{
              scale: state === "speaking" ? [0.85, 1.15, 0.9] : state === "listening" ? [0.9, 1.1, 0.9] : [0.95, 1.02, 0.95],
              boxShadow: [
                `0 0 15px ${currentTheme.glow}`,
                `0 0 30px ${currentTheme.glow}`,
                `0 0 15px ${currentTheme.glow}`
              ]
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className={`w-7 h-7 rounded-full ${currentTheme.core} flex items-center justify-center`}
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950 animate-spin" style={{ animationDuration: "8s" }} />
          </motion.div>
        </div>

        {/* Dynamic Equalizer Waveform Lines (when speaking) */}
        {state === "speaking" && (
          <div className="absolute -bottom-2 flex items-center gap-0.5">
            {[40, 75, 100, 60, 90, 45, 80].map((h, idx) => (
              <motion.div
                key={idx}
                animate={{ height: [4, h * 0.16, 4] }}
                transition={{ duration: 0.45, repeat: Infinity, delay: idx * 0.07 }}
                className="w-1 bg-cyan-300 rounded-full"
              />
            ))}
          </div>
        )}
      </div>

      {/* State Status Tag */}
      <div className={`mt-1 text-[10px] font-mono tracking-widest font-bold px-2.5 py-0.5 rounded-full border ${currentTheme.badgeColor} flex items-center gap-1.5 shadow-sm`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
        {currentTheme.statusText}
      </div>

      {/* ── VISION STREAM PIP OVERLAY / CONTROLS ── */}
      {(isCameraActive || isScreenActive) && showPip && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className={`mt-3 rounded-2xl bg-slate-950/90 border border-cyan-500/40 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300 z-30 ${
              isPipExpanded ? "w-80" : "w-56"
            }`}
          >
            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-cyan-500/20 text-[10px] font-mono">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{activeVisionSource === "screen" ? "DESKTOP SCREEN" : "WEBCAM EYE"}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsPipExpanded(!isPipExpanded)}
                  className="p-1 hover:text-cyan-300 text-slate-400 transition cursor-pointer"
                  title={isPipExpanded ? "Compact View" : "Expand View"}
                >
                  {isPipExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setShowPip(false)}
                  className="p-1 hover:text-rose-400 text-slate-400 transition cursor-pointer"
                  title="Hide PiP Window"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Video Viewport with Holographic Grid */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef as any}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Holographic Radar Reticle */}
              <div className="absolute inset-0 pointer-events-none border border-cyan-500/20 flex items-center justify-center">
                <div className="w-8 h-8 border border-cyan-400/40 rounded-full" />
                <div className="absolute top-1 left-2 text-[9px] font-mono text-cyan-400/80">
                  LIVE 1080p
                </div>
                <div className="absolute bottom-1 right-2 text-[9px] font-mono text-cyan-400/80 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                  <span>GEMINI 2.0 FLASH</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="p-2 bg-slate-950/80 flex items-center justify-between gap-1 border-t border-cyan-500/20">
              <div className="flex items-center gap-1">
                <button
                  onClick={onCaptureSnapshot}
                  className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-[10px] font-mono text-cyan-300 transition flex items-center gap-1 cursor-pointer"
                  title="Capture snapshot into chat context"
                >
                  <Camera className="w-2.5 h-2.5" />
                  <span>SNAP</span>
                </button>

                <button
                  onClick={onToggleAutoObserve}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-mono transition flex items-center gap-1 cursor-pointer ${
                    autoObserve
                      ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-cyan-300"
                  }`}
                  title="Auto-index scenes into visual memory every 12s"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${autoObserve ? "animate-spin" : ""}`} />
                  <span>{autoObserve ? "MEMORY ON" : "MEMORY OFF"}</span>
                </button>
              </div>

              <button
                onClick={activeVisionSource === "camera" ? onToggleCamera : onToggleScreen}
                className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-300 text-[10px] transition cursor-pointer"
                title="Disconnect Video Stream"
              >
                <VideoOff className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Re-open PiP pill if hidden while stream active */}
      {(isCameraActive || isScreenActive) && !showPip && (
        <button
          onClick={() => setShowPip(true)}
          className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/90 border border-cyan-500/40 text-[10px] font-mono text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer shadow-lg"
        >
          <Eye className="w-3 h-3 text-cyan-400" />
          <span>SHOW VISION FEED</span>
        </button>
      )}
    </div>
  );
};

export default AstraVisionOrb;
