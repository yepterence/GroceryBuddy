from sanic import Sanic
from sanic import Blueprint
from sanic.response import json

bp = Blueprint("lists_blueprint")
app = Sanic("grocery_buddy_server")


@bp.route("/")
async def bp_root(request):
    return json({"server_name": "grocery_buddy_server"})


app.blueprint(bp)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001, debug=True)
