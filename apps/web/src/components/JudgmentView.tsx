import type { ReactNode } from "react";

interface Section {
  title: string;
  body: string;
}

interface Parsed {
  intro: string;
  checks: string[];
  sections: Section[];
}

const SECTION_HEADINGS =
  /(Overall(?:\s+review)?|Strengths?|Weaknesses?|Suggestions?|Recommendations?|Issues?|Notes?|Caveats?|Summary|Conclusion|Next\s+steps?|Limitations?):\s+/gi;

/**
 * Parse a judgment_reason string into intro, numbered checks, and named
 * sections. Tolerant: if no numbered items, returns the whole text as intro.
 */
function parseJudgment(text: string): Parsed {
  const trimmed = text.trim();

  // Find first numbered marker like "1. " (must follow whitespace or start)
  const firstNum = trimmed.match(/(?:^|\s)(\d+)\.\s+/);
  if (!firstNum || firstNum.index === undefined) {
    return { intro: trimmed, checks: [], sections: [] };
  }

  const introEnd = firstNum.index;
  const intro = trimmed.slice(0, introEnd).trim().replace(/[:\-—]\s*$/, "").trim();
  let rest = trimmed.slice(introEnd).trim();

  // Where do trailing sections begin? First match of SECTION_HEADINGS.
  SECTION_HEADINGS.lastIndex = 0;
  const sectionStartMatch = SECTION_HEADINGS.exec(rest);
  let checksText = rest;
  let sectionsText = "";
  if (sectionStartMatch) {
    checksText = rest.slice(0, sectionStartMatch.index).trim();
    sectionsText = rest.slice(sectionStartMatch.index).trim();
  }

  // Split checks on numbered markers (preserving boundary)
  const checks = checksText
    .split(/(?:^|\s)(?=\d+\.\s+)/)
    .map((s) => s.replace(/^\s*\d+\.\s+/, "").trim())
    .filter(Boolean);

  // Split sections on heading markers
  const sections: Section[] = [];
  if (sectionsText) {
    SECTION_HEADINGS.lastIndex = 0;
    const matches: Array<{ idx: number; title: string; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = SECTION_HEADINGS.exec(sectionsText)) !== null) {
      matches.push({
        idx: m.index,
        title: m[1] ?? "Section",
        end: m.index + m[0].length,
      });
    }
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i]!;
      const next = matches[i + 1];
      const body = sectionsText.slice(cur.end, next?.idx ?? sectionsText.length).trim();
      sections.push({ title: cur.title.trim(), body });
    }
  }

  return { intro, checks, sections };
}

/**
 * Lightly format inline references: 'single-quoted' phrases become code chips.
 */
function formatInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /'([^'\n]+?)'/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <code
        key={`c${key++}`}
        className="rounded bg-[var(--color-cream-200)] px-1 py-0.5 font-mono text-[12px] text-[var(--color-ink-900)]"
      >
        {m[1]}
      </code>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface ToneClasses {
  badge: string;
  ring: string;
}

const TONES: Record<"pass" | "fail", ToneClasses> = {
  pass: {
    badge: "text-[var(--color-sage-700)]",
    ring: "border-[var(--color-sage-500)]",
  },
  fail: {
    badge: "text-[var(--color-rust-600)]",
    ring: "border-[var(--color-rust-500)]",
  },
};

export function JudgmentView({
  text,
  tone = "pass",
}: {
  text: string;
  tone?: "pass" | "fail";
}) {
  const { intro, checks, sections } = parseJudgment(text);
  const t = TONES[tone];

  return (
    <div className="space-y-5">
      {intro && (
        <p className="font-serif text-lg leading-snug text-[var(--color-ink-900)]">
          {formatInline(intro)}
        </p>
      )}

      {checks.length > 0 && (
        <ol className="space-y-2">
          {checks.map((c, i) => (
            <li
              key={i}
              className={`flex gap-3 rounded-xl border ${t.ring} bg-white p-3`}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-cream-100)] font-mono text-[11px] ${t.badge}`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-sm leading-relaxed text-[var(--color-ink-900)]">
                {formatInline(c)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i}>
              <h4 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
                {s.title}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-700)]">
                {formatInline(s.body)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
