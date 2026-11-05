"""Trend calculation and re-purchase scoring (PRD 01 & PRD 02).

Pure domain logic with no database dependency. `Trend` derives `inclusion_count`,
`cadence_days` (median interval between inclusion sessions), `last_included_at`,
and `next_due_at`, and calculates the frequency + recency score at read time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Iterable

SECONDS_PER_DAY = 86400.0
DEFAULT_FREQ_NORM = 5
DUE_RATIO_CAP = 1.5
MIN_INCLUSIONS = 2
# Measured from the first addition of a session, so a run of additions each
# under 12h apart cannot chain into one unbounded session.
SESSION_WINDOW = timedelta(hours=12)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@dataclass
class Trend:
    item_name: str
    inclusion_count: int = 0
    last_included_at: datetime | None = None
    cadence_days: float | None = None
    next_due_at: datetime | None = None

    def increment_one(self) -> int:
        """Increment inclusion_count by 1 and return the updated count."""
        self.inclusion_count += 1
        return self.inclusion_count

    def extract_cadence(self, timestamps: Iterable[datetime]) -> float | None:
        """Compute median cadence in days from an ordered sequence of timestamps.

        Additions within `SESSION_WINDOW` of a session's first addition collapse
        into one inclusion, so adding the same item to several lists in one
        sitting does not skew cadence toward zero. This is timezone-independent.
        Updates `inclusion_count`, `last_included_at`, `cadence_days`, and
        `next_due_at`.
        """
        ordered = sorted(_as_utc(ts) for ts in timestamps)
        if not ordered:
            return self.cadence_days

        self.inclusion_count = 0
        deduped: list[datetime] = []
        session_start: datetime | None = None
        for ts in ordered:
            if session_start is None or ts - session_start >= SESSION_WINDOW:
                self.increment_one()
                deduped.append(ts)
                session_start = ts
            else:
                # Keep the latest timestamp within the session.
                deduped[-1] = ts

        self.last_included_at = deduped[-1]
        if len(deduped) < 2:
            self.cadence_days = None
            self.next_due_at = None
            return None

        intervals = [
            (curr - prev).total_seconds() / SECONDS_PER_DAY
            for prev, curr in zip(deduped, deduped[1:])
        ]
        self.cadence_days = float(median(intervals))
        self.next_due_at = self.last_included_at + timedelta(days=self.cadence_days)
        return self.cadence_days

    @classmethod
    def from_inclusions(
        cls, item_name: str, timestamps: Iterable[datetime]
    ) -> "Trend":
        """Build a Trend from raw `list_inclusion` timestamps (Approach B)."""
        trend = cls(item_name=item_name)
        trend.extract_cadence(timestamps)
        return trend

    @property
    def is_eligible(self) -> bool:
        """PRD 02 step 4: a re-purchase needs at least `MIN_INCLUSIONS` inclusions."""
        return self.inclusion_count >= MIN_INCLUSIONS

    def calculate_score(
        self,
        now: datetime | None = None,
        freq_norm: int = DEFAULT_FREQ_NORM,
    ) -> float:
        """Score re-purchase urgency in [0, 1] per PRD 02 section 4.

        Combines habit strength (`frequency_score`) with recency (`due_score`).
        Items below `MIN_INCLUSIONS` are not a re-purchase habit and score 0.
        Falls back to `frequency_score` when cadence is not yet established.
        """
        if not self.is_eligible:
            return 0.0

        frequency_score = min(self.inclusion_count / float(freq_norm), 1.0)
        if (
            self.cadence_days is None
            or self.cadence_days <= 0
            or self.last_included_at is None
        ):
            return frequency_score

        ref_now = _as_utc(now) if now is not None else datetime.now(timezone.utc)
        last_utc = _as_utc(self.last_included_at)
        days_since = max(0.0, (ref_now - last_utc).total_seconds() / SECONDS_PER_DAY)
        due_ratio = days_since / float(self.cadence_days)
        clamped = min(max(due_ratio, 0.0), DUE_RATIO_CAP)
        due_score = clamped / DUE_RATIO_CAP
        return 0.5 * frequency_score + 0.5 * due_score
