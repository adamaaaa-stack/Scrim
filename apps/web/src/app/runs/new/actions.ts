"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

const Input = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(5, "Prompt must be at least 5 characters"),
  model: z.string().optional(),
});

export type CreateRunFormState = {
  ok: boolean;
  error?: string;
};

export async function createRun(
  _prev: CreateRunFormState,
  formData: FormData,
): Promise<CreateRunFormState> {
  const raw = {
    projectId: String(formData.get("projectId") ?? ""),
    prompt: String(formData.get("prompt") ?? "").trim(),
    model: String(formData.get("model") ?? "").trim() || undefined,
  };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const orchUrl = process.env.ORCHESTRATOR_URL ?? "http://localhost:4000";
  let res: Response;
  try {
    res = await fetch(`${orchUrl}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach orchestrator at ${orchUrl}. Is it running? (${
        err instanceof Error ? err.message : String(err)
      })`,
    };
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Orchestrator ${res.status}: ${text}` };
  }

  const { id } = (await res.json()) as { id: string };
  redirect(`/runs/${id}`);
}
