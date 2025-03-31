#!/usr/bin/env python3

from sanic import Sanic
from sanic import Blueprint
from sanic.response import json
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
    scraped_flyer = Scraper(locale, postal_code)
    price_payload = scraped_flyer.get_price_dict()
    return json(scraped_flyer)


app.blueprint(bp)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001, debug=True)
