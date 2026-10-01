import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class ComputerUseService {
  /**
   * Types some text at the current cursor position.
   */
  public async typeText(text: string): Promise<string> {
    try {
      // Escape single quotes for bash
      const safeText = text.replace(/'/g, "'\\''");
      await execAsync(`xdotool type --delay 12 '${safeText}'`);
      return "Success: Typed text.";
    } catch (e: any) {
      return `Failed to type text: ${e.message}`;
    }
  }

  /**
   * Presses a specific key or combination (e.g. "Return", "ctrl+c", "alt+Tab").
   */
  public async hotkey(keys: string): Promise<string> {
    try {
      await execAsync(`xdotool key ${keys}`);
      return `Success: Pressed ${keys}.`;
    } catch (e: any) {
      return `Failed to press ${keys}: ${e.message}`;
    }
  }

  /**
   * Moves the mouse to specific coordinates.
   */
  public async mouseMove(x: number, y: number): Promise<string> {
    try {
      await execAsync(`xdotool mousemove ${x} ${y}`);
      return `Success: Moved mouse to ${x},${y}.`;
    } catch (e: any) {
      return `Failed to move mouse: ${e.message}`;
    }
  }

  /**
   * Clicks a mouse button (1=left, 2=middle, 3=right).
   */
  public async mouseClick(button: number = 1): Promise<string> {
    try {
      await execAsync(`xdotool click ${button}`);
      return `Success: Clicked button ${button}.`;
    } catch (e: any) {
      return `Failed to click: ${e.message}`;
    }
  }

  /**
   * Gets the currently active window title.
   */
  public async getActiveWindow(): Promise<string> {
    try {
      const { stdout } = await execAsync("xdotool getactivewindow getwindowname");
      return stdout.trim();
    } catch (e: any) {
      return `Failed to get active window: ${e.message}`;
    }
  }

  /**
   * Takes a screenshot and saves it to a temporary path.
   */
  public async takeScreenshot(): Promise<string> {
    try {
      const path = `/tmp/snow_screenshot_${Date.now()}.png`;
      await execAsync(`scrot ${path}`);
      return `Success: Screenshot saved to ${path}`;
    } catch (e: any) {
      return `Failed to take screenshot: ${e.message}`;
    }
  }
}

export const computerUse = new ComputerUseService();
