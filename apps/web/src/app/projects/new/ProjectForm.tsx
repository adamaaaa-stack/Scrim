"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { createProject, type CreateProjectFormState } from "./actions";

const initial: CreateProjectFormState = { ok: true };

export function ProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, initial);

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="name"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
        >
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="My App"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-[15px] focus:border-[var(--color-coral-500)] focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="targetUrl"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
        >
          Target URL
        </label>
        <input
          id="targetUrl"
          name="targetUrl"
          type="url"
          required
          placeholder="https://your-app.com"
          className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
        <p className="mt-2 text-xs text-[var(--color-ink-500)]">
          The base URL the agent navigates to. Tests can navigate further from here.
        </p>
      </div>

      <div>
        <label
          htmlFor="devicePreset"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
        >
          Default device
        </label>
        <select
          id="devicePreset"
          name="devicePreset"
          defaultValue="desktop"
          className="mt-2 w-full appearance-none rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        >
          <option value="desktop">desktop (1280×800)</option>
          <option value="iphone">iphone (iPhone 14 Pro)</option>
          <option value="ipad">ipad (iPad Pro 11)</option>
          <option value="android">android (Pixel 7)</option>
        </select>
        <p className="mt-2 text-xs text-[var(--color-ink-500)]">
          Default for runs against this project. Can be overridden per-run.
        </p>
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
        >
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="What does this app do? Anything the agent should know about it before running tests."
          className="mt-2 w-full resize-y rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-[15px] leading-relaxed placeholder:text-[var(--color-ink-300)] focus:border-[var(--color-coral-500)] focus:outline-none"
        />
      </div>

      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-4 text-sm text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
        <span className="text-xs text-[var(--color-ink-500)]">
          You can add context, integrations, and run tests after creation.
        </span>
      </div>
    </form>
  );
}
