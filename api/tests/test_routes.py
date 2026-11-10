"""HTTP-level tests for the grocery list CRUD routes (api/api.py)."""

import uuid
from datetime import datetime, timedelta, timezone

import asyncpg

import db
from conftest import TEST_DATABASE_URL


async def inclusion_sources(list_id):
    # Own connection: the test client closes the app's pool when its server stops.
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        rows = await conn.fetch(
            "SELECT item_name, source FROM list_inclusion WHERE list_id = $1",
            uuid.UUID(list_id),
        )
    finally:
        await conn.close()
    return {r["item_name"]: r["source"] for r in rows}


async def create_list(client, user_id, title="Weekly", items=("milk", "eggs")):
    _, resp = await client.post(
        "/lists", json={"user_id": user_id, "title": title, "items": list(items)}
    )
    assert resp.status == 201, resp.text
    return resp.json["list"]


# --- Create: POST /lists ---------------------------------------------------


async def test_create_list_saves_list_and_items(client, user_id):
    _, resp = await client.post(
        "/lists", json={"user_id": user_id, "title": "Weekly", "items": ["milk", "eggs"]}
    )
    assert resp.status == 201
    body = resp.json
    assert body["status"] == "success"
    saved = body["list"]
    assert saved["title"] == "Weekly"
    assert saved["user_id"] == user_id
    assert [i["name"] for i in saved["items"]] == ["milk", "eggs"]
    assert all(i["checked"] is False for i in saved["items"])
    uuid.UUID(saved["id"])


async def test_create_list_strips_whitespace_and_drops_blank_items(client, user_id):
    saved = await create_list(
        client, user_id, title="  Party  ", items=["  chips ", "", "   ", "salsa"]
    )
    assert saved["title"] == "Party"
    assert [i["name"] for i in saved["items"]] == ["chips", "salsa"]


async def test_create_list_accepts_names_and_name_source_objects(client, user_id):
    items = ["milk", {"name": " eggs ", "source": "suggestion"}, {"name": "bread"}]
    saved = await create_list(client, user_id, items=items)
    assert [i["name"] for i in saved["items"]] == ["milk", "eggs", "bread"]

    assert await inclusion_sources(saved["id"]) == {
        "milk": "manual",
        "eggs": "suggestion",
        "bread": "manual",
    }


async def test_create_list_without_items_is_allowed(client, user_id):
    _, resp = await client.post("/lists", json={"user_id": user_id, "title": "Empty"})
    assert resp.status == 201
    assert resp.json["list"]["items"] == []


async def test_create_list_is_persisted(client, user_id):
    saved = await create_list(client, user_id)
    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.status == 200
    assert resp.json["list"]["id"] == saved["id"]


async def test_create_list_rejects_bad_input(client, user_id):
    cases = [
        {"title": "x"},  # missing user_id
        {"user_id": "not-a-uuid", "title": "x"},
        {"user_id": user_id},  # missing title
        {"user_id": user_id, "title": "   "},  # blank title
        {"user_id": user_id, "title": 123},
        {"user_id": user_id, "title": "x", "items": "milk"},  # not a list
        {"user_id": user_id, "title": "x", "items": ["milk", 5]},  # non-string item
        {"user_id": user_id, "title": "x", "items": [{"name": "milk", "source": "recipe"}]},
        {"user_id": user_id, "title": "x", "items": [{"source": "manual"}]},  # no name
        {"user_id": user_id, "title": "x", "items": [{"name": 5}]},
    ]
    for payload in cases:
        _, resp = await client.post("/lists", json=payload)
        assert resp.status == 400, payload
        assert resp.json["status"] == "error"


async def test_create_list_rejects_missing_or_non_object_body(client):
    _, resp = await client.post("/lists")
    assert resp.status == 400
    _, resp = await client.post("/lists", json=["not", "an", "object"])
    assert resp.status == 400


# --- Read: GET /lists and GET /lists/<id> ------------------------------------


