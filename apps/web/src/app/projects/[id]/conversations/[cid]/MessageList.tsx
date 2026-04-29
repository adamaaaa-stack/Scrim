import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> | null;
  run_id: string | null;
  created_at: string;
  // Joined data
  run?: {
    id: string;
    status: string;
    prompt: string;
    completed_at: string | null;
  } | null;
}

export function MessageList({
  projectId,
  messages,
}: {
  projectId: string;
  messages: Message[];
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="font-serif text-xl text-[var(--color-ink-700)]">
            Start the conversation
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-500)]">
            Describe what you want tested. The agent will plan, run real browser tests, and report back. You can chain multiple tests in this thread.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      {messages.map((m) => {
        if (m.role === "user") return <UserMessage key={m.id} content={m.content} />;
        if (m.role === "assistant")
          return (
            <AssistantMessage
              key={m.id}
              content={m.content}
              toolCalls={m.tool_calls}
            />
          );
        if (m.role === "tool" && m.run) {
          return (
            <ToolRunCard
              key={m.id}
              projectId={projectId}
              run={m.run}
            />
          );
        }
        // skip empty tool messages without run linkage
        return null;
      })}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--color-coral-500)] px-4 py-2.5 text-[15px] leading-relaxed text-white">
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({
  content,
  toolCalls,
}: {
  content: string;
  toolCalls: Message["tool_calls"];
}) {
  // Show text content if any. Pure tool-call messages without text get a
  // small marker.
  if (!content && toolCalls && toolCalls.length > 0) {
    const tcNames = toolCalls.map((tc) => tc.function.name).join(", ");
    return (
      <div className="flex">
        <div className="rounded-2xl border border-dashed border-[var(--color-cream-300)] bg-white px-4 py-2 text-xs text-[var(--color-ink-500)]">
          calling {tcNames}…
        </div>
      </div>
    );
  }
  if (!content) return null;
  return (
    <div className="flex">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-[var(--color-cream-200)] bg-white px-4 py-2.5 text-[15px] leading-relaxed text-[var(--color-ink-900)] whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

function ToolRunCard({
  projectId: _projectId,
  run,
}: {
  projectId: string;
  run: NonNullable<Message["run"]>;
}) {
  return (
    <div className="flex">
      <Link
        href={`/runs/${run.id}`}
        className="block max-w-[80%] rounded-2xl border border-[var(--color-coral-400)] bg-[var(--color-coral-100)]/30 px-4 py-3 transition hover:bg-[var(--color-coral-100)]/60"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-600)]">
            Test run
          </span>
          <StatusBadge status={run.status} />
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-[var(--color-ink-900)]">
          {run.prompt}
        </p>
        <p className="mt-2 text-xs text-[var(--color-coral-500)]">
          Open run timeline →
        </p>
      </Link>
    </div>
  );
}
