# PRD 01 — Core Item Tracking

> Status: Draft v0.1 · Goals: G1, G2 · Depends on: — · Index: [`README.md`](./README.md)
> Portfolio v1: **BUILD** (foundation)

---

## 1. Background & Problem

This is the foundation the rest of the platform reads from. The existing app already does
grocery lists + flyer price comparison; this PRD formalizes the **data model and behavior**
for tracking what a user needs and what they consume, so later PRDs (recommenders,
nutrition) have a clean substrate to build on.

No AI here. The value is a reliable, well-modeled record of *items needed* and *items
consumed*, plus the consumption trends derived from them.

## 2. Goals

| ID | Goal |
|----|------|
| G1 | Track items **needed** (shopping list) |
| G2 | Spot **trends** in items consumed that will be consumed again |

### Non-goals

- Generating recommendations (PRD 02).
- Photo capture / nutrition (PRD 03).
- Any plugin/framework abstraction (PRD 04).

## 3. Users & Stories

- As a shopper, I maintain a list of items I need, and check them off.
- As a shopper, I record items I've consumed/purchased (manually or via cart events).
- As a shopper, the app surfaces items I consume on a cadence as "likely needed again."

## 4. Functional Requirements

| ID | Requirement | Goal |
|----|-------------|------|
| F1 | Create/edit/delete a **needed-items list**; check items off | G1 |
| F2 | Multiple named lists per user (reuses existing `GroceryList` shape) | G1 |
| F3 | Record a **list-inclusion event** every time an item is added to a list (timestamp) | G2 |
| F4 | Maintain per-item **inclusion history + count** across lists/sessions | G2 |
| F5 | (Optional) record a purchase/consumption event when checkout data exists | G2 |
| F6 | Compute **trend signal** per item: inclusion frequency + recency + "due" estimate | G2 |
| F7 | Expose tracking data as **signals** (`needed_items`, `list_inclusion_history`, optional `purchase_history`) for later PRDs | G1, G2 |

## 5. Data Model

Relational (Postgres). Extends today's `Item` / `GroceryList` shapes.

```
user(id, ...)
needed_item(id, user_id, list_id, name, checked, created_at)
grocery_list(id, user_id, title)                       -- existing shape, persisted
list_inclusion(id, user_id, item_name, list_id, included_at)   -- one row per add-to-list
purchase_event(id, user_id, item_name, product_ref?, occurred_at)   -- optional (checkout)
item_trend(item_name, user_id, inclusion_count, cadence_days, last_included_at, next_due_at)  -- derived
```

Notes:
- `list_inclusion` is the **primary, always-available** signal (the existing app produces
  it). `purchase_event` is **optional enrichment** that only exists with checkout data.
- `list_inclusion` and `purchase_event` are **immutable** truth; `item_trend` is
  **derived/recomputable**.
- `item_name` is the join key for now; a canonical product/food id can be introduced later
  (PRD 03/04) without breaking this model.

## 6. Signal Contracts (consumed by later PRDs)

These are the first entries in the shared signal substrate (formalized in PRD 04):

```
needed_items:          [ { item_name, list_id, checked } ]
list_inclusion_history: [ { item_name, list_id, included_at } ]   -- primary re-purchase signal
purchase_history:      [ { item_name, occurred_at } ]            -- optional (checkout only)
```

## 7. Non-Functional

- List reads/writes feel instant (<300ms perceived).
- Trend computation runs incrementally on new list inclusions (no full recompute per read).

## 8. Success Metrics

- % of users maintaining at least one active list.
- Trend "due" precision: when we say an item is due, was it actually re-acquired?

## 9. Open Questions

- Canonical product identity: stay string-keyed (`item_name`) in v1, or introduce a
  product/food id now? (Leaning string-keyed for v1; revisit in PRD 03.)
- Inclusion definition: count an add-to-list, a check-off, or both as an inclusion event?
  (v1: add-to-list.)
- Optional purchase events: only if/when receipt/cart integrations exist.
