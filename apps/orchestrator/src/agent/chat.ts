import type {
  ChatCompletionRequest,
  ChatMessage,
  OpenRouterClient,
  ToolDef,
} from "@ai-testing/shared/openrouter";
import { supabaseAdmin } from "../db/supabase.js";
import { listCredentialSummaries } from "./credentials.js";
import { insertRun } from "./persistence.js";
import { runAgentLoop } from "./loop.js";
import { logger } from "../logger.js";

const CHAT_MAX_ITERATIONS = 6;

const CHAT_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "runTest",
      description:
        "Kick off a real browser-driven test run for this project. The agent that runs it will plan, execute, and judge the test independently. Returns a run id you can reference. Use this to start a test the user has clearly described or asked for. The 'prompt' should be specific and self-contained — write what should be verified, not 'do that test again'.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Self-contained test prompt: what should be verified.",
          },
          devicePreset: {
            type: "string",
            enum: ["desktop", "iphone", "ipad", "android"],
            description: "Optional device override for this run.",
          },
          rationale: {
            type: "string",
            description:
              "One short sentence on why you're running this test now (shown to the user).",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "askUser",
      description:
        "Ask the user a clarifying question. Use sparingly — only when you genuinely need information you can't infer. The question is the assistant content; this tool is just a marker that you're waiting for an answer.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
  },
];

function buildChatSystemPrompt(args: {
  projectName: string;
  targetUrl: string;
  availableCredentials: Array<{ name: string; fields: string[] }>;
}): string {
  const credLines =
    args.availableCredentials.length === 0
      ? "(none configured)"
      : args.availableCredentials
          .map((c) => `- "${c.name}" — fields: [${c.fields.join(", ")}]`)
          .join("\n");

  return `You are a senior QA partner helping the user test a web app. You converse naturally and run tests against the app as needed.

# Project
Name: ${args.projectName}
Target URL: ${args.targetUrl}

# Available credentials
${credLines}

# How to behave
- Be concise. Two short paragraphs at most per turn unless the user asks for depth.
- When the user describes a test or asks you to verify something, call runTest with a SPECIFIC, SELF-CONTAINED prompt (not "do that again" — the test agent has no memory of this chat). Include a short rationale.
- You may run multiple tests in one turn if the user asked for several distinct checks.
- For ambiguous requests, ask ONE clarifying question first via askUser.
- After kicking off runs you don't see the result inline — the user will follow up. You can reference run ids in later turns ("the run from earlier failed because...").
- Don't repeat what the user just said. Don't pad with "Sure!" or "Of course!"
- If the user asks something not testable (opinion, design feedback, code question), answer directly without calling runTest.`;
}

export interface ChatTurnInput {
  conversationId: string;
  projectId: string;
  userMessage: string;
}

export interface ChatTurnResult {
  assistantText: string;
  startedRuns: Array<{ runId: string; prompt: string; rationale?: string }>;
}

interface AssistantToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Process one user message in a conversation. Persists the user message,
 * calls Grok with the full thread + chat tools, persists the assistant's
 * response (text + tool calls), kicks off any runTest tools, and returns
 * the surface result for the UI.
 */