async def test_list_lists_returns_only_the_users_lists_with_items(client, user_id):
    a = await create_list(client, user_id, title="A", items=["apples"])
    b = await create_list(client, user_id, title="B", items=["bread", "butter"])
    await create_list(client, str(uuid.uuid4()), title="someone else")

    _, resp = await client.get("/lists", params={"user_id": user_id})
    assert resp.status == 200
    lists = {l["id"]: l for l in resp.json["lists"]}
    assert set(lists) == {a["id"], b["id"]}
    assert [i["name"] for i in lists[b["id"]]["items"]] == ["bread", "butter"]


async def test_list_lists_empty_for_new_user(client):
    _, resp = await client.get("/lists", params={"user_id": str(uuid.uuid4())})
    assert resp.status == 200
    assert resp.json["lists"] == []


async def test_list_lists_requires_valid_user_id(client):
    _, resp = await client.get("/lists")
    assert resp.status == 400
    _, resp = await client.get("/lists", params={"user_id": "nope"})
    assert resp.status == 400


async def test_get_list_returns_list_with_items(client, user_id):
    saved = await create_list(client, user_id, title="Dinner", items=["pasta"])
    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.status == 200
    assert resp.json["list"]["title"] == "Dinner"
    assert [i["name"] for i in resp.json["list"]["items"]] == ["pasta"]


async def test_get_list_404_for_unknown_list(client, user_id):
    _, resp = await client.get(f"/lists/{uuid.uuid4()}", params={"user_id": user_id})
    assert resp.status == 404


async def test_get_list_404_for_other_users_list(client, user_id):
    saved = await create_list(client, user_id)
    _, resp = await client.get(
        f"/lists/{saved['id']}", params={"user_id": str(uuid.uuid4())}
    )
    assert resp.status == 404


async def test_get_list_400_for_invalid_ids(client, user_id):
    _, resp = await client.get("/lists/not-a-uuid", params={"user_id": user_id})
    assert resp.status == 400
    _, resp = await client.get(f"/lists/{uuid.uuid4()}")  # no user_id
    assert resp.status == 400


# --- Update: POST /lists/<id>/items and PATCH /items/<id> ---------------------


async def test_add_item_appends_to_list(client, user_id):
    saved = await create_list(client, user_id, items=["milk"])
    _, resp = await client.post(
        f"/lists/{saved['id']}/items", json={"user_id": user_id, "name": "  cheese "}
    )
    assert resp.status == 201
    assert resp.json["item"]["name"] == "cheese"
    assert resp.json["item"]["checked"] is False

    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert [i["name"] for i in resp.json["list"]["items"]] == ["milk", "cheese"]


async def test_add_item_records_accepted_suggestion_source(client, user_id):
    saved = await create_list(client, user_id, items=[])
    _, resp = await client.post(
        f"/lists/{saved['id']}/items",
        json={"user_id": user_id, "name": "oat milk", "source": "suggestion"},
    )
    assert resp.status == 201
    assert await inclusion_sources(saved["id"]) == {"oat milk": "suggestion"}


async def test_add_item_404_for_unknown_or_foreign_list(client, user_id):
    _, resp = await client.post(
        f"/lists/{uuid.uuid4()}/items", json={"user_id": user_id, "name": "milk"}
    )
    assert resp.status == 404

    saved = await create_list(client, user_id)
    _, resp = await client.post(
        f"/lists/{saved['id']}/items",
        json={"user_id": str(uuid.uuid4()), "name": "milk"},
    )
    assert resp.status == 404


async def test_add_item_rejects_bad_input(client, user_id):
    saved = await create_list(client, user_id)
    path = f"/lists/{saved['id']}/items"
    for payload in [
        {"user_id": user_id},
        {"user_id": user_id, "name": "   "},
        {"user_id": user_id, "name": 7},
        {"name": "milk"},
        {"user_id": "bad", "name": "milk"},
        {"user_id": user_id, "name": "milk", "source": "recipe"},
        {"user_id": user_id, "name": "milk", "source": None},
    ]:
        _, resp = await client.post(path, json=payload)
        assert resp.status == 400, payload
    _, resp = await client.post("/lists/not-a-uuid/items", json={"user_id": user_id, "name": "x"})
    assert resp.status == 400


