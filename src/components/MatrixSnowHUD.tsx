import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Cpu, Zap, Shield, Radio, Sparkles } from "lucide-react";

export const MatrixSnowHUD: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    resize();

    window.addEventListener("resize", resize);

    // Matrix Snowfall Rain glyph pool
    const chars = ["0", "1", "❄", "❅", "❆", "⚡", "JARVIS", "SNOW", "AI", "0x9F", "λ", "Ω", "9", "4", "E", "C"];
    
    // Create columns along the corners (left 30% and right 30%)
    const fontSize = 12;
    const cols = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array.from({ length: cols }, () => Math.random() * -100);
    // Slower, graceful drop speeds
    const speeds: number[] = Array.from({ length: cols }, () => Math.random() * 0.4 + 0.2);

    let lastTime = performance.now();
    const fpsInterval = 80; // Slower frame update rate (approx 12.5 FPS step rate for matrix code rain)

    const render = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(render);

      const elapsed = currentTime - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = currentTime - (elapsed % fpsInterval);

      // Semi-transparent fade trail effect
      ctx.fillStyle = "rgba(2, 6, 23, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      drops.forEach((y, i) => {
        const x = i * fontSize;
        // Only render matrix rain along the left 32% and right 32% edges
        const isNearEdge = x < canvas.width * 0.32 || x > canvas.width * 0.68;
        
        if (isNearEdge) {
          const char = chars[Math.floor(Math.random() * chars.length)];
          const isSnowflake = char === "❄" || char === "❅" || char === "❆";
          
          // Head character glow
          ctx.fillStyle = isSnowflake
            ? "rgba(255, 255, 255, 0.95)"
            : Math.random() > 0.85
            ? "#ffffff"
            : "rgba(34, 211, 238, 0.85)";
          ctx.shadowColor = isSnowflake ? "rgba(255, 255, 255, 0.9)" : "rgba(34, 211, 238, 0.7)";
          ctx.shadowBlur = isSnowflake ? 8 : 4;
          
          ctx.fillText(char, x, y);

          // Reset shadow
          ctx.shadowBlur = 0;
        }

        // Slow step down
        drops[i] += fontSize * speeds[i];

        if (drops[i] > canvas.height && Math.random() > 0.96) {
          drops[i] = Math.random() * -30;
        }
      });
    };

    render(performance.now());

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* Matrix Snowfall Canvas Rain Overlay */}
      <canvas ref={canvasRef} className="w-full h-full opacity-35" />

      {/* ─────────────────────────────────────────────────────────────
          FUTURISTIC CORNER HUD TECH BRACKETS (JARVIS STYLE)
      ───────────────────────────────────────────────────────────── */}
      
      {/* TOP-LEFT CORNER HUD */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 z-10">
        <div className="flex items-center gap-1.5 text-cyan-400">
          <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
          <span className="font-mono text-[9px] font-bold tracking-widest text-cyan-300 uppercase flex items-center gap-1 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-500/30 backdrop-blur-sm">
            <Radio className="w-2.5 h-2.5 animate-pulse text-cyan-400" />
            SYS.CORNER//01
          </span>
        </div>
        <div className="flex items-center gap-1 pl-1">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]"
          />
          <span className="font-mono text-[8px] text-cyan-400/70 font-semibold tracking-tighter">
            MATRIX SNOWSTREAM ACTIVE
          </span>
        </div>
      </div>

      {/* TOP-RIGHT CORNER HUD */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10">
        <div className="flex items-center gap-1.5 text-cyan-400">
          <span className="font-mono text-[9px] font-bold tracking-widest text-cyan-300 uppercase flex items-center gap-1 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-500/30 backdrop-blur-sm">
            <Cpu className="w-2.5 h-2.5 text-emerald-400" />
            JARVIS.PROTOCOL//v9.4
          </span>
          <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
        </div>
        <div className="flex items-center gap-1 pr-1">
          <span className="font-mono text-[8px] text-emerald-400/80 font-bold tracking-widest">
            CORNER TELEMETRY 100%
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
        </div>
      </div>

      {/* BOTTOM-LEFT CORNER HUD */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 z-10">
        <div className="flex items-center gap-1 pl-1">
          <Shield className="w-3 h-3 text-cyan-400/80" />
          <span className="font-mono text-[8px] text-cyan-300/80 font-bold tracking-wider">
            SNOWFALL HUD ENCRYPTED
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-cyan-400">
          <div className="w-4 h-4 border-b-2 border-l-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.2, 0.9, 0.2] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3 }}
                className="w-1.5 h-3 bg-cyan-400/70 rounded-xs"
              />
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT CORNER HUD */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1 z-10">
        <div className="flex items-center gap-1 pr-1">
          <span className="font-mono text-[8px] text-cyan-300/80 font-bold tracking-widest">
            CYBER CORE READY
          </span>
          <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5 text-cyan-400">
          <span className="font-mono text-[9px] font-bold tracking-widest text-cyan-300 uppercase flex items-center gap-1 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-500/30 backdrop-blur-sm">
            <Sparkles className="w-2.5 h-2.5 text-cyan-300" />
            JARVIS SNOW MATRIX
          </span>
          <div className="w-4 h-4 border-b-2 border-r-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
        </div>
      </div>

      {/* Corner Scanning Radar Lines */}
      <div className="absolute inset-0 border border-cyan-500/15 rounded-3xl pointer-events-none" />
    </div>
  );
};

export default MatrixSnowHUD;
