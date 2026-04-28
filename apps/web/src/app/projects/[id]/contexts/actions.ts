"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Input = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["prd", "spec", "curriculum", "design", "note", "other"]),
  title: z.string().min(1),
  body: z.string().min(1),
});

export type CreateContextFormState = { ok: boolean; error?: string };

export async function createContext(
  _prev: CreateContextFormState,
  formData: FormData,
): Promise<CreateContextFormState> {
  const raw = {
    projectId: String(formData.get("projectId") ?? ""),
    kind: String(formData.get("kind") ?? "note"),
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
  };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("contexts").insert({
    project_id: parsed.data.projectId,
    kind: parsed.data.kind,
    title: parsed.data.title,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: `Insert failed: ${error.message}` };

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function deleteContext(
  contextId: string,
  projectId: string,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("contexts").delete().eq("id", contextId);
  revalidatePath(`/projects/${projectId}`);
}
