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

## QoL / engineering (off the product stack)

Not sequenced with 01→04. Implement when infra time is available.

| PRD | Purpose | Status |
|-----|---------|--------|
| [GitHub Actions CI](./qol-github-actions-ci.md) | Run `test.sh` + npm lint/build/test on every push/PR | Draft |

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
2. **02 next** — a standalone, hardcoded re-purchase recommender driven by **how often an
   item has been included in a list**. This signal is produced by the core app from day
   one (no nutrition, no checkout integration, no AI), so re-purchase is **vital, not
   optional**: it's the most directly available unit of value and de-risks the
   "recommendation" idea with a real, narrow example.
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

---

## Portfolio v1 scope (built vs. designed-only)

This project is intentionally scoped as a **portfolio piece**: ship one focused vertical
slice that demonstrates the differentiated loop end-to-end, and *design* (not build) the
rest. A small, finished slice + clear design docs signals deliberate scoping; a sprawling,
half-built platform does not.

**The v1 loop to demonstrate (decided 2026-11-02, revised 2026-11-03):**
`build a list → re-purchase suggestions appear in that list → one tap adds them`
— a quick proof of concept built on data the app already collects. Flyer prices are left
out of v1: plain-text name matching is too ambiguous, and good matching needs Item Labels
(PRD 03) or an AI retriever. The full
`food photo → nutrition → nutrient gap → suggested item → flyer price` loop remains the
long-term differentiator (MyFitnessPal/Cronometer stop at the gap; Flipp/Reebee don't know
nutrition) and is built only if time allows after the v1 loop ships.

| PRD / module | v1 status | Notes |
|--------------|-----------|-------|
| 01 Core item tracking | **Build** | Small foundation; needed-items + **list-inclusion history** |
| 02 Re-purchase (M2) | **Build (vital)** | Driven by **list-inclusion frequency** the core app already produces; no AI/nutrition dependency |
| M1 flyer/price (existing scraper) | **Deferred** | Needs label-based (or AI-retrieved) matching first; flyer data cached per postal code when built ([design §4 M1](../modular-recommendations-design.md)) |
| 04 Framework contract + registry | **Design-only (v1)** | One recommender can't prove a plugin contract; extract once a second real recommender exists |
| 03 AI capture + nutrition | **Stretch (thin)** | Only after the v1 loop ships. Vision LLM (no training); nutrition via Open Food Facts / USDA |
| M3 recipe/item by nutrient gap | **Stretch (thin)** | Depends on 03 |
| M4 / M5 / M6 | **Design-only** | Documented as "designed, not built" + roadmap |
| Mobile version | **Final step, after auth** | Required. Approach is an open decision (PWA, Capacitor-wrapped web app, or React Native); revisit before building the frontend component structure further |
| Data-moat machinery, custom model | **Out of scope** | Company concerns; in a portfolio they read as unfinished scope |

**Why design-only is fine (and good):** demonstrating an extensible design + a credible
roadmap (M4–M6 as drop-in modules) is stronger portfolio signal than half-building six
modules. The PRDs themselves are part of the deliverable.

## Pre-production gate

PRD 01 segregates lists with an anonymous `user.id` and stores no email, password, or session. That id is a tenant key: whoever can send it can read and write those rows.

**Blocker:** authentication (who is calling) and authorization (a caller may only touch their own `user_id`) must exist before this app is dockerized, treated as production, or shipped as the mobile version ([ADR 0002](../adr/0002-anonymous-device-bound-shopper.md)). The `user_id` foreign keys stay. Production replaces "the client sends an id" with "a session proves this caller owns this id." See [PRD 01 §10](./01-core-item-tracking.md#10-production-gate).
