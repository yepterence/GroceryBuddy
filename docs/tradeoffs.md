# Architecture & Implementation Trade-offs

Last updated: 2026-10-30.

This document captures deliberate engineering trade-offs made while building GroceryBuddy, why a given option was chosen for the current stage, and what to revisit as usage or scale grows.

---

## 1. `item_trend` Cadence Calculation: Median from `list_inclusion` History (Approach B) vs. Incremental Rolling Mean (Approach A)

### Context
Whenever an item is added to a list (`create_list` or `add_item` in [`api/db.py`](../api/db.py)), the API appends an immutable row to `list_inclusion` and updates the derived `item_trend` row (`inclusion_count`, `cadence_days`, `last_included_at`, `next_due_at`).

We evaluated two ways to compute `cadence_days` via [`api/trends.py`](../api/trends.py):

- **Approach A (Incremental rolling mean from `item_trend` state):**
  Read only the single existing `item_trend` row and update `cadence_days` incrementally from the previous average and the new interval.
- **Approach B (Exact median from `list_inclusion` history — Chosen):**
  Query the ordered `included_at` timestamps for `(user_id, item_name)` from `list_inclusion` (backed by `list_inclusion_user_item_idx`), collapse same-day additions in Python (`Trend.from_inclusions`), compute the exact **median** interval, and upsert `item_trend`.

### Why Approach B Was Chosen
- **Outlier resistance for recommendations:** Because the median is an order statistic, a single long gap (e.g., a 2-month vacation or forgetting to log groceries) or a one-off extra trip does not skew `cadence_days`. Under a rolling mean, one 60-day gap on a 7-day staple inflates `cadence_days` for weeks and causes the recommender to surface the item far too late.
- **Self-healing cache:** `item_trend` is always a deterministic function of `list_inclusion`, matching PRD 01's "recomputable cache" guarantee and PRD 02's median interval specification.

### Cons & Considerations for Later (Approach B)
1. **Write-time history read grows linearly with per-item inclusions ($O(N)$ per item):**
   - Every call to `update_item_trend(user_id, item_name)` fetches all historical `included_at` timestamps for that `(user_id, item_name)` pair from `list_inclusion` and sorts/processes them in Python.
   - At current scale (even a weekly staple over 2 years is ~100 rows, served by an index-only scan on `list_inclusion_user_item_idx`), the cost is sub-millisecond.
   - **Future mitigation if history grows large:** Bound the query to a sliding window of recent history (e.g., `ORDER BY included_at DESC LIMIT 50`), which both caps write-time work at $O(1)$ and naturally adapts when a household's shopping habits change over time.
2. **Extra SQL round-trip per item during multi-item `create_list`:**
   - Creating a list with $K$ items performs a history lookup + upsert per item inside the transaction.
   - **Future mitigation:** Batch the `list_inclusion` read and `item_trend` upsert across all `item_names` in `create_list` in a single query.

---

## 2. Session Window vs. Calendar Day for Deduplicating Additions

### Context
A user may add the same item to multiple lists in one sitting (or re-add it while reorganizing lists).

### Decision for v1
- **`list_inclusion` (immutable log):** Records every raw item addition across lists as-is.
- **`item_trend` (derived cadence):** Collapses additions of the same item into **sessions** (`SESSION_WINDOW` in [`api/trends.py`](../api/trends.py), 12 hours). An addition joins the current session if it is less than 12 hours after the session's *first* addition; otherwise it starts a new session. Each session counts once toward `inclusion_count` and `cadence_days`, keeping its latest timestamp.
- **Rationale:** Cadence of *addition per list* is different from *re-purchase cadence*. Without deduplication, adding `"milk"` to two lists in one sitting produces a near-`0`-day interval that collapses `cadence_days` and triggers premature re-purchase recommendations.

### Options Considered
- **UTC calendar day (original v1):** Rejected. The UTC date rolls over at 8pm in UTC-4, so additions at 7:58pm and 8:03pm counted as two days with a 5-minute cadence.
- **User's local calendar day:** Deferred. Needs a stored user timezone (a schema change, and there is no migration tool yet), DST/travel handling, and still splits additions across local midnight.
- **Window measured from the previous addition:** Rejected. Additions each under 12 hours apart chain into one unbounded session, so a frequently added item could stay at `inclusion_count = 1` and never be recommended. Measuring from the session start caps a session at 12 hours.
- **24-hour window:** Rejected. It collapses one shopping day, but an item added every day at slightly different times merges about half the time (9am Monday and 7am Tuesday are 22 hours apart). That halves `inclusion_count` and doubles `cadence_days` for items bought daily. 12 hours keeps consecutive days separate.

### Considerations for Later
- **Window size:** Two genuine trips less than 12 hours apart merge. Acceptable while cadences are measured in days; tune `SESSION_WINDOW` from data if needed.
- **Existing rows:** `item_trend` rows computed under the calendar-day rule are corrected the next time that item is added; run `db.update_item_trend` over existing `(user_id, item_name)` pairs to correct them immediately.
- **Per-list vs. per-household cadence:** See section 3 (purpose label on lists).

---

## 3. Interpreting Repeated Additions: Duplicate, Source, and List Purpose

### Context
The same item on several lists can mean three different things:
1. **Duplicate:** the user forgot it was already listed and added it again.
2. **Different source:** it came from a recipe or from an accepted recommendation, not from habit.
3. **Different-purpose list:** e.g. a party list or a monthly Costco list alongside the weekly shop.

The session window (section 2) can't tell these apart, because all three can happen within the same hour.

### Decision for v1
- Every addition counts equally once merged into a session.
- Merging across lists stays: the same item on two lists on the same day is usually one purchase. Where an addition came from should change how much it counts, not whether it merges.

### Options for Later
- **Duplicate flag, recorded when the item is added.**
  - *Signal:* the same `item_name` is already unchecked on one of the user's active lists. The current schema can detect this.
  - *Use:* exclude flagged rows from the habit count. A UI warning ("Milk is already on Weekly") would prevent most duplicates in the first place.
  - *Why at add time:* the evidence is gone once the item is checked off or its list is deleted, and `list_inclusion` is append-only, so it can't be reconstructed later.
- **Source on each inclusion (`manual`, `recipe`, `recommendation`).**
  - *Use:* recipe adds get a lower weight (around 0.3–0.5) or feed the recipe recommender (M3) instead of re-purchase habit.
  - Accepted recommendations count toward cadence like any addition, plus an outcome (PRD 02 F5). Excluding them stalls `last_included_at` for items accepted every cycle. `source` is recorded so they can be down-weighted later ([ADR 0003](./adr/0003-accepted-suggestions-count-toward-cadence.md), decided 2026-11-02).
- **Purpose label on lists.** Enables cadence per context (e.g., Costco every 30 days alongside the corner store every 7) instead of one global per-item cadence.
  - *2026-11-04:* for deciding when to show suggestions, an explicit purpose picker was rejected in favour of an inferred **grocery intent** score from the title and items (PRD 02 §4a), so the Shopper never has to classify a list. Per-purpose cadence is still open.
- **Several metrics instead of one count:** raw adds, sessions (habit), number of distinct lists an item appears on, and duplicate rate. A high duplicate rate is itself a signal that the user forgets what is already listed.
- **Check-offs as a purchase signal.** `needed_item.checked` is the closest thing to "bought"; recording it separately from adds would distinguish "listed" from "bought".

### Considerations
- The source and the list purpose label both need schema changes, and there is no migration tool yet.
- The duplicate flag needs only a new column on `list_inclusion` (plus the add-time check in `api/db.py`).
