# version: v2
"""
Volatility cones from daily bars, in the shape the chart's CONES, BATES and
QUARTERLY overlays read ({TICKER}_cones.json / {TICKER}_quarterly_cones.json),
plus the past weekly / monthly cones the Replay page plays back
({TICKER}_historical_cones.json).

Every horizon the chart offers gets cones anchored at the open of the first
daily bar of its period, fanning out to the end of that period:

    DAILY      today and the two previous trading days     gbm/mjd/bates_daily_curr|prev|prev_2
    WEEKLY     this week and last week                     gbm/mjd/bates_curr|prev
    MONTHLY    this month and the two before               gbm/mjd/bates_month_curr|prev|prev_2
    QUARTERLY  this quarter and the seven before           gbm/mjd_quarter_curr|prev1 … prev7
               (the chart shows four; the Replay page all eight)

Model parameters come only from the bars *before* the anchor, so each cone is
the forecast that could have been made when its period opened; the earlier
periods show how past cones played out. Time advances only on the weekdays
the instrument actually trades (read from its own daily bars), so a cone does
not widen over a weekend the market is closed.
"""

from __future__ import annotations

import calendar
import hashlib
import math
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence

import numpy as np

from . import models

SERIES = ("sd3_low", "sd2_low", "sd1_low", "median", "sd1_high", "sd2_high", "sd3_high")

# family → newest-first key suffixes, grid points per trading day, models
FAMILIES = {
    "daily":     (("daily_curr", "daily_prev", "daily_prev_2"), 24, ("gbm", "mjd", "bates")),
    "weekly":    (("curr", "prev"), 6, ("gbm", "mjd", "bates")),
    "monthly":   (("month_curr", "month_prev", "month_prev_2"), 2, ("gbm", "mjd", "bates")),
    "quarterly": (("quarter_curr",) + tuple(f"quarter_prev{i}" for i in range(1, 8)), 1, ("gbm", "mjd")),
}
HISTORY_FAMILIES = ("weekly", "monthly")    # replayed by the Replay page
HISTORY_DAYS = 550                          # ≈ 18 months of anchors, on any trading calendar


@dataclass(frozen=True)
class DailyBar:
    time: datetime      # naive, in the feed's own clock (the same one the chart's candles use)
    open: float
    close: float


def _naive(t) -> datetime:
    if isinstance(t, str):
        t = datetime.fromisoformat(t.replace("Z", "+00:00"))
    elif isinstance(t, (int, float)):
        t = datetime.fromtimestamp(t, tz=timezone.utc)
    if t.tzinfo is not None:
        t = t.astimezone(timezone.utc).replace(tzinfo=None)
    return t


def normalize(bars: Sequence) -> List[DailyBar]:
    """BarData objects or dicts → time-sorted DailyBar list without duplicates."""
    out: Dict[datetime, DailyBar] = {}
    for b in bars:
        get = b.get if isinstance(b, dict) else lambda k, _b=b: getattr(_b, k, None)
        t, o, c = get("time"), get("open"), get("close")
        if t is None or o is None or c is None or not (o > 0 and c > 0):
            continue
        t = _naive(t)
        out[t] = DailyBar(t, float(o), float(c))
    return [out[t] for t in sorted(out)]


def trading_weekdays(bars: Sequence[DailyBar]) -> frozenset:
    """Weekdays the instrument trades on, from its recent daily bars
    (a weekday counts if it has at least half as many bars as the busiest)."""
    counts = Counter(b.time.weekday() for b in bars[-140:])
    top = max(counts.values())
    return frozenset(d for d, n in counts.items() if n >= 0.5 * top)


