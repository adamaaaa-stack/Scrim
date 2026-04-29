"use client";

import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Button } from "@/components/Button";
import { narrateRunAction } from "@/lib/narrate";

interface NarratorState {
  summary: string;
  stepNarrations: Record<string, string>;
}

const NarratorContext = createContext<NarratorState | null>(null);

export function useStepNarration(stepId: string): string | null {
  const ctx = useContext(NarratorContext);
  return ctx?.stepNarrations[stepId] ?? null;
}

export function NarratorProvider({
  runId,
  children,
}: {
  runId: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<NarratorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await narrateRunAction(runId);
      if (!res.ok) {
        setError(res.error ?? "Failed");
        return;
      }
      setState({
        summary: res.summary ?? "",
        stepNarrations: res.stepNarrations ?? {},
      });
    });
  }

  return (
    <NarratorContext.Provider value={state}>
      <div className="mb-6 rounded-2xl border border-[var(--color-cream-200)] bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
              🎙️ Time-travel narrator
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-500)]">
              Plain-language walkthrough of every step the agent took.
            </p>
          </div>
          {!state ? (
            <Button type="button" size="sm" disabled={pending} onClick={generate}>
              {pending ? "Generating…" : "Narrate"}
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => setState(null)}
              className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
            >
              Hide narration
            </button>
          )}
        </div>

        {state?.summary && (
          <p className="mt-4 font-serif text-base leading-relaxed text-[var(--color-ink-900)]">
            {state.summary}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-xs text-[var(--color-rust-600)]">
            {error}
          </p>
        )}
      </div>

      {children}
    </NarratorContext.Provider>
  );
}

/**
 * Inline narration block for a single step. Reads from NarratorContext.
 * Renders nothing if narration isn't generated for this step.
 */
export function StepNarration({ stepId }: { stepId: string }) {
  const text = useStepNarration(stepId);
  if (!text) return null;
  return (
    <div className="mt-3 flex gap-2 rounded-lg border-l-2 border-[var(--color-coral-400)] bg-[var(--color-coral-100)]/30 p-3">
      <span className="font-mono text-xs text-[var(--color-coral-500)]">🎙️</span>
      <p className="flex-1 text-sm leading-relaxed text-[var(--color-ink-700)]">
        {text}
      </p>
    </div>
  );
}
