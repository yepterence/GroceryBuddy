#!/usr/bin/env bash
# Local-dev startup: Postgres (Docker) -> tables -> API -> frontend.
#
#   ./scripts/startup.sh
#
# Needs: docker (compose v2), python3, node/npm, and a configured .env
# (cp .env.example .env, then set POSTGRES_PASSWORD and the matching DATABASE_URL).
# Ctrl-C stops the API and frontend. Postgres keeps running (its data persists);
# stop it with `docker compose down`.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

API_PORT=3001
venv="$root/gb-api"

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- 1. Preflight ---------------------------------------------------------
say "Checking prerequisites"
for cmd in docker python3 npm curl; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is required but not installed."
done
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (docker compose)."
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and retry. If on MacOS, start Docker desktop using open -a Docker"

# --- 2. Environment -------------------------------------------------------
say "Loading environment.."
[[ -f .env ]] || die "Environment was not setup properly. Exiting."

set -a
# shellcheck disable=SC1091
source .env
set +a

[[ -n "${POSTGRES_PASSWORD:-}" ]] || die "Set password. Password not set."
[[ "$POSTGRES_PASSWORD" != REPLACE_ME* ]] || die "Set password. Password not set."
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set."
[[ "$DATABASE_URL" == *"$POSTGRES_PASSWORD"* ]] \
  || echo "WARNING: DB URL does not contain password; check they match." >&2

POSTGRES_USER="${POSTGRES_USER:-grocerybuddy}"
POSTGRES_DB="${POSTGRES_DB:-grocerybuddy}"

# --- 3. Postgres container ------------------------------------------------
say "Starting Postgres (docker compose)"
docker compose up -d --wait postgres

# --- 4. Tables ------------------------------------------------------------
# Run psql inside the container so no local psql install is needed.
# schema.sql is idempotent, so this is safe on every start.
say "Applying db/schema.sql"
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q < db/schema.sql

# --- 5. Dependencies ------------------------------------------------------
say "Loading Python environment"
if [[ -n "${VIRTUAL_ENV:-}" ]]; then
  # A virtualenv is already activated in this shell: use it, don't create or install.
  py="$VIRTUAL_ENV/bin/python"
  echo "Using activated environment: $VIRTUAL_ENV"
  "$py" -c "import sanic, asyncpg" 2>/dev/null \
    || die "Activated environment is missing API dependencies. Run: pip install -r api/requirements.txt"
else
  py="$venv/bin/python"
  [[ -d "$venv" ]] || python3 -m venv "$venv"
  if [[ ! -f "$venv/.deps-installed" || api/requirements.txt -nt "$venv/.deps-installed" ]]; then
    "$venv/bin/pip" install -q -r api/requirements.txt
    touch "$venv/.deps-installed"
  else
    echo "Python environment up to date, skipping install."
  fi
fi

say "Frontend dependencies"
if [[ ! -d node_modules || package-lock.json -nt node_modules ]]; then
  npm install
fi

# --- 6. Launch ------------------------------------------------------------
# On Ctrl-C / exit, stop everything this script started (same process group).
trap 'trap - INT TERM EXIT; echo; echo "Stopping API and frontend..."; kill 0' INT TERM EXIT

say "Starting API on http://localhost:$API_PORT"
"$py" api/api.py &

for _ in $(seq 1 30); do
  curl -fs "http://localhost:$API_PORT/" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://localhost:$API_PORT/" >/dev/null 2>&1 \
  || die "API did not respond on port $API_PORT within 30s."

say "Starting frontend. Press Ctrl-C to stop the API and frontend."
npm run dev
