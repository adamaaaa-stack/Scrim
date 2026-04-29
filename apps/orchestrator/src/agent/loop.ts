import type {
  ChatCompletionRequest,
  ChatMessage,
  OpenRouterClient,
  ToolDef,
} from "@ai-testing/shared/openrouter";
import {
  BROWSER_TOOLS,
  BrowserWorker,
  type DevicePreset,
  type Observation,
  type ToolName,
} from "../workers/browser.js";
import { buildSystemPrompt } from "./prompts.js";
import { persistStep, updateRun } from "./persistence.js";
import { listCredentialSummaries } from "./credentials.js";
import { reportFailureToGithub } from "../integrations/github.js";
import { logger } from "../logger.js";

const MAX_ITERATIONS = 30;
const MIN_SUBSTANTIVE_CALLS = 5;
const BROWSER_TOOL_NAMES: ReadonlySet<string> = new Set([
  "navigate",
  "click",
  "type",
  "wait",
  "screenshot",
  "getDom",
  "evaluate",
  "getAccessibility",
  "setViewport",
  "signIn",
]);

const PLANNING_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "plan",
      description:
        "REQUIRED FIRST TOOL CALL. Declare 3-7 specific, testable checks you will perform. Each check should be one short sentence describing what to verify and roughly how.",
      parameters: {
        type: "object",
        properties: {
          checks: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 7,
          },
        },
        required: ["checks"],
      },
    },
  },
];

