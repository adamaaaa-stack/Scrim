-- Voice runs: extend the existing runs/steps schema rather than create a
-- parallel table. Voice runs use the same plan→steps→verdict shape;
-- they just have audio attached.

alter table public.runs
  add column voice_persona_id text,
  add column voice_room_url text,
  add column voice_judge_scores jsonb;

-- Per-step audio + transcript for both spoken (persona) and heard (AI) turns.
alter table public.steps
  add column audio_path text,
  add column transcript text,
  add column latency_ms int;

-- Allow the new step kinds without enum churn — keep using 'custom' and
-- distinguish by tool_name ('sayAsPersona' / 'listenForResponse').

create index runs_voice_persona_idx
  on public.runs (voice_persona_id)
  where voice_persona_id is not null;
