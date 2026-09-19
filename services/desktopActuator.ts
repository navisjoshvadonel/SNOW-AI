/**
 * SNOW AI — Autonomous Desktop Actuator Service
 * Bridges Node.js backend with native Linux python automation (pyautogui + mss).
 * Powers Claude Computer Use & Rabbit Operator grade visual actuation with
 * closed-loop state-change verification and active window tracking.
 */

import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "desktop_actuator.py");

export interface DesktopStatus {
  success: boolean;
  width: number;
  height: number;
  mouse: { x: number; y: number };
  display: string;
  activeWindow?: {
    id: string;
    title: string;
    class: string;
  };
  error?: string;
}

export interface ScreenshotResult {
  success: boolean;
  width: number;
  height: number;
  image: string; // base64 data URL
  error?: string;
}

export interface DesktopActionResult {
  success: boolean;
  action: string;
  x?: number;
  y?: number;
  target?: string;
  error?: string;
  [key: string]: any;
}

export interface VerifiedActionResult extends DesktopActionResult {
  stateChanged: boolean;
  visualDeltaPct: number;
  changedBbox?: number[] | null;
  preWindow?: { id: string; title: string; class: string };
  postWindow?: { id: string; title: string; class: string };
  windowChanged?: boolean;
  settleDelay?: number;
  preScreenshot?: string;
  postScreenshot?: string;
  verificationAudit?: string;
}

export interface GroundAndActResult {
  success: boolean;
  directive: string;
  targetElement: string;
  action: string;
  coordinates: { x: number; y: number };
  executionResult: VerifiedActionResult;
  stateChanged: boolean;
  visualDeltaPct: number;
  windowChanged: boolean;
  verificationAudit: string;
  auditExplanation: string;
  timestamp: string;
  screenshotSnippet?: string;
  postScreenshot?: string;
  retryHint?: string;
}

class DesktopActuatorService {
  private emergencyKillSwitch: boolean = false;
  private auditLogPath: string = path.join(process.cwd(), "data", "actuator_audit.log");

  /**
   * Toggle emergency halt for all actuation
   */
  public setEmergencyKillSwitch(halt: boolean): void {
    this.emergencyKillSwitch = halt;
    console.warn(`[Snow Actuator] Emergency Kill-Switch ${halt ? "ENGAGED" : "DISENGAGED"}`);
  }

  public isHalted(): boolean {
    return this.emergencyKillSwitch;
  }

  private logAudit(entry: Record<string, any>): void {
    try {
      const dataDir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.appendFileSync(this.auditLogPath, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + "\n");
    } catch {}
  }

  /**
   * 1. Check Desktop & Screen Status
   */
  public async getStatus(): Promise<DesktopStatus> {
    try {
      const { stdout } = await execFileAsync("python3", [SCRIPT_PATH, "status"]);
      return JSON.parse(stdout.trim());
    } catch (e: any) {
      console.warn("[Snow Actuator] getStatus error:", e.message);
      return {
        success: false,
        width: 1920,
        height: 1080,
        mouse: { x: 0, y: 0 },
        display: ":0",
        error: e.message
      };
    }
  }

  /**
   * 2. Capture Real-Time Desktop Screenshot via mss
   */
  public async getScreenshot(maxDim: number = 1280): Promise<ScreenshotResult> {
    try {
      const { stdout } = await execFileAsync("python3", [SCRIPT_PATH, "screenshot", String(maxDim)]);
      return JSON.parse(stdout.trim());
    } catch (e: any) {
      console.warn("[Snow Actuator] getScreenshot error:", e.message);
      return {
        success: false,
        width: 0,
        height: 0,
        image: "",
        error: e.message
      };
    }
  }

