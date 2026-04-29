import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> | null;
  run_id: string | null;
  created_at: string;
}

interface RunRow {
  id: string;
  status: string;
  prompt: string;
  completed_at: string | null;
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;
  const sb = supabaseAdmin();

  const [{ data: conv }, { data: project }, { data: msgsData }] = await Promise.all([
    sb.from("conversations").select("id, title, created_at").eq("id", cid).single(),
    sb.from("projects").select("id, name, target_url").eq("id", id).single(),
    sb
      .from("conversation_messages")
      .select("id, role, content, tool_calls, run_id, created_at")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true }),
  ]);

  if (!conv || !project) notFound();
  const msgs = (msgsData ?? []) as MessageRow[];

  // Bulk-fetch run summaries for any tool messages that reference runs
  const runIds = Array.from(new Set(msgs.map((m) => m.run_id).filter(Boolean) as string[]));
  let runMap = new Map<string, RunRow>();
  if (runIds.length > 0) {
    const { data: runs } = await sb
      .from("runs")
      .select("id, status, prompt, completed_at")
      .in("id", runIds);
    runMap = new Map(((runs ?? []) as RunRow[]).map((r) => [r.id, r]));
  }

  const enriched = msgs.map((m) => ({
    ...m,
    run: m.run_id ? runMap.get(m.run_id) ?? null : null,
  }));

  // Auto-refresh while any linked run is still in progress
  const hasLiveRun = Array.from(runMap.values()).some(
    (r) => r.status === "queued" || r.status === "running",
  );

  return (
    <main className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col">
      <AutoRefresh enabled={hasLiveRun} intervalMs={3500} />

      <header className="border-b border-[var(--color-cream-200)] px-6 py-4">
        <Link
          href={`/projects/${id}`}
          className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-serif text-2xl tracking-tight text-[var(--color-ink-900)]">
          {conv.title}
        </h1>
      </header>

      <MessageList projectId={id} messages={enriched} />

      <MessageInput projectId={id} conversationId={cid} />
    </main>
  );
}
