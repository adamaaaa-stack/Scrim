"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { sendMessage, type SendMessageState } from "./actions";

const initial: SendMessageState = { ok: true };

export function MessageInput({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId: string;
}) {
  const [state, formAction, pending] = useActionState(sendMessage, initial);
  const ref = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok && !state.error && ref.current) {
      ref.current.reset();
      taRef.current?.focus();
    }
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="border-t border-[var(--color-cream-200)] bg-[var(--color-cream-50)] p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="projectId" value={projectId} />

      <div className="rounded-2xl border border-[var(--color-cream-300)] bg-white">
        <textarea
          ref={taRef}
          name="message"
          required
          rows={3}
          placeholder="Ask the agent to test something — e.g. 'verify the homepage loads on mobile' or 'sign in as test_user and check the dashboard'…"
          autoFocus
          onKeyDown={(e) => {
            // Cmd/Ctrl + Enter submits
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              ref.current?.requestSubmit();
            }
          }}
          className="w-full resize-y rounded-2xl border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed placeholder:text-[var(--color-ink-300)] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-cream-200)] px-4 py-2">
          <span className="text-xs text-[var(--color-ink-400)]">
            ⌘ ↵ to send
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Thinking…" : "Send"}
          </Button>
        </div>
      </div>

      {state.error && (
        <div className="mt-2 rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-xs text-[var(--color-rust-600)]">
          {state.error}
        </div>
      )}
    </form>
  );
}
