"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { createRun, type CreateRunFormState } from "./actions";

interface Project {
  id: string;
  name: string;
  target_url: string;
  device_preset?: string | null;
}

const initial: CreateRunFormState = { ok: true };

export function RunForm({ projects }: { projects: Project[] }) {
  const [state, formAction, pending] = useActionState(createRun, initial);

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="projectId"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
        >
          Project
        </label>
        <select
          id="projectId"
          name="projectId"
          required
          defaultValue={projects[0]?.id ?? ""}
          className="mt-2 w-full appearance-none rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm text-[var(--color-ink-900)] focus:border-[var(--color-coral-500)] focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {new URL(p.target_url).host}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="prompt"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
        >
          Test prompt
        </label>
        <textarea
          id="prompt"
          name="prompt"
          required
          rows={6}
          placeholder="Verify the homepage loads, displays its main hero text, and has no JavaScript errors in the console."
          className="mt-2 w-full resize-y rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-[15px] leading-relaxed text-[var(--color-ink-900)] placeholder:text-[var(--color-ink-300)] focus:border-[var(--color-coral-500)] focus:outline-none"
        />
        <p className="mt-2 text-xs text-[var(--color-ink-500)]">
          Be specific about what should be true. The agent will plan steps from this.
        </p>
      </div>

      <details className="text-sm text-[var(--color-ink-500)]">
        <summary className="cursor-pointer">Advanced</summary>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="devicePreset"
              className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
            >
              Device preset (overrides project default)
            </label>
            <select
              id="devicePreset"
              name="devicePreset"
              defaultValue=""
              className="mt-2 w-full appearance-none rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
            >
              <option value="">— use project default —</option>
              <option value="desktop">desktop (1280×800)</option>
              <option value="iphone">iphone (iPhone 14 Pro)</option>
              <option value="ipad">ipad (iPad Pro 11)</option>
              <option value="android">android (Pixel 7)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="model"
              className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
            >
              Model override (OpenRouter id)
            </label>
            <input
              id="model"
              name="model"
              type="text"
              placeholder="x-ai/grok-4.1-fast (default)"
              className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
            />
          </div>
        </div>
      </details>

      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-4 text-sm text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Run test"}
        </Button>
        <span className="text-xs text-[var(--color-ink-500)]">
          A real Grok call + browser session. Costs ≈ $0.01–0.05 per run.
        </span>
      </div>
    </form>
  );
}