async def test_check_and_uncheck_item(client, user_id):
    saved = await create_list(client, user_id, items=["milk"])
    item_id = saved["items"][0]["id"]

    _, resp = await client.patch(
        f"/items/{item_id}", json={"user_id": user_id, "checked": True}
    )
    assert resp.status == 200
    assert resp.json["item"]["checked"] is True

    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.json["list"]["items"][0]["checked"] is True

    _, resp = await client.patch(
        f"/items/{item_id}", json={"user_id": user_id, "checked": False}
    )
    assert resp.json["item"]["checked"] is False


async def test_patch_item_rejects_bad_input(client, user_id):
    saved = await create_list(client, user_id, items=["milk"])
    path = f"/items/{saved['items'][0]['id']}"
    for payload in [
        {"user_id": user_id},
        {"user_id": user_id, "checked": "yes"},
        {"user_id": user_id, "checked": 1},
        {"checked": True},
    ]:
        _, resp = await client.patch(path, json=payload)
        assert resp.status == 400, payload
    _, resp = await client.patch("/items/not-a-uuid", json={"user_id": user_id, "checked": True})
    assert resp.status == 400


async def test_patch_item_404_for_unknown_or_foreign_item(client, user_id):
    _, resp = await client.patch(
        f"/items/{uuid.uuid4()}", json={"user_id": user_id, "checked": True}
    )
    assert resp.status == 404

    saved = await create_list(client, user_id, items=["milk"])
    item_id = saved["items"][0]["id"]
    _, resp = await client.patch(
        f"/items/{item_id}", json={"user_id": str(uuid.uuid4()), "checked": True}
    )
    assert resp.status == 404
    # untouched for the real owner
    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.json["list"]["items"][0]["checked"] is False


# --- Delete: DELETE /lists/<id> ----------------------------------------------


