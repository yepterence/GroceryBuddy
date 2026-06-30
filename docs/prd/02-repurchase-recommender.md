# PRD 02 — Re-purchase Recommender (Reference Module)

> Status: Draft v0.1 · Goals: G3 · Depends on: PRD 01 · Index: [`README.md`](./README.md)
> Portfolio v1: **OPTIONAL** (nice third module if time allows)

---

## 1. Background & Problem

This is the **first, concrete recommender**, built standalone and hardcoded — deliberately
**not** generic. Its purpose is twofold:

1. Deliver real value (G3): suggest items the user should re-buy.
2. Serve as the **reference implementation** that PRD 04 generalizes into a framework.
   We build one real recommender first, then extract the abstraction from it
   (concrete-then-extract) so the framework is shaped by reality, not a guess.

It depends only on tracking data (PRD 01), **not** nutrition — so it can ship before the
AI capture loop (PRD 03).

## 2. Goals

| ID | Goal |
|----|------|
| G3 | Recommend items for **re-purchase** |

### Non-goals

- Any plugin contract / registry / shared substrate (that's PRD 04 — but this module's
  shape should anticipate it).
- Nutrition- or taste-aware recommendations.

## 3. User Stories

- As a shopper, I see a "re-purchase" list generated from my history, one tap to add to a list.
- As a shopper, each suggestion tells me **why** ("you buy oat milk ~weekly; last added 9
  days ago").

## 4. Algorithm (spec'd end-to-end)

Inputs (signals from PRD 01): `purchase_history`, `needed_items`.

**Step 1 — per-item cadence.** For each `item_name` with N>=2 purchase events, compute the
median inter-purchase interval `cadence_days` and the standard deviation.

**Step 2 — due score.** Let `days_since = now - last_occurred_at`.

```
due_ratio = days_since / cadence_days
score     = clamp(due_ratio, 0, 1.5) / 1.5      # 1.0 ≈ exactly due, >1 overdue
```

**Step 3 — eligibility / filters.**
- Require `N >= 2` events (else no cadence; skip).
- Skip items already present & unchecked in `needed_items` (don't recommend what's already
  on the list).
- Optionally require `due_ratio >= 0.7` to avoid premature suggestions.

**Step 4 — emit.** Produce a recommendation per surviving item, sorted by `score` desc.

```
recommendation = {
  type: "repurchase",
  payload: { item_name, last_occurred_at, cadence_days, next_due_at },
  reason: "You buy {item} about every {cadence_days}d; last added {days_since}d ago.",
  score: <0..1>
}
```

> Note: the `{type, payload, reason, score}` shape is intentionally identical to what PRD
> 04 will standardize. This module just hardcodes it.

## 5. Functional Requirements

| ID | Requirement |
|----|-------------|
| F1 | Compute per-item cadence from `purchase_history` |
| F2 | Generate scored re-purchase suggestions per the algorithm above |
| F3 | Exclude items already on an active list |
| F4 | Surface suggestions in the UI with a one-tap "add to list" action |
| F5 | Record acceptance (added? dismissed?) as an outcome signal for later ranking/training |

## 6. Data Model

```
recommendation(id, user_id, type='repurchase', payload_json, reason, score, created_at)
recommendation_outcome(id, recommendation_id, action, occurred_at)   -- accepted/dismissed
```

(The shared `recommendation` table is introduced here and reused by PRD 04.)

## 7. Non-Functional

- Recompute on new purchase events or on a daily schedule; cache the feed.
- Cold start: user with <2 events gets no re-purchase suggestions (graceful empty state).

## 8. Success Metrics

- **Acceptance rate**: % of re-purchase suggestions added to a list.
- **Precision of "due"**: of accepted items, were they genuinely needed (not duplicates)?
- False-positive rate (dismissed suggestions).

## 9. Open Questions

- Cadence model: median interval is the v1 choice; revisit with a survival/hazard model if
  precision is poor.
- Should accepted suggestions auto-create a `purchase_event` on next checkout to close the
  loop?
