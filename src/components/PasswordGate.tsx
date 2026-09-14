import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Unlock, Eye, EyeOff, ShieldAlert, KeyRound, ArrowRight, Loader2 } from "lucide-react";

interface PasswordGateProps {
  onAuthenticated: (token: string) => void;
}

export default function PasswordGate({ onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setErrorMessage("");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Caps Lock detection
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockActive(e.getModifierState("CapsLock"));
    if (e.key === "Enter" && !isLoading && cooldown === 0) {
      handleSubmit();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockActive(e.getModifierState("CapsLock"));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim() || isLoading || cooldown > 0) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        setIsUnlocked(true);
        sessionStorage.setItem("snow_auth_token", data.token);
        setTimeout(() => {
          onAuthenticated(data.token);
        }, 900);
      } else if (res.status === 429) {
        const wait = data.retryAfter || 60;
        setCooldown(wait);
        setErrorMessage(`Security lockout active. Retry in ${wait}s`);
      } else if (res.status === 403) {
        if (data.locked) {
          setCooldown(data.retryAfter || 60);
          setErrorMessage("Too many failed attempts. System locked for 60 seconds.");
        } else {
          setErrorMessage("Incorrect password. Access denied.");
          if (typeof data.attemptsRemaining === "number") {
            setAttemptsRemaining(data.attemptsRemaining);
          }
        }
        // Shake input and re-select
        inputRef.current?.select();
      } else {
        setErrorMessage(data.error || "Authentication failed. Try again.");
      }
    } catch {
      setErrorMessage("Network error: Unable to reach Snow AI authorization server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="password-gate"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, #0c182b 0%, #040914 60%, #01040a 100%)",
        }}
      >
        {/* Ambient Grid Layer */}
        <div
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage: `
              linear-gradient(rgba(100,180,255,0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(100,180,255,0.4) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
          }}
        />

        {/* Ambient floating particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: i % 2 === 0 ? 3 : 2,
              height: i % 2 === 0 ? 3 : 2,
              background: "rgba(100,200,255,0.5)",
              top: `${12 + i * 9}%`,
              left: `${10 + (i * 11) % 80}%`,
            }}
            animate={{
              y: [-12, 12, -12],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{
              duration: 3.5 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Outer Glow Halo */}
        <div
          className="absolute w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{
            background: isUnlocked
              ? "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(59,130,246,0.05) 45%, transparent 70%)",
            filter: "blur(40px)",
            transition: "all 0.8s ease",
          }}
        />

        {/* Main Terminal Card */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-full max-w-md mx-4 p-8 sm:p-10 rounded-2xl flex flex-col items-center"
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            border: isUnlocked
              ? "1px solid rgba(16,185,129,0.4)"
              : "1px solid rgba(100, 180, 255, 0.18)",
            backdropFilter: "blur(28px)",
            boxShadow: isUnlocked
              ? "0 0 70px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.1)"
              : "0 0 60px rgba(0, 140, 255, 0.1), 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            transition: "all 0.5s ease",
          }}
        >
          {/* Tech Corner Accent Marks */}
          <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-400/50 rounded-tl-sm pointer-events-none" />
          <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-400/50 rounded-tr-sm pointer-events-none" />
          <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-400/50 rounded-bl-sm pointer-events-none" />
          <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-400/50 rounded-br-sm pointer-events-none" />

          {/* Header & Logo */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[10px] tracking-[0.35em] font-semibold text-cyan-400/80 uppercase">
                Snow Intelligence System
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-cyan-200 to-blue-400">
              SECURITY CLEARANCE
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-mono tracking-wide">
              Authorized Personnel Access Gateway
            </p>
          </div>

          {/* Holographic Center Icon Node */}
          <div className="relative mb-6 flex items-center justify-center">
            {/* Outer animated spinning halo */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute w-24 h-24 rounded-full border border-cyan-500/20 border-t-cyan-400/60 border-dashed"
            />
            {/* Center circular badge */}
            <motion.div
              animate={
                isUnlocked
                  ? { scale: [1, 1.12, 1] }
                  : errorMessage
                  ? { x: [-6, 6, -5, 5, 0] }
                  : {}
              }
              transition={{ duration: 0.4 }}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-500 ${
                isUnlocked
                  ? "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                  : errorMessage
                  ? "bg-rose-500/20 border-2 border-rose-400 text-rose-300 shadow-[0_0_30px_rgba(244,63,94,0.3)]"
                  : "bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.2)]"
              }`}
            >
              <AnimatePresence mode="wait">
                {isUnlocked ? (
                  <motion.div
                    key="unlocked"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <Unlock size={28} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="locked"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <Lock size={26} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="relative">
              {/* Input Icon */}
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400/60 pointer-events-none">
                <KeyRound size={17} />
              </div>

              {/* Password Input */}
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                placeholder="Enter access password"
                value={password}
                disabled={isLoading || cooldown > 0 || isUnlocked}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                className="w-full pl-10 pr-11 py-3 bg-slate-900/80 border border-slate-700/80 focus:border-cyan-400/70 rounded-xl text-white placeholder-slate-500 text-sm tracking-wider font-mono outline-none transition-all duration-200 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
                autoComplete="current-password"
              />

              {/* Show/Hide Password Button */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-300 transition-colors focus:outline-none"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Caps Lock Warning */}
            <AnimatePresence>
              {capsLockActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-1.5 text-[11px] text-amber-400 font-mono pl-1"
                >
                  <ShieldAlert size={13} />
                  <span>Caps Lock is ON</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error or Cooldown Banner */}
            <AnimatePresence>
              {(errorMessage || cooldown > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs text-center font-mono"
                >
                  <div>{errorMessage}</div>
                  {cooldown > 0 && (
                    <div className="text-[11px] text-rose-400/80 mt-1 font-semibold">
                      Cooldown: {cooldown}s remaining
                    </div>
                  )}
                  {attemptsRemaining !== null && attemptsRemaining > 0 && cooldown === 0 && (
                    <div className="text-[11px] text-amber-400/90 mt-1">
                      {attemptsRemaining} attempt{attemptsRemaining > 1 ? "s" : ""} remaining before lockout
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !password.trim() || cooldown > 0 || isUnlocked}
              className={`w-full py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
                isUnlocked
                  ? "bg-emerald-500 text-white shadow-emerald-500/30 cursor-default"
                  : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.99] text-white shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : isUnlocked ? (
                <>
                  <Unlock size={16} />
                  <span>Access Granted — Initializing</span>
                </>
              ) : (
                <>
                  <span>Authenticate</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 text-center">
            <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
              ENCRYPTED SESSION · 12H AUTHORIZATION
            </span>
          </div>
        </motion.div>

        {/* Bottom branding */}
        <div className="absolute bottom-4 text-[10px] tracking-widest text-cyan-500/40 uppercase font-mono">
          Snow AI Core OS · Password Gate v2.0
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
