type Status = "queued" | "running" | "passed" | "failed" | "errored";

const styles: Record<Status, { bg: string; fg: string; dot: string; label: string }> = {
  queued: {
    bg: "bg-[var(--color-cream-200)]",
    fg: "text-[var(--color-ink-700)]",
    dot: "bg-[var(--color-ink-400)]",
    label: "Queued",
  },
  running: {
    bg: "bg-[var(--color-amber-100)]",
    fg: "text-[var(--color-amber-500)]",
    dot: "bg-[var(--color-amber-500)] pulse-soft",
    label: "Running",
  },
  passed: {
    bg: "bg-[var(--color-sage-100)]",
    fg: "text-[var(--color-sage-700)]",
    dot: "bg-[var(--color-sage-500)]",
    label: "Passed",
  },
  failed: {
    bg: "bg-[var(--color-rust-100)]",
    fg: "text-[var(--color-rust-600)]",
    dot: "bg-[var(--color-rust-500)]",
    label: "Failed",
  },
  errored: {
    bg: "bg-[var(--color-cream-200)]",
    fg: "text-[var(--color-ink-500)]",
    dot: "bg-[var(--color-ink-500)]",
    label: "Errored",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = (styles as Record<string, typeof styles.queued>)[status] ?? styles.queued;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${s.bg} ${s.fg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
