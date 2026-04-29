import Link from "next/link";
import { SentryForm } from "./SentryForm";

export default async function SentryConnectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
          Sentry
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Connect production error monitoring
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-500)]">
          On every test run, we'll fetch any Sentry errors that fired during the run window and link them to the failing steps. Helps the agent (and you) tell "test logic broke" from "the app actually crashed".
        </p>
      </header>

      <SentryForm projectId={id} />
    </main>
  );
}
