-- Per-project credential sets the agent can use via the signIn tool.
--
-- A credential set is a named collection of fields (e.g. "admin_user" with
-- {username, password, totp_secret}). The agent calls signIn(credentialName,
-- fieldSelectors) and the worker resolves the values internally — they
-- never appear in step tool_args or judgments.
--
-- TODO (production): encrypt fields via Supabase Vault and store the secret
-- id here instead of the plaintext jsonb.

create table public.credentials (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  fields      jsonb not null default '{}'::jsonb,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(project_id, name)
);

create index credentials_project_id_idx on public.credentials(project_id);

alter table public.credentials enable row level security;

create policy "credentials_via_project"
  on public.credentials for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

create trigger credentials_touch before update on public.credentials
  for each row execute function public.touch_updated_at();
