import type {
  ChatCompletionRequest,
  OpenRouterClient,
} from "@ai-testing/shared/openrouter";
import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

export interface NarrationResult {
  /** One-line summary of the whole run. */
  summary: string;
  /** Per-step narration: 1-2 plain-language sentences explaining the step. */
  stepNarrations: Record<string, string>;
}

interface StepRow {
  id: string;
  index: number;
  kind: string;
  intent: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  dom_snapshot: string | null;
  console_log: string[] | null;
  judgment_pass: boolean | null;
  judgment_reason: string | null;
}

const SYSTEM_PROMPT = `You explain what happened during a test run in plain language. The run was performed by an autonomous QA agent driving a browser.

For each step, write 1-2 sentences explaining:
- What the agent was trying to do
- What actually happened (what it observed / what it concluded)
- If applicable, why it mattered (gave info, was a setback, confirmed a hypothesis)

For the overall run summary, write 2-3 sentences capturing the arc: what the test set out to verify, what the agent discovered, and the final outcome.

Tone: a senior engineer explaining a debugging session to a colleague. Concrete, no fluff, no padding. Use the agent's actual tool names where helpful (\`navigate\`, \`evaluate\`, \`signIn\`).

Output STRICT JSON, no markdown, no commentary:
{
  "summary": "<2-3 sentence overview>",
  "stepNarrations": {
    "<stepId>": "<1-2 sentences>",
    ...
  }
}`;

/**
 * Generate a step-by-step plain-language walkthrough of a run.
 * Single LLM call processes all steps at once for token efficiency.
 */
export async function narrateRun(
  llm: OpenRouterClient,
  runId: string,
): Promise<NarrationResult> {
  const sb = supabaseAdmin();

  const [{ data: run }, { data: stepsData }] = await Promise.all([
    sb
      .from("runs")
      .select("status, prompt, error")
      .eq("id", runId)
      .single(),
    sb
      .from("steps")
      .select(
        "id, index, kind, intent, tool_name, tool_args, dom_snapshot, console_log, judgment_pass, judgment_reason",
      )
      .eq("run_id", runId)
      .order("index", { ascending: true }),
  ]);

  if (!run) throw new Error("Run not found");
  const steps = (stepsData ?? []) as StepRow[];
  if (steps.length === 0) {
    return { summary: "No steps were recorded for this run.", stepNarrations: {} };
  }

  // Build a compact, structured input for the model.
  const stepsCompact = steps.map((s) => ({
    id: s.id,
    index: s.index,
    tool: s.tool_name ?? s.kind,
    intent: s.intent,
    args: truncateArgs(s.tool_args),
    domHint: s.dom_snapshot ? truncate(s.dom_snapshot, 400) : undefined,
    consoleHint:
      s.console_log && s.console_log.length > 0
        ? s.console_log.slice(-3)
        : undefined,
    judgment:
      s.judgment_pass !== null
        ? {
            pass: s.judgment_pass,
            reason: s.judgment_reason ? truncate(s.judgment_reason, 600) : null,
          }
        : undefined,
  }));

  const userPayload = JSON.stringify(
    {
      run: {
        prompt: run.prompt,
        status: run.status,
        ...(run.error ? { error: truncate(run.error as string, 300) } : {}),
      },
      steps: stepsCompact,
    },
    null,
    2,
  );

  const req: ChatCompletionRequest = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 4000,
  };

  let raw: string;
  try {
    const resp = await llm.chat(req);
    raw = resp.choices[0]?.message.content?.trim() ?? "{}";
  } catch (err) {
    logger.warn({ err, runId }, "narrator LLM call failed");
    return { summary: "Narration unavailable.", stepNarrations: {} };
  }

  let parsed: { summary?: string; stepNarrations?: Record<string, string> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn({ runId, rawSnippet: raw.slice(0, 300) }, "narrator returned non-JSON");
    return { summary: "Narration unavailable (model returned malformed output).", stepNarrations: {} };
  }

  // Coerce to expected shape and only keep narrations for known step ids.
  const validIds = new Set(steps.map((s) => s.id));
  const narrations: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.stepNarrations ?? {})) {
    if (validIds.has(k) && typeof v === "string") narrations[k] = v;
  }
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    stepNarrations: narrations,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function truncateArgs(args: Record<string, unknown> | null): unknown {
  if (!args) return undefined;
  try {
    const json = JSON.stringify(args);
    if (json.length <= 300) return args;
    return JSON.parse(json.slice(0, 300) + '"…[truncated]"');
  } catch {
    return undefined;
  }
}
