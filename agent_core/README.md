# agent-core

Original AI agent implementation, architecturally derived from client-side
blueprint analysis of a production agentic coding system.

---

## Architecture

```
agent-core/
├── src/
│   ├── types.ts                  ← All shared types & interfaces
│   ├── index.ts                  ← Public API + createAgent() factory
│   │
│   ├── engine/
│   │   ├── QueryEngine.ts        ← Agentic loop (main turn driver)
│   │   ├── modelClient.ts        ← Anthropic API streaming client
│   │   ├── systemPrompt.ts       ← System prompt assembly
│   │   ├── compaction.ts         ← History compression (snip strategy)
│   │   ├── toolDispatch.ts       ← Tool execution dispatcher
│   │   └── costTracker.ts        ← Usage → USD cost calculation
│   │
│   ├── tools/
│   │   └── builtins.ts           ← Bash, FileRead, FileWrite, FileEdit,
│   │                                Glob, Grep, WebSearch
│   │
│   ├── tasks/
│   │   └── TaskManager.ts        ← Background task lifecycle
│   │
│   ├── mcp/
│   │   └── McpClient.ts          ← MCP stdio/HTTP client + tool adaptor
│   │
│   ├── telemetry/
│   │   └── instrumentation.ts    ← OTEL-compatible event emitter
│   │
│   └── utils/
│       └── tokenBudget.ts        ← Inline budget directive parser
```

---

## Design assumptions (inferred from blueprint)

### 1. Message-passing agentic loop
The central `QueryEngine` runs a `while (turns < maxTurns)` loop. Each
iteration calls the model, collects a streamed response, executes any
tool calls in parallel (sequentially within a turn), injects the results
as a synthetic user message, and repeats until `stop_reason === "end_turn"`.

### 2. Tool system
Every capability is a `ToolDefinition<TInput>` with three lifecycle hooks:
- `validate()` — schema + safety pre-checks
- `checkPermission()` — user approval gate (mode-aware)
- `execute()` — async generator: yields `ToolProgressEvent`, returns `ToolResult`

The engine never hard-codes tool logic — tools are injected at construction.

### 3. Thinking tokens
`ThinkingConfig` can be `disabled | enabled(budgetTokens) | adaptive`.
The `adaptive` mode sends `thinking: { type: "auto" }` and lets the model
decide per-turn. The `ultrathink` keyword in user messages overrides to
`enabled` with the maximum budget (100k tokens).

### 4. Context compaction
When the estimated token count exceeds ~180k the engine invokes
`compactHistory()`, which summarises the "middle" section of the
conversation with a separate API call, producing a synthetic assistant
message. Head (first 4) and tail (last 8) messages are always preserved
verbatim.

### 5. Cost / budget tracking
`costFromUsage()` maps token usage + model name to USD cost using a
rate table. The engine accumulates cost across turns and stops with
`budget_exceeded` when `maxBudgetUsd` is crossed.

### 6. MCP integration
`McpClient` connects to MCP servers over stdio or HTTP, runs the
JSON-RPC `initialize` + `tools/list` handshake, and wraps each
discovered tool as a `ToolDefinition` injected into the main registry.

### 7. Task lifecycle
`TaskManager` assigns prefixed IDs (`b*` bash, `a*` agent, `t*` teammate,
etc.), streams output to disk, and enforces terminal-state guards
(no transitions out of completed/failed/killed).

---

## Quick start

```typescript
import { createAgent } from "agent-core";

const agent = await createAgent({
  cwd: "/path/to/project",
  model: "claude-sonnet-4-5",
  permissionMode: "acceptEdits",
  maxBudgetUsd: 1.00,
});

const controller = new AbortController();

for await (const event of agent.submitMessage(
  "Add JSDoc comments to all exported functions in src/",
  controller.signal,
)) {
  if (event.type === "content_block_delta") {
    process.stdout.write(event.delta);
  }
  if (event.type === "tool_use_start") {
    console.error(`\n[tool] ${event.name}`);
  }
  if (event.type === "error") {
    console.error("Error:", event.error.message);
    if (!event.error.retryable) break;
  }
}

console.log(`\nTotal cost: $${agent.totalCostUsd.toFixed(4)}`);
```

---

## Token budget syntax (in user messages)

| Syntax | Tokens |
|--------|--------|
| `+500k` at start | 500,000 |
| `...text +2m.` | 2,000,000 |
| `use 1.5b tokens` | 1,500,000,000 |
| `ultrathink` | 100,000 (max reasoning) |

---

## Adding custom tools

```typescript
import type { ToolDefinition } from "agent-core";

const MyTool: ToolDefinition<{ url: string }> = {
  name: "FetchJSON",
  description: "Fetch a JSON endpoint and return the parsed body.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  async *execute(input, ctx) {
    yield { type: "progress", data: null, label: `GET ${input.url}` };
    const resp = await fetch(input.url, { signal: ctx.abortSignal });
    const json = await resp.json();
    return { content: JSON.stringify(json, null, 2) };
  },
};

const agent = await createAgent({ tools: [MyTool] });
```

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required. Anthropic API key. |
| `AGENT_TELEMETRY_VERBOSE` | Set to `1` to log telemetry events to stderr. |
| `MAX_THINKING_TOKENS` | Override thinking budget (integer). |