async def test_delete_list_removes_it_and_its_items(client, user_id):
    saved = await create_list(client, user_id, items=["milk", "eggs"])
    _, resp = await client.delete(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.status == 200
    assert resp.json["status"] == "success"

    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.status == 404
    _, resp = await client.get("/lists", params={"user_id": user_id})
    assert resp.json["lists"] == []


async def test_delete_list_twice_returns_404(client, user_id):
    saved = await create_list(client, user_id)
    await client.delete(f"/lists/{saved['id']}", params={"user_id": user_id})
    _, resp = await client.delete(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.status == 404


async def test_delete_list_cannot_delete_other_users_list(client, user_id):
    saved = await create_list(client, user_id)
    _, resp = await client.delete(
        f"/lists/{saved['id']}", params={"user_id": str(uuid.uuid4())}
    )
    assert resp.status == 404
    _, resp = await client.get(f"/lists/{saved['id']}", params={"user_id": user_id})
    assert resp.status == 200


async def test_delete_list_400_for_invalid_ids(client, user_id):
    _, resp = await client.delete("/lists/not-a-uuid", params={"user_id": user_id})
    assert resp.status == 400
    _, resp = await client.delete(f"/lists/{uuid.uuid4()}")
    assert resp.status == 400


# --- Suggestions: GET /recommendations/repurchase, POST /recommendations/outcomes


async def seed_history(user_id, item_name, *days_ago):
    """Backdated Additions of one Item, with its item_trend recomputed."""
    now = datetime.now(timezone.utc)
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        uid = uuid.UUID(user_id)
        await conn.execute('INSERT INTO "user" (id) VALUES ($1) ON CONFLICT DO NOTHING', uid)
        for days in days_ago:
            await conn.execute(
                "INSERT INTO list_inclusion (id, user_id, item_name, included_at) "
                "VALUES ($1, $2, $3, $4)",
                uuid.uuid4(), uid, item_name, now - timedelta(days=days),
            )
        await db._update_item_trend_on_conn(conn, uid, item_name)
    finally:
        await conn.close()


async def suggested(client, user_id):
    _, resp = await client.get("/recommendations/repurchase", params={"user_id": user_id})
    assert resp.status == 200, resp.text
    return resp.json


def suggested_names(body):
    return [s["payload"]["item_name"] for s in body["suggestions"]]


async def test_repurchase_returns_due_items_only(client, user_id):
    await seed_history(user_id, "oat milk", 21, 14, 7)  # cadence 7, 7 days since: due
    await seed_history(user_id, "rice", 30, 1)  # cadence 29, 1 day since: not due
    await seed_history(user_id, "candles", 40)  # one Inclusion: not a habit

    body = await suggested(client, user_id)

    assert suggested_names(body) == ["oat milk"]
    [s] = body["suggestions"]
    assert s["type"] == "repurchase"
    assert s["reason"] == "You've added oat milk to a list 3x; last time 7d ago."
    assert body["known_item_names"] == ["candles", "oat milk", "rice"]


async def test_repurchase_skips_open_items(client, user_id):
    await seed_history(user_id, "oat milk", 21, 14, 7)
    await seed_history(user_id, "eggs", 21, 14, 7)
    await create_list(client, user_id, items=["Oat  Milk"])  # unchecked: Open

    assert "oat milk" not in suggested_names(await suggested(client, user_id))


async def test_repurchase_sorts_by_score_and_caps_at_five(client, user_id):
    for i in range(7):
        await seed_history(user_id, f"item {i}", *[7 * k + i for k in range(i + 2, 0, -1)])

    body = await suggested(client, user_id)

    scores = [s["score"] for s in body["suggestions"]]
    assert len(scores) == 5
    assert scores == sorted(scores, reverse=True)


async def test_repurchase_requires_valid_user_id(client):
    _, resp = await client.get("/recommendations/repurchase")
    assert resp.status == 400
    _, resp = await client.get("/recommendations/repurchase", params={"user_id": "nope"})
    assert resp.status == 400


async def test_dismissal_hides_item_until_the_shopper_adds_it_again(client, user_id):
    await seed_history(user_id, "oat milk", 21, 14, 7)
    [shown] = (await suggested(client, user_id))["suggestions"]

    _, resp = await client.post(
        "/recommendations/outcomes",
        json={"user_id": user_id, "action": "dismissed", "suggestion": shown},
    )
    assert resp.status == 201, resp.text
    assert suggested_names(await suggested(client, user_id)) == []

    # A dismissal older than the Item's last Inclusion no longer applies.
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        await conn.execute(
            "UPDATE recommendation_outcome SET occurred_at = now() - interval '10 days' "
            "WHERE recommendation_id IN (SELECT id FROM recommendation WHERE user_id = $1)",
            uuid.UUID(user_id),
        )
    finally:
        await conn.close()
    assert suggested_names(await suggested(client, user_id)) == ["oat milk"]


async def test_accepted_outcome_stores_what_the_shopper_saw(client, user_id):
    await seed_history(user_id, "oat milk", 21, 14, 7)
    [shown] = (await suggested(client, user_id))["suggestions"]

    _, resp = await client.post(
        "/recommendations/outcomes",
        json={"user_id": user_id, "action": "accepted", "suggestion": shown},
    )
    assert resp.status == 201
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        row = await conn.fetchrow(
            "SELECT r.type, r.payload_json->>'item_name' AS item_name, r.reason, r.score, "
            "o.action FROM recommendation r "
            "JOIN recommendation_outcome o ON o.recommendation_id = r.id WHERE r.user_id = $1",
            uuid.UUID(user_id),
        )
    finally:
        await conn.close()
    assert dict(row) == {
        "type": "repurchase",
        "item_name": "oat milk",
        "reason": shown["reason"],
        "score": shown["score"],
        "action": "accepted",
    }
    # Accepting is not a dismissal: the GET still applies only due-ness and Open items.
    assert suggested_names(await suggested(client, user_id)) == ["oat milk"]


async def test_outcome_rejects_bad_input(client, user_id):
    good = {
        "type": "repurchase",
        "payload": {"item_name": "milk"},
        "reason": "because",
        "score": 0.5,
    }
    cases = [
        {"action": "dismissed", "suggestion": good},  # no user_id
        {"user_id": user_id, "action": "ignored", "suggestion": good},
        {"user_id": user_id, "action": "dismissed"},
        {"user_id": user_id, "action": "dismissed", "suggestion": {**good, "type": "recipe"}},
        {"user_id": user_id, "action": "dismissed", "suggestion": {**good, "payload": {}}},
        {"user_id": user_id, "action": "dismissed", "suggestion": {**good, "score": "high"}},
        {"user_id": user_id, "action": "dismissed", "suggestion": {**good, "score": True}},
    ]
    for payload in cases:
        _, resp = await client.post("/recommendations/outcomes", json=payload)
        assert resp.status == 400, payload
