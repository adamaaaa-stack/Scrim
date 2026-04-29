"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { sendMessage, type SendMessageState } from "./actions";
import {
  rewritePromptAction,
  type RewriteResponse,
} from "@/lib/rewrite-prompt";

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
  const [rewrite, setRewrite] = useState<RewriteResponse | null>(null);
  const [isRewriting, startRewrite] = useTransition();

  function requestRewrite() {
    const prompt = taRef.current?.value ?? "";
    setRewrite(null);
    startRewrite(async () => {
      const res = await rewritePromptAction(projectId, prompt);
      setRewrite(res);
    });
  }

  function acceptRewrite() {
    if (!rewrite?.rewrite || !taRef.current) return;
    taRef.current.value = rewrite.rewrite;
    setRewrite(null);
    taRef.current.focus();
  }

  useEffect(() => {
    if (state.ok && !state.error && ref.current) {
      ref.current.reset();
      setRewrite(null);
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

      {rewrite && (
        <div className="mb-3 rounded-2xl border border-[var(--color-coral-400)] bg-[var(--color-coral-100)]/40 p-4">
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
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-900)]">
                {rewrite.rewrite}
              </p>
              {rewrite.reasoning && (
                <p className="mt-2 text-xs italic text-[var(--color-ink-500)]">
                  Why: {rewrite.reasoning}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" size="sm" onClick={acceptRewrite}>
                  Accept
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-ink-400)]">
              ⌘ ↵ to send
            </span>
            <button
              type="button"
              onClick={requestRewrite}
              disabled={isRewriting}
              className="flex items-center gap-1 rounded-full border border-[var(--color-cream-300)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-500)] transition hover:border-[var(--color-coral-400)] hover:text-[var(--color-coral-500)] disabled:opacity-50"
            >
              ✨ {isRewriting ? "Improving…" : "Improve"}
            </button>
          </div>
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
