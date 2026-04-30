#!/usr/bin/env bash
# Push every variable from .env into Fly.io as a secret on the
# scrim-orchestrator app. Run AFTER `flyctl auth login` and `flyctl launch`.
#
# Usage:  ./scripts/push-fly-secrets.sh
#
# Idempotent — overwriting an existing secret is fine.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
APP_NAME="${FLY_APP:-scrim-orchestrator}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found. Run from repo root." >&2
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "❌ flyctl not installed. brew install flyctl" >&2
  exit 1
fi

# Build args for one bulk `flyctl secrets set` call (faster than N invocations).
ARGS=()
while IFS= read -r line; do
  # skip comments + blanks
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  # strip inline comments (only on simple `KEY=value` lines)
  key="${line%%=*}"
  val="${line#*=}"
  # trim
  key="$(echo -n "$key" | xargs)"
  # don't override Fly's own port; the container expects 4000.
  [[ "$key" == "ORCHESTRATOR_PORT" ]] && continue
  [[ -z "$key" || -z "$val" ]] && continue
  ARGS+=("${key}=${val}")
done < "$ENV_FILE"

if [[ ${#ARGS[@]} -eq 0 ]]; then
  echo "❌ no secrets parsed from $ENV_FILE"
  exit 1
fi

echo "Pushing ${#ARGS[@]} secrets to fly app '$APP_NAME'..."
flyctl secrets set --app "$APP_NAME" --stage "${ARGS[@]}"
echo
echo "Staged. To apply + restart:  flyctl secrets deploy --app $APP_NAME"
echo "Or run:                       flyctl deploy --app $APP_NAME"
