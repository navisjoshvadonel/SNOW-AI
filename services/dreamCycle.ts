/**
 * SNOW AI — Phase 4: Tri-Tier Memory Consolidation & Dream Cycle
 *
 * This service implements a biologically-inspired memory consolidation system
 * modeled on the hippocampal-neocortical memory transfer that occurs in human sleep.
 *
 * The Three Tiers:
 *   1. WORKING MEMORY     → Active conversation turns (volatile, in-context)
 *   2. EPISODIC MEMORY    → Raw experience log (timestamped events from interactions)
 *   3. SEMANTIC MEMORY    → Distilled abstract knowledge (MemoryNodes in graph DB)
 *
 * Dream Cycle Phases (triggered during idle periods):
 *   Phase A — SLOW WAVE (Consolidation):
 *     Scans recent episodic memories, identifies key facts & patterns, promotes
 *     them to semantic memory nodes via Gemini distillation.
 *   Phase B — REM (Conflict Resolution):
 *     Detects contradictory semantic memory nodes, resolves conflicts by keeping
 *     the higher-confidence version, logs resolution rationale.
 *   Phase C — DECAY (Forgetting Curve):
 *     Applies exponential decay to stale, low-confidence, low-access memory nodes.
 *     Removes nodes that have decayed below the eviction threshold.
 *   Phase D — REPLAY (Procedural Reinforcement):
 *     Strengthens frequently-accessed procedural rules and demotes unused ones.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";
import {
  loadMemories,
  addMemory,
  deleteMemory,
  getAllProceduralRules,
  recordProceduralRule,
  getDb,
  EpisodicMemory,
  ConsolidationLog,
  addEpisodicMemory,
  getRecentEpisodicMemories,
  markEpisodicConsolidated,
  logConsolidation,
  getConsolidationLogs,
  decayMemories,
  MemoryNode,
} from "../brain";

const execAsync = promisify(exec);

// ─── Configuration ──────────────────────────────────────────────────────────

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;        // 5 min of no user activity → enter dream
const DREAM_CYCLE_INTERVAL_MS = 3 * 60 * 1000;  // Check for idle every 3 min
const EPISODIC_BATCH_SIZE = 20;                  // Max episodes to consolidate per cycle
const DECAY_RATE = 0.05;                         // 5% confidence decay per cycle for stale nodes
const EVICTION_THRESHOLD = 0.15;                // Remove nodes below 15% confidence
const CONFLICT_SIMILARITY_THRESHOLD = 0.82;     // Cosine similarity to trigger conflict check

// ─── Dream Cycle Service ────────────────────────────────────────────────────

class DreamCycleService {
  private isRunning: boolean = false;
  private isDreaming: boolean = false;
  private daemonTimer: NodeJS.Timeout | null = null;
  private lastActivityMs: number = Date.now();
  private totalDreamCycles: number = 0;
  private totalConsolidated: number = 0;
  private totalDecayed: number = 0;

  /** Call this whenever the user sends a message to reset idle timer */
  public recordActivity(): void {
    this.lastActivityMs = Date.now();
    // If we're dreaming, interrupt gracefully
    if (this.isDreaming) {
      console.log("[DreamCycle] 💤→☀️ Activity detected — dream cycle interrupted.");
      this.isDreaming = false;
    }
  }

  public start(intervalMs: number = DREAM_CYCLE_INTERVAL_MS): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.daemonTimer = setInterval(async () => {
      if (this.isDreaming) return; // already in cycle
      const idleMs = Date.now() - this.lastActivityMs;
      if (idleMs >= IDLE_THRESHOLD_MS) {
        await this.runDreamCycle();
      }
    }, intervalMs);

    console.log(`[SNOW DREAM CYCLE] 🌙 Memory consolidation daemon active (idle threshold: ${IDLE_THRESHOLD_MS / 60000}m).`);
  }

  public stop(): void {
    if (this.daemonTimer) {
      clearInterval(this.daemonTimer);
      this.daemonTimer = null;
    }
    this.isRunning = false;
    this.isDreaming = false;
    console.log("[SNOW DREAM CYCLE] Memory consolidation daemon stopped.");
  }

  public getStatus(): {
    isRunning: boolean;
    isDreaming: boolean;
    idleSec: number;
    totalDreamCycles: number;
    totalConsolidated: number;
    totalDecayed: number;
  } {
    return {
      isRunning: this.isRunning,
      isDreaming: this.isDreaming,
      idleSec: Math.round((Date.now() - this.lastActivityMs) / 1000),
      totalDreamCycles: this.totalDreamCycles,
      totalConsolidated: this.totalConsolidated,
      totalDecayed: this.totalDecayed,
    };
  }

  /** Manually trigger a full dream cycle (for testing or forced consolidation) */
  public async triggerNow(apiKey?: string): Promise<{ consolidated: number; decayed: number; resolved: number }> {
    if (this.isDreaming) {
      return { consolidated: 0, decayed: 0, resolved: 0 };
    }
    return this.runDreamCycle(apiKey);
  }

  // ─── Main Dream Cycle ────────────────────────────────────────────────────

  private async runDreamCycle(apiKeyOverride?: string): Promise<{ consolidated: number; decayed: number; resolved: number }> {
    this.isDreaming = true;
    this.totalDreamCycles++;
    const cycleId = `dream-${Date.now()}`;
    const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY || "";

    console.log(`\n[DreamCycle] ╔══ 🌙 DREAM CYCLE #${this.totalDreamCycles} STARTED ══╗`);

    let consolidated = 0;
    let decayed = 0;
    let resolved = 0;

    try {
      // Phase A: Slow-Wave Consolidation (Episodic → Semantic)
      if (apiKey) {
        consolidated = await this.phaseSlowWaveConsolidation(apiKey, cycleId);
        this.totalConsolidated += consolidated;
      }

      // Phase B: REM Conflict Resolution
      if (apiKey && this.isDreaming) {
        resolved = await this.phaseRemConflictResolution(apiKey, cycleId);
      }

      // Phase C: Decay & Eviction (forgetting curve)
      if (this.isDreaming) {
        decayed = await this.phaseDecayAndEviction(cycleId);
        this.totalDecayed += decayed;
      }

      // Phase D: Procedural Replay & Reinforcement
      if (apiKey && this.isDreaming) {
        await this.phaseProceduralReplay(cycleId);
      }

      console.log(`[DreamCycle] ╚══ ✅ Dream cycle complete: +${consolidated} consolidated, -${decayed} decayed, ~${resolved} resolved ══╝\n`);

      // Optional: notify if something significant happened
      if (consolidated > 3 || decayed > 5) {
        this.notify(`Dream complete: +${consolidated} memories consolidated, -${decayed} decayed`);
      }

    } catch (err: any) {
      console.warn("[DreamCycle] Error during dream cycle:", err.message);
    } finally {
      this.isDreaming = false;
    }

    return { consolidated, decayed, resolved };
  }

  // ─── Phase A: Slow-Wave Consolidation ────────────────────────────────────

  private async phaseSlowWaveConsolidation(apiKey: string, cycleId: string): Promise<number> {
    console.log("[DreamCycle] 🌀 Phase A — Slow-Wave: Episodic → Semantic consolidation...");
    let count = 0;

    const episodes = getRecentEpisodicMemories(EPISODIC_BATCH_SIZE);
    if (episodes.length === 0) {
      console.log("[DreamCycle]   No unconsolidated episodes to process.");
      return 0;
    }

    // Build summary of episodes for Gemini distillation
    const episodeSummary = episodes.map((e, i) =>
      `[${i + 1}] [${e.tier}] ${e.content} (context: ${e.context || "general"}, ts: ${e.timestamp})`
    ).join("\n");

    const ai = new GoogleGenAI({ apiKey });

    try {
      const prompt = `You are Snow's memory consolidation engine performing slow-wave sleep consolidation.

Analyze these raw episodic memories and extract meaningful semantic facts that deserve permanent storage in the knowledge graph.

EPISODIC MEMORIES:
${episodeSummary}

Extract 3-8 semantic facts in the form of subject-relation-object triples.
Each triple should capture a durable, generalized insight, preference, or fact about the user or system.

Output STRICT JSON only (no markdown):
{
  "facts": [
    { "source": "User", "rel": "Prefers", "target": "Dark mode interfaces", "category": "Preference", "confidence": 0.9 },
    { "source": "Snow", "rel": "Learned", "target": "Git commits should include ticket numbers", "category": "Skill font", "confidence": 0.85 }
  ]
}`;

      const res = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const raw = res.text?.trim() || "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");

      if (Array.isArray(parsed.facts)) {
        const existingMemories = loadMemories();

        for (const fact of parsed.facts) {
          if (!fact.source || !fact.rel || !fact.target) continue;
          if (!this.isDreaming) break; // interrupted

          // Avoid duplicates
          const isDuplicate = existingMemories.some(m =>
            m.source.toLowerCase() === fact.source.toLowerCase() &&
            m.rel.toLowerCase() === fact.rel.toLowerCase() &&
            m.target.toLowerCase() === fact.target.toLowerCase()
          );

          if (!isDuplicate) {
            addMemory(fact.source, fact.rel, fact.target, fact.category);
            count++;
            console.log(`[DreamCycle]   📌 Consolidated: "${fact.source} ${fact.rel} ${fact.target}"`);
          }
        }
      }

      // Mark episodes as consolidated
      for (const ep of episodes) {
        markEpisodicConsolidated(ep.id);
      }

      logConsolidation(cycleId, "slow_wave", `Processed ${episodes.length} episodes → ${count} new semantic facts`);

    } catch (err: any) {
      console.warn("[DreamCycle] Phase A error:", err.message);
    }

    return count;
  }

  // ─── Phase B: REM Conflict Resolution ────────────────────────────────────

  private async phaseRemConflictResolution(apiKey: string, cycleId: string): Promise<number> {
    console.log("[DreamCycle] 🌀 Phase B — REM: Conflict resolution...");
    let resolved = 0;

    const memories = loadMemories();
    if (memories.length < 2) return 0;

    // Find potentially conflicting memories (same source+rel, different targets)
    const groups = new Map<string, MemoryNode[]>();
    for (const m of memories) {
      const key = `${m.source.toLowerCase()}::${m.rel.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    const conflicted: { key: string; nodes: MemoryNode[] }[] = [];
    for (const [key, nodes] of groups) {
      if (nodes.length > 1) {
        // Multiple values for same source+rel — potential conflict
        conflicted.push({ key, nodes });
      }
    }

    if (conflicted.length === 0) {
      console.log("[DreamCycle]   No conflicts detected.");
      return 0;
    }

    console.log(`[DreamCycle]   Found ${conflicted.length} potential conflict groups.`);

    const ai = new GoogleGenAI({ apiKey });

    for (const conflict of conflicted.slice(0, 5)) { // Process up to 5 conflicts per cycle
      if (!this.isDreaming) break;

      const nodesSummary = conflict.nodes.map((n, i) =>
        `[${i + 1}] ID:${n.id} — "${n.source} ${n.rel} ${n.target}" (ts: ${n.timestamp})`
      ).join("\n");

      try {
        const prompt = `You are Snow's memory arbiter resolving conflicting semantic memories.

Conflicting memories for relation "${conflict.key}":
${nodesSummary}

Decide which memories to KEEP and which to DELETE. Prefer newer, more specific memories.
If all are valid (non-contradictory), keep all. If genuinely contradictory, keep the most recent/specific.

Output STRICT JSON only:
{
  "keep": ["id1", "id2"],
  "delete": ["id3"],
  "rationale": "Kept newer preference; older entry was superseded."
}`;

        const res = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const raw = res.text?.trim() || "";
        const decision = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");

        if (Array.isArray(decision.delete) && decision.delete.length > 0) {
          for (const id of decision.delete) {
            deleteMemory(id);
            resolved++;
            console.log(`[DreamCycle]   🗑️ Evicted conflicting memory: ${id}`);
          }
          logConsolidation(cycleId, "rem_conflict", `Resolved conflict for "${conflict.key}": ${decision.rationale || "resolved"}`);
        }

      } catch (err: any) {
        console.warn(`[DreamCycle] Conflict resolution error for "${conflict.key}":`, err.message);
      }
    }

    return resolved;
  }

  // ─── Phase C: Decay & Eviction ────────────────────────────────────────────

  private async phaseDecayAndEviction(cycleId: string): Promise<number> {
    console.log("[DreamCycle] 🌀 Phase C — Decay: Applying forgetting curve...");
    let decayed = 0;

    try {
      decayed = decayMemories(DECAY_RATE, EVICTION_THRESHOLD);
      console.log(`[DreamCycle]   💨 ${decayed} stale memory node(s) evicted via decay.`);
      if (decayed > 0) {
        logConsolidation(cycleId, "decay", `${decayed} nodes evicted below threshold ${EVICTION_THRESHOLD}`);
      }
    } catch (err: any) {
      console.warn("[DreamCycle] Phase C error:", err.message);
    }

    return decayed;
  }

  // ─── Phase D: Procedural Replay & Reinforcement ───────────────────────────

  private async phaseProceduralReplay(cycleId: string): Promise<void> {
    console.log("[DreamCycle] 🌀 Phase D — Replay: Reinforcing procedural rules...");

    try {
      const rules = getAllProceduralRules();
      if (rules.length === 0) return;

      // Sort by applied_count descending
      const sorted = [...rules].sort((a, b) => b.appliedCount - a.appliedCount);
      const topRules = sorted.slice(0, 5);

      console.log(`[DreamCycle]   🧠 Top procedural rules reinforced:`);
      for (const rule of topRules) {
        console.log(`[DreamCycle]     • [x${rule.appliedCount}] "${rule.rule.slice(0, 60)}..."`);
      }

      // Decay unused rules (applied_count == 0 and older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const staleRules = rules.filter(r => r.appliedCount === 0 && r.timestamp < sevenDaysAgo);

      if (staleRules.length > 0) {
        const db = getDb();
        for (const rule of staleRules.slice(0, 3)) {
          db.prepare("DELETE FROM procedural_rules WHERE id = ?").run(rule.id);
          console.log(`[DreamCycle]   🗑️ Pruned unused rule: "${rule.rule.slice(0, 50)}..."`);
        }
        logConsolidation(cycleId, "procedural_replay", `Pruned ${Math.min(staleRules.length, 3)} unused procedural rules`);
      }

    } catch (err: any) {
      console.warn("[DreamCycle] Phase D error:", err.message);
    }
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  private notify(message: string): void {
    try {
      exec(`notify-send -u low -a "Snow OS" "Dream Cycle" "${message.replace(/"/g, '\\"')}" 2>/dev/null`);
    } catch {}
  }
}

export const dreamCycle = new DreamCycleService();
