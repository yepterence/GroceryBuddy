# PRD 03 — AI Capture + Nutrition (incl. Mobile Capture)

> Status: Draft v0.1 · Goals: G4 · Depends on: PRD 01 · Index: [`README.md`](./README.md)
> Portfolio v1: **BUILD (thin)** — vision LLM (no training), nutrition via Open Food Facts / USDA

---

## 1. Background & Problem

This is the headline AI augmentation: turn **a food photo into structured nutrition data**,
and capture the user's corrections as training-grade data. It also owns the **mobile
capture experience**, because the camera is where "mobile" actually earns its keep
(latency, offline, on-device potential) — so rather than a vague standalone "make it
mobile" PRD, mobile concerns live here, scoped to capture.

The pipeline: `photo -> recognition -> user correction -> portion -> nutrition -> log`.

## 2. Goals

| ID | Goal |
|----|------|
| G4 | Track **nutrition** from food photos to augment recommendations |

### Non-goals (v1)

- Custom-trained vision model (use generic/hosted model or vision LLM first).
- Blood-glucose response prediction (needs CGM; different product).
- On-device inference (start with a backend call; mobile-readiness noted but not required v1).
- Medical/diagnostic claims (framing = wellness/tracking).

## 3. Users & Stories

- As a tracker, I photograph a meal; the app guesses the foods + portion; I confirm/correct
  it; nutrition is logged.
- As a tracker, at end of day I see what nutrients I'm short on.
- As the team, every correction becomes a consented, labeled training example.

## 4. The Pipeline

```
F: capture photo + (optional) metadata
   -> B1 ingest (persist photo to object store, create row, return fast)
   -> B2 recognition (async worker): generic/LLM model -> {items, portion, confidence}
   -> F: show prediction; user confirms/CORRECTS (store delta) + confirms PORTION
   -> B4 nutrition mapping: food + grams -> nutrients (USDA / Open Food Facts)
   -> B5 write log_entry (the journal)
```

Architectural rules:
- **Async recognition** — capture returns immediately; the model runs in a worker so the
  UI never blocks.
- **Raw vs derived** — photo, label, correction are immutable; nutrition values are
  derived/recomputable when models improve.
- **Blobs in object storage**, pointer + metadata in Postgres.
- **Consent in the write path** — training-use consent recorded at upload, granular and
  separable from app function.

## 5. Functional Requirements

### Frontend (mobile capture)
| ID | Requirement |
|----|-------------|
| F1 | Capture/upload photo from camera or library |
| F2 | Add optional label/metadata |
| F3 | Show predicted food(s); let user correct; capture the **correction delta** (predicted vs corrected) |
| F4 | **Portion confirmation** step (size or grams) — the #1 accuracy driver |
| F5 | View daily nutrition summary + gaps |
| F6 | Capture/record training-use consent |

### Backend
| ID | Requirement |
|----|-------------|
| B1 | Ingestion: persist photo to object store + `photo` row, return fast |
| B2 | Recognition (async): generic/LLM model -> `{items, portion, confidence}` |
| B3 | Persist `prediction` + `correction` as a paired record |
| B4 | Nutrition mapping: food + grams -> nutrients (USDA FoodData Central / Open Food Facts) |
| B5 | Write `log_entry`; expose `nutrition` + `food_log` signals |
| B6 | Consent service |

## 6. Data Model

```
photo(id, user_id, object_url, created_at)                 -- pointer, not blob
prediction(id, photo_id, model, items_json, portion, confidence, created_at)
correction(id, prediction_id, corrected_items_json, corrected_portion, was_corrected)
food_item(id, canonical_name, nutrients_per_100g_json)     -- reference table
log_entry(id, user_id, food_id, grams, nutrients_json, consumed_at)   -- the journal
consent(id, user_id, scope, granted, updated_at)
```

`correction` paired with `prediction` is the **training-grade record** — always
captured, never overwritten.

## 7. Signal Contracts (produced for later PRDs)

```
food_log:  [ { food_id, name, grams, consumed_at } ]
nutrition: { date, targets: {...}, consumed: {...}, gaps: {...} }
```

## 8. Non-Functional

- Capture returns < 1s; recognition completes async (seconds).
- Resilience: logging/lists must work even if recognition/nutrition is down.
- Privacy: PII/faces/receipts scrubbed before any training pool; per-user delete/opt-out.
- Cost: recognition (LLM/API) cost per photo is a tracked metric; cache nutrition lookups.

## 9. Success Metrics

- % of logs where user corrected the prediction (model quality + label yield).
- Portion-confirmation completion rate.
- Dataset novelty: % of samples out-of-distribution vs public corpora.

## 10. Open Questions / Risks

- **Portion accuracy** dominates calorie error — how aggressive should the confirmation UX
  be? weight/volume/size of food? 
- Recognition provider: hosted food API vs vision LLM vs (later) own model — cost/latency
  tradeoff.
- Recognition→`food_item` canonicalization (mapping free-text predictions to the reference
  table).
