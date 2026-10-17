# version: v1
"""
Rolling probability bands from daily bars, in the shapes the chart's BANDS
overlay, the Pulse Room and the Replay page read.

Where a cone is one forecast per calendar period, the bands re-anchor every
trading day:

- Each trading day's forecast starts at that day's open. The volatility level
  comes from the last WINDOW trading days before the open. The shape (jumps;
  Bates vol of vol and correlation; long-run variance) comes from the cones'
  ~250-day window. So the bands react to a volatility change within weeks,
  while the tails keep their long-run shape.
- History: one point per day, half a trading day after the open, at that
  horizon's ±1/2/3-sigma quantiles. The chart joins and smooths those
  points, so the envelope follows price at a roughly constant width.
- The newest day is also projected forward FORWARD_DAYS trading days, one
  point per trading day.
- `mean` is the shared centre of all three models, the anchor price (the
  models have zero expected log return, so the median is the anchor).

Nothing uses data from after an anchor's open.

Files:
    {T}_bands.json          timestamps / mean / {gbm|mjd|bat}_{1|2|3}sd_{high|low}
    {T}_bands_replay.json   bands_replay_v2: one forward fan per daily anchor,
                            for the Replay page
"""

from __future__ import annotations

import dataclasses
import math
from datetime import timedelta
from typing import Dict, List, Optional, Sequence

import numpy as np

from . import cones, models

WINDOW = 60               # trading days that set the band width
HISTORY_DAYS = 260        # daily anchors in {T}_bands.json (about a year)
REPLAY_DAYS = 400         # daily anchors in {T}_bands_replay.json (≈ 18 months)
FORWARD_DAYS = 20         # trading days projected from the newest anchor
SELECT_TAU = 0.5          # history point: half a trading day after the open

MODELS = ("gbm", "mjd", "bates")
LIVE_PREFIX = {"gbm": "gbm", "mjd": "mjd", "bates": "bat"}   # the chart spells Bates "bat_"
CHANNELS = cones.SERIES   # sd3_low … median … sd3_high, in Z_LEVELS order


def recent_params(closes: np.ndarray, window: int = WINDOW) -> Optional[models.Params]:
    """Cone parameters from the long window, with the diffusive volatility
    (and Bates' starting variance) taken from the last `window` returns that
    are not jumps (models.jump_mask, the cones' own jump test)."""
    base = models.estimate(closes)
    if base is None:
        return None
    c = np.asarray(closes, dtype=float)[-(models.LOOKBACK + 1):]
    c = c[np.isfinite(c) & (c > 0)]
    r = np.diff(np.log(c))
    recent = r[-window:][~models.jump_mask(r)[-window:]]
    if recent.size < 20:
        return base
    sigma = float(np.std(recent, ddof=1))
    if not math.isfinite(sigma) or sigma <= 0:
        return base
    return dataclasses.replace(base, sigma=sigma, v0=sigma * sigma)


def _forward_times(anchor, horizon: int, weekdays: frozenset) -> List:
    """00:00 of each of the next `horizon` trading days after the anchor's day."""
    out, day = [], anchor.replace(hour=0, minute=0, second=0, microsecond=0)
    while len(out) < horizon:
        day += timedelta(days=1)
        if day.weekday() in weekdays:
            out.append(day)
    return out


def _fmt(t) -> str:
    return t.strftime("%Y-%m-%d %H:%M")


def _quantile_prices(model: str, p: models.Params, price: float, tau, seed: int,
                     archive: bool = False) -> np.ndarray:
    return price * np.exp(models.quantiles(model, p, tau, seed=seed, archive=archive))


class _Prepared:
    """Bars, calendar and per-anchor parameters shared by live() and replay()."""

    def __init__(self, bars_in: Sequence):
        self.bars = cones.normalize(bars_in)
        self.ok = len(self.bars) >= models.MIN_RETURNS + 2
        if not self.ok:
            return
        self.weekdays = cones.trading_weekdays(self.bars)
        self.closes = np.array([b.close for b in self.bars])
        self._params: Dict[int, Optional[models.Params]] = {}

    def anchors(self, days: int) -> List[int]:
        first = models.MIN_RETURNS + 1
        return list(range(max(first, len(self.bars) - days), len(self.bars)))

    def params(self, i: int) -> Optional[models.Params]:
        if i not in self._params:
            self._params[i] = recent_params(self.closes[:i])     # strictly before the anchor bar
        return self._params[i]


