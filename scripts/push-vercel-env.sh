#!/usr/bin/env bash
# Push every variable from .env into Vercel as production env vars.
# Run AFTER `vercel login` and `vercel link` (from repo root).
#
# Usage:  ./scripts/push-vercel-env.sh
#
# Skips secrets that don't make sense in the web frontend (e.g. LiveKit
# server-side keys, Replicate token — those belong on Fly only).

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

# Variables that should ONLY exist on the orchestrator (Fly), not on web (Vercel).
ORCH_ONLY=(
  LIVEKIT_URL
  LIVEKIT_API_KEY
  LIVEKIT_API_SECRET
  REPLICATE_API_TOKEN
  KOKORO_MODEL_ID
  KOKORO_DTYPE
  WHISPER_MODEL_ID
  ORCHESTRATOR_PORT
  ORCHESTRATOR_INTERNAL_SECRET
  GITHUB_APP_ID
  GITHUB_APP_PRIVATE_KEY
  GITHUB_WEBHOOK_SECRET
)

# After deploying to Vercel + Fly, manually update these to the production URLs.
# This script will set whatever is in your local .env — usually localhost. Fix
# them in the Vercel dashboard before going live.
PRODUCTION_OVERRIDE_HINTS=(
  "WEB_BASE_URL          → set to https://YOUR-VERCEL-URL.vercel.app"
  "ORCHESTRATOR_URL      → set to https://scrim-orchestrator.fly.dev"
  "GITHUB_OAUTH_CALLBACK_URL → set to https://YOUR-VERCEL-URL.vercel.app/api/auth/github/callback"
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found. Run from repo root." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "❌ vercel CLI not installed. pnpm add -g vercel" >&2
  exit 1
fi

count=0
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key="$(echo -n "$key" | xargs)"
  [[ -z "$key" || -z "$val" ]] && continue

  # Skip orchestrator-only secrets
  for skip in "${ORCH_ONLY[@]}"; do
    if [[ "$key" == "$skip" ]]; then
      key=""
      break
    fi
  done
  [[ -z "$key" ]] && continue

  echo -n "Setting $key... "
  # vercel env add wants stdin; pipe it in. --force overwrites existing.
  printf '%s' "$val" | vercel env add "$key" production --force >/dev/null 2>&1 \
    && echo "✓" || echo "(failed — set manually in Vercel dashboard)"
  count=$((count+1))
done < "$ENV_FILE"

echo
echo "Pushed $count env vars to Vercel (production)."
echo
echo "⚠️  PRODUCTION OVERRIDES (do these in Vercel dashboard before launch):"
for hint in "${PRODUCTION_OVERRIDE_HINTS[@]}"; do
  echo "  - $hint"
done