const ASSERTION_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "assertPass",
      description:
        "Final verdict: the user's prompt has been verified to succeed. MUST cite specific evidence per check from your plan. Rejected if fewer than 5 substantive tool calls have been made.",
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
        "Final verdict: the user's prompt has been verified to fail. MUST name the failing check and cite the observed evidence.",
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
  projectId: string;
  prompt: string;
  context: string;
  targetUrl: string;
  model?: string;
  devicePreset?: DevicePreset;
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
  const devicePreset = input.devicePreset ?? "desktop";
  await updateRun(input.runId, { status: "running", devicePreset });

  const worker = new BrowserWorker({
    runId: input.runId,
    projectId: input.projectId,
    devicePreset,
    recordTrace: true,
  });
  await worker.start();

  // Surface this project's credentials so the agent uses the correct
  // credentialName (instead of confusing it with the email value).
  const availableCredentials = await listCredentialSummaries(input.projectId);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        targetUrl: input.targetUrl,
        context: input.context,
        availableCredentials,
      }),
    },
    { role: "user", content: input.prompt },
  ];

  const tools = [...PLANNING_TOOLS, ...BROWSER_TOOLS, ...ASSERTION_TOOLS];
  let stepIndex = 0;
  let substantiveCalls = 0;
  let planSubmitted = false;
  // Track the most recent step with a screenshot so we can attach it to a
  // failure issue if the run ends in assertFail.
  let lastScreenshotStep: {
    index: number;
    toolName: string;
    intent: string;
    screenshotPath: string | null;
  } | null = null;

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

        // 1. Plan tool — must come first.
        if (name === "plan") {
          const checks = Array.isArray(parsedArgs.checks)
            ? (parsedArgs.checks as unknown[]).map(String)
            : [];
          if (checks.length < 3) {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: "Error: plan must include at least 3 specific checks. Try again.",
            });
            continue;
          }
          planSubmitted = true;
          stepIndex += 1;
          await persistStep({
            runId: input.runId,
            index: stepIndex,
            kind: "plan",
            intent: `Plan: ${checks.length} checks`,
            toolName: "plan",
            toolArgs: { checks },
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Plan accepted (${checks.length} checks):\n${checks.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nNow execute the plan. You must perform at least ${MIN_SUBSTANTIVE_CALLS} substantive tool calls before asserting.`,
          });
          continue;
        }

        // 2. Assertion tools — gated by plan + minimum substantive calls.
        if (name === "assertPass" || name === "assertFail") {
          if (!planSubmitted) {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: "Error: you must call plan() before any assertion. Submit your test plan first.",
            });
            continue;
          }
          if (name === "assertPass" && substantiveCalls < MIN_SUBSTANTIVE_CALLS) {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: `Error: assertPass rejected — only ${substantiveCalls} substantive tool calls so far, need at least ${MIN_SUBSTANTIVE_CALLS}. Continue investigating: try evaluate(), getAccessibility(), interact with the page, or check more elements.`,
            });
            continue;
          }
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

        // 3. Browser tools — require plan first.
        if (!BROWSER_TOOL_NAMES.has(name)) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: unknown tool "${name}". Available: plan, navigate, click, type, wait, screenshot, getDom, evaluate, getAccessibility, setViewport, assertPass, assertFail.`,
          });
          continue;
        }
        if (!planSubmitted) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: you must call plan() with your test checks before using browser tools.`,
          });
          continue;
        }

        const obs = await worker.execute({
          name: name as ToolName,
          args: parsedArgs,
        });

        substantiveCalls += 1;
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

        if (obs.screenshotPath) {
          lastScreenshotStep = {
            index: stepIndex,
            toolName: name,
            intent: String(parsedArgs.description ?? name),
            screenshotPath: obs.screenshotPath,
          };
        }

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
    // After stop(), the trace has been uploaded. Persist its path so the
    // viewer can link to the Playwright trace viewer.
    const tracePath = worker.getTracePath();
    if (tracePath) {
      await updateRun(input.runId, { tracePath }).catch((err) =>
        logger.warn({ err, runId: input.runId }, "trace path persist failed"),
      );
    }
  }

  async function maybeFileFailureIssue(reason: string): Promise<void> {
    try {
      const tracePath = worker.getTracePath();
      const result = await reportFailureToGithub({
        runId: input.runId,
        projectId: input.projectId,
        prompt: input.prompt,
        reason,
        failedStep: lastScreenshotStep
          ? {
              index: lastScreenshotStep.index,
              toolName: lastScreenshotStep.toolName,
              intent: lastScreenshotStep.intent,
            }
          : { index: stepIndex, toolName: "assertFail", intent: reason },
        screenshotPath: lastScreenshotStep?.screenshotPath ?? null,
        tracePath,
        devicePreset,
      });
      if (result) {
        await updateRun(input.runId, {
          githubIssueUrl: result.issueUrl,
          githubIssueNumber: result.issueNumber,
        });
        logger.info(
          { runId: input.runId, issue: result },
          result.isComment ? "github: commented on existing issue" : "github: filed new issue",
        );
      }
    } catch (err) {
      logger.warn({ err, runId: input.runId }, "github issue filing failed");
    }
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
    if (status === "failed") {
      await maybeFileFailureIssue(reasonOrError);
    }
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
  const failedRequests = (obs.networkLog ?? []).filter((n) => n.failed);
  return [
    obs.ok ? "ok" : `error: ${obs.error ?? "unknown"}`,
    obs.url ? `url: ${obs.url}` : null,
    obs.viewport ? `viewport: ${obs.viewport.width}x${obs.viewport.height}` : null,
    obs.evaluateResult !== undefined
      ? `evaluate result:\n${typeof obs.evaluateResult === "string" ? obs.evaluateResult : JSON.stringify(obs.evaluateResult, null, 2)}`
      : null,
    obs.accessibilitySnippet
      ? `accessibility tree (truncated):\n${obs.accessibilitySnippet}`
      : null,
    obs.domSnippet ? `dom (truncated):\n${obs.domSnippet.slice(0, 4000)}` : null,
    obs.consoleLog && obs.consoleLog.length > 0
      ? `console (last 10):\n${obs.consoleLog.slice(-10).join("\n")}`
      : null,
    failedRequests.length > 0
      ? `failed network requests (${failedRequests.length}):\n${failedRequests.slice(-10).map((n) => `  ${n.method ?? ""} ${n.url} ${n.status ?? "FAILED"}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