def _period(d: date, family: str) -> tuple:
    if family == "daily":
        return (d.year, d.month, d.day)
    if family == "weekly":
        iso = d.isocalendar()
        return (iso[0], iso[1])
    if family == "monthly":
        return (d.year, d.month)
    return (d.year, (d.month - 1) // 3)


def _period_end(d: date, family: str) -> date:
    if family == "daily":
        return d
    if family == "weekly":
        return d + timedelta(days=6 - d.weekday())
    month = d.month if family == "monthly" else 3 * ((d.month - 1) // 3) + 3
    return date(d.year, month, calendar.monthrange(d.year, month)[1])


def period_starts(bars: Sequence[DailyBar], family: str) -> List[int]:
    """Index of the first bar of every period, oldest first."""
    starts, last = [], None
    for i, b in enumerate(bars):
        key = _period(b.time.date(), family)
        if key != last:
            starts.append(i)
            last = key
    return starts


def trading_days(start: date, end: date, weekdays: frozenset) -> int:
    """Trading days from start to end inclusive; the anchor day always counts."""
    n, d = 1, start + timedelta(days=1)
    while d <= end:
        n += d.weekday() in weekdays
        d += timedelta(days=1)
    return n


def time_grid(anchor: datetime, horizon: int, steps: int, weekdays: frozenset):
    """Grid points over `horizon` trading days from the anchor, `steps` per
    day, plus the end of the last day → (datetimes, elapsed trading days)."""
    times, tau = [], []
    day, k, step = anchor, 0, timedelta(days=1) / steps
    while k < horizon:
        if k == 0 or day.weekday() in weekdays:
            for s in range(steps):
                times.append(day + s * step)
                tau.append(k + s / steps)
            k, last = k + 1, day
        day += timedelta(days=1)
    times.append(last + timedelta(days=1))
    tau.append(float(horizon))
    return times, np.asarray(tau)


def _decimals(price: float) -> int:
    return max(2, min(6, 5 - math.floor(math.log10(price))))


def _seed(ticker: str, key: str, anchor: datetime) -> int:
    digest = hashlib.sha256(f"{ticker}|{key}|{anchor.isoformat()}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


def _cone(ticker: str, bars: List[DailyBar], closes: np.ndarray, idx: int, family: str,
          weekdays: frozenset, archive: bool = False) -> Optional[Dict[str, dict]]:
    """Every model's cone anchored at bars[idx] → {model: entry}, or None
    without enough history before the anchor. archive=True uses the Replay
    page's cheaper Monte Carlo settings."""
    _, steps, family_models = FAMILIES[family]
    params = models.estimate(closes[:idx])          # strictly before the anchor bar
    if params is None:
        return None
    anchor = bars[idx]
    start = anchor.time.date()
    horizon = trading_days(start, _period_end(start, family), weekdays)
    times, tau = time_grid(anchor.time, horizon, steps, weekdays)
    dates = [t.strftime("%Y-%m-%d %H:%M") for t in times]
    places = _decimals(anchor.open)
    out = {}
    for model in family_models:
        q = models.quantiles(model, params, tau, seed=_seed(ticker, f"{model}_{family}", anchor.time),
                             archive=archive)
        prices = anchor.open * np.exp(q)
        entry = {"dates": dates}
        entry.update({name: [round(float(v), places) for v in prices[:, j]]
                      for j, name in enumerate(SERIES)})
        entry.update({
            "model": model,
            "anchor": {"time": anchor.time.strftime("%Y-%m-%d %H:%M"),
                       "price": round(anchor.open, places)},
            "horizon_days": horizon,
            "params": params.as_dict(),
        })
        out[model] = entry
    return out


def build(ticker: str, bars_in: Sequence) -> Optional[dict]:
    """All cones for one ticker → {"cones": {...}, "quarterly": {...},
    "quarterly_anchors": [...], "weekdays": [...], "last_bar": datetime},
    or None without enough history."""
    bars = normalize(bars_in)
    if len(bars) < models.MIN_RETURNS + 2:
        return None
    weekdays = trading_weekdays(bars)
    closes = np.array([b.close for b in bars])
    cones: Dict[str, dict] = {}
    quarterly: Dict[str, dict] = {}
    quarterly_anchors: List[dict] = []

    for family, (suffixes, _, _) in FAMILIES.items():
        for suffix, idx in zip(suffixes, reversed(period_starts(bars, family))):
            cone = _cone(ticker, bars, closes, idx, family, weekdays)
            if cone is None:
                continue
            for model, entry in cone.items():
                (quarterly if family == "quarterly" else cones)[f"{model}_{suffix}"] = entry
            if family == "quarterly":
                quarterly_anchors.append({"label": suffix,
                                          "anchor_date": bars[idx].time.strftime("%Y-%m-%d")})

    return {"cones": cones, "quarterly": quarterly, "quarterly_anchors": quarterly_anchors,
            "weekdays": sorted(weekdays), "last_bar": bars[-1].time}


def history(ticker: str, bars_in: Sequence, previous: Optional[dict] = None) -> Optional[dict]:
    """Past weekly and monthly cones for the Replay page →
    {"weekly": {"YYYY-MM-DD": {model: entry}}, "monthly": {...}}.

    Covers the anchors of the last HISTORY_DAYS calendar days. A past
    period's cone never changes, so anchors already in `previous` (this
    producer's earlier file) with the same anchor price are reused; only
    the current period is always recomputed."""
    bars = normalize(bars_in)
    if len(bars) < models.MIN_RETURNS + 2:
        return None
    weekdays = trading_weekdays(bars)
    closes = np.array([b.close for b in bars])
    since = bars[-1].time - timedelta(days=HISTORY_DAYS)
    out: Dict[str, Dict[str, dict]] = {}
    for family in HISTORY_FAMILIES:
        old = (previous or {}).get(family) or {}
        starts = period_starts(bars, family)
        bucket: Dict[str, dict] = {}
        for n, idx in enumerate(starts):
            if bars[idx].time < since:
                continue
            key = bars[idx].time.strftime("%Y-%m-%d")
            cached = old.get(key)
            current = n == len(starts) - 1
            if (not current and cached and "gbm" in cached
                    and cached["gbm"].get("anchor", {}).get("price")
                    == round(bars[idx].open, _decimals(bars[idx].open))):
                bucket[key] = cached
                continue
            cone = _cone(ticker, bars, closes, idx, family, weekdays, archive=True)
            if cone is not None:
                bucket[key] = cone
        out[family] = bucket
    return out
