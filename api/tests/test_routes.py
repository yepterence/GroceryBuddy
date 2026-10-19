"""HTTP-level tests for the grocery list CRUD routes (api/api.py)."""

import uuid


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
