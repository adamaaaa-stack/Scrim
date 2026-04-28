import { supabaseAdmin } from "@/lib/supabase/admin";
import { RunCard } from "@/components/RunCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RunRow {
  id: string;
  status: string;
  prompt: string;
  model: string;
  started_at: string;
  completed_at: string | null;
  project_id: string;
  projects: { name: string; target_url: string } | null;
}

export default async function RunsPage() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("runs")
    .select(
      "id, status, prompt, model, started_at, completed_at, project_id, projects(name, target_url)",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  const runs = (data ?? []) as unknown as RunRow[];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
          AI Testing Platform
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Recent runs
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-500)]">
          Every test the agent has executed, newest first.
        </p>
      </header>

      {runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-cream-300)] bg-white p-12 text-center">
          <p className="font-serif text-xl text-[var(--color-ink-700)]">
            No runs yet
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-500)]">
            POST a run to <code className="font-mono">/runs</code> on the orchestrator to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <RunCard
              key={r.id}
              run={{
                id: r.id,
                status: r.status,
                prompt: r.prompt,
                model: r.model,
                started_at: r.started_at,
                completed_at: r.completed_at,
                project: r.projects,
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
