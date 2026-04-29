import { supabaseAdmin } from "../db/supabase.js";

export interface CredentialSummary {
  name: string;
  fields: string[];
  description?: string;
}

/**
 * List the credential sets available for a project — names + field names
 * only. Values stay in the DB. Used to inject into the system prompt so
 * the agent knows which credentialName values are valid.
 */
export async function listCredentialSummaries(
  projectId: string,
): Promise<CredentialSummary[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("credentials")
    .select("name, fields, description")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => {
    const fieldsRecord = (row.fields as Record<string, unknown> | null) ?? {};
    const summary: CredentialSummary = {
      name: row.name as string,
      fields: Object.keys(fieldsRecord),
    };
    if (row.description) summary.description = row.description as string;
    return summary;
  });
}
