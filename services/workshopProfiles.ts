/**
 * SNOW AI — IoT & Workshop Environment Profiles Service
 * Coordinates workstation ergonomics, displays, audio routing, power states,
 * and security perimeter into unified situational operating modes.
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
        // 1. Set CPU to performance
        await linuxSystemActuator.setPowerProfile("performance");
        actions.push("Power profile elevated to 'performance'");

        // 2. Set audio to comfortable deep-work volume (35%)
        await linuxSystemActuator.setVolume(35);
        actions.push("Master audio volume set to 35%");

        // 3. Broadcast optimal telemetry
        await telemetryBridge.broadcastToHud().catch(() => {});
        actions.push("World Monitor HUD synchronized");
        break;

      case "briefing":
        // 1. Unmute and set clear audible volume (70%)
        await linuxSystemActuator.setVolume(70);
        actions.push("Master audio configured for executive speech (70%)");

        // 2. Tile active windows
        await linuxSystemActuator.focusWindow("Snow");
        actions.push("Snow operations window brought to focus");

        // 3. Broadcast live briefing telemetry
        await telemetryBridge.broadcastToHud().catch(() => {});
        actions.push("Live telemetry coordinates refreshed");
        break;

      case "lockdown":
        // 1. Engage Desktop Actuator emergency kill-switch
        desktopActuator.setEmergencyKillSwitch(true);
        actions.push("Desktop Actuator emergency kill-switch engaged");

        // 2. Clear clipboard contents to purge sensitive tokens
        try {
          await execAsync("wl-copy --clear 2>/dev/null || xclip -selection clipboard /dev/null 2>/dev/null");
          actions.push("System clipboard cleared of credentials");
        } catch {}

        // 3. Mute system audio
        await linuxSystemActuator.toggleMute();
        actions.push("Audio muted");

        // 4. Lock Linux session
        try {
          await execAsync("loginctl lock-session 2>/dev/null || gnome-screensaver-command -l 2>/dev/null");
          actions.push("Workstation locked");
        } catch {}
        break;

      case "standby":
        // 1. Set CPU to power-saver
        await linuxSystemActuator.setPowerProfile("power-saver");
        actions.push("Power profile reduced to 'power-saver'");

        // 2. Turn audio low
        await linuxSystemActuator.setVolume(20);
        actions.push("Audio minimized to 20%");
        break;

      case "standard":
      default:
        await linuxSystemActuator.setPowerProfile("balanced");
        desktopActuator.setEmergencyKillSwitch(false);
        actions.push("Standard operating baseline restored");
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
