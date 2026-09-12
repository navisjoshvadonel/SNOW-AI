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
    // 1. Calculate prosody curves
    let rate = 1.0;
    let pitch = 0.98; // Slightly lower, dignified British butler register

    if (urgency === "alert") {
      rate = 1.18;
      pitch = 1.05;
    } else if (urgency === "emergency") {
      rate = 1.28;
      pitch = 1.12;
    }

    // 2. Generate clean SSML
    const ssml = `<speak><prosody rate="${rate}" pitch="${pitch > 1 ? `+${Math.round((pitch - 1) * 100)}%` : `-${Math.round((1 - pitch) * 100)}%`}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</prosody></speak>`;

    // 3. Register with voice duplex tracker
    voiceDuplex.startSpeaking(text, urgency === "calm" ? "normal" : "urgent");

    // 4. Try native Linux speech dispatcher (spd-say) if available
    let dispatched = false;
    try {
      const cleanSpoken = text.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
      const speedParam = urgency === "calm" ? 0 : urgency === "alert" ? 25 : 40;
      await execAsync(`spd-say -r ${speedParam} "${cleanSpoken}" 2>/dev/null`);
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
