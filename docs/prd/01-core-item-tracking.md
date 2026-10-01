# PRD 01 — Core Item Tracking

> Status: Draft v0.1 · Goals: G1, G2 · Depends on: — · Index: [`README.md`](./README.md)
> Portfolio v1: **BUILD**

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
- Price, store, or vendor preference on a list item. Flyer price and "which store covers most of the list" are M1, computed at request time from the existing scraper.
- Quantity on a needed item. It does not feed G2 or the signals below.
- Credentials. Phase 0 has an anonymous tenant id only. See [Production gate](#10-production-gate).

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

One Postgres database. DDL: [`db/schema.sql`](../../db/schema.sql), applied by [`scripts/create-tables.sh`](../../scripts/create-tables.sh).

```
user(id)   -- anonymous tenant key; no email, password, or session
grocery_list(id, user_id, title)
needed_item(id, user_id, list_id, name, checked, created_at)
list_inclusion(id, user_id, item_name, list_id, included_at)
item_trend(user_id, item_name, inclusion_count, cadence_days, last_included_at, next_due_at)
```

`purchase_event(id, user_id, item_name, product_ref?, occurred_at)` stays **out of this schema** until a receipt or checkout source exists.

Notes:

- `user.id` is an unguessable id created on first visit and stored by the client. Every list and item read is filtered by it. It segregates tenants. It does not authenticate the caller. Sending the id is enough to read and write that user's rows.
- **Acquired** is `needed_item.checked`. Checking an item off marks that row done. It does not write a `list_inclusion`.
- `list_inclusion` is an append-only log written when an item is **added** to a list. `included_at` is that timestamp. These rows are the frequency tracker (F3, F4). "Placed in cart" in v1 means this add.
- Deleting a list deletes its `needed_item` rows. Inclusion rows stay, with `list_id` set null, so counts survive across lists (F4).
- `list_inclusion` is **immutable** truth. `item_trend` is a **derived, recomputable** cache, updated when a new inclusion lands, so a list read does not rescan history. `cadence_days` and `next_due_at` stay null until a second inclusion makes an interval possible.
- `item_name` is the join key for now; a canonical product/food id can be introduced later (PRD 03/04) without breaking this model.
- No price column and no vendor table. A Flipp price is a per-store, time-bounded observation. M1 ranks coverage from the scraper response at request time. An item with no flyer price does not count toward that store's coverage.

## 6. Signal Contracts (consumed by later PRDs)

These are the first entries in the shared signal substrate (formalized in PRD 04):

```
needed_items:          [ { item_name, list_id, checked } ]
list_inclusion_history: [ { item_name, list_id, included_at } ]   -- primary
purchase_history:      [ { item_name, occurred_at } ]            -- optional
```

Price and store never enter these contracts.

## 7. Non-Functional

- List reads/writes feel instant (<300ms perceived).
- Trend computation runs incrementally on new list inclusions (no full recompute per read).

## 8. Success Metrics

- % of users maintaining at least one active list.
- Trend "due" precision: when we say an item is due, was it actually re-acquired?

## 9. Open Questions

- Canonical product identity: stay string-keyed (`item_name`) in v1, or introduce a product/food id now? (Leaning string-keyed for v1; revisit in PRD 03.)
- Inclusion definition: count an add-to-list, a check-off, or both as an inclusion event? (v1: add-to-list.)
- Optional purchase events: only if/when receipt/cart integrations exist.
- **Production blocker:** authentication (who is calling) and authorization (they may only touch their own `user_id`) must exist before the app is dockerized or treated as production. Phase 0 does not build this. See below.

## 10. Production gate

Phase 0 ships the anonymous `user.id` only. There is no password, email, or session table.

Before Docker or any deployment treated as production:

- Authentication must establish who is calling.
- Authorization must allow a caller to touch only their own `user_id`.
- The foreign keys stay. Production replaces "the client sends an id" with "a session proves this caller owns this id."

This gate is also recorded in the [PRD index](./README.md).
