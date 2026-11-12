#!/usr/bin/env python3
"""Load scripts/seed/trends.csv as past grocery lists for one Shopper.

Each row is one Addition. Rows that share list_date become one list titled
"grocery list - <date>". included_at is that date at 15:00 UTC, so weekly rows
land in separate Inclusions (the session window is 12 hours). Items are checked
off, so none of them count as Open and block a Suggestion.

    gb-api/bin/python scripts/seed-trends.py [seed.csv]

seed.csv defaults to scripts/seed/trends.csv.

--new-shopper (used by startup.sh --demo): always generate a fresh user id, seed
the CSV for that Shopper, print DEMO_USER_ID=<uuid> for Vite. Without the flag,
reuse the Shopper with the most recent list activity, or create one when the DB
is empty.

Re-running replaces that Shopper's
lists titled "grocery list - …", then recomputes item_trend.
"""

import asyncio
import csv
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

import db  # noqa: E402
from items import normalize_item_name  # noqa: E402
from suggestions import is_due  # noqa: E402
from trends import Trend  # noqa: E402

CSV_PATH = Path(__file__).resolve().parent / "seed" / "trends.csv"
TITLE = "grocery list - {date}"
SEED_TITLE_PREFIX = "grocery list - "


def _load_rows(csv_path):
    """list_date -> display names, in file order."""
    by_date = defaultdict(list)
    with csv_path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            date = row["list_date"].strip()
            name = row["item_name"].strip()
            datetime.strptime(date, "%Y-%m-%d")  # reject a bad date before any write
            if not name:
                raise SystemExit(f"blank item_name on {date}")
            by_date[date].append(name)
    if not by_date:
        raise SystemExit(f"{csv_path} has no rows")
    return dict(sorted(by_date.items()))


async def _current_user_id(conn):
    """The shopper with the latest item activity, or a new id when there is none."""
    row = await conn.fetchrow(
        'SELECT u.id FROM "user" u '
        "LEFT JOIN needed_item n ON n.user_id = u.id "
        "GROUP BY u.id "
        "ORDER BY max(n.created_at) DESC NULLS LAST, u.id "
        "LIMIT 1"
    )
    if row is not None:
        return row["id"], True
    return uuid.uuid4(), False


async def _resolve_user_id(conn, new_shopper: bool):
    if new_shopper:
        return uuid.uuid4(), False
    return await _current_user_id(conn)


async def _seed(by_date, *, new_shopper: bool = False):
    async with db._get_pool().acquire() as conn:
        async with conn.transaction():
            user_id, existed = await _resolve_user_id(conn, new_shopper)
            await conn.execute(
                'INSERT INTO "user" (id) VALUES ($1) ON CONFLICT DO NOTHING', user_id
            )
            await conn.execute(
                "DELETE FROM list_inclusion WHERE user_id = $1 AND list_id IN ("
                "  SELECT id FROM grocery_list WHERE user_id = $1 AND title LIKE $2"
                ")",
                user_id,
                SEED_TITLE_PREFIX + "%",
            )
            await conn.execute(
                "DELETE FROM grocery_list WHERE user_id = $1 AND title LIKE $2",
                user_id,
                SEED_TITLE_PREFIX + "%",
            )
            names = set()
            for date, item_names in by_date.items():
                included_at = datetime.strptime(date, "%Y-%m-%d").replace(
                    hour=15, tzinfo=timezone.utc
                )
                list_id = uuid.uuid4()
                await conn.execute(
                    "INSERT INTO grocery_list (id, user_id, title) VALUES ($1, $2, $3)",
                    list_id,
                    user_id,
                    TITLE.format(date=date),
                )
                for name in item_names:
                    key = normalize_item_name(name)
                    names.add(key)
                    await conn.execute(
                        "INSERT INTO needed_item "
                        "(id, user_id, list_id, name, checked, created_at) "
                        "VALUES ($1, $2, $3, $4, TRUE, $5)",
                        uuid.uuid4(),
                        user_id,
                        list_id,
                        name,
                        included_at,
                    )
                    await conn.execute(
                        "INSERT INTO list_inclusion "
                        "(id, user_id, item_name, list_id, included_at, source) "
                        "VALUES ($1, $2, $3, $4, $5, 'manual')",
                        uuid.uuid4(),
                        user_id,
                        key,
                        list_id,
                        included_at,
                    )
            trends = []
            for key in sorted(names):
                trends.append(await db.update_item_trend(user_id, key, conn=conn))
    return user_id, existed, trends


def _print_trends(trends):
    now = datetime.now(timezone.utc)
    print(f"{'item':<12} {'count':>5} {'cadence_days':>12} {'last_included':<12} due")
    for row in trends:
        trend = Trend(
            item_name=row["item_name"],
            inclusion_count=row["inclusion_count"],
            last_included_at=datetime.fromisoformat(row["last_included_at"]),
            cadence_days=row["cadence_days"],
            next_due_at=(
                datetime.fromisoformat(row["next_due_at"]) if row["next_due_at"] else None
            ),
        )
        last = trend.last_included_at.date().isoformat()
        cadence = f"{trend.cadence_days:.0f}" if trend.cadence_days is not None else "-"
        print(
            f"{trend.item_name:<12} {trend.inclusion_count:>5} {cadence:>12} {last:<12} "
            f"{'yes' if is_due(trend, now) else 'no'}"
        )


def main():
    args = sys.argv[1:]
    new_shopper = False
    if args and args[0] == "--new-shopper":
        new_shopper = True
        args = args[1:]
    if len(args) > 1:
        raise SystemExit("usage: scripts/seed-trends.py [--new-shopper] [seed.csv]")
    csv_path = Path(args[0]) if args else CSV_PATH
    if not csv_path.is_file():
        raise SystemExit(f"seed file not found: {csv_path}")
    by_date = _load_rows(csv_path)
    additions = sum(len(names) for names in by_date.values())

    async def run():
        await db.init_pool()
        try:
            return await _seed(by_date, new_shopper=new_shopper)
        finally:
            await db.close_pool()

    user_id, existed, trends = asyncio.run(run())
    # startup.sh reads this line and exports VITE_DEMO_USER_ID for npm run dev.
    print(f"DEMO_USER_ID={user_id}")
    if new_shopper:
        print("Demo shopper: generated a new id.")
    else:
        print("Using the existing shopper." if existed else "No shopper yet; generated a new id.")
    print(f"Loaded {len(by_date)} lists, {additions} additions for {user_id}")
    _print_trends(trends)


if __name__ == "__main__":
    main()
