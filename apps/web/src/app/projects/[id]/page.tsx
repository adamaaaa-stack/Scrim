import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ButtonLink } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { loadGithubIntegration } from "@/lib/github";
import { loadSentryIntegration } from "@/lib/sentry";
import { ContextForm } from "./ContextForm";
import { CredentialsSection } from "./CredentialsSection";
import { createConversation } from "./conversations/actions";

export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  name: string;
  target_url: string;
  description: string | null;
  device_preset: string | null;
  created_at: string;
}

interface ContextRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
}

interface CredentialRow {
  id: string;
  name: string;
  description: string | null;
  fields: Record<string, string>;
  created_at: string;
}

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  status: string;
  prompt: string;
  started_at: string;
  completed_at: string | null;
  device_preset: string | null;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const [
    { data: project },
    { data: contexts },
    { data: runs },
    github,
    sentry,
    { data: creds },
    { data: convs },
  ] = await Promise.all([
    sb
      .from("projects")
      .select("id, name, target_url, description, device_preset, created_at")
      .eq("id", id)
      .single(),
    sb
      .from("contexts")
      .select("id, kind, title, body, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("runs")
      .select("id, status, prompt, started_at, completed_at, device_preset")
      .eq("project_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
    loadGithubIntegration(id),
    loadSentryIntegration(id),
    sb
      .from("credentials")
      .select("id, name, description, fields, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("conversations")
      .select("id, title, updated_at")
      .eq("project_id", id)
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  if (!project) notFound();
  const p = project as ProjectRow;
  const ctxs = (contexts ?? []) as ContextRow[];
  const rs = (runs ?? []) as RunRow[];
  const credentialsList = (creds ?? []) as CredentialRow[];
  const conversations = (convs ?? []) as ConversationRow[];

  const startChat = createConversation.bind(null, p.id);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
      >
        ← All projects
      </Link>

      <header className="mt-6 mb-10 flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
            Project
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
            {p.name}
          </h1>
          <a
            href={p.target_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-mono text-sm text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
          >
            {p.target_url} ↗
          </a>
          {p.description && (
            <p className="mt-3 max-w-xl text-[15px] leading-snug text-[var(--color-ink-700)]">
              {p.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <form action={startChat}>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-cream-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink-700)] transition hover:border-[var(--color-coral-400)] hover:text-[var(--color-coral-500)]"
            >
              💬 New chat
            </button>
          </form>
          <ButtonLink href={`/runs/new?projectId=${p.id}`}>+ New run</ButtonLink>
        </div>
      </header>

      <div className="grid gap-10 md:grid-cols-3">
        {/* Settings */}
        <section className="md:col-span-1">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
            Settings
          </h2>
          <div className="space-y-3 rounded-2xl border border-[var(--color-cream-200)] bg-white p-5 text-sm">
            <Row label="Device" value={p.device_preset ?? "desktop"} mono />
            <Row label="Created" value={new Date(p.created_at).toLocaleDateString()} />
            <Row label="ID" value={p.id} mono small />
          </div>

          <h2 className="mb-4 mt-10 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
            Integrations
          </h2>
          <div className="space-y-3 rounded-2xl border border-[var(--color-cream-200)] bg-white p-5 text-sm">
            {github ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--color-ink-700)]">GitHub</p>
                    <p className="text-xs text-[var(--color-ink-500)]">
                      Connected as <span className="font-mono">@{github.user.login}</span>
                    </p>
                    {github.repo ? (
                      <p className="mt-1 font-mono text-xs text-[var(--color-ink-900)]">
                        ↳ {github.repo.full_name}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--color-amber-500)]">
                        ⚠ No repo selected yet
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/projects/${p.id}/integrations/github`}
                    className="rounded-full bg-[var(--color-cream-200)] px-3 py-1 font-mono text-[10px] uppercase text-[var(--color-ink-700)] hover:bg-[var(--color-coral-100)]"
                  >
                    {github.repo ? "Change" : "Pick repo"}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--color-ink-700)]">GitHub</p>
                  <p className="text-xs text-[var(--color-ink-500)]">
                    File issues + open PRs on failure
                  </p>
                </div>
                <a
                  href={`/api/auth/github/start?projectId=${p.id}`}
                  className="rounded-full bg-[var(--color-coral-500)] px-3 py-1 font-mono text-[10px] uppercase text-white hover:bg-[var(--color-coral-600)]"
                >
                  Connect
                </a>
              </div>
            )}
            <hr className="border-[var(--color-cream-200)]" />
            {sentry ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--color-ink-700)]">Sentry</p>
                  <p className="text-xs text-[var(--color-ink-500)]">
                    <span className="font-mono">{sentry.org}/{sentry.project}</span>
                  </p>
                </div>
                <Link
                  href={`/projects/${p.id}/integrations/sentry`}
                  className="rounded-full bg-[var(--color-cream-200)] px-3 py-1 font-mono text-[10px] uppercase text-[var(--color-ink-700)] hover:bg-[var(--color-coral-100)]"
                >
                  Edit
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--color-ink-700)]">Sentry</p>
                  <p className="text-xs text-[var(--color-ink-500)]">
                    Correlate failures with production errors
                  </p>
                </div>
                <Link
                  href={`/projects/${p.id}/integrations/sentry`}
                  className="rounded-full bg-[var(--color-coral-500)] px-3 py-1 font-mono text-[10px] uppercase text-white hover:bg-[var(--color-coral-600)]"
                >
                  Connect
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Context + Runs */}
        <section className="md:col-span-2 space-y-10">
          <div>
            <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
              Context library ({ctxs.length})
            </h2>
            <div className="rounded-2xl border border-[var(--color-cream-200)] bg-white p-5">
              <ContextForm projectId={p.id} />
            </div>
            {ctxs.length > 0 && (
              <ul className="mt-4 space-y-2">
                {ctxs.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-[var(--color-cream-200)] bg-white p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px] uppercase">
                          {c.kind}
                        </span>
                        <span className="font-medium text-[var(--color-ink-900)]">
                          {c.title}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--color-ink-400)]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-[var(--color-ink-500)]">
                        Show body ({c.body.length} chars)
                      </summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-[var(--color-cream-100)] p-3 font-mono text-xs whitespace-pre-wrap">
                        {c.body}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {conversations.length > 0 && (
            <div>
              <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
                Conversations ({conversations.length})
              </h2>
              <ul className="space-y-2">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/projects/${p.id}/conversations/${c.id}`}
                      className="block rounded-xl border border-[var(--color-cream-200)] bg-white p-4 transition hover:border-[var(--color-coral-400)]"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-[var(--color-ink-900)]">
                          {c.title}
                        </span>
                        <span className="text-xs text-[var(--color-ink-400)]">
                          {new Date(c.updated_at).toLocaleString()}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CredentialsSection projectId={p.id} credentials={credentialsList} />

          <div>
            <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
              Recent runs ({rs.length})
            </h2>
            {rs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--color-cream-300)] bg-white p-8 text-center text-sm text-[var(--color-ink-500)]">
                No runs yet for this project.
              </p>
            ) : (
              <ul className="space-y-2">
                {rs.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/runs/${r.id}`}
                      className="block rounded-xl border border-[var(--color-cream-200)] bg-white p-4 transition hover:border-[var(--color-coral-400)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 flex-1 text-sm text-[var(--color-ink-900)]">
                          {r.prompt}
                        </p>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-ink-500)]">
                        <span>{new Date(r.started_at).toLocaleString()}</span>
                        {r.device_preset && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{r.device_preset}</span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
        {label}
      </span>
      <span
        className={`${mono ? "font-mono" : ""} ${small ? "text-[10px]" : "text-sm"} text-[var(--color-ink-900)]`}
      >
        {value}
      </span>
    </div>
  );
}

function IntegrationStub({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="font-medium text-[var(--color-ink-700)]">{name}</p>
        <p className="text-xs text-[var(--color-ink-500)]">{detail}</p>
      </div>
      <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-ink-500)]">
        Not connected
      </span>
    </div>
  );
}
