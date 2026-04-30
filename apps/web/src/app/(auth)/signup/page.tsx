import { SignUpForm } from "./SignUpForm";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
          AI Testing Platform
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Create your account
        </h1>
      </header>
      <SignUpForm />
    </main>
  );
}
