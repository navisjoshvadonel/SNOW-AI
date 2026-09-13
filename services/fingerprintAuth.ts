/**
 * SNOW AI — Biometric Authentication Service (Hardened Security & Stability)
 * Uses Linux fprintd (libfprint) to verify NJ's fingerprint.
 * Features:
 * - Singleton sensor lock with clean SIGINT device release
 * - AbortSignal integration to cancel spawned processes on client disconnect
 * - Constant-time SHA-256 comparison for Master Passcode (timing-attack resistant)
 * - Anti-brute-force rate limiting with cooldowns
 * - JWT session tokens with 12h expiration
 */

import { spawn, ChildProcess } from "child_process";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// ─── JWT Secret ───────────────────────────────────────────────────────────────
const JWT_SECRET =
  process.env.SNOW_AUTH_SECRET ||
  crypto.randomBytes(48).toString("hex");

const AUTHORIZED_USER = process.env.SNOW_AUTH_USER || process.env.USER || "snowjd";
const MASTER_PIN = process.env.SNOW_AUTH_PIN || "2026";

// ─── Rate Limiting & Security Defenses ───────────────────────────────────────
interface RateLimitState {
  attempts: number;
  lockedUntil: number;
}

const fingerprintAttempts = new Map<string, RateLimitState>();
const passcodeAttempts = new Map<string, RateLimitState>();

