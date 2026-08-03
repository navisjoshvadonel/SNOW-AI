import { GoogleGenAI } from "@google/genai";
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

export const COST_PER_1K: Record<string, [number, number]> = {
  "gemini-2.5-flash": [0.000075, 0.0003],
  "gemini-2.5-pro": [0.00125, 0.005],
  default: [0.000075, 0.0003],
};

const DEFAULT_MAX_TOKENS = 8192;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

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

async function* callModelOnce(params: ModelCallParams): AsyncGenerator<QueryEvent> {
  let isOffline = false;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "") {
    isOffline = true;
  }

  if (!isOffline) {
    try {
      yield* callGeminiOnce(params, apiKey!);
      return;
    } catch (err: any) {
      console.warn(`[SNOW BACKEND] Gemini API failed (${err.message}). Falling back to Offline Mode (Ollama)...`);
      isOffline = true;
    }
  }

  if (isOffline) {
    yield* callOllamaOnce(params);
  }
}

async function* callGeminiOnce(params: ModelCallParams, apiKey: string): AsyncGenerator<QueryEvent> {
  const { model = "gemini-2.5-flash", system, messages, tools, signal } = params;
  const ai = new GoogleGenAI({ apiKey });

  // Map messages to Gemini format
  const contents = messages.map(msg => {
    return {
      role: msg.role === "assistant" ? "model" : "user",
      parts: msg.content.map(block => {
        if ("text" in block) return { text: block.text };
        if ("type" in block && block.type === "tool_result") {
          return {
            functionResponse: {
              name: (block as any).tool_use_id || "unknown",
              response: { result: (block as any).content }
            }
          };
        }
        if ("type" in block && block.type === "tool_use") {
          return {
            functionCall: {
              name: (block as any).name,
              args: (block as any).input
            }
          };
        }
        return { text: "" };
      })
    };
  });

  const functionDeclarations = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: mapSchemaToGemini(t.input_schema)
  }));
  const toolConfig = functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined;

  const reqConfig: any = {
    systemInstruction: system,
    tools: toolConfig,
  };

  yield { type: "message_start", usage: { input_tokens: 0, output_tokens: 0 } };

  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: reqConfig
  });

  let blockIndex = 0;
  let finalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  let finalStopReason: StopReason = "end_turn";

  for await (const chunk of stream) {
    if (signal.aborted) throw new Error("Aborted by user");
    if (chunk.usageMetadata) {
      finalUsage.input_tokens = chunk.usageMetadata.promptTokenCount ?? 0;
      finalUsage.output_tokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
    }

    if (chunk.candidates && chunk.candidates.length > 0) {
      const candidate = chunk.candidates[0];
      if (candidate.finishReason) {
        if (candidate.finishReason === "STOP") finalStopReason = "end_turn";
        else if (candidate.finishReason === "MAX_TOKENS") finalStopReason = "max_tokens";
        else finalStopReason = "end_turn";
      }

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            yield { type: "content_block_start", index: blockIndex, block: { type: "text", text: "" } };
            yield { type: "content_block_delta", index: blockIndex, delta: part.text };
            yield { type: "content_block_stop", index: blockIndex };
            blockIndex++;
          }
          if (part.functionCall) {
            finalStopReason = "tool_use";
            yield { type: "tool_use_start", toolUseId: part.functionCall.name, name: part.functionCall.name };
            yield { type: "content_block_delta", index: blockIndex, delta: { partial_json: JSON.stringify(part.functionCall.args) } as any };
            yield { type: "content_block_stop", index: blockIndex };
            blockIndex++;
          }
        }
      }
    }
  }

  yield { type: "message_stop", usage: finalUsage, stopReason: finalStopReason };
}

