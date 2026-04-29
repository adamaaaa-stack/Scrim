import type { OpenRouterClient } from "@ai-testing/shared/openrouter";
import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

const SYSTEM_PROMPT = `You report back in a chat thread on a test that just finished.

Rules:
- 1-3 sentences max. Lead with the verdict (passed / failed / errored).
- For PASS: name the most meaningful evidence cited.
- For FAIL: name the specific check that failed and what was observed.
- For ERROR: explain what blocked the run (e.g. credential missing, page never loaded).
- Plain prose. No headers, no bullet lists, no markdown.
- The user can click the run card to see full details — your message is the at-a-glance summary, not the full report.`;

/**
 * Post a brief follow-up assistant message to the chat thread summarising
 * the outcome of a run that was spawned from this conversation.
 */
export async function postRunSummaryToChat(args: {
  llm: OpenRouterClient;
  runId: string;
  conversationId: string;
  status: "passed" | "failed" | "errored";
  prompt: string;
  reason: string;
}): Promise<void> {
  const { llm, runId, conversationId, status, prompt, reason } = args;

  const userMsg = `Test prompt: ${prompt}\n\nStatus: ${status}\n\nVerdict / error from test agent:\n${reason}\n\nWrite the follow-up message.`;

  let summary: string;
  try {
    const resp = await llm.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    summary = resp.choices[0]?.message.content?.trim() ?? "";
    if (!summary) return;
  } catch (err) {
    logger.warn({ err, runId, conversationId }, "summary LLM call failed");
    // Fallback: a deterministic short message so the user still gets feedback.
    const verb = status === "passed" ? "passed" : status === "failed" ? "failed" : "errored";
    summary = `Run ${runId.slice(0, 8)} ${verb}. ${reason.slice(0, 200)}`;
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("conversation_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: summary,
    run_id: runId,
  });
  if (error) {
    logger.warn({ err: error.message, runId, conversationId }, "summary insert failed");
    return;
  }
  // Bump conversation activity so it sorts to the top in lists.
  await sb
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
