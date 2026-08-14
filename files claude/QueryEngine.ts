/**
 * AGENT CORE — engine/QueryEngine.ts
 *
 * The central agentic loop. Derived by reverse-engineering the architecture of
 * the client-side blueprint (QueryEngine.ts, query.ts, queryHelpers.ts,
 * queryContext.ts).
 *
 * Key design decisions inferred from the blueprint:
 *
 *  1. The loop is a async generator — every turn yields a stream of QueryEvents
 *     so the caller can render incremental output.
 *
 *  2. Tools are registered externally and injected via QueryEngineConfig.
 *     The engine does NOT hard-code tool logic — it only drives tool dispatch,
 *     permission checks, and result injection.
 *
 *  3. Compaction: when the context grows beyond a threshold the engine compacts
 *     history using a summarisation call, preserving semantic continuity.
 *
 *  4. Thinking tokens: when ThinkingConfig is 'enabled' or 'adaptive', the
 *     engine adds a beta header and processes <thinking> blocks separately from
 *     the user-visible content stream.
 *
 *  5. Budget guard: before each turn the engine checks accumulated cost against
 *     maxBudgetUsd and emits budget_exceeded if crossed.
 *
 *  6. Permission gate: tool inputs are sent through checkPermission() before
 *     any execution; denials are returned as tool_result is_error blocks so the
 *     model can respond gracefully.
 */

import type {
  AgentError,
  ContentBlock,
  Message,
  ModelUsage,
  PermissionMode,
  QueryEngineConfig,
  QueryEvent,
  StopReason,
  ThinkingConfig,
  TokenUsage,
  ToolDefinition,
  ToolResult,
  ToolUseBlock,
  ToolUseContext,
  ToolUseId,
} from "./types.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { compactHistory } from "./compaction.js";
import { callModel } from "./modelClient.js";
import { costFromUsage, COST_PER_1K } from "./modelClient.js";

