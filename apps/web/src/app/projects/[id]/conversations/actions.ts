"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function createConversation(projectId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("conversations")
    .insert({ project_id: projectId, title: "New conversation" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Create conversation failed: ${error?.message}`);
  redirect(`/projects/${projectId}/conversations/${data.id}`);
}
