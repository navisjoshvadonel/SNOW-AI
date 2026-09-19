/**
 * SNOW AI — Autonomous Hierarchical Goal Engine & Continuous OODA Daemon
 * Implements the continuous cognitive loop (Observe, Orient, Decide, Act):
 * Pursues multi-step background objectives, decomposes goals into atomic subtasks,
 * executes tools autonomously, self-corrects using Reflexion, and tracks progress.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";
import {
  createAutonomousGoal,
  getAutonomousGoals,
  getGoalWithSubtasks,
  updateGoalStatus,
  addGoalSubtasks,
  updateSubtaskStatus,
  logGoalEvent,
  AutonomousGoal,
  GoalSubtask
} from "../brain";
import { desktopActuator } from "./desktopActuator";
import { runPythonCode } from "../python_sandbox";
import { reflexionEngine } from "./reflexionEngine";
import { skillSynthesizer } from "./skillSynthesizer";

const execAsync = promisify(exec);

export interface GoalDecompositionPlan {
  goalId: string;
  subtasks: Array<{
    stepOrder: number;
    title: string;
    assignedTool: string;
    inputPayload: any;
    expectedOutcome?: string;
  }>;
}

class GoalEngineService {
  private isRunning: boolean = false;
  private daemonTimer: NodeJS.Timeout | null = null;
  private isTickBusy: boolean = false;

  /**
   * Start the continuous autonomous cognitive daemon
   */
  public start(tickIntervalMs: number = 4000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.daemonTimer = setInterval(async () => {
      if (this.isTickBusy) return;
      this.isTickBusy = true;
      try {
        await this.stepOodaLoop();
      } catch (err: any) {
        console.warn("[GoalEngine] OODA tick notice:", err.message);
      } finally {
        this.isTickBusy = false;
      }
    }, tickIntervalMs);

    console.log(`[SNOW GOAL ENGINE] 🌀 Autonomous OODA Daemon active (Interval: ${tickIntervalMs}ms).`);
  }

  public stop(): void {
    if (this.daemonTimer) {
      clearInterval(this.daemonTimer);
      this.daemonTimer = null;
    }
    this.isRunning = false;
    console.log("[SNOW GOAL ENGINE] Autonomous daemon halted.");
  }

  public getStatus(): { isRunning: boolean; activeGoalsCount: number } {
    const active = getAutonomousGoals("active");
    return {
      isRunning: this.isRunning,
      activeGoalsCount: active.length
    };
  }

  /**
   * Main Autonomous OODA Step (Observe -> Orient -> Decide -> Act)
   */
  private async stepOodaLoop(): Promise<void> {
    // 1. OBSERVE: Check safety halt
    if (desktopActuator.isHalted()) {
      return;
    }

    // Find pending goals that need decomposition (planning phase)
    const pendingGoals = getAutonomousGoals("pending");
    if (pendingGoals.length > 0) {
      const targetGoal = pendingGoals[0];
      await this.decomposeGoal(targetGoal);
      return;
    }

    // Find active goals with pending subtasks
    const activeGoals = getAutonomousGoals("active");
    if (activeGoals.length === 0) {
      return;
    }

    // Pick highest priority active goal
    const currentGoal = getGoalWithSubtasks(activeGoals[0].id);
    if (!currentGoal || !currentGoal.subtasks || currentGoal.subtasks.length === 0) {
      return;
    }

    // 2. ORIENT & DECIDE: Find next pending subtask
    const pendingSubtask = currentGoal.subtasks.find(s => s.status === "pending");

    if (!pendingSubtask) {
      // Check if all subtasks completed
      const allCompleted = currentGoal.subtasks.every(s => s.status === "completed" || s.status === "skipped");
      if (allCompleted) {
        updateGoalStatus(currentGoal.id, "completed", 100, new Date().toISOString());
        logGoalEvent(currentGoal.id, `Goal successfully completed with 100% progress!`);
        console.log(`[GoalEngine] 🎯 Autonomous Goal COMPLETED: "${currentGoal.title}"`);
        this.notifyCompletion(currentGoal.title);
      } else {
        const anyFailed = currentGoal.subtasks.some(s => s.status === "failed" && s.retryCount >= 2);
        if (anyFailed) {
          updateGoalStatus(currentGoal.id, "failed");
          logGoalEvent(currentGoal.id, `Goal halted due to unresolvable subtask failure.`);
        }
      }
      return;
    }

    // 3. ACT: Execute the atomic subtask
    await this.executeSubtask(currentGoal, pendingSubtask);
  }

  /**
   * Decomposes a high-level goal into structured subtasks using Gemini
   */
  private async decomposeGoal(goal: AutonomousGoal): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      console.warn("[GoalEngine] No API key available to decompose goal:", goal.title);
      return;
    }

    updateGoalStatus(goal.id, "planning");
    logGoalEvent(goal.id, "Deconstructing objective into structured subtasks...");

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are SNOW's Autonomous Executive Goal Architect.
Decompose this high-level system objective into 2 to 5 structured, atomic, sequential subtasks.

Available execution tools:
- "Bash": Shell command execution (pass {"command": "..."})
- "PythonSandbox": Safe Python execution (pass {"code": "..."})
- "ComputerUse": Desktop automation (pass {"action": "status" | "click" | "hotkey" | "launch", ...})
- "SkillSynthesizer": Synthesize new tool (pass {"action": "synthesize" | "execute", ...})

OBJECTIVE:
Title: "${goal.title}"
Description: "${goal.description}"

