import React, { useEffect, useRef } from "react";

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  opacity: number;
  swaySpeed: number;
  swayOffset: number;
}

export const SnowfallBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Mouse drift effect
    let mouseX = width / 2;
    let mouseY = height / 2;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Create 70 procedural snowflakes
    const numFlakes = 70;
    const flakes: Snowflake[] = Array.from({ length: numFlakes }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.5 + 0.8,
      speedY: Math.random() * 0.8 + 0.3,
      speedX: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.6 + 0.25,
      swaySpeed: Math.random() * 0.02 + 0.005,
      swayOffset: Math.random() * Math.PI * 2
    }));

    let frame = 0;
    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      flakes.forEach((flake) => {
        // Update positions with sine-wave sway
        flake.swayOffset += flake.swaySpeed;
        const currentSway = Math.sin(flake.swayOffset) * 0.5;

        // Subtle mouse breeze influence
        const dx = flake.x - mouseX;
        const dy = flake.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let breezeX = 0;
        if (dist < 180) {
          breezeX = (dx / dist) * 0.6 * (1 - dist / 180);
        }

        flake.y += flake.speedY;
        flake.x += flake.speedX + currentSway + breezeX;

        // Wrap around edges
        if (flake.y > height + 10) {
          flake.y = -10;
          flake.x = Math.random() * width;
        }
        if (flake.x > width + 10) flake.x = -10;
        if (flake.x < -10) flake.x = width + 10;

        // Draw soft glowing snowflake particle
        ctx.save();
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);

        // Cyber cyan-tinted glowing gradient fill
        const gradient = ctx.createRadialGradient(
          flake.x, flake.y, 0,
          flake.x, flake.y, flake.radius * 2
        );
        gradient.addColorStop(0, `rgba(224, 242, 254, ${flake.opacity})`);
        gradient.addColorStop(0.5, `rgba(56, 189, 248, ${flake.opacity * 0.6})`);
        gradient.addColorStop(1, "rgba(14, 165, 233, 0)");

        ctx.fillStyle = gradient;
        ctx.shadowColor = "rgba(56, 189, 248, 0.6)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
    />
  );
};

export default SnowfallBackground;
