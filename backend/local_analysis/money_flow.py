# version: v1
"""
The MONEY FLOW page's files, from daily ETF prices and volumes (Yahoo Finance
through yfinance, no key):

    GLOBAL_macro_sectors.json       SECTORS: the 11 SPDR sector ETFs, 1- and 4-week change
    GLOBAL_macro_countries.json     GLOBAL map: country ETFs, 1- and 4-week change
    GLOBAL_macro_flows.json         GLOBAL arcs: rotation from the weakest markets to the strongest
    GLOBAL_macro_sector_flows.json  CAPITAL FLOWS: asset classes and the money moving between them

These are proxies for capital flows, not reported fund flows:
- An asset class's "net flow" is the buying or selling pressure on its
  representative ETFs: each day's return times the dollars traded that day,
  summed over the period ($B). Strong volume on up days reads as an inflow,
  on down days as an outflow.
- An arc goes from a class (or country) under pressure to one being bought,
  sized by the smaller of the two.

A ticker that can't be downloaded is left out rather than shown as flat.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple

from macro_data import COUNTRY_ETFS, SECTOR_ETFS

log = logging.getLogger("qt.local_analysis.money_flow")

WEEK, MONTH = 5, 20                 # trading days
EMERGING = {"BR", "CN", "IN", "KR", "TW", "MX", "ZA", "TR", "SA", "MY", "TH"}

# CAPITAL FLOWS node → label, glyph, colour, representative ETFs, the macro rule of thumb it follows
NODES = {
    "EQUITIES": ("Equities", "EQ", "#2ebd59", ("SPY", "QQQ", "IWM", "EFA", "EEM"), "equities"),
    "BONDS": ("Bonds", "BD", "#3796ff", ("TLT", "IEF", "AGG", "LQD", "HYG"), "fixed_income"),
    "COMMODITIES": ("Commodities", "CM", "#ffa500", ("GLD", "SLV", "USO", "DBC", "DBA", "CPER"), "commodities"),
    "CRYPTO": ("Crypto", "CR", "#f7931a", ("IBIT", "FBTC", "ETHA"), "equities"),
    "CASH": ("Cash (T-bills)", "CS", "#888888", ("SHV", "BIL", "SGOV"), None),
    "FX": ("US dollar", "FX", "#00d2d3", ("UUP",), "usd"),
    "OPTIONS": ("Volatility hedges", "OP", "#9b59b6", ("VXX", "UVXY"), None),
}

Daily = Dict[str, List[Tuple[date, float, float]]]       # ticker → [(day, close, volume)], oldest first


def all_tickers() -> List[str]:
    out = list(SECTOR_ETFS) + list(COUNTRY_ETFS)
    for *_, etfs, _ in NODES.values():
        out += [t for t in etfs if t not in out]
    return out


def download_daily(tickers: Sequence[str], period: str = "6mo") -> Daily:
    """Daily closes and volumes for many tickers in one batch (yfinance)."""
    import yfinance as yf
    data = yf.download(list(tickers), period=period, interval="1d", auto_adjust=False,
                       progress=False, threads=True, group_by="column")
    out: Daily = {}
    if data is None or data.empty:
        return out
    for t in tickers:
        try:
            close, volume = data["Close"][t], data["Volume"][t]
        except KeyError:
            continue
        rows = []
        for ts, c, v in zip(close.index, close.values, volume.values):
            if c == c and c > 0:                                  # not NaN
                rows.append((ts.date(), float(c), float(v) if v == v else 0.0))
        if len(rows) >= 2:
            out[t] = rows
    return out


def _change(rows, n: int) -> Optional[float]:
    if len(rows) < 2:
        return None
    k = min(n, len(rows) - 1)
    a, b = rows[-1 - k][1], rows[-1][1]
    return round((b / a - 1.0) * 100.0, 2) if a > 0 else None


def _ranked(items: List[dict]) -> dict:
    by_1w = sorted(items, key=lambda s: s["chg_1w"], reverse=True)
    by_4w = sorted(items, key=lambda s: s["chg_4w"], reverse=True)
    return {"top5_1w": by_1w[:5], "bottom5_1w": by_1w[-5:], "top5_4w": by_4w[:5], "bottom5_4w": by_4w[-5:]}


def sectors(data: Daily) -> Optional[dict]:
    items = []
    for t, meta in SECTOR_ETFS.items():
        rows = data.get(t) or []
        w, m = _change(rows, WEEK), _change(rows, MONTH)
        if w is None or m is None:
            continue
        items.append({"ticker": t, "name": meta["name"], "color": meta["color"], "close": round(rows[-1][1], 2),
                      "chg_1w": w, "chg_4w": m})
    return {"sectors": items, **_ranked(items)} if items else None


def countries(data: Daily) -> Optional[dict]:
    items = []
    for t, meta in COUNTRY_ETFS.items():
        rows = data.get(t) or []
        w, m = _change(rows, WEEK), _change(rows, MONTH)
        if w is None or m is None:
            continue
        items.append({"ticker": t, "name": meta["name"], "code": meta["code"], "close": round(rows[-1][1], 2),
                      "chg_1w": w, "chg_4w": m})
    return {"countries": items, **_ranked(items)} if items else None


def country_flows(countries_body: dict, pairs: int = 3) -> dict:
    """Arcs from the weakest country ETFs to the strongest, per period: the
    rotation the relative performance shows."""
    out = {}
    items = countries_body.get("countries") or []
    for period, key in (("1W", "chg_1w"), ("4W", "chg_4w")):
        ranked = sorted(items, key=lambda c: c[key])
        losers, winners = ranked[:pairs], ranked[::-1][:pairs]
        spread_max = max((w[key] - lo[key] for lo, w in zip(losers, winners)), default=0.0) or 1.0
        flows = []
        for lo, w in zip(losers, winners):
            spread = w[key] - lo[key]
            if spread <= 0 or lo["code"] == w["code"]:
                continue
            flows.append({
                "from": lo["code"], "to": w["code"],
                "label": f"{lo['name']} {lo[key]:+.1f}% → {w['name']} {w[key]:+.1f}%",
                "magnitude": round(spread, 2),
                "color": "#00d2d3" if w["code"] in EMERGING else "#3796ff",
                "strength": round(max(0.3, spread / spread_max), 2),
            })
        out[period] = {"flows": flows}
    return out


def pressure_b(rows, n: int) -> float:
    """Σ over the last n days of the day's return × the dollars traded, in $B."""
    total = 0.0
    for (_, c0, _), (_, c1, v1) in zip(rows[-n - 1:-1], rows[-n:]):
        if c0 > 0:
            total += (c1 / c0 - 1.0) * c1 * v1
    return total / 1e9


