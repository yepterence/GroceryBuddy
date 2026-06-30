# PRD 02 — Re-purchase Recommender (Reference Module)

> Status: Draft v0.1 · Goals: G3 · Depends on: PRD 01 · Index: [`README.md`](./README.md)
> Portfolio v1: **BUILD (vital)** — derives from list-inclusion data the core app already
> produces; no AI/nutrition dependency

---

## 1. Background & Problem

This is the **first, concrete recommender**, built standalone and hardcoded — deliberately
**not** generic. Its purpose is twofold:

1. Deliver real value (G3): suggest items the user should re-buy.
2. Serve as the **reference implementation** that PRD 04 generalizes into a framework.
   We build one real recommender first, then extract the abstraction from it
   (concrete-then-extract) so the framework is shaped by reality, not a guess.

**Re-purchase is driven by how often an item has been included in a list** — the core
signal the existing grocery app already produces on day one. It needs no purchase/checkout
integration, no AI, and no nutrition. That makes it **vital, not optional**: it is the
most directly available unit of value in the project and a natural, part-and-parcel
extension of core tracking (PRD 01). It can ship immediately after PRD 01 and before the
AI capture loop (PRD 03).

## 2. Goals

| ID | Goal |
|----|------|
| G3 | Recommend items for **re-purchase** |

### Non-goals

- Any plugin contract / registry / shared substrate (that's PRD 04 — but this module's
  shape should anticipate it).
- Nutrition- or taste-aware recommendations.
- Requiring purchase/checkout integration. The primary signal is **list inclusion**;
  actual purchase events are an optional enrichment if/when available.

## 3. User Stories

- As a shopper, I see a "re-purchase" list generated from my history, one tap to add to a list.
- As a shopper, each suggestion tells me **why** ("you buy oat milk ~weekly; last added 9
  days ago").

## 4. Algorithm (spec'd end-to-end)

Primary input (signals from PRD 01): `list_inclusion_history` (every time an item is added
to a list), `needed_items` (current lists). Optional enrichment: `purchase_history` if
checkout data exists.

**Step 1 — inclusion frequency.** For each `item_name`, count how many times it has been
included in a list (`inclusion_count`) and the distinct list/sessions it appeared in. This
count is the core driver: items added repeatedly are habitual re-purchases.

**Step 2 — cadence (recency-aware).** From the inclusion timestamps, compute the median
interval between inclusions, `cadence_days`, and `days_since = now - last_included_at`.
(With only one inclusion, cadence is undefined — see eligibility.)

**Step 3 — score.** Combine *habit strength* (frequency) with *due-ness* (recency):

```
frequency_score = min(inclusion_count / FREQ_NORM, 1)      # e.g. FREQ_NORM = 5 inclusions
due_ratio       = days_since / cadence_days                # 1.0 ≈ due, >1 overdue
due_score       = clamp(due_ratio, 0, 1.5) / 1.5
score           = 0.5 * frequency_score + 0.5 * due_score  # weights tunable
```

**Step 4 — eligibility / filters.**
- Require `inclusion_count >= 2` (a one-off isn't a re-purchase habit).
- Skip items already present & unchecked in `needed_items` (don't recommend what's already
  on the list).
- For items with `inclusion_count >= 2` but no reliable cadence yet, fall back to
  `score = frequency_score` (pure habit strength).

**Step 5 — emit.** Produce a recommendation per surviving item, sorted by `score` desc.

```
recommendation = {
  type: "repurchase",
  payload: { item_name, inclusion_count, last_included_at, cadence_days?, next_due_at? },
  reason: "You've added {item} to a list {inclusion_count}x; last time {days_since}d ago.",
  score: <0..1>
}
```

> Note: the `{type, payload, reason, score}` shape is intentionally identical to what PRD
> 04 will standardize. This module just hardcodes it.

## 5. Functional Requirements

| ID | Requirement |
|----|-------------|
| F1 | Compute per-item `inclusion_count` (+ cadence when available) from `list_inclusion_history` |
| F2 | Generate scored re-purchase suggestions per the frequency + recency algorithm above |
| F3 | Exclude items already on an active list |
| F4 | Surface suggestions in the UI with a one-tap "add to list" action |
| F5 | Record acceptance (added? dismissed?) as an outcome signal for later ranking/training |
| F6 | (Optional) blend in `purchase_history` when checkout data is available |

## 6. Data Model

```
recommendation(id, user_id, type='repurchase', payload_json, reason, score, created_at)
recommendation_outcome(id, recommendation_id, action, occurred_at)   -- accepted/dismissed
```

(The shared `recommendation` table is introduced here and reused by PRD 04.)

## 7. Non-Functional

- Recompute on new list inclusions or on a daily schedule; cache the feed.
- Cold start: user with <2 inclusions of an item gets no suggestion for it (graceful empty state).

## 8. Success Metrics

- **Acceptance rate**: % of re-purchase suggestions added to a list.
- **Precision of "due"**: of accepted items, were they genuinely needed (not duplicates)?
- False-positive rate (dismissed suggestions).

## 9. Open Questions

- Frequency vs recency weighting (the 0.5/0.5 blend) — tune from acceptance data.
- What counts as an "inclusion": adding to a list, checking it off, or both? (v1: add-to-list.)
- Cadence model: median interval is the v1 choice; revisit with a survival/hazard model if
  precision is poor.
- Should accepted suggestions also log a `purchase_event` (when checkout exists) to enrich
  the optional purchase signal?
