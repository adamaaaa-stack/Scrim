"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { signUp, type SignUpState } from "./actions";

const initial: SignUpState = { ok: true };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initial);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
          Display name (optional)
        </label>
        <input
          type="text"
          name="displayName"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
          Password
        </label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
        <p className="mt-2 text-xs text-[var(--color-ink-500)]">At least 8 characters.</p>
      </div>
      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-sm text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
        <Link
          href="/signin"
          className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
        >
          Have an account? Sign in
        </Link>
      </div>
    </form>
  );
}
