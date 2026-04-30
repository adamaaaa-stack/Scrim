"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Input = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type SignInState = { ok: boolean; error?: string };

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = Input.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message };

  redirect("/projects");
}
