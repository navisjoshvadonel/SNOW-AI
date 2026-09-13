import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Fingerprint, ShieldCheck, AlertTriangle, Lock, Eye, KeyRound } from "lucide-react";

type GateState = "idle" | "waiting" | "scanning" | "success" | "error" | "denied" | "timeout";

interface FingerprintGateProps {
  onAuthenticated: (token: string) => void;
}

const STATUS_MSG: Record<GateState, string> = {
  idle:     "Click or touch sensor to authenticate",
  waiting:  "Sensor active — touch laptop sensor now",
  scanning: "Verifying fingerprint...",
  success:  "Identity verified — welcome NJ",
  error:    "Sensor error — tap to retry",
  denied:   "Fingerprint not recognized",
  timeout:  "Scan timed out — tap to reactivate",
};

export default function FingerprintGate({ onAuthenticated }: FingerprintGateProps) {
  const [state, setState] = useState<GateState>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  // Master Passcode Fallback state
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [passcodeLoading, setPasscodeLoading] = useState(false);

  // Countdown after too many failed attempts
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(t); setState("idle"); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const triggerScan = useCallback(async () => {
    if (cooldown > 0) return;

    setState("waiting");
    setStatusDetail("Sensor armed — place your finger on the sensor");

    const ac = new AbortController();

    try {
      const res = await fetch("/api/auth/fingerprint", {
        method: "POST",
        signal: ac.signal,
      });
      const data = await res.json();

      if (res.ok && data.token) {
        setState("success");
        setStatusDetail("Identity verified");
        setShowSuccess(true);
        sessionStorage.setItem("snow_auth_token", data.token);
        setTimeout(() => onAuthenticated(data.token), 1200);
      } else if (res.status === 408 || data.status === "timeout") {
        setState("timeout");
        setStatusDetail("Sensor timed out — tap ring to scan again");
      } else if (res.status === 429) {
        setState("denied");
        setCooldown(data.retryAfter || 30);
        setStatusDetail(`Security lockout active. Retry in ${data.retryAfter || 30}s`);
      } else if (res.status === 403) {
        // Wrong fingerprint
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= 3 || data.locked) {
          setState("denied");
          setCooldown(data.retryAfter || 30);
          setStatusDetail("Too many failed attempts. Cooldown initiated.");
        } else {
          setState("denied");
          setStatusDetail("Fingerprint not recognized — please try again");
          setTimeout(() => {
            setState("idle");
            setStatusDetail("");
          }, 2500);
        }
      } else if (res.status === 503) {
        setState("error");
        setStatusDetail("Sensor hardware not found. Use Master Passcode below.");
        setShowPasscodeModal(true);
      } else {
        setState("error");
        setStatusDetail(data.error || "Sensor error — tap to retry");
        setTimeout(() => setState("idle"), 2500);
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setState("error");
      setStatusDetail("Connection error — tap to retry");
      setTimeout(() => setState("idle"), 2500);
    }
  }, [cooldown, attempts, onAuthenticated]);

  // Auto-arm sensor on initial mount
  useEffect(() => {
    const timer = setTimeout(() => {
      triggerScan();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || passcodeLoading) return;
    setPasscodeLoading(true);
    setPasscodeError("");
    try {
      const res = await fetch("/api/auth/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setState("success");
        setStatusDetail("Passcode accepted — unlocking");
        setShowSuccess(true);
        sessionStorage.setItem("snow_auth_token", data.token);
        setTimeout(() => onAuthenticated(data.token), 1000);
      } else if (res.status === 429) {
        setPasscodeError(`Too many attempts. Locked for ${data.retryAfter || 60}s`);
      } else {
        setPasscodeError(data.error || "Incorrect passcode");
      }
    } catch {
      setPasscodeError("Connection failed");
    } finally {
      setPasscodeLoading(false);
    }
  };

  const isClickable = (state === "idle" || state === "timeout" || state === "error") && cooldown === 0;

  return (
    <AnimatePresence>
      <motion.div
        key="gate"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4 }}
        className="fingerprint-gate"
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 30%, #0d1a2e 0%, #050c18 60%, #020810 100%)",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        {/* Ambient background grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: `
            linear-gradient(rgba(100,180,255,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(100,180,255,0.4) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }} />

        {/* Top particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div key={i} style={{
            position: "absolute", width: 2, height: 2, borderRadius: "50%",
            background: "rgba(100,200,255,0.6)",
            top: `${10 + i * 8}%`, left: `${15 + i * 13}%`,
          }}
            animate={{ y: [-10, 10, -10], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 3 + i * 0.7, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* Centered card */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 32,
            padding: "56px 64px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(100,180,255,0.12)",
            borderRadius: 24,
            backdropFilter: "blur(24px)",
            boxShadow: "0 0 80px rgba(0,120,255,0.06), 0 0 200px rgba(0,80,200,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
            position: "relative",
          }}
        >
          {/* Top corner accent lines */}
          <div style={{
            position: "absolute", top: 16, left: 16, width: 24, height: 24,
            borderTop: "2px solid rgba(100,200,255,0.4)",
            borderLeft: "2px solid rgba(100,200,255,0.4)",
            borderRadius: "4px 0 0 0",
          }} />
          <div style={{
            position: "absolute", top: 16, right: 16, width: 24, height: 24,
            borderTop: "2px solid rgba(100,200,255,0.4)",
            borderRight: "2px solid rgba(100,200,255,0.4)",
            borderRadius: "0 4px 0 0",
          }} />
          <div style={{
            position: "absolute", bottom: 16, left: 16, width: 24, height: 24,
            borderBottom: "2px solid rgba(100,200,255,0.4)",
            borderLeft: "2px solid rgba(100,200,255,0.4)",
            borderRadius: "0 0 0 4px",
          }} />
          <div style={{
            position: "absolute", bottom: 16, right: 16, width: 24, height: 24,
            borderBottom: "2px solid rgba(100,200,255,0.4)",
            borderRight: "2px solid rgba(100,200,255,0.4)",
            borderRadius: "0 0 4px 0",
          }} />

          {/* SNOW logo / wordmark */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 11, letterSpacing: "0.35em", fontWeight: 600,
              color: "rgba(100,180,255,0.5)", textTransform: "uppercase",
              marginBottom: 6,
            }}>
              SNOW AI — ACCESS CONTROL
            </div>
            <div style={{
              fontSize: 28, fontWeight: 700, letterSpacing: "0.08em",
              background: "linear-gradient(135deg, #e0f0ff 0%, #a0c8ff 60%, #6090e0 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              BIOMETRIC LOCK
            </div>
          </div>

          {/* Fingerprint sensor button */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Outer slow pulse ring — only when idle */}
            {isClickable && (
              <motion.div
                animate={{ scale: [1, 1.18, 1], opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  position: "absolute", width: 160, height: 160, borderRadius: "50%",
                  border: "1px solid rgba(100,180,255,0.5)",
                }}
              />
            )}

            {/* Middle ring */}
            {(state === "scanning" || state === "waiting") && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                style={{
                  position: "absolute", width: 148, height: 148, borderRadius: "50%",
                  border: "2px solid transparent",
                  borderTopColor: "rgba(100,200,255,0.9)",
                  borderRightColor: "rgba(60,140,255,0.5)",
                }}
              />
            )}

            {/* Success ring */}
            {state === "success" && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.15, opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{
                  position: "absolute", width: 148, height: 148, borderRadius: "50%",
                  border: "2px solid rgba(80,220,160,0.7)",
                }}
              />
            )}

            {/* Main button */}
            <motion.button
              onClick={triggerScan}
              disabled={!isClickable}
              whileHover={isClickable ? { scale: 1.06 } : {}}
              whileTap={isClickable ? { scale: 0.96 } : {}}
              style={{
                width: 120, height: 120, borderRadius: "50%",
                background: getButtonBg(state),
                border: getButtonBorder(state),
                cursor: isClickable ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", overflow: "hidden",
                boxShadow: getButtonGlow(state),
                transition: "all 0.4s ease",
                outline: "none",
              }}
            >
              {/* Scan sweep animation */}
              {(state === "scanning") && (
                <motion.div
                  animate={{ y: [-60, 60] }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                  style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to bottom, transparent 40%, rgba(100,200,255,0.2) 50%, transparent 60%)",
                  }}
                />
              )}

              {/* Icon */}
              <AnimatePresence mode="wait">
                {state === "success" ? (
                  <motion.div key="ok"
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                    <ShieldCheck size={48} color="rgba(80,220,160,0.9)" strokeWidth={1.5} />
                  </motion.div>
                ) : state === "denied" ? (
                  <motion.div key="denied"
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}>
                    <Lock size={44} color="rgba(255,80,80,0.9)" strokeWidth={1.5} />
                  </motion.div>
                ) : state === "error" ? (
                  <motion.div key="err"
                    animate={{ rotate: [0, -8, 8, -8, 0] }}
                    transition={{ duration: 0.4 }}>
                    <AlertTriangle size={44} color="rgba(255,180,0,0.9)" strokeWidth={1.5} />
                  </motion.div>
                ) : (
                  <motion.div key="fp"
                    animate={state === "scanning" ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
                    transition={{ duration: 0.6, repeat: state === "scanning" ? Infinity : 0 }}>
                    <Fingerprint
                      size={52}
                      color={state === "waiting" || state === "scanning" ? "rgba(120,200,255,0.95)" : "rgba(100,180,255,0.7)"}
                      strokeWidth={1.5}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* Status message */}
          <div style={{ textAlign: "center", minHeight: 44 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={state + cooldown}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                {cooldown > 0 ? (
                  <div>
                    <div style={{ color: "rgba(255,80,80,0.9)", fontSize: 14, fontWeight: 500 }}>
                      Too many failed attempts
                    </div>
                    <div style={{ color: "rgba(255,120,120,0.6)", fontSize: 12, marginTop: 4 }}>
                      Retry in {cooldown}s
                    </div>
                  </div>
                ) : (
                  <div style={{ color: getStatusColor(state), fontSize: 14, fontWeight: 500, letterSpacing: "0.02em" }}>
                    {statusDetail || STATUS_MSG[state]}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Attempt counter */}
            {attempts > 0 && attempts < 3 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ color: "rgba(255,140,80,0.7)", fontSize: 11, marginTop: 6 }}>
                {3 - attempts} attempt{3 - attempts !== 1 ? "s" : ""} remaining
              </motion.div>
            )}
          </div>

          {/* Bottom info strip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "rgba(100,150,200,0.35)", fontSize: 10, letterSpacing: "0.06em",
          }}>
            <Eye size={10} />
            <span>AUTHORIZED PERSONNEL ONLY · NJ</span>
          </div>

          {/* Master Passcode Fallback Toggle */}
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {!showPasscodeModal ? (
              <button
                type="button"
                onClick={() => setShowPasscodeModal(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(100,180,255,0.6)",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 6,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(140,210,255,0.95)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(100,180,255,0.6)")}
              >
                <KeyRound size={12} />
                <span>Use Master Passcode</span>
              </button>
            ) : (
              <form onSubmit={handlePasscodeSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="password"
                    placeholder="Enter PIN / Passcode"
                    value={passcode}
                    onChange={e => setPasscode(e.target.value)}
                    autoFocus
                    style={{
                      background: "rgba(10,25,45,0.8)",
                      border: "1px solid rgba(100,180,255,0.3)",
                      borderRadius: 6,
                      color: "#fff",
                      padding: "6px 10px",
                      fontSize: 12,
                      outline: "none",
                      width: 150,
                      textAlign: "center",
                      letterSpacing: "0.1em",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={passcodeLoading || !passcode}
                    style={{
                      background: "rgba(30,100,200,0.6)",
                      border: "1px solid rgba(100,180,255,0.4)",
                      borderRadius: 6,
                      color: "#fff",
                      fontSize: 11,
                      padding: "6px 12px",
                      cursor: "pointer",
                    }}
                  >
                    {passcodeLoading ? "..." : "Unlock"}
                  </button>
                </div>
                {passcodeError && (
                  <div style={{ color: "rgba(255,100,100,0.85)", fontSize: 11 }}>{passcodeError}</div>
                )}
                <button
                  type="button"
                  onClick={() => { setShowPasscodeModal(false); setPasscodeError(""); }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(150,160,180,0.5)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </motion.div>

        {/* Bottom version tag */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          style={{
            position: "absolute", bottom: 24,
            color: "rgba(60,100,160,0.4)", fontSize: 10, letterSpacing: "0.12em",
          }}>
          SNOW INTELLIGENCE SYSTEM · BIOMETRIC AUTH v1.0
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Style helpers ─────────────────────────────────────────────────────────────

function getButtonBg(state: GateState): string {
  switch (state) {
    case "success": return "radial-gradient(circle, rgba(40,100,70,0.5) 0%, rgba(20,50,40,0.4) 100%)";
    case "denied":  return "radial-gradient(circle, rgba(100,30,30,0.5) 0%, rgba(60,20,20,0.4) 100%)";
    case "error":   return "radial-gradient(circle, rgba(100,70,0,0.5) 0%, rgba(60,40,0,0.4) 100%)";
    case "scanning":
    case "waiting": return "radial-gradient(circle, rgba(20,50,100,0.6) 0%, rgba(10,25,60,0.5) 100%)";
    case "timeout": return "radial-gradient(circle, rgba(30,50,80,0.5) 0%, rgba(15,25,45,0.4) 100%)";
    default:        return "radial-gradient(circle, rgba(15,35,70,0.5) 0%, rgba(8,18,40,0.4) 100%)";
  }
}

function getButtonBorder(state: GateState): string {
  switch (state) {
    case "success": return "2px solid rgba(80,220,160,0.6)";
    case "denied":  return "2px solid rgba(255,80,80,0.6)";
    case "error":   return "2px solid rgba(255,180,0,0.6)";
    case "scanning":
    case "waiting": return "2px solid rgba(100,200,255,0.7)";
    case "timeout": return "2px solid rgba(120,180,220,0.4)";
    default:        return "2px solid rgba(80,140,220,0.3)";
  }
}

function getButtonGlow(state: GateState): string {
  switch (state) {
    case "success": return "0 0 40px rgba(80,220,160,0.25), 0 0 80px rgba(40,180,120,0.12)";
    case "denied":  return "0 0 40px rgba(255,60,60,0.2)";
    case "scanning":
    case "waiting": return "0 0 40px rgba(100,180,255,0.25), 0 0 80px rgba(60,120,220,0.12)";
    case "timeout": return "0 0 25px rgba(80,140,220,0.15)";
    default:        return "0 0 20px rgba(60,100,200,0.1)";
  }
}

function getStatusColor(state: GateState): string {
  switch (state) {
    case "success": return "rgba(80,220,160,0.9)";
    case "denied":  return "rgba(255,100,100,0.9)";
    case "error":   return "rgba(255,180,50,0.9)";
    case "scanning":
    case "waiting": return "rgba(120,200,255,0.95)";
    case "timeout": return "rgba(150,200,240,0.85)";
    default:        return "rgba(120,160,220,0.7)";
  }
}
