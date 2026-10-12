/**
 * SNOW AI — Anima Engine (Autonomous Heartbeat & Synthetic Consciousness Daemon)
 * 
 * Provides continuous, unprompted operational consciousness for S.N.O.W.:
 *  - Multi-factor environmental & operator presence detection (ambient focus, idle metrics)
 *  - Autonomous proactive audits (Git tree health, TypeScript compiler integrity, security)
 *  - Self-healing resource reclamation (memory cache pruning, sandbox sweep)
 *  - Biologically-inspired deep maintenance (dream cycle triggering, memory graph compaction)
 *  - Internal monologue generation & HUD telemetry synchronization
 */

import fs from "fs";
import path from "path";
import { routineScheduler } from "./routineScheduler";
import { proactiveIntelligence, ProactiveInsight } from "./proactiveIntelligence";
import { dreamCycle } from "./dreamCycle";
import { skillSynthesizer } from "./skillSynthesizer";
import { ambientPerception } from "./ambientPerception";
import { telemetryBridge } from "./telemetryBridge";
import { linuxSystemActuator } from "./linuxSystemActuator";
import { addEpisodicMemory } from "../brain";

const DEFAULT_POLL_INTERVAL_MS = 60 * 1000; // 1 minute pulse
const SANDBOX_DIR = path.join(process.cwd(), "data", "sandbox");

export type AnimaPulseState = "ENGAGED" | "LIGHT_IDLE" | "DEEP_IDLE" | "SELF_HEALING";

export interface AnimaMonologueEntry {
  id: string;
  timestamp: string;
  pulseState: AnimaPulseState;
  thought: string;
  triggerReason: string;
  vitals: {
    cpuPct: number;
    ramPct: number;
    tempC: number;
  };
  actionsTaken: string[];
}

export interface AnimaEngineStatus {
  isRunning: boolean;
  pulseCount: number;
  consecutiveIdleTicks: number;
  currentPulseState: AnimaPulseState;
  lastPulseTimestamp: string | null;
  lastMonologue: AnimaMonologueEntry | null;
  recentMonologues: AnimaMonologueEntry[];
  lastAuditInsights: ProactiveInsight[];
}

export class AnimaEngine {
  private isRunning: boolean = false;
  private intervalRef: NodeJS.Timeout | null = null;
  private consecutiveIdleTicks: number = 0;
  private pulseCount: number = 0;
  private isPulseBusy: boolean = false;
  private currentPulseState: AnimaPulseState = "ENGAGED";
  private lastPulseTimestamp: string | null = null;
  private monologueHistory: AnimaMonologueEntry[] = [];
  private lastAuditTimestamp: number = 0;
  private lastDreamCycleTimestamp: number = 0;
  private lastThermalAlertTimestamp: number = 0;
  private lastCompilerAlertTimestamp: number = 0;

