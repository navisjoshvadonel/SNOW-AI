/**
 * SNOW AI — Snow-Desk Specialist Agent (Desktop & GUI Actuator Service)
 * 
 * Provides unified, closed-loop Linux desktop orchestration:
 *  - Visual desktop perception (screenshots with multi-backend fallbacks)
 *  - Active window tracking, focusing, and workspace switching
 *  - Audio volume management & media player controls (MPRIS/PipeWire/PulseAudio)
 *  - Mouse movements, clicks, typing, hotkey execution, and app launching
 *  - Closed-loop state change verification (pre/post frame deltas)
 */

import { desktopActuator, DesktopStatus, ScreenshotResult, DesktopActionResult, VerifiedActionResult } from "./desktopActuator";
import { linuxSystemActuator, AudioDeviceStatus, WindowInfo, MediaPlaybackStatus } from "./linuxSystemActuator";

export interface SnowDeskState {
  success: boolean;
  activeWindow: { id: string; title: string; class: string };
  openWindows: WindowInfo[];
  display: {
    width: number;
    height: number;
    mouse: { x: number; y: number };
    displayId: string;
    engine: string;
  };
  audio: AudioDeviceStatus;
  media: MediaPlaybackStatus | null;
  timestamp: string;
}

export class ComputerUseService {
  /**
   * 1. Query full unified state of the desktop environment.
   */
  public async getDeskState(): Promise<SnowDeskState> {
    try {
      const [deskStatus, audioStatus, openWindows, mediaStatus] = await Promise.all([
        desktopActuator.getStatus(),
        linuxSystemActuator.getAudioStatus(),
        linuxSystemActuator.listOpenWindows(),
        linuxSystemActuator.getMediaStatus().catch(() => null),
      ]);

      return {
        success: deskStatus.success,
        activeWindow: deskStatus.activeWindow || {
          id: "0x0",
          title: "Linux Desktop / Active Session",
          class: "desktop"
        },
        openWindows,
        display: {
          width: deskStatus.width || 1920,
          height: deskStatus.height || 1080,
          mouse: deskStatus.mouse || { x: 0, y: 0 },
          displayId: deskStatus.display || ":0",
          engine: (deskStatus as any).engine || "native_x11"
        },
        audio: audioStatus,
        media: mediaStatus,
        timestamp: new Date().toISOString()
      };
    } catch (e: any) {
      return {
        success: false,
        activeWindow: { id: "0x0", title: "Linux Desktop", class: "desktop" },
        openWindows: [],
        display: { width: 1920, height: 1080, mouse: { x: 0, y: 0 }, displayId: ":0", engine: "fallback" },
        audio: { success: false, volumePct: 50, muted: false },
        media: null,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 2. Capture Real-Time Desktop Screenshot.
   */
  public async takeScreenshot(maxDim: number = 1280): Promise<ScreenshotResult> {
    return await desktopActuator.getScreenshot(maxDim);
  }

  /**
   * 3. Focus an application window by title substring.
   */
  public async focusWindow(titleSubstr: string): Promise<{ success: boolean; title: string }> {
    return await linuxSystemActuator.focusWindow(titleSubstr);
  }

  /**
   * 4. Close an application window by title substring.
   */
  public async closeWindow(titleSubstr: string): Promise<{ success: boolean; title: string }> {
    return await linuxSystemActuator.closeWindow(titleSubstr);
  }

  /**
   * 5. Set Linux system output volume (0 - 100%).
   */
  public async setVolume(pct: number): Promise<{ success: boolean; volumePct: number }> {
    return await linuxSystemActuator.setVolume(pct);
  }

  /**
   * 6. Toggle audio mute state.
   */
  public async toggleMute(): Promise<{ success: boolean; muted: boolean }> {
    return await linuxSystemActuator.toggleMute();
  }

  /**
   * 7. Media playback control (play-pause, next, previous, stop).
   */
  public async mediaControl(action: "play-pause" | "next" | "previous" | "stop"): Promise<{ success: boolean; action: string; player?: string }> {
    return await linuxSystemActuator.mediaControl(action);
  }

  /**
   * 8. Launch an application or open a file/URL via xdg-open.
   */
  public async launch(target: string): Promise<DesktopActionResult> {
    return await desktopActuator.executeAction({ action: "launch", target });
  }

  /**
   * 9. Types text with optional Enter key press.
   */
  public async typeText(text: string, pressEnter: boolean = false): Promise<DesktopActionResult> {
    return await desktopActuator.executeAction({ action: "type", text, press_enter: pressEnter });
  }

  /**
   * 10. Executes keyboard hotkey combination (e.g. ['ctrl', 't'] or 'ctrl+c').
   */
  public async hotkey(keys: string | string[]): Promise<DesktopActionResult> {
    const keyArray = Array.isArray(keys) ? keys : keys.split(/[\s+-]+/).map(k => k.trim());
    return await desktopActuator.executeAction({ action: "hotkey", keys: keyArray });
  }

  /**
   * 11. Mouse Movement.
   */
  public async mouseMove(x: number, y: number): Promise<DesktopActionResult> {
    return await desktopActuator.executeAction({ action: "move", x, y });
  }

  /**
   * 12. Mouse Click with closed-loop verification.
   */
  public async mouseClick(
    x?: number,
    y?: number,
    button: "left" | "middle" | "right" = "left",
    clicks: number = 1
  ): Promise<VerifiedActionResult> {
    const action = clicks === 2 ? "double_click" : (button === "right" ? "right_click" : "click");
    return await desktopActuator.executeVerifiedAction({ action, x, y, button });
  }

  /**
   * 13. Drag and Drop with coordinate bounding.
   */
  public async drag(startX: number, startY: number, endX: number, endY: number): Promise<DesktopActionResult> {
    return await desktopActuator.executeAction({ action: "drag", startX, startY, endX, endY });
  }

  /**
   * 14. Vision-grounded natural language directive execution.
   */
  public async groundAndAct(directive: string, apiKey?: string): Promise<any> {
    const key = apiKey || process.env.GEMINI_API_KEY || "";
    return await desktopActuator.groundAndActuate(directive, key);
  }
}

export const computerUse = new ComputerUseService();
