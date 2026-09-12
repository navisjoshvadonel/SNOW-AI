import React, { useMemo } from "react";
import { motion } from "motion/react";
import { Snowflake, Sparkles, Shield, Zap, BrainCircuit, Radio } from "lucide-react";

export interface QuantumArcCoreProps {
  state: "standby" | "thinking" | "listening" | "speaking";
  cpuPct?: number;
  isMuted?: boolean;
}

export const QuantumArcCore: React.FC<QuantumArcCoreProps> = ({
  state,
  cpuPct = 12,
  isMuted = false,
}) => {
  // 32-band radial frequency equalizer calculation
  const frequencyBands = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * 360;
      return { id: i, angle };
    });
  }, []);

  // Orbital Swarm Specialist Agents
  const swarmAgents = [
    { name: "ARCH", label: "Architect", color: "#38bdf8", icon: BrainCircuit, initialAngle: 0 },
    { name: "EXEC", label: "Executor", color: "#22d3ee", icon: Zap, initialAngle: 90 },
    { name: "SENT", label: "Sentinel", color: "#34d399", icon: Shield, initialAngle: 180 },
    { name: "TELM", label: "Telemetry", color: "#a78bfa", icon: Radio, initialAngle: 270 },
  ];

  // Dynamic state colors
  const primaryGlow =
    state === "thinking"
      ? "rgba(34, 211, 238, 0.5)"
      : state === "listening"
      ? "rgba(244, 63, 94, 0.55)"
      : state === "speaking"
      ? "rgba(52, 211, 153, 0.55)"
      : "rgba(6, 182, 212, 0.25)";

  const accentColor =
    state === "thinking"
      ? "#22d3ee"
      : state === "listening"
      ? "#f43f5e"
      : state === "speaking"
      ? "#34d399"
      : "#06b6d4";

  return (
    <div className="relative flex flex-col items-center justify-center select-none py-2">
      {/* ─── Main Dial Assembly (Width: 320px, Height: 320px) ─── */}
      <div className="relative flex items-center justify-center w-80 h-80">
        {/* Ambient Bloom Glow Layer */}
        <div
          className="absolute inset-0 rounded-full blur-3xl transition-all duration-700 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${primaryGlow} 0%, transparent 70%)`,
            transform: state === "thinking" || state === "speaking" ? "scale(1.15)" : "scale(0.95)",
          }}
        />

        {/* ─── LAYER 1: Outermost Compass & Precision Tick Ring ─── */}
        <div className="absolute inset-0 rounded-full border border-cyan-500/20 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 320 320">
            {/* Major cardinal ticks (0, 90, 180, 270) */}
            {[0, 90, 180, 270].map((deg) => (
              <g key={deg} transform={`rotate(${deg} 160 160)`}>
                <line x1="160" y1="4" x2="160" y2="16" stroke={accentColor} strokeWidth="2" strokeOpacity="0.8" />
                <circle cx="160" cy="20" r="1.5" fill={accentColor} />
              </g>
            ))}
            {/* Intermediate precision ticks */}
            {Array.from({ length: 24 }).map((_, i) => (
              <g key={i} transform={`rotate(${i * 15} 160 160)`}>
                <line x1="160" y1="6" x2="160" y2="11" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.3" />
              </g>
            ))}
          </svg>
        </div>

        {/* ─── LAYER 2: Swarm Orbital Track & Satellites ─── */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: state === "thinking" ? 14 : state === "speaking" ? 20 : 36,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-2 rounded-full border border-dashed border-cyan-500/25 pointer-events-none"
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
              {/* Satellite Pip */}
              <div
                className="relative w-3.5 h-3.5 rounded-full border flex items-center justify-center shadow-lg"
                style={{
                  borderColor: agent.color,
                  backgroundColor: "rgba(2, 6, 23, 0.9)",
                  boxShadow: `0 0 10px ${agent.color}`,
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
            duration: state === "thinking" ? 8 : state === "speaking" ? 12 : 28,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-6 rounded-full pointer-events-none"
        >
          <svg className="w-full h-full" viewBox="0 0 272 272">
            <circle
              cx="136"
              cy="136"
              r="130"
              fill="none"
              stroke={accentColor}
              strokeWidth="2"
              strokeDasharray="45 25 15 25 80 40"
              strokeDashoffset="10"
              strokeOpacity="0.75"
            />
            <circle
              cx="136"
              cy="136"
              r="124"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1"
              strokeDasharray="10 30 50 20"
              strokeOpacity="0.4"
            />
          </svg>
        </motion.div>

        {/* ─── LAYER 4: 32-Band Circular Frequency Spectrum ─── */}
        <div className="absolute inset-10 flex items-center justify-center pointer-events-none">
          {frequencyBands.map((band) => {
            // Calculate dynamic bar height depending on state
            const barHeight =
              state === "speaking"
                ? [6, 18 + (band.id % 5) * 4, 8, 24 - (band.id % 4) * 3, 6]
                : state === "listening"
                ? [8, 22 + (band.id % 7) * 3, 10, 26, 8]
                : state === "thinking"
                ? [4, 14, 4, 18, 4]
                : [4, 8, 4];

            const duration =
              state === "speaking"
                ? 0.4 + (band.id % 4) * 0.1
                : state === "listening"
                ? 0.3 + (band.id % 3) * 0.1
                : 1.8;

            return (
              <div
                key={band.id}
                className="absolute origin-bottom"
                style={{
                  transform: `rotate(${band.angle}deg) translateY(-106px)`,
                  height: "28px",
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
                    delay: (band.id % 8) * 0.05,
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
                        : "rgba(6, 182, 212, 0.45)",
                    boxShadow:
                      state === "listening"
                        ? "0 0 8px rgba(244, 63, 94, 0.8)"
                        : state === "speaking"
                        ? "0 0 8px rgba(52, 211, 153, 0.8)"
                        : "0 0 4px rgba(6, 182, 212, 0.5)",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* ─── LAYER 5: Tactical Radar Sweep Cone ─── */}
        <div className="absolute inset-16 rounded-full border border-cyan-500/20 overflow-hidden pointer-events-none">
          <div className="w-full h-full radar-sweep opacity-50" />
        </div>

        {/* ─── LAYER 6: Inner Glowing Plasma Sphere & Snowflake ─── */}
        <div className="relative w-44 h-44 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-950/90 to-cyan-950/90 border border-cyan-400/50 flex items-center justify-center shadow-[inset_0_0_40px_rgba(6,182,212,0.4)] overflow-hidden">
          {/* Hexagonal Tech Mesh Overlay */}
          <div className="absolute inset-0 tech-grid opacity-30 pointer-events-none" />

          {/* 3D Holographic Snowflake Core Engine */}
          <div className="relative w-36 h-36 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{
                rotateY: 360,
                rotateZ:
                  state === "thinking"
                    ? [0, 180, 360]
                    : state === "speaking"
                    ? [-8, 8, -8]
                    : [0, 10, -10, 0],
                scale:
                  state === "thinking"
                    ? [0.95, 1.1, 0.95]
                    : state === "listening"
                    ? [1, 1.12, 1]
                    : state === "speaking"
                    ? [1.02, 1.15, 1.02]
                    : 1,
              }}
              transition={{
                rotateY: {
                  duration: state === "thinking" ? 4 : state === "speaking" ? 6 : 9,
                  repeat: Infinity,
                  ease: "linear",
                },
                rotateZ: {
                  duration: state === "thinking" ? 2.8 : state === "speaking" ? 1.5 : 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
                scale: {
                  duration: state === "speaking" ? 1.2 : 2.2,
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
                    ? "text-rose-400 drop-shadow-[0_0_30px_rgba(244,63,94,0.95)]"
                    : state === "thinking"
                    ? "text-cyan-200 drop-shadow-[0_0_35px_rgba(34,211,238,0.95)] scale-110"
                    : state === "speaking"
                    ? "text-emerald-300 drop-shadow-[0_0_35px_rgba(52,211,153,0.95)] scale-110"
                    : "text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.7)]"
                }`}
              />

              {/* Counter-Rotated Crystal Ring */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute"
              >
                <Snowflake
                  className={`w-24 h-24 opacity-50 transition-colors duration-500 ${
                    state === "listening"
                      ? "text-rose-300 drop-shadow-[0_0_15px_rgba(251,113,133,0.7)]"
                      : state === "speaking"
                      ? "text-emerald-200 drop-shadow-[0_0_20px_rgba(167,243,208,0.7)]"
                      : "text-blue-300 drop-shadow-[0_0_15px_rgba(147,197,253,0.6)]"
                  }`}
                />
              </motion.div>

              {/* Geometric Sparkle Particle Ring */}
              <motion.div
                animate={{ rotate: 360, scale: [0.9, 1.08, 0.9] }}
                transition={{
                  rotate: { duration: 18, repeat: Infinity, ease: "linear" },
                  scale: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
                }}
                className="absolute"
              >
                <Sparkles
                  className={`w-28 h-28 opacity-35 ${
                    state === "listening"
                      ? "text-rose-400"
                      : state === "speaking"
                      ? "text-emerald-400"
                      : "text-cyan-400"
                  }`}
                />
              </motion.div>
            </motion.div>

            {/* Central Waveform Pill for Live Vocal Feedback */}
            <div className="absolute inset-0 flex items-center justify-center gap-1 z-20 pointer-events-none">
              {[...Array(7)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height:
                      state === "thinking"
                        ? [4, 22, 4]
                        : state === "listening"
                        ? [6, 30, 6]
                        : state === "speaking"
                        ? [8, 42, 8]
                        : [4, 12, 4],
                  }}
                  transition={{
                    duration: state === "speaking" ? 0.3 + (i % 3) * 0.08 : 0.6 + (i % 3) * 0.12,
                    repeat: Infinity,
                    repeatType: "reverse",
                    delay: i * 0.04,
                  }}
                  className={`w-1 rounded-full ${
                    state === "listening"
                      ? "bg-rose-200 shadow-[0_0_10px_#fecdd3]"
                      : state === "speaking"
                      ? "bg-emerald-200 shadow-[0_0_12px_#6ee7b7]"
                      : state === "thinking"
                      ? "bg-white shadow-[0_0_10px_#ffffff]"
                      : "bg-cyan-200 shadow-[0_0_8px_#cff4fc]"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Internal Plasma Lens Reflection */}
          <div className="absolute inset-2 rounded-full border border-cyan-400/25 bg-cyan-500/5 pointer-events-none" />
        </div>
      </div>

      {/* ─── Executive Typography & Tactical Telemetry Readout ─── */}
      <div className="flex flex-col items-center gap-2 mt-3 z-10">
        <div className="flex items-center gap-3">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-cyan-400/60" />
          <h1 className="text-3xl font-black tracking-[0.35em] text-white drop-shadow-[0_0_25px_rgba(34,211,238,0.9)] font-mono">
            S N O W
          </h1>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-cyan-400/60" />
        </div>

        {/* Dynamic Operational Telemetry Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/80 border border-cyan-500/30 font-mono text-[10px] tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.1)]">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 8px ${accentColor}`,
            }}
          />
          <span className="text-slate-300 font-semibold uppercase">
            {state === "listening"
              ? "ACOUSTIC SENSORS ACTIVE · LISTENING"
              : state === "thinking"
              ? "NEURAL REASONING · SYNTHESIZING"
              : state === "speaking"
              ? "AUDIO DUPLEX · TRANSMITTING"
              : "QUANTUM CORE MK-V · ACTIVE"}
          </span>
        </div>

        {/* Real-Time Telemetry Stats Row */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-cyan-400/70 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">SYS_LOAD:</span>
            <span className="text-cyan-200 font-bold">{cpuPct}%</span>
          </div>
          <span className="text-cyan-500/30">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">LATENCY:</span>
            <span className="text-cyan-200 font-bold">14ms</span>
          </div>
          <span className="text-cyan-500/30">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">SWARM:</span>
            <span className="text-emerald-300 font-bold">4 ONLINE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuantumArcCore;