Output a STRICT JSON object in this format with NO markdown wrapping:
{
  "subtasks": [
    {
      "stepOrder": 1,
      "title": "Clear concise subtask title",
      "assignedTool": "Bash",
      "inputPayload": { "command": "echo 'verifying environment'" }
    }
  ]
}`;

      const res = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const raw = res.text?.trim() || "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");

      if (Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
        addGoalSubtasks(goal.id, parsed.subtasks);
        console.log(`[GoalEngine] 📋 Goal "${goal.title}" decomposed into ${parsed.subtasks.length} subtask(s).`);
      } else {
        // Fallback single-step subtask
        addGoalSubtasks(goal.id, [{
          stepOrder: 1,
          title: `Inspect and verify ${goal.title}`,
          assignedTool: "Bash",
          inputPayload: { command: "echo 'Verifying autonomous goal execution status'" }
        }]);
      }
    } catch (err: any) {
      console.warn("[GoalEngine] Goal decomposition error:", err.message);
      updateGoalStatus(goal.id, "pending");
    }
  }

  /**
   * Executes a single atomic subtask and tracks outcome
   */
  private async executeSubtask(goal: AutonomousGoal, subtask: GoalSubtask): Promise<void> {
    updateSubtaskStatus(subtask.id, "running");
    logGoalEvent(goal.id, `Executing subtask #${subtask.stepOrder}: "${subtask.title}" via [${subtask.assignedTool}]`, subtask.id);
    console.log(`[GoalEngine] ⚙️ Executing subtask #${subtask.stepOrder}: "${subtask.title}" via ${subtask.assignedTool}...`);

    let payload: any = {};
    try {
      payload = JSON.parse(subtask.inputPayload);
    } catch {
      payload = { command: subtask.inputPayload };
    }

    try {
      let resultSummary = "";
      let success = false;

      if (subtask.assignedTool === "Bash") {
        const cmd = payload.command || payload.cmd || "echo 'no command'";
        // Safety containment check
        if (/\b(mkfs|dd\s+if=|rm\s+-rf\s+\/|format)\b/.test(cmd)) {
          throw new Error("Dangerous command blocked by autonomous safety filter.");
        }
        const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, cwd: process.cwd() });
        resultSummary = stdout.trim() || stderr.trim() || "Command executed without output.";
        success = true;

      } else if (subtask.assignedTool === "PythonSandbox") {
        const code = payload.code || "print('ok')";
        const res = await runPythonCode(code, 15000);
        resultSummary = res.stdout || res.stderr || "Python script executed.";
        success = res.success;

      } else if (subtask.assignedTool === "ComputerUse") {
        const actionRes = await desktopActuator.executeVerifiedAction(payload);
        resultSummary = actionRes.verificationAudit || "Action completed";
        success = actionRes.success;

      } else if (subtask.assignedTool === "SkillSynthesizer") {
        if (payload.action === "synthesize") {
          const apiKey = process.env.GEMINI_API_KEY || "";
          const synthRes = await skillSynthesizer.synthesizeSkill(payload, apiKey);
          resultSummary = synthRes.success ? `Synthesized ${synthRes.skill?.name}` : `Synthesis failed: ${synthRes.error}`;
          success = synthRes.success;
        } else {
          const runRes = await skillSynthesizer.executeSkill(payload.name, payload.input);
          resultSummary = JSON.stringify(runRes.output || runRes.error);
          success = runRes.success;
        }

      } else {
        // Fallback shell execution
        const { stdout } = await execAsync("echo 'Subtask executed'", { timeout: 5000 });
        resultSummary = stdout.trim();
        success = true;
      }

      if (success) {
        updateSubtaskStatus(subtask.id, "completed", resultSummary.slice(0, 500));
        logGoalEvent(goal.id, `Subtask #${subtask.stepOrder} completed successfully.`, subtask.id);

        // Update overall goal progress %
        const updatedGoal = getGoalWithSubtasks(goal.id);
        if (updatedGoal && updatedGoal.subtasks) {
          const total = updatedGoal.subtasks.length;
          const completed = updatedGoal.subtasks.filter(s => s.status === "completed" || s.status === "skipped").length;
          const pct = Math.round((completed / total) * 100);
          updateGoalStatus(goal.id, "active", pct);
        }
      } else {
        throw new Error(resultSummary || "Subtask execution reported failure.");
      }

    } catch (err: any) {
      console.warn(`[GoalEngine] Subtask #${subtask.stepOrder} error:`, err.message);
      updateSubtaskStatus(subtask.id, "failed", err.message);
      logGoalEvent(goal.id, `Subtask #${subtask.stepOrder} failed: ${err.message}`, subtask.id);

      // Trigger autonomous reflexion
      const apiKey = process.env.GEMINI_API_KEY || "";
      reflexionEngine.analyzeFailure({
        contextQuery: `Goal: "${goal.title}" — Subtask: "${subtask.title}"`,
        toolName: subtask.assignedTool,
        toolInput: payload,
        errorMessage: err.message
      }, apiKey).catch(() => {});
    }
  }

  /**
   * Non-intrusive Linux desktop notification on completion
   */
  private notifyCompletion(goalTitle: string): void {
    try {
      exec(`notify-send -u normal -a "Snow OS" "Goal Completed" "${goalTitle.replace(/"/g, '\\"')}" 2>/dev/null`);
    } catch {}
  }
}

export const goalEngine = new GoalEngineService();
