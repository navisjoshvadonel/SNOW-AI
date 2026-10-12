/**
 * SNOW AI — Snow-Critic Reflexion Self-Correction & Evaluator Specialist Agent
 * 
 * Provides automated output evaluation, intent verification, hallucination checks,
 * quality scoring, and self-correcting refinement loops:
 *  - Evaluates candidate actions, code outputs, or answers against user intent
 *  - Categorizes verdict: PASS (verified), REVISE (actionable flaws found), FAIL (critical violation)
 *  - Integrates with ReflexionEngine to record operational heuristics into permanent memory
 *  - Generates concrete, self-correcting revision directives for the swarm
 */

import { GoogleGenAI } from "@google/genai";
import { reflexionEngine } from "./reflexionEngine";
import { snowGuard } from "./snowGuard";

export type CritiqueVerdict = "PASS" | "REVISE" | "FAIL";

export interface CritiqueRequest {
  objective: string;
  output: string;
  codeSnippet?: string;
  context?: Record<string, unknown>;
  strictness?: "lenient" | "standard" | "strict";
}

export interface CritiqueEvaluation {
  id: string;
  timestamp: string;
  objective: string;
  verdict: CritiqueVerdict;
  score: number; // 0 to 100
  flaws: string[];
  strengths: string[];
  revisionDirectives?: string;
  learnedHeuristic?: string;
}

export interface SnowCriticMetrics {
  totalEvaluations: number;
  passCount: number;
  reviseCount: number;
  failCount: number;
  avgScore: number;
  recentEvaluations: CritiqueEvaluation[];
}

