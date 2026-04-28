"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { createCredential, type CreateCredentialFormState } from "./credentials/actions";

interface Credential {
  id: string;
  name: string;
  description: string | null;
  fields: Record<string, string>; // values not actually rendered to the user
  created_at: string;
}

interface FieldRow {
  id: number;
  name: string;
  value: string;
}

const initial: CreateCredentialFormState = { ok: true };

export function CredentialsSection({
  projectId,
  credentials,
}: {
  projectId: string;
  credentials: Credential[];
}) {
  const [state, formAction, pending] = useActionState(createCredential, initial);
  const [fields, setFields] = useState<FieldRow[]>([
    { id: 0, name: "username", value: "" },
    { id: 1, name: "password", value: "" },
  ]);
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !state.error && formRef.current) {
      formRef.current.reset();
      setFields([
        { id: 0, name: "username", value: "" },
        { id: 1, name: "password", value: "" },
      ]);
      setShowForm(false);
    }
  }, [state]);

  function addField() {
    setFields((f) => [...f, { id: Date.now(), name: "", value: "" }]);
  }
  function removeField(id: number) {
    setFields((f) => f.filter((row) => row.id !== id));
  }
  function updateField(id: number, key: "name" | "value", v: string) {
    setFields((f) => f.map((row) => (row.id === id ? { ...row, [key]: v } : row)));
  }

  return (
    <div>
      <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-500)]">
        Credentials ({credentials.length})
      </h2>

      {credentials.length > 0 && (
        <ul className="mb-3 space-y-2">
          {credentials.map((c) => (
            <li
              key={c.id}
              className="flex items-baseline justify-between gap-3 rounded-xl border border-[var(--color-cream-200)] bg-white p-4"
            >
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="rounded-full bg-[var(--color-cream-200)] px-2 py-0.5 font-mono text-[10px] uppercase">
                    {c.name}
                  </span>
                  <span className="text-xs text-[var(--color-ink-500)]">
                    fields: {Object.keys(c.fields).join(", ")}
                  </span>
                </div>
                {c.description && (
                  <p className="mt-1 text-sm text-[var(--color-ink-700)]">
                    {c.description}
                  </p>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-400)]">
                stored
              </span>
            </li>
          ))}
        </ul>
      )}

      {!showForm ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + Add credential
        </Button>
      ) : (
        <form ref={formRef} action={formAction} className="space-y-4 rounded-2xl border border-[var(--color-cream-200)] bg-white p-5">
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
                Name
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="admin_user"
                className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
                Description (optional)
              </label>
              <input
                type="text"
                name="description"
                placeholder="Admin login for prod testing"
                className="mt-2 w-full rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-500)]">
              Fields
            </label>
            <p className="mt-1 text-xs text-[var(--color-ink-500)]">
              Each row is a key (like <code className="font-mono">password</code>) and its value. The agent looks them up by key when filling forms.
            </p>
            <div className="mt-3 space-y-2">
              {fields.map((row, idx) => (
                <div key={row.id} className="flex gap-2">
                  <input
                    type="text"
                    name={`field_name_${idx}`}
                    value={row.name}
                    onChange={(e) => updateField(row.id, "name", e.target.value)}
                    placeholder="key (e.g. username)"
                    className="w-1/3 rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
                  />
                  <input
                    type={row.name.toLowerCase().includes("pass") ? "password" : "text"}
                    name={`field_value_${idx}`}
                    value={row.value}
                    onChange={(e) => updateField(row.id, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 rounded-xl border border-[var(--color-cream-300)] bg-white px-3 py-2 text-sm focus:border-[var(--color-coral-500)] focus:outline-none"
                  />
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeField(row.id)}
                      className="px-2 text-xs text-[var(--color-ink-400)] hover:text-[var(--color-rust-500)]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addField}
              className="mt-2 text-xs text-[var(--color-coral-500)] hover:underline"
            >
              + Add field
            </button>
          </div>

          {state.error && (
            <div className="rounded-xl border border-[var(--color-rust-500)] bg-[var(--color-rust-100)]/40 p-3 text-xs text-[var(--color-rust-600)]">
              {state.error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save credential"}
            </Button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-coral-500)]"
            >
              Cancel
            </button>
            <span className="text-xs text-[var(--color-ink-400)]">
              Stored in your Supabase DB. Values never appear in run timelines.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
