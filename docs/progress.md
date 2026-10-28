# Project Progress

Last updated: 2026-10-28. Scope and sequencing live in [`prd/README.md`](./prd/README.md);
this file tracks what is actually done. Status key: ✅ done · 🟡 partial / unverified · ⬜ not started.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| PRDs and design docs | ✅ | 4 PRDs + modular recommendations design (all still marked Draft) |
| Postgres schema (PRD 01) | ✅ | `db/schema.sql`, idempotent |
| List persistence API (PRD 01) | ✅ | CRUD routes + `api/db.py` |
| Database in Docker | ✅ | `docker-compose.yml` (app + test services) |
| Automated tests | ✅ | Run against a real Postgres (`./scripts/test.sh`); confirmed by the maintainer on 2026-10-20 |
| Frontend ↔ API integration | 🟡 | `src/requests.ts` wired into the create form and dashboard; unit-tested with mocked `fetch`, **not yet tried in a browser against the live API** |
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

- [x] **DB-backed tests run against a real Postgres** (2026-10-20, confirmed by the maintainer). Run them with `./scripts/test.sh`; without `TEST_DATABASE_URL` the database tests are skipped.
- [x] Run `scripts/create-tables.sh` twice against the app container to confirm it is re-runnable (2026-10-21, confirmed by the maintainer)
- [ ] Verify the real unreachable-host timeout (the check passed in a sandbox where the failure may have been immediate)

## Next up

- [x] Load `.env` in the API (`python-dotenv` in `api/db.py`)
- [x] Connect the React frontend (`src/`) to the list API (`requests.ts`; create, load, check, delete). Still to do: try it end to end in a browser, and add UI for adding an item to an existing list (`addItem` exists but no component uses it)
- [x] Update `item_trend` from `list_inclusion` (`api/trends.py` + `db.update_item_trend`: median `cadence_days`, `next_due_at`, same-day deduplication, and frequency + recency `calculate_score`; trade-offs documented in `docs/tradeoffs.md`)
- [ ] PRD 02: re-purchase recommender
- [ ] PRD 03: AI capture and nutrition (thin)
- [ ] PRD 04: minimal framework contract + registry, wrapping `api/scraper.py` as M1

## Polish (UI / CSS)

Product feel and layout in `src/styles/theme.css` and list components (`GroceryDashboard`, etc.). Can ship incrementally alongside feature work.

- [ ] **List delete as an “×” control** — Replace the text “Delete” button with a compact dismiss control (match `Banner` dismiss styling where it fits). Position it in the list header row (title left, × right) so lists read as cards, not title + stray button.
- [ ] **Per-item remove** — Add an × on each line next to the checkbox and label; wire to store + API. Today the API has no `DELETE /items/<id>` (only PATCH check and list delete); add backend + `requests.ts` if needed, then style the row as a flex line (checkbox · name · remove).
- [ ] **Visual theme (“Sunday market”)** — Warm, personable grocery-app look (extend/replace the current generic sans + `#6CBDE9` blocks in `theme.css`):
  - **Palette:** page `#faf6f0` (cream), surface/cards `#fff` with soft shadow, text `#2c2825`, muted `#6b6560`, primary `#3d7a5f` (sage), accent/hover `#c4713a` (terracotta), error/success aligned with existing banner hues.
  - **Type:** one friendly rounded sans (e.g. **Nunito** or **DM Sans** via Google Fonts) for headings and UI; slightly larger list titles.
  - **Layout:** max-width column (~640px), list blocks as rounded cards with padding; checkbox + item + × on one row with comfortable tap targets on mobile.
  - **Tone:** light header bar or subtle top stripe in sage; optional small emoji or wordmark in `Header` (“Grocery Buddy”) — keep it subtle, not clip-art heavy.

## Known gaps and risks

- **No authentication.** `user_id` comes from the request, so anyone who knows another user's UUID can read and write their lists. Must be solved before production (PRD 01 §10). List sharing is also not implemented.
- **No migrations.** `schema.sql` only creates missing objects; it never alters existing tables. Needs a migration tool before the schema changes in a live database.
- **Lost `.env.example` contents.** A pre-existing `.env.example` was overwritten without being read during compose setup; its original contents are lost.
- **Dependency pins.** `tracerite` needs `setuptools<81` on Python 3.12+ (handled in `requirements-dev.txt`, not in `requirements.txt`).
- **Production Postgres.** The compose file is for local use; production needs managed or hardened Postgres, backups, TLS, a least-privilege role.
