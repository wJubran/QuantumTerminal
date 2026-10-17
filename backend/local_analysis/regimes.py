# version: v1
"""
Market regimes from hidden Markov models (hmm.py), with no look-ahead.

Per asset ("micro"):
    slow   daily bars. Features: log 5-day realized volatility and the day's
           return. 2 to 4 states, chosen by BIC, ordered from calm to
           stressed by their volatility. Refitted every REFIT_DAYS on the
           trailing TRAIN_MAX days (warm-started from the previous fit), and
           each day is labelled with the filtered probabilities of the model
           fitted before it, so the history never uses information that
           wasn't there on the day.
    fast   15-minute returns over their usual spread at that time of day, so
           the session clock (a busy New York afternoon) is not a regime.
           A two-state volatility HMM (normal / burst) forecasts the
           volatility of the next FORECAST_BARS bars; IMMINENT when that
           forecast is at least ALARM_RATIO times the usual for those hours.

Macro: growth and inflation impulses from public daily data (FRED), read by a
four-state HMM whose states are pinned to the four quadrants:
    GOLDILOCKS   growth up,   inflation down
    REFLATION    growth up,   inflation up
    STAGFLATION  growth down, inflation up
    DEFLATION    growth down, inflation down
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import cones, hmm

# ── slow (daily) ──
RV_DAYS = 5
K_CANDIDATES = (2, 3, 4)
TRAIN_MIN = 250            # trading days before the first label
TRAIN_MAX = 1000           # rolling estimation window
REFIT_DAYS = 21            # about a month

# ── fast (15-minute) ──
FAST_BARS = 2000           # about 3 weeks of a 24-hour market
FAST_TRAIN_MIN = 400
FORECAST_BARS = 8          # two hours ahead
ALARM_RATIO = 1.5          # forecast volatility vs the usual for those hours → IMMINENT

PALETTES = {
    2: ["calm", "stressed"],
    3: ["calm", "normal", "stressed"],
    4: ["calm", "normal_low", "normal_high", "stressed"],
    5: ["calm", "normal_low", "normal", "normal_high", "stressed"],
}


def log_returns(closes: Sequence[float]) -> np.ndarray:
    c = np.asarray(closes, dtype=float)
    return np.diff(np.log(c))


def slow_features(closes: Sequence[float]) -> np.ndarray:
    """(T, 2): log of the 5-day realized volatility (in % per day) and the
    day's return in %, for the days from the RV_DAYS-th return on."""
    r = log_returns(closes) * 100.0
    if r.size < RV_DAYS:
        return np.empty((0, 2))
    sq = np.convolve(r * r, np.ones(RV_DAYS) / RV_DAYS, mode="valid")
    rv = np.sqrt(np.maximum(sq, 1e-8))
    return np.column_stack([np.log(rv), r[RV_DAYS - 1:]])


FAST_RV_BARS = 4           # one hour of 15-minute bars


