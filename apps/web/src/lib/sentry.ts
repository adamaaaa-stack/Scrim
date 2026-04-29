import { supabaseAdmin } from "./supabase/admin";

export interface SentryConfig {
  token: string;        // Sentry auth token (org-level, with project:read)
  org: string;          // Sentry org slug, e.g. "acme"
  project: string;      // Sentry project slug, e.g. "frontend"
  installed_at: string;
}

/** Load this project's Sentry integration config, if any. */
export async function loadSentryIntegration(
  projectId: string,
): Promise<SentryConfig | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("integrations")
    .select("config, enabled")
    .eq("project_id", projectId)
    .eq("kind", "sentry")
    .maybeSingle();
  if (!data?.enabled || !data.config) return null;
  const cfg = data.config as SentryConfig;
  if (!cfg.token || !cfg.org || !cfg.project) return null;
  return cfg;
}

export async function saveSentryIntegration(
  projectId: string,
  config: SentryConfig,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("integrations").upsert(
    {
      project_id: projectId,
      kind: "sentry",
      config: config as unknown as Record<string, unknown>,
      enabled: true,
    },
    { onConflict: "project_id,kind" },
  );
  if (error) throw new Error(`saveSentryIntegration failed: ${error.message}`);
}

export async function deleteSentryIntegration(projectId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from("integrations")
    .delete()
    .eq("project_id", projectId)
    .eq("kind", "sentry");
}
