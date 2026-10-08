"""Tests for api/db.py against the real schema (db/schema.sql).

These cover behaviour the routes can't show: the user row, the append-only
list_inclusion history, transaction rollback and ON DELETE rules.
"""

import uuid

import pytest

import db


@pytest.fixture
def uid():
    return uuid.uuid4()


async def inclusions(pool, uid):
    return await pool.fetch(
        "SELECT item_name, list_id FROM list_inclusion WHERE user_id = $1 ORDER BY included_at",
        uid,
    )


async def test_create_list_creates_user_list_items_and_inclusions(pool, uid):
    created = await db.create_list(uid, "Weekly", ["milk", "eggs"])

    assert await pool.fetchval('SELECT count(*) FROM "user" WHERE id = $1', uid) == 1
    assert await pool.fetchval(
        "SELECT title FROM grocery_list WHERE id = $1", uuid.UUID(created["id"])
    ) == "Weekly"
    rows = await inclusions(pool, uid)
    assert [r["item_name"] for r in rows] == ["milk", "eggs"]
    assert {str(r["list_id"]) for r in rows} == {created["id"]}


async def test_create_list_reuses_existing_user(pool, uid):
    await db.create_list(uid, "One", [])
    await db.create_list(uid, "Two", [])
    assert await pool.fetchval('SELECT count(*) FROM "user" WHERE id = $1', uid) == 1
    assert len(await db.get_lists(uid)) == 2


async def test_create_list_rolls_back_everything_on_failure(pool, uid):
    # None violates needed_item.name NOT NULL after "milk" was already inserted.
    with pytest.raises(Exception):
        await db.create_list(uid, "Broken", ["milk", None])

    assert await pool.fetchval('SELECT count(*) FROM "user" WHERE id = $1', uid) == 0
    assert await pool.fetchval("SELECT count(*) FROM grocery_list WHERE user_id = $1", uid) == 0
    assert await pool.fetchval("SELECT count(*) FROM needed_item WHERE user_id = $1", uid) == 0
    assert await inclusions(pool, uid) == []


async def test_get_lists_and_get_list_are_scoped_to_user(pool, uid):
    other = uuid.uuid4()
    mine = await db.create_list(uid, "Mine", ["a"])
    await db.create_list(other, "Theirs", ["b"])

    lists = await db.get_lists(uid)
    assert [l["id"] for l in lists] == [mine["id"]]
    assert await db.get_list(uid, uuid.UUID(mine["id"])) is not None
    assert await db.get_list(other, uuid.UUID(mine["id"])) is None


async def test_add_item_appends_inclusion_each_time(pool, uid):
    created = await db.create_list(uid, "Weekly", ["milk"])
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
    created = await db.create_list(uid, "Weekly", ["milk"])
    item_id = uuid.UUID(created["items"][0]["id"])
    before = len(await inclusions(pool, uid))

    item = await db.set_item_checked(uid, item_id, True)
    assert item["checked"] is True
    assert len(await inclusions(pool, uid)) == before


async def test_set_item_checked_scoped_to_user(pool, uid):
    created = await db.create_list(uid, "Weekly", ["milk"])
    item_id = uuid.UUID(created["items"][0]["id"])
    assert await db.set_item_checked(uuid.uuid4(), item_id, True) is None
    assert await db.set_item_checked(uid, uuid.uuid4(), True) is None


async def test_delete_list_cascades_items_but_keeps_inclusion_history(pool, uid):
    created = await db.create_list(uid, "Weekly", ["milk", "eggs"])
    list_id = uuid.UUID(created["id"])

    assert await db.delete_list(uid, list_id) is True

    assert await pool.fetchval("SELECT count(*) FROM needed_item WHERE list_id = $1", list_id) == 0
    rows = await inclusions(pool, uid)
    assert [r["item_name"] for r in rows] == ["milk", "eggs"]
    assert all(r["list_id"] is None for r in rows)  # ON DELETE SET NULL


async def test_delete_list_returns_false_when_missing_or_foreign(pool, uid):
    created = await db.create_list(uid, "Weekly", [])
    list_id = uuid.UUID(created["id"])
    assert await db.delete_list(uuid.uuid4(), list_id) is False
    assert await db.delete_list(uid, uuid.uuid4()) is False
    assert await db.get_list(uid, list_id) is not None
