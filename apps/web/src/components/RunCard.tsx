import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

interface Run {
  id: string;
  status: string;
  prompt: string;
  model: string;
  started_at: string;
  completed_at: string | null;
  project?: { name: string; target_url: string } | null;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "–";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RunCard({ run }: { run: Run }) {
  return (
    <Link
      href={`/runs/${run.id}`}
      className="block rounded-2xl border border-[var(--color-cream-200)] bg-white p-6 transition hover:border-[var(--color-coral-400)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {run.project && (
            <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-ink-500)]">
              <span className="font-medium text-[var(--color-ink-700)]">
                {run.project.name}
              </span>
              <span>·</span>
              <span className="font-mono">{new URL(run.project.target_url).host}</span>
            </div>
          )}
          <p className="line-clamp-2 text-[15px] leading-snug text-[var(--color-ink-900)]">
            {run.prompt}
          </p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-[var(--color-ink-500)]">
        <span>{timeAgo(run.started_at)}</span>
        <span>·</span>
        <span>{formatDuration(run.started_at, run.completed_at)}</span>
        <span>·</span>
        <span className="font-mono">{run.model}</span>
      </div>
    </Link>
  );
}
