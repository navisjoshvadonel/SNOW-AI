/**
 * SNOW AI — Autonomous Hierarchical Goal Engine & Continuous OODA Daemon
 * Implements the continuous cognitive loop (Observe, Orient, Decide, Act):
 * Pursues multi-step background objectives, decomposes goals into atomic subtasks,
 * executes tools autonomously across Linux system actuators, sandboxes, and file operations,
 * self-corrects using Reflexion, and tracks progress.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
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
  GoalSubtask,
  addMemory,
  addEpisodicMemory
} from "../brain";
import { desktopActuator } from "./desktopActuator";
import { runPythonCode } from "../python_sandbox";
import { reflexionEngine } from "./reflexionEngine";
import { skillSynthesizer } from "./skillSynthesizer";
import { linuxSystemActuator } from "./linuxSystemActuator";
import { snowPlanner } from "./snowPlanner";
import { snowCoder } from "./snowCoder";
import { snowGuard } from "./snowGuard";

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

  public ensureStarted(): void {
    if (!this.isRunning) {
      this.start();
    }
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
      // Check if all subtasks completed or skipped
      const allCompleted = currentGoal.subtasks.every(s => s.status === "completed" || s.status === "skipped");
      if (allCompleted) {
        updateGoalStatus(currentGoal.id, "completed", 100, new Date().toISOString());
        logGoalEvent(currentGoal.id, `Goal successfully completed with 100% progress!`);
        console.log(`[GoalEngine] 🎯 Autonomous Goal COMPLETED: "${currentGoal.title}"`);
        this.notifyCompletion(currentGoal.title);
      } else {
        const anyFailedExhausted = currentGoal.subtasks.some(s => s.status === "failed" && s.retryCount >= 2);
        if (anyFailedExhausted) {
          updateGoalStatus(currentGoal.id, "failed");
          logGoalEvent(currentGoal.id, `Goal halted due to unresolvable subtask failure.`);
          console.warn(`[GoalEngine] ⚠️ Autonomous Goal FAILED: "${currentGoal.title}"`);
        }
      }
      return;
    }

    // 3. ACT: Execute the atomic subtask
    await this.executeSubtask(currentGoal, pendingSubtask);
  }

  /**
   * Decomposes a high-level goal into structured subtasks using Snow-Planner
   */
  private async decomposeGoal(goal: AutonomousGoal): Promise<void> {
    updateGoalStatus(goal.id, "planning");
    logGoalEvent(goal.id, "Snow-Planner formulating milestone DAG...");

    const plan = await snowPlanner.createPlan(goal.title, goal.id, { description: goal.description });
    const subtasksCreated = plan.milestones.map((m) => ({
      stepOrder: m.stepOrder,
      title: m.title,
      assignedTool: m.assignedTool,
      inputPayload: m.inputPayload,
    }));

    addGoalSubtasks(goal.id, subtasksCreated);
    console.log(`[GoalEngine] 📋 Goal "${goal.title}" decomposed into ${subtasksCreated.length} milestone subtask(s) via Snow-Planner.`);
  }

  /**
   * Executes a single atomic subtask and handles self-healing reflexion retry
   */
  private async executeSubtask(goal: AutonomousGoal, subtask: GoalSubtask): Promise<void> {
    updateSubtaskStatus(subtask.id, "running");
    logGoalEvent(goal.id, `Executing subtask #${subtask.stepOrder}: "${subtask.title}" via [${subtask.assignedTool}]`, subtask.id);
    console.log(`[GoalEngine] ⚙️ Executing subtask #${subtask.stepOrder}: "${subtask.title}" via ${subtask.assignedTool}...`);

    let payload: any = {};
    try {
      payload = typeof subtask.inputPayload === "string" ? JSON.parse(subtask.inputPayload) : subtask.inputPayload;
    } catch {
      payload = { command: subtask.inputPayload };
    }

    try {
      let resultSummary = "";
      let success = false;

      // ── 1. Linux System Actuator ──
      if (subtask.assignedTool === "LinuxSystem") {
        const action = payload.action || "state";

        if (action === "set_volume") {
          const res = await linuxSystemActuator.setVolume(Number(payload.volume || 50));
          resultSummary = `Volume set to ${res.volumePct}% (success: ${res.success})`;
          success = res.success;
        } else if (action === "toggle_mute") {
          const res = await linuxSystemActuator.toggleMute();
          resultSummary = `Mute toggled. Currently muted: ${res.muted}`;
          success = res.success;
        } else if (action === "get_audio") {
          const res = await linuxSystemActuator.getAudioStatus();
          resultSummary = `Audio Status: ${res.volumePct}%, Muted: ${res.muted}`;
          success = res.success;
        } else if (action === "power_profile") {
          const res = await linuxSystemActuator.setPowerProfile(payload.profile || "balanced");
          resultSummary = `Power profile set to: ${res.profile}`;
          success = res.success;
        } else if (action === "media") {
          const mAction = payload.mediaAction || payload.actionParam || "play-pause";
          const res = await linuxSystemActuator.mediaControl(mAction);
          resultSummary = `Media directive '${mAction}' executed on player: ${res.player || "default"}`;
          success = res.success;
        } else if (action === "focus_window") {
          const res = await linuxSystemActuator.focusWindow(payload.title || "");
          resultSummary = `Focused window matching: "${res.title}"`;
          success = res.success;
        } else if (action === "close_window") {
          const res = await linuxSystemActuator.closeWindow(payload.title || "");
          resultSummary = `Closed window matching: "${res.title}"`;
          success = res.success;
        } else if (action === "notify") {
          const res = await linuxSystemActuator.dispatchNotification(
            payload.title || "Snow Notification",
            payload.message || "Autonomous directive completed",
            payload.urgency || "normal"
          );
          resultSummary = `Desktop notification dispatched (success: ${res.success})`;
          success = res.success;
        } else if (action === "launch") {
          const res = await linuxSystemActuator.launchApplication(payload.app || "");
          resultSummary = `Application '${res.app}' launch triggered`;
          success = res.success;
        } else if (action === "lock") {
          const res = await linuxSystemActuator.lockScreen();
          resultSummary = `Session lock dispatched (success: ${res.success})`;
          success = res.success;
        } else {
          const state = await linuxSystemActuator.getSystemActuatorState();
          resultSummary = `System State: Volume ${state.audio.volumePct}%, Power ${state.power.activeProfile}, Windows: ${state.windowsCount}`;
          success = true;
        }

      // ── 2. Safe File Operations ──
      } else if (subtask.assignedTool === "FileOperation") {
        const action = payload.action || "read";
        const filePath = payload.path ? path.resolve(process.cwd(), payload.path) : "";

        if (action === "read") {
          if (!fs.existsSync(filePath)) throw new Error(`File does not exist: ${payload.path}`);
          const content = fs.readFileSync(filePath, "utf8");
          resultSummary = `Read ${content.length} bytes from ${payload.path}:\n${content.slice(0, 300)}`;
          success = true;
        } else if (action === "write") {
          if (!filePath) throw new Error("Missing file path for write operation.");
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, payload.content || "", "utf8");
          resultSummary = `Wrote ${payload.content?.length || 0} bytes to ${payload.path}`;
          success = true;
        } else if (action === "append") {
          if (!filePath) throw new Error("Missing file path for append operation.");
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.appendFileSync(filePath, payload.content || "", "utf8");
          resultSummary = `Appended ${payload.content?.length || 0} bytes to ${payload.path}`;
          success = true;
        } else if (action === "list") {
          const dirPath = payload.path ? path.resolve(process.cwd(), payload.path) : process.cwd();
          const items = fs.readdirSync(dirPath).slice(0, 20);
          resultSummary = `Directory items (${items.length}): ${items.join(", ")}`;
          success = true;
        } else if (action === "exists") {
          const exists = fs.existsSync(filePath);
          resultSummary = `File ${payload.path} exists: ${exists}`;
          success = true;
        } else {
          throw new Error(`Unknown FileOperation action: ${action}`);
        }

      // ── 3. Shell Execution ──
      } else if (subtask.assignedTool === "Bash") {
        const cmd = payload.command || payload.cmd || "echo 'no command'";
        // Safety containment check
        if (/\b(mkfs|dd\s+if=|rm\s+-rf\s+\/|format)\b/.test(cmd)) {
          throw new Error("Dangerous command blocked by autonomous safety filter.");
        }
        const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, cwd: process.cwd() });
        resultSummary = stdout.trim() || stderr.trim() || "Command executed without output.";
        success = true;

      // ── 4. Python Sandbox Execution ──
      } else if (subtask.assignedTool === "PythonSandbox") {
        const code = payload.code || "print('ok')";
        const allowNet = Boolean(payload.allow_network || payload.allowNetwork || /urllib|http|requests|curl/i.test(code));
        const res = await runPythonCode(code, 15000, { allowNetwork: allowNet });
        resultSummary = res.stdout || res.stderr || "Python script executed.";
        success = res.success;

      // ── 5. Computer Use / Desktop Automation ──
      } else if (subtask.assignedTool === "ComputerUse") {
        const actionRes = await desktopActuator.executeVerifiedAction(payload);
        resultSummary = actionRes.verificationAudit || "Action completed";
        success = actionRes.success;

      // ── 6. Skill Synthesizer ──
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

      // ── 7. Coder Specialist Execution ──
      } else if (subtask.assignedTool === "Coder") {
        const res = await snowCoder.execute({
          code: payload.code || "",
          language: payload.language || "python",
          autoFix: Boolean(payload.auto_fix ?? true),
          timeoutMs: payload.timeout_ms || 10000,
        });
        resultSummary = res.stdout || res.stderr || "Code executed.";
        success = res.success;

      // ── 8. Security Guard Execution ──
      } else if (subtask.assignedTool === "SecurityGuard") {
        if (payload.action === "audit_command") {
          const audit = snowGuard.auditCommand(payload.command || "");
          resultSummary = audit.allowed ? "Command permitted" : (audit.violation || "Blocked");
          success = audit.allowed;
        } else {
          const status = snowGuard.getSecurityStatus();
          resultSummary = `Security posture: ${status.posture}, active rules: ${status.activeRulesCount}`;
          success = true;
        }

      // ── 9. Notification Tool ──
      } else if (subtask.assignedTool === "Notification") {
        const title = payload.title || "Snow Notification";
        const message = payload.message || payload.text || "Autonomous milestone verified";
        const urgency = payload.urgency || "normal";
        const res = await linuxSystemActuator.dispatchNotification(title, message, urgency);
        resultSummary = `Notification dispatched: "${title} - ${message}"`;
        success = true;

      // ── 10. Memory Store Tool ──
      } else if (subtask.assignedTool === "MemoryStore") {
        if (payload.action === "fact" && payload.source && payload.target) {
          addMemory(payload.source, payload.rel || "state", payload.target, (payload.category as any) || "Preference");
          resultSummary = `Semantic memory node created: ${payload.source} -> ${payload.target}`;
        } else {
          addEpisodicMemory(payload.content || payload.text || `Goal milestone completed: ${subtask.title}`, "episodic", "autonomous_goal");
          resultSummary = `Episodic memory logged for milestone: ${subtask.title}`;
        }
        success = true;

      // ── 11. Fallback ──
      } else {
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
      const retryCount = (subtask.retryCount || 0) + 1;

      // Autonomous Reflexion Self-Correction & Retry Loop
      if (retryCount <= 2) {
        // Consult reflexion engine
        const apiKey = process.env.GEMINI_API_KEY || "";
        reflexionEngine.analyzeFailure({
          contextQuery: `Goal: "${goal.title}" — Subtask: "${subtask.title}"`,
          toolName: subtask.assignedTool,
          toolInput: payload,
          errorMessage: err.message
        }, apiKey).catch(() => {});

        // Reset to pending for an autonomous retry on the next OODA tick
        updateSubtaskStatus(subtask.id, "pending", `Auto-retry scheduled (#${retryCount}/2): ${err.message}`, true);
        logGoalEvent(goal.id, `Subtask #${subtask.stepOrder} failed ("${err.message}"). Reflexion self-healing engaged — queued for retry (${retryCount}/2).`, subtask.id);
      } else {
        // Exhausted retries
        updateSubtaskStatus(subtask.id, "failed", err.message);
        logGoalEvent(goal.id, `Subtask #${subtask.stepOrder} failed after ${retryCount} attempts: ${err.message}`, subtask.id);
      }
    }
  }

  /**
   * Non-intrusive Linux desktop notification on completion
   */
  private notifyCompletion(goalTitle: string): void {
    linuxSystemActuator.dispatchNotification(
      "Goal Completed",
      `Autonomous objective completed: ${goalTitle}`,
      "normal"
    ).catch(() => {});
  }
}

export const goalEngine = new GoalEngineService();
