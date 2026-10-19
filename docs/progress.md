# Project Progress

Last updated: 2026-10-16. Scope and sequencing live in [`prd/README.md`](./prd/README.md);
this file tracks what is actually done. Status key: ✅ done · 🟡 partial / unverified · ⬜ not started.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| PRDs and design docs | ✅ | 4 PRDs + modular recommendations design (all still marked Draft) |
| Postgres schema (PRD 01) | ✅ | `db/schema.sql`, idempotent |
| List persistence API (PRD 01) | ✅ | CRUD routes + `api/db.py` |
| Database in Docker | ✅ | `docker-compose.yml` (app + test services) |
| Automated tests | 🟡 | Written; **not yet run against a real Postgres** |
| Frontend ↔ API integration | ⬜ | No calls to the list API from `src/` yet |
| Re-purchase recommender (PRD 02) | ⬜ | Needs `item_trend` computation |
| AI capture + nutrition (PRD 03) | ⬜ | |
| Recommendation framework (PRD 04) | ⬜ | |
| Auth / production gate | ⬜ | Blocker before production, see below |

## Done

### Documentation
- [x] Modular recommendation framework design (`docs/modular-recommendations-design.md`)
- [x] PRD split into feature PRDs 01-04, with portfolio v1 scope and pre-production gate
- [x] Re-purchase recommender reworked around list-inclusion frequency

### Database (`db/`, `scripts/`)
- [x] Schema: `user`, `grocery_list`, `needed_item`, `list_inclusion` (append-only), `item_trend` (derived cache), plus 4 indexes
- [x] `scripts/create-tables.sh` applies the schema to any `DATABASE_URL`
- [x] `docker-compose.yml`: persistent `postgres` service (schema auto-applied on first volume creation) and throwaway `postgres-test` (profile `test`, RAM-backed)
- [x] `POSTGRES_PASSWORD` is required (no default); `.env.example` template; `.env` gitignored

### API (`api/`)
- [x] `api/db.py`: asyncpg pool, user-scoped queries, transactional `create_list`, `list_inclusion` written on every item add
- [x] Routes: `POST /lists`, `GET /lists`, `GET/DELETE /lists/<id>`, `POST /lists/<id>/items`, `PATCH /items/<id>`
- [x] Input validation (400) and ownership checks (404 for missing and for other users' data)
- [x] DB outage handling: connect and command timeouts, 503 for timeouts and connection errors
- [x] Existing `/get-prices` flyer scraper route (pre-existing)

### Tests (`api/tests/`)
- [x] `test_routes.py`: CRUD over HTTP
- [x] `test_db.py`: db module, transactions, rollback, cascade and history rules
- [x] `test_isolation.py`: users can only see their own lists (sharing is a skipped placeholder)
- [x] `test_timeouts.py`: network and timeout failures return 503
- [x] `test_schema.py`: schema is safe to re-run
- [x] `requirements-dev.txt` for test dependencies

## In progress / needs verification

- [ ] **Run the DB-backed tests for real.** 45 pass without a database; the other 46 are skipped until `TEST_DATABASE_URL` is set. They have never been executed.
  ```bash
  docker compose --profile test up -d --wait postgres-test
  cd api && TEST_DATABASE_URL=postgresql://grocerybuddy:grocerybuddy_test@127.0.0.1:5433/grocerybuddy_test \
    ../gb-api/bin/python -m pytest
  ```
- [ ] Run `scripts/create-tables.sh` twice against the app container to confirm it is re-runnable
- [ ] Verify the real unreachable-host timeout (the check passed in a sandbox where the failure may have been immediate)

## Next up

- [ ] Load `.env` in the API (`python-dotenv`; `DATABASE_URL` is currently only read from the process environment)
- [ ] Connect the React frontend (`src/`) to the list API (no `fetch` calls exist yet)
- [ ] Update `item_trend` from `list_inclusion` (cadence, `next_due_at`); prerequisite for PRD 02
- [ ] PRD 02: re-purchase recommender
- [ ] PRD 03: AI capture and nutrition (thin)
- [ ] PRD 04: minimal framework contract + registry, wrapping `api/scraper.py` as M1

## Known gaps and risks

- **No authentication.** `user_id` comes from the request, so anyone who knows another user's UUID can read and write their lists. Must be solved before production (PRD 01 §10). List sharing is also not implemented.
- **No migrations.** `schema.sql` only creates missing objects; it never alters existing tables. Needs a migration tool before the schema changes in a live database.
- **Lost `.env.example` contents.** A pre-existing `.env.example` was overwritten without being read during compose setup; its original contents are lost.
- **Dependency pins.** `tracerite` needs `setuptools<81` on Python 3.12+ (handled in `requirements-dev.txt`, not in `requirements.txt`).
- **Production Postgres.** The compose file is for local use; production needs managed or hardened Postgres, backups, TLS, a least-privilege role.