async function* callOllamaOnce(params: ModelCallParams): AsyncGenerator<QueryEvent> {
  const { system, messages, tools, signal } = params;
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1";

  // Map messages to Ollama (OpenAI compatible) format
  const ollamaMessages = [{ role: "system", content: system }];
  
  for (const msg of messages) {
    if (msg.role === "user") {
      let text = "";
      for (const b of msg.content) {
        if ("text" in b) text += b.text + "\n";
        if ("type" in b && b.type === "tool_result") {
           ollamaMessages.push({ role: "tool", content: (b as any).content, name: (b as any).tool_use_id } as any);
        }
      }
      if (text) ollamaMessages.push({ role: "user", content: text });
    } else if (msg.role === "assistant") {
      let text = "";
      const tool_calls: any[] = [];
      for (const b of msg.content) {
        if ("text" in b) text += b.text + "\n";
        if ("type" in b && b.type === "tool_use") {
           tool_calls.push({
             type: "function",
             function: { name: (b as any).name, arguments: (b as any).input }
           });
        }
      }
      const astMsg: any = { role: "assistant", content: text };
      if (tool_calls.length > 0) astMsg.tool_calls = tool_calls;
      ollamaMessages.push(astMsg);
    }
  }

  // Map tools
  const ollamaTools = tools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema // Ollama/OpenAI natively supports standard JSON schema
    }
  }));

  yield { type: "message_start", usage: { input_tokens: 0, output_tokens: 0 } };

  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: ollamaModel,
      messages: ollamaMessages,
      tools: ollamaTools.length > 0 ? ollamaTools : undefined,
      stream: false // Using non-streaming for simplicity in fallback, since tool calls in stream are complex to parse manually
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API returned ${response.status}`);
  }

  const data: any = await response.json();
  const msg = data.message;
  let blockIndex = 0;
  let finalStopReason: StopReason = "end_turn";

  if (msg.content) {
    yield { type: "content_block_start", index: blockIndex, block: { type: "text", text: "" } };
    yield { type: "content_block_delta", index: blockIndex, delta: msg.content };
    yield { type: "content_block_stop", index: blockIndex };
    blockIndex++;
  }

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    finalStopReason = "tool_use";
    for (const tc of msg.tool_calls) {
      if (tc.function) {
        yield { type: "tool_use_start", toolUseId: tc.function.name, name: tc.function.name };
        yield { type: "content_block_delta", index: blockIndex, delta: { partial_json: JSON.stringify(tc.function.arguments) } as any };
        yield { type: "content_block_stop", index: blockIndex };
        blockIndex++;
      }
    }
  }

  yield {
    type: "message_stop",
    usage: { input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0 },
    stopReason: finalStopReason
  };
}

// Map JSON schema to Gemini Schema
function mapSchemaToGemini(schema: any): any {
  if (!schema) return undefined;
  
  const mapType = (type: string) => {
    switch (type) {
      case "string": return "STRING";
      case "number": return "NUMBER";
      case "integer": return "INTEGER";
      case "boolean": return "BOOLEAN";
      case "array": return "ARRAY";
      case "object": return "OBJECT";
      default: return "STRING";
    }
  };

  const traverse = (s: any): any => {
    if (!s || typeof s !== "object") return undefined;
    const res: any = { type: mapType(s.type) };
    if (s.description) res.description = s.description;
    if (s.properties) {
      res.properties = {};
      for (const [k, v] of Object.entries(s.properties)) {
        res.properties[k] = traverse(v);
      }
    }
    if (s.items) {
      res.items = traverse(s.items);
    }
    if (s.required) {
      res.required = s.required;
    }
    if (s.enum) {
      res.enum = s.enum;
    }
    return res;
  };
  
  return traverse(schema);
}

export function costFromUsage(usage: TokenUsage, model: string): number {
  const [inputRate, outputRate] = COST_PER_1K[model] ?? COST_PER_1K["default"]!;
  const input  = (usage.input_tokens  / 1000) * inputRate;
  const output = (usage.output_tokens / 1000) * outputRate;
  return input + output;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
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
    code: isAbort ? ("ABORT" as const) : ("API_ERROR" as const),
    message: msg,
    retryable: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
