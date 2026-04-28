import { Octokit } from "@octokit/rest";
import { supabaseAdmin } from "../db/supabase.js";
import { signedScreenshotUrl } from "../storage/screenshots.js";
import { signedTraceUrl } from "../storage/traces.js";
import { logger } from "../logger.js";

interface GitHubConfig {
  token: string;
  user: { login: string };
  repo?: { owner: string; name: string; full_name: string };
}

async function loadGithubConfig(projectId: string): Promise<GitHubConfig | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("integrations")
    .select("config, enabled")
    .eq("project_id", projectId)
    .eq("kind", "github")
    .maybeSingle();
  if (!data?.enabled || !data.config) return null;
  const cfg = data.config as GitHubConfig;
  if (!cfg.token || !cfg.repo) return null; // need both
  return cfg;
}

interface PriorIssue {
  issueNumber: number;
  issueUrl: string;
}

/**
 * Find the most recent failed run in this project with the SAME prompt that
 * already has a GitHub issue attached. Used to dedup re-runs of the same
 * failing test into comments instead of new issues.
 */
async function findPriorIssueForFailure(
  projectId: string,
  prompt: string,
): Promise<PriorIssue | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("runs")
    .select("github_issue_url, github_issue_number")
    .eq("project_id", projectId)
    .eq("prompt", prompt)
    .eq("status", "failed")
    .not("github_issue_url", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.github_issue_number || !data.github_issue_url) return null;
  return {
    issueNumber: data.github_issue_number,
    issueUrl: data.github_issue_url,
  };
}

interface FailureInput {
  runId: string;
  projectId: string;
  prompt: string;
  reason: string;
  failedStep: { index: number; toolName: string; intent: string };
  screenshotPath: string | null;
  tracePath: string | null;
  devicePreset: string;
}

interface FailureResult {
  issueNumber: number;
  issueUrl: string;
  isComment: boolean; // true if commented on existing, false if new issue
}

/**
 * File a new issue or comment on the existing one for a failed run.
 * Returns null if the project has no GitHub integration.
 */
export async function reportFailureToGithub(
  input: FailureInput,
): Promise<FailureResult | null> {
  const cfg = await loadGithubConfig(input.projectId);
  if (!cfg || !cfg.repo) {
    logger.info({ runId: input.runId }, "no github integration, skipping issue file");
    return null;
  }

  const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";
  const runUrl = `${webBase}/runs/${input.runId}`;
  const screenshotUrl = input.screenshotPath
    ? await signedScreenshotUrl(input.screenshotPath, 7 * 24 * 3600)
    : null;
  const traceUrl = input.tracePath
    ? await signedTraceUrl(input.tracePath, 7 * 24 * 3600)
    : null;
  const traceViewerUrl = traceUrl
    ? `https://trace.playwright.dev/?trace=${encodeURIComponent(traceUrl)}`
    : null;

  const body = renderIssueBody({
    ...input,
    runUrl,
    screenshotUrl,
    traceViewerUrl,
  });

  const gh = new Octokit({ auth: cfg.token });
  const prior = await findPriorIssueForFailure(input.projectId, input.prompt);

  if (prior) {
    // Comment on existing issue
    await gh.issues.createComment({
      owner: cfg.repo.owner,
      repo: cfg.repo.name,
      issue_number: prior.issueNumber,
      body: `### Re-run failed\n\n${body}`,
    });
    logger.info(
      { runId: input.runId, issueNumber: prior.issueNumber },
      "commented on existing issue",
    );
    return {
      issueNumber: prior.issueNumber,
      issueUrl: prior.issueUrl,
      isComment: true,
    };
  }

  // Create new issue
  const title = `[AI Testing] ${truncate(input.prompt, 80)}`;
  const { data: issue } = await gh.issues.create({
    owner: cfg.repo.owner,
    repo: cfg.repo.name,
    title,
    body,
    labels: ["ai-testing-platform"],
  });

  logger.info(
    { runId: input.runId, issueNumber: issue.number, url: issue.html_url },
    "filed new github issue",
  );
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    isComment: false,
  };
}

function renderIssueBody(args: {
  runId: string;
  prompt: string;
  reason: string;
  failedStep: { index: number; toolName: string; intent: string };
  devicePreset: string;
  runUrl: string;
  screenshotUrl: string | null;
  traceViewerUrl: string | null;
}): string {
  return [
    `> Filed automatically by **AI Testing Platform**`,
    ``,
    `### Prompt`,
    `${args.prompt}`,
    ``,
    `### Verdict`,
    `${args.reason}`,
    ``,
    `### Failure context`,
    `- **Run**: [${args.runId.slice(0, 8)}](${args.runUrl})`,
    `- **Device**: \`${args.devicePreset}\``,
    `- **Failed at step**: #${args.failedStep.index} (\`${args.failedStep.toolName}\`) — ${args.failedStep.intent}`,
    ``,
    args.screenshotUrl ? `### Screenshot at failure\n![screenshot](${args.screenshotUrl})\n` : "",
    args.traceViewerUrl
      ? `### Time-travel debugging\n[Open Playwright trace ↗](${args.traceViewerUrl})\n`
      : "",
    `---`,
    `[View full run timeline ↗](${args.runUrl})`,
  ]
    .filter(Boolean)
    .join("\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
