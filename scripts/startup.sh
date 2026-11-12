#!/usr/bin/env bash
# Local-dev startup: Postgres (Docker) -> tables -> API -> frontend.
#
#   ./scripts/startup.sh
#   ./scripts/startup.sh --demo scripts/seed/trends.csv
#
# --demo seeds that CSV for a fresh Shopper, exports VITE_DEMO_USER_ID for Vite,
# and starts the app so the UI uses the same id (no manual env or localStorage).
#
# Needs: docker (compose v2), python3, node/npm, and a configured .env
# (cp .env.example .env, then set POSTGRES_PASSWORD and the matching DATABASE_URL).
# Ctrl-C stops the API and frontend. Postgres keeps running (its data persists);
# stop it with `docker compose down`.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

demo_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "--demo requires a seed data file"
      demo_file="$2"
      shift 2
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done
if [[ -n "$demo_file" && ! -f "$demo_file" ]]; then
  die "seed data file not found: $demo_file"
fi

API_PORT=3001
venv="$root/gb-api"

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

# --- 6. Demo seed ---------------------------------------------------------
# After the schema (step 4) and the venv (step 5), so the tables exist and
# seed-trends.py can import the API.
if [[ -n "$demo_file" ]]; then
  say "Seeding demo data from $demo_file"
  seed_log=$(mktemp)
  "$py" scripts/seed-trends.py --new-shopper "$demo_file" | tee "$seed_log"
  # seed-trends prints DEMO_USER_ID=…; Vite injects it as VITE_DEMO_USER_ID and
  # getUserId() aligns the browser with the seeded Shopper.
  VITE_DEMO_USER_ID=$(sed -n 's/^DEMO_USER_ID=//p' "$seed_log" | head -n1)
  rm -f "$seed_log"
  [[ -n "${VITE_DEMO_USER_ID:-}" ]] || die "seed did not report a user id"
  export VITE_DEMO_USER_ID
fi

# --- 7. Launch ------------------------------------------------------------
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
