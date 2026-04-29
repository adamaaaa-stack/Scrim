import Link from "next/link";
import type { SimilarFailure } from "@/lib/clustering";

export function SimilarFailures({
  failures,
}: {
  failures: SimilarFailure[];
}) {
  if (failures.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/30 p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-rust-600)]">
        Similar past failures ({failures.length})
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-500)]">
        Other failed runs in this project that look like this one. Likely the same root cause.
      </p>
      <ul className="mt-4 space-y-2">
        {failures.map((f) => (
          <li key={f.id}>
            <Link
              href={`/runs/${f.id}`}
              className="block rounded-xl border border-[var(--color-cream-200)] bg-white p-4 transition hover:border-[var(--color-rust-500)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="line-clamp-2 flex-1 text-sm text-[var(--color-ink-900)]">
                  {f.prompt}
                </p>
                <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px] uppercase">
                  {Math.round(f.similarity * 100)}% match
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-ink-500)]">
                <span>{new Date(f.started_at).toLocaleString()}</span>
                {f.github_issue_url && (
                  <>
                    <span>·</span>
                    <a
                      href={f.github_issue_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--color-coral-500)] hover:underline"
                    >
                      Issue #{f.github_issue_number} ↗
                    </a>
                  </>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