export async function handleChatTurn(
  llm: OpenRouterClient,
  input: ChatTurnInput,
): Promise<ChatTurnResult> {
  const sb = supabaseAdmin();

  // 1. Look up project + creds for context
  const { data: project } = await sb
    .from("projects")
    .select("name, target_url")
    .eq("id", input.projectId)
    .single();
  if (!project) throw new Error("Project not found");
  const availableCredentials = await listCredentialSummaries(input.projectId);

  // 2. Persist the user message
  await sb.from("conversation_messages").insert({
    conversation_id: input.conversationId,
    role: "user",
    content: input.userMessage,
  });

  // 3. Load the full thread for context
  const { data: history } = await sb
    .from("conversation_messages")
    .select("role, content, tool_calls, tool_call_id")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: true });

  // 4. Build the request — system + thread
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildChatSystemPrompt({
        projectName: project.name as string,
        targetUrl: project.target_url as string,
        availableCredentials,
      }),
    },
  ];
  for (const m of history ?? []) {
    const msg: ChatMessage = {
      role: (m.role as ChatMessage["role"]) ?? "user",
      content: (m.content as string) ?? "",
    };
    if (m.tool_calls) (msg as { tool_calls?: unknown }).tool_calls = m.tool_calls;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id as string;
    messages.push(msg);
  }

  // 5. Loop — let the model call tools, persist results, continue until it
  //    produces a final assistant message with no further tool calls.
  const startedRuns: ChatTurnResult["startedRuns"] = [];

  for (let iter = 0; iter < CHAT_MAX_ITERATIONS; iter++) {
    const req: ChatCompletionRequest = {
      messages,
      tools: CHAT_TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
    };
    const resp = await llm.chat(req);
    const choice = resp.choices[0];
    if (!choice) break;

    const toolCalls = choice.message.tool_calls as AssistantToolCall[] | undefined;
    const content = choice.message.content ?? "";

    // Persist the assistant message (text + any tool_calls)
    await sb.from("conversation_messages").insert({
      conversation_id: input.conversationId,
      role: "assistant",
      content,
      tool_calls: toolCalls ?? null,
    });

    // Mirror onto local thread for the next iteration
    const assistantMsg: ChatMessage = { role: "assistant", content };
    if (toolCalls) (assistantMsg as { tool_calls?: unknown }).tool_calls = toolCalls;
    messages.push(assistantMsg);

    if (!toolCalls || toolCalls.length === 0) {
      // No more tool calls — assistant turn complete.
      break;
    }

    // Process each tool call
    for (const tc of toolCalls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsed = {};
      }

      if (tc.function.name === "runTest") {
        const prompt = String(parsed.prompt ?? "").trim();
        const devicePreset = ["desktop", "iphone", "ipad", "android"].includes(String(parsed.devicePreset))
          ? (parsed.devicePreset as "desktop" | "iphone" | "ipad" | "android")
          : undefined;
        const rationale = String(parsed.rationale ?? "");
        if (!prompt) {
          await persistToolResult(input.conversationId, tc.id, "Error: prompt is required");
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: "Error: prompt is required",
          });
          continue;
        }

        const runId = await insertRun({
          projectId: input.projectId,
          prompt,
          contextRefs: [],
          model: process.env.OPENROUTER_DEFAULT_MODEL ?? "x-ai/grok-4.1-fast",
        });
        // Link to conversation
        await sb
          .from("runs")
          .update({ conversation_id: input.conversationId })
          .eq("id", runId);

        // Persist a tool message + a marker assistant message that links the run
        const toolResult = `Started run ${runId}.`;
        await persistToolResult(input.conversationId, tc.id, toolResult, runId);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolResult,
        });

        startedRuns.push({ runId, prompt, ...(rationale ? { rationale } : {}) });

        // Fire and forget the actual agent loop. conversationId tells the
        // loop to post a follow-up summary message when the run completes.
        runAgentLoop(llm, {
          runId,
          projectId: input.projectId,
          conversationId: input.conversationId,
          prompt,
          context: "",
          targetUrl: project.target_url as string,
          ...(devicePreset ? { devicePreset } : {}),
        }).catch((err) =>
          logger.error({ err, runId }, "chat-spawned agent loop failed"),
        );
        continue;
      }

      if (tc.function.name === "askUser") {
        // The assistant content already contains the question; tool result is a no-op.
        const ack = "Awaiting user response.";
        await persistToolResult(input.conversationId, tc.id, ack);
        messages.push({ role: "tool", tool_call_id: tc.id, content: ack });
        continue;
      }

      // Unknown tool
      const errMsg = `Unknown tool: ${tc.function.name}. Use runTest or askUser.`;
      await persistToolResult(input.conversationId, tc.id, errMsg);
      messages.push({ role: "tool", tool_call_id: tc.id, content: errMsg });
    }
  }

  // Pull the last assistant text we persisted (for the API response convenience)
  const { data: last } = await sb
    .from("conversation_messages")
    .select("content")
    .eq("conversation_id", input.conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Touch the conversation so the list ordering reflects activity
  await sb
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  return {
    assistantText: (last?.content as string) ?? "",
    startedRuns,
  };
}

async function persistToolResult(
  conversationId: string,
  toolCallId: string,
  content: string,
  runId?: string,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("conversation_messages").insert({
    conversation_id: conversationId,
    role: "tool",
    content,
    tool_call_id: toolCallId,
    run_id: runId ?? null,
  });
}
