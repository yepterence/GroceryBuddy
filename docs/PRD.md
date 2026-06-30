# PRD: AI-Augmented, Modular Grocery & Nutrition Platform

> Status: Draft v0.1
> Owner: (founding eng)
> Supersedes: ad-hoc feature list. This document is the source of truth for scope.

---

## 1. Background & Problem

The existing product ("Grocery Buddy") helps users build grocery lists and compare
prices using scraped store flyer data (`api/scraper.py`, `GET /get-prices`). It works,
but it is **not differentiated** — list + price comparison is a commodity.

The thesis of this PRD is twofold:

1. **Augment** the app with an AI food-tracking loop (photo -> recognized food ->
   nutrition) so the app understands *what users actually eat*, not just what they
   intend to buy.
2. **Modularize** the recommendation layer so the app is no longer "a grocery list
   app" but a **platform**: a shared signal substrate over which many independent
   recommenders (recipes, kids' food, restaurant-style cooking, taste-matched
   suggestions, etc.) can be added without touching the core.

The defensible asset is **not** any single recommender. It is (a) the proprietary,
consented dataset produced by the capture/correction loop, and (b) the **recommender
framework** that lets us ship a new recommendation type as a plugin.

---

## 2. Goals

| ID | Goal | Source |
|----|------|--------|
| G1 | Track items **needed** (shopping list) | original app |
| G2 | Spot **trends** in items consumed that will be consumed again | original app |
| G3 | Recommend items for **re-purchase** | original app |
| G4 | Track **nutritional values** from food photos to augment recommendations | AI augmentation |
| G5 | Provide a **modular recommendation framework** so new recommenders can be added as plugins | extensibility |

### Non-goals (v1)

- Training a custom in-house vision model (use a generic/hosted model or vision LLM first).
- Predicting individual **blood-glucose response** (requires CGM data; different product).
- On-device inference (start with a backend recognition call).
- Medical/diagnostic claims. Framing is wellness/tracking, not medical advice.

---

## 3. Target Users & Personas

- **The tracker** — wants low-friction food journaling and to know what nutrients they
  are missing.
- **The household shopper** — wants a price-optimized, re-stock-aware grocery list.
- **The home cook** — wants recipe ideas that fit what they have, their nutrition gaps,
  and their taste.

---

## 4. User Stories (mapped to goals)

- **G1** As a shopper, I can maintain a list of items I need so I don't forget them.
- **G2** As a shopper, the app notices I buy oat milk ~weekly and surfaces it as
  "likely needed again."
- **G3** As a shopper, I see a "re-purchase" list generated from my consumption history,
  one tap to add to my cart.
- **G4** As a tracker, I photograph a meal; the app guesses the foods and portion, I
  confirm/correct it, and it logs the nutrition. At end of day it tells me I'm low on
  protein and fiber.
