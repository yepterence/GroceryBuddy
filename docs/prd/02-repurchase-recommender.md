# PRD 02 — Re-purchase Recommender (Reference Module)

> Status: Draft v0.1 · Goals: G3 · Depends on: PRD 01 · Index: [`README.md`](./README.md)
> Portfolio v1: **BUILD (vital)** — derives from list-inclusion data the core app already
> produces; no AI/nutrition dependency

---

## 1. Background & Problem

This is the **first, concrete recommender**, built standalone and hardcoded. Its purpose is twofold:

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

- As a shopper building a grocery list, I see items I'm due to re-buy and add one to that list with one tap.
- As a shopper, after a one-tap add I see where it went ("Added to Weekly shop").
- As a shopper, each suggestion tells me **why** ("you buy oat milk ~weekly; last added 9
  days ago").

## 4. Algorithm (spec'd end-to-end)

Primary input (signals from PRD 01): `list_inclusion_history` (every time an item is added
to a list), `needed_items` (current lists). Optional enrichment: `purchase_history` if
checkout data exists.

**Step 1 — inclusion frequency.** For each `item_name`, count how many times it has been
included in a list (`inclusion_count`) and the distinct list/sessions it appeared in. This
count is the core driver: items added repeatedly are habitual re-purchases.

**Step 2 — cadence (recency-aware).** From the inclusion timestamps (deduplicated into sessions: additions within 12 hours of a session's first addition count as one, so adding the same item to multiple lists in one sitting is a single addition; see [`../tradeoffs.md`](../tradeoffs.md)), compute the median interval between inclusions, `cadence_days`, and `days_since = now - last_included_at`.
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
- Skip **Open items**: items unchecked on any of the Shopper's lists (don't recommend what's
  already on a list). Lists have no active/closed state; see [`../../GLOSSARY.md`](../../GLOSSARY.md).
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

## 4a. When suggestions are shown and hidden (decided 2026-11-04)

**Where.** Inside a list while it is being built (the create form, before it is saved) and on
saved lists. Never as a standalone feed.

**When.** Only once the list shows enough **grocery intent**, recomputed as each Item is added,
so a party or event list does not get milk suggestions. PoC rule (word lists and thresholds
kept in one place so they can be tuned):

- **Title signal:** a grocery word in the title (`grocery`, `groceries`, `weekly`, `shop`,
  `market`, `food`, `costco`) shows suggestions. An event word (`party`, `bbq`, `birthday`,
  `potluck`, `christmas`) always hides them.
- **Item signal:** with at least 2 Items on the list, show suggestions when at least half of
  them are Items the Shopper has added before.

**Computed where.** The list opens with one `GET /recommendations/repurchase?user_id=`, which
returns the due suggestions (dismissals already applied) and the Shopper's known Item names.
The browser scores intent locally as Items are added. The score is not stored on saved lists;
it is recomputed when a list is shown.

**How many.** At most 5, highest score first, and only Items that are due: `days_since >= 0.8 ×
cadence_days`. Tune the 0.8 and the 5 from acceptance data.

**Dismissals.** Stored as an outcome on the suggestion the Shopper saw. A dismissed Item is
not suggested again until the Shopper adds it to a list themselves (its next Inclusion).
Dismissal is a clear "no"; the way back is the Shopper's own add, or later a price offer (F7).

**Accepting.** In the create form a tap adds the Item to the draft; on save each Item is sent
with its `source`, so `POST /lists` takes `items: [{name, source}]`.

## 5. Functional Requirements

| ID | Requirement |
|----|-------------|
| F1 | Compute per-item `inclusion_count` (+ cadence when available) from `list_inclusion_history` |
| F2 | Generate scored re-purchase suggestions per the frequency + recency algorithm above |
| F3 | Exclude Open items (unchecked on any of the Shopper's lists) |
| F4 | Surface suggestions **inside the list the Shopper is building** (the create form, and saved lists), once the list's **grocery intent** is high enough (§4a). One tap adds the item to that same list and confirms it with a banner: "Added to {list title}", or "Added to this list" when untitled (decided 2026-11-03/04) |
| F5 | Record acceptance (added? dismissed?) as an outcome signal for later ranking/training. An accepted suggestion **does** count toward cadence like any addition, tagged `source = suggestion` so it can be down-weighted later ([ADR 0003](../adr/0003-accepted-suggestions-count-toward-cadence.md)) |
| F6 | (Optional) blend in `purchase_history` when checkout data is available |
| F7 | (Later, after flyer matching, auth and mobile) When a dismissed item appears in this week's flyer, offer it again with the price as the reason, optionally as a notification |
| F8 | (Later) Re-rank suggestions on the server as the draft list changes, instead of the PoC's single fetch when the list opens |

## 6. Data Model

```
recommendation(id, user_id, type='repurchase', payload_json, reason, score, created_at)
recommendation_outcome(id, recommendation_id, action, occurred_at)   -- accepted/dismissed
```

(The shared `recommendation` table is introduced here and reused by PRD 04.)

Suggestions are **computed on read** from `item_trend` (`GET /recommendations/repurchase?user_id=`, shape in §4a).
A `recommendation` row is written only when the Shopper accepts or dismisses a suggestion, so
every outcome points at exactly what they saw. Decided 2026-11-02.

`list_inclusion` gains `source` (`manual` | `suggestion`) per ADR 0003.

## 7. Non-Functional

- `item_trend` is updated on each new Addition; suggestions are computed from it on read (no cached feed).
- Cold start: user with <2 inclusions of an item gets no suggestion for it (graceful empty state).

## 8. Success Metrics

- **Acceptance rate**: % of re-purchase suggestions added to a list.
- **Precision of "due"**: of accepted items, were they genuinely needed (not duplicates)?
- False-positive rate (dismissed suggestions).

## 9. Open Questions

- Frequency vs recency weighting (the 0.5/0.5 blend) — tune from acceptance data.
- What counts as an "inclusion": adding to a list, checking it off, or both? (v1: add-to-list.)
  Check-offs (`needed_item.checked`) are a candidate purchase signal, kept separate from adds.
- How should duplicate, recipe-sourced and recommendation-sourced additions be weighted?
  Options and the signals each needs are in [`../tradeoffs.md`](../tradeoffs.md) §3.
- Cadence model: median interval is the v1 choice; revisit with a survival/hazard model if
  precision is poor.
- Should accepted suggestions also log a `purchase_event` (when checkout exists) to enrich
  the optional purchase signal?
- F3 uses Open items, not "active lists" (decided 2026-11-02). An item left unchecked after
  it was bought stays Open and blocks its own recommendations indefinitely. See §10.

## 10. Deferred: Handling Missed Check-offs

> Status: later feature, not in v1. Build order decided 2026-10-31.

### Problem

Users often grab an item without checking it off. Two effects:

- **Cadence is unaffected.** `item_trend` is computed from additions to a list, not
  check-offs, so the next add of the item still lands correctly.
- **F3 is affected.** The forgotten item stays unchecked, so it counts as "already on an
  active list" and its re-purchase suggestion is suppressed until the user cleans up.

Check-offs are therefore a useful but unreliable purchase signal. This feature closes the
gap with low-friction confirmations, then inference.

### Phases (in build order)

1. **End-of-trip prompt (batch).** When most of a list is checked off, or the user returns
   to a list after a gap, ask once: "Mark the N remaining items as bought?" with
   **All** / **Choose** / **None**. One prompt per trip, never per item.
2. **Re-add prompt.** When an item is added while an unchecked copy is still on another
   list, ask: "Milk is still on *Weekly* from Oct 21. Did you buy it?" with
   **Yes, bought it** (resolve the old copy as purchased) / **No, move it here** (treat the
   new add as a duplicate). This also covers the duplicate case in
   [`../tradeoffs.md`](../tradeoffs.md) §3.
3. **Silent inference.** If a prompt is dismissed or never shown, infer a purchase when an
   unchecked item is re-added after roughly half its `cadence_days`, or has been unchecked
   longer than about 1.5× its cadence (stale). Inferred purchases are labelled as such.

No push notifications for this: per-item "did you buy it?" pings cause prompt fatigue and
worse data than not asking.

### Data model (proposed)

```
purchase_event(id, user_id, item_name, occurred_at, evidence, needed_item_id?)
  evidence: receipt | confirmed_prompt | checked | inferred_readd | inferred_stale
```

Approximate trust order: `receipt` > `confirmed_prompt` > `checked` > `inferred_readd` >
`inferred_stale`. Feeds F6 as the purchase-history enrichment, weighted by `evidence`.
Cadence stays computed from `list_inclusion`. A receipt photo (PRD 03 capture) is a
possible later `receipt` source.

### Open questions

- Thresholds for "most of a list checked" (phase 1) and for staleness (phase 3).
- Whether a resolved-as-purchased item is auto-checked, hidden, or removed from its list.
