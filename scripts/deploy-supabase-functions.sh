#!/usr/bin/env bash
set -euo pipefail

# Deploy all Supabase Edge Functions in supabase/functions/*
# (skips helper dirs prefixed with "_").
#
# Usage:
#   ./scripts/deploy-supabase-functions.sh --project-ref <project_ref>
#   ./scripts/deploy-supabase-functions.sh --linked
#   ./scripts/deploy-supabase-functions.sh --project-ref <project_ref> --include-jwt-flags
#
# Notes:
# - Requires Supabase CLI (`supabase`) and auth (`supabase login`).
# - Run from repo root (script enforces this).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"

PROJECT_REF=""
USE_LINKED=0
INCLUDE_JWT_FLAGS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      PROJECT_REF="${2:-}"
      shift 2
      ;;
    --linked)
      USE_LINKED=1
      shift
      ;;
    --include-jwt-flags)
      INCLUDE_JWT_FLAGS=1
      shift
      ;;
    -h|--help)
      sed -n '1,26p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$FUNCTIONS_DIR" ]]; then
  echo "Missing functions directory: $FUNCTIONS_DIR" >&2
  exit 1
fi

if [[ "$USE_LINKED" -eq 0 && -z "$PROJECT_REF" ]]; then
  echo "Provide --project-ref <project_ref> or use --linked" >&2
  exit 1
fi

cd "$ROOT_DIR"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install from https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

echo "Deploying Supabase Edge Functions from: $FUNCTIONS_DIR"
if [[ "$USE_LINKED" -eq 1 ]]; then
  echo "Target: linked project"
else
  echo "Target project ref: $PROJECT_REF"
fi

mapfile -t function_dirs < <(for d in "$FUNCTIONS_DIR"/*; do
  [[ -d "$d" ]] || continue
  b="$(basename "$d")"
  [[ "$b" == _* ]] && continue
  printf '%s\n' "$b"
done | sort)

if [[ "${#function_dirs[@]}" -eq 0 ]]; then
  echo "No deployable functions found."
  exit 0
fi

for fn in "${function_dirs[@]}"; do
  echo "---- Deploying: $fn"
  cmd=(supabase functions deploy "$fn")
  if [[ "$USE_LINKED" -eq 0 ]]; then
    cmd+=(--project-ref "$PROJECT_REF")
  fi
  if [[ "$INCLUDE_JWT_FLAGS" -eq 1 ]]; then
    # Enable this if you later configure per-function JWT verify settings.
    cmd+=(--no-verify-jwt=false)
  fi
  "${cmd[@]}"
done

echo "All functions deployed."