_SELECT = np.array([SELECT_TAU])
_FORWARD = np.arange(1, FORWARD_DAYS + 1, dtype=float)


def live(ticker: str, bars_in: Sequence) -> Optional[dict]:
    """{T}_bands.json body: one point per trading day for the last
    HISTORY_DAYS anchors, then the newest anchor's forward fan. None without
    enough history."""
    prep = _Prepared(bars_in)
    if not prep.ok:
        return None
    stamps: List[str] = []
    mean: List[float] = []
    series: Dict[str, List[float]] = {f"{LIVE_PREFIX[m]}_{k}sd_{side}": []
                                      for m in MODELS for k in (1, 2, 3) for side in ("high", "low")}

    def push(q_by_model: Dict[str, np.ndarray], centre: float, places: int):
        mean.append(round(centre, places))
        for m, q in q_by_model.items():
            pre = LIVE_PREFIX[m]
            for k in (1, 2, 3):
                series[f"{pre}_{k}sd_high"].append(round(float(q[3 + k]), places))
                series[f"{pre}_{k}sd_low"].append(round(float(q[3 - k]), places))

    idx = prep.anchors(HISTORY_DAYS)
    for i in idx:
        p = prep.params(i)
        if p is None:
            continue
        a = prep.bars[i]
        q = {m: _quantile_prices(m, p, a.open, _SELECT, cones._seed(ticker, f"band_{m}", a.time))[0]
             for m in MODELS}
        stamps.append(_fmt(a.time + timedelta(days=SELECT_TAU)))
        push(q, a.open, cones._decimals(a.open))

    newest = idx[-1] if idx else None
    p = prep.params(newest) if newest is not None else None
    if p is None or not stamps:
        return None
    a = prep.bars[newest]
    fwd = {m: _quantile_prices(m, p, a.open, _FORWARD, cones._seed(ticker, f"band_fwd_{m}", a.time))
           for m in MODELS}
    for j, t in enumerate(_forward_times(a.time, FORWARD_DAYS, prep.weekdays)):
        stamps.append(_fmt(t))
        push({m: fwd[m][j] for m in MODELS}, a.open, cones._decimals(a.open))

    return {"timestamps": stamps, "mean": mean, **series,
            "window_days": WINDOW, "forward_days": FORWARD_DAYS}


def replay(ticker: str, bars_in: Sequence, previous: Optional[dict] = None) -> Optional[dict]:
    """{T}_bands_replay.json body (bands_replay_v2): for every daily anchor of
    the last REPLAY_DAYS, its forward fan plus its `select` point (the live
    file's history point for that day).

    `previous` is this producer's earlier replay file. Anchors it already
    holds with the same anchor price are reused, so a daily rebuild only
    computes the new day."""
    prep = _Prepared(bars_in)
    if not prep.ok:
        return None
    old = (previous or {}).get("daily") or {}
    idx = prep.anchors(REPLAY_DAYS)
    daily: Dict[str, dict] = {}
    for i in idx:
        p = prep.params(i)
        if p is None:
            continue
        a = prep.bars[i]
        key = a.time.strftime("%Y-%m-%d")
        places = cones._decimals(a.open)
        price = round(a.open, places)
        cached = old.get(key)
        if (i != idx[-1] and cached and all(m in cached for m in MODELS)
                and cached["gbm"].get("anchor_price") == price):
            daily[key] = cached
            continue
        times = [_fmt(t) for t in _forward_times(a.time, FORWARD_DAYS, prep.weekdays)]
        select_time = _fmt(a.time + timedelta(days=SELECT_TAU))
        entry = {}
        for m in MODELS:
            qf = _quantile_prices(m, p, a.open, _FORWARD, cones._seed(ticker, f"band_fwd_{m}", a.time),
                                  archive=True)
            qs = _quantile_prices(m, p, a.open, _SELECT, cones._seed(ticker, f"band_{m}", a.time),
                                  archive=True)[0]
            e = {"dates": times}
            e.update({ch: [round(float(v), places) for v in qf[:, j]] for j, ch in enumerate(CHANNELS)})
            e["select"] = {"date": select_time,
                           **{ch: round(float(qs[j]), places) for j, ch in enumerate(CHANNELS)}}
            e["anchor_price"] = price
            entry[m] = e
        daily[key] = entry
    if not daily:
        return None
    return {"meta": {"schema_version": "bands_replay_v2", "ticker": ticker, "window_days": WINDOW,
                     "forward_days": FORWARD_DAYS, "select_tau_days": SELECT_TAU},
            "daily": daily}
