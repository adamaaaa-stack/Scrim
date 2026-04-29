-- Sentry integration: per-project token/org/project, plus per-run error
-- snapshots for correlation with failing steps.
--
-- The Sentry token is stored as plaintext jsonb in integrations.config
-- (same pattern as GitHub). TODO: encrypt via Supabase Vault for prod.

alter table public.runs
  add column sentry_errors jsonb;

-- Index runs.started_at + completed_at because Sentry queries filter by
-- a time window roughly matching the run's lifetime.
-- (started_at is already indexed; this is informational.)
