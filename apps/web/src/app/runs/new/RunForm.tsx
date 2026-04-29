"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { createRun, type CreateRunFormState } from "./actions";
import { TemplatePicker } from "./TemplatePicker";
import type { PromptTemplate } from "@/lib/templates";
import { rewritePromptAction, type RewriteResponse } from "./rewrite-action";

interface Project {
  id: string;
  name: string;
  target_url: string;
  device_preset?: string | null;
}

const initial: CreateRunFormState = { ok: true };

export function RunForm({
  projects,
  defaultProjectId,
}: {
  projects: Project[];
  defaultProjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(createRun, initial);
  const initialProject = defaultProjectId && projects.some((p) => p.id === defaultProjectId)
    ? defaultProjectId
    : projects[0]?.id ?? "";

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const deviceRef = useRef<HTMLSelectElement>(null);
  const projectRef = useRef<HTMLSelectElement>(null);
  const [templateBadge, setTemplateBadge] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResponse | null>(null);
  const [isRewriting, startRewrite] = useTransition();

  function applyTemplate(t: PromptTemplate) {
    if (promptRef.current) promptRef.current.value = t.prompt;
    if (deviceRef.current && t.device) deviceRef.current.value = t.device;
    setTemplateBadge(t.name);
    setRewrite(null);
    promptRef.current?.focus();
  }

  function requestRewrite() {
    const projectId = projectRef.current?.value ?? "";
    const prompt = promptRef.current?.value ?? "";
    setRewrite(null);
    startRewrite(async () => {
      const res = await rewritePromptAction(projectId, prompt);
      setRewrite(res);
    });
  }

  function acceptRewrite() {
    if (!rewrite?.rewrite) return;
    if (promptRef.current) promptRef.current.value = rewrite.rewrite;
    if (rewrite.suggestedDevice && deviceRef.current) {
      deviceRef.current.value = rewrite.suggestedDevice;
    }
    setTemplateBadge(null);
    setRewrite(null);
    promptRef.current?.focus();
  }

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
          ref={projectRef}
          required
          defaultValue={initialProject}
          className="mt-2 w-full appearance-none rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-sm text-[var(--color-ink-900)] focus:border-[var(--color-coral-500)] focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {new URL(p.target_url).host}
            </option>
          ))}
        </select>
      </div>

      <TemplatePicker onApply={applyTemplate} />

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="prompt"
            className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]"
          >
            Test prompt
          </label>
          {templateBadge && (
            <span className="rounded-full bg-[var(--color-coral-100)] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-coral-600)]">
              from: {templateBadge}
            </span>
          )}
        </div>
        <textarea
          id="prompt"
          name="prompt"
          ref={promptRef}
          required
          rows={6}
          placeholder="Verify the homepage loads, displays its main hero text, and has no JavaScript errors in the console."
          className="mt-2 w-full resize-y rounded-xl border border-[var(--color-cream-300)] bg-white px-4 py-3 text-[15px] leading-relaxed text-[var(--color-ink-900)] placeholder:text-[var(--color-ink-300)] focus:border-[var(--color-coral-500)] focus:outline-none"
          onChange={() => templateBadge && setTemplateBadge(null)}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-ink-500)]">
            Be specific about what should be true. Replace any{" "}
            <code className="font-mono text-[var(--color-coral-500)]">REPLACE_ME</code> placeholders.
          </p>
          <button
            type="button"
            onClick={requestRewrite}
            disabled={isRewriting}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-cream-300)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-ink-700)] transition hover:border-[var(--color-coral-400)] hover:text-[var(--color-coral-500)] disabled:opacity-50"
          >
            ✨ {isRewriting ? "Improving…" : "Improve prompt"}
          </button>
        </div>

        {rewrite && (
          <div className="mt-4 rounded-2xl border border-[var(--color-coral-400)] bg-[var(--color-coral-100)]/30 p-5">
            {rewrite.error ? (
              <p className="text-sm text-[var(--color-rust-600)]">{rewrite.error}</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-600)]">
                    ✨ Suggested rewrite
                  </p>
                  {rewrite.suggestedDevice && (
                    <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] uppercase">
                      device → {rewrite.suggestedDevice}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-ink-900)]">
                  {rewrite.rewrite}
                </p>
                {rewrite.reasoning && (
                  <p className="mt-3 text-xs italic text-[var(--color-ink-500)]">
                    Why: {rewrite.reasoning}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <Button type="button" size="sm" onClick={acceptRewrite}>
                    Accept rewrite
                  </Button>
                  <button
                    type="button"
                    onClick={() => setRewrite(null)}
                    className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
                  >
                    Discard
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
              ref={deviceRef}
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
