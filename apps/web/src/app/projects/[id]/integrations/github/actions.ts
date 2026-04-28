"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteGithubIntegration, loadGithubIntegration, saveGithubIntegration } from "@/lib/github";

const SelectRepoInput = z.object({
  projectId: z.string().uuid(),
  fullName: z.string().regex(/^[^/]+\/[^/]+$/, "Expected 'owner/name' format"),
});

export type SelectRepoFormState = { ok: boolean; error?: string };

export async function selectRepo(
  _prev: SelectRepoFormState,
  formData: FormData,
): Promise<SelectRepoFormState> {
  const parsed = SelectRepoInput.safeParse({
    projectId: String(formData.get("projectId") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const cfg = await loadGithubIntegration(parsed.data.projectId);
  if (!cfg) return { ok: false, error: "GitHub not connected for this project" };

  const [owner, name] = parsed.data.fullName.split("/");
  if (!owner || !name) return { ok: false, error: "Invalid repo name" };

  await saveGithubIntegration(parsed.data.projectId, {
    ...cfg,
    repo: { owner, name, full_name: parsed.data.fullName, private: false },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(`/projects/${parsed.data.projectId}`);
}

export async function disconnectGithub(projectId: string): Promise<void> {
  await deleteGithubIntegration(projectId);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
