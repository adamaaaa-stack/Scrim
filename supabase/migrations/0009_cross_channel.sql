-- Cross-channel verification: capture emails + webhooks per project so the
-- test agent can verify "after I clicked X, did the email arrive / did the
-- webhook fire?" — completes the workflow chain that ends in side effects.

create table public.captured_emails (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  to_addr      text not null,
  from_addr    text,
  subject      text,
  body_text    text,
  body_html    text,
  raw          jsonb,
  received_at  timestamptz not null default now()
);

create index captured_emails_lookup_idx
  on public.captured_emails (project_id, received_at desc);
create index captured_emails_to_idx
  on public.captured_emails (project_id, to_addr, received_at desc);

alter table public.captured_emails enable row level security;
create policy "captured_emails_via_project"
  on public.captured_emails for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

create table public.captured_webhooks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  label        text not null,
  method       text,
  headers      jsonb,
  payload      jsonb,
  query        jsonb,
  received_at  timestamptz not null default now()
);

create index captured_webhooks_lookup_idx
  on public.captured_webhooks (project_id, label, received_at desc);

alter table public.captured_webhooks enable row level security;
create policy "captured_webhooks_via_project"
  on public.captured_webhooks for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

-- After-the-fact garbage collection of old captures (call from cron later).
create or replace function public.gc_old_captures(retention_days int default 7)
returns void language sql as $$
  delete from public.captured_emails
   where received_at < now() - (retention_days || ' days')::interval;
  delete from public.captured_webhooks
   where received_at < now() - (retention_days || ' days')::interval;
$$;
