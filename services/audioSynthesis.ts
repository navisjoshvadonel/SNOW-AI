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
import { unlink, access } from "fs/promises";
import { voiceDuplex } from "./voiceDuplex";

const execAsync = promisify(exec);

export type AudioUrgency = "calm" | "alert" | "emergency";

export interface SynthesizedAudioResult {
  text: string;
  urgency: AudioUrgency;
  rate: number;
  pitch: number;
  ssml: string;
  dispatchedToNativeLinux: boolean;
  engine: "edge-tts+gst" | "edge-tts+aplay" | "spd-say" | "none";
  timestamp: string;
}

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

let _edgeTtsAvailable: boolean | null = null;
async function hasEdgeTts(): Promise<boolean> {
  if (_edgeTtsAvailable !== null) return _edgeTtsAvailable;
  try {
    await execAsync("which edge-tts");
    _edgeTtsAvailable = true;
  } catch {
    _edgeTtsAvailable = false;
  }
  return _edgeTtsAvailable;
}

// ─── Active playback PID tracking for cancel ───────────────────────────────────
let _activeTmpFile: string | null = null;
let _activePlayPid: number | null = null;

class AudioSynthesisService {
  /**
   * Synthesize audio with S.N.O.W. executive prosody using the best available engine.
   */
  public async synthesize(
    text: string,
    urgency: AudioUrgency = "calm"
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
        rate: 1.0,
        pitch: 1.0,
        ssml: "",
        dispatchedToNativeLinux: false,
        engine: "none",
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Prosody curves for soothing female neural persona
    let rate = 1.03;
    let pitch = 1.15;

    if (urgency === "alert") {
      rate = 1.18;
      pitch = 1.20;
    } else if (urgency === "emergency") {
      rate = 1.28;
      pitch = 1.25;
    }

    // 3. SSML for logging/metadata (not all engines use it directly)
    const pitchPct = pitch > 1
      ? `+${Math.round((pitch - 1) * 100)}%`
      : `-${Math.round((1 - pitch) * 100)}%`;
    const ssml = `<speak><prosody rate="${rate}" pitch="${pitchPct}">${cleanSpoken
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</prosody></speak>`;

    // 4. Register with voice duplex tracker
    voiceDuplex.startSpeaking(cleanSpoken, urgency === "calm" ? "normal" : "urgent");

    // 5. Build edge-tts rate / pitch strings
    const rateDiff = Math.round((rate - 1.0) * 100);
    const rateStr  = rateDiff >= 0 ? `+${rateDiff}%` : `${rateDiff}%`;
    const pitchHz  = Math.round((pitch - 1.0) * 50);  // heuristic: 0.15 → +7 Hz
    const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;

    let dispatched = false;
    let engine: SynthesizedAudioResult["engine"] = "none";

    try {
      // 6a. Try edge-tts → temp mp3 → gst-play-1.0 (preferred path)
      if (await hasEdgeTts()) {
      const tmpFile = join(tmpdir(), `snow_tts_${Date.now()}.mp3`);
      _activeTmpFile = tmpFile;
      try {
        // Write mp3 to temp file
        await execAsync(
          `edge-tts --voice en-US-AriaNeural --rate "${rateStr}" --pitch "${pitchStr}" --write-media "${tmpFile}" --text ${JSON.stringify(cleanSpoken)} 2>/dev/null`,
          { timeout: 15_000 }
        );

        if (await hasGstPlay()) {
          // Play with gst-play (best quality, handles mp3 natively)
          const child = spawn("gst-play-1.0", ["--quiet", tmpFile], { stdio: "ignore" });
          _activePlayPid = child.pid ?? null;
          await new Promise<void>((resolve) => {
            child.on("close", () => resolve());
            child.on("error", () => resolve());
          });
          _activePlayPid = null;
          engine = "edge-tts+gst";
        } else {
          // Fallback: aplay can't play mp3 directly — use ffmpeg if present, else skip
          // We attempt gst-launch as another method
          await execAsync(
            `gst-launch-1.0 filesrc location="${tmpFile}" ! mpegaudioparse ! mpg123audiodec ! audioconvert ! autoaudiosink 2>/dev/null`,
            { timeout: 30_000 }
          );
          engine = "edge-tts+aplay";
        }

        dispatched = true;
      } catch (err) {
        console.warn("[SNOW TTS] edge-tts path failed:", (err as Error).message);
      } finally {
        // Clean up temp file
        _activeTmpFile = null;
        try { await unlink(tmpFile); } catch {}
      }
    }

    // 6b. Fallback: spd-say (basic quality but always works if installed)
    if (!dispatched) {
      try {
        const escaped = cleanSpoken.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
        const speedParam = urgency === "calm" ? 0 : urgency === "alert" ? 25 : 40;
        await execAsync(`spd-say -w -t female1 -p 15 -r ${speedParam} "${escaped}" 2>/dev/null`, {
          timeout: 30_000,
        });
        dispatched = true;
        engine = "spd-say";
      } catch {
        // Silent — no TTS engine available
      }
      }
    } finally {
      voiceDuplex.finishSpeaking();
    }

    return {
      text,
      urgency,
      rate,
      pitch,
      ssml,
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
