/**
 * SNOW AI — High-Fidelity S.N.O.W. Audio Synthesis & Dynamic Prosody Service
 * Modulates pitch, speaking rate, and cadence according to contextual urgency.
 *
 * Voice engine priority:
 *   1. edge-tts (Microsoft High-Fidelity Neural) + gst-play-1.0 → richest quality
 *   2. edge-tts + HTML5 Audio Base64 stream                    → web client default
 *   3. piper-tts (local neural onnx model)                      → zero-latency local fallback
 *   4. spd-say (Linux speech daemon)                           → emergency hardware fallback
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { readFile, unlink, access, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { voiceDuplex } from "./voiceDuplex";

const execAsync = promisify(exec);

export type AudioUrgency = "calm" | "alert" | "emergency";

export interface VoiceProfile {
  id: string;
  name: string;
  gender: "female" | "male";
  locale: string;
  persona: string;
  pitch: string;
  rate: string;
}

export const CURATED_VOICES: VoiceProfile[] = [
  {
    id: "en-US-AvaNeural",
    name: "Snow",
    gender: "female",
    locale: "en-US",
    persona: "Slow, steady, warm, and friendly with genuine human emotion",
    pitch: "+0Hz",
    rate: "-5%",
  },
];

export interface SynthesizedAudioResult {
  text: string;
  urgency: AudioUrgency;
  rate: number;
  pitch: number;
  ssml: string;
  voice: string;
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

let _piperBinaryPath: string | null = null;
async function getPiperBinary(): Promise<string | null> {
  if (_piperBinaryPath !== null) return _piperBinaryPath || null;
  const candidates = [
    "piper",
    "/usr/local/bin/piper",
    join(process.env.HOME || "", ".local", "bin", "piper"),
    join(process.cwd(), "data", "piper", "piper"),
    join(process.cwd(), "data", "piper_models", "piper")
  ];
  for (const c of candidates) {
    try {
      await execAsync(`command -v "${c}" || test -x "${c}"`);
      _piperBinaryPath = c;
      return c;
    } catch {}
  }
  _piperBinaryPath = "";
  return null;
}

async function hasPiper(): Promise<boolean> {
  return (await getPiperBinary()) !== null;
}

// ─── Speech Sanitization & Conversational Lead Extraction ────────────────────
export function sanitizeTextForSpeech(raw: string): string {
  if (!raw) return "";
  return raw
    // 0. Remove voice description / meta labels / stage directions
    .replace(/(?:voice description|voice profile|persona|query analysis|target topic|operating tier|workstation health|recommended action|system status|telemetry snapshot)\s*:?[^\n.]*[.\n]?/gi, " ")
    .replace(/\*[^*]+\*/g, " ")
    .replace(/\([^)]{0,100}(?:whisper|speaking|tone|voice|pause|cadence|emotion)[^)]{0,100}\)/gi, " ")
    // 1. Remove Markdown code blocks entirely (never speak meta-phrases)
    .replace(/```[\s\S]*?```/g, " ")
    // 2. Remove markdown tables entirely
    .replace(/^\|.*\|$/gm, " ")
    .replace(/\|/g, " ")
    // 3. Remove images: ![alt](url) -> ""
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // 4. Transform links: [link text](url) -> "link text"
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // 5. Remove widget tags: [UI_WEATHER: ...], [WEATHER: ...]
    .replace(/\[(?:WEATHER|UI_[A-Z_]+)\s*:?[^\]]*\]/gi, " ")
    .replace(/\[[^\]]*\]/g, " ")
    // 6. Strip bare URLs & file URIs
    .replace(/(?:https?|file):\/\/\S+/g, " ")
    // 7. Strip raw JSON blocks
    .replace(/\{[^{}]*\}/g, " ")
    // 8. Strip XML / HTML tags
    .replace(/<[^>]+>/g, " ")
    // 9. Strip markdown formatting: headers, bold, italics, strikethrough, blockquotes
    .replace(/^[#>-]+\s+/gm, " ")
    .replace(/[*_~`]/g, " ")
    // 10. Strip bullet marks and list numbers at line starts
    .replace(/^\s*[\u2022\u25E6\u2023\u2219-]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ")
    // 11. Strip emojis and non-speech symbols
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, " ")
    // 12. Convert common technical symbols to natural spoken words
    .replace(/\b&amp;\b|\b&\b/g, " and ")
    .replace(/\s*%\b/g, " percent ")
    .replace(/\s*\+\s*/g, " plus ")
    // 13. Expand abbreviations for smooth cadence
    .replace(/(^|[\s(])i\.e\.,?/gi, "$1that is,")
    .replace(/(^|[\s(])e\.g\.,?/gi, "$1for example,")
    .replace(/(^|[\s(])etc\./gi, "$1etcetera")
    .replace(/(^|[\s(])vs\./gi, "$1versus")
    .replace(/\b(nj|NJ)\b/g, "NJ")
    // 14. Collapse multiple punctuation & spaces
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extracts a concise, high-impact conversational executive lead (top 1-3 sentences)
 * before deep technical markdown or code blocks start.
 */
export function extractSpokenLead(rawText: string, maxSentences = 3, maxChars = 340): string {
  if (!rawText) return "";

  // 1. Isolate the opening conversational block before structured markdown sections
  const lines = rawText.split(/\r?\n/);
  const leadLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (leadLines.length > 0) break; // Finished first paragraph
      continue;
    }
    // Skip opening headings so we don't prematurely abort on `### Intro`
    if (/^#{1,6}\s/.test(trimmed)) {
      if (leadLines.length > 0) break;
      continue;
    }
    // Stop at code blocks, tables, horizontal rules, or bullet lists
    if (/^(?:```|\||---+|\*{3,}|[-*•]\s|\d+\.\s|>)/.test(trimmed)) {
      if (leadLines.length > 0) break;
      continue;
    }
    leadLines.push(trimmed);
  }

  const candidateBlock = leadLines.length > 0 ? leadLines.join(" ") : rawText;
  const cleaned = sanitizeTextForSpeech(candidateBlock);

  if (!cleaned) {
    return sanitizeTextForSpeech(rawText).slice(0, maxChars);
  }

  // 2. Extract complete sentences using bulletproof boundary matching
  const sentences = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).filter(Boolean);

  if (sentences.length > 0) {
    let result = "";
    for (let i = 0; i < Math.min(sentences.length, maxSentences); i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;
      const candidate = (result ? result + " " + sentence : sentence).trim();
      if (candidate.length <= maxChars || i === 0) {
        result = candidate;
      } else {
        break;
      }
    }
    if (result) return result;
  }

  // Fallback: word-boundary truncation with proper punctuation
  if (cleaned.length <= maxChars) return cleaned;
  const wordBoundary = cleaned.slice(0, maxChars).replace(/\s+\S*$/, "");
  return wordBoundary ? wordBoundary + "." : cleaned.slice(0, maxChars);
}

// ─── Active playback PID tracking for cancel ───────────────────────────────────
let _activeTmpFile: string | null = null;
let _activePlayPid: number | null = null;

class AudioSynthesisService {
  /**
   * Returns list of available high-fidelity neural voices.
   */
  public getVoices(): VoiceProfile[] {
    return CURATED_VOICES;
  }

  /**
   * Returns active default neural voice.
   */
  public getDefaultVoice(): string {
    return process.env.SNOW_TTS_VOICE || "en-US-AvaNeural";
  }

  /**
   * Synthesize audio with humanized, clear, natural neural voice.
   * Supports persistent disk caching for zero-latency repeated phrases.
   */
  public async synthesize(
    text: string,
    urgency: AudioUrgency = "calm",
    options?: {
      nativePlayback?: boolean;
      voice?: string;
      rate?: string;
      pitch?: string;
    }
  ): Promise<SynthesizedAudioResult> {
    // 1. Sanitize text for speech (extract clean spoken lead)
    const cleanSpoken = sanitizeTextForSpeech(text);

    const voice = options?.voice || process.env.SNOW_TTS_VOICE || "en-US-AvaNeural";

    if (!cleanSpoken) {
      return {
        text,
        urgency,
        rate: 1.0,
        pitch: 1.0,
        voice,
        ssml: "",
        dispatchedToNativeLinux: false,
        engine: "none",
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Humanized prosody: slow, steady, warm, and friendly cadence with human emotion
    let rateStr = options?.rate || "-5%";
    let pitchStr = options?.pitch || "+0Hz";
    let numericalRate = 0.94;
    let numericalPitch = 1.0;

    if (urgency === "alert") {
      rateStr = options?.rate || "+1%";
      pitchStr = options?.pitch || "+1Hz";
      numericalRate = 1.01;
      numericalPitch = 1.01;
    } else if (urgency === "emergency") {
      rateStr = options?.rate || "+3%";
      pitchStr = options?.pitch || "+3Hz";
      numericalRate = 1.03;
      numericalPitch = 1.03;
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
    const preferLocal = process.env.USE_LOCAL_FAST_PATH === "true" || process.env.OFFLINE_PRIMARY === "true";
    const allowNativePlayback = options?.nativePlayback === true;

    try {
      // 5a. Persistent Disk Cache Check (Zero-Latency Hit)
      const cacheKey = createHash("sha256")
        .update(`${voice}:${rateStr}:${pitchStr}:${cleanSpoken}`)
        .digest("hex");
      const cachedFilePath = join(CACHE_DIR, `${cacheKey}.mp3`);

      try {
        if (existsSync(cachedFilePath)) {
          const buf = await readFile(cachedFilePath);
          audioBase64 = buf.toString("base64");
          dispatched = true;
          isCached = true;
          engine = "cached";

          if (allowNativePlayback && (await hasGstPlay())) {
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

      // 5b. Local Piper TTS (if preferLocal and piper binary available)
      if (!dispatched && preferLocal && (await hasPiper())) {
        const tmpFile = join(tmpdir(), `snow_tts_${Date.now()}.wav`);
        _activeTmpFile = tmpFile;
        const modelPath =
          process.env.PIPER_MODEL_PATH ||
          join(process.cwd(), "data", "piper_models", "en_US-lessac-medium.onnx");

        try {
          const piperBin = (await getPiperBinary()) || "piper";
          await execAsync(
            `echo ${JSON.stringify(cleanSpoken)} | "${piperBin}" --model "${modelPath}" --output_file "${tmpFile}" 2>/dev/null`,
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

// ─── Network Liveness Cache for Offline Voice Fast-Path ───────────────────────
let _ttsOnlineCached = false;
let _ttsLastOnlineCheck = 0;
async function isOnlineForTts(): Promise<boolean> {
  if (process.env.OFFLINE_PRIMARY === "true") return false;
  const now = Date.now();
  if (now - _ttsLastOnlineCheck < 20_000) return _ttsOnlineCached;
  _ttsLastOnlineCheck = now;
  try {
    const res = await fetch("http://1.1.1.1", { method: "HEAD", signal: AbortSignal.timeout(350) });
    _ttsOnlineCached = res.ok || res.status > 0;
  } catch {
    _ttsOnlineCached = false;
  }
  return _ttsOnlineCached;
}

      // 5c. High-Fidelity Microsoft Neural Voice via edge-tts (Only attempted when online!)
      const edgeCmd = await getEdgeTtsCmd();
      const isOnline = await isOnlineForTts();
      if (!dispatched && edgeCmd && isOnline) {
        const tmpFile = join(tmpdir(), `snow_tts_${Date.now()}.mp3`);
        _activeTmpFile = tmpFile;
        try {
          // Attempt synthesis with chosen voice; fallback to en-US-JennyNeural if primary encounters an issue
          let success = false;
          const voicesToTry = [voice];
          if (voice !== "en-US-JennyNeural") voicesToTry.push("en-US-JennyNeural");

          for (const candidateVoice of voicesToTry) {
            try {
              await execAsync(
                `"${edgeCmd}" --voice "${candidateVoice}" --rate "${rateStr}" --pitch "${pitchStr}" --write-media "${tmpFile}" --text ${JSON.stringify(cleanSpoken)} 2>/dev/null`,
                { timeout: 12_000 }
              );
              success = true;
              break;
            } catch (vErr) {
              console.warn(`[SNOW TTS] Candidate voice ${candidateVoice} error:`, (vErr as Error).message);
            }
          }

          if (success) {
            // Read generated mp3 into base64 for browser HTML5 Audio playback
            try {
              const buf = await readFile(tmpFile);
              audioBase64 = buf.toString("base64");

              // Persist to disk cache for future instant responses
              try {
                await writeFile(cachedFilePath, buf);
              } catch {}
            } catch {}

            if (allowNativePlayback && (await hasGstPlay())) {
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
          }
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
          await execAsync(`spd-say -w -t female1 -p 0 -r -12 "${escaped}" 2>/dev/null`, {
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
      voice,
      audioBase64,
      mimeType: "audio/mp3",
      dispatchedToNativeLinux: dispatched,
      engine,
      cached: isCached,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Immediately terminates active speech synthesis and resets voice duplex state.
   */
  public async cancelSpeech(): Promise<void> {
    try {
      if (_activePlayPid) {
        try { process.kill(_activePlayPid, "SIGTERM"); } catch {}
        _activePlayPid = null;
      }
      if (_activeTmpFile) {
        try { await unlink(_activeTmpFile); } catch {}
        _activeTmpFile = null;
      }
      await execAsync(
        "pkill -f gst-play-1.0 2>/dev/null; pkill -f edge-tts 2>/dev/null; spd-say -C 2>/dev/null; pkill -f spd-say 2>/dev/null; true"
      ).catch(() => {});
    } catch {}
    voiceDuplex.finishSpeaking();
  }

  /**
   * Pre-warm common JARVIS thinking cues so they hit disk cache in < 10ms.
   */
  public async prewarmThinkingCues(): Promise<void> {
    const cues = ["I am thinking...", "Analyzing, NJ..."];
    for (const v of CURATED_VOICES) {
      let networkOffline = false;
      for (const cue of cues) {
        try {
          const res = await this.synthesize(cue, "calm", { voice: v.id });
          if (!res.audioBase64 && res.engine === "none") {
            networkOffline = true;
            break;
          }
        } catch {
          networkOffline = true;
          break;
        }
      }
      if (networkOffline) break;
    }
  }
}

export const audioSynthesis = new AudioSynthesisService();
