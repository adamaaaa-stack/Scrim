import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/Button";

export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  name: string;
  target_url: string;
  description: string | null;
  device_preset: string | null;
  created_at: string;
}

export default async function ProjectsPage() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();

  const sb = supabaseAdmin();
  let query = sb
    .from("projects")
    .select("id, name, target_url, description, device_preset, created_at")
    .order("created_at", { ascending: false });
  // Filter to current user's projects (admin client bypasses RLS, so we
  // filter explicitly here).
  if (user) query = query.eq("owner_id", user.id);

  const { data } = await query;
  const projects = (data ?? []) as ProjectRow[];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
            Projects
          </p>
          <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
            Apps Scrim is testing for you
          </h1>
          <p className="mt-2 text-[15px] text-[var(--color-ink-500)]">
            One project per app. Holds its URL, context, credentials, and the integrations Scrim talks to.
          </p>
        </div>
        <ButtonLink href="/projects/new">+ New project</ButtonLink>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-cream-300)] bg-white p-12 text-center">
          <p className="font-serif text-xl text-[var(--color-ink-700)]">
            No projects yet
          </p>
          <p className="mt-2 max-w-md mx-auto text-sm text-[var(--color-ink-500)]">
            Add your app's URL, optionally drop in a credential set or PRD, and Scrim will start running real-user-grade tests against it.
          </p>
          <div className="mt-6">
            <ButtonLink href="/projects/new">+ Create your first project</ButtonLink>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="block rounded-2xl border border-[var(--color-cream-200)] bg-white p-6 transition hover:border-[var(--color-coral-400)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-xl text-[var(--color-ink-900)]">
                  {p.name}
                </h2>
                <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px] uppercase">
                  {p.device_preset ?? "desktop"}
                </span>
              </div>
              <p className="mt-2 truncate font-mono text-xs text-[var(--color-ink-500)]">
                {p.target_url}
              </p>
              {p.description && (
                <p className="mt-3 line-clamp-2 text-sm text-[var(--color-ink-700)]">
                  {p.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
