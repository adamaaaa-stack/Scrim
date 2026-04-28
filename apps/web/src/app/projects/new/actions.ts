"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Input = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  targetUrl: z.string().url("Target URL must be a valid http(s) URL"),
  description: z.string().optional(),
  devicePreset: z.enum(["desktop", "iphone", "ipad", "android"]),
});

export type CreateProjectFormState = {
  ok: boolean;
  error?: string;
};

// MVP: every project owned by the dev test user. When auth is wired,
// switch to the logged-in user's id from the user-scoped server client.
const DEV_OWNER_ID = "b70e0e9b-754f-4f37-a076-951b4ac7ff76";

export async function createProject(
  _prev: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    targetUrl: String(formData.get("targetUrl") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    devicePreset: String(formData.get("devicePreset") ?? "desktop"),
  };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("projects")
    .insert({
      owner_id: DEV_OWNER_ID,
      name: parsed.data.name,
      target_url: parsed.data.targetUrl,
      description: parsed.data.description ?? null,
      device_preset: parsed.data.devicePreset,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: `Insert failed: ${error?.message ?? "unknown"}` };
  }

  redirect(`/projects/${data.id}`);
}
