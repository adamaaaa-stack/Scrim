"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { selectRepo, type SelectRepoFormState } from "./actions";

interface Repo {
  full_name: string;
  private: boolean;
  description: string | null;
}

const initial: SelectRepoFormState = { ok: true };

export function RepoPicker({
  projectId,
  repos,
}: {
  projectId: string;
  repos: Repo[];
}) {
  const [state, formAction, pending] = useActionState(selectRepo, initial);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return repos.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [filter, repos]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter repos…"
        className="w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
      />

      <div className="max-h-96 overflow-y-auto rounded-xl border border-[var(--color-cream-200)] bg-white">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--color-ink-500)]">
            No repos match.
          </p>
        ) : (
          filtered.map((r) => (
            <label
              key={r.full_name}
              className="flex cursor-pointer items-start gap-3 border-b border-[var(--color-cream-100)] p-3 last:border-0 hover:bg-[var(--color-cream-50)]"
            >
              <input
                type="radio"
                name="fullName"
                value={r.full_name}
                required
                className="mt-1 accent-[var(--color-coral-500)]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-[var(--color-ink-900)]">
                    {r.full_name}
                  </span>
                  {r.private && (
                    <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px]">
                      private
                    </span>
                  )}
                </div>
                {r.description && (
                  <p className="mt-1 text-xs text-[var(--color-ink-500)]">
                    {r.description}
                  </p>
                )}
              </div>
            </label>
          ))
        )}
      </div>

      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-sm text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Use this repo"}
      </Button>
    </form>
  );
}
