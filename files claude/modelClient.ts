/**
 * AGENT CORE — engine/modelClient.ts
 *
 * Thin streaming wrapper around the Anthropic Messages API.
 * Inferred from: services/api/claude.ts, query.ts, utils/thinking.ts
 *
 * Design notes from blueprint analysis:
 *  - The blueprint uses prompt-caching betas aggressively (cache_control blocks)
 *  - Thinking tokens are gated by a ThinkingConfig + model capability check
 *  - Retry logic: rate-limit errors get exponential backoff; other 5xx get 1 retry
 *  - The client streams via EventSource/SSE, not WebSocket, for the main loop
 *  - Usage is returned on the final message_stop event
 */

import type {
  ContentBlock,
  Message,
  QueryEvent,
  StopReason,
  ThinkingConfig,
  TokenUsage,
} from "./types.js";

export type ModelCallParams = {
  model: string;
  system: string;
  messages: Message[];
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
  thinkingConfig: ThinkingConfig;
  signal: AbortSignal;
  maxTokens?: number;
};

/** Map model name → cost per 1k tokens [input, output] in USD */
export const COST_PER_1K: Record<string, [number, number]> = {
  "claude-opus-4-5":     [0.015, 0.075],
  "claude-sonnet-4-5":   [0.003, 0.015],
  "claude-haiku-4-5":    [0.00025, 0.00125],
  // Fallback for unknown models
  default:               [0.003, 0.015],
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

/** Default max output tokens; budget-constrained runs use lower values. */
const DEFAULT_MAX_TOKENS = 8192;

/** Maximum retry attempts for retryable errors. */
const MAX_RETRIES = 3;

/** Base delay for exponential back-off (ms). */
const RETRY_BASE_MS = 1000;

// ─────────────────────────────────────────────────────────────────────────────

export async function* callModel(
  params: ModelCallParams,
): AsyncGenerator<QueryEvent> {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      yield* callModelOnce(params);
      return;
    } catch (err: unknown) {
      const ae = classifyApiError(err);
      if (!ae.retryable || attempt >= MAX_RETRIES) {
        yield { type: "error", error: ae };
        return;
      }
      const delay = RETRY_BASE_MS * 2 ** attempt;
      await sleep(delay);
      attempt++;
    }
  }
}

// ─── Single-attempt streaming call ───────────────────────────────────────────

async function* callModelOnce(params: ModelCallParams): AsyncGenerator<QueryEvent> {
  const {
    model,
    system,
    messages,
    tools,
    thinkingConfig,
    signal,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = params;

  const body = buildRequestBody({
    model,
    system,
    messages,
    tools,
    thinkingConfig,
    maxTokens,
  });

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new ApiError(resp.status, text);
  }

  if (!resp.body) throw new ApiError(0, "Empty response body");

  yield* parseSSEStream(resp.body);
}

