# PRD Index — AI-Augmented Grocery & Nutrition Platform

The original single PRD has been split into feature-scoped PRDs so each is
independently reviewable and shippable. They are ordered by dependency: build top to
bottom. The key sequencing rule is **build one concrete recommender before generalizing
into a framework** (concrete-then-extract).

| # | PRD | Goals | Depends on | Status |
|---|-----|-------|-----------|--------|
| 01 | [Core item tracking](./01-core-item-tracking.md) | G1, G2 | — | Draft |
| 02 | [Re-purchase recommender (reference module)](./02-repurchase-recommender.md) | G3 | 01 | Draft |
| 03 | [AI capture + nutrition (incl. mobile capture)](./03-ai-capture-nutrition.md) | G4 | 01 | Draft |
| 04 | [Recommendation framework](./04-recommendation-framework.md) | G5 | 01, 02, 03 | Draft |

Companion technical design: [`../modular-recommendations-design.md`](../modular-recommendations-design.md)
(the "how" for PRD 04).

## Goal glossary

| ID | Goal |
|----|------|
| G1 | Track items **needed** (shopping list) |
| G2 | Spot **trends** in items consumed that will be consumed again |
| G3 | Recommend items for **re-purchase** |
| G4 | Track **nutrition** from food photos to augment recommendations |
| G5 | Provide a **modular recommendation framework** (recommenders as plugins) |

## Dependency diagram

```
            01 Core item tracking
            /          |         \
           v           v          \
 02 Re-purchase   03 AI capture    \
   recommender     + nutrition      \
           \           |            /
            \          v           /
             ----> 04 Recommendation framework
                   (generalizes 02; adds M1/M3;
                    owns signal schemas + ranking)
```

## Build sequence rationale

1. **01 first** — everything reads from the tracking data model; it defines the first
   signal schemas (`needed_items`, `food_log`, `purchase_history`).
2. **02 next** — a standalone, hardcoded re-purchase recommender. It only needs tracking
   data (not nutrition), so it ships early and de-risks the "recommendation" idea with a
   real, narrow example.
3. **03 in parallel-ish** — the AI photo→nutrition loop (the headline augmentation).
   Mobile capture UX is folded in here because that is where "mobile" actually earns its
   keep (camera, latency, offline). Adds the `nutrition` signal.
4. **04 last** — generalize the concrete recommender (02) into a plugin framework, wrap
   the existing flyer scraper as M1, add the nutrition recipe recommender (M3). This PRD
   owns the two hardest problems: **signal-schema contracts** and **cross-module score
   normalization**.

## Out of these PRDs (later / exploratory)

- M4 kids' food, M5 restaurant-style (internet recipes + likes), M6 taste-matched kNN —
  tracked as exploratory recommenders once the framework (04) is proven. Each is purely
  additive (new module + registry entry).
