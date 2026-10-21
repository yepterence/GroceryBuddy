# Grocery Buddy

Your grocery list, on your side. Grocery Buddy checks local flyers for sales on the items you need, so you spend less without hunting for deals.

Where it’s headed: snap a photo of what you ate to log its nutrition, suggest recipes that fill nutrient gaps, and recommend re-purchases based on what you buy regularly. The goal is to link nutrition to local prices, which nutrition apps and flyer apps each stop short of. See the [product specs](docs/prd/README.md).

Status: the list API, flyer price lookup and Postgres schema are built, and a test suite covers the API against a real Postgres. Connecting the frontend to the API and building the recommenders come next. See [`docs/progress.md`](docs/progress.md) for details.

## Local development

### Quick start

After creating `.env` (step 1 below), one command does everything in steps 2-4: starts
Postgres, applies the schema, loads the env vars, then runs the API and the frontend.

```bash
./scripts/startup.sh
```

Ctrl-C stops the API and frontend; Postgres keeps running (`docker compose down` stops it).
The manual steps below are the same thing, one at a time.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (with Compose v2) for Postgres
- Python 3.10+ for the API
- Node.js and npm for the frontend

### 1. Configure environment

```bash
cp .env.example .env
```

`.env.example` lists the variable names with placeholder values. `.env` is your private
copy; it is gitignored and must never be committed.

1. Generate a password: `openssl rand -hex 12` (letters and digits only, so it is safe
   inside a URL).
2. In `.env`, set `POSTGRES_PASSWORD` to it, and put the same value in the password part of
   `DATABASE_URL`.

Compose and `startup.sh` refuse to run if `POSTGRES_PASSWORD` is missing or still the
`REPLACE_ME` placeholder. Use a different password for any shared or deployed database;
this setup is for local development only.

### 2. Start Postgres

```bash
docker compose up -d --wait postgres
```

On first start (when the data volume is empty) the tables from `db/schema.sql` are created
automatically. Data persists across restarts in the `pgdata` volume.

- Re-apply the schema to an existing database (safe to repeat; it only adds missing
  objects and never alters existing tables):
  ```bash
  set -a; source .env; set +a
  ./scripts/create-tables.sh
  ```
- Stop: `docker compose down`. Stop and **delete all data**: `docker compose down -v`.
- If you changed `POSTGRES_PASSWORD` after the volume was first created, Postgres keeps the
  old one. Run `docker compose down -v` once to recreate it.

### 3. Run the API

```bash
python3 -m venv gb-api            # gb-api/ is gitignored
source gb-api/bin/activate
pip install -r api/requirements-dev.txt   # runtime + test dependencies

set -a; source .env; set +a       # the API reads DATABASE_URL from the environment
python api/api.py
```

The API listens on <http://localhost:3001>. The API does not load `.env` by itself yet, so
export the variables in the same shell as above (`set -a; source .env; set +a`). If
`DATABASE_URL` is missing, startup fails with `DATABASE_URL is required`.

Quick check:

```bash
curl http://localhost:3001/
# {"server_name":"grocery_buddy_server"}
```

Endpoints (all take a `user_id` UUID; there is no authentication yet):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/lists` | Save a list: `{user_id, title, items: [str]}` |
| `GET` | `/lists?user_id=` | All of a user's lists |
| `GET` / `DELETE` | `/lists/<id>?user_id=` | Read or delete one list |
| `POST` | `/lists/<id>/items` | Add an item: `{user_id, name}` |
| `PATCH` | `/items/<id>` | Check or uncheck: `{user_id, checked}` |
| `GET` | `/get-prices` | Flyer price lookup (`locale`, `postal_code`, `list-items`) |

If the database is unreachable or too slow, routes return `503`.

### 4. Run the frontend

```bash
npm install
npm run dev
```

Vite serves the app at <http://localhost:5173>. Requests to `/api/*` are proxied to the
API on port 3001 (see `vite.config.ts`), so start the API too or saving lists will show an
error. Set `VITE_API_URL` to call a different API address directly. The frontend tests run
with `npm test`; they mock the network and need neither the API nor Postgres.

## Tests

Tests that touch the database need a throwaway Postgres. Use the `postgres-test` service
(data lives in RAM and is wiped on restart). Never point `TEST_DATABASE_URL` at your dev
database.

The easy way, one command that starts the test database, sets `TEST_DATABASE_URL` and
runs pytest:

```bash
./scripts/test.sh                  # whole suite, including the DB tests
./scripts/test.sh -k isolation -x  # extra arguments go straight to pytest
./scripts/test.sh --down           # also stop the test database afterwards
```

It leaves `postgres-test` running between runs so reruns are fast. If you already set
`TEST_DATABASE_URL`, it uses that database instead, and it refuses to run if that URL
equals your `DATABASE_URL`. The manual equivalent:

```bash
docker compose --profile test up -d --wait postgres-test

source gb-api/bin/activate
cd api
TEST_DATABASE_URL=postgresql://grocerybuddy:grocerybuddy_test@127.0.0.1:5433/grocerybuddy_test \
  python -m pytest

docker compose --profile test down
```

- Without `TEST_DATABASE_URL`, database tests are skipped; only the simulated-failure
  tests run.
- Compose validates the whole file, so `POSTGRES_PASSWORD` must be set (in `.env` or the
  shell) even when starting only the test service.
- The tests apply `db/schema.sql` themselves; no manual setup is needed.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `required variable POSTGRES_PASSWORD is missing` | Create `.env` (step 1) |
| `DATABASE_URL is required` on API start | Export the env vars: `set -a; source .env; set +a` |
| API fails to import with `No module named 'pkg_resources'` | `pip install "setuptools<81"` (included in `requirements-dev.txt`) |
| `password authentication failed` | The volume was created with a different password; `docker compose down -v` |
| `address already in use` on 5432 | Set `POSTGRES_PORT` in `.env` and update the port in `DATABASE_URL` |
| `503 database unavailable` | Check `docker compose ps`; the database is down, paused, or still starting |