def capital_flows(data: Daily, n: int, regime: Optional[str] = None, liquidity: Optional[dict] = None,
                  implications: Optional[Dict[str, Dict[str, str]]] = None) -> Optional[dict]:
    stance = (implications or {}).get(regime or "", {})
    nodes = {}
    for node, (label, icon, color, etfs, cls) in NODES.items():
        present = [t for t in etfs if len(data.get(t) or []) > n]
        if not present:
            continue
        flow = sum(pressure_b(data[t], n) for t in present)
        chg = sum(_change(data[t], n) or 0.0 for t in present) / len(present)
        nodes[node] = {
            "label": label, "icon": icon, "color": color, "net_flow_b": round(flow, 2),
            "sentiment": "INFLOW" if flow > 0.05 else "OUTFLOW" if flow < -0.05 else "NEUTRAL",
            "macro_score": {"BULLISH": 50, "BEARISH": -50}.get(stance.get(cls or "", ""), 0),
            "chg_pct": round(chg, 2), "etfs": present,
        }
    if not nodes:
        return None
    # Arcs: the biggest outflows feed the biggest inflows.
    outs = sorted(((k, -v["net_flow_b"]) for k, v in nodes.items() if v["net_flow_b"] < 0), key=lambda x: -x[1])
    ins = sorted(((k, v["net_flow_b"]) for k, v in nodes.items() if v["net_flow_b"] > 0), key=lambda x: -x[1])
    flows, i, j = [], 0, 0
    outs, ins = [list(x) for x in outs], [list(x) for x in ins]
    while i < len(outs) and j < len(ins) and len(flows) < 6:
        amount = min(outs[i][1], ins[j][1])
        src, dst = outs[i][0], ins[j][0]
        kind = ("liquidity" if "CASH" in (src, dst) else "hedging" if "OPTIONS" in (src, dst)
                else "yield_driven" if "BONDS" in (src, dst) else "rotation")
        flows.append({"from": src, "to": dst, "amount_b": round(amount, 1), "type": kind,
                      "reason": f"{nodes[src]['label']} {nodes[src]['chg_pct']:+.1f}% under selling pressure, "
                                f"{nodes[dst]['label']} {nodes[dst]['chg_pct']:+.1f}% being bought"})
        outs[i][1] -= amount
        ins[j][1] -= amount
        if outs[i][1] <= 1e-9:
            i += 1
        if ins[j][1] <= 1e-9:
            j += 1
    top = max((f["amount_b"] for f in flows), default=0.0) or 1.0
    for f in flows:
        f["strength"] = round(max(0.15, f["amount_b"] / top), 2)
    body = {"sectors": nodes, "flows": flows, "days": n,
            "method": "return × dollar volume of representative ETFs (a proxy, not reported fund flows)"}
    if regime:
        body["regime"] = regime
    if liquidity:
        body.update(net_liquidity_t=liquidity.get("value_label"), net_liquidity_prev_t=liquidity.get("prev_value_label"),
                    liq_trend=liquidity.get("trend"), liq_delta_label=liquidity.get("delta_4w_label"))
    return body


def build(data: Daily, fundamental_state: Optional[dict] = None) -> Dict[str, dict]:
    """The page's files, by name; a file whose data is missing is left out."""
    from .fundamental import IMPLICATIONS
    out: Dict[str, dict] = {}
    sec = sectors(data)
    if sec:
        out["GLOBAL_macro_sectors.json"] = sec
    cty = countries(data)
    if cty:
        out["GLOBAL_macro_countries.json"] = cty
        out["GLOBAL_macro_flows.json"] = country_flows(cty)
    reg = ((fundamental_state or {}).get("regime") or {}).get("label")
    liq = (fundamental_state or {}).get("liquidity")
    periods = {}
    for key, n in (("macro", MONTH), ("weekly", WEEK)):
        body = capital_flows(data, n, reg, liq, IMPLICATIONS)
        if body:
            periods[key] = body
    if periods:
        out["GLOBAL_macro_sector_flows.json"] = periods
    return out


def last_day(data: Daily) -> Optional[date]:
    days = [rows[-1][0] for rows in data.values() if rows]
    return max(days) if days else None
