"use server";

const ORCH_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:4000";

export interface RewriteResponse {
  ok: boolean;
  rewrite?: string;
  reasoning?: string;
  suggestedDevice?: "desktop" | "iphone" | "ipad" | "android";
  error?: string;
}

export async function rewritePromptAction(
  projectId: string,
  prompt: string,
): Promise<RewriteResponse> {
  if (!projectId) return { ok: false, error: "Pick a project first" };
  if (!prompt || prompt.trim().length < 3)
    return { ok: false, error: "Write at least a few words to rewrite" };

  let res: Response;
  try {
    res = await fetch(`${ORCH_URL}/rewrite-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, prompt }),
    });
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach orchestrator at ${ORCH_URL}. Is it running?`,
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Orchestrator ${res.status}: ${text.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    rewrite: string;
    reasoning: string;
    suggestedDevice?: "desktop" | "iphone" | "ipad" | "android";
  };
  return {
    ok: true,
    rewrite: json.rewrite,
    reasoning: json.reasoning,
    ...(json.suggestedDevice ? { suggestedDevice: json.suggestedDevice } : {}),
  };
}
