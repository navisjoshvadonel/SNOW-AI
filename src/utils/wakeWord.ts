/**
 * SNOW AI — Ambient Wake Word Engine
 * Continuously listens for "Hey Snow" or "Snow" in the room.
 * Pure client-side, zero cloud audio streaming, instant acoustic activation.
 */

export interface WakeWordConfig {
  onWake: (extractedCommand?: string) => void;
  onStatusChange?: (status: "idle" | "listening" | "awakened" | "error") => void;
  lang?: string;
}

export class AmbientWakeWordEngine {
  private recognition: any = null;
  private isEnabled: boolean = false;
  private isPaused: boolean = false;
  private restartTimeout: any = null;
  private config: WakeWordConfig;
  private wakePattern: RegExp = /\b(?:hey\s+snow|yo\s+snow|snow)\b/i;

  constructor(config: WakeWordConfig) {
    this.config = config;
  }

  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) return;
    this.isEnabled = enabled;

    if (enabled) {
      this.isPaused = false;
      this.startListening();
    } else {
      this.stopListening();
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public pause(): void {
    this.isPaused = true;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }
    this.config.onStatusChange?.("idle");
  }

  public resume(delayMs: number = 500): void {
    if (!this.isEnabled) return;
    this.isPaused = false;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.isEnabled && !this.isPaused) {
        this.startListening();
      }
    }, delayMs);
  }

  private startListening(): void {
    if (typeof window === "undefined" || !this.isEnabled || this.isPaused) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[Snow WakeWord] SpeechRecognition is not supported in this browser.");
      this.config.onStatusChange?.("error");
      return;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = this.config.lang || "en-US";

      rec.onstart = () => {
        this.config.onStatusChange?.("listening");
      };

      rec.onresult = (event: any) => {
        if (!this.isEnabled || this.isPaused) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = (event.results[i][0]?.transcript || "").trim();
          if (!transcript) continue;

          const match = transcript.match(this.wakePattern);
          if (match && match.index !== undefined) {
            console.log(`[Snow WakeWord] ⚡ Detected wake phrase in: "${transcript}"`);
            
            // Extract anything spoken after the wake phrase
            const afterWake = transcript.slice(match.index + match[0].length).trim();
            // Clean leading punctuation
            const cleanCommand = afterWake.replace(/^[,.\s\-]+/, "").trim();

            this.pause(); // Immediately pause ambient listener to hand over control
            this.config.onStatusChange?.("awakened");
            this.config.onWake(cleanCommand || undefined);
            return;
          }
        }
      };

      rec.onerror = (event: any) => {
        // Silently recover from harmless no-speech timeouts
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("[Snow WakeWord] Notice:", event.error);
        }
      };

      rec.onend = () => {
        // Continuous restart if enabled and not intentionally paused
        if (this.isEnabled && !this.isPaused) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.isEnabled && !this.isPaused) {
              this.startListening();
            }
          }, 350);
        } else {
          this.config.onStatusChange?.("idle");
        }
      };

      rec.start();
      this.recognition = rec;
    } catch (e) {
      console.warn("[Snow WakeWord] Failed to start:", e);
      this.config.onStatusChange?.("error");
    }
  }

  public stopListening(): void {
    this.isEnabled = false;
    this.isPaused = false;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    this.config.onStatusChange?.("idle");
  }
}
