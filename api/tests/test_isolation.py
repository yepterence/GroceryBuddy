"""Tenant isolation: a user can only see their own lists.

There is no sharing yet. When it exists, it must be an explicit grant; until
then another user's list must be indistinguishable from one that doesn't exist.
"""

import uuid

import pytest


@pytest.fixture
def alice():
    return str(uuid.uuid4())


@pytest.fixture
def bob():
    return str(uuid.uuid4())


async def make_list(client, user_id, title, items):
    _, resp = await client.post(
        "/lists", json={"user_id": user_id, "title": title, "items": items}
    )
    assert resp.status == 201, resp.text
    return resp.json["list"]


async def test_index_only_shows_own_lists(client, alice, bob):
    a = await make_list(client, alice, "Alice groceries", ["almonds"])
    b = await make_list(client, bob, "Bob groceries", ["bagels"])

    _, resp = await client.get("/lists", params={"user_id": alice})
    assert [l["id"] for l in resp.json["lists"]] == [a["id"]]

    _, resp = await client.get("/lists", params={"user_id": bob})
    assert [l["id"] for l in resp.json["lists"]] == [b["id"]]


async def test_index_never_leaks_other_users_titles_or_items(client, alice, bob):
    await make_list(client, alice, "Secret surprise party", ["cake", "balloons"])
    await make_list(client, bob, "Bob", ["bagels"])

    _, resp = await client.get("/lists", params={"user_id": bob})
    body = resp.text
    for secret in ("Secret surprise party", "cake", "balloons"):
        assert secret not in body


async def test_cannot_open_another_users_list_even_with_its_id(client, alice, bob):
    a = await make_list(client, alice, "Alice groceries", ["almonds"])

    _, resp = await client.get(f"/lists/{a['id']}", params={"user_id": bob})

    assert resp.status == 404
    assert "almonds" not in resp.text
    assert "Alice groceries" not in resp.text


async def test_other_users_list_looks_identical_to_a_nonexistent_one(client, alice, bob):
    """404 for both, same body: the API must not reveal that someone else's list exists."""
    a = await make_list(client, alice, "Alice groceries", ["almonds"])

    _, theirs = await client.get(f"/lists/{a['id']}", params={"user_id": bob})
    _, missing = await client.get(f"/lists/{uuid.uuid4()}", params={"user_id": bob})

    assert theirs.status == missing.status == 404
    assert theirs.json == missing.json


async def test_owner_still_sees_list_after_other_user_probes_it(client, alice, bob):
    a = await make_list(client, alice, "Alice groceries", ["almonds"])
    await client.get(f"/lists/{a['id']}", params={"user_id": bob})
    await client.delete(f"/lists/{a['id']}", params={"user_id": bob})

    _, resp = await client.get(f"/lists/{a['id']}", params={"user_id": alice})
    assert resp.status == 200
    assert [i["name"] for i in resp.json["list"]["items"]] == ["almonds"]


async def test_users_can_have_identically_named_lists_without_mixing(client, alice, bob):
    a = await make_list(client, alice, "Groceries", ["almonds"])
    b = await make_list(client, bob, "Groceries", ["bagels"])

    _, resp = await client.get(f"/lists/{a['id']}", params={"user_id": alice})
    assert [i["name"] for i in resp.json["list"]["items"]] == ["almonds"]
    _, resp = await client.get(f"/lists/{b['id']}", params={"user_id": bob})
    assert [i["name"] for i in resp.json["list"]["items"]] == ["bagels"]


async def test_user_id_is_required_to_read(client, alice):
    a = await make_list(client, alice, "Alice groceries", ["almonds"])

    _, resp = await client.get("/lists")
    assert resp.status == 400
    _, resp = await client.get(f"/lists/{a['id']}")
    assert resp.status == 400


@pytest.mark.skip(reason="list sharing is not implemented yet")
async def test_shared_list_is_visible_to_the_grantee_only(client, alice, bob):
    """Placeholder for the sharing feature: an explicit grant lets bob read
    alice's list; a third user (and bob before the grant) still gets a 404."""
    raise NotImplementedError
