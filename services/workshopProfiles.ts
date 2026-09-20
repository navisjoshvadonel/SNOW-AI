/**
 * SNOW AI — IoT & Workshop Environment Profiles Service
 * Coordinates workstation ergonomics, displays, audio routing, media playback,
 * power states, and security perimeter into unified situational operating modes.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { linuxSystemActuator } from "./linuxSystemActuator";
import { desktopActuator } from "./desktopActuator";
import { telemetryBridge } from "./telemetryBridge";

const execAsync = promisify(exec);

export type WorkshopMode = "focus" | "briefing" | "lockdown" | "standby" | "standard";

export interface ProfileExecutionResult {
  mode: WorkshopMode;
  success: boolean;
  actionsApplied: string[];
  timestamp: string;
}

class WorkshopProfilesService {
  private activeMode: WorkshopMode = "standard";

  public getActiveMode(): WorkshopMode {
    return this.activeMode;
  }

  /**
   * Apply a comprehensive situational workstation profile
   */
  public async applyProfile(mode: WorkshopMode): Promise<ProfileExecutionResult> {
    const actions: string[] = [];

    switch (mode) {
      case "focus":
        // 1. Elevate CPU to performance profile
        await linuxSystemActuator.setPowerProfile("performance");
        actions.push("Power profile elevated to 'performance'");

        // 2. Set audio to comfortable deep-work volume (35%)
        await linuxSystemActuator.setVolume(35);
        actions.push("Master audio volume calibrated for deep work (35%)");

        // 3. Pause media playback if active to minimize distraction
        try {
          const media = await linuxSystemActuator.getMediaStatus();
          if (media && media.playbackStatus === "Playing") {
            await linuxSystemActuator.mediaControl("play-pause");
            actions.push(`Paused active media stream on ${media.player}`);
          }
        } catch {}

        // 4. Synchronize telemetry HUD
        await telemetryBridge.broadcastToHud().catch(() => {});
        actions.push("World Monitor HUD synchronized for Focus Mode");

        // 5. Desktop Notification
        linuxSystemActuator.dispatchNotification(
          "Focus Mode Engaged",
          "Performance profile active, distraction filters applied.",
          "low"
        ).catch(() => {});
        break;

      case "briefing":
        // 1. Unmute and set clear audible volume for speech (70%)
        await linuxSystemActuator.setVolume(70);
        actions.push("Master audio configured for executive speech (70%)");

        // 2. Focus Snow operations window
        await linuxSystemActuator.focusWindow("Snow");
        actions.push("Snow operations window brought to focus");

        // 3. Pause background media so voice is clear
        try {
          const media = await linuxSystemActuator.getMediaStatus();
          if (media && media.playbackStatus === "Playing") {
            await linuxSystemActuator.mediaControl("play-pause");
            actions.push("Paused background audio for speech delivery");
          }
        } catch {}

        // 4. Broadcast live briefing telemetry
        await telemetryBridge.broadcastToHud().catch(() => {});
        actions.push("Live telemetry coordinates refreshed");

        // 5. Desktop Notification
        linuxSystemActuator.dispatchNotification(
          "Executive Briefing Mode",
          "Audio levels calibrated, operations console focused.",
          "normal"
        ).catch(() => {});
        break;

      case "lockdown":
        // 1. Engage Desktop Actuator emergency kill-switch
        desktopActuator.setEmergencyKillSwitch(true);
        actions.push("Desktop Actuator emergency kill-switch engaged");

        // 2. Clear clipboard contents to purge sensitive tokens & credentials
        try {
          await execAsync("wl-copy --clear 2>/dev/null || xclip -selection clipboard /dev/null 2>/dev/null || true");
          actions.push("System clipboard cleared of credentials");
        } catch {}

        // 3. Mute system audio
        await linuxSystemActuator.toggleMute();
        actions.push("Audio muted");

        // 4. Stop active MPRIS media immediately
        try {
          await linuxSystemActuator.mediaControl("stop");
          actions.push("All media streams halted");
        } catch {}

        // 5. Lock Linux session immediately
        const lockRes = await linuxSystemActuator.lockScreen();
        actions.push(lockRes.success ? "Workstation session locked" : "Lock screen dispatched");
        break;

      case "standby":
        // 1. Set CPU to power-saver profile
        await linuxSystemActuator.setPowerProfile("power-saver");
        actions.push("Power profile reduced to 'power-saver'");

        // 2. Turn audio low
        await linuxSystemActuator.setVolume(15);
        actions.push("Audio minimized to 15%");

        // 3. Pause media if playing
        try {
          await linuxSystemActuator.mediaControl("stop");
          actions.push("Media playback stopped");
        } catch {}

        // 4. Synchronize standby telemetry
        await telemetryBridge.broadcastToHud().catch(() => {});
        actions.push("Standby telemetry broadcasted");
        break;

      case "standard":
      default:
        await linuxSystemActuator.setPowerProfile("balanced");
        desktopActuator.setEmergencyKillSwitch(false);
        actions.push("Standard operating baseline restored (Balanced power profile, actuators active)");
        await telemetryBridge.broadcastToHud().catch(() => {});
        break;
    }

    this.activeMode = mode;

    return {
      mode,
      success: true,
      actionsApplied: actions,
      timestamp: new Date().toISOString(),
    };
  }
}

export const workshopProfiles = new WorkshopProfilesService();
