/**
 * SNOW AI — Procedural Reflexion & Failure-Driven Learning Engine
 * Implements the Reflexion cognitive pattern:
 * When tool operations, shell commands, or actuations fail, analyzes the post-mortem
 * traceback, extracts generalized operational heuristics, and stores them in SQLite
 * so the agent permanently learns and avoids repeating mistakes.
 */

import { GoogleGenAI } from "@google/genai";
import { recordProceduralRule, getRelevantProceduralRules, ProceduralRule } from "../brain";

export interface FailureIncident {
  contextQuery: string;
  toolName: string;
  toolInput?: any;
  errorMessage: string;
}

class ReflexionEngineService {
  private isAnalyzing: boolean = false;

  /**
   * Analyze a failure incident and synthesize an operational heuristic.
   */
  public async analyzeFailure(incident: FailureIncident, apiKey: string): Promise<ProceduralRule | null> {
    if (!apiKey || !incident.errorMessage || incident.errorMessage.length < 5) {
      return null;
    }

    // Skip trivial user cancellations or permission denials
    if (/aborted|cancelled|user denied/i.test(incident.errorMessage)) {
      return null;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are SNOW's Post-Mortem Reflexion & Operational Learning Engine.
An operational error or tool failure occurred during task execution.
Your objective is to extract a concrete, reusable operational rule (heuristic) that prevents this specific error from recurring.

CRITICAL GUIDELINES:
1. Rule must be actionable and concise (1 sentence).
   Example: "When reading JSON files, verify existence before parsing and wrap in try-catch."
   Example: "When activating a desktop window via wmctrl, ensure the target string matches the window title substring."
2. Output a STRICT JSON object in this format with NO markdown wrapping:
{
  "triggerContext": "keywords or intent describing when this rule applies",
  "rule": "Concrete actionable directive",
  "rationale": "Brief reason why this failure occurred"
}`;

      const userContent = `Task / Context Query: "${incident.contextQuery}"
Tool Invoked: ${incident.toolName}
Tool Input: ${JSON.stringify(incident.toolInput || {}).slice(0, 300)}
Error Output:
${incident.errorMessage.slice(0, 600)}

Synthesize the operational rule to prevent this failure in future runs.`;

      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      });

      const raw = res.text?.trim() || "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");

      if (parsed.rule && parsed.triggerContext) {
        const saved = recordProceduralRule(
          parsed.triggerContext,
          parsed.rule,
          parsed.rationale || `Extracted after ${incident.toolName} failure: ${incident.errorMessage.slice(0, 100)}`,
          incident.errorMessage.slice(0, 200),
          1.0
        );
        console.log(`[Reflexion Engine] 🧠 Learned operational heuristic: "${saved.rule}" (Trigger: "${saved.triggerContext}")`);
        return saved;
      }
    } catch (err: any) {
      console.warn("[Reflexion Engine] Failure analysis notice:", err.message);
    }
    return null;
  }

  /**
   * Builds the formatted procedural wisdom prompt block for the ReAct agent.
   */
  public getOperationalWisdomBlock(query: string): string {
    const rules = getRelevantProceduralRules(query, 4);
    if (!rules.length) return "";

    const lines = [
      "LEARNED PROCEDURAL WISDOM & OPERATIONAL HEURISTICS (Self-Corrected from Past Mistakes):"
    ];
    rules.forEach((r, i) => {
      lines.push(`  ${i + 1}. [When: ${r.triggerContext}] -> ${r.rule}`);
    });

    return lines.join("\n");
  }
}

export const reflexionEngine = new ReflexionEngineService();
