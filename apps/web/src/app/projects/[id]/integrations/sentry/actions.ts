"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  deleteSentryIntegration,
  saveSentryIntegration,
} from "@/lib/sentry";

const Input = z.object({
  projectId: z.string().uuid(),
  token: z.string().min(20, "Token looks too short"),
  org: z.string().min(1).regex(/^[a-z0-9_-]+$/i, "Org slug uses letters/digits/_/-"),
  project: z.string().min(1).regex(/^[a-z0-9_-]+$/i, "Project slug uses letters/digits/_/-"),
});

export type ConnectFormState = { ok: boolean; error?: string };

export async function connectSentry(
  _prev: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const raw = {
    projectId: String(formData.get("projectId") ?? ""),
    token: String(formData.get("token") ?? "").trim(),
    org: String(formData.get("org") ?? "").trim(),
    project: String(formData.get("project") ?? "").trim(),
  };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  // Smoke test — call Sentry's project endpoint to confirm credentials work.
  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${parsed.data.org}/${parsed.data.project}/`,
      { headers: { Authorization: `Bearer ${parsed.data.token}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `Sentry rejected the credentials (${res.status}): ${text.slice(0, 200)}`,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach sentry.io: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  await saveSentryIntegration(parsed.data.projectId, {
    token: parsed.data.token,
    org: parsed.data.org,
    project: parsed.data.project,
    installed_at: new Date().toISOString(),
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(`/projects/${parsed.data.projectId}`);
}

export async function disconnectSentry(projectId: string): Promise<void> {
  await deleteSentryIntegration(projectId);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