def fast_features(epochs: Sequence[float], closes: Sequence[float]) -> Tuple[np.ndarray, np.ndarray]:
    """(T, 2) features of 15-minute bars and the epoch of each row: log of the
    one-hour realized volatility, deseasonalized by time of day, and the
    bar's return over its time-of-day spread. Without the time-of-day scaling
    the "active" state would just be the New York session."""
    t = np.asarray(epochs, dtype=float)
    r = log_returns(closes)
    t = t[1:]
    if r.size < FAST_RV_BARS + 96:
        return np.empty((0, 2)), np.empty(0)
    slot = ((t % 86400) // 900).astype(int)           # 96 quarter-hours of the day
    # Robust spread of each quarter-hour (median absolute return; 0.6745 makes it
    # a standard deviation for normal returns), so a news burst doesn't raise
    # the "usual" level of its own time of day.
    overall = float(np.median(np.abs(r))) / 0.6745 or 1.0
    scale = np.full(96, overall)
    for s in range(96):
        sel = np.abs(r[slot == s])
        if sel.size >= 5:
            scale[s] = float(np.median(sel)) / 0.6745 or overall
    z = r / scale[slot]
    sq = np.convolve(z * z, np.ones(FAST_RV_BARS) / FAST_RV_BARS, mode="valid")
    feats = np.column_stack([np.log(np.sqrt(np.maximum(sq, 1e-8))), z[FAST_RV_BARS - 1:]])
    return feats, t[FAST_RV_BARS - 1:]


def order_by_stress(model: hmm.HMM) -> hmm.HMM:
    """States sorted from calm to stressed by the mean of the volatility feature."""
    return model.reorder(np.argsort(model.means[:, 0], kind="stable"))


def select_states(x: np.ndarray, candidates: Sequence[int] = K_CANDIDATES,
                  seed: int = 0) -> Tuple[Optional[hmm.HMM], Dict[int, float]]:
    """The model with the lowest BIC among `candidates` states (ordered calm →
    stressed), and every candidate's BIC."""
    best, scores = None, {}
    for k in candidates:
        m = hmm.fit(x, k, seed=seed)
        if m is None:
            continue
        scores[k] = float(hmm.bic(m, len(x)))
        if best is None or scores[k] < scores[best.n_states]:
            best = m
    return (order_by_stress(best) if best is not None else None), scores


@dataclass
class WalkForward:
    probs: np.ndarray            # (T, K) filtered probabilities; NaN before the first fit
    model: hmm.HMM               # the latest fit (calm → stressed)
    refits: int


def walk_forward(x: np.ndarray, k: int, train_min: int = TRAIN_MIN, train_max: int = TRAIN_MAX,
                 refit: int = REFIT_DAYS, seed: int = 0) -> Optional[WalkForward]:
    """Filtered state probabilities for every day from `train_min` on, each
    from a model fitted on the days before it only."""
    T = len(x)
    if T <= train_min:
        return None
    probs = np.full((T, k), np.nan)
    model: Optional[hmm.HMM] = None
    refits = 0
    for start in range(train_min, T, refit):
        lo = max(0, start - train_max)
        fitted = hmm.fit(x[lo:start], k, seed=seed, init=model) if model is not None else \
            hmm.fit(x[lo:start], k, seed=seed)
        if fitted is None:
            continue
        model = order_by_stress(fitted)
        refits += 1
        end = min(T, start + refit)
        # Run the filter over the training window and the next block: the
        # probabilities of day t only use days ≤ t.
        p = hmm.filtered(model, x[lo:end])
        probs[start:end] = p[start - lo:]
    if model is None:
        return None
    return WalkForward(probs, model, refits)


def vol_forecast_ratio(model: hmm.HMM, probs: np.ndarray, steps: int) -> np.ndarray:
    """For each row of state probabilities: the expected volatility over the
    next `steps` steps over the long-run volatility, from a one-feature
    model of returns (state variance + squared mean = the state's second moment)."""
    second = model.variances[:, 0] + model.means[:, 0] ** 2
    base = float(model.stationary() @ second)
    q = np.atleast_2d(np.asarray(probs, dtype=float))
    acc = np.zeros_like(q)
    for _ in range(max(1, int(steps))):
        q = q @ model.transmat
        acc += q
    return np.sqrt(np.maximum((acc / max(1, int(steps))) @ second, 0.0) / base)


# ── macro quadrants ──

MACRO_STATES = ["GOLDILOCKS", "REFLATION", "STAGFLATION", "DEFLATION"]
# (growth, inflation) signs of each quadrant
MACRO_SIGNS = np.array([[1.0, -1.0], [1.0, 1.0], [-1.0, 1.0], [-1.0, -1.0]])
MACRO_STAY_DAYS = 63       # prior expected length of a macro regime (about a quarter)


def scaled(x: np.ndarray, window: int, min_periods: int) -> np.ndarray:
    """Each value over the root-mean-square of the `window` values up to and
    including it (NaN until `min_periods`). Not demeaned: a change keeps its
    sign however long a trend lasts, so years of rising prices still read as
    "rising"."""
    x = np.asarray(x, dtype=float)
    out = np.full(x.shape, np.nan)
    for i in range(len(x)):
        w = x[max(0, i - window + 1): i + 1]
        w = w[np.isfinite(w)]
        if len(w) >= min_periods and np.isfinite(x[i]):
            rms = float(np.sqrt(np.mean(w * w)))
            if rms > 0:
                out[i] = x[i] / rms
    return out


def macro_model(scale: float = 1.0, stay_days: float = MACRO_STAY_DAYS) -> hmm.HMM:
    """Four states pinned to the quadrant corners (±scale in z units) with
    unit variances and sticky transitions."""
    k = len(MACRO_STATES)
    stay = 1.0 - 1.0 / stay_days
    trans = np.full((k, k), (1.0 - stay) / (k - 1))
    np.fill_diagonal(trans, stay)
    return hmm.HMM(np.full(k, 1.0 / k), trans, MACRO_SIGNS * scale, np.ones((k, 2)), 0.0)


def macro_probabilities(growth_z: np.ndarray, inflation_z: np.ndarray,
                        model: Optional[hmm.HMM] = None) -> np.ndarray:
    """Filtered quadrant probabilities, (T, 4), for days where both impulses exist."""
    x = np.column_stack([growth_z, inflation_z])
    return hmm.filtered(model or macro_model(), np.clip(x, -4.0, 4.0))


def names_for(k: int) -> List[str]:
    return PALETTES.get(k, [f"state_{i}" for i in range(k)])


# ── payloads (the files the REGIMES strip and the chart shading read) ──
#
#   slow.regime / slow.confidence     the regime expected for the current day
#   slow.n_states_selected            2–5: picks the palette above
#   fast.imminent                     volatility expected over the next two hours is high
#   fast.minutes_since_alarm          since `imminent` was last on (null: not in the window)
#   history.slow_d1[]                 {"date": "YYYY-MM-DD", "regime", "confidence"},
#                                     one row per completed day, dated by the bar's own day

def completed(daily: Sequence, last_tick_time) -> list:
    """Daily bars whose day is over: the last bar is dropped while the latest
    tick is still on its day, or when there is no tick to tell."""
    if not daily:
        return []
    if last_tick_time is None:
        return list(daily[:-1])
    try:
        tick_day = cones._naive(last_tick_time).date()
    except (TypeError, ValueError):
        return list(daily[:-1])
    return list(daily) if tick_day > daily[-1].time.date() else list(daily[:-1])


def _epoch(t: datetime) -> float:
    """Seconds since 1970 of a naive time on the feed's clock."""
    return (t - datetime(1970, 1, 1)).total_seconds()


def _slow(daily: Sequence) -> Optional[dict]:
    closes = [b.close for b in daily]
    x = slow_features(closes)
    if len(x) <= TRAIN_MIN:
        return None
    best, scores = select_states(x[-TRAIN_MAX:])
    if best is None:
        return None
    k = best.n_states
    wf = walk_forward(x, k)
    if wf is None:
        return None
    names = names_for(k)
    days = [b.time.date().isoformat() for b in daily][RV_DAYS:]
    rows = []
    for day, p in zip(days, wf.probs):
        if np.isfinite(p[0]):
            j = int(np.argmax(p))
            rows.append({"date": day, "regime": names[j], "confidence": round(float(p[j]), 3)})
    if not rows:
        return None
    model = wf.model
    last = wf.probs[-1]
    ahead = last @ model.transmat                       # the day that follows the last close
    j = int(np.argmax(ahead))
    per_year = 52 * max(1, len(cones.trading_weekdays(daily)))
    vol = np.exp(model.means[:, 0]) * math.sqrt(per_year)   # typical realized vol of each state, % a year
    duration = model.expected_duration()
    return {
        "slow": {
            "regime": names[j], "confidence": round(float(ahead[j]), 3), "n_states_selected": k,
            "states": names,
            "probabilities": {n: round(float(p), 3) for n, p in zip(names, ahead)},
            "annualized_vol_pct": {n: round(float(v), 1) for n, v in zip(names, vol)},
            "expected_duration_days": {n: round(float(d), 1) for n, d in zip(names, duration)},
            "bic": {str(n): round(s, 1) for n, s in sorted(scores.items())},
            "as_of": days[-1],
            "refits": wf.refits,
        },
        "history": {"slow_d1": rows},
    }


def _fast(m15: Sequence) -> Optional[dict]:
    if len(m15) < FAST_TRAIN_MIN:
        return None
    m15 = list(m15)[-FAST_BARS:]
    x, when = fast_features([_epoch(b.time) for b in m15], [b.close for b in m15])
    if len(x) < FAST_TRAIN_MIN:
        return None
    z = x[:, 1:2]                                       # returns over their time-of-day spread
    model = hmm.fit(z, 2, seed=0, restarts=2)           # normal / burst; refitted every new bar
    if model is None:
        return None
    model = model.reorder(np.argsort(model.variances[:, 0] + model.means[:, 0] ** 2, kind="stable"))
    p = hmm.filtered(model, z)
    ratio = vol_forecast_ratio(model, p, FORECAST_BARS)
    alarms = np.flatnonzero(ratio >= ALARM_RATIO)
    imminent = bool(ratio[-1] >= ALARM_RATIO)
    # minutes from the end of the last alarm bar to the end of the last completed bar
    since = 0 if imminent else (int((when[-1] - when[alarms[-1]]) // 60) if alarms.size else None)
    return {
        "imminent": imminent, "minutes_since_alarm": since,
        "vol_ratio": round(float(ratio[-1]), 2), "p_burst": round(float(p[-1, -1]), 3),
        "n_states": model.n_states, "horizon_minutes": FORECAST_BARS * 15,
        "as_of": m15[-1].time.strftime("%Y-%m-%dT%H:%M"),
    }


def micro_payload(daily_done: Sequence, m15_done: Sequence, previous: Optional[dict] = None,
                  slow_key: str = "") -> Optional[dict]:
    """The per-asset regime file's body from completed daily and 15-minute
    bars. The slow part is reused from `previous` when `slow_key` (the
    daily bars it was computed from) hasn't changed."""
    slow = None
    if previous and slow_key and previous.get("slow_key") == slow_key \
            and isinstance(previous.get("slow"), dict) and isinstance(previous.get("history"), dict):
        slow = {"slow": previous["slow"], "history": previous["history"]}
    if slow is None:
        slow = _slow(daily_done)
    if slow is None:
        return None
    body = {**slow, "slow_key": slow_key}
    fast = _fast(m15_done)
    if fast is not None:
        body["fast"] = fast
    return body


# ── macro ──

MACRO_SERIES = ("SP500", "T10YIE", "DCOILWTICO")   # S&P 500, 10-year breakeven inflation, WTI crude
MOMENTUM_DAYS = 63                                # three months of business days
Z_WINDOW, Z_MIN = 756, 252                        # three years of history, one at least
MACRO_SCALE = 0.8                                 # mean |z| of a standard normal: the corners' distance


def _aligned(series: Dict[str, Sequence]) -> Tuple[list, Dict[str, np.ndarray]]:
    """All series on the union of their days, each carried forward over at
    most 5 missing days (holidays that differ between markets)."""
    days = sorted({d for s in series.values() for d, _ in s})
    out = {}
    for name, s in series.items():
        m = dict(s)
        vals, last, age = [], None, 0
        for d in days:
            if d in m:
                last, age = m[d], 0
            else:
                age += 1
            vals.append(last if last is not None and age <= 5 else np.nan)
        out[name] = np.asarray(vals, dtype=float)
    return days, out


def _momentum(v: np.ndarray, n: int, log: bool) -> np.ndarray:
    out = np.full(v.shape, np.nan)
    with np.errstate(invalid="ignore", divide="ignore"):
        if log:
            lv = np.where(v > 0, np.log(np.where(v > 0, v, 1.0)), np.nan)
            out[n:] = lv[n:] - lv[:-n]
        else:
            out[n:] = v[n:] - v[:-n]
    return out


def macro_impulses(series: Dict[str, Sequence]) -> Tuple[list, np.ndarray, np.ndarray]:
    """Days, growth impulse and inflation impulse, each a 3-month change over
    its typical size in the last three years (so ±1 is an ordinary move):
        growth     the S&P 500 (log change)
        inflation  the 10-year breakeven and WTI crude (log change), averaged
    """
    days, v = _aligned(series)
    growth = scaled(_momentum(v["SP500"], MOMENTUM_DAYS, True), Z_WINDOW, Z_MIN)
    be = scaled(_momentum(v["T10YIE"], MOMENTUM_DAYS, False), Z_WINDOW, Z_MIN)
    oil = scaled(_momentum(v["DCOILWTICO"], MOMENTUM_DAYS, True), Z_WINDOW, Z_MIN)
    with np.errstate(invalid="ignore"):
        inflation = np.where(np.isfinite(be) & np.isfinite(oil), (be + oil) / 2.0,
                             np.where(np.isfinite(be), be, oil))
    return days, growth, inflation


def macro_payload(series: Dict[str, Sequence]) -> Optional[Tuple[dict, dict]]:
    """(GLOBAL_macro_regime.json body, GLOBAL_regime_transitions.json body)."""
    days, growth, inflation = macro_impulses(series)
    ok = np.isfinite(growth) & np.isfinite(inflation)
    if ok.sum() < 20:
        return None
    idx = np.flatnonzero(ok)
    model = macro_model(MACRO_SCALE)
    p = macro_probabilities(growth[idx], inflation[idx], model)
    labels = np.argmax(p, axis=1)
    # One row per calendar day, so weekend and holiday bars are shaded too.
    rows, k = [], 0
    d, end = days[idx[0]], days[idx[-1]]
    while d <= end:
        while k + 1 < len(idx) and days[idx[k + 1]] <= d:
            k += 1
        j = int(labels[k])
        rows.append({"date": d.isoformat(), "regime": MACRO_STATES[j], "confidence": round(float(p[k, j]), 3)})
        d += timedelta(days=1)
    ahead = p[-1] @ model.transmat
    j = int(np.argmax(ahead))
    last = idx[-1]
    body = {
        "slow": {
            "regime": MACRO_STATES[j], "confidence": round(float(ahead[j]), 3),
            "probabilities": {n: round(float(x), 3) for n, x in zip(MACRO_STATES, ahead)},
            "growth_z": round(float(growth[last]), 2), "inflation_z": round(float(inflation[last]), 2),
            "as_of": days[last].isoformat(),
            "inputs": {"growth": "S&P 500, 3-month change (FRED SP500)",
                       "inflation": "10-year breakeven (FRED T10YIE) and WTI crude (FRED DCOILWTICO), "
                                    "3-month change"},
        },
        "history": {"slow_d1": rows},
    }
    return body, _transitions(labels, [days[i] for i in idx])


def _transitions(labels: np.ndarray, days: list) -> dict:
    """Empirical regime statistics from the daily labels (business days)."""
    k = len(MACRO_STATES)
    counts = np.ones((k, k))                      # Laplace prior: every switch stays possible
    for a, b in zip(labels[:-1], labels[1:]):
        counts[a, b] += 1
    mat = counts / counts.sum(axis=1, keepdims=True)
    episodes: Dict[int, List[int]] = {i: [] for i in range(k)}
    start = 0
    for t in range(1, len(labels) + 1):
        if t == len(labels) or labels[t] != labels[start]:
            episodes[int(labels[start])].append(t - start)
            start = t
    current = int(labels[-1])
    now = np.eye(k)[current]
    ahead = {f"{n}d": {s: round(float(x), 3) for s, x in zip(MACRO_STATES, now @ np.linalg.matrix_power(mat, h))}
             for n, h in ((7, 5), (30, 21), (90, 63))}
    return {
        "current": {"regime": MACRO_STATES[current], "since": days[len(labels) - episodes[current][-1]].isoformat(),
                    "business_days": episodes[current][-1]},
        "probabilities": ahead,
        "durations": {MACRO_STATES[i]: {"episodes": len(e),
                                        "mean_business_days": round(float(np.mean(e)), 1) if e else None,
                                        "median_business_days": float(np.median(e)) if e else None}
                      for i, e in episodes.items()},
        "matrix": {MACRO_STATES[i]: {MACRO_STATES[j]: round(float(mat[i, j]), 4) for j in range(k)}
                   for i in range(k)},
        "as_of": days[-1].isoformat(),
    }
