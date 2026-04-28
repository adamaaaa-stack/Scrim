import Link from "next/link";
import { notFound } from "next/navigation";
import { ghClient, loadGithubIntegration } from "@/lib/github";
import { RepoPicker } from "./RepoPicker";

export const dynamic = "force-dynamic";

export default async function GithubIntegrationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cfg = await loadGithubIntegration(id);
  if (!cfg) notFound();

  // Pull repos the user can write to (we need write to file issues / open PRs).
  const gh = ghClient(cfg.token);
  const { data: repos } = await gh.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
    affiliation: "owner,collaborator,organization_member",
  });
  const writable = repos
    .filter((r) => r.permissions?.push || r.permissions?.admin)
    .map((r) => ({
      full_name: r.full_name,
      private: r.private,
      description: r.description ?? null,
    }));

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link
        href={`/projects/${id}`}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
      >
        ← Back to project
      </Link>

      <header className="mt-6 mb-10">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
          GitHub
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Pick the repo for issues & PRs
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-500)]">
          Connected as{" "}
          <span className="font-mono text-[var(--color-ink-900)]">@{cfg.user.login}</span>.
          Test failures will be filed here. You can change this anytime.
        </p>
      </header>

      <RepoPicker projectId={id} repos={writable} />
    </main>
  );
}
