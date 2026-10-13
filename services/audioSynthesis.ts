/**
 * SNOW AI — High-Fidelity S.N.O.W. Audio Synthesis & Dynamic Prosody Service
 * Modulates pitch, speaking rate, and cadence according to contextual urgency.
 *
 * Voice engine priority:
 *   1. edge-tts (Microsoft Neural) + gst-play-1.0  → richest quality
 *   2. edge-tts + aplay (via PCM pipe)              → fallback if gst missing
 *   3. spd-say (legacy Linux speech daemon)          → last resort
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { mkdir, readFile, unlink, access } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { voiceDuplex } from "./voiceDuplex";

const execAsync = promisify(exec);

export type AudioUrgency = "calm" | "alert" | "emergency";

export interface SynthesizedAudioResult {
  text: string;
  urgency: AudioUrgency;
  rate: number;
  pitch: number;
  ssml: string;
  audioBase64?: string;
  mimeType?: string;
  dispatchedToNativeLinux: boolean;
  engine: "edge-tts+gst" | "edge-tts+aplay" | "edge-tts+mp3" | "spd-say" | "piper+gst" | "piper+aplay" | "cached" | "none";
  cached?: boolean;
  timestamp: string;
}

const CACHE_DIR = join(process.cwd(), "data", "tts_cache");
try {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
} catch {}

// ─── Utility: spawn a child process and wait for exit ─────────────────────────
function spawnAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

// ─── Detect which playback tool is available (cached after first call) ─────────
let _gstAvailable: boolean | null = null;
async function hasGstPlay(): Promise<boolean> {
  if (_gstAvailable !== null) return _gstAvailable;
  try {
    await execAsync("which gst-play-1.0");
    _gstAvailable = true;
  } catch {
    _gstAvailable = false;
  }
  return _gstAvailable;
}

let _edgeTtsCmd: string | null = null;
async function getEdgeTtsCmd(): Promise<string | null> {
  if (_edgeTtsCmd !== null) return _edgeTtsCmd;
  const candidates = [
    join(process.cwd(), ".venv", "bin", "edge-tts"),
    join(process.cwd(), "node_modules", ".bin", "edge-tts"),
    "/home/snowjd/.local/share/pipx/venvs/edge-tts/bin/edge-tts",
    "/home/snowjd/.local/bin/edge-tts",
    "edge-tts",
  ];
  for (const candidate of candidates) {
    try {
      if (candidate.includes("/")) {
        await access(candidate);
        _edgeTtsCmd = candidate;
        return _edgeTtsCmd;
      } else {
        await execAsync(`which ${candidate}`);
        _edgeTtsCmd = candidate;
        return _edgeTtsCmd;
      }
    } catch {}
  }
  return null;
}

async function hasEdgeTts(): Promise<boolean> {
  return (await getEdgeTtsCmd()) !== null;
}

let _piperAvailable: boolean | null = null;
async function hasPiper(): Promise<boolean> {
  if (_piperAvailable !== null) return _piperAvailable;
  try {
    await execAsync("which piper");
    _piperAvailable = true;
  } catch {
    _piperAvailable = false;
  }
  return _piperAvailable;
}

// ─── Active playback PID tracking for cancel ───────────────────────────────────
let _activeTmpFile: string | null = null;
let _activePlayPid: number | null = null;

class AudioSynthesisService {
  /**
   * Synthesize audio with humanized, clear, slow and steady female neural persona (Ava).
   * Supports persistent disk caching for zero-latency repeated phrases.
   */
  public async synthesize(
    text: string,
    urgency: AudioUrgency = "calm",
    options?: { nativePlayback?: boolean }
  ): Promise<SynthesizedAudioResult> {
    // 1. Sanitize text for speech
    const cleanSpoken = text
      .replace(/```[\s\S]*?```/g, "Code omitted for speech.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[#*_~>]/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\{[^{}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanSpoken) {
      return {
        text,
        urgency,
        rate: 0.95,
        pitch: 1.0,
        ssml: "",
        dispatchedToNativeLinux: false,
        engine: "none",
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Humanized prosody: clear, steady, deliberate pacing (never rushed or shrill)
    // -5% rate = relaxed, articulate, natural breathing cadence
    // +0Hz pitch = grounded, warm, soothing feminine presence
    let rateStr = "-5%";
    let pitchStr = "+0Hz";
    let numericalRate = 0.95;
    let numericalPitch = 1.0;

    if (urgency === "alert") {
      rateStr = "-2%";
      pitchStr = "+2Hz";
      numericalRate = 0.98;
      numericalPitch = 1.02;
    } else if (urgency === "emergency") {
      rateStr = "+2%";
      pitchStr = "+4Hz";
      numericalRate = 1.02;
      numericalPitch = 1.04;
    }

    // 3. SSML for telemetry and logging
    const ssml = `<speak><prosody rate="${rateStr}" pitch="${pitchStr}">${cleanSpoken
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</prosody></speak>`;

    // 4. Register with voice duplex tracker
    voiceDuplex.startSpeaking(cleanSpoken, urgency === "calm" ? "normal" : "urgent");

    let dispatched = false;
    let audioBase64: string | undefined = undefined;
    let engine: SynthesizedAudioResult["engine"] = "none";
    let isCached = false;
    const preferLocal = process.env.USE_LOCAL_FAST_PATH !== "false";
    const voice = process.env.SNOW_TTS_VOICE || "en-US-AvaNeural";
    const allowNativePlayback = options?.nativePlayback === true;

    try {
      // 5a. Persistent Disk Cache Check (Zero-Latency Hit)
      const cacheKey = createHash("sha256").update(`${voice}:${rateStr}:${pitchStr}:${cleanSpoken}`).digest("hex");
      const cachedFilePath = join(CACHE_DIR, `${cacheKey}.mp3`);
      
      try {
        if (existsSync(cachedFilePath)) {
          const buf = await readFile(cachedFilePath);
          audioBase64 = buf.toString("base64");
          dispatched = true;
          isCached = true;
          engine = "cached";

          if (allowNativePlayback && await hasGstPlay()) {
            const child = spawn("gst-play-1.0", ["--quiet", cachedFilePath], { stdio: "ignore" });
            _activePlayPid = child.pid ?? null;
            await new Promise<void>((resolve) => {
              child.on("close", () => resolve());
              child.on("error", () => resolve());
            });
            _activePlayPid = null;
            engine = "edge-tts+gst";
          }
        }
      } catch {}

      // 5b. Local Piper TTS (if locally preloaded with onnx model)
      if (!dispatched && preferLocal && await hasPiper()) {
        const tmpFile = join(tmpdir(), `snow_tts_${Date.now()}.wav`);
        _activeTmpFile = tmpFile;
        const modelPath = process.env.PIPER_MODEL_PATH || join(process.cwd(), "data", "piper_models", "en_US-lessac-medium.onnx");
        
        try {
          await execAsync(
            `echo ${JSON.stringify(cleanSpoken)} | piper --model "${modelPath}" --output_file "${tmpFile}" 2>/dev/null`,
            { timeout: 10_000 }
          );

          try {
            const buf = await readFile(tmpFile);
            audioBase64 = buf.toString("base64");
          } catch {}

          if (allowNativePlayback) {
            if (await hasGstPlay()) {
              const child = spawn("gst-play-1.0", ["--quiet", tmpFile], { stdio: "ignore" });
              _activePlayPid = child.pid ?? null;
              await new Promise<void>((resolve) => {
                child.on("close", () => resolve());
                child.on("error", () => resolve());
              });
              _activePlayPid = null;
              engine = "piper+gst";
            } else {
              await execAsync(`aplay -q "${tmpFile}" 2>/dev/null`, { timeout: 15_000 });
              engine = "piper+aplay";
            }
          } else {
            engine = "piper+gst";
          }
          dispatched = true;
        } catch (err) {
          console.warn("[SNOW TTS] Piper TTS failed:", (err as Error).message);
        } finally {
          _activeTmpFile = null;
          try { await unlink(tmpFile); } catch {}
        }
      }

      // 5c. High-Fidelity Humanized Microsoft Neural Voice (Ava / Jenny / Emma)
      const edgeCmd = await getEdgeTtsCmd();
      if (!dispatched && edgeCmd) {
        const tmpFile = join(tmpdir(), `snow_tts_${Date.now()}.mp3`);
        _activeTmpFile = tmpFile;
        try {
          await execAsync(
            `"${edgeCmd}" --voice "${voice}" --rate "${rateStr}" --pitch "${pitchStr}" --write-media "${tmpFile}" --text ${JSON.stringify(cleanSpoken)} 2>/dev/null`,
            { timeout: 8_000 }
          );

          // Read generated mp3 into base64 for browser HTML5 Audio playback
          try {
            const buf = await readFile(tmpFile);
            audioBase64 = buf.toString("base64");

            // Persist to disk cache for future instant responses
            try {
              const { writeFile } = await import("fs/promises");
              await writeFile(cachedFilePath, buf);
            } catch {}
          } catch {}

          if (allowNativePlayback && await hasGstPlay()) {
            // Play through native Linux sound subsystem only when requested
            const child = spawn("gst-play-1.0", ["--quiet", tmpFile], { stdio: "ignore" });
            _activePlayPid = child.pid ?? null;
            await new Promise<void>((resolve) => {
              child.on("close", () => resolve());
              child.on("error", () => resolve());
            });
            _activePlayPid = null;
            engine = "edge-tts+gst";
          } else {
            engine = "edge-tts+mp3";
          }

          dispatched = true;
        } catch (err) {
          console.warn("[SNOW TTS] edge-tts path failed:", (err as Error).message);
        } finally {
          _activeTmpFile = null;
          try { await unlink(tmpFile); } catch {}
        }
      }

      // 5d. Fallback: spd-say with calm steady parameters (only if native playback requested)
      if (!dispatched && allowNativePlayback) {
        try {
          const escaped = cleanSpoken.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
          await execAsync(`spd-say -w -t female1 -p 0 -r -10 "${escaped}" 2>/dev/null`, {
            timeout: 10_000,
          });
          dispatched = true;
          engine = "spd-say";
        } catch {}
      }
    } catch {
      // Graceful fallback - no TTS engine available
    } finally {
      voiceDuplex.finishSpeaking();
    }

    return {
      text,
      urgency,
      rate: numericalRate,
      pitch: numericalPitch,
      ssml,
      audioBase64,
      mimeType: "audio/mp3",
      dispatchedToNativeLinux: dispatched,
      engine,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Immediately terminates active speech synthesis and resets voice duplex state.
   */
  public async cancelSpeech(): Promise<void> {
    try {
      // Kill active gst-play or edge-tts process if tracked
      if (_activePlayPid) {
        try { process.kill(_activePlayPid, "SIGTERM"); } catch {}
        _activePlayPid = null;
      }
      // Clean up temp mp3 if mid-write
      if (_activeTmpFile) {
        try { await unlink(_activeTmpFile); } catch {}
        _activeTmpFile = null;
      }
      // Broad sweep for any lingering audio processes
      await execAsync("pkill -f gst-play-1.0 2>/dev/null; pkill -f edge-tts 2>/dev/null; spd-say -C 2>/dev/null; pkill -f spd-say 2>/dev/null; true").catch(() => {});
    } catch {}
    voiceDuplex.finishSpeaking();
  }
}

export const audioSynthesis = new AudioSynthesisService();
