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
    fast   15-minute bars, two states (quiet / active). The chance that the
           market is in, or switches into, the active state within the next
           HAZARD_BARS bars warns that a burst of volatility is likely.

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
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import hmm

# ── slow (daily) ──
RV_DAYS = 5
K_CANDIDATES = (2, 3, 4)
TRAIN_MIN = 250            # trading days before the first label
TRAIN_MAX = 1000           # rolling estimation window
REFIT_DAYS = 21            # about a month

# ── fast (15-minute) ──
FAST_BARS = 2000           # about 3 weeks of a 24-hour market
FAST_TRAIN_MIN = 400
HAZARD_BARS = 8            # two hours ahead
IMMINENT = 0.5             # hazard above this → IMMINENT

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
    slot = ((t % 86400) // 900).astype(int)           # 96 quarter-hours of the UTC day
    scale = np.ones(96)
    overall = np.sqrt(np.mean(r * r)) or 1.0
    for s in range(96):
        sel = r[slot == s]
        if sel.size >= 5:
            scale[s] = np.sqrt(np.mean(sel * sel)) or overall
        else:
            scale[s] = overall
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


def hazard(model: hmm.HMM, now: np.ndarray, target: int, steps: int) -> float:
    """Chance of being in state `target` at some point within the next
    `steps` steps, starting from the probabilities `now`."""
    a = model.transmat.copy()
    # Make the target absorbing: P(reached by step n) = mass there after n steps.
    a[target] = 0.0
    a[target, target] = 1.0
    p = np.asarray(now, dtype=float)
    for _ in range(max(1, int(steps))):
        p = p @ a
    return float(min(1.0, max(0.0, p[target])))


# ── macro quadrants ──

MACRO_STATES = ["GOLDILOCKS", "REFLATION", "STAGFLATION", "DEFLATION"]
# (growth, inflation) signs of each quadrant
MACRO_SIGNS = np.array([[1.0, -1.0], [1.0, 1.0], [-1.0, 1.0], [-1.0, -1.0]])
MACRO_STAY_DAYS = 63       # prior expected length of a macro regime (about a quarter)


def zscore(x: np.ndarray, window: int, min_periods: int) -> np.ndarray:
    """Trailing z-score: each value against the mean and spread of the
    `window` values up to and including it (NaN until `min_periods`)."""
    x = np.asarray(x, dtype=float)
    out = np.full(x.shape, np.nan)
    for i in range(len(x)):
        w = x[max(0, i - window + 1): i + 1]
        w = w[np.isfinite(w)]
        if len(w) >= min_periods and np.isfinite(x[i]):
            sd = w.std()
            if sd > 0:
                out[i] = (x[i] - w.mean()) / sd
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


def finite(v: float, digits: int = 4) -> Optional[float]:
    return round(float(v), digits) if v is not None and math.isfinite(float(v)) else None


def names_for(k: int) -> List[str]:
    return PALETTES.get(k, [f"state_{i}" for i in range(k)])
