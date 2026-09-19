/**
 * SNOW AI — Dynamic Skill Synthesizer & Autonomous Tool Generator
 * Implements Voyager / Eureka runtime self-evolution:
 * Generates new Python/Node tools, validates them in an isolated sandbox,
 * and hot-injects verified skills into the active agentic tool registry.
 */

import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { runPythonCode } from "../python_sandbox";
import {
  saveSynthesizedSkill,
  loadSynthesizedSkills,
  getSynthesizedSkillByName,
  updateSkillStats,
  deleteSynthesizedSkill,
  SynthesizedSkill
} from "../brain";
import type { ToolDefinition } from "../agent_core/types";

const SKILLS_DIR = path.join(process.cwd(), "data", "skills");

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

export interface SkillSynthesisRequest {
  name: string;
  description: string;
  requirement: string;
  language?: "python" | "node";
}

export interface SkillValidationResult {
  valid: boolean;
  testOutput?: string;
  error?: string;
  executionTimeMs?: number;
}

export interface SkillSynthesisResult {
  success: boolean;
  skill?: SynthesizedSkill;
  validation: SkillValidationResult;
  error?: string;
}

class SkillSynthesizerService {
  private activeDynamicTools: Map<string, ToolDefinition<unknown>> = new Map();

  constructor() {
    ensureSkillsDir();
    this.reloadDynamicTools();
  }

  /**
   * Reload all verified synthesized skills into the active tool map.
   */
  public reloadDynamicTools(): Map<string, ToolDefinition<unknown>> {
    const verified = loadSynthesizedSkills(true);
    this.activeDynamicTools.clear();

    for (const skill of verified) {
      try {
        const toolDef = this.buildToolDefinition(skill);
        this.activeDynamicTools.set(skill.name, toolDef);
      } catch (err: any) {
        console.warn(`[SkillSynthesizer] Failed to compile dynamic tool '${skill.name}':`, err.message);
      }
    }

    console.log(`[SkillSynthesizer] ⚡ Hot-loaded ${this.activeDynamicTools.size} dynamic synthesized skill(s).`);
    return this.activeDynamicTools;
  }

  public getDynamicTools(): Map<string, ToolDefinition<unknown>> {
    return this.activeDynamicTools;
  }

  /**
   * Validates a candidate skill inside the hardened Python sandbox with test cases.
   */
  public async validatePythonSkill(code: string, testCasesJson: string): Promise<SkillValidationResult> {
    const testHarness = `
import json
import sys

# ── User Defined Skill ──
${code}

# ── Validation Test Harness ──
try:
    tests = json.loads('''${testCasesJson.replace(/\\/g, "\\\\").replace(/'''/g, "\\'\\'\\'")}''')
    for i, tc in enumerate(tests):
        inp = tc.get("input", {})
        if not isinstance(inp, dict):
            inp = {"data": inp}
        
        # Test function call
        if 'run_tool' in globals():
            res = run_tool(inp)
        elif 'main' in globals():
            res = main(inp)
        else:
            raise Exception("Skill must expose a 'run_tool(params: dict) -> dict' function.")
        
        # Ensure result is serializable
        json.dumps(res)
    
    print(json.dumps({"validation": "PASSED", "testsRun": len(tests)}))
except Exception as e:
    import traceback
    sys.stderr.write(traceback.format_exc())
    sys.exit(1)
`;

    const res = await runPythonCode(testHarness, 8000, { allowNetwork: false });

    if (res.success && res.stdout.includes('"validation": "PASSED"')) {
      return {
        valid: true,
        testOutput: res.stdout,
        executionTimeMs: res.executionTimeMs
      };
    }

    return {
      valid: false,
      error: res.stderr || res.stdout || "Execution failed without output.",
      executionTimeMs: res.executionTimeMs
    };
  }

