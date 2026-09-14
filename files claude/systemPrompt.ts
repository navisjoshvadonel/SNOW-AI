/**
 * AGENT CORE — engine/systemPrompt.ts
 *
 * Builds the system prompt sent to the model on every turn.
 * Inferred from: constants/prompts.ts, context.ts, utils/queryContext.ts,
 *                memdir/memdir.ts
 *
 * Structure (matches blueprint's getSystemPrompt + getUserContext pattern):
 *
 *   [ROLE DEFINITION]
 *   [TOOL CATALOGUE SUMMARY]          ← generated from registered tools
 *   [ENVIRONMENT CONTEXT]             ← cwd, OS, shell, date
 *   [MCP SERVERS]                     ← if any connected
 *   [MEMORY CONTENTS]                 ← if memory files present
 *   [CUSTOM SYSTEM PROMPT]            ← operator override (replaces default)
 *   [APPEND SYSTEM PROMPT]            ← operator addition (always appended)
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { McpServerConnection, ToolRegistry } from "./types.js";

export type SystemPromptParams = {
  tools: ToolRegistry;
  customSystemPrompt?: string;
  appendSystemPrompt?: string;
  mcpClients: McpServerConnection[];
  cwd: string;
};

// ─────────────────────────────────────────────────────────────────────────────

export async function buildSystemPrompt(
  params: SystemPromptParams,
): Promise<string> {
  const parts: string[] = [];

  if (params.customSystemPrompt) {
    // Operator-supplied prompt replaces the default entirely
    parts.push(params.customSystemPrompt);
  } else {
    parts.push(ROLE_DEFINITION);
    parts.push(buildToolSummary(params.tools));
    parts.push(await buildEnvironmentContext(params.cwd));

    if (params.mcpClients.length > 0) {
      parts.push(buildMcpSection(params.mcpClients));
    }

    const memory = await loadMemoryContents(params.cwd);
    if (memory) {
      parts.push(memory);
    }
  }

  if (params.appendSystemPrompt) {
    parts.push(params.appendSystemPrompt);
  }

  return parts.filter(Boolean).join("\n\n");
}

// ─── Role definition ──────────────────────────────────────────────────────────

const ROLE_DEFINITION = `\
You are SNOW, an elite, hyper-intelligent autonomous executive assistant and operations intelligence system engineered for NJ. You operate with deep situational awareness, technical mastery, and refined executive professionalism.

You have full tool access across local Linux systems, filesystems, shell execution, MCP servers, and desktop actuation. With this power comes absolute operational discipline: your primary mandate is to advance NJ's objectives autonomously while maintaining zero-compromise security, system integrity, and flawless execution.

CORE SECURITY & CONTAINMENT PROTOCOLS:
1. BLAST RADIUS CONTAINMENT:
   - NEVER execute destructive commands: recursive deletions of root/home/wildcards (rm -rf /, rm -rf ~), disk formatting (mkfs), raw block writes (dd), or unauthorized modifications to /etc, /boot, /sys, /proc, /root.
   - Prefer targeted, non-destructive operations. Never wipe git history or reset with untracked work without verification.
2. ZERO-LEAK SECRETS SHIELD:
   - NEVER print, echo, or leak API keys, tokens, SSH keys, or .env secrets.
   - All secret values must be strictly protected and redacted.
3. SAFE ACTUATION & VERIFICATION:
   - When using desktop automation, verify screen bounds and target coordinates.
   - Never execute unconfirmed destructive system actions.
4. COGNITIVE PLANNING & REFLECTION:
   - Always read before writing. Understand existing code before modifying it.
   - Prefer targeted, minimal changes. Avoid rewriting entire files unnecessarily.
   - Verify results: after writing code, run tests, lint, or execute it to confirm correctness.
   - CRITICAL DIRECTIVE: Always address the user strictly as "nj" (or "NJ"). NEVER use the term "Boss" or "Sir" under any circumstances. Keep status updates articulate, poised, and professional.`;

// ─── Tool summary ─────────────────────────────────────────────────────────────

function buildToolSummary(tools: ToolRegistry): string {
  if (tools.size === 0) return "";

  const lines = ["Available tools:"];
  for (const [name, tool] of tools) {
    lines.push(`  • ${name}: ${tool.description}`);
  }
  return lines.join("\n");
}

// ─── Environment context ──────────────────────────────────────────────────────

async function buildEnvironmentContext(cwd: string): Promise<string> {
  const platform = process.platform;
  const shell = process.env["SHELL"] ?? (platform === "win32" ? "powershell" : "bash");
  const now = new Date().toISOString();

  const lines = [
    "Environment:",
    `  Working directory: ${cwd}`,
    `  Platform: ${platform}`,
    `  Shell: ${shell}`,
    `  Date/time: ${now}`,
  ];

  // Include .gitignore hint if present
  if (existsSync(join(cwd, ".gitignore"))) {
    lines.push("  (A .gitignore is present — respect it when scanning files)");
  }

  return lines.join("\n");
}

// ─── MCP section ──────────────────────────────────────────────────────────────

function buildMcpSection(clients: McpServerConnection[]): string {
  const lines = ["Connected MCP servers:"];
  for (const client of clients) {
    if (!client.connected) continue;
    lines.push(`  • ${client.name} (${client.transport})`);
    for (const tool of client.tools) {
      lines.push(`    - ${tool.name}: ${tool.description}`);
    }
  }
  return lines.join("\n");
}

// ─── Memory contents ──────────────────────────────────────────────────────────

/**
 * Loads CLAUDE.md memory files from the project directory.
 * Blueprint calls this "memdir" — it scans for CLAUDE.md files walking
 * upward from cwd, plus ~/.claude/CLAUDE.md for user-level memory.
 */
async function loadMemoryContents(cwd: string): Promise<string | null> {
  const candidates: string[] = [
    join(cwd, "CLAUDE.md"),
    join(process.env["HOME"] ?? "~", ".claude", "CLAUDE.md"),
  ];

  const contents: string[] = [];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const text = await readFile(path, "utf8");
      if (text.trim()) {
        contents.push(`<!-- Memory from ${path} -->\n${text.trim()}`);
      }
    } catch {
      // Non-fatal
    }
  }

  if (contents.length === 0) return null;

  return [
    "Memory / project context (loaded from CLAUDE.md files):",
    ...contents,
  ].join("\n\n");
}
