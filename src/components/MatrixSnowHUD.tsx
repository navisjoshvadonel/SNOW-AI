import React, { useEffect, useRef } from "react";

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

      {/* Subtle Container Border */}
      <div className="absolute inset-0 border border-cyan-500/15 rounded-3xl pointer-events-none" />
    </div>
  );
};

export default MatrixSnowHUD;