  /**
   * Synthesizes, tests, and registers a brand new skill from natural language requirement.
   */
  public async synthesizeSkill(req: SkillSynthesisRequest, apiKey: string): Promise<SkillSynthesisResult> {
    if (!apiKey) {
      return {
        success: false,
        validation: { valid: false, error: "API key is required for skill synthesis." },
        error: "Missing API Key"
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const sanitizedName = req.name.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);

    const systemPrompt = `You are SNOW's Meta-Cognitive Tool Synthesizer (Voyager/Eureka autonomous code generator).
Your task is to write a self-contained, robust Python 3 tool that solves a specific user capability gap.

CRITICAL IMPLEMENTATION RULES:
1. Entry point MUST be: def run_tool(params: dict) -> dict:
2. The function takes a JSON-serializable dictionary and returns a JSON-serializable dictionary.
3. Use only Python standard libraries (json, math, re, datetime, hashlib, collections, itertools, urllib.parse, base64, etc.).
4. Do NOT use external pip packages that might not be installed.
5. Provide a valid JSON schema for 'params' and at least 2 realistic unit test cases with inputs.
6. Output a STRICT JSON object in this exact schema with NO markdown wrapping:
{
  "name": "${sanitizedName}",
  "description": "Clear explanation of what the tool accomplishes and its parameters",
  "code": "full python code as a string",
  "inputSchema": {
    "type": "object",
    "properties": { ... },
    "required": [ ... ]
  },
  "testCases": [
    { "input": { ... }, "description": "test case 1" },
    { "input": { ... }, "description": "test case 2" }
  ]
}`;

    const userPrompt = `Requirement: "${req.requirement}"
Tool Name: "${sanitizedName}"
Proposed Description: "${req.description}"

Generate the complete, hardened Python tool and test cases.`;

    try {
      let candidateRes = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          { role: "user", parts: [{ text: userPrompt }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json"
        }
      });

      let raw = candidateRes.text?.trim() || "";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Model failed to output structured JSON.");
        parsed = JSON.parse(match[0]);
      }

      let code = parsed.code || "";
      const inputSchema = JSON.stringify(parsed.inputSchema || { type: "object" });
      const testCases = JSON.stringify(parsed.testCases || [{ input: {} }]);
      const description = parsed.description || req.description;

      // ── Step 1: Sandbox Validation ──
      let valResult = await this.validatePythonSkill(code, testCases);

      // ── Step 2: Self-Healing Reflexion Pass if tests fail ──
      if (!valResult.valid) {
        console.warn(`[SkillSynthesizer] Candidate skill '${sanitizedName}' failed tests. Triggering Reflexion repair...`);
        const repairPrompt = `The synthesized Python code failed unit test validation.
Error Traceback:
${valResult.error}

Original Code:
${code}

Fix the Python code so all test cases pass without any runtime exceptions.
Return ONLY the corrected Python code inside a JSON object: {"code": "fixed python code"}`;

        const repairRes = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{ role: "user", parts: [{ text: repairPrompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const repairedRaw = repairRes.text?.trim() || "";
        const repairedJson = JSON.parse(repairedRaw.match(/\{[\s\S]*\}/)?.[0] || "{}");
        if (repairedJson.code) {
          code = repairedJson.code;
          valResult = await this.validatePythonSkill(code, testCases);
        }
      }

      if (!valResult.valid) {
        return {
          success: false,
          validation: valResult,
          error: `Skill validation failed after self-repair attempt: ${valResult.error}`
        };
      }

      // ── Step 3: Persist Verified Skill ──
      const savedSkill = saveSynthesizedSkill({
        name: sanitizedName,
        description,
        language: "python",
        code,
        inputSchema,
        testCases,
        isVerified: true
      });

      // Write code artifact to disk
      ensureSkillsDir();
      const diskPath = path.join(SKILLS_DIR, `${sanitizedName}.py`);
      fs.writeFileSync(diskPath, code, { encoding: "utf-8" });

      // ── Step 4: Hot-register into active tool map ──
      const toolDef = this.buildToolDefinition(savedSkill);
      this.activeDynamicTools.set(savedSkill.name, toolDef);
      console.log(`[SkillSynthesizer] ✅ Successfully synthesized, verified, and hot-loaded dynamic skill: '${sanitizedName}'`);

      return {
        success: true,
        skill: savedSkill,
        validation: valResult
      };
    } catch (err: any) {
      console.warn("[SkillSynthesizer] Synthesis failed:", err.message);
      return {
        success: false,
        validation: { valid: false, error: err.message },
        error: err.message
      };
    }
  }

  /**
   * Executes a registered synthesized skill by name.
   */
  public async executeSkill(name: string, input: any): Promise<{ success: boolean; output?: any; error?: string }> {
    const skill = getSynthesizedSkillByName(name);
    if (!skill) {
      return { success: false, error: `Synthesized skill '${name}' not found.` };
    }

    const runnerHarness = `
import json
import sys

${skill.code}

try:
    inp = json.loads('''${JSON.stringify(input || {}).replace(/\\/g, "\\\\").replace(/'''/g, "\\'\\'\\'")}''')
    if 'run_tool' in globals():
        res = run_tool(inp)
    elif 'main' in globals():
        res = main(inp)
    else:
        raise Exception("Missing run_tool function.")
    print("__SNOW_RESULT_START__")
    print(json.dumps(res))
    print("__SNOW_RESULT_END__")
except Exception as e:
    import traceback
    sys.stderr.write(traceback.format_exc())
    sys.exit(1)
`;

    const res = await runPythonCode(runnerHarness, 10000, { allowNetwork: false });

    if (res.success && res.stdout.includes("__SNOW_RESULT_START__")) {
      updateSkillStats(name, true);
      const match = res.stdout.match(/__SNOW_RESULT_START__\s*([\s\S]*?)\s*__SNOW_RESULT_END__/);
      const outputText = match ? match[1] : res.stdout;
      try {
        return { success: true, output: JSON.parse(outputText) };
      } catch {
        return { success: true, output: outputText };
      }
    }

    updateSkillStats(name, false);
    return {
      success: false,
      error: res.stderr || res.stdout || "Skill execution failed."
    };
  }

  /**
   * Constructs a QueryEngine-compatible ToolDefinition from a SynthesizedSkill record.
   */
  public buildToolDefinition(skill: SynthesizedSkill): ToolDefinition<unknown> {
    let schema: any = { type: "object" };
    try {
      schema = JSON.parse(skill.inputSchema);
    } catch {}

    const self = this;

    return {
      name: skill.name,
      description: `[SYNTHESIZED SKILL] ${skill.description}`,
      inputSchema: schema,
      validate(_input) {
        return { valid: true };
      },
      checkPermission(_input, _ctx) {
        return { granted: true };
      },
      async *execute(input, _ctx) {
        yield { type: "progress", data: null, label: `Executing Synthesized Skill: ${skill.name}` };
        const result = await self.executeSkill(skill.name, input);
        if (result.success) {
          return {
            content: `Skill '${skill.name}' Output:\n${typeof result.output === "object" ? JSON.stringify(result.output, null, 2) : String(result.output)}`,
            isError: false
          };
        } else {
          return {
            content: `Skill '${skill.name}' Execution Failed:\n${result.error}`,
            isError: true
          };
        }
      }
    };
  }
}

export const skillSynthesizer = new SkillSynthesizerService();