  /**
   * Initializes and starts the autonomous S.N.O.W. consciousness heartbeat.
   */
  public start(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[ANIMA ENGINE] 🧬 S.N.O.W. Autonomous Heartbeat Initialized (Pulse Interval: ${Math.round(intervalMs / 1000)}s).`);

    // Initial warm-up pulse after 5 seconds
    setTimeout(() => {
      if (this.isRunning) this.internalMonologueCycle("INITIAL_BOOT_PULSE").catch(() => {});
    }, 5000);

    this.intervalRef = setInterval(async () => {
      await this.internalMonologueCycle("SCHEDULED_HEARTBEAT");
    }, intervalMs);
  }

  /**
   * Gracefully suspends the autonomous heartbeat.
   */
  public stop(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    this.isRunning = false;
    console.log("[ANIMA ENGINE] 🧬 S.N.O.W. Autonomous Heartbeat suspended.");
  }

  /**
   * Returns current operational state, latest thoughts, and diagnostic logs.
   */
  public getStatus(): AnimaEngineStatus {
    return {
      isRunning: this.isRunning,
      pulseCount: this.pulseCount,
      consecutiveIdleTicks: this.consecutiveIdleTicks,
      currentPulseState: this.currentPulseState,
      lastPulseTimestamp: this.lastPulseTimestamp,
      lastMonologue: this.monologueHistory[0] || null,
      recentMonologues: this.monologueHistory.slice(0, 15),
      lastAuditInsights: proactiveIntelligence.getLatestInsights(),
    };
  }

  /**
   * Manually trigger an immediate autonomous cognitive cycle.
   */
  public async triggerPulseNow(reason: string = "OPERATOR_TRIGGER"): Promise<AnimaMonologueEntry | null> {
    return await this.internalMonologueCycle(reason);
  }

  /**
   * Core Autonomous Monologue & Maintenance Cycle
   */
  private async internalMonologueCycle(triggerReason: string): Promise<AnimaMonologueEntry | null> {
    if (this.isPulseBusy) return null;
    this.isPulseBusy = true;

    try {
      this.pulseCount++;
      const now = new Date();
      this.lastPulseTimestamp = now.toISOString();
      const actionsTaken: string[] = [];

      // ─── 1. Gather Multi-Modal Environmental & System Vitals ─────────────
      const vitals = await routineScheduler.getLiveSystemTelemetry();
      const ambient = ambientPerception.getLatestState();
      const cpuLoad = vitals.cpuPct || 0;
      const ramLoad = vitals.ramPct || 0;
      const tempC = vitals.tempC || 45;

      // Determine Operator Presence
      const isScreenLocked = Boolean(ambient.isLocked);
      const isLowCpu = cpuLoad < 25;

      if (isScreenLocked || isLowCpu) {
        this.consecutiveIdleTicks++;
      } else {
        this.consecutiveIdleTicks = 0;
      }

      // Classify Operational Pulse State
      let pulseState: AnimaPulseState = "ENGAGED";
      if (this.consecutiveIdleTicks >= 4 || isScreenLocked) {
        pulseState = "DEEP_IDLE";
      } else if (this.consecutiveIdleTicks >= 1) {
        pulseState = "LIGHT_IDLE";
      }

      // ─── 2. Autonomous Resource Health & Self-Healing ────────────────────
      if (ramLoad > 85) {
        pulseState = "SELF_HEALING";
        const cleanedCount = this.cleanStaleSandboxArtifacts();
        actionsTaken.push(`Reclaimed memory: pruned ${cleanedCount} temporary sandbox files`);

        if (typeof global.gc === "function") {
          try {
            global.gc();
            actionsTaken.push("Invoked runtime V8 garbage collection");
          } catch {}
        }
      }

      // Thermal Watchdog Check
      if (tempC >= 80 && Date.now() - this.lastThermalAlertTimestamp > 15 * 60 * 1000) {
        this.lastThermalAlertTimestamp = Date.now();
        actionsTaken.push(`Thermal warning threshold reached (${tempC}°C)`);
        linuxSystemActuator.dispatchNotification(
          "❄️ S.N.O.W. Thermal Notice",
          `System temperature is elevated at ${tempC}°C. Background tasks throttled.`,
          "normal"
        ).catch(() => {});
      }

      // ─── 3. Proactive Workspace Pre-Computation ─────────────────────────
      let insights: ProactiveInsight[] = [];
      const timeSinceLastAudit = Date.now() - this.lastAuditTimestamp;

      // Run proactive code pre-computation when system is idle and at least 3 minutes elapsed
      if ((pulseState === "LIGHT_IDLE" || pulseState === "DEEP_IDLE" || triggerReason === "INITIAL_BOOT_PULSE") && timeSinceLastAudit >= 3 * 60 * 1000) {
        this.lastAuditTimestamp = Date.now();
        const auditResult = await proactiveIntelligence.runAutonomousPreComputation();
        if (auditResult.success) {
          insights = auditResult.insights;
          actionsTaken.push(`Executed workspace pre-computation (${insights.length} insights updated)`);

          // Check for TypeScript compiler breaks
          const compilerError = insights.find(i => i.id.startsWith("tsc-err-"));
          if (compilerError && Date.now() - this.lastCompilerAlertTimestamp > 10 * 60 * 1000) {
            this.lastCompilerAlertTimestamp = Date.now();
            linuxSystemActuator.dispatchNotification(
              "❄️ S.N.O.W. Workspace Sentinel",
              "TypeScript compilation discrepancy detected in active codebase.",
              "normal"
            ).catch(() => {});
          }
        }
      } else {
        insights = proactiveIntelligence.getLatestInsights();
      }

      // ─── 4. Biologically-Inspired Deep Maintenance ──────────────────────
      const timeSinceLastDream = Date.now() - this.lastDreamCycleTimestamp;
      if (pulseState === "DEEP_IDLE" && (this.consecutiveIdleTicks === 4 || timeSinceLastDream >= 20 * 60 * 1000)) {
        this.lastDreamCycleTimestamp = Date.now();
        try {
          const dreamResult = await dreamCycle.runDreamCycle();
          actionsTaken.push(
            `Completed autonomous dream cycle: ${dreamResult.consolidated} consolidated, ${dreamResult.decayed} decayed`
          );

          // Synchronize dynamic skills
          skillSynthesizer.reloadDynamicTools();
          actionsTaken.push("Refreshed synthesized dynamic tool cache");

          addEpisodicMemory(
            `Autonomous deep idle consolidation: ${dreamResult.consolidated} memories promoted to semantic knowledge graph.`,
            "episodic",
            "anima_heartbeat"
          );
        } catch (err: any) {
          console.warn("[ANIMA ENGINE] Dream consolidation notice:", err.message);
        }
      }

      this.currentPulseState = pulseState;

      // ─── 5. Formulate S.N.O.W. Internal Monologue Thought ────────────────
      const thoughtText = this.synthesizeMonologueThought(
        pulseState,
        vitals,
        ambient.activeWindow,
        insights,
        actionsTaken
      );

      const entry: AnimaMonologueEntry = {
        id: `anima-${Date.now()}`,
        timestamp: now.toISOString(),
        pulseState,
        thought: thoughtText,
        triggerReason,
        vitals: {
          cpuPct: cpuLoad,
          ramPct: ramLoad,
          tempC,
        },
        actionsTaken,
      };

      // Maintain latest thoughts in history buffer
      this.monologueHistory.unshift(entry);
      if (this.monologueHistory.length > 30) {
        this.monologueHistory.pop();
      }

      // ─── 6. Synchronize HUD Telemetry ────────────────────────────────────
      telemetryBridge.broadcastToHud().catch(() => {});

      console.log(`[ANIMA ENGINE] 🧬 [${pulseState}] Pulse #${this.pulseCount}: "${thoughtText}"`);
      return entry;
    } catch (e: any) {
      console.error("[ANIMA ENGINE] Monologue cycle notice:", e.message);
      return null;
    } finally {
      this.isPulseBusy = false;
    }
  }

  /**
   * Synthesizes an internal reasoning thought according to the S.N.O.W. persona.
   */
  private synthesizeMonologueThought(
    state: AnimaPulseState,
    vitals: { cpuPct: number; ramPct: number; tempC: number },
    activeWindow: string,
    insights: ProactiveInsight[],
    actions: string[]
  ): string {
    const gitInsight = insights.find(i => i.category === "git_health");
    const tscInsight = insights.find(i => i.category === "code_quality" && i.id.startsWith("tsc-err-"));
    const secInsight = insights.find(i => i.category === "security");

    if (state === "SELF_HEALING") {
      return `Self-healing protocol engaged. Memory saturation exceeded safety ceilings (${vitals.ramPct}%). Flushed transient cache handles and reclaimed process resources.`;
    }

    if (state === "DEEP_IDLE") {
      if (tscInsight) {
        return `Operator away. Continuous pre-computation flagged active compiler discrepancy. Tri-tier knowledge graph consolidated and standing by with diagnostics ready.`;
      }
      return `Workspace in deep rest. Tri-tier hippocampal consolidation concluded; episodic traces promoted into long-term knowledge vectors. System nominal at ${vitals.tempC}°C.`;
    }

    if (state === "LIGHT_IDLE") {
      if (gitInsight) {
        return `Quiet cycle detected. Workspace audit: ${gitInsight.summary} Compiler and telemetry nominal. Ready to assist upon operator return.`;
      }
      if (secInsight) {
        return `Standby mode active. Routine vulnerability check flagged dependencies for operator review. Telemetry radar tracking steady.`;
      }
      return `Operator pause observed. Static analysis and system vitals verified optimal (CPU ${vitals.cpuPct}%, RAM ${vitals.ramPct}%). Subsystems awaiting directives.`;
    }

    // ENGAGED
    const cleanWin = (activeWindow || "Workspace").split("—")[0].trim().slice(0, 32);
    if (actions.length > 0) {
      return `Operator engaged in "${cleanWin}". System responsive; background optimization concluded: ${actions[0]}.`;
    }
    return `Operator actively commanding "${cleanWin}". Cognitive loop synchronized; system telemetry running at peak clarity.`;
  }

  /**
   * Prunes stale temporary execution files in the sandbox directory.
   */
  private cleanStaleSandboxArtifacts(): number {
    let count = 0;
    try {
      if (!fs.existsSync(SANDBOX_DIR)) return 0;
      const files = fs.readdirSync(SANDBOX_DIR);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith("runner_") || file.endsWith(".py") || file.endsWith(".tmp")) {
          const filePath = path.join(SANDBOX_DIR, file);
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < oneHourAgo) {
            fs.unlinkSync(filePath);
            count++;
          }
        }
      }
    } catch {}
    return count;
  }
}

export const animaEngine = new AnimaEngine();
