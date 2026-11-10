"""Tests for api/db.py against the real schema (db/schema.sql).

These cover behaviour the routes can't show: the user row, the append-only
list_inclusion history, transaction rollback and ON DELETE rules.
"""

import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

import db


@pytest.fixture
def uid():
    return uuid.uuid4()


def manual(*names):
    return [(name, "manual") for name in names]


async def inclusions(pool, uid):
    # included_at defaults to now(), the transaction start, so rows written in one
    # transaction tie; their relative order is undefined.
    return await pool.fetch(
        "SELECT item_name, list_id, source FROM list_inclusion "
        "WHERE user_id = $1 ORDER BY included_at",
        uid,
    )


async def trends(pool, uid):
    return await pool.fetch(
        "SELECT item_name, inclusion_count, cadence_days, last_included_at, next_due_at "
        "FROM item_trend WHERE user_id = $1 ORDER BY item_name",
        uid,
    )


async def test_create_list_creates_user_list_items_and_inclusions(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk", "eggs"))

    assert await pool.fetchval('SELECT count(*) FROM "user" WHERE id = $1', uid) == 1
    assert await pool.fetchval(
        "SELECT title FROM grocery_list WHERE id = $1", uuid.UUID(created["id"])
    ) == "Weekly"
    rows = await inclusions(pool, uid)
    assert sorted(r["item_name"] for r in rows) == ["eggs", "milk"]
    assert {str(r["list_id"]) for r in rows} == {created["id"]}


async def test_create_list_reuses_existing_user(pool, uid):
    await db.create_list(uid, "One", [])
    await db.create_list(uid, "Two", [])
    assert await pool.fetchval('SELECT count(*) FROM "user" WHERE id = $1', uid) == 1
    assert len(await db.get_lists(uid)) == 2


async def test_create_list_rolls_back_everything_on_failure(pool, uid):
    # None violates needed_item.name NOT NULL after "milk" was already inserted.
    with pytest.raises(Exception):
        await db.create_list(uid, "Broken", manual("milk", None))

    assert await pool.fetchval('SELECT count(*) FROM "user" WHERE id = $1', uid) == 0
    assert await pool.fetchval("SELECT count(*) FROM grocery_list WHERE user_id = $1", uid) == 0
    assert await pool.fetchval("SELECT count(*) FROM needed_item WHERE user_id = $1", uid) == 0
    assert await inclusions(pool, uid) == []
    assert await trends(pool, uid) == []


async def test_get_lists_and_get_list_are_scoped_to_user(pool, uid):
    other = uuid.uuid4()
    mine = await db.create_list(uid, "Mine", manual("a"))
    await db.create_list(other, "Theirs", manual("b"))

    lists = await db.get_lists(uid)
    assert [l["id"] for l in lists] == [mine["id"]]
    assert await db.get_list(uid, uuid.UUID(mine["id"])) is not None
    assert await db.get_list(other, uuid.UUID(mine["id"])) is None


async def test_add_item_appends_inclusion_each_time(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk"))
    list_id = uuid.UUID(created["id"])

    await db.add_item(uid, list_id, "milk")  # same name again is a new inclusion
    names = [r["item_name"] for r in await inclusions(pool, uid)]
    assert names == ["milk", "milk"]
    assert len((await db.get_list(uid, list_id))["items"]) == 2


async def test_add_item_returns_none_for_missing_or_foreign_list(pool, uid):
    created = await db.create_list(uid, "Weekly", [])
    assert await db.add_item(uid, uuid.uuid4(), "milk") is None
    assert await db.add_item(uuid.uuid4(), uuid.UUID(created["id"]), "milk") is None
    assert await inclusions(pool, uid) == []


async def test_set_item_checked_does_not_write_inclusion(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk"))
    item_id = uuid.UUID(created["items"][0]["id"])
    before = len(await inclusions(pool, uid))

    item = await db.set_item_checked(uid, item_id, True)
    assert item["checked"] is True
    assert len(await inclusions(pool, uid)) == before


async def test_set_item_checked_scoped_to_user(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk"))
    item_id = uuid.UUID(created["items"][0]["id"])
    assert await db.set_item_checked(uuid.uuid4(), item_id, True) is None
    assert await db.set_item_checked(uid, uuid.uuid4(), True) is None


async def test_delete_list_cascades_items_but_keeps_inclusion_history(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk", "eggs"))
    list_id = uuid.UUID(created["id"])

    assert await db.delete_list(uid, list_id) is True

    assert await pool.fetchval("SELECT count(*) FROM needed_item WHERE list_id = $1", list_id) == 0
    rows = await inclusions(pool, uid)
    assert sorted(r["item_name"] for r in rows) == ["eggs", "milk"]
    assert all(r["list_id"] is None for r in rows)  # ON DELETE SET NULL


async def test_delete_list_returns_false_when_missing_or_foreign(pool, uid):
    created = await db.create_list(uid, "Weekly", [])
    list_id = uuid.UUID(created["id"])
    assert await db.delete_list(uuid.uuid4(), list_id) is False
    assert await db.delete_list(uid, uuid.uuid4()) is False
    assert await db.get_list(uid, list_id) is not None


async def test_create_list_and_add_item_populate_item_trend_with_session_dedup(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk", "eggs"))
    list_id = uuid.UUID(created["id"])

    # Adding milk again in the same sitting appends to list_inclusion, but keeps
    # item_trend at 1 inclusion with null cadence.
    await db.add_item(uid, list_id, "milk")

    inc_rows = await inclusions(pool, uid)
    assert sorted(r["item_name"] for r in inc_rows) == ["eggs", "milk", "milk"]

    trend_rows = {r["item_name"]: r for r in await trends(pool, uid)}
    assert set(trend_rows) == {"milk", "eggs"}
    assert trend_rows["milk"]["inclusion_count"] == 1
    assert trend_rows["milk"]["cadence_days"] is None
    assert trend_rows["milk"]["next_due_at"] is None


async def test_create_list_normalizes_history_but_keeps_typed_display_name(pool, uid):
    created = await db.create_list(uid, "Weekly", manual(" Milk ", "milk"))

    assert [i["name"] for i in created["items"]] == [" Milk ", "milk"]
    assert [r["item_name"] for r in await inclusions(pool, uid)] == ["milk", "milk"]
    assert [r["item_name"] for r in await trends(pool, uid)] == ["milk"]


async def test_add_item_with_different_case_shares_one_trend(pool, uid):
    created = await db.create_list(uid, "Weekly", manual("milk"))
    await db.add_item(uid, uuid.UUID(created["id"]), "MILK")

    assert [r["item_name"] for r in await inclusions(pool, uid)] == ["milk", "milk"]
    assert [r["item_name"] for r in await trends(pool, uid)] == ["milk"]


async def test_variants_keep_separate_trends(pool, uid):
    await db.create_list(uid, "Weekly", manual("2% Milk", "milk"))
    assert [r["item_name"] for r in await trends(pool, uid)] == ["2% milk", "milk"]


async def test_update_item_trend_computes_median_cadence_and_next_due_across_days(pool, uid):
    await db.create_list(uid, "Seed", [])
    t0 = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    # Intervals: 7d, 7d, 28d (outlier), 7d -> median 7d
    for offset in (0, 7, 14, 42, 49):
        await pool.execute(
            "INSERT INTO list_inclusion (id, user_id, item_name, included_at) "
            "VALUES ($1, $2, $3, $4)",
            uuid.uuid4(),
            uid,
            "oat milk",
            t0 + timedelta(days=offset),
        )

    result = await db.update_item_trend(uid, "oat milk")
    assert result["item_name"] == "oat milk"
    assert result["inclusion_count"] == 5
    assert result["cadence_days"] == pytest.approx(7.0)
    assert result["last_included_at"] == (t0 + timedelta(days=49)).isoformat()
    assert result["next_due_at"] == (t0 + timedelta(days=56)).isoformat()


async def test_create_list_and_add_item_record_each_additions_source(pool, uid):
    created = await db.create_list(uid, "Weekly", [("milk", "manual"), ("eggs", "suggestion")])
    list_id = uuid.UUID(created["id"])
    await db.add_item(uid, list_id, "bread")
    await db.add_item(uid, list_id, "butter", "suggestion")

    sources = {r["item_name"]: r["source"] for r in await inclusions(pool, uid)}
    assert sources == {
        "milk": "manual",
        "eggs": "suggestion",
        "bread": "manual",
        "butter": "suggestion",
    }


async def test_unknown_source_is_rejected_and_rolled_back(pool, uid):
    created = await db.create_list(uid, "Weekly", [])
    with pytest.raises(asyncpg.CheckViolationError):
        await db.add_item(uid, uuid.UUID(created["id"]), "milk", "recipe")
    assert await inclusions(pool, uid) == []
    assert (await db.get_list(uid, uuid.UUID(created["id"])))["items"] == []


async def test_accepted_suggestion_counts_toward_cadence(pool, uid):
    """ADR 0003: a suggestion Addition advances the trend exactly like a manual one."""
    await db.create_list(uid, "Seed", [])
    t0 = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    for offset, source in ((0, "manual"), (7, "manual"), (14, "suggestion")):
        await pool.execute(
            "INSERT INTO list_inclusion (id, user_id, item_name, included_at, source) "
            "VALUES ($1, $2, $3, $4, $5)",
            uuid.uuid4(),
            uid,
            "oat milk",
            t0 + timedelta(days=offset),
            source,
        )

    result = await db.update_item_trend(uid, "oat milk")
    assert result["inclusion_count"] == 3
    assert result["cadence_days"] == pytest.approx(7.0)
    assert result["last_included_at"] == (t0 + timedelta(days=14)).isoformat()
    assert result["next_due_at"] == (t0 + timedelta(days=21)).isoformat()
