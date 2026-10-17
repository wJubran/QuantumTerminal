# version: v1
"""
The FUNDAMENTAL page's file, GLOBAL_fundamental_state.json, from public data:

    regime        the macro quadrant (regimes.py), its 12-month trail on the
                  growth / inflation map, and the drivers behind it
    liquidity     net liquidity = Fed balance sheet − Treasury General Account
                  − overnight reverse repo (FRED: WALCL, WTREGEN, RRPONTSYD),
                  weekly, with the Fed's rate changes marked (DFEDTARU)
    yields        the 2/5/10/30-year Treasury curve now and 3 months ago, the
                  2s10s spread, the 10-year real yield, fed funds, the VIX
    cot           speculators' positioning from the CFTC (cot.py)
    asset_scores  each universe ticker from −100 to +100: what the regime
                  favours for its asset class, its 200-day trend and its
                  3-month momentum, with each part shown

Each section is built from what could be fetched; one that can't is left
out and the page shows the others. The regime's "implications" are rules of
thumb for each quadrant, the same as the page's own playbook.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import regimes

FRED_SERIES = ("WALCL", "WTREGEN", "RRPONTSYD", "DGS2", "DGS5", "DGS10", "DGS30", "DFII10", "DFF",
               "DFEDTARU", "DFEDTARL", "VIXCLS")

Series = Sequence[Tuple[date, float]]

SUB = {
    "GOLDILOCKS": "Growth above trend, inflation cooling",
    "REFLATION": "Growth and inflation both rising",
    "STAGFLATION": "Growth slowing, inflation rising",
    "DEFLATION": "Growth and inflation both falling",
}
IMPLICATIONS = {
    "GOLDILOCKS": {"equities": "BULLISH", "commodities": "NEUTRAL", "fixed_income": "NEUTRAL",
                   "usd": "BEARISH", "gold": "BEARISH"},
    "REFLATION": {"equities": "MIXED", "commodities": "BULLISH", "fixed_income": "BEARISH",
                  "usd": "BEARISH", "gold": "BULLISH"},
    "STAGFLATION": {"equities": "BEARISH", "commodities": "BULLISH", "fixed_income": "BEARISH",
                    "usd": "BULLISH", "gold": "BULLISH"},
    "DEFLATION": {"equities": "BEARISH", "commodities": "BEARISH", "fixed_income": "BULLISH",
                  "usd": "BULLISH", "gold": "MIXED"},
}
STANCE = {"BULLISH": 1.0, "BEARISH": -1.0}

_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN",
               "HUF", "CZK", "TRY", "ZAR", "MXN", "SGD", "HKD", "CNH"}
_INDICES = {"US500", "USTEC", "US30", "US2000", "GER40", "UK100", "JP225", "FRA40", "EU50", "AUS200",
            "HK50", "SPX500", "NAS100"}
_PRECIOUS = {"XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD", "GOLD", "SILVER"}
_CRYPTO = {"BTC", "ETH", "SOL", "XRP", "LTC", "BCH", "ADA", "DOGE", "DOT", "LINK", "AVAX", "BNB"}


# ── helpers ──

def _value_on(series: Series, day: date) -> Optional[float]:
    """The last value on or before `day`."""
    out = None
    for d, v in series:
        if d > day:
            break
        out = v
    return out


def _money(billions: float) -> str:
    return f"${billions / 1000:.2f}T" if abs(billions) >= 1000 else f"${billions:.0f}B"


def _signed_money(billions: float) -> str:
    return ("+" if billions >= 0 else "−") + _money(abs(billions))


def asset_class(ticker: str) -> str:
    t = ticker.upper()
    if t in _INDICES:
        return "equities"
    if t in _PRECIOUS:
        return "gold"
    if len(t) == 6 and t[:3] in _CURRENCIES and t[3:] in _CURRENCIES:
        return "fx"
    if t.endswith("USD") and t[:-3] in _CRYPTO:
        return "crypto"
    return "commodities"


def regime_stance(ticker: str, regime: str) -> float:
    """+1 when the regime's rule of thumb favours the ticker, −1 when it
    doesn't, 0 when it's mixed or neutral."""
    impl = IMPLICATIONS.get(regime, {})
    cls = asset_class(ticker)
    if cls == "fx":
        t = ticker.upper()
        usd = STANCE.get(impl.get("usd", ""), 0.0)
        return usd if t[:3] == "USD" else (-usd if t[3:] == "USD" else 0.0)
    key = {"crypto": "equities"}.get(cls, cls)
    return STANCE.get(impl.get(key, ""), 0.0)


# ── sections ──

def liquidity(s: Dict[str, Series]) -> Optional[dict]:
    walcl, tga, rrp = s.get("WALCL") or [], s.get("WTREGEN") or [], s.get("RRPONTSYD") or []
    if len(walcl) < 10 or not tga:
        return None
    points = []
    for d, w in walcl[-60:]:
        t = _value_on(tga, d)
        if t is None:
            continue
        r = _value_on(rrp, d) or 0.0
        points.append((d, w / 1000.0 - t / 1000.0 - r, w / 1000.0, t / 1000.0, r))
    if len(points) < 6:
        return None
    last, prev = points[-1], points[-5]
    delta = last[1] - prev[1]
    chart = [{"date": d.isoformat(), "value": round(v, 1)} for d, v, *_ in points[-52:]]
    events = fed_events(s, date.fromisoformat(chart[0]["date"]))
    return {
        "value": round(last[1], 1), "value_label": _money(last[1]),
        "prev_value_label": _money(prev[1]), "delta_4w": round(delta, 1),
        "delta_4w_label": _signed_money(delta), "trend": "EXPANDING" if delta > 0 else "CONTRACTING",
        "components": {"walcl": round(last[2], 1), "tga": round(last[3], 1), "rrp": round(last[4], 1)},
        "as_of": last[0].isoformat(), "chart": chart, "fed_events": events,
    }


def fed_events(s: Dict[str, Series], start: date) -> List[dict]:
    """The Fed's changes of its target range (FRED DFEDTARU / DFEDTARL) since `start`."""
    upper, lower = s.get("DFEDTARU") or [], s.get("DFEDTARL") or []
    out, prev = [], None
    for d, v in upper:
        if prev is not None and abs(v - prev) >= 0.0499 and d >= start:
            bp = round((v - prev) * 100)
            lo = _value_on(lower, d)
            out.append({"date": d.isoformat(), "event": f"{'HIKE' if bp > 0 else 'CUT'} {abs(bp)}bp",
                        "type": "change",
                        "detail": f"Target {lo:.2f}-{v:.2f}%" if lo is not None else f"Upper target {v:.2f}%"})
        prev = v
    return out


