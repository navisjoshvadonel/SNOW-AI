import React, { useEffect, useRef } from "react";

export const MatrixSnowHUD: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;

    // Rich Cyber Matrix & Snow glyph universe
    const glyphs = [
      // Katakana matrix glyphs
      "ﾊ", "ﾐ", "ﾋ", "ｰ", "ｳ", "ｼ", "ﾅ", "ﾓ", "ﾆ", "ｻ", "ﾜ", "ﾂ", "ｵ", "ﾘ", "ｱ", "ﾎ", "ﾃ", "ﾏ", "ｹ", "ﾒ", "ｴ", "ｶ", "ｷ", "ﾑ", "ﾕ", "ﾗ", "ｾ", "ﾈ", "ｽ", "ﾀ", "ﾇ", "ﾍ",
      // Binary & Hex
      "0", "1", "0", "1", "0x", "9F", "A4", "C2", "FF",
      // Quantum & Math
      "λ", "Ω", "Ψ", "Δ", "Σ", "π", "⬡", "◈", "∞",
      // Snow AGI Identity
      "SNOW", "AI", "CORE", "AGI", "MK5", "❄", "❅", "❆", "⚡"
    ];

    const fontSize = 13;
    let width = 0;
    let height = 0;
    let cols = 0;

    interface DropColumn {
      y: number;
      speed: number;
      char: string;
      isSnowflake: boolean;
      length: number;
    }

    let drops: DropColumn[] = [];

    const initColumns = (newCols: number, canvasHeight: number) => {
      const newDrops: DropColumn[] = [];
      for (let i = 0; i < newCols; i++) {
        // Reuse existing column state if available, else initialize smoothly across screen height
        if (drops[i]) {
          newDrops.push(drops[i]);
        } else {
          const char = glyphs[Math.floor(Math.random() * glyphs.length)];
          newDrops.push({
            y: Math.random() * (canvasHeight / fontSize), // Distribute across full height initially
            speed: Math.random() * 0.35 + 0.25,
            char,
            isSnowflake: char === "❄" || char === "❅" || char === "❆",
            length: Math.floor(Math.random() * 12 + 6)
          });
        }
      }
      drops = newDrops;
      cols = newCols;
    };

    const handleResize = () => {
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);

      if (width <= 0 || height <= 0) return;

      canvas.width = width;
      canvas.height = height;

      // Fill initial background to avoid flashing
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, width, height);

      const calculatedCols = Math.ceil(width / fontSize);
      initColumns(calculatedCols, height);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);
    handleResize();

    let lastTime = performance.now();
    const fpsInterval = 65; // ~15-16 step FPS for authentic cinematic matrix flow

    const render = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(render);

      const elapsed = currentTime - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = currentTime - (elapsed % fpsInterval);

      if (width <= 0 || height <= 0 || cols <= 0) return;

      // Dark translucent wash to create falling ghost trails
      ctx.fillStyle = "rgba(3, 7, 18, 0.12)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "top";

      const maxRows = Math.ceil(height / fontSize);

      for (let i = 0; i < cols; i++) {
        const drop = drops[i];
        if (!drop) continue;

        const x = i * fontSize;
        const currentY = Math.floor(drop.y) * fontSize;

        // Pick a dynamic glyph
        const char = Math.random() > 0.85
          ? glyphs[Math.floor(Math.random() * glyphs.length)]
          : drop.char;
        drop.char = char;

        const isSnowflake = char === "❄" || char === "❅" || char === "❆";
        drop.isSnowflake = isSnowflake;

        // Render Head Glyph with high-intensity glow
        if (currentY >= -fontSize && currentY <= height + fontSize) {
          if (isSnowflake) {
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(165, 243, 252, 0.95)";
            ctx.shadowBlur = 8;
          } else if (Math.random() > 0.7) {
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(56, 189, 248, 0.85)";
            ctx.shadowBlur = 6;
          } else {
            ctx.fillStyle = "#38bdf8";
            ctx.shadowColor = "rgba(6, 182, 212, 0.6)";
            ctx.shadowBlur = 4;
          }

          ctx.fillText(char, x, currentY);
          ctx.shadowBlur = 0;

          // Render a faint secondary ghost glyph right behind the head for stream cohesion
          const prevY = currentY - fontSize;
          if (prevY >= 0) {
            ctx.fillStyle = "rgba(34, 211, 238, 0.65)";
            ctx.fillText(glyphs[(i * 3 + Math.floor(drop.y)) % glyphs.length], x, prevY);
          }
        }

        // Advance downward
        drop.y += drop.speed;

        // Loop column when it passes the bottom with randomized reset
        if (drop.y > maxRows && Math.random() > 0.96) {
          drop.y = Math.random() * -15;
          drop.speed = Math.random() * 0.35 + 0.25;
        }
      }
    };

    render(performance.now());

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* Full-bleed Matrix Canvas */}
      <canvas ref={canvasRef} className="w-full h-full opacity-60 mix-blend-screen" />

      {/* Subtle radial vignette to softly focus light toward the quantum core */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(3,7,18,0.6)_95%)] pointer-events-none" />

      {/* Container Cyber Edge Highlight */}
      <div className="absolute inset-0 border border-cyan-500/20 rounded-3xl pointer-events-none" />
    </div>
  );
};

export default MatrixSnowHUD;
