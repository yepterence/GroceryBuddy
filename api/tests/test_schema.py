"""db/schema.sql must be safe to re-run (create-tables.sh and the docker init rely on it)."""

import uuid

import asyncpg
import pytest_asyncio

from conftest import SCHEMA_PATH, TEST_DATABASE_URL

TABLES = {"user", "grocery_list", "needed_item", "list_inclusion", "item_trend"}
INDEXES = {
    "grocery_list_user_id_idx",
    "needed_item_list_id_idx",
    "needed_item_user_id_idx",
    "list_inclusion_user_item_idx",
}


@pytest_asyncio.fixture
async def conn():
    c = await asyncpg.connect(TEST_DATABASE_URL)
    yield c
    await c.close()


async def apply_schema(conn):
    await conn.execute(SCHEMA_PATH.read_text())


async def test_schema_creates_expected_tables_and_indexes(conn):
    await apply_schema(conn)
    tables = {
        r["tablename"]
        for r in await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    }
    indexes = {
        r["indexname"]
        for r in await conn.fetch("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
    }
    assert TABLES <= tables
    assert INDEXES <= indexes


async def snapshot(conn):
    """Names of all tables and indexes in the public schema, sorted for comparison."""
    tables = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    indexes = await conn.fetch("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
    return sorted(r["tablename"] for r in tables), sorted(r["indexname"] for r in indexes)


async def test_schema_can_be_applied_repeatedly_without_error(conn):
    """Each schema application is idempotent."""
    await apply_schema(conn)
    before = await snapshot(conn)

    for _ in range(3):
        await apply_schema(conn)  # raises if any statement is not idempotent

    assert await snapshot(conn) == before


async def test_reapplying_schema_keeps_existing_data(conn):
    user_id, list_id = uuid.uuid4(), uuid.uuid4()
    await conn.execute('INSERT INTO "user" (id) VALUES ($1)', user_id)
    await conn.execute(
        "INSERT INTO grocery_list (id, user_id, title) VALUES ($1, $2, 'keep me')",
        list_id, user_id,
    )

    await apply_schema(conn)

    assert await conn.fetchval("SELECT title FROM grocery_list WHERE id = $1", list_id) == "keep me"


async def test_reapplying_schema_does_not_duplicate_objects(conn):
    await apply_schema(conn)
    before = await conn.fetchval("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")
    await apply_schema(conn)
    after = await conn.fetchval("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")
    assert before == after
