import Image from "next/image";
import { JudgmentView } from "./JudgmentView";

interface NetworkEntry {
  ts: number;
  method?: string;
  status?: number;
  url: string;
  resourceType?: string;
  failed?: boolean;
}

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
  network_log?: NetworkEntry[] | null;
  judgment_pass: boolean | null;
  judgment_reason: string | null;
}

const TOOL_ICON: Record<string, string> = {
  plan: "✦",
  navigate: "→",
  click: "⊙",
  type: "⌨",
  wait: "◷",
  screenshot: "▣",
  getDom: "{ }",
  evaluate: "ƒ",
  getAccessibility: "≡",
  setViewport: "⤢",
  assertPass: "✓",
  assertFail: "✕",
};

function ToolGlyph({ name }: { name: string }) {
  const isAssert = name === "assertPass" || name === "assertFail";
  const isPass = name === "assertPass";
  const isPlan = name === "plan";
  let bg = "bg-[var(--color-cream-200)] text-[var(--color-ink-700)]";
  if (isAssert) {
    bg = isPass
      ? "bg-[var(--color-sage-500)] text-white"
      : "bg-[var(--color-rust-500)] text-white";
  } else if (isPlan) {
    bg = "bg-[var(--color-coral-500)] text-white";
  }
  return (
    <span
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-mono ${bg}`}
    >
      {TOOL_ICON[name] ?? "·"}
    </span>
  );
}

function PlanChecklist({ checks }: { checks: string[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {checks.map((c, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-lg bg-white p-3 text-sm text-[var(--color-ink-900)]"
        >
          <span className="font-mono text-xs text-[var(--color-coral-500)]">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="flex-1 leading-snug">{c}</span>
        </li>
      ))}
    </ol>
  );
}

function NetworkSection({ entries }: { entries: NetworkEntry[] }) {
  const responses = entries.filter((e) => e.status !== undefined || e.failed);
  if (responses.length === 0) return null;
  const failed = responses.filter((e) => e.failed);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-[var(--color-ink-500)]">
        Network ({responses.length}){failed.length > 0 ? ` · ${failed.length} failed` : ""}
      </summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-[var(--color-cream-200)] bg-white">
        <table className="w-full font-mono text-xs">
          <tbody>
            {responses.slice(-20).map((e, i) => (
              <tr
                key={i}
                className={`border-b border-[var(--color-cream-100)] last:border-0 ${
                  e.failed ? "bg-[var(--color-rust-100)]/40" : ""
                }`}
              >
                <td className="px-2 py-1 text-[var(--color-ink-500)]">
                  {e.method ?? ""}
                </td>
                <td className={`px-2 py-1 ${e.failed ? "text-[var(--color-rust-600)]" : "text-[var(--color-ink-700)]"}`}>
                  {e.status ?? "FAIL"}
                </td>
                <td className="truncate px-2 py-1 text-[var(--color-ink-700)]" title={e.url}>
                  {new URL(e.url, "http://x").pathname}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function StepCard({ step }: { step: Step }) {
  const tool = step.tool_name ?? step.kind;
  const isAssert = tool === "assertPass" || tool === "assertFail";
  const isPass = tool === "assertPass";
  const isPlan = tool === "plan";

  let cardBorder = "border-[var(--color-cream-200)]";
  if (isAssert) {
    cardBorder = isPass
      ? "border-[var(--color-sage-500)] bg-[var(--color-sage-100)]/40"
      : "border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40";
  } else if (isPlan) {
    cardBorder = "border-[var(--color-coral-500)] bg-[var(--color-coral-100)]/30";
  }

  const args: Record<string, unknown> = step.tool_args ?? {};
  const rawChecks = args.checks;
  const planChecks: string[] = Array.isArray(rawChecks)
    ? rawChecks.map((c: unknown): string => String(c))
    : [];

  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <ToolGlyph name={tool} />
        <div className="timeline-line w-px flex-1" aria-hidden />
      </div>

      <div className="flex-1 pb-8">
        <div className={`rounded-2xl border bg-white p-5 ${cardBorder}`}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-[var(--color-ink-400)]">
                #{step.index}
              </span>
              <span className="font-mono text-sm font-medium text-[var(--color-ink-700)]">
                {tool}
              </span>
            </div>
          </div>

          {isAssert && step.judgment_reason ? (
            <div className="mt-3">
              <JudgmentView
                text={step.judgment_reason}
                tone={isPass ? "pass" : "fail"}
              />
            </div>
          ) : (
            <p className="mt-2 text-[15px] leading-snug text-[var(--color-ink-700)]">
              {isPlan
                ? `${planChecks.length} checks declared`
                : step.intent}
            </p>
          )}

          {/* Plan: render checklist */}
          {planChecks.length > 0 ? <PlanChecklist checks={planChecks} /> : null}

          {/* Evaluate: show expression + description */}
          {tool === "evaluate" && typeof args.expression === "string" ? (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--color-ink-900)] p-3 font-mono text-xs text-[var(--color-cream-100)]">
              {args.expression}
            </pre>
          ) : null}

          {/* setViewport: badge */}
          {tool === "setViewport" ? (
            <div className="mt-3 inline-flex gap-2 rounded-full bg-[var(--color-cream-200)] px-3 py-1 font-mono text-xs">
              {typeof args.preset === "string"
                ? args.preset
                : `${String(args.width ?? "?")}×${String(args.height ?? "?")}`}
            </div>
          ) : null}

          {/* Generic args for other tools (excluding the ones we handled above) */}
          {step.tool_args &&
            !isAssert &&
            !isPlan &&
            tool !== "evaluate" &&
            tool !== "setViewport" &&
            Object.keys(step.tool_args).length > 0 && (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--color-cream-100)] p-3 font-mono text-xs text-[var(--color-ink-700)]">
                {JSON.stringify(step.tool_args, null, 2)}
              </pre>
            )}

          {step.screenshot_url && !isPlan && (
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

          {step.network_log && step.network_log.length > 0 && (
            <NetworkSection entries={step.network_log} />
          )}
        </div>
      </div>
    </div>
  );
}
