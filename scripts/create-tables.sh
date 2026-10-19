#!/usr/bin/env bash
# Create the phase 0 tables in Postgres. Requires psql and DATABASE_URL.
# No local Postgres or Docker setup lives in this repo yet; point DATABASE_URL
# at a database you already have. Re-running is safe (CREATE IF NOT EXISTS).

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
schema="$root/db/schema.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (postgres connection string)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to apply db/schema.sql." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$schema"
echo "Applied $schema"
