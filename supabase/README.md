# Supabase

Schema and storage buckets for the AI Testing Platform.

## Apply migrations

Once your Supabase project is created and linked:

```bash
# from repo root, after `supabase login` and `supabase link --project-ref <ref>`
supabase db push
```

Or paste `migrations/0001_initial_schema.sql` into the Supabase SQL editor.

## Storage buckets

Create these manually in the Supabase dashboard (Storage → New bucket):

- `screenshots` — private; step screenshots
- `videos` — private; full-run video recordings (Phase 3)
- `audio` — private; audio captures (Phase 3)
- `contexts` — private; uploaded PRD/spec files

## Tables

| Table          | Purpose                                                |
|----------------|--------------------------------------------------------|
| `profiles`     | Per-user profile, mirrors `auth.users`                 |
| `projects`     | One row per app-under-test                             |
| `contexts`     | PRDs/specs/notes that ground the agent (with vectors)  |
| `runs`         | One execution of a prompt                              |
| `steps`        | Ordered actions the agent took during a run            |
| `integrations` | GitHub/Sentry/etc. connections per project             |

All tables are RLS-protected by `owner_id` chain.
