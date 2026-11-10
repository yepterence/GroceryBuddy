# Item identity is the normalized name, never a merged family

An Item is identified by its name lowercased with runs of whitespace collapsed, so `Milk` and ` milk ` share one history while `2% milk` and `lactose-free milk` stay separate. We rejected exact strings (inconsistent capitalization splits a Shopper's history and stops re-purchase from ever triggering) and a canonical product id now (no catalogue exists until PRD 03). Because Additions are append-only and keyed by this name, changing the rule later means rewriting history, so the rule is deliberately conservative: it only merges spellings, never meanings.

## Consequences

- No synonym list in v1. `2% milk` and `milk` have independent Cadences, which keeps distinctions such as fat content and lactose-free that matter for later nutrition and allergy features.
- The name is normalized once, when an Addition is recorded. History (`list_inclusion.item_name`) and trends (`item_trend.item_name`) store the normalized name; the list row (`needed_item.name`) keeps what the Shopper typed for display. Queries never normalize on the fly. Local data written before this rule is reset (`docker compose down -v`), not migrated.
- When PRD 03 introduces canonical food identity, it adds Labels to an Item (for example family `milk`, attributes `2%` and `lactose-free`). It must not merge existing Items' histories into one; Cadence stays per Item.
- Labels travel with every Suggestion. Re-purchase suggests the Shopper's own Item, so it never chooses a variant. Recommenders that suggest new Items (M3) use Labels to pick one: exclude variants that conflict with a Shopper preference such as an allergy, then prefer the variant the Shopper adds most within that family.
