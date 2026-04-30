import Link from "next/link";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";

const links = [
  { href: "/projects", label: "Projects" },
  { href: "/runs", label: "Runs" },
];

export function Nav() {
  return (
    <nav className="border-b border-[var(--color-cream-200)] bg-[var(--color-cream-50)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Logo />
        <div className="flex items-center gap-6 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
            >
              {l.label}
            </Link>
          ))}
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}
