#!/usr/bin/env python3

import asyncio
import uuid

import asyncpg
from sanic import Sanic
from sanic import Blueprint
from sanic.response import json

import db
from scraper import Scraper

bp = Blueprint("lists_blueprint")
app = Sanic("grocery_buddy_server")


@bp.route("/")
async def bp_root(request):
    return json({"server_name": "grocery_buddy_server"})


@bp.route("/get-prices")
async def get_flyer_prices(request):
    locale = request.args.get("locale")
    postal_code = request.args.get("postal_code")
    items = request.args.get("list-items")
    scraped_flyer = Scraper(locale, postal_code)
    price_payload = scraped_flyer.get_price_dict(items)
    return json(price_payload)


def _error(message, status=400):
    return json({"status": "error", "message": message}, status=status)


# Database unreachable or too slow (timeouts, refused/reset connections, closed pool).
# OSError already covers TimeoutError/ConnectionError; asyncio.TimeoutError is a
# separate class before Python 3.11 and an alias after, so de-duplicate.
DB_UNAVAILABLE_ERRORS = tuple(
    dict.fromkeys(
        (
            asyncio.TimeoutError,
            OSError,
            asyncpg.PostgresConnectionError,
            asyncpg.CannotConnectNowError,  # Postgres still starting up (e.g. fresh container)
            asyncpg.InterfaceError,
        )
    )
)


@app.exception(*DB_UNAVAILABLE_ERRORS)
async def handle_db_unavailable(request, exception):
    return _error("database unavailable, try again shortly", 503)


def _parse_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _clean_items(raw):
    """Return a list of non-empty stripped names, or None if invalid."""
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(i, str) for i in raw):
        return None
    return [i.strip() for i in raw if i.strip()]


@bp.post("/lists")
async def save_list(request):
    """Save a generated list. Body: {"user_id": uuid, "title": str, "items": [str]}"""
    data = request.json
    if not isinstance(data, dict):
        return _error("JSON body required")
    user_id = _parse_uuid(data.get("user_id"))
    title = data.get("title")
    items = _clean_items(data.get("items"))
    if user_id is None:
        return _error("valid user_id (uuid) is required")
    if not isinstance(title, str) or not title.strip():
        return _error("title is required")
    if items is None:
        return _error("items must be a list of strings")
    created = await db.create_list(user_id, title.strip(), items)
    return json({"status": "success", "list": created}, status=201)


@bp.get("/lists")
async def list_lists(request):
    user_id = _parse_uuid(request.args.get("user_id"))
    if user_id is None:
        return _error("valid user_id (uuid) is required")
    return json({"status": "success", "lists": await db.get_lists(user_id)})


@bp.get("/lists/<list_id:str>")
async def read_list(request, list_id):
    user_id = _parse_uuid(request.args.get("user_id"))
    list_uuid = _parse_uuid(list_id)
    if user_id is None or list_uuid is None:
        return _error("valid user_id and list id (uuid) are required")
    found = await db.get_list(user_id, list_uuid)
    if found is None:
        return _error("list not found", 404)
    return json({"status": "success", "list": found})


@bp.delete("/lists/<list_id:str>")
async def remove_list(request, list_id):
    user_id = _parse_uuid(request.args.get("user_id"))
    list_uuid = _parse_uuid(list_id)
    if user_id is None or list_uuid is None:
        return _error("valid user_id and list id (uuid) are required")
    if not await db.delete_list(user_id, list_uuid):
        return _error("list not found", 404)
    return json({"status": "success"})


@bp.post("/lists/<list_id:str>/items")
async def create_item(request, list_id):
    """Body: {"user_id": uuid, "name": str}"""
    data = request.json
    if not isinstance(data, dict):
        return _error("JSON body required")
    user_id = _parse_uuid(data.get("user_id"))
    list_uuid = _parse_uuid(list_id)
    name = data.get("name")
    if user_id is None or list_uuid is None:
        return _error("valid user_id and list id (uuid) are required")
    if not isinstance(name, str) or not name.strip():
        return _error("name is required")
    item = await db.add_item(user_id, list_uuid, name.strip())
    if item is None:
        return _error("list not found", 404)
    return json({"status": "success", "item": item}, status=201)


@bp.patch("/items/<item_id:str>")
async def update_item(request, item_id):
    """Body: {"user_id": uuid, "checked": bool}"""
    data = request.json
    if not isinstance(data, dict):
        return _error("JSON body required")
    user_id = _parse_uuid(data.get("user_id"))
    item_uuid = _parse_uuid(item_id)
    checked = data.get("checked")
    if user_id is None or item_uuid is None:
        return _error("valid user_id and item id (uuid) are required")
    if not isinstance(checked, bool):
        return _error("checked must be a boolean")
    item = await db.set_item_checked(user_id, item_uuid, checked)
    if item is None:
        return _error("item not found", 404)
    return json({"status": "success", "item": item})


app.blueprint(bp)
app.before_server_start(db.init_pool)
app.after_server_stop(db.close_pool)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001, debug=True)
