import React, { useState, useEffect } from "react";
import {
  X, Monitor, MousePointer, Keyboard, Terminal, Sparkles,
  RefreshCw, CheckCircle2, Play, ExternalLink, ShieldCheck,
  Maximize2, Crosshair, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DesktopStatus, GroundAndActResult } from "../services/desktopActuator";

interface ComputerUseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export default function ComputerUseDrawer({
  isOpen,
  onClose,
  onToast
}: ComputerUseDrawerProps) {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isLoadingShot, setIsLoadingShot] = useState(false);
  const [directive, setDirective] = useState("");
  const [isExecutingDirective, setIsExecutingDirective] = useState(false);
  const [lastExecution, setLastExecution] = useState<GroundAndActResult | null>(null);
  const [textToType, setTextToType] = useState("");
  const [launchTarget, setLaunchTarget] = useState("");

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/snow/actuator/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.warn("Failed to fetch actuator status:", e);
    }
  };

  const captureDesktopShot = async () => {
    setIsLoadingShot(true);
    try {
      const res = await fetch("/api/snow/actuator/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDim: 1280 })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          setScreenshot(data.image);
        }
      }
    } catch (e) {
      console.warn("Failed to capture desktop screenshot:", e);
    } finally {
      setIsLoadingShot(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      captureDesktopShot();
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleAutonomousGroundAndAct = async (directiveText?: string) => {
    const text = directiveText || directive;
    if (!text.trim() || isExecutingDirective) return;

    setIsExecutingDirective(true);
    onToast(`⚡ Snow analyzing desktop for: "${text}"...`);

    try {
      const res = await fetch("/api/snow/actuator/ground-and-act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directive: text.trim() })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Execution failed");
      }

      const data: GroundAndActResult = await res.json();
      setLastExecution(data);
      onToast(`🎯 Actuated '${data.targetElement}' at (${data.coordinates.x}, ${data.coordinates.y})`);
      fetchStatus();
      setTimeout(captureDesktopShot, 600);
      setDirective("");
    } catch (err: any) {
      onToast(`⚠️ Computer Use error: ${err.message}`);
    } finally {
      setIsExecutingDirective(false);
    }
  };

  const executeDirectAction = async (payload: any) => {
    try {
      const res = await fetch("/api/snow/actuator/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        onToast(`Dispatched ${payload.action}`);
        fetchStatus();
        setTimeout(captureDesktopShot, 500);
      }
    } catch (e: any) {
      onToast(`Action failed: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-cyan-500/20 bg-slate-950/90">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-400/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Monitor className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black tracking-widest text-white uppercase font-mono">
                    Snow Autonomous Computer Use
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-400/50 text-cyan-300 text-[10px] font-mono tracking-wider font-semibold">
                    100% LIVE OS ACTUATOR
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Display: {status?.display || ":0"} | Resolution: {status?.width || 1920}×{status?.height || 1080} | Pointer: ({status?.mouse.x || 0}, {status?.mouse.y || 0})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={captureDesktopShot}
                disabled={isLoadingShot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
                title="Refresh Screenshot"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingShot ? "animate-spin text-cyan-400" : ""}`} />
                <span>Snap</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                title="Close Computer Use"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* 1. Autonomous Multimodal Directive Input */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 via-slate-950/80 to-slate-900/60 border border-cyan-500/30 shadow-md space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1.5 text-cyan-300 font-bold uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" /> Autonomous Visual Grounding Directive
                </span>
                <span className="text-slate-400 text-[11px]">Gemini 2.5 Flash Screen Perception</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={directive}
                  onChange={(e) => setDirective(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAutonomousGroundAndAct()}
                  placeholder="e.g., 'Click the search bar in the top corner', 'Focus the terminal window', 'Click submit button'"
                  className="flex-1 bg-slate-950 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400 font-mono shadow-inner"
                />
                <button
                  onClick={() => handleAutonomousGroundAndAct()}
                  disabled={isExecutingDirective || !directive.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs transition cursor-pointer disabled:opacity-40 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isExecutingDirective ? "ACTUATING..." : "EXECUTE"}</span>
                </button>
              </div>

              {/* Quick Preset Directives */}
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  "Focus the active application window",
                  "Click the center of the screen",
                  "Launch the default web browser",
                  "Open a new terminal tab"
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleAutonomousGroundAndAct(preset)}
                    className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-cyan-950 border border-slate-700/60 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 transition cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Live Desktop Viewport with Target Reticle */}
            <div className="relative rounded-xl border border-cyan-500/20 bg-black overflow-hidden shadow-inner flex flex-col items-center">
              <div className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Monitor className="w-3.5 h-3.5" /> Desktop Display Viewport
                </span>
                <span>1920×1080 Native Frame</span>
              </div>

              <div className="relative w-full max-h-[380px] flex items-center justify-center bg-slate-950 overflow-hidden">
                {screenshot ? (
                  <div className="relative inline-block max-w-full">
                    <img
                      src={screenshot}
                      alt="Live Desktop Frame"
                      className="max-h-[380px] w-auto object-contain select-none"
                    />

                    {/* Live Pointer Overlay Reticle */}
                    {status && (
                      <div
                        className="absolute pointer-events-none transition-all duration-150"
                        style={{
                          left: `${(status.mouse.x / status.width) * 100}%`,
                          top: `${(status.mouse.y / status.height) * 100}%`,
                          transform: "translate(-50%, -50%)"
                        }}
                      >
                        <div className="w-4 h-4 rounded-full border-2 border-cyan-400 bg-cyan-400/20 animate-ping" />
                        <MousePointer className="w-4 h-4 text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                      </div>
                    )}

                    {/* Target Coordinate Reticle if just actuated */}
                    {lastExecution && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: `${(lastExecution.coordinates.x / (status?.width || 1920)) * 100}%`,
                          top: `${(lastExecution.coordinates.y / (status?.height || 1080)) * 100}%`,
                          transform: "translate(-50%, -50%)"
                        }}
                      >
                        <div className="w-8 h-8 rounded-full border-2 border-amber-400 bg-amber-400/20 animate-pulse" />
                        <Crosshair className="w-5 h-5 text-amber-300 -mt-6 -ml-0.5" />
                        <span className="absolute left-6 top-0 px-2 py-0.5 rounded bg-slate-950/90 border border-amber-400/60 text-amber-300 font-mono text-[9px] whitespace-nowrap shadow-md">
                          {lastExecution.targetElement} ({lastExecution.coordinates.x}, {lastExecution.coordinates.y})
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 font-mono text-xs">
                    <Monitor className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse" />
                    <span>Capturing live desktop snapshot...</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Direct Actuation Action Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Mouse Controls */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-cyan-400">
                  <MousePointer className="w-3.5 h-3.5" /> Pointer & Click Controls
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => executeDirectAction({ action: "click" })}
                    className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-200 text-xs font-mono transition cursor-pointer"
                  >
                    Left Click
                  </button>
                  <button
                    onClick={() => executeDirectAction({ action: "double_click" })}
                    className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-200 text-xs font-mono transition cursor-pointer"
                  >
                    Double Click
                  </button>
                  <button
                    onClick={() => executeDirectAction({ action: "right_click" })}
                    className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-200 text-xs font-mono transition cursor-pointer"
                  >
                    Right Click
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    onClick={() => executeDirectAction({ action: "move", x: 960, y: 540 })}
                    className="py-1 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-400 hover:text-cyan-300 transition"
                  >
                    Center Cursor
                  </button>
                  <button
                    onClick={() => executeDirectAction({ action: "scroll", amount: -8 })}
                    className="py-1 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-400 hover:text-cyan-300 transition"
                  >
                    Scroll Down
                  </button>
                </div>
              </div>

              {/* Keyboard Typing & Hotkeys */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-emerald-400">
                  <Keyboard className="w-3.5 h-3.5" /> Type into Active Window
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={textToType}
                    onChange={(e) => setTextToType(e.target.value)}
                    placeholder="Text to type..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none font-mono"
                  />
                  <button
                    onClick={() => {
                      if (textToType.trim()) {
                        executeDirectAction({ action: "type", text: textToType, press_enter: true });
                        setTextToType("");
                      }
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Type
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: "Super", keys: ["super"] },
                    { label: "Alt+Tab", keys: ["alt", "tab"] },
                    { label: "Ctrl+T", keys: ["ctrl", "t"] },
                    { label: "Ctrl+C", keys: ["ctrl", "c"] }
                  ].map((h) => (
                    <button
                      key={h.label}
                      onClick={() => executeDirectAction({ action: "hotkey", keys: h.keys })}
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-emerald-300 transition"
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* App & URL Launcher */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-purple-400">
                  <ExternalLink className="w-3.5 h-3.5" /> Launch App or URL
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={launchTarget}
                    onChange={(e) => setLaunchTarget(e.target.value)}
                    placeholder="URL or app command..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none font-mono"
                  />
                  <button
                    onClick={() => {
                      if (launchTarget.trim()) {
                        executeDirectAction({ action: "launch", target: launchTarget });
                        setLaunchTarget("");
                      }
                    }}
                    className="px-3 py-1 rounded-lg bg-purple-950 hover:bg-purple-900 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Open
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: "GitHub", target: "https://github.com" },
                    { label: "Terminal", target: "gnome-terminal" },
                    { label: "Files", target: "/home/snowjd" }
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => executeDirectAction({ action: "launch", target: item.target })}
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-purple-300 transition"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Latest Grounding Audit Log */}
            {lastExecution && (
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-mono space-y-1.5">
                <div className="flex items-center justify-between text-cyan-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Grounding Telemetry Audit Log
                  </span>
                  <span className="text-slate-500">{new Date(lastExecution.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Directive:</span> "{lastExecution.directive}" ➔ Target: <span className="text-amber-300 font-bold">{lastExecution.targetElement}</span> at ({lastExecution.coordinates.x}px, {lastExecution.coordinates.y}px)
                </div>
                <p className="text-slate-400 text-[11px] italic">
                  "{lastExecution.auditExplanation}"
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
