import Link from "next/link";
import { notFound } from "next/navigation";
import {
  signedScreenshotUrl,
  signedTraceUrl,
  supabaseAdmin,
} from "@/lib/supabase/admin";
import { StatusBadge } from "@/components/StatusBadge";
import { StepCard } from "@/components/StepCard";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface StepRow {
  id: string;
  index: number;
  kind: string;
  intent: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  screenshot_path: string | null;
  dom_snapshot: string | null;
  console_log: string[] | null;
  network_log: unknown[] | null;
  judgment_pass: boolean | null;
  judgment_reason: string | null;
}

interface RunRow {
  id: string;
  status: string;
  prompt: string;
  model: string;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  project_id: string;
  trace_path: string | null;
  device_preset: string | null;
  projects: { name: string; target_url: string; device_preset: string | null } | null;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "still running";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const [{ data: runData }, { data: stepsData }] = await Promise.all([
    sb
      .from("runs")
      .select(
        "id, status, prompt, model, error, started_at, completed_at, project_id, trace_path, device_preset, projects(name, target_url, device_preset)",
      )
      .eq("id", id)
      .single(),
    sb
      .from("steps")
      .select(
        "id, index, kind, intent, tool_name, tool_args, screenshot_path, dom_snapshot, console_log, network_log, judgment_pass, judgment_reason",
      )
      .eq("run_id", id)
      .order("index", { ascending: true }),
  ]);

  if (!runData) notFound();
  const run = runData as unknown as RunRow;
  const stepRows = (stepsData ?? []) as StepRow[];

  // Pre-sign all screenshot URLs server-side so the client never sees the bucket directly.
  const steps = await Promise.all(
    stepRows.map(async (s) => ({
      ...s,
      network_log: (s.network_log ?? null) as Array<{
        ts: number;
        method?: string;
        status?: number;
        url: string;
        resourceType?: string;
        failed?: boolean;
      }> | null,
      screenshot_url: s.screenshot_path
        ? await signedScreenshotUrl(s.screenshot_path, 3600)
        : null,
    })),
  );

  const finalAssertion = steps.find((s) => s.tool_name === "assertPass" || s.tool_name === "assertFail");
  const traceSignedUrl = run.trace_path ? await signedTraceUrl(run.trace_path, 3600) : null;
  const traceViewerUrl = traceSignedUrl
    ? `https://trace.playwright.dev/?trace=${encodeURIComponent(traceSignedUrl)}`
    : null;
  const devicePreset = run.device_preset ?? run.projects?.device_preset ?? "desktop";

  const isLive = run.status === "queued" || run.status === "running";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <AutoRefresh enabled={isLive} />
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
      >
        ← All runs
      </Link>

      <header className="mt-6 mb-10">
        <div className="flex items-center justify-between gap-4">
          {run.projects && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-500)]">
              <span className="font-medium text-[var(--color-ink-700)]">
                {run.projects.name}
              </span>
              <span>·</span>
              <a
                href={run.projects.target_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-[var(--color-coral-500)]"
              >
                {new URL(run.projects.target_url).host}
              </a>
            </div>
          )}
          <StatusBadge status={run.status} />
        </div>

        <h1 className="mt-4 font-serif text-3xl leading-tight tracking-tight text-[var(--color-ink-900)]">
          {run.prompt}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-ink-500)]">
          <span>Started {new Date(run.started_at).toLocaleString()}</span>
          <span>·</span>
          <span>{formatDuration(run.started_at, run.completed_at)}</span>
          <span>·</span>
          <span>{steps.length} steps</span>
          <span>·</span>
          <span className="font-mono">{run.model}</span>
          <span>·</span>
          <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono">
            {devicePreset}
          </span>
          {traceViewerUrl && (
            <>
              <span>·</span>
              <a
                href={traceViewerUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--color-coral-500)] hover:underline"
              >
                Open trace ↗
              </a>
            </>
          )}
        </div>

        {run.error && (
          <div className="mt-4 rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-rust-600)]">
              Error
            </p>
            <p className="mt-1 font-mono text-sm text-[var(--color-ink-900)] break-words">
              {run.error}
            </p>
          </div>
        )}
      </header>

      <section>
        <h2 className="mb-6 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
          Timeline
        </h2>
        {steps.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--color-cream-300)] bg-white p-8 text-center text-sm text-[var(--color-ink-500)]">
            Agent hasn&apos;t produced any steps yet.
          </p>
        ) : (
          <div>
            {steps.map((s) => (
              <StepCard key={s.id} step={s} />
            ))}
          </div>
        )}
      </section>

      {finalAssertion && (
        <footer className="mt-4 rounded-2xl border border-[var(--color-cream-200)] bg-white p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
            Verdict
          </p>
          <p className="mt-2 font-serif text-xl leading-snug text-[var(--color-ink-900)]">
            {finalAssertion.judgment_reason ?? finalAssertion.intent}
          </p>
        </footer>
      )}
    </main>
  );
}
