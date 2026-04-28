import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RunForm } from "./RunForm";
import { ButtonLink } from "@/components/Button";

export const dynamic = "force-dynamic";

interface Project {
  id: string;
  name: string;
  target_url: string;
  device_preset: string | null;
}

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("projects")
    .select("id, name, target_url, device_preset")
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
      >
        ← All runs
      </Link>

      <header className="mt-6 mb-10">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
          New run
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Tell the agent what to verify
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-500)]">
          Pick a project, describe the behavior you want tested, and the agent will plan and execute the steps.
        </p>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-cream-300)] bg-white p-12 text-center">
          <p className="font-serif text-xl text-[var(--color-ink-700)]">
            No projects yet
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-500)]">
            Create a project first to test against.
          </p>
          <div className="mt-6">
            <ButtonLink href="/projects/new">+ New project</ButtonLink>
          </div>
        </div>
      ) : (
        <RunForm projects={projects} defaultProjectId={projectId} />
      )}
    </main>
  );
}
