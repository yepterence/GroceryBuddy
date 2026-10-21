#!/usr/bin/env bash
# Run the API test suite, including the database tests.
#
#   ./scripts/test.sh                 # whole suite
#   ./scripts/test.sh -k isolation -x # extra args go straight to pytest
#   ./scripts/test.sh --down          # also stop the test database afterwards
#
# Starts the throwaway `postgres-test` container (RAM-backed, port 5433) unless
# TEST_DATABASE_URL is already set, in which case that database is used instead.
# The container is left running by default so reruns are fast.
#
# Needs: docker (running) and the API virtualenv with test dependencies
# (pip install -r api/requirements-dev.txt).

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

DEFAULT_TEST_URL="postgresql://grocerybuddy:grocerybuddy_test@127.0.0.1:5433/grocerybuddy_test"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- Arguments: our own flag, everything else goes to pytest ---------------
stop_after=0
pytest_args=()
for arg in "$@"; do
  case "$arg" in
    --down) stop_after=1 ;;
    *) pytest_args+=("$arg") ;;
  esac
done

# --- Python environment ----------------------------------------------------
if [[ -n "${VIRTUAL_ENV:-}" ]]; then
  py="$VIRTUAL_ENV/bin/python"
else
  py="$root/gb-api/bin/python"
  [[ -x "$py" ]] || die "No Python environment found. Run: python3 -m venv gb-api && gb-api/bin/pip install -r api/requirements-dev.txt"
fi
"$py" -c "import pytest, pytest_asyncio, sanic_testing, asyncpg, dotenv" 2>/dev/null \
  || die "Test dependencies missing. Run: pip install -r api/requirements-dev.txt"

# --- Test database ---------------------------------------------------------
if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  echo "Using TEST_DATABASE_URL from the environment (not starting a container)."
else
  command -v docker >/dev/null 2>&1 || die "docker is required (or set TEST_DATABASE_URL to a throwaway database)."
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and retry."

  # Compose validates the whole file, so POSTGRES_PASSWORD must be non-empty even
  # though the test service ignores it. Only used if you haven't set a real one.
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-unused-by-postgres-test}"

  echo "Starting postgres-test..."
  docker compose --profile test up -d --wait postgres-test
  export TEST_DATABASE_URL="$DEFAULT_TEST_URL"
fi

# --- Safety: never run tests against the dev/app database ------------------
dev_url="${DATABASE_URL:-}"
if [[ -z "$dev_url" && -f .env ]]; then
  dev_url="$(sed -n 's/^DATABASE_URL=//p' .env | head -n1)"
fi
if [[ -n "$dev_url" && "$TEST_DATABASE_URL" == "$dev_url" ]]; then
  die "TEST_DATABASE_URL equals DATABASE_URL. Tests write rows; use a separate throwaway database."
fi

# --- Run -------------------------------------------------------------------
status=0
(cd api && "$py" -m pytest -rs --no-fold-skipped ${pytest_args[@]+"${pytest_args[@]}"}) || status=$?

if [[ "$stop_after" -eq 1 && "$TEST_DATABASE_URL" == "$DEFAULT_TEST_URL" ]]; then
  echo "Stopping postgres-test..."
  docker compose --profile test stop postgres-test >/dev/null
fi

exit "$status"
