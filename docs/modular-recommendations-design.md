# Design Draft: Modular Recommendation Framework

> Status: Draft v0.1 (technical design)
> Companion to: `docs/prd/04-recommendation-framework.md` (product requirements). This doc
> focuses on **how** the modular recommender layer is built so the app can be extended for
> new purposes (recipes, kids' food, restaurant-style cooking, taste-matched suggestions, ...).

---

## 1. Goal of this draft

Make recommendations **modular and extensible**: the app should not be "a grocery app"
but a platform where a new recommendation type can be added as a **plugin** without
touching capture, storage, or other recommenders.

The defensible idea: all of the requested recommenders are the *same shape* — read shared
signals, emit recommendations. So we build **one framework** and ship each recommender as
a module over it.

---

## 2. Core abstractions

Three pieces: the **signal substrate** (inputs), the **Recommender contract** (modules),
and the **recommendation feed** (output + ranking).

```
 signal substrate  --->  [ Recommender M1..Mn ]  --->  ranking/merge  --->  feed
   (shared inputs)         (plugins, registered)        (dedupe+score)      (client)
```

### 2.1 Recommender contract

Every module implements the same interface:

```python
from typing import Protocol

class Recommender(Protocol):
    type: str                 # unique id: "flyer", "repurchase", "recipe", ...
    consumes: set[str]        # signal keys it reads, e.g. {"food_log", "nutrition"}

    def is_eligible(self, ctx: "SignalContext") -> bool:
        """Cheap check: does this user have enough signal for this module to run?"""

    def recommend(self, ctx: "SignalContext") -> list["Recommendation"]:
        """Pure function of signals -> recommendations. No side effects."""
```

Rules:
- `recommend` is **pure** (no writes); persistence is handled by the framework.
- A module only reads signals it declared in `consumes` (enforced by the context view).
- Modules never call each other; they only share data via the substrate.

### 2.2 SignalContext (read-only view over the substrate)

```python
class SignalContext(Protocol):
    user_id: str
    def get(self, signal: str) -> Signal: ...   # raises if signal not in module.consumes
```

This is what decouples modules from storage: a module asks for `ctx.get("nutrition")`
and doesn't care whether it came from Postgres, a cache, or a feature view.

### 2.3 Recommendation (single shared output type)

```python
@dataclass
class Recommendation:
    type: str            # which module produced it
    payload: dict        # type-specific body (a product, a recipe, a store, ...)
    reason: str          # human-readable "why" shown in UI
    score: float         # 0..1 for ranking across modules
```

One shared type + one shared table is what makes adding a module **zero-schema-change**.

### 2.4 Registry + runner

```python
REGISTRY: list[Recommender] = []

def register(rec: Recommender) -> None:
    REGISTRY.append(rec)

def run_recommenders(ctx: SignalContext) -> list[Recommendation]:
    out = []
    for rec in REGISTRY:
        if ctx.has_all(rec.consumes) and rec.is_eligible(ctx):
            out.extend(rec.recommend(ctx))
    return rank_and_merge(out)
```

Adding module #7 = write a class + `register(...)`. Nothing else changes.

### 2.5 Ranking / merge layer

- Collects outputs from all eligible modules.
- De-duplicates (same product/recipe suggested by two modules -> keep highest score,
  merge reasons).
- Normalizes scores across modules and returns a single ordered feed.
- Optional: per-user diversity/quotas so one chatty module can't dominate.

---

## 3. Signal substrate

Normalized, read-only feature layer so modules don't re-derive data.

| Signal key | Produced by | Consumed by |
|------------|-------------|-------------|
| `list_inclusion_history` | core tracking (add-to-list) | M2 |
| `food_log` | capture loop | M3, M6 |
| `nutrition` | nutrition mapping | M3 |
| `needed_items` | shopping list | M1, M2 |
| `purchase_history` | optional checkout events | M2 (enrichment), M6 |
| `location` | user profile | M1 |
| `flyer_data` | existing scraper | M1 |
| `restaurant_visits` | user input / integrations | M6 |
| `taste_profile` | derived from likes/corrections/visits | M5, M6 |
| `inventory` | what user has on hand | M3, M4 |
| `kitchen_profile` | utensils & cooking methods | M4 |

---

## 4. The six modules (draft specs)

> Renumbered M1–M6 by dependency order. M1 already exists in the codebase; M2/M3 depend
> on the AI capture loop; M4–M6 are later extensions. M4 is tentative.

### M1 — Nearest store / flyer-price (original app purpose)
- **consumes**: `needed_items`, `location`, `flyer_data`
- **logic**: for each needed item, find stores/flyers with matching items + price; rank by
  price and proximity.
- **status**: **already exists** — wrap `api/scraper.py` (`get_price_dict`) / the
  `/get-prices` endpoint as a `Recommender`. Mostly an adapter.
- **payload**: `{ item, store, price, brand }`

### M2 — Re-purchase from list-inclusion frequency (trend spotting)
- **consumes**: `list_inclusion_history` (primary), `needed_items`; optional `purchase_history`
- **logic**: count how often an item has been included in a list (`inclusion_count`) and
  combine that habit strength with recency/cadence; when a frequently-included item is
  "due," recommend re-purchase. Needs no checkout/nutrition data.
- **payload**: `{ item, inclusion_count, last_included_at, next_due_at }`
- **reason**: "You've added oat milk to a list 6x; last time 8 days ago."

### M3 — Recipe by nutrient need
- **consumes**: `nutrition` (today's gaps), `inventory`
- **logic**: compute nutrient gap (target - consumed); find recipes whose ingredients
  best fill the largest gaps, biased toward `inventory` to reduce shopping.
- **payload**: `{ recipe, fills_gaps: [nutrient...], missing_ingredients: [...] }`
- **note**: missing ingredients can feed back into M1 for price-matched shopping.

### M4 — Kids' food *(tentative / later)*
- **consumes**: `inventory`, `kitchen_profile`
- **logic**: recommend kid-friendly meals constrained by available items and feasible
  cooking methods/utensils.
- **payload**: `{ recipe, uses_inventory: [...], method }`
- **open question**: source of "kid-friendly" labeling.

### M5 — Restaurant-style cooking at home
- **consumes**: external recipe sources, `taste_profile`
- **logic**: derive "fancy"/restaurant-style recipes from the internet; present to user;
  **user classifies which recipes they liked** -> writes back into `taste_profile`.
- **payload**: `{ recipe, source_url, est_difficulty }`
- **feedback loop**: likes/dislikes are a first-class signal (see section 6).
- **risk**: recipe licensing / ToS / attribution for scraped content.

### M6 — Taste-matched (k-nearest neighbor)
- **consumes**: `restaurant_visits`, `taste_profile`, region
- **logic**: build a taste embedding from restaurants frequented + likes; kNN to recommend
  items/recipes that are **in-taste**, plus adjacent **out-of-taste-but-same-region**
  options for discovery.
- **payload**: `{ item_or_recipe, similarity, region }`
- **cold start**: no restaurant history -> fall back to region-level popularity.

---

## 5. Data model touchpoints

The framework needs only one new shared table; signals come from existing/PRD tables.

```
recommendation(
  id, user_id,
  type,           -- "flyer" | "repurchase" | "recipe" | "kids" | "restaurant" | "taste"
  payload_json,   -- module-specific body
  reason,         -- human-readable
  score,          -- 0..1
  created_at
)
```

- **Single discriminated table** for all modules = adding a module is zero-schema-change.
- Recommendations are **derived/recomputable** — safe to regenerate when signals/models
  improve.
- Taste/dedup may later use `embedding(subject_type, subject_id, vector)` (see PRD).

---

## 6. Feedback loops (what makes the modules improve)

- **M5 likes/dislikes** -> `taste_profile` -> sharpens M5 and M6.
- **Recommendation accepted? added to list? purchased?** -> stored as outcome signals ->
  rank/merge weighting + future training data.
- **Correction deltas from the capture loop** -> better `food_log`/`nutrition` -> better
  M2/M3/M6 inputs.

These are the same "data flywheel" pairings described in the PRD, now consumed by the
recommender layer.

---

## 7. How to add a new recommender (the extension recipe)

1. Implement a class satisfying `Recommender` (`type`, `consumes`, `is_eligible`,
   `recommend`).
2. If it needs a new input, add it to the **signal substrate** (one feature view).
3. `register(MyRecommender())`.
4. (Optional) add UI handling for the new `type` in the recommendation feed.

No changes to capture, storage schema, ranking, or other modules.

---

## 8. Open questions / risks

- **Score normalization across heterogeneous modules** (price vs nutrition vs taste) —
  needs a comparable 0..1 scale and possibly per-module calibration.
- **M3 nutrient-gap -> purchasable ingredient -> SKU** mapping is the fuzziest piece;
  likely Open Food Facts barcode tags joined to scraped flyer products.
- **M5 internet recipe sourcing**: licensing/attribution.
- **M6 cold start** and taste-embedding construction.
- **Module explosion**: enforce diversity quotas so the feed stays useful.
