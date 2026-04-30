"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { ok: true };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoFocus
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
          autoComplete="current-password"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
      </div>
      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-sm text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <Link
          href="/signup"
          className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
        >
          Need an account? Sign up
        </Link>
      </div>
    </form>
  );
}
