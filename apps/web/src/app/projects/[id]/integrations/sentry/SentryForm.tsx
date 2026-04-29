"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { connectSentry, type ConnectFormState } from "./actions";

const initial: ConnectFormState = { ok: true };

export function SentryForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(connectSentry, initial);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />

      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
          Auth token
        </label>
        <input
          name="token"
          type="password"
          required
          autoComplete="off"
          placeholder="sntrys_… or sntryu_…"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
        <p className="mt-2 text-xs text-[var(--color-ink-500)]">
          Generate at{" "}
          <a
            href="https://sentry.io/settings/account/api/auth-tokens/"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-coral-500)] hover:underline"
          >
            sentry.io/settings/account/api/auth-tokens
          </a>{" "}
          with the <code className="font-mono">project:read</code> + <code className="font-mono">event:read</code> scopes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
            Org slug
          </label>
          <input
            name="org"
            type="text"
            required
            placeholder="my-org"
            className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
            Project slug
          </label>
          <input
            name="project"
            type="text"
            required
            placeholder="frontend"
            className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
          />
        </div>
      </div>

      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-sm text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Connect Sentry"}
      </Button>
    </form>
  );
}