def yields(s: Dict[str, Series]) -> Optional[dict]:
    tenors = {"2Y": "DGS2", "5Y": "DGS5", "10Y": "DGS10", "30Y": "DGS30"}
    if not all(s.get(sid) for sid in tenors.values()):
        return None
    last_day = min(s[sid][-1][0] for sid in tenors.values())
    prev_day = last_day - timedelta(days=91)
    curve = {k: _value_on(s[sid], last_day) for k, sid in tenors.items()}
    prev = {k: _value_on(s[sid], prev_day) for k, sid in tenors.items()}
    if any(v is None for v in curve.values()):
        return None
    out = {"curve": {k: round(v, 2) for k, v in curve.items()}, "as_of": last_day.isoformat()}
    spread = curve["10Y"] - curve["2Y"]
    out.update(spread_2s10s=round(spread, 2), spread_2s10s_bp=int(round(spread * 100)), inverted=spread < 0)
    if all(v is not None for v in prev.values()):
        out.update(curve_prev={k: round(v, 2) for k, v in prev.items()}, curve_prev_date=prev_day.isoformat(),
                   prev_spread_2s10s_bp=int(round((prev["10Y"] - prev["2Y"]) * 100)))
    for key, sid in (("real_yield_10y", "DFII10"), ("fed_funds_rate", "DFF"), ("vix", "VIXCLS")):
        if s.get(sid):
            out[key] = round(s[sid][-1][1], 2)
    if s.get("VIXCLS"):
        pv = _value_on(s["VIXCLS"], s["VIXCLS"][-1][0] - timedelta(days=30))
        if pv is not None:
            out["prev_vix"] = round(pv, 2)
    return out


def _position(g: float, i: float) -> dict:
    """Map coordinates: x = growth (right = stronger), y from the top
    (top = higher inflation), both 0–1."""
    return {"x": round(float(np.clip(0.5 + 0.2 * g, 0.04, 0.96)), 3),
            "y": round(float(np.clip(0.5 - 0.2 * i, 0.04, 0.96)), 3)}


