"""Shared fixtures. Tests run against a real Postgres, never your dev data.

Set TEST_DATABASE_URL to a throwaway database, e.g.
    TEST_DATABASE_URL=postgresql://localhost:5432/grocerybuddy_test pytest
The schema (db/schema.sql) is applied once per session (it is idempotent).
Every test uses fresh random user ids, so no cleanup/truncation is needed.
"""

import asyncio
import os
import pathlib
import uuid

import asyncpg
import pytest
import pytest_asyncio

SCHEMA_PATH = pathlib.Path(__file__).resolve().parents[2] / "db" / "schema.sql"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def pytest_collection_modifyitems(config, items):
    if TEST_DATABASE_URL:
        return
    skip = pytest.mark.skip(reason="TEST_DATABASE_URL is not set")
    for item in items:
        if "no_db" not in item.keywords:  # failure-simulation tests need no database
            item.add_marker(skip)


async def _apply_schema():
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        await conn.execute(SCHEMA_PATH.read_text())
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
def schema():
    if TEST_DATABASE_URL:
        asyncio.run(_apply_schema())


@pytest_asyncio.fixture
async def pool(monkeypatch):
    """Initialise the app's db pool (db.py global) on the test's event loop."""
    import db

    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    await db.close_pool()
    await db.init_pool()
    yield db._pool
    await db.close_pool()


@pytest_asyncio.fixture
async def client(pool):
    from api import app

    yield app.asgi_client


@pytest.fixture
def user_id():
    return str(uuid.uuid4())
