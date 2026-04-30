import { createClient } from "@/lib/supabase/server";

export async function UserMenu() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const display =
    (user.user_metadata?.name as string | undefined) ?? user.email ?? "Account";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-ink-500)]">{display}</span>
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full border border-[var(--color-cream-300)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-ink-700)] transition hover:border-[var(--color-coral-400)] hover:text-[var(--color-coral-500)]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
