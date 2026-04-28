import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

const variants = {
  primary:
    "bg-[var(--color-coral-500)] text-white hover:bg-[var(--color-coral-600)] active:translate-y-px",
  secondary:
    "bg-white text-[var(--color-ink-700)] border border-[var(--color-cream-300)] hover:border-[var(--color-coral-400)] hover:text-[var(--color-coral-500)]",
  ghost:
    "text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
} as const;

interface BaseProps {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: BaseProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: BaseProps & { href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </Link>
  );
}
