"use server";

import { revalidatePath } from "next/cache";

export type SendMessageState = {
  ok: boolean;
  error?: string;
};

const ORCH_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:4000";

export async function sendMessage(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  if (!conversationId || !projectId || !message) {
    return { ok: false, error: "Missing conversationId, projectId, or message" };
  }

  let res: Response;
  try {
    res = await fetch(`${ORCH_URL}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, message }),
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

  revalidatePath(`/projects/${projectId}/conversations/${conversationId}`);
  return { ok: true };
}
