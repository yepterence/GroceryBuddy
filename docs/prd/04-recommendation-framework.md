# PRD 04 — Recommendation Framework

> Status: Draft v0.1 · Goals: G5 · Depends on: PRD 01, 02, 03 · Index: [`README.md`](./README.md)
> Technical companion: [`../modular-recommendations-design.md`](../modular-recommendations-design.md)

---

## 1. Background & Problem

PRD 02 ships one concrete recommender. This PRD **generalizes it into a plugin framework**
so the app stops being "a grocery app" and becomes a platform: new recommendation types are
added as modules without touching capture, storage, or other modules.

This PRD deliberately **owns the two hardest unsolved problems** identified in design
review, because you should only solve them once you have a real recommender (PRD 02) to
generalize from:

1. **Signal-schema contracts** — the typed interface between producers and recommenders.
2. **Cross-module score normalization** — making a price rec, a recipe rec, and a taste rec
   comparable in one ranked feed.

## 2. Goals

| ID | Goal |
|----|------|
| G5 | Provide a **modular recommendation framework** (recommenders as plugins) |

### Non-goals

- Building M4/M5/M6 here (exploratory; see README). This PRD must make them *cheap to add*,
  not add them.

## 3. Scope

- The `Recommender` contract, `SignalContext`, registry, and ranking/merge layer
  (full technical detail in the companion design doc).
- The **signal substrate**: typed schemas for every signal, sourced from PRD 01 & 03.
- Wrap the existing flyer scraper (`api/scraper.py` / `/get-prices`) as module **M1**.
- Re-implement PRD 02's re-purchase logic as module **M2** behind the contract (proving the
  generalization is faithful).
- Add **M3** (recipe by nutrient gap) using PRD 03's `nutrition` signal.

## 4. The two hard problems (must be designed, not deferred)

### 4.1 Signal-schema contracts

Each signal has a versioned, typed schema. Recommenders declare `consumes` and only receive
those signals. Draft schemas (consolidated from PRD 01/03):

```
needed_items:     [ { item_name, list_id, checked } ]
purchase_history: [ { item_name, occurred_at } ]
food_log:         [ { food_id, name, grams, consumed_at } ]
nutrition:        { date, targets: {nutrient: amount}, consumed: {...}, gaps: {...} }
location:         { lat, lng, postal_code }
flyer_data:       [ { store, item, price, brand, valid_to } ]
inventory:        [ { item_name, qty } ]        # later
taste_profile:    { embedding: [...], liked: [...], disliked: [...] }   # later
```

A signal registry validates shapes so a producer change can't silently break a recommender.

### 4.2 Cross-module score normalization

Heterogeneous modules must emit comparable scores. Approach:

1. Each module emits a **raw, in-module score** plus a `confidence`.
2. The framework applies **per-module calibration** (map raw scores to a 0–1 distribution
   using historical acceptance, so a "0.8" means the same likelihood-of-acceptance across
   modules).
3. A **weighted blend** (per-user, tunable, later learnable) combines calibrated score ×
   module weight × confidence.
4. **Diversity quota** in merge so one chatty module can't dominate the feed.

This is explicitly the highest-risk component; v1 can start with fixed module weights and
acceptance-based calibration, then move to a learned ranker.

## 5. Functional Requirements

| ID | Requirement |
|----|-------------|
| F1 | Define `Recommender` contract (`type`, `consumes`, `is_eligible`, `recommend`) |
| F2 | Implement `SignalContext` read-only view enforcing `consumes` |
| F3 | Registry: add a module via class + `register(...)`, zero schema change |
| F4 | Ranking/merge: calibration + weighted blend + de-dupe + diversity |
| F5 | Persist all module outputs to the shared `recommendation` table (discriminated by `type`) |
| F6 | Wrap flyer scraper as **M1**; port PRD 02 as **M2**; add **M3** |
| F7 | Record `recommendation_outcome` (accepted/dismissed/purchased) to feed calibration |

## 6. Data Model

Reuses PRD 02's shared tables; adds the signal/embedding layer.

```
recommendation(id, user_id, type, payload_json, reason, score, created_at)   -- shared
recommendation_outcome(id, recommendation_id, action, occurred_at)
embedding(id, subject_type, subject_id, vector)    -- dedup/novelty/taste (M6 later)
```

Single discriminated `recommendation` table = adding a module is zero-schema-change.

## 7. Extensibility Acceptance Criterion

Adding a new recommender must require: (1) a new class implementing the contract, (2)
optionally a new signal view, (3) one `register(...)` call, (4) optional UI handling for the
new `type` — and **no** changes to capture, storage schema, ranking, or other modules. If a
new module forces changes elsewhere, the framework has failed this PRD.

## 8. Non-Functional

- Recommendation feed loads < 2s; module runs are cached and recomputed on signal change or
  schedule.
- A failing/ slow module is skipped gracefully (never breaks the feed).
- Cost: bound per-user recommender compute; cache aggressively.

## 9. Success Metrics

- Acceptance rate **per module** and overall.
- Time-to-add-a-module (proxy for the extensibility goal): should be small and not require
  core changes.
- Feed diversity / no single-module domination.

## 10. Open Questions / Risks

- Score normalization is the make-or-break component (section 4.2).
- M3 nutrient-gap → purchasable SKU mapping (likely Open Food Facts barcode tags joined to
  scraped flyer products).
- `recommend()` purity: M5/M6 imply external IO; may need an async/pre-fetch variant of the
  contract — design before those modules land.