- **G4 -> G3/G5** As a tracker, the nutrition gap produces a grocery suggestion ("add
  lentils") that flows into my list and is price-matched against flyer data.
- **G5** As the team, we can add a "kids' food" recommender as a new module without
  changing the capture pipeline, the data model, or other recommenders.

---

## 5. System Overview

```
                +-------------------------------------------------------+
                |                     CLIENTS (web/mobile)              |
                |  capture | correct | journal | lists | recommendations|
                +------------------------------+------------------------+
                                               |
                +------------------------------v------------------------+
                |                       BACKEND SERVICES                |
                |                                                       |
                |  Ingestion -> Recognition -> Correction -> Nutrition  |
                |                                   |                   |
                |                                   v                   |
                |        +--------- SIGNAL SUBSTRATE (feature store) ---+
                |        |  food_log, nutrition, purchases, location,   |
                |        |  flyer_data, restaurant_visits, inventory,   |
                |        |  kitchen_profile, taste_profile              |
                |        +---------------------+------------------------+
                |                              |                        |
                |        +---------- RECOMMENDER FRAMEWORK -------------+
                |        | registry + common Recommendation contract   |
                |        |  [M1 flyer] [M2 repurchase] [M3 recipe]      |
                |        |  [M4 kids]  [M5 restaurant] [M6 taste-kNN]   |
                |        +---------------------+------------------------+
                +------------------------------+------------------------+
                                               |
                +------------------------------v------------------------+
                |  Postgres (metadata/relational) + Object store (blobs)|
                +-------------------------------------------------------+
```

Key architectural principles:

1. **Separate raw/immutable from derived/recomputable.** Photos, user labels, and
   corrections are immutable truth. Nutrition values and recommendations are derived and
   can be recomputed when models improve.
2. **Image bytes live in object storage (S3/GCS); the relational DB stores a pointer +
   metadata.** Never store blobs in the relational DB.
3. **Recognition is asynchronous.** The capture path persists the photo immediately and
   runs recognition in a worker so the UI never blocks on the model.
4. **Recommenders are plugins over a shared substrate.** All recommenders read from the
   same signal store and write to the same `recommendation` schema.

---

## 6. The Recommendation Framework (G5 — the core of modularity)

Every recommender, including the six requested below, implements one contract:

```python
class Recommender(Protocol):
    type: str                       # "repurchase", "recipe", "flyer", ...
    consumes: set[str]              # signals it reads, e.g. {"food_log", "nutrition"}

    def is_eligible(self, user) -> bool:        # has enough signal to run?
    def recommend(self, ctx: SignalContext) -> list[Recommendation]:
        ...
```

- `SignalContext` is a read-only view over the **signal substrate** (section 7).
- `Recommendation` is a single shared record type (section 8) with a `type`, a
  `payload`, a human-readable `reason`, and a `score`.
- Recommenders are discovered via a **registry**; adding module #7 later means adding a
  new class + registering it. No changes to capture, storage, or other modules.
- A **ranking/merge layer** collects outputs from all eligible recommenders and presents
  a unified, de-duplicated, scored feed to the client.

### The six requested recommenders as modules

| Module | Name | Consumes (signals) | Emits | Notes |
|--------|------|--------------------|-------|-------|
| **M1** | Nearest store / flyer-price | `needed_items`, `location`, `flyer_data` | where to buy + price | **Already exists** as `api/scraper.py` / `/get-prices`; wrap it as a recommender. (Original app purpose.) |
| **M2** | Re-purchase from consumption | `food_log`, `purchase_history` | items to re-buy | Trend spotting (G2/G3): frequency + recency. |
| **M3** | Recipe by nutrient need | `nutrition` (gaps), `inventory` | recipes that fill gaps | Maps nutrient gap -> recipes/ingredients. |
| **M4** | Kids' food *(maybe / later)* | `inventory`, `kitchen_profile` (utensils/methods) | kid-friendly meals | Constrained by available items + cooking methods. Marked tentative. |
| **M5** | Restaurant-style at home | external recipe sources, `taste_profile` | "fancy" recipes | Derives recipes from the internet; **user labels which recipes they liked** -> feedback signal. |
| **M6** | Taste-matched (kNN) | `restaurant_visits`, `taste_profile`, region | regionally/taste-aware recs | k-NN over taste embeddings; recommends *in-taste* and adjacent *out-of-taste-but-same-region* items. |

> Numbering note: the request listed these as 3,2,1,4,5,6. They are renumbered M1–M6 by
> dependency order (M1 already exists; M2/M3 depend on the capture loop; M4–M6 are later
> extensions). M4 is explicitly tentative.

---

## 7. Signal Substrate (the shared inputs every module reads)

A normalized feature layer so recommenders don't each re-derive data:

| Signal | Produced by | Used by |
|--------|-------------|---------|
| `food_log` | capture loop (G4) | M2, M3, M6 |
| `nutrition` | nutrition mapping (G4) | M3 |
| `needed_items` | shopping list (G1) | M1 |
| `purchase_history` | list -> cart events (G3) | M2, M6 |
| `location` | user profile | M1 |
| `flyer_data` | existing scraper | M1 |
| `restaurant_visits` | user input / integrations | M6 |
| `taste_profile` | derived from likes/corrections/visits | M5, M6 |
| `inventory` | what user has on hand | M3, M4 |
| `kitchen_profile` | utensils & cooking methods | M4 |

---

## 8. Functional Requirements

### 8.1 Frontend

| ID | Requirement | Goal |
|----|-------------|------|
| F1 | Photo upload from camera/library | G4 |
| F2 | Label / add metadata to a photo | G4 |
| F3 | Show model's predicted food(s) and let user **correct** it; capture the *correction delta* (predicted vs corrected), not just the final label | G4 |
| F4 | **Portion confirmation** step (size or grams) during capture | G4 (accuracy) |
| F5 | Access personal journal / consumption history | G2 |
| F6 | View & manage "items needed" list | G1 |
| F7 | View a unified **recommendation feed** (re-purchase, recipes, etc.) with the human-readable reason for each | G3, G5 |
| F8 | View daily nutrition summary + gaps | G4 |
| F9 | (M5) Let user mark recipes they liked/disliked | G5, taste_profile |

### 8.2 Backend services

| ID | Requirement | Goal |
|----|-------------|------|
| B1 | **Ingestion**: persist photo to object store + create `photo` row, immediately, returning fast | G4 |
| B2 | **Recognition** (async worker): call generic/LLM model, produce `{items, portion, confidence}` | G4 |
| B3 | **Label + correction**: persist `prediction` and `correction` as a paired record | G4 |
| B4 | **Nutrition mapping**: food + grams -> nutrients via USDA FoodData Central / Open Food Facts | G4 |
| B5 | **Consumption/trend**: detect items consumed/likely-needed-again (frequency + recency) | G2 |
| B6 | **Recommender framework**: registry, `SignalContext`, ranking/merge, persistence to `recommendation` | G3, G5 |
| B7 | **Signal substrate**: normalized feature views over the tables in section 7 | G5 |
| B8 | Wrap existing flyer scraper as recommender **M1** behind the framework | G1, G5 |
| B9 | **Consent service**: record granular, separable consent for using photos/corrections in training | privacy |

### 8.3 Data model (relational + object store)

Relational (Postgres). Image **bytes** in object storage; DB holds pointer + metadata.

```
user(id, ...)
photo(id, user_id, object_url, created_at)                 # pointer, not blob
prediction(id, photo_id, model, items_json, portion, confidence, created_at)
correction(id, prediction_id, corrected_items_json, corrected_portion, was_corrected)
food_item(id, canonical_name, nutrients_per_100g_json)     # reference table
log_entry(id, user_id, food_id, grams, nutrients_json, consumed_at)   # the journal
needed_item(id, user_id, name, checked)                    # shopping list (G1)
purchase_event(id, user_id, product_ref, food_id, purchased_at)       # for trends (G2/G3)
recommendation(id, user_id, type, payload_json, reason, score, created_at)  # shared output
consent(id, user_id, scope, granted, updated_at)
embedding(id, subject_type, subject_id, vector)            # dedup/novelty/taste (later)
```

Design notes:
- `recommendation` is a **single shared table** for all modules (M1–M6) — discriminated
  by `type`. This is what makes adding a module a zero-schema-change operation.
- `correction` paired with `prediction` is the **training-grade record** and the data
  moat; it must always be captured, never overwritten.

---

## 9. Non-Functional Requirements

- **Latency**: capture returns < 1s (recognition runs async); recommendation feed loads < 2s.
- **Privacy/consent**: training-use consent is mandatory, granular, and separable from
  app functionality; PII/faces/receipts scrubbed before any training pool; per-user
  delete/opt-out (GDPR/CCPA).
- **Resilience**: external model/scraper failures degrade gracefully — core logging and
  lists must work even if recognition or a recommender is down.
- **Extensibility**: adding a new recommender requires no changes to capture, storage, or
  existing modules (only a new class + registry entry).
- **Recomputability**: derived data (nutrition, recommendations) can be regenerated from
  immutable raw data when models improve.

---

## 10. Success Metrics

| Metric | Signals |
|--------|---------|
| % of logs where the user corrected the prediction | model quality + label yield |
| % of recommendations accepted (any module) | recommender quality |
| % of recommended items added to list / purchased | end-to-end loop value |
| Re-purchase suggestion precision (was it actually needed?) | G2/G3 |
| Dataset novelty: % of samples out-of-distribution vs public corpora | data moat |
| Retention (D7/D30) | overall |

---

## 11. Rollout / Build Order

1. **Capture loop (G4)**: F1–F4, B1–B4 + `photo`/`prediction`/`correction`/`log_entry`
   + consent (B9). Banks consented labels from day one.
2. **Framework + first modules (G5)**: B6/B7 + wrap scraper as M1 (B8), add M2
   (re-purchase, G2/G3). Proves the plugin model with two live recommenders.
3. **Nutrition-driven recs**: M3 (recipe by nutrient gap), tie F7/F8 to the feed.
4. **Extensions (later)**: M4 (kids, tentative), M5 (restaurant-style + likes feedback),
   M6 (taste kNN). Each is purely additive.

---

## 12. Open Questions & Risks

- **Portion accuracy** dominates calorie error — how aggressive should the confirmation UX be?
- **Recommendation -> purchasable SKU mapping** (nutrient gap -> grocery product) is the
  fuzziest engineering piece; likely needs Open Food Facts barcode tagging joined to
  scraped flyer products.
- **M5 internet recipe sourcing**: licensing/ToS of scraped recipes; attribution.
- **M6 taste embeddings**: cold-start (no restaurant history yet) — fallback to region.
- **Two-product scope risk**: tracking vs grocery are different user moments; keep the
  *bridge* (gap -> list) thin in v1 rather than perfecting both halves.
