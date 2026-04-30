import Link from "next/link";

interface LogoProps {
  /** "small" = mark only; "default" = mark + wordmark; "wordmark" = text only */
  variant?: "small" | "default" | "wordmark";
  href?: string;
  className?: string;
}

/**
 * Scrim wordmark. The mark is two offset rounded panels (cream + ink) on a
 * coral chip — a scrim is a translucent screen layered over reality, and
 * that's the metaphor: an AI test layer between your app and your users.
 */
export function Logo({ variant = "default", href = "/projects", className = "" }: LogoProps) {
  const content = (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      {variant !== "wordmark" && (
        <svg
          viewBox="0 0 32 32"
          width="22"
          height="22"
          aria-hidden
          className="self-center"
        >
          <rect width="32" height="32" rx="7" fill="var(--color-coral-500)" />
          <rect x="6" y="6" width="14" height="20" rx="2" fill="var(--color-cream-50)" fillOpacity="0.95" />
          <rect x="12" y="9" width="14" height="20" rx="2" fill="var(--color-ink-900)" fillOpacity="0.85" />
        </svg>
      )}
      {variant !== "small" && (
        <span
          className="font-serif text-[20px] font-medium italic tracking-tight text-[var(--color-ink-900)]"
          style={{ letterSpacing: "-0.01em" }}
        >
          Scrim
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-flex items-baseline">
      {content}
    </Link>
  );
}