const CRITIC_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export class SnowCriticService {
  private history: CritiqueEvaluation[] = [];
  private totalEvaluations = 0;
  private passCount = 0;
  private reviseCount = 0;
  private failCount = 0;
  private totalScore = 0;

  /**
   * 1. Evaluate Output Against Objective (Intent Alignment & Quality Scoring)
   */
  public async evaluate(request: CritiqueRequest): Promise<CritiqueEvaluation> {
    const id = `crt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();
    this.totalEvaluations++;

    const { objective, output, codeSnippet, strictness = "standard" } = request;

    // Fast-path heuristic evaluation if Gemini is offline or output is obviously flawed
    if (!output || output.trim().length === 0) {
      const evaluation: CritiqueEvaluation = {
        id,
        timestamp,
        objective,
        verdict: "FAIL",
        score: 0,
        flaws: ["Output is empty or pure whitespace"],
        strengths: [],
        revisionDirectives: "Generate substantive output addressing the target objective.",
      };
      this.recordEvaluation(evaluation);
      return evaluation;
    }

    // Check for obvious syntax or runtime error patterns in output
    const hasErrorPatterns = /(?:error:|exception:|traceback \(most recent call last\):|syntaxerror:|typeerror:|cannot find module)/i.test(output);
    const hasHallucinatedPlaceholder = /(?:TODO:|YOUR_CODE_HERE|REPLACE_ME|<insert|lorem ipsum)/i.test(output);

    let evaluation: CritiqueEvaluation | null = null;
    const apiKey = process.env.GEMINI_API_KEY || "";

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = `You are Snow-Critic, the Chief Quality Inspector & Reflexion Evaluator for S.N.O.W. OS.
Your responsibility is to rigorously audit candidate actions, generated code, or system responses against the user's objective.
You are objective, precise, and uncompromising. You detect hallucinations, broken assumptions, incomplete implementations, and syntax defects.

STRICTNESS LEVEL: ${strictness}

VERDICT CRITERIA:
- "PASS": Objective fully satisfied with high fidelity, no critical errors, and clean execution.
- "REVISE": Minor or recoverable flaws present (e.g. missing edge case, unhandled null, formatting drift) that can be corrected with specific edits.
- "FAIL": Fails fundamental requirements, outputs runtime crashes, hallucinated APIs, or violates safety boundaries.

OUTPUT ONLY VALID JSON:
{
  "verdict": "PASS" | "REVISE" | "FAIL",
  "score": integer between 0 and 100,
  "flaws": ["list of identified issues or empty if none"],
  "strengths": ["list of confirmed achievements"],
  "revisionDirectives": "clear, actionable instructions to fix the output",
  "operationalRule": "general rule or heuristic to avoid this in the future if flaws were found"
}`;

        const userPrompt = `OBJECTIVE:
"${objective}"

CANDIDATE OUTPUT / RESULT:
"""
${snowGuard.scrubSecrets(output.slice(0, 3000))}
"""
${codeSnippet ? `\nASSOCIATED CODE SNIPPET:\n\`\`\`\n${codeSnippet.slice(0, 2000)}\n\`\`\`` : ""}`;

        let responseText = "";
        for (const model of CRITIC_MODELS) {
          try {
            const res = await ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              config: { systemInstruction, responseMimeType: "application/json", temperature: 0.1 },
            });
            responseText = res.text?.trim() || "";
            if (responseText) break;
          } catch {}
        }

        if (responseText) {
          const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || "{}");
          if (parsed.verdict && typeof parsed.score === "number") {
            evaluation = {
              id,
              timestamp,
              objective,
              verdict: parsed.verdict as CritiqueVerdict,
              score: Math.min(100, Math.max(0, parsed.score)),
              flaws: Array.isArray(parsed.flaws) ? parsed.flaws : [],
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
              revisionDirectives: parsed.revisionDirectives,
              learnedHeuristic: parsed.operationalRule,
            };

            // If a valuable operational rule was extracted, teach reflexion engine
            if (parsed.operationalRule && evaluation.verdict !== "PASS") {
              reflexionEngine.analyzeFailure({
                contextQuery: objective,
                toolName: "Snow-Critic",
                toolInput: { outputLength: output.length },
                errorMessage: parsed.flaws.join("; ") || parsed.operationalRule,
              }, apiKey).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        console.warn("[SNOW CRITIC] AI critique fallback notice:", err.message);
      }
    }

    // Heuristic Fallback Evaluation if offline or AI call failed
    if (!evaluation) {
      const flaws: string[] = [];
      const strengths: string[] = [];
      let score = 85;

      if (hasErrorPatterns) {
        flaws.push("Diagnostic error or exception traceback detected in output");
        score -= 40;
      }
      if (hasHallucinatedPlaceholder) {
        flaws.push("Incomplete placeholder or TODO marker detected in output");
        score -= 25;
      }
      if (output.length > 50) {
        strengths.push("Substantive length and content generated");
      }

      let verdict: CritiqueVerdict = "PASS";
      if (score < 50) verdict = "FAIL";
      else if (score < 80) verdict = "REVISE";

      evaluation = {
        id,
        timestamp,
        objective,
        verdict,
        score: Math.max(0, score),
        flaws,
        strengths,
        revisionDirectives: flaws.length > 0 ? `Address the following: ${flaws.join(", ")}` : undefined,
      };
    }

    this.recordEvaluation(evaluation);
    return evaluation;
  }

  /**
   * 2. Self-Refining Auto-Correction Pass
   */
  public async refine(
    objective: string,
    initialOutput: string,
    evaluation: CritiqueEvaluation
  ): Promise<{ refinedOutput: string; improved: boolean }> {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey || evaluation.verdict === "PASS") {
      return { refinedOutput: initialOutput, improved: false };
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are Snow-Critic in Self-Refine mode.
The following output failed or had flaws when evaluated against the target objective.
Produce an improved, corrected version addressing every directive.

OBJECTIVE:
"${objective}"

FLAWS IDENTIFIED:
${evaluation.flaws.map((f) => `- ${f}`).join("\n")}

DIRECTIVES:
${evaluation.revisionDirectives || "Fix all syntax, logical, and formatting issues."}

PREVIOUS OUTPUT:
"""
${initialOutput}
"""

Return ONLY the refined, corrected output without conversational meta-commentary:`;

      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      });

      const refined = res.text?.trim() || "";
      if (refined && refined !== initialOutput) {
        return { refinedOutput: refined, improved: true };
      }
    } catch (err: any) {
      console.warn("[SNOW CRITIC] Refinement pass skipped:", err.message);
    }

    return { refinedOutput: initialOutput, improved: false };
  }

  /**
   * 3. History and Metrics
   */
  private recordEvaluation(evaluation: CritiqueEvaluation): void {
    this.history.unshift(evaluation);
    if (this.history.length > 50) this.history.pop();

    this.totalScore += evaluation.score;
    if (evaluation.verdict === "PASS") this.passCount++;
    else if (evaluation.verdict === "REVISE") this.reviseCount++;
    else this.failCount++;

    console.log(`[SNOW CRITIC] ⚖️ Evaluated: [${evaluation.verdict}] (Score: ${evaluation.score}/100) — "${evaluation.objective.slice(0, 40)}"`);
  }

  public getMetrics(): SnowCriticMetrics {
    return {
      totalEvaluations: this.totalEvaluations,
      passCount: this.passCount,
      reviseCount: this.reviseCount,
      failCount: this.failCount,
      avgScore: this.totalEvaluations > 0 ? Math.round(this.totalScore / this.totalEvaluations) : 100,
      recentEvaluations: this.history.slice(0, 15),
    };
  }

  public getHistory(): CritiqueEvaluation[] {
    return this.history;
  }
}

export const snowCritic = new SnowCriticService();
