import { Logo } from "@/components/Logo";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <Logo href="" />
        <h1 className="mt-6 font-serif text-4xl tracking-tight text-[var(--color-ink-900)]">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-500)]">
          Sign in to keep testing your app like real users would.
        </p>
      </header>
      <SignInForm />
    </main>
  );
}