  /**
   * 3. Execute Native Action (Click, Type, Hotkey, Move, Scroll, Drag, Launch)
   */
  public async executeAction(payload: {
    action: "click" | "double_click" | "right_click" | "move" | "type" | "press" | "hotkey" | "scroll" | "drag" | "launch";
    x?: number;
    y?: number;
    text?: string;
    press_enter?: boolean;
    key?: string;
    keys?: string[];
    amount?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration?: number;
    target?: string;
    button?: "left" | "middle" | "right";
  }): Promise<DesktopActionResult> {
    if (this.emergencyKillSwitch) {
      const haltResult: DesktopActionResult = {
        success: false,
        action: payload.action,
        error: "SAFETY HALT: Desktop Actuator is locked by Emergency Kill-Switch."
      };
      this.logAudit({ payload, result: haltResult, status: "BLOCKED_KILL_SWITCH" });
      return haltResult;
    }

    // Coordinate bounding check
    if (payload.x !== undefined && (payload.x < 0 || payload.x > 7680)) {
      return { success: false, action: payload.action, error: `Invalid coordinate x=${payload.x} (out of screen bounds)` };
    }
    if (payload.y !== undefined && (payload.y < 0 || payload.y > 4320)) {
      return { success: false, action: payload.action, error: `Invalid coordinate y=${payload.y} (out of screen bounds)` };
    }

    // Dangerous system hotkey check
    if (payload.action === "hotkey" && payload.keys && Array.isArray(payload.keys)) {
      const normalizedKeys = payload.keys.map(k => k.toLowerCase());
      const isDangerous =
        (normalizedKeys.includes("ctrl") && normalizedKeys.includes("alt") && (normalizedKeys.includes("delete") || normalizedKeys.includes("del") || normalizedKeys.includes("backspace"))) ||
        (normalizedKeys.includes("ctrl") && normalizedKeys.includes("alt") && normalizedKeys.some(k => /^f[1-6]$/.test(k)));

      if (isDangerous) {
        return { success: false, action: payload.action, error: "Destructive or system-crashing hotkey combination prohibited." };
      }
    }

    try {
      const { stdout } = await execFileAsync("python3", [SCRIPT_PATH, "action", JSON.stringify(payload)]);
      const result: DesktopActionResult = JSON.parse(stdout.trim());
      this.logAudit({ payload, result, status: result.success ? "SUCCESS" : "FAILED" });
      return result;
    } catch (e: any) {
      console.warn("[Snow Actuator] executeAction error:", e.message);
      const errResult = {
        success: false,
        action: payload.action,
        error: e.message
      };
      this.logAudit({ payload, result: errResult, status: "ERROR" });
      return errResult;
    }
  }

  /**
   * 4. Closed-Loop Verified Action Execution
   * Captures pre/post frames, computes pixel deltas, and validates UI state transition.
   */
  public async executeVerifiedAction(payload: {
    action: "click" | "double_click" | "right_click" | "move" | "type" | "press" | "hotkey" | "scroll" | "drag" | "launch";
    x?: number;
    y?: number;
    text?: string;
    press_enter?: boolean;
    key?: string;
    keys?: string[];
    amount?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    target?: string;
    button?: "left" | "middle" | "right";
    settleDelay?: number;
    includeScreenshots?: boolean;
    maxDim?: number;
  }): Promise<VerifiedActionResult> {
    if (this.emergencyKillSwitch) {
      return {
        success: false,
        action: payload.action,
        stateChanged: false,
        visualDeltaPct: 0.0,
        error: "SAFETY HALT: Desktop Actuator is locked by Emergency Kill-Switch."
      };
    }

    try {
      const { stdout } = await execFileAsync("python3", [SCRIPT_PATH, "verified_action", JSON.stringify(payload)]);
      const result: VerifiedActionResult = JSON.parse(stdout.trim());

      const auditMsg = result.stateChanged
        ? `State change verified: ${result.visualDeltaPct}% visual delta${result.windowChanged ? ` (active window changed to "${result.postWindow?.title}")` : ""}.`
        : `No state transition detected (visual delta ${result.visualDeltaPct}%).`;

      result.verificationAudit = auditMsg;
      this.logAudit({ payload, result, status: result.success ? "VERIFIED_SUCCESS" : "VERIFIED_FAILED" });
      return result;
    } catch (e: any) {
      console.warn("[Snow Actuator] executeVerifiedAction error:", e.message);
      return {
        success: false,
        action: payload.action,
        stateChanged: false,
        visualDeltaPct: 0.0,
        error: e.message
      };
    }
  }

