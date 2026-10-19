"""Postgres access for grocery lists (schema: db/schema.sql).

All queries are scoped by user_id, the anonymous tenant key. Requires DATABASE_URL.
"""

import os
import uuid

import asyncpg

_pool = None


def _env_float(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


async def init_pool(app=None, loop=None):
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise RuntimeError("DATABASE_URL is required (postgres connection string).")
        # Bounded timeouts so an unreachable/stalled DB (e.g. a stopped or
        # unhealthy container) fails fast instead of hanging requests.
        _pool = await asyncpg.create_pool(
            dsn,
            min_size=1,
            max_size=10,
            timeout=_env_float("DB_CONNECT_TIMEOUT", 10),
            command_timeout=_env_float("DB_COMMAND_TIMEOUT", 30),
        )


async def close_pool(app=None, loop=None):
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _get_pool():
    if _pool is None:
        raise RuntimeError("Database pool is not initialised.")
    return _pool


def _item_row(r):
    return {
        "id": str(r["id"]),
        "name": r["name"],
        "checked": r["checked"],
        "created_at": r["created_at"].isoformat(),
    }


async def create_list(user_id, title, item_names):
    """Create a list with its items in one transaction.

    Also ensures the user exists and appends a list_inclusion row per item.
    """
    list_id = uuid.uuid4()
    items = []
    async with _get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                'INSERT INTO "user" (id) VALUES ($1) ON CONFLICT DO NOTHING', user_id
            )
            await conn.execute(
                "INSERT INTO grocery_list (id, user_id, title) VALUES ($1, $2, $3)",
                list_id, user_id, title,
            )
            for name in item_names:
                row = await conn.fetchrow(
                    "INSERT INTO needed_item (id, user_id, list_id, name) "
                    "VALUES ($1, $2, $3, $4) RETURNING id, name, checked, created_at",
                    uuid.uuid4(), user_id, list_id, name,
                )
                await conn.execute(
                    "INSERT INTO list_inclusion (id, user_id, item_name, list_id) "
                    "VALUES ($1, $2, $3, $4)",
                    uuid.uuid4(), user_id, name, list_id,
                )
                items.append(_item_row(row))
    return {"id": str(list_id), "user_id": str(user_id), "title": title, "items": items}


async def get_lists(user_id):
    """All lists for a user, each with its items."""
    async with _get_pool().acquire() as conn:
        lists = await conn.fetch(
            "SELECT id, title FROM grocery_list WHERE user_id = $1 ORDER BY title", user_id
        )
        items = await conn.fetch(
            "SELECT id, list_id, name, checked, created_at FROM needed_item "
            "WHERE user_id = $1 ORDER BY created_at",
            user_id,
        )
    by_list = {}
    for r in items:
        by_list.setdefault(r["list_id"], []).append(_item_row(r))
    return [
        {"id": str(l["id"]), "title": l["title"], "items": by_list.get(l["id"], [])}
        for l in lists
    ]


async def get_list(user_id, list_id):
    """One list with items, or None if not found for this user."""
    async with _get_pool().acquire() as conn:
        l = await conn.fetchrow(
            "SELECT id, title FROM grocery_list WHERE id = $1 AND user_id = $2",
            list_id, user_id,
        )
        if l is None:
            return None
        items = await conn.fetch(
            "SELECT id, name, checked, created_at FROM needed_item "
            "WHERE list_id = $1 AND user_id = $2 ORDER BY created_at",
            list_id, user_id,
        )
    return {"id": str(l["id"]), "title": l["title"], "items": [_item_row(r) for r in items]}


async def add_item(user_id, list_id, name):
    """Add an item to an existing list. Returns the item, or None if the list is missing."""
    async with _get_pool().acquire() as conn:
        async with conn.transaction():
            owned = await conn.fetchval(
                "SELECT 1 FROM grocery_list WHERE id = $1 AND user_id = $2", list_id, user_id
            )
            if not owned:
                return None
            row = await conn.fetchrow(
                "INSERT INTO needed_item (id, user_id, list_id, name) "
                "VALUES ($1, $2, $3, $4) RETURNING id, name, checked, created_at",
                uuid.uuid4(), user_id, list_id, name,
            )
            await conn.execute(
                "INSERT INTO list_inclusion (id, user_id, item_name, list_id) "
                "VALUES ($1, $2, $3, $4)",
                uuid.uuid4(), user_id, name, list_id,
            )
    return _item_row(row)


async def set_item_checked(user_id, item_id, checked):
    """Returns the updated item, or None if not found."""
    async with _get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE needed_item SET checked = $3 WHERE id = $1 AND user_id = $2 "
            "RETURNING id, name, checked, created_at",
            item_id, user_id, checked,
        )
    return _item_row(row) if row else None


async def delete_list(user_id, list_id):
    """Returns True if a list was deleted."""
    async with _get_pool().acquire() as conn:
        result = await conn.execute(
            "DELETE FROM grocery_list WHERE id = $1 AND user_id = $2", list_id, user_id
        )
    return result.endswith(" 1")
