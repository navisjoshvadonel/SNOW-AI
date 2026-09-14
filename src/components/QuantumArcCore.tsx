import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Snowflake, Sparkles, Shield, Zap, BrainCircuit, Radio, Volume2 } from "lucide-react";

export interface QuantumArcCoreProps {
  state: "standby" | "thinking" | "listening" | "speaking";
  cpuPct?: number;
  isMuted?: boolean;
  micVolume?: number;
  onCoreClick?: () => void;
}

export const QuantumArcCore: React.FC<QuantumArcCoreProps> = ({
  state,
  cpuPct = 12,
  isMuted = false,
  micVolume = 0,
  onCoreClick,
}) => {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  // 32-band radial frequency equalizer calculation with sinusoidal harmonics
  const frequencyBands = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * 360;
      return { id: i, angle };
    });
  }, []);

  // Orbital Swarm Specialist Agents
  const swarmAgents = [
    { name: "PLAN", label: "Planner", color: "#38bdf8", icon: BrainCircuit, initialAngle: 0 },
    { name: "BLD", label: "Builder", color: "#22d3ee", icon: Zap, initialAngle: 90 },
    { name: "SEC", label: "Security", color: "#34d399", icon: Shield, initialAngle: 180 },
    { name: "SYS", label: "System", color: "#a78bfa", icon: Radio, initialAngle: 270 },
  ];

  // Dynamic state colors
  const primaryGlow =
    state === "thinking"
      ? "rgba(34, 211, 238, 0.55)"
      : state === "listening"
      ? "rgba(244, 63, 94, 0.65)"
      : state === "speaking"
      ? "rgba(52, 211, 153, 0.65)"
      : "rgba(6, 182, 212, 0.3)";

  const accentColor =
    state === "thinking"
      ? "#22d3ee"
      : state === "listening"
      ? "#f43f5e"
      : state === "speaking"
      ? "#34d399"
      : "#06b6d4";

  const handleDialClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipples((prev) => [...prev, { id: Date.now(), x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => Date.now() - r.id < 1200));
    }, 1200);
    if (onCoreClick) onCoreClick();
  };

  return (
    <div className="relative flex flex-col items-center justify-center select-none py-2">
      {/* ─── Main Dial Assembly (Width: 320px, Height: 320px) ─── */}
      <div
        onClick={handleDialClick}
        className="relative flex items-center justify-center w-80 h-80 cursor-pointer group"
      >
        {/* Ambient Bloom Glow Layer */}
        <div
          className="absolute inset-0 rounded-full blur-3xl transition-all duration-700 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${primaryGlow} 0%, transparent 70%)`,
            transform:
              state === "thinking" || state === "speaking"
                ? "scale(1.2)"
                : state === "listening"
                ? `scale(${1.05 + Math.min(0.25, (micVolume / 100) * 0.3)})`
                : "scale(0.95)",
          }}
        />

        {/* Dynamic Ripple Rings on Click */}
        <AnimatePresence>
          {ripples.map((ripple) => (
            <motion.div
              key={ripple.id}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              className="absolute rounded-full border border-cyan-400 pointer-events-none z-30"
              style={{
                width: 140,
                height: 140,
                boxShadow: `0 0 20px ${accentColor}`,
              }}
            />
          ))}
        </AnimatePresence>

        {/* ─── LAYER 1: Outermost Compass & Precision Tick Ring ─── */}
        <div className="absolute inset-0 rounded-full border border-cyan-500/20 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 320 320">
            {/* Major cardinal ticks (0, 90, 180, 270) */}
            {[0, 90, 180, 270].map((deg) => (
              <g key={deg} transform={`rotate(${deg} 160 160)`}>
                <line x1="160" y1="4" x2="160" y2="16" stroke={accentColor} strokeWidth="2" strokeOpacity="0.85" />
                <circle cx="160" cy="20" r="1.5" fill={accentColor} />
              </g>
            ))}
            {/* Intermediate precision ticks */}
            {Array.from({ length: 36 }).map((_, i) => (
              <g key={i} transform={`rotate(${i * 10} 160 160)`}>
                <line
                  x1="160"
                  y1="5"
                  x2="160"
                  y2={i % 3 === 0 ? "13" : "9"}
                  stroke={i % 3 === 0 ? accentColor : "#06b6d4"}
                  strokeWidth={i % 3 === 0 ? "1.5" : "0.75"}
                  strokeOpacity={i % 3 === 0 ? "0.6" : "0.25"}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* ─── LAYER 2: Swarm Orbital Track & Satellites ─── */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: state === "thinking" ? 12 : state === "speaking" ? 18 : 32,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-2 rounded-full border border-dashed border-cyan-500/30 pointer-events-none"
        >
          {swarmAgents.map((agent) => (
            <div
              key={agent.name}
              className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center"
              style={{
                top: `${50 - 47 * Math.cos((agent.initialAngle * Math.PI) / 180)}%`,
                left: `${50 + 47 * Math.sin((agent.initialAngle * Math.PI) / 180)}%`,
              }}
            >
              {/* Satellite Pip with glowing aura */}
              <div
                className="relative w-3.5 h-3.5 rounded-full border flex items-center justify-center shadow-lg transition-transform group-hover:scale-125"
                style={{
                  borderColor: agent.color,
                  backgroundColor: "rgba(2, 6, 23, 0.95)",
                  boxShadow: `0 0 12px ${agent.color}`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: agent.color }} />
              </div>
            </div>
          ))}
        </motion.div>

        {/* ─── LAYER 3: Segmented Rotating HUD Telemetry Arcs ─── */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{
            duration: state === "thinking" ? 7 : state === "speaking" ? 10 : 24,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-5 rounded-full pointer-events-none"
        >
          <svg className="w-full h-full" viewBox="0 0 280 280">
            <circle
              cx="140"
              cy="140"
              r="134"
              fill="none"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeDasharray="50 25 15 25 90 40"
              strokeDashoffset="10"
              strokeOpacity="0.8"
            />
            <circle
              cx="140"
              cy="140"
              r="128"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.2"
              strokeDasharray="12 28 60 18"
              strokeOpacity="0.45"
            />
          </svg>
        </motion.div>

        {/* ─── LAYER 4: 32-Band Circular Harmonic Frequency Spectrum ─── */}
        <div className="absolute inset-10 flex items-center justify-center pointer-events-none">
          {frequencyBands.map((band) => {
            // Harmonic wave formula based on cognitive state
            const angleRad = (band.angle * Math.PI) / 180;
            const sineHarmonic = Math.sin(angleRad * 3) * 6 + Math.cos(angleRad * 2) * 4;
            const voiceBoost =
              state === "listening" && micVolume > 2
                ? Math.min(26, Math.round((micVolume / 100) * 26))
                : 0;

            const barHeight =
              state === "speaking"
                ? [6, 20 + Math.abs(sineHarmonic) * 1.6, 8, 26 + (band.id % 4) * 3, 6]
                : state === "listening"
                ? [
                    6 + voiceBoost * 0.3,
                    16 + voiceBoost + (band.id % 6) * 2,
                    8 + voiceBoost * 0.6,
                    22 + voiceBoost * 1.3,
                    6 + voiceBoost * 0.3,
                  ]
                : state === "thinking"
                ? [4, 18, 5, 22, 4]
                : [4, 8 + Math.abs(sineHarmonic) * 0.5, 4];

            const duration =
              state === "speaking"
                ? 0.35 + (band.id % 5) * 0.08
                : state === "listening"
                ? voiceBoost > 5
                  ? 0.12
                  : 0.3 + (band.id % 3) * 0.06
                : state === "thinking"
                ? 0.6 + (band.id % 4) * 0.1
                : 2.2;

            return (
              <div
                key={band.id}
                className="absolute origin-bottom"
                style={{
                  transform: `rotate(${band.angle}deg) translateY(-106px)`,
                  height: "30px",
                  width: "2.5px",
                }}
              >
                <motion.div
                  animate={{ height: barHeight }}
                  transition={{
                    duration,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                    delay: (band.id % 8) * 0.04,
                  }}
                  className="w-full rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor:
                      state === "listening"
                        ? "#f43f5e"
                        : state === "speaking"
                        ? "#34d399"
                        : state === "thinking"
                        ? "#38bdf8"
                        : "rgba(6, 182, 212, 0.5)",
                    boxShadow:
                      state === "listening"
                        ? "0 0 10px rgba(244, 63, 94, 0.9)"
                        : state === "speaking"
                        ? "0 0 10px rgba(52, 211, 153, 0.9)"
                        : state === "thinking"
                        ? "0 0 8px rgba(56, 189, 248, 0.7)"
                        : "0 0 4px rgba(6, 182, 212, 0.4)",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* ─── LAYER 5: Tactical Radar Sweep Cone ─── */}
        <div className="absolute inset-16 rounded-full border border-cyan-500/25 overflow-hidden pointer-events-none">
          <div className="w-full h-full radar-sweep opacity-60" />
        </div>

        {/* ─── LAYER 6: Inner Glowing Plasma Sphere & 3D Snowflake Core ─── */}
        <div className="relative w-44 h-44 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-950/90 to-cyan-950/90 border border-cyan-400/60 flex items-center justify-center shadow-[inset_0_0_45px_rgba(6,182,212,0.45)] overflow-hidden transition-transform duration-300 group-hover:scale-105">
          {/* Hexagonal Tech Mesh Overlay */}
          <div className="absolute inset-0 tech-grid opacity-35 pointer-events-none" />

          {/* 3D Holographic Snowflake Core Engine */}
          <div className="relative w-36 h-36 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{
                rotateY: 360,
                rotateZ:
                  state === "thinking"
                    ? [0, 180, 360]
                    : state === "speaking"
                    ? [-10, 10, -10]
                    : [0, 8, -8, 0],
                scale:
                  state === "thinking"
                    ? [0.95, 1.15, 0.95]
                    : state === "listening"
                    ? [1, 1.15, 1]
                    : state === "speaking"
                    ? [1.02, 1.18, 1.02]
                    : 1,
              }}
              transition={{
                rotateY: {
                  duration: state === "thinking" ? 3.5 : state === "speaking" ? 5 : 8,
                  repeat: Infinity,
                  ease: "linear",
                },
                rotateZ: {
                  duration: state === "thinking" ? 2.5 : state === "speaking" ? 1.4 : 7,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
                scale: {
                  duration: state === "speaking" ? 1.0 : 2.0,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="relative flex items-center justify-center w-full h-full"
            >
              {/* Primary Central Crystal Snowflake */}
              <Snowflake
                className={`w-20 h-20 transition-all duration-500 ${
                  state === "listening"
                    ? "text-rose-400 drop-shadow-[0_0_35px_rgba(244,63,94,1)] scale-110"
                    : state === "thinking"
                    ? "text-cyan-200 drop-shadow-[0_0_40px_rgba(34,211,238,1)] scale-115"
                    : state === "speaking"
                    ? "text-emerald-300 drop-shadow-[0_0_40px_rgba(52,211,153,1)] scale-115"
                    : "text-cyan-300 drop-shadow-[0_0_24px_rgba(34,211,238,0.75)]"
                }`}
              />

              {/* Counter-Rotated Crystal Ring */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
                className="absolute"
              >
                <Snowflake
                  className={`w-26 h-26 opacity-55 transition-colors duration-500 ${
                    state === "listening"
                      ? "text-rose-300 drop-shadow-[0_0_18px_rgba(251,113,133,0.8)]"
                      : state === "speaking"
                      ? "text-emerald-200 drop-shadow-[0_0_22px_rgba(167,243,208,0.8)]"
                      : "text-blue-300 drop-shadow-[0_0_18px_rgba(147,197,253,0.7)]"
                  }`}
                />
              </motion.div>

              {/* Geometric Sparkle Particle Ring */}
              <motion.div
                animate={{ rotate: 360, scale: [0.92, 1.1, 0.92] }}
                transition={{
                  rotate: { duration: 16, repeat: Infinity, ease: "linear" },
                  scale: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
                }}
                className="absolute"
              >
                <Sparkles
                  className={`w-28 h-28 opacity-40 ${
                    state === "listening"
                      ? "text-rose-400"
                      : state === "speaking"
                      ? "text-emerald-400"
                      : "text-cyan-400"
                  }`}
                />
              </motion.div>
            </motion.div>

            {/* Central 9-Band Waveform Pill for Live Acoustic Feedback */}
            <div className="absolute inset-0 flex items-center justify-center gap-1 z-20 pointer-events-none">
              {[...Array(9)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height:
                      state === "thinking"
                        ? [4, 26, 4]
                        : state === "listening"
                        ? [6, 36, 6]
                        : state === "speaking"
                        ? [8, 48, 8]
                        : [4, 14, 4],
                  }}
                  transition={{
                    duration:
                      state === "speaking"
                        ? 0.28 + (i % 4) * 0.06
                        : state === "listening"
                        ? 0.2 + (i % 3) * 0.05
                        : 0.7 + (i % 3) * 0.1,
                    repeat: Infinity,
                    repeatType: "reverse",
                    delay: i * 0.03,
                  }}
                  className={`w-1 rounded-full ${
                    state === "listening"
                      ? "bg-rose-200 shadow-[0_0_12px_#fecdd3]"
                      : state === "speaking"
                      ? "bg-emerald-200 shadow-[0_0_14px_#6ee7b7]"
                      : state === "thinking"
                      ? "bg-white shadow-[0_0_12px_#ffffff]"
                      : "bg-cyan-200 shadow-[0_0_10px_#cff4fc]"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Internal Plasma Lens Reflection */}
          <div className="absolute inset-2 rounded-full border border-cyan-400/30 bg-cyan-500/5 pointer-events-none" />
        </div>
      </div>

      {/* ─── Executive Typography & Tactical Readout ─── */}
      <div className="flex flex-col items-center gap-2 mt-3 z-10">
        <div className="flex items-center gap-3">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-cyan-400/70" />
          <h1 className="text-3xl font-black tracking-[0.35em] text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.95)] font-mono">
            S N O W
          </h1>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-cyan-400/70" />
        </div>

        {/* Dynamic Operational Status Badge */}
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-950/85 border border-cyan-500/35 font-mono text-[10px] tracking-wider shadow-[0_0_18px_rgba(6,182,212,0.14)]">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
            }}
          />
          <span className="text-slate-200 font-semibold uppercase tracking-wider">
            {state === "listening"
              ? "Attentive to Voice... (NJ)"
              : state === "thinking"
              ? "Neural ReAct Processing..."
              : state === "speaking"
              ? "Synthesizing Vocal Delivery..."
              : "At Your Command, NJ"}
          </span>
        </div>

        {/* Real-Time Telemetry Stats Row */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-cyan-400/75 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">CPU LOAD:</span>
            <span className="text-cyan-200 font-bold">{cpuPct}%</span>
          </div>
          <span className="text-cyan-500/30">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">STATUS:</span>
            <span className="text-emerald-300 font-bold">Optimal</span>
          </div>
          <span className="text-cyan-500/30">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">OPERATOR:</span>
            <span className="text-cyan-200 font-bold">NJ</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuantumArcCore;