  /**
   * 5. Multimodal Visual Grounding & Closed-Loop Autonomous Actuation
   * Perceives the desktop, calculates normalized coordinates, actuates,
   * and verifies whether the action successfully modified the workspace state.
   */
  public async groundAndActuate(directive: string, apiKey: string): Promise<GroundAndActResult> {
    const timestamp = new Date().toISOString();

    // Step 1: Capture live desktop frame
    const shot = await this.getScreenshot(1280);
    if (!shot.success || !shot.image) {
      throw new Error(`Failed to capture desktop screenshot: ${shot.error || "Unknown error"}`);
    }

    let targetElement = "Target UI Element";
    let actionType: "click" | "double_click" | "right_click" | "move" | "type" | "press" | "hotkey" | "scroll" | "launch" = "click";
    let textToType = "";
    let normX = 0.5;
    let normY = 0.5;
    let auditExplanation = "Actuated screen based on visual perception.";

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const mimeMatch = shot.image.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const base64Data = shot.image.replace(/^data:[^;]+;base64,/, "");

        const prompt = `You are SNOW's Computer Use agent.
Look at this 1920x1080 Linux desktop screenshot.
The user wants you to perform this directive: "${directive}"

Identify the target UI element on the screen.
Calculate its center coordinates normalized between 0.0 and 1.0 (where 0.0,0.0 is top-left and 1.0,1.0 is bottom-right).

Output a STRICT JSON object in this exact format with NO markdown wrapping:
{
  "target": "name of the UI element or window",
  "normX": 0.523,
  "normY": 0.345,
  "action": "click",
  "textToType": "",
  "explanation": "why you targeted this element"
}`;

        const res = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Data } }
            ]
          }]
        });

        const raw = res.text?.trim() || "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.target) targetElement = parsed.target;
          if (typeof parsed.normX === "number") normX = Math.max(0, Math.min(1, parsed.normX));
          if (typeof parsed.normY === "number") normY = Math.max(0, Math.min(1, parsed.normY));
          if (parsed.action) actionType = parsed.action;
          if (parsed.textToType) textToType = parsed.textToType;
          if (parsed.explanation) auditExplanation = parsed.explanation;
        }
      } catch (err: any) {
        console.warn("[Snow Actuator] Grounding model notice:", err.message);
      }
    }

    // Convert normalized coordinates back to actual screen resolution
    const actualX = Math.round(normX * shot.width);
    const actualY = Math.round(normY * shot.height);

    // Step 2: Actuate on real Linux desktop with closed-loop verification
    let verifiedRes: VerifiedActionResult;
    if (actionType === "type" && textToType) {
      // First click the element to focus
      await this.executeAction({ action: "click", x: actualX, y: actualY });
      // Then type and verify the visual change
      verifiedRes = await this.executeVerifiedAction({
        action: "type",
        text: textToType,
        press_enter: true,
        settleDelay: 0.35,
        includeScreenshots: true
      });
    } else {
      verifiedRes = await this.executeVerifiedAction({
        action: actionType,
        x: actualX,
        y: actualY,
        settleDelay: 0.3,
        includeScreenshots: true
      });
    }

    const stateChanged = verifiedRes.stateChanged;
    const visualDeltaPct = verifiedRes.visualDeltaPct;
    const windowChanged = !!verifiedRes.windowChanged;

    let retryHint: string | undefined;
    if (!stateChanged && (actionType === "click" || actionType === "double_click")) {
      retryHint = `Notice: Element click at (${actualX}, ${actualY}) did not alter the screen state (visual delta: ${visualDeltaPct}%). The UI element might be inactive, busy, or slightly offset.`;
    }

    return {
      success: verifiedRes.success,
      directive,
      targetElement,
      action: actionType,
      coordinates: { x: actualX, y: actualY },
      executionResult: verifiedRes,
      stateChanged,
      visualDeltaPct,
      windowChanged,
      verificationAudit: verifiedRes.verificationAudit || "Action performed",
      auditExplanation,
      timestamp,
      screenshotSnippet: verifiedRes.preScreenshot || shot.image,
      postScreenshot: verifiedRes.postScreenshot,
      retryHint
    };
  }
}

export const desktopActuator = new DesktopActuatorService();
