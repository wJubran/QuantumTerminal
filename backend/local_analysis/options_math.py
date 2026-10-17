# version: v1
"""
Option-chain arithmetic behind the locally computed options levels:
Black-Scholes gamma, dealer gamma exposure by strike, the gamma flip, call/put
walls and max pain.

Conventions, the ones SpotGamma and SqueezeMetrics popularised:

- Dealers are assumed to be long the calls and short the puts that customers
  trade, so call gamma counts positive and put gamma negative.
- Gamma exposure (GEX) is in dollars of underlying per 1% move:
      GEX = gamma * open_interest * multiplier * S^2 * 0.01
  Positive net GEX means dealers hedge against the move (damping it);
  negative means they hedge with it (amplifying it).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

MULTIPLIER = 100            # shares per US equity / ETF option contract
MIN_T_YEARS = 0.5 / (365.0 * 24.0)     # 30 minutes: caps the gamma of expiring contracts
IV_RANGE = (0.01, 5.0)      # implied vols outside this are quote errors, not information


@dataclass(frozen=True)
class Chain:
    """One underlying's contracts, as parallel arrays (one entry per contract)."""
    strike: np.ndarray
    is_call: np.ndarray     # bool
    oi: np.ndarray          # open interest, contracts
    iv: np.ndarray          # implied volatility, annualised (0.2 = 20%); NaN when unknown
    t: np.ndarray           # time to expiry, years
    expiry: np.ndarray      # expiry date strings "YYYY-MM-DD"

    def __post_init__(self):
        n = self.strike.size
        assert all(a.size == n for a in (self.is_call, self.oi, self.iv, self.t, self.expiry))

    def select(self, mask: np.ndarray) -> "Chain":
        return Chain(self.strike[mask], self.is_call[mask], self.oi[mask], self.iv[mask],
                     self.t[mask], self.expiry[mask])

    @property
    def usable(self) -> np.ndarray:
        """Contracts that can carry gamma: open interest and a sane implied vol."""
        lo, hi = IV_RANGE
        return (self.oi > 0) & np.isfinite(self.iv) & (self.iv >= lo) & (self.iv <= hi)


def norm_pdf(x):
    return np.exp(-0.5 * np.square(x)) / math.sqrt(2.0 * math.pi)


def bs_gamma(spot, strike, t, iv, r: float = 0.0, q: float = 0.0):
    """Black-Scholes gamma (same for calls and puts), per $1 of the underlying.
    Broadcasts; zero wherever the inputs can't price an option."""
    spot, strike, t, iv = (np.asarray(a, dtype=float) for a in (spot, strike, t, iv))
    t = np.maximum(t, MIN_T_YEARS)
    ok = (spot > 0) & (strike > 0) & (iv > 0)
    with np.errstate(divide="ignore", invalid="ignore"):
        vol = iv * np.sqrt(t)
        d1 = (np.log(spot / strike) + (r - q + 0.5 * iv * iv) * t) / vol
        g = np.exp(-q * t) * norm_pdf(d1) / (spot * vol)
    return np.where(ok & np.isfinite(g), g, 0.0)


def contract_gex(chain: Chain, spot: float, r: float = 0.0, q: float = 0.0) -> np.ndarray:
    """Signed dealer GEX of every contract at `spot`, $ per 1% move."""
    use = chain.usable
    g = bs_gamma(spot, chain.strike, chain.t, np.where(use, chain.iv, 0.0), r, q)
    sign = np.where(chain.is_call, 1.0, -1.0)
    return np.where(use, sign * g * chain.oi * MULTIPLIER * spot * spot * 0.01, 0.0)


def gex_by_strike(chain: Chain, spot: float, r: float = 0.0, q: float = 0.0) -> dict:
    """Per-strike GEX → {"strikes", "call", "put", "net"} (ascending strikes;
    call >= 0, put <= 0, net = call + put)."""
    gex = contract_gex(chain, spot, r, q)
    strikes = np.unique(chain.strike)
    idx = np.searchsorted(strikes, chain.strike)
    call = np.bincount(idx, weights=np.where(chain.is_call, gex, 0.0), minlength=strikes.size)
    put = np.bincount(idx, weights=np.where(chain.is_call, 0.0, gex), minlength=strikes.size)
    return {"strikes": strikes, "call": call, "put": put, "net": call + put}


def net_gex_curve(chain: Chain, spots: np.ndarray, r: float = 0.0, q: float = 0.0) -> np.ndarray:
    """Total net GEX if the underlying were at each of `spots` (implied vols held fixed)."""
    return np.array([contract_gex(chain, float(s), r, q).sum() for s in spots])


def gamma_flip(chain: Chain, spot: float, r: float = 0.0, q: float = 0.0,
               span: float = 0.15, points: int = 301) -> Optional[float]:
    """Underlying price where total net GEX changes sign, closest to `spot`,
    searched within ±span; None when it doesn't change sign there."""
    spots = np.linspace(spot * (1.0 - span), spot * (1.0 + span), points)
    curve = net_gex_curve(chain, spots, r, q)
    crossings = np.nonzero(np.sign(curve[:-1]) * np.sign(curve[1:]) < 0)[0]
    if crossings.size == 0:
        return None
    levels = []
    for i in crossings:                 # linear interpolation inside the bracketing step
        a, b = curve[i], curve[i + 1]
        levels.append(spots[i] + (spots[i + 1] - spots[i]) * a / (a - b))
    levels = np.array(levels)
    return float(levels[np.argmin(np.abs(levels - spot))])


def max_pain(chain: Chain) -> Optional[float]:
    """The listed strike at which option holders' total intrinsic value at
    expiry is smallest (open interest weighted). None without open interest."""
    has_oi = chain.oi > 0
    if not has_oi.any():
        return None
    k, oi, call = chain.strike[has_oi], chain.oi[has_oi], chain.is_call[has_oi]
    settle = np.unique(k)
    pay = np.where(call[None, :],
                   np.maximum(settle[:, None] - k[None, :], 0.0),
                   np.maximum(k[None, :] - settle[:, None], 0.0)) * oi[None, :]
    return float(settle[np.argmin(pay.sum(axis=1))])


def walls(by_strike: dict) -> dict:
    """Call wall: strike with the largest call GEX. Put wall: strike with the
    most negative put GEX. None when that side has no gamma."""
    out = {"call_wall": None, "put_wall": None}
    if by_strike["strikes"].size:
        i = int(np.argmax(by_strike["call"]))
        if by_strike["call"][i] > 0:
            out["call_wall"] = float(by_strike["strikes"][i])
        j = int(np.argmin(by_strike["put"]))
        if by_strike["put"][j] < 0:
            out["put_wall"] = float(by_strike["strikes"][j])
    return out
