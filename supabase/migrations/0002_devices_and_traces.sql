-- Mobile emulation per-project + trace recording per-run.
--
-- 1) projects.device_preset: which Playwright device profile to use when
--    launching the browser for runs against this project. Default 'desktop'.
-- 2) runs.trace_path: storage path to the .zip trace file (Playwright
--    trace.zip), uploadable to trace.playwright.dev for full time-travel
--    debugging.
-- 3) Storage bucket 'traces' must be created in the dashboard (or via the
--    storage API on first use — the orchestrator handles ensure on upload).

create type device_preset as enum ('desktop', 'iphone', 'ipad', 'android');

alter table public.projects
  add column device_preset device_preset not null default 'desktop';

alter table public.runs
  add column trace_path text,
  add column device_preset device_preset;

-- Allow new step kinds without enum churn: keep using 'custom' for
-- plan/evaluate/getAccessibility/setViewport. The tool_name column already
-- distinguishes them.