def regime(macro: dict, s: Dict[str, Series]) -> Optional[dict]:
    """The page's regime block from the macro regime file's body and the series it was built from."""
    slow = macro.get("slow") or {}
    rows = (macro.get("history") or {}).get("slow_d1") or []
    label = slow.get("regime")
    if label not in IMPLICATIONS or not rows:
        return None
    last_day = date.fromisoformat(rows[-1]["date"])
    by_day = {r["date"]: r["regime"] for r in rows}
    prev_label = by_day.get((last_day - timedelta(days=30)).isoformat(), label)
    days, growth, inflation = regimes.macro_impulses({k: s[k] for k in regimes.MACRO_SERIES})
    ok = np.isfinite(growth) & np.isfinite(inflation)
    trail, seen = [], set()
    for k in np.flatnonzero(ok)[::-1]:                 # the last day of each of the last 12 months
        month = (days[k].year, days[k].month)
        if month not in seen:
            seen.add(month)
            trail.append(_position(growth[k], inflation[k]))
        if len(seen) == 12:
            break
    trail.reverse()
    g, i = float(slow.get("growth_z", 0.0)), float(slow.get("inflation_z", 0.0))
    return {
        "label": label, "sub": SUB[label], "prev_label": prev_label,
        "confidence": int(round(float(slow.get("confidence", 0.0)) * 100)),
        "growth_z": round(g, 2), "inflation_z": round(i, 2),
        "current_position": _position(g, i), "trail": trail,
        "implications": IMPLICATIONS[label],
        "growth_factors": _factors(s, (("SP500", "S&P 500, 3-month change %", True),)),
        "inflation_factors": _factors(s, (("T10YIE", "10Y breakeven, 3-month change (pp)", False),
                                          ("DCOILWTICO", "WTI crude, 3-month change %", True))),
        "as_of": slow.get("as_of", rows[-1]["date"]),
    }


def _factors(s: Dict[str, Series], specs) -> List[dict]:
    out = []
    for sid, name, log in specs:
        rows = s.get(sid) or []
        if len(rows) <= regimes.MOMENTUM_DAYS:
            continue
        v = np.array([r[1] for r in rows], dtype=float)
        change = regimes._momentum(v, regimes.MOMENTUM_DAYS, log)
        z = regimes.scaled(change, regimes.Z_WINDOW, regimes.Z_MIN)
        if not (np.isfinite(change[-1]) and np.isfinite(z[-1])):
            continue
        value = (math.exp(change[-1]) - 1.0) * 100.0 if log else change[-1]
        out.append({"series": sid, "name": name, "value": round(float(value), 2), "z_score": round(float(z[-1]), 2)})
    return out


def asset_score(ticker: str, closes: Sequence[float], regime_label: Optional[str]) -> Optional[dict]:
    """−100 … +100 from three parts, each about −2 … +2 before weighting:
    the regime's rule of thumb for the asset class, the price against its
    200-day average, and the 3-month change, both in units of its volatility."""
    c = np.asarray(closes, dtype=float)
    c = c[np.isfinite(c) & (c > 0)]
    if c.size < 210:
        return None
    r = np.diff(np.log(c))
    sigma = float(np.std(r[-250:]))
    if sigma <= 0:
        return None
    ma = float(c[-200:].mean())
    trend = float(np.clip(math.log(c[-1] / ma) / (sigma * math.sqrt(50)), -2, 2))
    mom = float(np.clip(math.log(c[-1] / c[-64]) / (sigma * math.sqrt(63)), -2, 2))
    fit = regime_stance(ticker, regime_label) if regime_label else 0.0
    parts = [("Macro regime", fit, 0.4), ("Trend vs 200-day average", trend, 0.3), ("3-month momentum", mom, 0.3)]
    factors = []
    for name, x, w in parts:
        contrib = 50.0 * w * x
        factors.append({"name": name, "value": round(x, 2), "weight": w, "contribution": round(contrib, 2),
                        "signal": "bull" if contrib > 0.5 else "bear" if contrib < -0.5 else "neut"})
    score = float(np.clip(sum(f["contribution"] for f in factors), -100, 100))
    label = ("BULLISH" if score > 20 else "MILDLY BULLISH" if score > 5 else "NEUTRAL" if score > -5
             else "MILDLY BEARISH" if score > -20 else "BEARISH")
    return {"score": round(score, 1), "label": label, "factors": factors}


def build(series: Dict[str, Series], macro: Optional[dict], closes: Dict[str, Sequence[float]],
          cot_blocks: Optional[Dict[str, dict]] = None) -> Optional[dict]:
    """The file's body; None when there is nothing to show."""
    out: Dict[str, object] = {}
    reg = regime(macro, series) if macro and all(series.get(k) for k in regimes.MACRO_SERIES) else None
    if reg:
        out["regime"] = reg
    liq = liquidity(series)
    if liq:
        out["liquidity"] = liq
    yl = yields(series)
    if yl:
        out["yields"] = yl
    label = reg["label"] if reg else None
    scores = {}
    for t, c in closes.items():
        sc = asset_score(t, c, label)
        if sc:
            scores[t] = sc
    if scores:
        out["asset_scores"] = scores
    if cot_blocks:
        out["cot"] = cot_blocks
    if not out:
        return None
    out["_meta"] = {"stale": False,
                    "sources": {"fred": [k for k in FRED_SERIES + regimes.MACRO_SERIES if series.get(k)],
                                "cftc_cot": sorted(cot_blocks or {}), "scores_from": "active data source"}}
    return out
