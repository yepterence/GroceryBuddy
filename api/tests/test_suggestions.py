"""Unit tests for api/suggestions.py (no database required)."""

from datetime import datetime, timedelta, timezone

import pytest

from suggestions import MAX_SUGGESTIONS, due_suggestions, is_due
from trends import Trend

pytestmark = pytest.mark.no_db

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


def trend(name, count=3, cadence=7.0, days_ago=7.0):
    last = NOW - timedelta(days=days_ago)
    return Trend(
        item_name=name,
        inclusion_count=count,
        last_included_at=last,
        cadence_days=cadence,
        next_due_at=last + timedelta(days=cadence) if cadence else None,
    )


def names(suggestions):
    return [s["payload"]["item_name"] for s in suggestions]


def test_due_once_eight_tenths_of_cadence_has_passed():
    assert is_due(trend("milk", cadence=10, days_ago=8), NOW)
    assert not is_due(trend("milk", cadence=10, days_ago=7.9), NOW)


def test_one_inclusion_or_unknown_cadence_is_never_due():
    assert not is_due(trend("milk", count=1, days_ago=30), NOW)
    assert not is_due(trend("milk", cadence=None, days_ago=30), NOW)


def test_suggestion_has_the_shape_and_reason_the_shopper_sees():
    [s] = due_suggestions([trend("oat milk", count=4, cadence=7, days_ago=9)], set(), {}, NOW)
    assert s["type"] == "repurchase"
    assert s["payload"]["item_name"] == "oat milk"
    assert s["payload"]["inclusion_count"] == 4
    assert s["payload"]["cadence_days"] == 7
    assert s["reason"] == "You've added oat milk to a list 4x; last time 9d ago."
    assert 0 < s["score"] <= 1


def test_sorted_by_score_and_capped():
    trends = [trend(f"item {i}", count=2 + i, days_ago=7 + i) for i in range(MAX_SUGGESTIONS + 2)]
    shown = due_suggestions(trends, set(), {}, NOW)
    assert len(shown) == MAX_SUGGESTIONS
    scores = [s["score"] for s in shown]
    assert scores == sorted(scores, reverse=True)
    assert "item 0" not in names(shown)  # the weakest habit is cut


def test_open_items_are_excluded():
    shown = due_suggestions([trend("milk"), trend("eggs")], {"milk"}, {}, NOW)
    assert names(shown) == ["eggs"]


def test_dismissal_hides_until_a_newer_inclusion():
    milk = trend("milk", days_ago=7)
    before_last_add = NOW - timedelta(days=8)
    after_last_add = NOW - timedelta(days=1)

    assert names(due_suggestions([milk], set(), {"milk": after_last_add}, NOW)) == []
    assert names(due_suggestions([milk], set(), {"milk": before_last_add}, NOW)) == ["milk"]
