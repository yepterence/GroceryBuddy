---
name: update-project-docs
description: Updates GroceryBuddy's tracking documents (README.md, docs/progress.md, docs/tradeoffs.md, docs/prd/*.md, docs/agenda-grocerybuddy-building-with-ai.md, devlog/) so they match the current code and the work done in the session. Use when the user says "/update-docs", "update the docs", "sync the docs", "update progress", or asks to bring project documentation up to date after a change.
disable-model-invocation: true
---

# Update project docs

Bring every tracking document in line with what the code and this session actually did.
An inflated or stale doc is worse than none: the user relies on these to know where they
left off and to present the project honestly.

## Workflow

```
- [ ] 1. Collect what changed
- [ ] 2. Map changes to documents
- [ ] 3. Run the consistency checks
- [ ] 4. Show the plan, then edit
- [ ] 5. Devlog (needs confirmation)
- [ ] 6. Report
```

### 1. Collect what changed

```bash
git branch --show-current
git log --oneline master..HEAD
git diff --stat master...HEAD
git status --short
```

Also use the conversation: decisions made, bugs found, tests run and their results, and
who did what (the user, or the AI).

### 2. Map changes to documents

Only touch a document if something it describes changed.

| Document | Update when | What to update |
|---|---|---|
| `docs/progress.md` | Any feature, test, script or risk changed | "Last updated" date; the Summary status table; Done / Next up checklists; Known gaps and risks |
| `README.md` | Setup, commands, env vars, endpoints, scripts or status changed | Status paragraph, setup steps, endpoints table, Troubleshooting table |
| `docs/tradeoffs.md` | A choice was made between options | New numbered section, or extend an existing one; "Last updated" date |
| `docs/prd/0N-*.md` | Implemented behaviour differs from the spec text | Spec wording, so the PRD matches the decided behaviour |
| `docs/prd/README.md` | A PRD's status changed | PRD status table |
| `docs/agenda-grocerybuddy-building-with-ai.md` | AI-workflow events: AI errors, decisions, commitments, new tools | "Updated" date, features table, issues table, bug write-ups, next steps, session map |
| `devlog/*.csv` | Every session | Follow step 5 |

Conventions per document:

- **progress.md** status key is ✅ done · 🟡 partial / unverified · ⬜ not started. Mark ✅
  only when it was verified (tests ran green, or the user confirmed). Otherwise use 🟡 and say
  what is unverified. Keep the Summary table and the checklists saying the same thing.
- **tradeoffs.md** sections use: Context, Decision (or "Why X Was Chosen"), Options
  Considered (each with why it was rejected or deferred), Cons & Considerations for Later.
- **PRDs**: change spec text to match a decision the user already made. If the code
  contradicts a PRD and no decision was made, do not edit the PRD; list it as an open
  inconsistency and ask.
- **Function docstrings** (Python in `api/`): a one-line summary of what the function
  decides or produces, citing the PRD section it implements. Then `Args:`, one entry per
  parameter, and `Returns:`, stating the exact condition or value and any related value it
  does *not* produce. Use glossary terms and the code's constant names. Example:

  ```python
  def is_due(trend: Trend, now: datetime) -> bool:
      """Whether an Item is due enough to be suggested for re-purchase (PRD 02 §4a).

      Args:
          trend: The Item's `item_trend`: `inclusion_count`, `cadence_days` and
              `last_included_at`.
          now: The time to measure from (UTC, or naive treated as UTC).

      Returns:
          True when the Item has at least `MIN_INCLUSIONS` Inclusions, a known positive
          Cadence, and `days_since >= DUE_FRACTION * cadence_days`. Otherwise False.
          This only decides whether the Item is shown; its ranking score comes from
          `Trend.calculate_score`.
      """
  ```
- **Agenda**: credit work accurately. Say when the user wrote the spec and the AI wrote the
  code. For each bug, give root cause and prevention. Review the previous "commitment"
  honestly (kept, partly kept, not kept). After editing, note that
  `docs/GroceryBuddy-Building-with-AI.docx` and `.pdf` are now out of date; do not edit them.

### 3. Run the consistency checks

These are the drift patterns this repo has had. Check each one against the current files:

- [ ] README commands match `scripts/startup.sh`, `scripts/test.sh` and `.gitignore`
      (for example the virtualenv folder name).
- [ ] README says how `.env` is loaded the same way `api/db.py` does it (read the code,
      not the `.env` file).
- [ ] README endpoints table matches the routes in `api/api.py`.
- [ ] progress.md Summary table agrees with its Done / Next up checklists.
- [ ] Terms renamed in code are renamed in docs. Grep for the old term, e.g.
      `rg -n "same-day|UTC calendar" docs README.md`.
- [ ] Test counts quoted in docs match the latest real run. If no run happened this
      session, don't quote a new number.
- [ ] Files that docs say are tracked actually are (`git ls-files <path>`), e.g. `.env.example`.
- [ ] Public functions added or changed in `api/` this session have docstrings in the
      Function docstrings format above.

Fix what the session's changes cover. List anything else as open in the report.

### 4. Show the plan, then edit

Give a short list of planned edits per file. Then apply them, keeping each document's
existing structure, headings and voice. Use absolute dates (2026-10-28), not "today".

### 5. Devlog

Read and follow `.cursor/rules/devlog.mdc` exactly. Propose the rows as a table and wait
for the user to confirm before writing. Never edit existing rows in `events.csv`.

### 6. Report

Lead with what was updated, one line per file. Then list:
- inconsistencies found but not fixed, and why;
- docs that may now be stale but were not edited (exports, other branches).

## Rules

- Do not invent work, test results, or verification that did not happen.
- Do not mark anything done because the AI said it was done; it needs evidence.
- Do not change product goals, scope or PRD priorities without the user's decision.
- Prefer editing an existing section over adding a new one.
- Test files (`api/tests/`, `src/**/*.test.ts(x)`, `src/setupTests.ts`) are read-only for
  this skill. Edit one only after the user explicitly allows that specific change in this
  session. When a doc or docstring fix seems to need a test change, list the file and the
  change in the report and ask.
- `.env` and any `.env.*` holding real values are closed to this skill: no reading, printing,
  sourcing or grepping them, until the user explicitly authorizes it in this session. Learn
  env var names and loading from `api/db.py`, `scripts/` and the tracked `.env.example`; check
  presence with `git ls-files` or `test -f`. If a doc needs a real value, ask the user.
