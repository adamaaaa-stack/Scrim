import Image from "next/image";

interface Step {
  id: string;
  index: number;
  kind: string;
  intent: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  screenshot_url?: string | null;
  dom_snapshot: string | null;
  console_log: string[] | null;
  judgment_pass: boolean | null;
  judgment_reason: string | null;
}

const TOOL_ICON: Record<string, string> = {
  navigate: "→",
  click: "⊙",
  type: "⌨",
  wait: "◷",
  screenshot: "▣",
  getDom: "{ }",
  assertPass: "✓",
  assertFail: "✕",
};

function ToolGlyph({ name }: { name: string }) {
  const isAssert = name === "assertPass" || name === "assertFail";
  const isPass = name === "assertPass";
  const bg = isAssert
    ? isPass
      ? "bg-[var(--color-sage-500)] text-white"
      : "bg-[var(--color-rust-500)] text-white"
    : "bg-[var(--color-cream-200)] text-[var(--color-ink-700)]";
  return (
    <span
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-mono ${bg}`}
    >
      {TOOL_ICON[name] ?? "·"}
    </span>
  );
}

export function StepCard({ step }: { step: Step }) {
  const isAssert = step.tool_name === "assertPass" || step.tool_name === "assertFail";
  const isPass = step.tool_name === "assertPass";

  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <ToolGlyph name={step.tool_name ?? step.kind} />
        <div className="timeline-line w-px flex-1" aria-hidden />
      </div>

      <div className="flex-1 pb-8">
        <div
          className={`rounded-2xl border bg-white p-5 ${
            isAssert
              ? isPass
                ? "border-[var(--color-sage-500)] bg-[var(--color-sage-100)]/40"
                : "border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40"
              : "border-[var(--color-cream-200)]"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-[var(--color-ink-400)]">
                #{step.index}
              </span>
              <span className="font-mono text-sm font-medium text-[var(--color-ink-700)]">
                {step.tool_name ?? step.kind}
              </span>
            </div>
          </div>

          <p
            className={`mt-2 text-[15px] leading-snug ${
              isAssert ? "font-serif text-lg text-[var(--color-ink-900)]" : "text-[var(--color-ink-700)]"
            }`}
          >
            {isAssert && step.judgment_reason
              ? step.judgment_reason
              : step.intent}
          </p>

          {step.tool_args && !isAssert && Object.keys(step.tool_args).length > 0 && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--color-cream-100)] p-3 font-mono text-xs text-[var(--color-ink-700)]">
              {JSON.stringify(step.tool_args, null, 2)}
            </pre>
          )}

          {step.screenshot_url && (
            <a
              href={step.screenshot_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block overflow-hidden rounded-lg border border-[var(--color-cream-200)]"
            >
              <Image
                src={step.screenshot_url}
                alt={`Step ${step.index} screenshot`}
                width={1280}
                height={800}
                className="h-auto w-full"
                unoptimized
              />
            </a>
          )}

          {step.console_log && step.console_log.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-[var(--color-ink-500)]">
                Console ({step.console_log.length})
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-[var(--color-ink-900)] p-3 font-mono text-xs text-[var(--color-cream-100)]">
                {step.console_log.join("\n")}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
