import type {
  ChatCompletionRequest,
  OpenRouterClient,
} from "@ai-testing/shared/openrouter";
import { supabaseAdmin } from "../db/supabase.js";
import { listCredentialSummaries } from "./credentials.js";

export interface RewritePromptInput {
  projectId: string;
  prompt: string;
}

export interface RewritePromptResult {
  original: string;
  rewrite: string;
  reasoning: string;
  suggestedDevice?: "desktop" | "iphone" | "ipad" | "android";
}

/**
 * Take a loose / vague test prompt and rewrite it into something specific,
 * testable, and complete — pulling in project context (target URL, available
 * credentials, uploaded contexts).
 *
 * Returns the rewrite + a short reasoning so the user can decide whether
 * to accept it.
 */
export async function rewritePrompt(
  llm: OpenRouterClient,
  input: RewritePromptInput,
): Promise<RewritePromptResult> {
  const sb = supabaseAdmin();

  // Pull project + context bodies + credential names for the rewrite prompt
  const [{ data: project }, { data: contexts }, creds] = await Promise.all([
    sb
      .from("projects")
      .select("name, target_url, description")
      .eq("id", input.projectId)
      .single(),
    sb
      .from("contexts")
      .select("title, kind, body")
      .eq("project_id", input.projectId)
      .order("created_at", { ascending: false })
      .limit(5),
    listCredentialSummaries(input.projectId),
  ]);

  if (!project) throw new Error("Project not found");

  const contextLines =
    (contexts ?? []).length === 0
      ? "(no uploaded context for this project)"
      : (contexts ?? [])
          .map(
            (c) =>
              `### ${c.kind}: ${c.title}\n${(c.body as string).slice(0, 1500)}`,
          )
          .join("\n\n");

  const credLines =
    creds.length === 0
      ? "(no credentials configured)"
      : creds.map((c) => `- "${c.name}" (fields: ${c.fields.join(", ")})`).join("\n");

  const system = `You rewrite vague test prompts into specific, testable ones for an autonomous QA agent that drives a real browser.

# Project
Name: ${project.name}
Target URL: ${project.target_url}
${project.description ? `Description: ${project.description}` : ""}

# Available credentials
${credLines}

# Uploaded context
${contextLines}

# How to rewrite
- Make the prompt CONCRETE: name specific elements, expected text, expected behaviors. Replace "verify it works" with "verify <X> happens after <Y>".
- Add success criteria the agent can verify: text content, URL changes, no console errors, image-load checks.
- If auth is needed and credentials exist, reference them by name: "Sign in using credential 'admin_user'".
- If a device preset would clarify the intent (mobile-only test, etc.), suggest it.
- Don't invent requirements that aren't in the original — clarify, don't expand scope.
- Keep it under ~120 words.

# Output format
Respond with ONLY a JSON object, no markdown, no commentary:
{
  "rewrite": "<the improved prompt>",
  "reasoning": "<one sentence on what you changed and why>",
  "suggestedDevice": "<desktop|iphone|ipad|android>" // optional, omit if not relevant
}`;

  const req: ChatCompletionRequest = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Original prompt:\n${input.prompt}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  };
  const resp = await llm.chat(req);
  const raw = resp.choices[0]?.message.content?.trim() ?? "";

  let parsed: { rewrite?: string; reasoning?: string; suggestedDevice?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fall back: return original with a note
    return {
      original: input.prompt,
      rewrite: input.prompt,
      reasoning: "Rewrite model returned non-JSON; keeping original.",
    };
  }

  const rewrite = (parsed.rewrite ?? input.prompt).trim();
  const reasoning = (parsed.reasoning ?? "").trim();
  const suggestedDevice = ["desktop", "iphone", "ipad", "android"].includes(
    String(parsed.suggestedDevice),
  )
    ? (parsed.suggestedDevice as RewritePromptResult["suggestedDevice"])
    : undefined;

  return {
    original: input.prompt,
    rewrite,
    reasoning,
    ...(suggestedDevice ? { suggestedDevice } : {}),
  };
}
