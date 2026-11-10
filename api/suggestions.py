"""Re-purchase Suggestions computed on read from `item_trend` (PRD 02 §4, §4a).

Pure domain logic with no database dependency: `due_suggestions` takes the Shopper's
trends plus what to exclude and returns the Suggestions to show, highest score first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Mapping

from trends import SECONDS_PER_DAY, Trend, _as_utc

SUGGESTION_TYPE = "repurchase"
# An Item is due once this share of its Cadence has passed (PRD 02 §4a).
DUE_FRACTION = 0.8
MAX_SUGGESTIONS = 5
OUTCOME_ACTIONS = ("accepted", "dismissed")


def _days_since(trend: Trend, now: datetime) -> float:
    elapsed = (now - _as_utc(trend.last_included_at)).total_seconds()
    return max(0.0, elapsed / SECONDS_PER_DAY)


def is_due(trend: Trend, now: datetime) -> bool:
    """Whether an Item is due enough to be suggested for re-purchase (PRD 02 §4a).

    Args:
        trend: The Item's `item_trend`: `inclusion_count`, `cadence_days` and
            `last_included_at`.
        now: The time to measure from (UTC, or naive treated as UTC).

    Returns:
        True when the Item has at least `MIN_INCLUSIONS` Inclusions, a known positive
        Cadence, and `days_since >= DUE_FRACTION * cadence_days`. Otherwise False.
        This only decides whether the Item is shown; its ranking score comes from
        `Trend.calculate_score`.
    """
    if not trend.is_eligible or not trend.cadence_days or trend.last_included_at is None:
        return False
    return _days_since(trend, now) >= DUE_FRACTION * trend.cadence_days


def to_suggestion(trend: Trend, now: datetime) -> dict:
    days = round(_days_since(trend, now))
    return {
        "type": SUGGESTION_TYPE,
        "payload": {
            "item_name": trend.item_name,
            "inclusion_count": trend.inclusion_count,
            "last_included_at": _as_utc(trend.last_included_at).isoformat(),
            "cadence_days": trend.cadence_days,
            "next_due_at": _as_utc(trend.next_due_at).isoformat() if trend.next_due_at else None,
        },
        "reason": (
            f"You've added {trend.item_name} to a list {trend.inclusion_count}x; "
            f"last time {days}d ago."
        ),
        "score": trend.calculate_score(now=now),
    }


def due_suggestions(
    trends: Iterable[Trend],
    open_items: set[str],
    dismissed_at: Mapping[str, datetime],
    now: datetime | None = None,
) -> list[dict]:
    """Due Suggestions, highest score first, at most `MAX_SUGGESTIONS`.

    `open_items` are normalized names unchecked on any of the Shopper's lists (F3).
    `dismissed_at` maps a normalized name to its latest dismissal; it stays hidden
    until an Inclusion newer than that dismissal.
    """
    ref_now = _as_utc(now) if now is not None else datetime.now(timezone.utc)
    shown = []
    for trend in trends:
        if trend.item_name in open_items or not is_due(trend, ref_now):
            continue
        dismissed = dismissed_at.get(trend.item_name)
        if dismissed is not None and _as_utc(dismissed) > _as_utc(trend.last_included_at):
            continue
        shown.append(to_suggestion(trend, ref_now))
    shown.sort(key=lambda s: (-s["score"], s["payload"]["item_name"]))
    return shown[:MAX_SUGGESTIONS]
