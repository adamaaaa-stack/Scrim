"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button } from "@/components/Button";
import { createContext, type CreateContextFormState } from "./contexts/actions";

const initial: CreateContextFormState = { ok: true };

export function ContextForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createContext, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !state.error && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex gap-3">
        <select
          name="kind"
          defaultValue="note"
          className="rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 font-mono text-xs focus:border-[var(--color-coral-500)] focus:outline-none"
        >
          <option value="prd">PRD</option>
          <option value="spec">Spec</option>
          <option value="curriculum">Curriculum</option>
          <option value="design">Design</option>
          <option value="note">Note</option>
          <option value="other">Other</option>
        </select>
        <input
          type="text"
          name="title"
          required
          placeholder="Title (e.g. Checkout flow PRD)"
          className="flex-1 rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
        />
      </div>
      <textarea
        name="body"
        required
        rows={8}
        placeholder="Paste your spec, PRD, learning objectives, or any context the agent should know about this project. Markdown OK."
        className="w-full resize-y rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 font-mono text-xs focus:border-[var(--color-coral-500)] focus:outline-none"
      />
      {state.error && (
        <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-xs text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add context"}
      </Button>
    </form>
  );
}
