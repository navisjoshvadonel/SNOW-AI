/**
 * SNOW AI — Snow-Coder Code Synthesis, Tool Execution & Sandboxing Specialist
 * 
 * Provides unified, multi-language sandbox execution, pre-flight AST syntax validation,
 * self-healing code repair, and persistent snippet management:
 *  - Python 3 execution via RLIMIT/audit-hook hardened sandbox
 *  - Node.js / JavaScript execution with memory and execution timeouts
 *  - Bash script execution audited through Snow-Guard zero-trust sentinel
 *  - Pre-flight syntax validation (node --check, python3 py_compile, bash -n)
 *  - Autonomous AST-guided code repair loop using Gemini cascade
 *  - Telemetry & execution analytics
 */

import path from "path";
import fs from "fs";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";
import { runPythonCode, ExecutionResult as PythonExecutionResult } from "../python_sandbox";
import { snowGuard } from "./snowGuard";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const WORKSPACE_DIR = process.cwd();
const SANDBOX_DIR = path.join(WORKSPACE_DIR, "data", "sandbox");
const SNIPPETS_DIR = path.join(WORKSPACE_DIR, "data", "coder_snippets");

export type SupportedLanguage = "python" | "javascript" | "typescript" | "bash";

export interface CodeExecutionRequest {
  code: string;
  language: SupportedLanguage;
  timeoutMs?: number;
  maxMemoryMb?: number;
  autoFix?: boolean;
  context?: Record<string, unknown>;
  snippetName?: string;
}

export interface SyntaxCheckResult {
  valid: boolean;
  language: SupportedLanguage;
  error?: string;
  errorLine?: number;
}

export interface CodeExecutionResponse {
  success: boolean;
  language: SupportedLanguage;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  sandboxed: boolean;
  syntaxValid: boolean;
  repairsApplied?: string[];
  snippetId?: string;
  error?: string;
}

export interface SavedSnippet {
  id: string;
  name: string;
  language: SupportedLanguage;
  code: string;
  createdAt: string;
  lastExecutedAt?: string;
  executionCount: number;
  lastSuccess?: boolean;
}

export interface SnowCoderMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  autoFixesApplied: number;
  avgExecutionTimeMs: number;
  snippetsCount: number;
  runtimes: {
    python: string;
    node: string;
    bash: string;
  };
}

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
];

export class SnowCoderService {
  private totalExecutions = 0;
  private successfulExecutions = 0;
  private failedExecutions = 0;
  private autoFixesApplied = 0;
  private totalExecutionTimeMs = 0;
  private runtimesCache: { python: string; node: string; bash: string } | null = null;

