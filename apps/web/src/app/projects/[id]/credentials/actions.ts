"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const FieldsSchema = z.record(z.string(), z.string());

const Input = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).regex(/^[a-z0-9_-]+$/i, "Name: letters, digits, _, - only"),
  description: z.string().optional(),
  fields: FieldsSchema,
});

export type CreateCredentialFormState = { ok: boolean; error?: string };

/**
 * Parse FormData into a credential. Field inputs are paired:
 *   field_name_0, field_value_0, field_name_1, field_value_1, ...
 */
function extractFields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (formData.has(`field_name_${i}`)) {
    const name = String(formData.get(`field_name_${i}`) ?? "").trim();
    const value = String(formData.get(`field_value_${i}`) ?? "");
    if (name) out[name] = value;
    i += 1;
  }
  return out;
}

export async function createCredential(
  _prev: CreateCredentialFormState,
  formData: FormData,
): Promise<CreateCredentialFormState> {
  const raw = {
    projectId: String(formData.get("projectId") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    fields: extractFields(formData),
  };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  if (Object.keys(parsed.data.fields).length === 0) {
    return { ok: false, error: "At least one field required" };
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("credentials").upsert(
    {
      project_id: parsed.data.projectId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      fields: parsed.data.fields,
    },
    { onConflict: "project_id,name" },
  );
  if (error) return { ok: false, error: `Save failed: ${error.message}` };

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function deleteCredential(
  credentialId: string,
  projectId: string,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("credentials").delete().eq("id", credentialId);
  revalidatePath(`/projects/${projectId}`);
}
