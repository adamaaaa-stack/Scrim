# Deploying Scrim

Two deploys — the web (Vercel) and the orchestrator (Fly.io). Do them in
either order; just remember to point each one at the other once both are live.

## 1) Orchestrator → Fly.io

```bash
# One-time auth (opens browser):
flyctl auth login

# Create the app (uses fly.toml in apps/orchestrator/):
cd apps/orchestrator
flyctl launch --no-deploy --copy-config --name scrim-orchestrator

# Push every secret from your local .env:
cd ../..
./scripts/push-fly-secrets.sh

# Deploy:
cd apps/orchestrator
flyctl deploy
```

After this you have `https://scrim-orchestrator.fly.dev` (or whatever name you
picked). Hit `/health` to confirm it's alive.

## 2) Web → Vercel

```bash
# One-time auth (opens browser):
vercel login

# Link the repo to a Vercel project. Pick "Other" framework when asked
# (we have vercel.json overriding the build commands):
vercel link

# Push every web-side env var from .env:
./scripts/push-vercel-env.sh

# Deploy production:
vercel --prod
```

## 3) Cross-wire the two

In the **Vercel dashboard** → Settings → Environment Variables, set:

- `ORCHESTRATOR_URL` → `https://scrim-orchestrator.fly.dev`
- `WEB_BASE_URL` → `https://your-vercel-url.vercel.app`
- `GITHUB_OAUTH_CALLBACK_URL` → `https://your-vercel-url.vercel.app/api/auth/github/callback`

Then in the **Fly.io dashboard** (or `flyctl secrets set`):

- `WEB_BASE_URL` → `https://your-vercel-url.vercel.app` (used in GitHub
  issue bodies as the run-link URL)

Re-deploy both after editing env vars. `vercel --prod` and `flyctl deploy`.

## 4) Update GitHub OAuth App

Go to https://github.com/settings/applications/ → your Scrim OAuth App →
update **Authorization callback URL** to:

```
https://your-vercel-url.vercel.app/api/auth/github/callback
```

Otherwise the OAuth dance will redirect to localhost and fail.

## What runs where

| Component | Where | Why |
|---|---|---|
| Web UI, signin/signup, project pages, run viewer | Vercel | Short request/response, edge-friendly |
| Capture endpoints (`/captures/*`) | Vercel | Just inserts to DB |
| Orchestrator, agent loop, Playwright, voice, Kokoro, Whisper | Fly.io | Long-running, holds models in memory, drives a real browser |
| Database, auth, file storage | Supabase | (already running) |

## Troubleshooting

- **Vercel build fails on missing module**: make sure pnpm version matches.
  We pin `pnpm@10.27.0` in root package.json.
- **Fly deploy out of memory during model load**: bump `memory_mb` in
  `apps/orchestrator/fly.toml` to 4096.
- **OAuth redirects to localhost**: didn't update the GitHub OAuth App
  callback URL (step 4).
- **"Could not reach orchestrator"** errors after deploy: `ORCHESTRATOR_URL`
  in Vercel still points to localhost; update + redeploy web.
