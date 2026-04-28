import type {
  ChatCompletionRequest,
  ChatMessage,
  OpenRouterClient,
  ToolDef,
} from "@ai-testing/shared/openrouter";
import {
  BROWSER_TOOLS,
  BrowserWorker,
  type Observation,
  type ToolName,
} from "../workers/browser.js";
import { buildSystemPrompt } from "./prompts.js";
import { persistStep, updateRun } from "./persistence.js";
import { logger } from "../logger.js";

const MAX_ITERATIONS = 25;
const BROWSER_TOOL_NAMES: ReadonlySet<string> = new Set([
  "navigate",
  "click",
  "type",
  "wait",
  "screenshot",
  "getDom",
]);

const ASSERTION_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "assertPass",
      description:
        "Call this when the user's test prompt has been verified to succeed. Include a one-sentence reason.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assertFail",
      description:
        "Call this when the user's test prompt has been verified to fail. Include a one-sentence reason explaining what went wrong.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
];

export interface AgentLoopInput {
  runId: string;
  prompt: string;
  context: string;
  targetUrl: string;
  model?: string;
}

export interface AgentLoopResult {
  status: "passed" | "failed" | "errored";
  finalReason?: string;
  iterations: number;
  error?: string;
}

interface AssistantMessage extends ChatMessage {
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export async function runAgentLoop(
  llm: OpenRouterClient,
  input: AgentLoopInput,
): Promise<AgentLoopResult> {
  await updateRun(input.runId, { status: "running" });

  const worker = new BrowserWorker({ runId: input.runId });
  await worker.start();

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input) },
    { role: "user", content: input.prompt },
  ];

  const tools = [...BROWSER_TOOLS, ...ASSERTION_TOOLS];
  let stepIndex = 0;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const req: ChatCompletionRequest = {
        ...(input.model ? { model: input.model } : {}),
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0,
      };
      const resp = await llm.chat(req);
      const choice = resp.choices[0];
      if (!choice) {
        return await finish("errored", "OpenRouter returned no choices", iter);
      }
      const msg = choice.message;

      // Append assistant turn (with any tool_calls) verbatim — required for the
      // next request to match tool_call_id when we send tool results.
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      } as AssistantMessage);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return await finish(
          "errored",
          `Model returned text without final assertion: ${msg.content?.slice(0, 200) ?? ""}`,
          iter,
        );
      }

      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsedArgs = {};
        }

        if (name === "assertPass" || name === "assertFail") {
          const reason = String(parsedArgs.reason ?? "(no reason given)");
          stepIndex += 1;
          await persistStep({
            runId: input.runId,
            index: stepIndex,
            kind: name,
            intent: reason,
            toolName: name,
            toolArgs: parsedArgs,
            judgmentPass: name === "assertPass",
            judgmentReason: reason,
          });
          const status = name === "assertPass" ? "passed" : "failed";
          return await finish(status, reason, iter + 1);
        }

        if (!BROWSER_TOOL_NAMES.has(name)) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: unknown tool "${name}". Use one of: navigate, click, type, wait, screenshot, getDom, assertPass, assertFail.`,
          });
          continue;
        }

        const obs = await worker.execute({
          name: name as ToolName,
          args: parsedArgs,
        });

        stepIndex += 1;
        await persistStep({
          runId: input.runId,
          index: stepIndex,
          kind: name as ToolName,
          intent: String(parsedArgs.description ?? name),
          toolName: name,
          toolArgs: parsedArgs,
          observation: obs,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: formatToolResult(obs),
        });
      }
    }

    return await finish(
      "errored",
      `Max iterations (${MAX_ITERATIONS}) reached without a final assertion`,
      MAX_ITERATIONS,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, runId: input.runId }, "agent loop crashed");
    return await finish("errored", message, -1);
  } finally {
    await worker.stop().catch(() => {});
  }

  async function finish(
    status: AgentLoopResult["status"],
    reasonOrError: string,
    iterations: number,
  ): Promise<AgentLoopResult> {
    await updateRun(input.runId, {
      status,
      completedAt: new Date(),
      ...(status === "errored" ? { error: reasonOrError } : { error: null }),
    });
    return {
      status,
      iterations,
      ...(status === "errored"
        ? { error: reasonOrError }
        : { finalReason: reasonOrError }),
    };
  }
}

/**
 * Format browser observation as a string tool-result for the LLM.
 * xAI rejects array content in tool messages, so vision is text-only here;
 * screenshots are still saved to storage for the run viewer.
 */
function formatToolResult(obs: Observation): string {
  return [
    obs.ok ? "ok" : `error: ${obs.error ?? "unknown"}`,
    obs.url ? `url: ${obs.url}` : null,
    obs.screenshotPath ? `screenshot saved: ${obs.screenshotPath}` : null,
    obs.domSnippet ? `dom (truncated):\n${obs.domSnippet.slice(0, 4000)}` : null,
    obs.consoleLog && obs.consoleLog.length > 0
      ? `console (last 10):\n${obs.consoleLog.slice(-10).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
