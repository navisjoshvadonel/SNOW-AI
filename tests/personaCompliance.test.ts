import { test, describe } from "node:test";
import assert from "node:assert";
import { buildSystemPrompt } from "../agent_core/systemPrompt.js";

describe("S.N.O.W. Persona & Zero-Violation Directive Compliance", () => {
  test("system prompt strictly mandates addressing user as nj/NJ", async () => {
    const prompt = await buildSystemPrompt({
      tools: new Map(),
      mcpClients: [],
      cwd: process.cwd(),
    });

    assert.match(prompt, /address the user strictly as ["']?nj["']?/i);
    assert.match(prompt, /NEVER use the term ["']?Boss["']? or ["']?Sir["']?/i);
  });

  test("system prompt strictly enforces Zero-Touch Windows Partition Isolation", async () => {
    const prompt = await buildSystemPrompt({
      tools: new Map(),
      mcpClients: [],
      cwd: process.cwd(),
    });

    assert.match(prompt, /ZERO-TOUCH WINDOWS PARTITION CONTAINMENT/i);
    assert.match(prompt, /nvme0n1p1-p5/);
    assert.match(prompt, /\/mnt\/\*/);
  });

  test("system prompt mandates explicit operator confirmation for sudo", async () => {
    const prompt = await buildSystemPrompt({
      tools: new Map(),
      mcpClients: [],
      cwd: process.cwd(),
    });

    assert.match(prompt, /MANDATORY SUDO OPERATOR PERMISSION PROTOCOL/i);
    assert.match(prompt, /without asking NJ's explicit permission first/i);
  });
});