// ─── SSE stream parser ────────────────────────────────────────────────────────

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<QueryEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Accumulation state for content blocks
  const contentBlocks: ContentBlock[] = [];
  let currentBlockIndex = -1;
  let finalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  let finalStopReason: StopReason = "end_turn";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;

        let event: AnthropicStreamEvent;
        try {
          event = JSON.parse(data) as AnthropicStreamEvent;
        } catch {
          continue;
        }

        // ── Dispatch stream events ───────────────────────────────────
        switch (event.type) {
          case "message_start":
            finalUsage = event.message.usage ?? finalUsage;
            yield {
              type: "message_start",
              usage: finalUsage,
            };
            break;

          case "content_block_start": {
            currentBlockIndex = event.index;
            const block = event.content_block as ContentBlock;
            contentBlocks[event.index] = block;
            if (block.type === "tool_use") {
              yield {
                type: "tool_use_start",
                toolUseId: block.id as any,
                name: block.name,
              };
            } else {
              yield {
                type: "content_block_start",
                index: event.index,
                block,
              };
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            // Accumulate text into the block
            const block = contentBlocks[event.index];
            if (block?.type === "text" && delta.type === "text_delta") {
              block.text = (block.text ?? "") + delta.text;
              yield {
                type: "content_block_delta",
                index: event.index,
                delta: delta.text,
              };
            } else if (block?.type === "thinking" && delta.type === "thinking_delta") {
              (block as any).thinking =
                ((block as any).thinking ?? "") + delta.thinking;
            } else if (block?.type === "tool_use" && delta.type === "input_json_delta") {
              // Accumulate partial JSON for tool input
              (block as any)._inputJson =
                ((block as any)._inputJson ?? "") + delta.partial_json;
            }
            break;
          }

          case "content_block_stop": {
            const block = contentBlocks[event.index];
            // Finalise tool_use input JSON
            if (block?.type === "tool_use") {
              try {
                (block as any).input = JSON.parse((block as any)._inputJson ?? "{}");
              } catch {
                (block as any).input = {};
              }
            }
            yield { type: "content_block_stop", index: event.index };
            break;
          }

          case "message_delta":
            if (event.usage) {
              finalUsage.output_tokens = event.usage.output_tokens ?? finalUsage.output_tokens;
            }
            if (event.delta?.stop_reason) {
              finalStopReason = event.delta.stop_reason as StopReason;
            }
            break;

          case "message_stop":
            yield {
              type: "message_stop",
              usage: finalUsage,
              stopReason: finalStopReason,
            };
            break;

          case "error":
            throw new ApiError(event.error?.status ?? 0, event.error?.message ?? "Unknown error");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Request builder ──────────────────────────────────────────────────────────

function buildRequestBody(params: {
  model: string;
  system: string;
  messages: Message[];
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
  thinkingConfig: ThinkingConfig;
  maxTokens: number;
}) {
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    system: [
      {
        type: "text",
        text: params.system,
        // Cache the system prompt — it changes infrequently and is large
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: params.messages.map(serializeMessage),
    tools: params.tools,
    stream: true,
  };

  // Thinking / extended thinking support
  if (params.thinkingConfig.type === "enabled") {
    body.thinking = {
      type: "enabled",
      budget_tokens: params.thinkingConfig.budgetTokens,
    };
    body.betas = ["interleaved-thinking-2025-05-14"];
  } else if (params.thinkingConfig.type === "adaptive") {
    body.thinking = { type: "auto" };
    body.betas = ["interleaved-thinking-2025-05-14"];
  }

  return body;
}

function buildHeaders(): Record<string, string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "prompt-caching-2024-07-31",
  };
}

function serializeMessage(msg: Message): unknown {
  return {
    role: msg.role === "system" ? "user" : msg.role,
    content: msg.content,
  };
}

// ─── Cost calculation ─────────────────────────────────────────────────────────

export function costFromUsage(usage: TokenUsage, model: string): number {
  const [inputRate, outputRate] =
    COST_PER_1K[model] ?? COST_PER_1K["default"]!;
  const input  = (usage.input_tokens  / 1000) * inputRate;
  const output = (usage.output_tokens / 1000) * outputRate;
  // Cache reads are cheaper (blueprint charges ~10% of normal input price)
  const cacheRead = ((usage.cache_read_input_tokens ?? 0) / 1000) * inputRate * 0.1;
  return input + output + cacheRead;
}

// ─── Error handling ───────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function classifyApiError(err: unknown) {
  if (err instanceof ApiError) {
    const retryable = err.status === 429 || err.status >= 500;
    let code: import("./types.js").AgentError["code"] = "API_ERROR";
    if (err.status === 429) code = "API_RATE_LIMIT";
    return { code, message: err.message, retryable, details: { status: err.status } };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const isAbort = msg.includes("abort") || msg.includes("AbortError");
  return {
    code: isAbort
      ? ("ABORT" as const)
      : ("API_ERROR" as const),
    message: msg,
    retryable: false,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Anthropic stream event types (private) ───────────────────────────────────

type AnthropicStreamEvent =
  | { type: "message_start"; message: { usage?: TokenUsage } }
  | { type: "content_block_start"; index: number; content_block: unknown }
  | { type: "content_block_delta"; index: number; delta: { type: string; text?: string; thinking?: string; partial_json?: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta?: { stop_reason?: string }; usage?: { output_tokens?: number } }
  | { type: "message_stop" }
  | { type: "error"; error?: { status?: number; message?: string } };