  constructor() {
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(SANDBOX_DIR)) {
      fs.mkdirSync(SANDBOX_DIR, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(SNIPPETS_DIR)) {
      fs.mkdirSync(SNIPPETS_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * 1. Pre-flight Syntax Verification (Static check without side effects)
   */
  public async validateSyntax(code: string, language: SupportedLanguage): Promise<SyntaxCheckResult> {
    this.ensureDirs();
    const trimmed = (code || "").trim();
    if (!trimmed) {
      return { valid: false, language, error: "Code cannot be empty" };
    }

    const testId = `check_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (language === "python") {
      const tempPath = path.join(SANDBOX_DIR, `${testId}.py`);
      try {
        fs.writeFileSync(tempPath, trimmed, "utf-8");
        await execFileAsync("python3", ["-m", "py_compile", tempPath]);
        return { valid: true, language: "python" };
      } catch (err: any) {
        const stderr = (err.stderr || err.message || "").toString();
        const lineMatch = stderr.match(/line\s+(\d+)/i);
        const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
        return {
          valid: false,
          language: "python",
          error: snowGuard.scrubSecrets(stderr.trim()),
          errorLine: line,
        };
      } finally {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      }
    }

    if (language === "javascript" || language === "typescript") {
      const tempPath = path.join(SANDBOX_DIR, `${testId}.cjs`);
      try {
        fs.writeFileSync(tempPath, trimmed, "utf-8");
        await execFileAsync("node", ["--check", tempPath]);
        return { valid: true, language };
      } catch (err: any) {
        const stderr = (err.stderr || err.message || "").toString();
        const lineMatch = stderr.match(/:(\d+)\r?\n/);
        const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
        return {
          valid: false,
          language,
          error: snowGuard.scrubSecrets(stderr.trim()),
          errorLine: line,
        };
      } finally {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      }
    }

    if (language === "bash") {
      const tempPath = path.join(SANDBOX_DIR, `${testId}.sh`);
      try {
        fs.writeFileSync(tempPath, trimmed, "utf-8");
        await execFileAsync("bash", ["-n", tempPath]);
        return { valid: true, language: "bash" };
      } catch (err: any) {
        const stderr = (err.stderr || err.message || "").toString();
        return {
          valid: false,
          language: "bash",
          error: snowGuard.scrubSecrets(stderr.trim()),
        };
      } finally {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      }
    }

    return { valid: true, language };
  }

  /**
   * 2. Execute Code in Hardened Sandbox with optional Auto-Repair
   */
  public async execute(request: CodeExecutionRequest): Promise<CodeExecutionResponse> {
    const startTime = Date.now();
    this.totalExecutions++;
    this.ensureDirs();

    const {
      code,
      language,
      timeoutMs = 10000,
      maxMemoryMb = 256,
      autoFix = false,
      snippetName,
    } = request;

    // First: Run Pre-Flight Syntax Check
    const syntax = await this.validateSyntax(code, language);
    let activeCode = code;
    const repairsApplied: string[] = [];

    // If syntax fails and autoFix is enabled, attempt repair before execution
    if (!syntax.valid && autoFix) {
      const repaired = await this.attemptCodeRepair(activeCode, language, syntax.error || "Syntax error");
      if (repaired) {
        activeCode = repaired;
        repairsApplied.push(`Pre-flight repair: fixed ${syntax.error?.slice(0, 60)}...`);
      }
    }

    let executionResult: { stdout: string; stderr: string; success: boolean };

    if (language === "python") {
      const pyRes: PythonExecutionResult = await runPythonCode(activeCode, timeoutMs, {
        maxMemoryMb,
        allowNetwork: false,
      });
      executionResult = {
        stdout: pyRes.stdout,
        stderr: pyRes.stderr,
        success: pyRes.success,
      };
    } else if (language === "javascript" || language === "typescript") {
      executionResult = await this.executeJavaScript(activeCode, timeoutMs, maxMemoryMb);
    } else if (language === "bash") {
      executionResult = await this.executeBash(activeCode, timeoutMs);
    } else {
      return {
        success: false,
        language,
        stdout: "",
        stderr: `Unsupported language: ${language}`,
        executionTimeMs: 0,
        sandboxed: true,
        syntaxValid: false,
        error: `Unsupported language: ${language}`,
      };
    }

    // If runtime failed and autoFix is enabled, attempt post-execution repair loop
    if (!executionResult.success && autoFix && repairsApplied.length < 2) {
      const repaired = await this.attemptCodeRepair(
        activeCode,
        language,
        executionResult.stderr || "Runtime exception occurred"
      );
      if (repaired && repaired !== activeCode) {
        repairsApplied.push(`Runtime repair: addressed ${executionResult.stderr.slice(0, 60)}...`);
        this.autoFixesApplied++;

        // Re-execute with repaired code
        if (language === "python") {
          const retryRes = await runPythonCode(repaired, timeoutMs, { maxMemoryMb, allowNetwork: false });
          executionResult = { stdout: retryRes.stdout, stderr: retryRes.stderr, success: retryRes.success };
        } else if (language === "javascript" || language === "typescript") {
          executionResult = await this.executeJavaScript(repaired, timeoutMs, maxMemoryMb);
        } else if (language === "bash") {
          executionResult = await this.executeBash(repaired, timeoutMs);
        }
        activeCode = repaired;
      }
    }

    const elapsed = Date.now() - startTime;
    this.totalExecutionTimeMs += elapsed;

    if (executionResult.success) {
      this.successfulExecutions++;
    } else {
      this.failedExecutions++;
    }

    // Optionally save snippet if given a name
    let snippetId: string | undefined;
    if (snippetName) {
      const saved = this.saveSnippet(snippetName, language, activeCode, executionResult.success);
      snippetId = saved.id;
    }

    return {
      success: executionResult.success,
      language,
      stdout: snowGuard.scrubSecrets(executionResult.stdout),
      stderr: snowGuard.scrubSecrets(executionResult.stderr),
      executionTimeMs: elapsed,
      sandboxed: true,
      syntaxValid: syntax.valid || repairsApplied.length > 0,
      repairsApplied: repairsApplied.length > 0 ? repairsApplied : undefined,
      snippetId,
      error: !executionResult.success ? executionResult.stderr : undefined,
    };
  }

  /**
   * 3. Node.js / JavaScript Sandbox Runner
   */
  private async executeJavaScript(
    code: string,
    timeoutMs: number,
    maxMemoryMb: number
  ): Promise<{ stdout: string; stderr: string; success: boolean }> {
    const effectiveTimeoutMs = Math.min(Math.max(1000, timeoutMs), 15000);
    const effectiveMemMb = Math.min(Math.max(64, maxMemoryMb), 512);
    const scriptId = `node_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.cjs`;
    const scriptPath = path.join(SANDBOX_DIR, scriptId);

    // Hardened wrapper for JavaScript
    const wrapper = `
"use strict";
const fs = require("fs");
const path = require("path");

// Deny external network requires
const _origRequire = module.require;
module.require = function(moduleName) {
  const BLOCKED = ["net", "http", "https", "dgram", "dns", "tls"];
  if (BLOCKED.includes(moduleName)) {
    throw new Error("Security Alert: Network module '" + moduleName + "' is disabled in Snow Sandbox.");
  }
  return _origRequire.apply(this, arguments);
};

try {
${code}
} catch (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
}
`;

    fs.writeFileSync(scriptPath, wrapper, { encoding: "utf-8", mode: 0o600 });

    const safeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      NODE_ENV: "production",
      LANG: "en_US.UTF-8",
      TMPDIR: SANDBOX_DIR,
    };

    try {
      const { stdout, stderr } = await execFileAsync(
        "node",
        [`--max-old-space-size=${effectiveMemMb}`, scriptPath],
        {
          timeout: effectiveTimeoutMs,
          maxBuffer: 5 * 1024 * 1024,
          cwd: SANDBOX_DIR,
          env: safeEnv,
        }
      );

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true,
      };
    } catch (err: any) {
      let errMsg = err.stderr ? err.stderr.trim() : err.message;
      if (err.killed) {
        errMsg = `Execution timed out after ${effectiveTimeoutMs}ms (Process killed by sandbox monitor).`;
      }
      return {
        stdout: err.stdout ? err.stdout.trim() : "",
        stderr: errMsg,
        success: false,
      };
    } finally {
      try {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      } catch {}
    }
  }

  /**
   * 4. Bash Execution with Snow-Guard Sentinel Interception
   */
  private async executeBash(
    code: string,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; success: boolean }> {
    const trimmed = (code || "").trim();

    // Pass through Snow-Guard audit
    const audit = snowGuard.auditCommand(trimmed, SANDBOX_DIR);
    if (!audit.allowed) {
      return {
        stdout: "",
        stderr: audit.violation || "Prohibited command execution",
        success: false,
      };
    }

    const effectiveTimeoutMs = Math.min(Math.max(1000, timeoutMs), 15000);
    const scriptId = `sh_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.sh`;
    const scriptPath = path.join(SANDBOX_DIR, scriptId);

    fs.writeFileSync(scriptPath, trimmed, { encoding: "utf-8", mode: 0o700 });

    const safeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      LANG: "en_US.UTF-8",
      TMPDIR: SANDBOX_DIR,
    };

    try {
      const { stdout, stderr } = await execFileAsync("bash", [scriptPath], {
        timeout: effectiveTimeoutMs,
        maxBuffer: 5 * 1024 * 1024,
        cwd: SANDBOX_DIR,
        env: safeEnv,
      });

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true,
      };
    } catch (err: any) {
      let errMsg = err.stderr ? err.stderr.trim() : err.message;
      if (err.killed) {
        errMsg = `Execution timed out after ${effectiveTimeoutMs}ms`;
      }
      return {
        stdout: err.stdout ? err.stdout.trim() : "",
        stderr: errMsg,
        success: false,
      };
    } finally {
      try {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      } catch {}
    }
  }

  /**
   * 5. Autonomous Code Repair via Gemini Cascade
   */
  private async attemptCodeRepair(
    code: string,
    language: SupportedLanguage,
    errorDiagnostic: string
  ): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) return null;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are Snow-Coder, an expert self-healing code synthesizer.
The following ${language} code encountered an error during sandboxed verification.
Fix the code so that it executes cleanly without syntax errors, missing variables, or runtime exceptions.

FAILED CODE:
\`\`\`${language}
${code}
\`\`\`

DIAGNOSTIC ERROR:
${errorDiagnostic}

REQUIREMENTS:
1. Return ONLY the valid, corrected ${language} code inside a standard triple-backtick markdown block.
2. Do not include any explanations or conversational chatter.
3. Ensure no malicious or out-of-sandbox actions are performed.`;

      for (const model of GEMINI_MODELS) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { temperature: 0.1, maxOutputTokens: 2048 },
          });

          const text = resp?.text || "";
          const codeMatch = text.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/);
          const repaired = codeMatch ? codeMatch[1].trim() : text.trim();

          if (repaired && repaired !== code) {
            return repaired;
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn("[SNOW CODER] Autonomous code repair skipped:", err.message);
    }
    return null;
  }

