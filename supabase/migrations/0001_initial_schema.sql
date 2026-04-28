-- AI Testing Platform: initial schema
--
-- Tables:
--   profiles    : extends auth.users with display name, avatar, etc.
--   projects    : a user's app-under-test (target URL + metadata)
--   contexts    : uploaded specs, PRDs, design docs that ground the agent
--   runs        : one execution of a prompt against a project
--   steps       : ordered actions the agent took during a run
--   integrations: per-project external connections (github, sentry, etc.)
--
-- All tables are RLS-protected so a user can only see/modify their own rows.

create extension if not exists "vector";
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- projects
-- ============================================================
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  target_url   text not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects(owner_id);

alter table public.projects enable row level security;

create policy "projects_owner_all"
  on public.projects for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ============================================================
-- contexts (PRDs, specs, learning objectives, etc.)
-- ============================================================
create table public.contexts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null check (kind in ('prd', 'spec', 'curriculum', 'design', 'note', 'other')),
  title       text not null,
  body        text not null,
  embedding   vector(1536),  -- for future semantic retrieval
  created_at  timestamptz not null default now()
);

create index contexts_project_id_idx on public.contexts(project_id);
create index contexts_embedding_idx on public.contexts using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.contexts enable row level security;

create policy "contexts_via_project"
  on public.contexts for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

-- ============================================================
-- runs
-- ============================================================
create type run_status as enum ('queued', 'running', 'passed', 'failed', 'errored');

create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  status        run_status not null default 'queued',
  prompt        text not null,
  prompt_rewritten text,             -- after reverse-prompter expands it
  context_refs  uuid[] not null default '{}',
  model         text not null default 'x-ai/grok-4-fast',
  failure_embedding vector(1536),    -- for clustering / GitHub dedup
  error         text,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index runs_project_id_idx on public.runs(project_id);
create index runs_status_idx on public.runs(status);
create index runs_started_at_idx on public.runs(started_at desc);
create index runs_failure_embedding_idx on public.runs using ivfflat (failure_embedding vector_cosine_ops) with (lists = 100);

alter table public.runs enable row level security;

create policy "runs_via_project"
  on public.runs for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

-- ============================================================
-- steps
-- ============================================================
create type step_kind as enum ('navigate', 'click', 'type', 'wait', 'screenshot', 'assert', 'custom');

create table public.steps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.runs(id) on delete cascade,
  index           int not null,
  kind            step_kind not null,
  intent          text not null,
  tool_name       text,
  tool_args       jsonb,
  screenshot_path text,        -- path in supabase storage bucket
  dom_snapshot    text,
  console_log     jsonb,
  network_log     jsonb,
  audio_transcript text,
  judgment_pass   boolean,
  judgment_reason text,
  created_at      timestamptz not null default now(),
  unique(run_id, index)
);

create index steps_run_id_idx on public.steps(run_id);

alter table public.steps enable row level security;

create policy "steps_via_run"
  on public.steps for all
  using (run_id in (
    select r.id from public.runs r
    join public.projects p on p.id = r.project_id
    where p.owner_id = auth.uid()
  ));

-- ============================================================
-- integrations
-- ============================================================
create type integration_kind as enum ('github', 'sentry', 'datadog', 'slack', 'linear');

create table public.integrations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  kind          integration_kind not null,
  config        jsonb not null default '{}'::jsonb,
  -- Encrypted credentials live in Supabase Vault, referenced by id here
  vault_secret_id uuid,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique(project_id, kind)
);

alter table public.integrations enable row level security;

create policy "integrations_via_project"
  on public.integrations for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
