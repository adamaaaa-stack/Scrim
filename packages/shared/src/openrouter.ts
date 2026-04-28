/**
 * Thin OpenRouter client. Used by orchestrator (and optionally web).
 * Defaults to Grok 4.1 Fast — override per-call via `model`.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; [k: string]: unknown }>;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface OpenRouterConfig {
  apiKey: string;
  defaultModel?: string;
  appName?: string;
  appUrl?: string;
}

export function createOpenRouterClient(config: OpenRouterConfig) {
  const defaultModel = config.defaultModel ?? "x-ai/grok-4.1-fast";

  return {
    async chat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...(config.appUrl ? { "HTTP-Referer": config.appUrl } : {}),
          ...(config.appName ? { "X-Title": config.appName } : {}),
        },
        body: JSON.stringify({ model: defaultModel, ...req }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${text}`);
      }
      return (await res.json()) as ChatCompletionResponse;
    },
  };
}

export type OpenRouterClient = ReturnType<typeof createOpenRouterClient>;
