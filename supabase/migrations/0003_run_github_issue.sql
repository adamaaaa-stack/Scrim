-- Track the GitHub issue (if any) opened or commented on for a run.
-- - github_issue_url: full https URL to the issue
-- - github_issue_number: numeric issue number (for commenting on re-runs
--   of the same failing prompt)

alter table public.runs
  add column github_issue_url text,
  add column github_issue_number int;

-- Used by dedup: find prior failed run with same prompt that has an issue
create index runs_project_prompt_idx
  on public.runs (project_id, prompt)
  where github_issue_url is not null;
