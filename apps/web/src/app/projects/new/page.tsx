import Link from "next/link";
import { ProjectForm } from "./ProjectForm";

export default function NewProjectPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
      >
        ← All projects
      </Link>

      <header className="mt-6 mb-10">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
          New project
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Set up an app to test
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-500)]">
          You'll be able to add context, connect integrations, and start running tests right after.
        </p>
      </header>

      <ProjectForm />
    </main>
  );
}
