# Architecture & Implementation Trade-offs

Last updated: 2026-10-28.

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

## 2. Same-Day vs. Per-List Addition Cadence

### Context
A user may add the same item to multiple lists on the same day (or re-add it while reorganizing lists).

### Decision for v1
- **`list_inclusion` (immutable log):** Records every raw item addition across lists as-is.
- **`item_trend` (derived cadence):** Collapses multiple additions of the same item on the **same UTC calendar day** into a single daily inclusion when computing `inclusion_count` and `cadence_days`.
- **Rationale:** Cadence of *addition per list* is different from *re-purchase cadence per day*. Without same-day deduplication, adding `"milk"` to two lists on the same day produces a `0.0`-day interval that collapses `cadence_days` and triggers premature re-purchase recommendations.

### Considerations for Later
- **User timezone vs. UTC calendar day:** Grouping by UTC date can split a late-evening local shopping session across two UTC dates (or merge two local days). Once user locale/timezone is stored, bucket by the user's local calendar date or a configurable session window (e.g., `< 12h` between additions).
- **Per-list vs. per-household cadence:** If lists represent distinct recurring contexts (e.g., "Costco monthly" vs. "Corner store weekly"), cadence may eventually benefit from list-scoped or store-scoped modeling rather than a single global per-item cadence.
