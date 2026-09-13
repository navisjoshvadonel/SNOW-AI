/**
 * SNOW AI — Ambient Desktop Perception & Differential Context Engine
 * Continuously tracks active desktop focus, window titles, and visual scenes
 * to provide J.A.R.V.I.S.-grade ambient workspace awareness.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { addVisualEpisode } from "../brain";
import { ragIngestFact } from "../rag.js";
import { desktopActuator } from "./desktopActuator";

const execAsync = promisify(exec);

export interface AmbientWorkspaceState {
  activeWindow: string;
  appClass: string;
  timestamp: string;
  isLocked: boolean;
  lastScreenshot?: string;
}

class AmbientPerceptionService {
  private lastWindow: string = "";
  private lastClass: string = "";
  private lastCapturedAt: number = 0;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentState: AmbientWorkspaceState = {
    activeWindow: "Terminal / Codebase",
    appClass: "workspace",
    timestamp: new Date().toISOString(),
    isLocked: false,
  };

  /**
   * Start ambient background perception loop
   */
  public start(pollIntervalMs: number = 10000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.pollTimer = setInterval(async () => {
      await this.sampleWorkspace();
    }, pollIntervalMs);

    console.log("[SNOW AMBIENT PERCEPTION] 👁️ Workspace visual & window tracking active.");
  }

  /**
   * Stop ambient background perception loop
   */
  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
  }

  public getLatestState(): AmbientWorkspaceState {
    return this.currentState;
  }

  /**
   * Query native Linux X11/Wayland active window metadata
   */
  private async sampleWorkspace(): Promise<void> {
    try {
      // 1. Check if screen is locked
      const isLocked = await this.checkScreenLocked();

      // 2. Fix 7: Combine the 3 sequential shell spawns into ONE xdotool call.
      //    `xdotool getactivewindow getwindowname getwindowclassname` returns
      //    window-name on line 1 and class on line 2 in a single process fork.
      let title = "";
      let wmClass = "";

      try {
        const { stdout } = await execAsync(
          "xdotool getactivewindow getwindowname getwindowclassname 2>/dev/null || echo ''"
        );
        const lines = stdout.trim().split("\n");
        title   = (lines[0] || "").trim();
        wmClass = (lines[1] || "").trim();
      } catch {
        // Fallback for non-X11/headless environments
        title   = "Active Linux Workspace";
        wmClass = "system";
      }

      if (!title) title = "Desktop / Idle";
      if (!wmClass) wmClass = "system";

      const now = Date.now();
      const windowChanged = title !== this.lastWindow || wmClass !== this.lastClass;
      const timeSinceCapture = now - this.lastCapturedAt;

      this.currentState = {
        activeWindow: title,
        appClass: wmClass,
        timestamp: new Date().toISOString(),
        isLocked,
        lastScreenshot: this.currentState.lastScreenshot,
      };

      // 3. Trigger differential visual ingestion if window changed or 60s elapsed
      if ((windowChanged || timeSinceCapture >= 60000) && !isLocked) {
        this.lastWindow = title;
        this.lastClass = wmClass;
        this.lastCapturedAt = now;

        // Capture lightweight thumbnail without high CPU overhead
        let thumbnail = "";
        try {
          const shot = await desktopActuator.getScreenshot(640);
          if (shot.success && shot.image) {
            thumbnail = shot.image;
            this.currentState.lastScreenshot = thumbnail;
          }
        } catch {}

        // Ingest into SQLite visual episodic memory & RAG
        addVisualEpisode(
          "ambient_monitor",
          `Active Application: ${wmClass} — Window: "${title}"`,
          [wmClass, "desktop_window"],
          "active_operator_focus",
          thumbnail
        );

        ragIngestFact(
          "ambient_monitor",
          "current_task",
          `NJ is currently focused on '${title}' in application [${wmClass}].`
        ).catch(() => {});
      }
    } catch (e: any) {
      // Non-fatal, keep monitoring
    }
  }

  private async checkScreenLocked(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("gnome-screensaver-command -q 2>/dev/null || echo ''");
      return stdout.includes("is active");
    } catch {
      return false;
    }
  }
}

export const ambientPerception = new AmbientPerceptionService();
