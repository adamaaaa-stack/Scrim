import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

interface SentryConfig {
  token: string;
  org: string;
  project: string;
}

export interface SentryErrorSnapshot {
  id: string;
  title: string;
  level: string;
  timestamp: string;
  url?: string;
  permalink?: string;
}

async function loadSentryConfig(projectId: string): Promise<SentryConfig | null> {
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

/**
 * Fetch events from a Sentry project that fired during the run window.
 * Bounded by Sentry's events endpoint (last 90 days max).
 */
export async function fetchErrorsForRun(args: {
  projectId: string;
  startedAt: Date;
  completedAt: Date;
}): Promise<SentryErrorSnapshot[] | null> {
  const cfg = await loadSentryConfig(args.projectId);
  if (!cfg) return null;

  const url = new URL(
    `https://sentry.io/api/0/projects/${cfg.org}/${cfg.project}/events/`,
  );
  // Sentry's events endpoint supports `start` and `end` for absolute window.
  url.searchParams.set("start", args.startedAt.toISOString());
  url.searchParams.set("end", args.completedAt.toISOString());
  url.searchParams.set("full", "true");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
  } catch (e) {
    logger.warn({ err: e, projectId: args.projectId }, "sentry fetch failed");
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    logger.warn(
      { status: res.status, body: text.slice(0, 200), projectId: args.projectId },
      "sentry returned non-2xx",
    );
    return null;
  }
  const events = (await res.json()) as Array<Record<string, unknown>>;

  return events.slice(0, 25).map((e) => ({
    id: String(e.id ?? e.eventID ?? ""),
    title: String((e.title as string) ?? (e.message as string) ?? "(no title)"),
    level: String((e.level as string) ?? "error"),
    timestamp: String(e.dateCreated ?? e.timestamp ?? ""),
    url: typeof e.location === "string" ? e.location : undefined,
    permalink:
      typeof e.permalink === "string"
        ? e.permalink
        : `https://sentry.io/organizations/${cfg.org}/issues/?project=&query=${encodeURIComponent(String(e.id ?? ""))}`,
  }));
}
