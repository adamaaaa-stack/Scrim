-- Chat conversations: thread of messages between user and the chat agent.
-- The chat agent can call a runTest tool which spawns a real run and links
-- it back via runs.conversation_id.

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index conversations_project_id_idx
  on public.conversations(project_id, updated_at desc);

alter table public.conversations enable row level security;

create policy "conversations_via_project"
  on public.conversations for all
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

create type message_role as enum ('user', 'assistant', 'tool', 'system');

create table public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            message_role not null,
  content         text not null default '',
  tool_calls      jsonb,        -- assistant tool_calls payload (OpenAI format)
  tool_call_id    text,         -- for role='tool' messages
  run_id          uuid references public.runs(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index conversation_messages_conv_idx
  on public.conversation_messages(conversation_id, created_at);

alter table public.conversation_messages enable row level security;

create policy "messages_via_conversation"
  on public.conversation_messages for all
  using (conversation_id in (
    select c.id from public.conversations c
    join public.projects p on p.id = c.project_id
    where p.owner_id = auth.uid()
  ));

-- Link each run back to the conversation it was spawned from (optional).
alter table public.runs
  add column conversation_id uuid references public.conversations(id) on delete set null;

create index runs_conversation_id_idx
  on public.runs(conversation_id)
  where conversation_id is not null;
