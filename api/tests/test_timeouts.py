"""Network failure handling, e.g. the database container is down, paused or slow.

Most of these need no database: they simulate the failure. Only the
slow-query test needs a real Postgres (skipped without TEST_DATABASE_URL).
"""

import asyncio
import time
import uuid

import asyncpg
import pytest

import db

NO_DB = pytest.mark.no_db

UNAVAILABLE_ERRORS = [
    asyncio.TimeoutError(),
    TimeoutError(),
    ConnectionRefusedError(),
    ConnectionResetError(),
    asyncpg.CannotConnectNowError(),
    asyncpg.ConnectionDoesNotExistError(),
    asyncpg.InterfaceError("pool is closed"),
]

UID = str(uuid.uuid4())
OTHER = str(uuid.uuid4())

# (method, path, kwargs, name of the db function the route calls)
ROUTES = [
    ("post", "/lists", {"json": {"user_id": UID, "title": "x", "items": ["a"]}}, "create_list"),
    ("get", "/lists", {"params": {"user_id": UID}}, "get_lists"),
    ("get", f"/lists/{OTHER}", {"params": {"user_id": UID}}, "get_list"),
    ("delete", f"/lists/{OTHER}", {"params": {"user_id": UID}}, "delete_list"),
    ("post", f"/lists/{OTHER}/items", {"json": {"user_id": UID, "name": "a"}}, "add_item"),
    ("patch", f"/items/{OTHER}", {"json": {"user_id": UID, "checked": True}}, "set_item_checked"),
]


@pytest.fixture
def offline_client(monkeypatch):
    """App client that never touches a database (pool startup is stubbed out)."""
    from api import app

    class FakePool:
        async def close(self):
            pass

    # A non-None pool makes the startup listener (init_pool) a no-op, so no
    # DATABASE_URL or Postgres is needed; the db functions are patched per test.
    monkeypatch.setattr(db, "_pool", FakePool())
    return app.asgi_client


@NO_DB
@pytest.mark.parametrize("error", UNAVAILABLE_ERRORS, ids=lambda e: type(e).__name__)
@pytest.mark.parametrize("method,path,kwargs,func", ROUTES, ids=[r[3] for r in ROUTES])
async def test_routes_return_503_when_db_is_unreachable(
    offline_client, monkeypatch, method, path, kwargs, func, error
):
    async def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(db, func, fail)

    _, resp = await getattr(offline_client, method)(path, **kwargs)

    assert resp.status == 503
    assert resp.json["status"] == "error"
    assert "database unavailable" in resp.json["message"]


@NO_DB
async def test_validation_errors_still_400_when_db_is_down(offline_client, monkeypatch):
    """Bad input is rejected before any db call, so an outage must not turn it into a 503."""

    async def fail(*args, **kwargs):
        raise TimeoutError()

    monkeypatch.setattr(db, "create_list", fail)
    _, resp = await offline_client.post("/lists", json={"user_id": "bad", "title": "x"})
    assert resp.status == 400


@NO_DB
async def test_init_pool_fails_fast_when_host_is_unreachable(monkeypatch):
    # 10.255.255.1 is a non-routable address: connect() hangs until the timeout.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@10.255.255.1:5432/nope")
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "0.5")
    await db.close_pool()

    start = time.monotonic()
    with pytest.raises((asyncio.TimeoutError, TimeoutError, OSError)):
        await db.init_pool()

    assert time.monotonic() - start < 5, "connect timeout was not applied"
    assert db._pool is None  # a failed startup must not leave a half-built pool


@NO_DB
def test_timeout_env_vars_fall_back_to_defaults_on_garbage(monkeypatch):
    monkeypatch.setenv("DB_COMMAND_TIMEOUT", "not-a-number")
    assert db._env_float("DB_COMMAND_TIMEOUT", 30) == 30.0
    monkeypatch.setenv("DB_COMMAND_TIMEOUT", "2.5")
    assert db._env_float("DB_COMMAND_TIMEOUT", 30) == 2.5


async def test_slow_query_hits_command_timeout(monkeypatch):
    """A query that stalls (e.g. packets dropped mid-flight) is cut off, not hung."""
    from conftest import TEST_DATABASE_URL

    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("DB_COMMAND_TIMEOUT", "0.3")
    await db.close_pool()
    await db.init_pool()
    try:
        start = time.monotonic()
        with pytest.raises((asyncio.TimeoutError, TimeoutError)):
            await db._pool.fetchval("SELECT pg_sleep(5)")
        assert time.monotonic() - start < 3
    finally:
        await db.close_pool()
