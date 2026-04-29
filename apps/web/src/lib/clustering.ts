import { supabaseAdmin } from "./supabase/admin";

export interface SimilarFailure {
  id: string;
  prompt: string;
  similarity: number;
  started_at: string;
  github_issue_url: string | null;
  github_issue_number: number | null;
}

/**
 * Look up failed runs in the same project whose failure_embedding is similar
 * to the current run's, using the match_failed_runs RPC.
 *
 * Returns up to 5 matches above similarity 0.65 (cosine).
 */
export async function findSimilarFailures(args: {
  runId: string;
}): Promise<SimilarFailure[]> {
  const sb = supabaseAdmin();

  // Pull this run's embedding + project to feed the RPC.
  const { data: run } = await sb
    .from("runs")
    .select("project_id, failure_embedding")
    .eq("id", args.runId)
    .single();
  if (!run?.failure_embedding) return [];

  const { data, error } = await sb.rpc("match_failed_runs", {
    query_embedding: run.failure_embedding,
    current_project_id: run.project_id,
    exclude_run_id: args.runId,
    match_count: 5,
    similarity_threshold: 0.65,
  });
  if (error) {
    console.warn("match_failed_runs RPC failed:", error.message);
    return [];
  }
  return (data ?? []) as SimilarFailure[];
}
