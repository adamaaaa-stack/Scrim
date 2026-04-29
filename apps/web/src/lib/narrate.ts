"use server";

const ORCH_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:4000";

export interface NarrateResponse {
  ok: boolean;
  summary?: string;
  stepNarrations?: Record<string, string>;
  error?: string;
}

export async function narrateRunAction(runId: string): Promise<NarrateResponse> {
  if (!runId) return { ok: false, error: "Missing runId" };

  let res: Response;
  try {
    res = await fetch(`${ORCH_URL}/runs/${runId}/narrate`, { method: "POST" });
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
    summary: string;
    stepNarrations: Record<string, string>;
  };
  return { ok: true, summary: json.summary, stepNarrations: json.stepNarrations };
}
