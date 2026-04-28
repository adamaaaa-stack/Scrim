import { supabaseAdmin } from "../db/supabase.js";
import type { Observation, ToolName } from "../workers/browser.js";

export type DbRunStatus = "queued" | "running" | "passed" | "failed" | "errored";

export interface PersistStepInput {
  runId: string;
  index: number;
  kind: ToolName | "assertPass" | "assertFail" | "plan";
  intent: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  observation?: Observation;
  judgmentPass?: boolean;
  judgmentReason?: string;
}

export async function insertRun(args: {
  projectId: string;
  prompt: string;
  contextRefs: string[];
  model: string;
}): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("runs")
    .insert({
      project_id: args.projectId,
      status: "queued",
      prompt: args.prompt,
      context_refs: args.contextRefs,
      model: args.model,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insertRun failed: ${error?.message}`);
  return data.id as string;
}

export async function updateRun(
  runId: string,
  patch: {
    status?: DbRunStatus;
    error?: string | null;
    completedAt?: Date;
    tracePath?: string | null;
    devicePreset?: string | null;
    githubIssueUrl?: string | null;
    githubIssueNumber?: number | null;
  },
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("runs")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.completedAt ? { completed_at: patch.completedAt.toISOString() } : {}),
      ...(patch.tracePath !== undefined ? { trace_path: patch.tracePath } : {}),
      ...(patch.devicePreset !== undefined ? { device_preset: patch.devicePreset } : {}),
      ...(patch.githubIssueUrl !== undefined ? { github_issue_url: patch.githubIssueUrl } : {}),
      ...(patch.githubIssueNumber !== undefined ? { github_issue_number: patch.githubIssueNumber } : {}),
    })
    .eq("id", runId);
  if (error) throw new Error(`updateRun failed: ${error.message}`);
}

export async function persistStep(input: PersistStepInput): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("steps").insert({
    run_id: input.runId,
    index: input.index,
    kind: dbKindFor(input.kind),
    intent: input.intent,
    tool_name: input.toolName,
    tool_args: input.toolArgs,
    screenshot_path: input.observation?.screenshotPath ?? null,
    dom_snapshot: input.observation?.domSnippet ?? null,
    console_log: input.observation?.consoleLog ?? null,
    network_log: input.observation?.networkLog ?? null,
    judgment_pass: input.judgmentPass ?? null,
    judgment_reason: input.judgmentReason ?? null,
  });
  if (error) throw new Error(`persistStep failed: ${error.message}`);
}

/** Map agent tool name to db `step_kind` enum. */
function dbKindFor(kind: PersistStepInput["kind"]): string {
  if (kind === "navigate" || kind === "click" || kind === "type" || kind === "wait" || kind === "screenshot") {
    return kind;
  }
  if (kind === "getDom") return "assert"; // closest enum match
  if (kind === "assertPass" || kind === "assertFail") return "assert";
  // plan, evaluate, getAccessibility, setViewport, custom → "custom"
  return "custom";
}
