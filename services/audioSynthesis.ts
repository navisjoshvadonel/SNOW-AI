/**
 * SNOW AI — High-Fidelity J.A.R.V.I.S. Audio Synthesis & Dynamic Prosody Service
 * Modulates pitch, speaking rate, and cadence according to contextual urgency.
 */

import { exec } from "child_process";
import { promisify } from "util";
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
  timestamp: string;
}

class AudioSynthesisService {
  /**
   * Synthesize audio script with J.A.R.V.I.S. British executive prosody
   */
  public async synthesize(
    text: string,
    urgency: AudioUrgency = "calm"
  ): Promise<SynthesizedAudioResult> {
    // 1. Sanitize text for speech (strip code blocks, markdown asterisks, URLs)
    const cleanSpoken = text
      .replace(/```[\s\S]*?```/g, "Code omitted for speech.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[#*_~>]/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\{[^{}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // 2. Calculate prosody curves for soothing, poised female persona
    let rate = 1.03;
    let pitch = 1.15; // Melodic, clear, soothing feminine register

    if (urgency === "alert") {
      rate = 1.18;
      pitch = 1.20;
    } else if (urgency === "emergency") {
      rate = 1.28;
      pitch = 1.25;
    }

    // 3. Generate clean SSML
    const ssml = `<speak><prosody rate="${rate}" pitch="${pitch > 1 ? `+${Math.round((pitch - 1) * 100)}%` : `-${Math.round((1 - pitch) * 100)}%`}">${cleanSpoken.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</prosody></speak>`;

    // 4. Register with voice duplex tracker
    voiceDuplex.startSpeaking(cleanSpoken, urgency === "calm" ? "normal" : "urgent");

    // 5. Try native Linux speech dispatcher (spd-say) if available with female voice
    let dispatched = false;
    try {
      const escaped = cleanSpoken.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
      const speedParam = urgency === "calm" ? 0 : urgency === "alert" ? 25 : 40;
      await execAsync(`spd-say -w -t female1 -p 15 -r ${speedParam} "${escaped}" 2>/dev/null`);
      dispatched = true;
    } catch {}

    return {
      text,
      urgency,
      rate,
      pitch,
      ssml,
      dispatchedToNativeLinux: dispatched,
      timestamp: new Date().toISOString(),
    };
  }
}

export const audioSynthesis = new AudioSynthesisService();
