#!/usr/bin/env bash
set -euo pipefail

# Link repo to a Supabase project and set Edge Function secrets.
#
# Usage:
#   ./scripts/connect-supabase-edge.sh \
#     --project-ref <project_ref> \
#     --supabase-url <https://...supabase.co> \
#     --service-role-key <service_role_key>
#
# Optional:
#   --seed-token <token>                         # sets ZENGARDEN_DEMO_SEED_TOKEN
#   --worker-api-key <token>                    # sets WORKER_API_KEY (if your worker expects it)
#   --dry-run                                   # print actions only
#
# Notes:
# - Requires Supabase CLI and prior auth via `supabase login`.
# - This script does not persist secrets to files.
# - Uses ZENGARDEN_* secret names to avoid reserved SUPABASE_* prefixes.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROJECT_REF=""
SUPABASE_URL=""
SERVICE_ROLE_KEY=""
SEED_TOKEN=""
WORKER_API_KEY=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      PROJECT_REF="${2:-}"
      shift 2
      ;;
    --supabase-url)
      SUPABASE_URL="${2:-}"
      shift 2
      ;;
    --service-role-key)
      SERVICE_ROLE_KEY="${2:-}"
      shift 2
      ;;
    --seed-token)
      SEED_TOKEN="${2:-}"
      shift 2
      ;;
    --worker-api-key)
      WORKER_API_KEY="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      sed -n '1,38p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_REF" || -z "$SUPABASE_URL" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Missing required args. Need: --project-ref, --supabase-url, --service-role-key" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install from https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "Project ref: $PROJECT_REF"
echo "Repo root: $ROOT_DIR"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] supabase link --project-ref $PROJECT_REF"
  echo "[dry-run] supabase secrets set --project-ref $PROJECT_REF ZENGARDEN_SUPABASE_URL=*** ZENGARDEN_SUPABASE_SERVICE_ROLE_KEY=***"
  if [[ -n "$SEED_TOKEN" ]]; then
    echo "[dry-run] supabase secrets set --project-ref $PROJECT_REF ZENGARDEN_DEMO_SEED_TOKEN=***"
  fi
  if [[ -n "$WORKER_API_KEY" ]]; then
    echo "[dry-run] supabase secrets set --project-ref $PROJECT_REF WORKER_API_KEY=***"
  fi
  exit 0
fi

echo "Linking local supabase config..."
supabase link --project-ref "$PROJECT_REF"

echo "Setting required function secrets..."
supabase secrets set --project-ref "$PROJECT_REF" \
  ZENGARDEN_SUPABASE_URL="$SUPABASE_URL" \
  ZENGARDEN_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

if [[ -n "$SEED_TOKEN" ]]; then
  echo "Setting optional seed token..."
  supabase secrets set --project-ref "$PROJECT_REF" ZENGARDEN_DEMO_SEED_TOKEN="$SEED_TOKEN"
fi

if [[ -n "$WORKER_API_KEY" ]]; then
  echo "Setting optional worker API key..."
  supabase secrets set --project-ref "$PROJECT_REF" WORKER_API_KEY="$WORKER_API_KEY"
fi

echo "Done. Next:"
echo "  ./scripts/deploy-supabase-functions.sh --project-ref $PROJECT_REF"
