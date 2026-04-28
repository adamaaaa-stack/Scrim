"use client";

import { useState } from "react";
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  type PromptTemplate,
} from "@/lib/templates";

interface Props {
  onApply: (template: PromptTemplate) => void;
}

export function TemplatePicker({ onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(TEMPLATE_CATEGORIES[0]);

  const filtered = TEMPLATES.filter((t) => t.category === activeCategory);

  return (
    <div className="rounded-2xl border border-[var(--color-cream-200)] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-coral-500)]">
            Templates
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-700)]">
            Pick a starting point — {TEMPLATES.length} canned prompts across {TEMPLATE_CATEGORIES.length} categories
          </p>
        </div>
        <span className="font-mono text-sm text-[var(--color-ink-500)]">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-cream-200)] p-5">
          {/* Category tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeCategory === cat
                    ? "bg-[var(--color-coral-500)] text-white"
                    : "bg-[var(--color-cream-200)] text-[var(--color-ink-700)] hover:bg-[var(--color-cream-300)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Template list */}
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onApply(t);
                  setOpen(false);
                }}
                className="block rounded-xl border border-[var(--color-cream-200)] p-4 text-left transition hover:border-[var(--color-coral-400)] hover:bg-[var(--color-cream-50)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-[var(--color-ink-900)]">{t.name}</p>
                  {t.device && (
                    <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px] uppercase">
                      {t.device}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-snug text-[var(--color-ink-500)]">
                  {t.description}
                </p>
                {t.needsCredentials && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-amber-500)]">
                    needs credential
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
