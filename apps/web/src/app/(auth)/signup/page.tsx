import { Logo } from "@/components/Logo";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <Logo href="" />
        <h1 className="mt-6 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Practice your app on AI users.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-500)]">
          Before real ones break it. Set up takes 30 seconds.
        </p>
      </header>
      <SignUpForm />
    </main>
  );
}
