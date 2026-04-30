"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Input = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).optional(),
});

export type SignUpState = { ok: boolean; error?: string };

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = Input.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  // Auto-confirmed via admin API so we don't need email delivery configured.
  // For prod you'd remove email_confirm:true and require email verification.
  const admin = supabaseAdmin();
  const { error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    ...(parsed.data.displayName ? { user_metadata: { name: parsed.data.displayName } } : {}),
  });
  if (createErr) {
    return { ok: false, error: createErr.message };
  }

  // Sign them in immediately via SSR client so cookies are set.
  const sb = await createClient();
  const { error: signInErr } = await sb.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signInErr) return { ok: false, error: signInErr.message };

  redirect("/projects");
}
