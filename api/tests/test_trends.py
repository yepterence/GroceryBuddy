"""Unit tests for api/trends.py (no database required)."""

from datetime import datetime, timedelta, timezone

import pytest

from trends import Trend

pytestmark = pytest.mark.no_db

T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


def test_increment_one_updates_inclusion_count():
    trend = Trend(item_name="milk")
    assert trend.inclusion_count == 0
    assert trend.increment_one() == 1
    assert trend.increment_one() == 2
    assert trend.inclusion_count == 2


def test_first_inclusion_leaves_cadence_and_next_due_none():
    trend = Trend.from_inclusions("milk", [T0])
    assert trend.inclusion_count == 1
    assert trend.last_included_at == T0
    assert trend.cadence_days is None
    assert trend.next_due_at is None


def test_second_inclusion_computes_cadence_and_next_due():
    t1 = T0 + timedelta(days=7)
    trend = Trend.from_inclusions("milk", [T0, t1])
    assert trend.inclusion_count == 2
    assert trend.last_included_at == t1
    assert trend.cadence_days == pytest.approx(7.0)
    assert trend.next_due_at == t1 + timedelta(days=7)


def test_median_cadence_ignores_vacation_outlier():
    # Intervals: 7d, 7d, 63d (vacation), 7d -> sorted [7, 7, 7, 63] -> median 7.0
    timestamps = [
        T0,
        T0 + timedelta(days=7),
        T0 + timedelta(days=14),
        T0 + timedelta(days=77),
        T0 + timedelta(days=84),
    ]
    trend = Trend.from_inclusions("milk", timestamps)
    assert trend.inclusion_count == 5
    assert trend.cadence_days == pytest.approx(7.0)
    assert trend.next_due_at == timestamps[-1] + timedelta(days=7)


def test_same_day_additions_collapse_to_single_daily_inclusion():
    same_day_later = T0 + timedelta(hours=3)
    trend = Trend.from_inclusions("milk", [T0, same_day_later])
    assert trend.inclusion_count == 1
    assert trend.last_included_at == same_day_later
    assert trend.cadence_days is None
    assert trend.next_due_at is None


def test_same_day_additions_followed_by_next_week_preserve_weekly_cadence():
    same_day_later = T0 + timedelta(hours=2)
    next_week = T0 + timedelta(days=7, hours=2)
    trend = Trend.from_inclusions("milk", [T0, same_day_later, next_week])
    assert trend.inclusion_count == 2
    assert trend.cadence_days == pytest.approx(7.0)
    assert trend.next_due_at == next_week + timedelta(days=7)


def test_calculate_score_falls_back_to_frequency_when_no_cadence():
    trend = Trend.from_inclusions("milk", [T0])
    # inclusion_count = 1, freq_norm = 5 -> 0.2
    assert trend.calculate_score(now=T0 + timedelta(days=3)) == pytest.approx(0.2)


def test_calculate_score_combines_frequency_and_recency():
    t1 = T0 + timedelta(days=7)
    trend = Trend.from_inclusions("milk", [T0, t1])  # count=2, cadence=7d

    # Right when added (days_since = 0): freq_score = 2/5 = 0.4, due_score = 0 -> 0.2
    assert trend.calculate_score(now=t1) == pytest.approx(0.2)

    # Exactly when due (days_since = 7): due_ratio = 1.0 -> due_score = 1.0/1.5
    score_at_due = trend.calculate_score(now=t1 + timedelta(days=7))
    assert score_at_due == pytest.approx(0.5 * 0.4 + 0.5 * (1.0 / 1.5))

    # Overdue beyond cap (days_since = 21 -> due_ratio = 3.0 -> clamped to 1.5 -> due_score = 1.0)
    score_overdue = trend.calculate_score(now=t1 + timedelta(days=21))
    assert score_overdue == pytest.approx(0.5 * 0.4 + 0.5 * 1.0)