  /**
   * 6. Snippet Management
   */
  public saveSnippet(
    name: string,
    language: SupportedLanguage,
    code: string,
    success: boolean = true
  ): SavedSnippet {
    this.ensureDirs();
    const id = `snp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snippet: SavedSnippet = {
      id,
      name,
      language,
      code,
      createdAt: new Date().toISOString(),
      lastExecutedAt: new Date().toISOString(),
      executionCount: 1,
      lastSuccess: success,
    };

    const filePath = path.join(SNIPPETS_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snippet, null, 2), "utf-8");
    return snippet;
  }

  public listSnippets(): SavedSnippet[] {
    this.ensureDirs();
    try {
      const files = fs.readdirSync(SNIPPETS_DIR).filter((f) => f.endsWith(".json"));
      return files
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(SNIPPETS_DIR, f), "utf-8")) as SavedSnippet;
          } catch {
            return null;
          }
        })
        .filter((s): s is SavedSnippet => s !== null)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  public getSnippet(id: string): SavedSnippet | null {
    this.ensureDirs();
    const filePath = path.join(SNIPPETS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SavedSnippet;
      } catch {}
    }
    return null;
  }

  /**
   * 7. Metrics & Diagnostics
   */
  public async getMetrics(): Promise<SnowCoderMetrics> {
    if (!this.runtimesCache) {
      let py = "unknown";
      let nd = "unknown";
      let sh = "unknown";
      try {
        const { stdout } = await execAsync("python3 --version");
        py = stdout.trim();
      } catch {}
      try {
        const { stdout } = await execAsync("node --version");
        nd = stdout.trim();
      } catch {}
      try {
        const { stdout } = await execAsync("bash --version");
        sh = stdout.split("\n")[0]?.trim() || "bash";
      } catch {}
      this.runtimesCache = { python: py, node: nd, bash: sh };
    }

    const snippets = this.listSnippets();

    return {
      totalExecutions: this.totalExecutions,
      successfulExecutions: this.successfulExecutions,
      failedExecutions: this.failedExecutions,
      autoFixesApplied: this.autoFixesApplied,
      avgExecutionTimeMs: this.totalExecutions > 0 ? Math.round(this.totalExecutionTimeMs / this.totalExecutions) : 0,
      snippetsCount: snippets.length,
      runtimes: this.runtimesCache,
    };
  }
}

export const snowCoder = new SnowCoderService();
