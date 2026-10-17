# version: v1
"""
CFTC Commitments of Traders (COT): how speculators are positioned in the
futures behind each instrument, weekly, from the CFTC's public reporting API
(no key):

    https://publicreporting.cftc.gov/resource/6dca-aqww.json   (Legacy, futures only)

Speculators are the "non-commercial" traders (funds, CTAs). Their net
position (long − short) is compared with its own last three years: a z-score
above +1.5 is a crowded long, below −1.5 a crowded short, and beyond ±2 a
squeeze is possible when the crowd has to unwind.

Each contract is kept in <cache>/cot/<code>.json and downloaded again at most
every REFRESH_SEC (the report comes out on Fridays for the Tuesday before).
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

log = logging.getLogger("qt.local_analysis.cot")

URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
REFRESH_SEC = 12 * 3600
RETRY_SEC = 1800
WEEKS = 160                 # three years of weekly reports, and a few more
Z_WEEKS = 156
CHART_WEEKS = 52

# terminal ticker → (CFTC contract market code, +1 when a long future is long the ticker, −1 when short)
CONTRACTS: Dict[str, Tuple[str, int]] = {
    "XAUUSD": ("088691", 1), "XAGUSD": ("084691", 1), "COPPER": ("085692", 1),
    "XTIUSD": ("067651", 1), "NATGAS": ("023651", 1), "XNGUSD": ("023651", 1),
    "CORN": ("002602", 1), "WHEAT": ("001602", 1), "SOYBEAN": ("005602", 1),
    "SUGAR": ("080732", 1), "COFFEE": ("083731", 1), "COCOA": ("073732", 1), "COTTON": ("033661", 1),
    "US500": ("13874A", 1), "USTEC": ("209742", 1), "US30": ("124603", 1),
    "EURUSD": ("099741", 1), "GBPUSD": ("096742", 1), "AUDUSD": ("232741", 1), "NZDUSD": ("112741", 1),
    # yen, franc and loonie futures are the currency against the dollar: USD/XXX is the other way round
    "USDJPY": ("097741", -1), "USDCHF": ("092741", -1), "USDCAD": ("090741", -1),
    "BTCUSD": ("133741", 1),
}

Report = Dict[str, float]          # date, net, open_interest

_failed_at: Dict[str, float] = {}


class CotError(Exception):
    pass


def parse(rows: list) -> List[Tuple[date, float, float]]:
    """(report day, speculators' net position, open interest), oldest first."""
    out = {}
    for r in rows or []:
        try:
            day = date.fromisoformat(str(r["report_date_as_yyyy_mm_dd"])[:10])
            net = float(r["noncomm_positions_long_all"]) - float(r["noncomm_positions_short_all"])
            oi = float(r["open_interest_all"])
        except (KeyError, TypeError, ValueError):
            continue
        out[day] = (day, net, oi)
    return [out[d] for d in sorted(out)]


def _download(code: str, timeout: float) -> list:
    import httpx
    params = {"cftc_contract_market_code": code, "$order": "report_date_as_yyyy_mm_dd DESC",
              "$limit": str(WEEKS),
              "$select": "report_date_as_yyyy_mm_dd,open_interest_all,"
                         "noncomm_positions_long_all,noncomm_positions_short_all"}
    r = httpx.get(URL, params=params, timeout=timeout, follow_redirects=True,
                  headers={"User-Agent": "Mozilla/5.0 Quantum Terminal", "Accept": "application/json"})
    if r.status_code != 200:
        raise CotError(f"CFTC answered {r.status_code} for {code}")
    return r.json()


def reports(code: str, cache_dir: Path, download: Optional[Callable[[str, float], list]] = None,
            timeout: float = 20.0, now: Optional[float] = None) -> List[Tuple[date, float, float]]:
    """A contract's weekly reports, from the cache when fresh, else from the CFTC."""
    folder = Path(cache_dir) / "cot"
    path = folder / f"{code}.json"
    now = time.time() if now is None else now
    cached = None
    if path.is_file():
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            cached = None
    if cached is not None:
        if now - path.stat().st_mtime < REFRESH_SEC or now - _failed_at.get(code, 0.0) < RETRY_SEC:
            return parse(cached)
    elif now - _failed_at.get(code, 0.0) < RETRY_SEC:
        raise CotError(f"{code}: the CFTC was unreachable a moment ago")
    try:
        rows = (download or _download)(code, timeout)
        if not parse(rows):
            raise CotError(f"no reports for contract {code}")
    except Exception as e:
        _failed_at[code] = now
        if cached is not None:
            return parse(cached)
        raise CotError(f"{code}: {e}") from e
    _failed_at.pop(code, None)
    folder.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=code + ".", suffix=".tmp", dir=str(folder))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rows, f)
        os.replace(tmp, path)
    except OSError:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return parse(rows)


def label_for(z: float) -> str:
    if z >= 1.5:
        return "CROWDED LONG"
    if z >= 0.5:
        return "NET LONG"
    if z <= -1.5:
        return "CROWDED SHORT"
    if z <= -0.5:
        return "NET SHORT"
    return "NEUTRAL"


def summary(rows: List[Tuple[date, float, float]], sign: int = 1) -> Optional[dict]:
    """The page's COT block for one ticker: the latest net position, its
    z-score against the trailing three years, and a year of weekly z-scores."""
    if len(rows) < 26:
        return None
    net = np.array([r[1] for r in rows], dtype=float) * sign
    zs = []
    for i in range(len(net)):
        w = net[max(0, i - Z_WEEKS + 1): i + 1]
        sd = w.std()
        zs.append((net[i] - w.mean()) / sd if len(w) >= 26 and sd > 0 else np.nan)
    z = zs[-1]
    if not np.isfinite(z):
        return None
    day, _, oi = rows[-1]
    chart = [{"date": rows[i][0].isoformat(), "z": round(float(zs[i]), 2)}
             for i in range(max(0, len(rows) - CHART_WEEKS), len(rows)) if np.isfinite(zs[i])]
    return {
        "z_score": round(float(z), 2), "label": label_for(float(z)), "squeeze_risk": bool(abs(z) >= 2.0),
        "net_position": int(net[-1]), "open_interest": int(oi),
        "pct_spec_net": round(float(net[-1] / oi * 100.0), 1) if oi else 0.0,
        "report_date": day.isoformat(), "chart": chart,
    }


def for_universe(tickers: List[str], cache_dir: Path, download=None) -> Dict[str, dict]:
    """COT blocks for the tickers that have a futures contract. Contracts that
    can't be fetched are skipped."""
    out: Dict[str, dict] = {}
    for t in tickers:
        spec = CONTRACTS.get(t.upper())
        if spec is None:
            continue
        code, sign = spec
        try:
            block = summary(reports(code, cache_dir, download=download), sign)
        except CotError as e:
            log.debug(f"COT {t}: {e}")
            continue
        if block is not None:
            out[t.upper()] = block
    return out
