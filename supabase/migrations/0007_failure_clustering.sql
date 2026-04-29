-- Failure clustering via pgvector cosine similarity.
-- The runs.failure_embedding column was created in migration 0001;
-- here we add the RPC the web app uses to find nearest-neighbor failures.

create or replace function public.match_failed_runs(
  query_embedding vector(1536),
  current_project_id uuid,
  exclude_run_id uuid,
  match_count int default 5,
  similarity_threshold float default 0.65
)
returns table (
  id uuid,
  prompt text,
  similarity float,
  started_at timestamptz,
  github_issue_url text,
  github_issue_number int
)
language sql
stable
as $$
  select
    r.id,
    r.prompt,
    1 - (r.failure_embedding <=> query_embedding) as similarity,
    r.started_at,
    r.github_issue_url,
    r.github_issue_number
  from public.runs r
  where r.status = 'failed'
    and r.failure_embedding is not null
    and (exclude_run_id is null or r.id <> exclude_run_id)
    and r.project_id = current_project_id
    and (1 - (r.failure_embedding <=> query_embedding)) >= similarity_threshold
  order by r.failure_embedding <=> query_embedding
  limit match_count;
$$;
