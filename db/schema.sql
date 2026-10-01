-- Phase 0 core item tracking (PRD 01).
-- One Postgres database. user.id is an anonymous tenant key: no email, password, or session.
-- Apply with scripts/create-tables.sh. Safe to re-run.

CREATE TABLE IF NOT EXISTS "user" (
    id UUID PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS grocery_list (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS needed_item (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    list_id UUID NOT NULL REFERENCES grocery_list (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only. Written when an item is added to a list, not when it is checked off.
-- list_id becomes null if that list is later deleted so the history row survives.
CREATE TABLE IF NOT EXISTS list_inclusion (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    list_id UUID REFERENCES grocery_list (id) ON DELETE SET NULL,
    included_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Derived cache. Recomputable from list_inclusion. Null cadence until a second inclusion.
CREATE TABLE IF NOT EXISTS item_trend (
    user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    inclusion_count INTEGER NOT NULL CHECK (inclusion_count >= 1),
    cadence_days NUMERIC,
    last_included_at TIMESTAMPTZ NOT NULL,
    next_due_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, item_name)
);

CREATE INDEX IF NOT EXISTS grocery_list_user_id_idx ON grocery_list (user_id);
CREATE INDEX IF NOT EXISTS needed_item_list_id_idx ON needed_item (list_id);
CREATE INDEX IF NOT EXISTS needed_item_user_id_idx ON needed_item (user_id);
CREATE INDEX IF NOT EXISTS list_inclusion_user_item_idx ON list_inclusion (user_id, item_name, included_at);