export function checkRateLimit(type: "fingerprint" | "passcode", key: string = "global"): { allowed: boolean; retryAfter?: number } {
  const map = type === "fingerprint" ? fingerprintAttempts : passcodeAttempts;
  const now = Date.now();
  const state = map.get(key);

  if (state && state.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((state.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailedAttempt(type: "fingerprint" | "passcode", key: string = "global"): { locked: boolean; retryAfter?: number } {
  const map = type === "fingerprint" ? fingerprintAttempts : passcodeAttempts;
  const maxAttempts = type === "fingerprint" ? 5 : 5;
  const lockDurationMs = type === "fingerprint" ? 30_000 : 60_000;
  const now = Date.now();

  let state = map.get(key);
  // Reset attempts if previous lock expired
  if (state && state.lockedUntil > 0 && state.lockedUntil <= now) {
    state = undefined;
  }

  if (!state) {
    state = { attempts: 1, lockedUntil: 0 };
  } else {
    state.attempts += 1;
  }

  if (state.attempts >= maxAttempts) {
    state.lockedUntil = now + lockDurationMs;
    map.set(key, state);
    return { locked: true, retryAfter: Math.ceil(lockDurationMs / 1000) };
  }

  map.set(key, state);
  return { locked: false };
}

export function resetRateLimit(type: "fingerprint" | "passcode", key: string = "global"): void {
  const map = type === "fingerprint" ? fingerprintAttempts : passcodeAttempts;
  map.delete(key);
}

// ─── Timing-Safe Passcode Verification ────────────────────────────────────────
export function verifyPasscode(pin: string): boolean {
  if (!pin || typeof pin !== "string") return false;
  try {
    const inputHash = crypto.createHash("sha256").update(pin.trim()).digest();
    const masterHash = crypto.createHash("sha256").update(MASTER_PIN.trim()).digest();
    return crypto.timingSafeEqual(inputHash, masterHash);
  } catch {
    return false;
  }
}

// ─── Biometric Sensor Singleton Lifecycle ────────────────────────────────────

export interface VerifyResult {
  matched: boolean;
  status: "matched" | "no_match" | "timeout" | "device_claimed" | "no_device" | "error" | "cancelled";
  message?: string;
}

let activeVerifyChild: ChildProcess | null = null;
let activeVerifyPromise: Promise<VerifyResult> | null = null;

export function cancelActiveVerification(): void {
  if (activeVerifyChild) {
    try {
      activeVerifyChild.kill("SIGINT");
    } catch {}
    activeVerifyChild = null;
    activeVerifyPromise = null;
  }
}

/**
 * Runs `fprintd-verify <user>` with singleton sensor management,
 * timeout watchdog, and clean release.
 */
export function verifyFingerprint(username: string = AUTHORIZED_USER, signal?: AbortSignal): Promise<VerifyResult> {
  // If an active verification is already in flight, reuse the promise
  if (activeVerifyPromise) {
    return activeVerifyPromise;
  }

  activeVerifyPromise = new Promise<VerifyResult>((resolve) => {
    let resolved = false;
    const finish = (res: VerifyResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      activeVerifyChild = null;
      activeVerifyPromise = null;
      resolve(res);
    };

    // 25s timeout
    const timer = setTimeout(() => {
      console.warn("[FINGERPRINT] Verification watchdog: timeout reached (25s)");
      if (activeVerifyChild) {
        try { activeVerifyChild.kill("SIGINT"); } catch {}
      }
      finish({ matched: false, status: "timeout", message: "Sensor scan timed out — click to reactivate" });
    }, 25_000);

    const child = spawn("fprintd-verify", [username], { stdio: ["ignore", "pipe", "pipe"] });
    activeVerifyChild = child;

    if (signal) {
      signal.addEventListener("abort", () => {
        console.log("[FINGERPRINT] Client connection closed — aborting fprintd-verify");
        try { child.kill("SIGINT"); } catch {}
        finish({ matched: false, status: "cancelled", message: "Verification cancelled" });
      });
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      console.log(`[FINGERPRINT stdout]: ${chunk.trim()}`);
    });

    child.stderr.on("data", (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      console.warn(`[FINGERPRINT stderr]: ${chunk.trim()}`);
    });

    child.on("close", (code: number | null, signalStr: string | null) => {
      const combined = (stdout + " " + stderr).toLowerCase();
      console.log(`[FINGERPRINT] Process closed code=${code} signal=${signalStr}`);

      if (signalStr === "SIGINT" || signalStr === "SIGTERM") {
        finish({ matched: false, status: "cancelled", message: "Verification cancelled" });
        return;
      }

      if (combined.includes("verify-match")) {
        finish({ matched: true, status: "matched", message: "Identity verified" });
      } else if (combined.includes("verify-no-match")) {
        finish({ matched: false, status: "no_match", message: "Fingerprint did not match" });
      } else if (combined.includes("already claimed")) {
        finish({ matched: false, status: "device_claimed", message: "Sensor claimed by another process" });
      } else if (combined.includes("no devices available")) {
        finish({ matched: false, status: "no_device", message: "No biometric sensor available" });
      } else if (code === 0) {
        finish({ matched: true, status: "matched", message: "Identity verified" });
      } else {
        finish({ matched: false, status: "error", message: stderr.trim() || stdout.trim() || "Sensor read failed" });
      }
    });

    child.on("error", (err: Error) => {
      console.error("[FINGERPRINT] Spawn error:", err.message);
      finish({ matched: false, status: "error", message: err.message });
    });
  });

  return activeVerifyPromise;
}

// ─── Session Tokens ───────────────────────────────────────────────────────────

export interface SnowSession {
  user: string;
  method: "fingerprint" | "passcode";
  iat: number;
}

export function issueSessionToken(username: string = AUTHORIZED_USER, method: "fingerprint" | "passcode" = "fingerprint"): string {
  const payload: SnowSession = {
    user: username,
    method,
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function validateSessionToken(token: string): SnowSession | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SnowSession;
  } catch {
    return null;
  }
}

// ─── Express Middleware ────────────────────────────────────────────────────────

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = (req.headers["authorization"] || req.headers["x-snow-token"]) as string | undefined;
  let token: string | undefined;

  if (authHeader) {
    token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required", code: "NO_TOKEN" });
    return;
  }

  const session = validateSessionToken(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session", code: "INVALID_TOKEN" });
    return;
  }

  (req as any).snowSession = session;
  next();
}