async function dispatchTool(tool: ToolDefinition<unknown>, input: unknown, ctx: ToolUseContext): Promise<ToolResult> {
  let result: ToolResult | undefined;
  for await (const event of tool.execute(input, ctx)) {
    if ("content" in event) {
      result = event as ToolResult;
    }
  }
  return result || { content: "No output", isError: false };
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Tokens at which we trigger compaction (mirrors ~200k threshold in blueprint). */
const COMPACT_THRESHOLD_TOKENS = 180_000;

/** Maximum consecutive tool-call turns before we stop to avoid infinite loops. */
const DEFAULT_MAX_TURNS = 50;

// ── QueryEngine class ─────────────────────────────────────────────────────────

export class QueryEngine {
  private config: QueryEngineConfig;
  private messages: Message[];
  private accumulatedUsage: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  private accumulatedCostUsd = 0;
  private turnCount = 0;

  constructor(config: QueryEngineConfig) {
    this.config = config;
    this.messages = config.initialMessages ? [...config.initialMessages] : [];
  }

  /**
   * Submit a new user message and run the agentic loop until the model stops
   * (end_turn), hits a hard limit, or the abort signal fires.
   *
   * Yields QueryEvents for incremental rendering.
   */
  async *submitMessage(
    userContent: string,
    signal: AbortSignal,
  ): AsyncGenerator<QueryEvent> {
    // 1. Append the user message
    this.messages.push({
      role: "user",
      content: [{ type: "text", text: userContent }],
      metadata: { timestamp: Date.now() },
    });

    yield* this.runLoop(signal);
  }

  // ── Core agentic loop ────────────────────────────────────────────────────

  private async *runLoop(signal: AbortSignal): AsyncGenerator<QueryEvent> {
    const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;

    while (this.turnCount < maxTurns) {
      if (signal.aborted) {
        yield this.errorEvent("ABORT", "Aborted by user", false);
        return;
      }

      // Budget check
      if (this.config.maxBudgetUsd !== undefined &&
          this.accumulatedCostUsd >= this.config.maxBudgetUsd) {
        yield this.errorEvent("BUDGET_EXCEEDED",
          `Cost $${this.accumulatedCostUsd.toFixed(4)} reached limit $${this.config.maxBudgetUsd}`,
          false,
        );
        return;
      }

      // Compaction: if history is getting large, compress it
      const estimatedTokens = estimateTokens(this.messages);
      if (estimatedTokens > COMPACT_THRESHOLD_TOKENS) {
        this.messages = await compactHistory(this.messages, {
          model: this.resolveModel(),
          systemPrompt: await this.buildSystemPrompt(),
          signal,
        });
      }

      // Build the API params
      const systemPrompt = await this.buildSystemPrompt();
      const thinkingConfig = this.resolveThinkingConfig();
      const model = this.resolveModel();

      // ── Call the model ─────────────────────────────────────────────────
      let assistantContent: ContentBlock[] = [];
      let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
      let stopReason: StopReason = "end_turn";

      try {
        for await (const event of callModel({
          model,
          system: systemPrompt,
          messages: this.messages,
          tools: this.buildApiToolList(),
          thinkingConfig,
          signal,
        })) {
          yield event;

          if (event.type === "message_stop") {
            usage = event.usage;
            stopReason = event.stopReason;
          }
          if (event.type === "content_block_start") {
            assistantContent[event.index] = event.block;
          }
          if (event.type === "tool_use_start") {
             assistantContent.push({ type: "tool_use", id: event.toolUseId, name: event.name, input: event.input || {} });
          }
          if (event.type === "content_block_delta" && event.delta) {
             const block = assistantContent[event.index];
             if (block && block.type === "text" && typeof event.delta === "string") {
                 block.text += event.delta;
             }
          }
          if (event.type === "content_block_stop") {
             // Handle finalisation if needed
             const block = assistantContent[event.index];
             if (block && block.type === "tool_use") {
                // We parse input JSON in modelClient, so we can just grab it here
                // Note: since our rewrite, modelClient yields tool_use_start with input args already if they were passed, 
                // but let's just make sure it's valid.
             }
          }
        }
        
        // Fix for Gemini: our rewrite of modelClient passes the JSON args during tool_use_start inside partial_json delta,
        // but for simplicity, we can let the QueryEngine use the toolUseId and name. Wait, the tool result logic requires the `input` field.
        // Let's ensure tool_use blocks have input.
        for (const event of assistantContent) {
           if (event.type === "tool_use" && !event.input) event.input = {};
        }
      } catch (err) {
        yield this.handleApiError(err);
        return;
      }

      // Accrue usage & cost
      this.accumulateUsage(usage, model);

      // Append assistant message
      this.messages.push({
        role: "assistant",
        content: assistantContent,
        metadata: { timestamp: Date.now() },
      });

      this.turnCount++;

      // ── End conditions ────────────────────────────────────────────────
      if (stopReason === "end_turn" || stopReason === "stop_sequence") {
        return;
      }

      if (stopReason === "max_tokens") {
        // Continue automatically — model was cut off
        this.messages.push({
          role: "user",
          content: [{ type: "text", text: "Continue." }],
          metadata: { timestamp: Date.now(), synthetic: true },
        });
        continue;
      }

      if (stopReason !== "tool_use") return;

      // ── Tool dispatch ─────────────────────────────────────────────────
      const toolUseBlocks = assistantContent.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) return;

      const toolResultContent: ContentBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        yield { type: "tool_use_start", toolUseId: toolUse.id, name: toolUse.name };

        const ctx: ToolUseContext = {
          sessionId: this.config as any, // injected externally in production
          cwd: this.config.cwd,
          permissionMode: this.config.permissionMode ?? "default",
          abortSignal: signal,
          messages: this.messages,
          fileCache: new Map(),
          thinkingConfig: this.resolveThinkingConfig(),
          verbose: this.config.verbose,
        };

        const result = await this.executeToolWithPermissions(toolUse, ctx);

        yield { type: "tool_result", toolUseId: toolUse.id, result };

        toolResultContent.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          name: toolUse.name,
          content: result.content,
          is_error: result.isError,
        } as any);
      }

      // Inject tool results as a user message
      this.messages.push({
        role: "user",
        content: toolResultContent,
        metadata: { timestamp: Date.now(), synthetic: true },
      });
    }

    // Fell out of the while loop
    yield this.errorEvent("API_ERROR", `Max turns (${maxTurns}) exceeded`, false);
  }

  // ── Tool execution with permission gate ──────────────────────────────────

  private async executeToolWithPermissions(
    toolUse: ToolUseBlock,
    ctx: ToolUseContext,
  ): Promise<ToolResult> {
    const tool = this.config.tools.get(toolUse.name) as ToolDefinition<unknown> | undefined;

    if (!tool) {
      return {
        content: `Tool not found: ${toolUse.name}`,
        isError: true,
      };
    }

    // Validate input
    if (tool.validate) {
      const v = await tool.validate(toolUse.input, ctx);
      if (!v.valid) {
        return { content: `Validation failed: ${(v as any).message}`, isError: true };
      }
    }

    // Permission gate
    if (tool.checkPermission && ctx.permissionMode !== "bypassPermissions") {
      const p = await tool.checkPermission(toolUse.input, ctx);
      if (!p.granted) {
        return { content: `Permission denied: ${(p as any).reason}`, isError: true };
      }
    }

    // Execute (drain progress events)
    try {
      return await dispatchTool(tool, toolUse.input, ctx);
    } catch (err) {
      return {
        content: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async buildSystemPrompt(): Promise<string> {
    return buildSystemPrompt({
      tools: this.config.tools,
      customSystemPrompt: this.config.systemPrompt,
      appendSystemPrompt: this.config.appendSystemPrompt,
      mcpClients: this.config.mcpClients,
      cwd: this.config.cwd,
    });
  }

  private resolveModel(): string {
    return this.config.userSpecifiedModel ?? "gemini-3.5-flash";
  }

  private resolveThinkingConfig(): ThinkingConfig {
    return this.config.thinkingConfig ?? { type: "adaptive" };
  }

  private buildApiToolList() {
    const tools: Array<{ name: string; description: string; input_schema: unknown }> = [];
    for (const [name, tool] of this.config.tools) {
      tools.push({
        name,
        description: tool.description,
        input_schema: tool.inputSchema,
      });
    }
    return tools;
  }

  private accumulateUsage(usage: TokenUsage, model: string) {
    this.accumulatedUsage.input_tokens += usage.input_tokens;
    this.accumulatedUsage.output_tokens += usage.output_tokens;
    this.accumulatedCostUsd += costFromUsage(usage, model);
  }

  private handleApiError(err: unknown): QueryEvent {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("rate") ? "API_RATE_LIMIT" : "API_ERROR";
    const retryable = code === "API_RATE_LIMIT";
    return this.errorEvent(code, msg, retryable);
  }

  private errorEvent(
    code: AgentError["code"],
    message: string,
    retryable: boolean,
  ): QueryEvent {
    return {
      type: "error",
      error: { code, message, retryable },
    };
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  get totalCostUsd(): number { return this.accumulatedCostUsd; }
  get totalUsage(): TokenUsage { return { ...this.accumulatedUsage }; }
  get history(): Message[] { return [...this.messages]; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Rough token estimate used for compaction triggering.
 * Real implementation would use tiktoken or the model's tokeniser.
 * Blueprint comment notes they use a simple character-count heuristic here too.
 */
function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const block of msg.content) {
      if ("text" in block) chars += block.text.length;
      if ("thinking" in block) chars += (block as any).thinking.length;
    }
  }
  return Math.ceil(chars / 4); // ~4 chars per token
}

/**
 * Placeholder: in the real implementation the stream events accumulate content
 * into an array as they arrive. This function would return that accumulation.
 */
function extractContentFromStream(): ContentBlock[] {
  // Handled by the streaming loop in callModel — stub here
  return [];
}
