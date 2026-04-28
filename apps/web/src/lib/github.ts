import { Octokit } from "@octokit/rest";
import { supabaseAdmin } from "./supabase/admin";

export interface GitHubConfig {
  token: string;
  user: { login: string; name: string | null; avatar_url: string | null };
  repo?: { owner: string; name: string; full_name: string; private: boolean };
  installed_at: string;
}

export function ghAuthorizeUrl(state: string): string {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const callback =
    process.env.GITHUB_OAUTH_CALLBACK_URL ?? "http://localhost:3000/api/auth/github/callback";
  if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    scope: "repo read:user", // repo: file issues + open PRs; read:user: identify user
    state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function ghExchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri:
        process.env.GITHUB_OAUTH_CALLBACK_URL ??
        "http://localhost:3000/api/auth/github/callback",
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) {
    throw new Error(`No access token in GitHub response: ${json.error ?? "unknown"}`);
  }
  return json.access_token;
}

export function ghClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

/** Load this project's GitHub integration config, if any. */
export async function loadGithubIntegration(
  projectId: string,
): Promise<GitHubConfig | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("integrations")
    .select("config, enabled")
    .eq("project_id", projectId)
    .eq("kind", "github")
    .maybeSingle();
  if (!data?.enabled || !data.config) return null;
  return data.config as GitHubConfig;
}

/** Upsert the GitHub integration for a project. */
export async function saveGithubIntegration(
  projectId: string,
  config: GitHubConfig,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("integrations")
    .upsert(
      {
        project_id: projectId,
        kind: "github",
        config: config as unknown as Record<string, unknown>,
        enabled: true,
      },
      { onConflict: "project_id,kind" },
    );
  if (error) throw new Error(`saveGithubIntegration failed: ${error.message}`);
}

/** Disconnect GitHub from a project (deletes the integration row). */
export async function deleteGithubIntegration(projectId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from("integrations")
    .delete()
    .eq("project_id", projectId)
    .eq("kind", "github");
}
