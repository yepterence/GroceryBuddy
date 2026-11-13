# PRD QoL — GitHub Actions CI (test gate on every commit)

> Status: Draft v0.1 · Type: **QoL / engineering** · Product goals: *(none — off the G1–G5 stack)* · Index: [`README.md`](./README.md)

This PRD is **not** part of the portfolio product slice (01–04). It does not compete with PRD 02 feature work for “main” sequencing. Ship it when a short infra pass fits, or before opening the repo to collaborators / interview reviewers.

---

## 1. Background & Problem

The repo already has solid automated verification:

- **Backend:** `./scripts/test.sh` runs pytest against a real Postgres (`docker compose --profile test` → `postgres-test` on port 5433, or `TEST_DATABASE_URL`).
- **Frontend:** `npm run lint`, `npm run build` (`tsc -b` + Vite), `npm test` (Vitest).

Today those commands run **only when someone runs them locally**. There is no `.github/workflows` and no pre-commit hook. Regressions can land on the default branch if a push skips the local suite.

**Goal:** Turn the existing “almost-CI” scripts into **actual CI** on GitHub: every push and every pull request runs the same checks on a clean Linux runner.

## 2. Goals

| ID | Goal |
|----|------|
| Q1 | Every **push** and **pull_request** to the tracked default branch(es) runs automated checks without manual steps. |
| Q2 | A **failed check** clearly indicates backend vs frontend (separate jobs or named steps). |
| Q3 | CI uses **no secrets** for the test database (throwaway `postgres-test` only). |
| Q4 | CI does **not** require a committed `.env` or production `POSTGRES_PASSWORD`. |

### Non-goals

- Deploying the app (staging/production Docker, Vercel, etc.).
- Playwright or full-stack browser E2E (`startup.sh` + live API + Vite).
- Husky / pre-commit (optional follow-up; not in scope here).
- Branch protection rules or required-check configuration in GitHub (document as a manual follow-up).
- Caching flyer/scraper tests or hitting external Flipp in CI (keep scraper tests skipped or isolated if they need network; see §9).

## 3. Users & Stories

- As a **maintainer**, I see a red ✗ on a commit or PR when tests fail, without running Docker locally first.
- As a **reviewer**, I trust that merged work passed the same `test.sh` + npm scripts the README already documents.
- As a **future collaborator**, I get fast feedback on forked PRs when Actions are enabled on the repo.

## 4. Functional Requirements

| ID | Requirement |
|----|-------------|
| F1 | Add `.github/workflows/ci.yml` (name TBD, e.g. `CI`) triggered on `push` and `pull_request`. |
| F2 | **Backend job:** checkout, setup Python 3.12+, `pip install -r api/requirements-dev.txt`, run `./scripts/test.sh --down` from repo root. |
| F3 | **Frontend job:** checkout, setup Node 20 LTS, `npm ci`, then `npm run lint`, `npm run build`, `npm test`. |
| F4 | Backend job runs on a runner with **Docker** available (`ubuntu-latest`); starts test Postgres via existing `docker-compose.yml` profile `test`. |
| F5 | Workflow sets `POSTGRES_PASSWORD` to a **dummy** value so `docker compose` config validation succeeds (test service uses fixed creds; same pattern as local `test.sh`). |
| F6 | Workflow does **not** set `TEST_DATABASE_URL` to the same URL as a dev `DATABASE_URL` from `.env` (no `.env` in CI; `test.sh` sets throwaway URL). |
| F7 | Document the workflow in `README.md` (badges optional): what runs, how to reproduce locally, link to Actions tab. |

## 5. Technical Notes (reuse, don’t reinvent)

| Local today | CI should call |
|-------------|----------------|
| `./scripts/test.sh` | Same; `--down` stops `postgres-test` after the run to avoid leaving containers on the runner (optional on ephemeral runners, but keeps logs tidy). |
| `gb-api` venv | CI: install deps in workflow (global or venv); either activate venv before `test.sh` or ensure `gb-api` exists — `test.sh` prefers `VIRTUAL_ENV`, else `$root/gb-api/bin/python`. **Prefer:** `python -m venv gb-api` + pip in the workflow so the script’s fallback path works. |
| `npm install` | `npm ci` for deterministic lockfile installs. |

Path filters (`paths:` / `paths-ignore:`) are **optional v1.1** — nice when only `docs/` changes; omit in v1 for simplicity.

## 6. Non-Functional

- **Time:** Target &lt; 10 minutes total wall time for both jobs in parallel (typical: 3–6 min with cold Docker image pull).
- **Reliability:** No dependency on GitHub secrets for v1.
- **Cost:** Standard public-repo Actions minutes; no self-hosted runner.

## 7. Success Criteria (acceptance)

- [ ] Opening a PR with an intentional test failure causes the Actions workflow to fail and report which job failed.
- [ ] Opening a PR on a green branch shows all jobs passing.
- [ ] A new clone + reading README explains how to mirror CI locally (`./scripts/test.sh`, `npm ci` + lint/build/test).
- [ ] No production credentials appear in the workflow YAML or logs.

## 8. Dependencies

- Existing: `docker-compose.yml` (`postgres-test` profile), `scripts/test.sh`, `api/requirements-dev.txt`, `package-lock.json`.
- **Git remote:** repository hosted on GitHub with Actions enabled (default for public repos).

## 9. Open Questions

- **Parallel jobs vs single job:** two jobs (backend + frontend) for clearer failures and parallelism — default recommendation.
- **Python version pin:** match local dev (.python-version or document 3.12 in workflow).
- **Scraper / network tests:** confirm whether any pytest module hits Flipp or Puppeteer at import time; mark `no_db` / skip in CI or restrict with `-m` if needed.
- **Branch protection:** after first green run, enable “Require status checks to pass” for `CI` jobs — owner action outside this PRD.
- **Default branch name:** `main` vs `master` in `on.pull_request` / protection docs.

## 10. Implementation Sketch (non-normative)

1. Add `.github/workflows/ci.yml` per F1–F6.
2. Push a branch; verify Actions green on GitHub.
3. Optional: add status badge to README.
4. Update `docs/progress.md` row for CI (when done).

## 11. Relation to product PRDs

| Product PRD | Interaction |
|-------------|-------------|
| 01–04 | None — CI only runs existing tests. |
| Pre-production auth gate | Unaffected; CI does not deploy. |
| Portfolio v1 | **Not required** to demo the grocery loop; **recommended** before external visibility or heavy PR traffic. |
