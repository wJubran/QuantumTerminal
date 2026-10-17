"""
macro_data.py — Macro Rotation Data Provider
Quantum Terminal Analytical Terminal

Fetches sector ETF and country ETF performance data from yfinance.
Computes 1-week and 4-week percentage changes.
Results cached with configurable TTL to avoid API hammering.

Endpoints served:
    GET /api/macro/sectors   → sector ETF performance
    GET /api/macro/countries → country ETF performance
"""

import logging
import time
from typing import Dict, List, Optional

log = logging.getLogger("qt.macro_data")

# ════════════════════════════════════════════════════════
# ETF UNIVERSE — no hardcoded assets, but ETFs are
# benchmark instruments (not part of trading universe)
# ════════════════════════════════════════════════════════

SECTOR_ETFS = {
    "XLE":  {"name": "Energy",                  "color": "#e67e22"},
    "XLF":  {"name": "Financials",              "color": "#3498db"},
    "XLK":  {"name": "Technology",              "color": "#9b59b6"},
    "XLRE": {"name": "Real Estate",             "color": "#1abc9c"},
    "XLU":  {"name": "Utilities",               "color": "#f39c12"},
    "XLV":  {"name": "Healthcare",              "color": "#2ecc71"},
    "XLB":  {"name": "Materials",               "color": "#e74c3c"},
    "XLI":  {"name": "Industrials",             "color": "#34495e"},
    "XLC":  {"name": "Communication",           "color": "#e84393"},
    "XLY":  {"name": "Consumer Discretionary",  "color": "#00cec9"},
    "XLP":  {"name": "Consumer Staples",        "color": "#fdcb6e"},
}

COUNTRY_ETFS = {
    "SPY":  {"name": "United States",   "code": "US"},
    "EWJ":  {"name": "Japan",           "code": "JP"},
    "FXI":  {"name": "China",           "code": "CN"},
    "EWG":  {"name": "Germany",         "code": "DE"},
    "EWU":  {"name": "United Kingdom",  "code": "GB"},
    "EWZ":  {"name": "Brazil",          "code": "BR"},
    "EWA":  {"name": "Australia",       "code": "AU"},
    "EWC":  {"name": "Canada",          "code": "CA"},
    "EWY":  {"name": "South Korea",     "code": "KR"},
    "EWT":  {"name": "Taiwan",          "code": "TW"},
    "INDA": {"name": "India",           "code": "IN"},
    "EWQ":  {"name": "France",          "code": "FR"},
    "EWI":  {"name": "Italy",           "code": "IT"},
    "EWP":  {"name": "Spain",           "code": "ES"},
    "EWW":  {"name": "Mexico",          "code": "MX"},
    "EZA":  {"name": "South Africa",    "code": "ZA"},
    "TUR":  {"name": "Turkey",          "code": "TR"},
    "KSA":  {"name": "Saudi Arabia",    "code": "SA"},
    "EWS":  {"name": "Singapore",       "code": "SG"},
    "EWH":  {"name": "Hong Kong",       "code": "HK"},
    "EWM":  {"name": "Malaysia",        "code": "MY"},
    "EWN":  {"name": "Netherlands",     "code": "NL"},
    "EWD":  {"name": "Sweden",          "code": "SE"},
    "EWL":  {"name": "Switzerland",     "code": "CH"},
    "THD":  {"name": "Thailand",        "code": "TH"},
}


# ════════════════════════════════════════════════════════
# CACHE
# ════════════════════════════════════════════════════════

_cache: Dict[str, dict] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


def _is_cache_valid(key: str) -> bool:
    if key not in _cache:
        return False
    return (time.time() - _cache[key]["ts"]) < CACHE_TTL_SECONDS


# ════════════════════════════════════════════════════════
# DATA FETCH
# ════════════════════════════════════════════════════════

def _fetch_etf_changes(tickers: List[str], period: str = "2mo") -> Dict[str, dict]:
    """
    Fetch OHLCV for a list of ETF tickers and compute
    1-week and 4-week percentage changes from latest close.

    Returns dict keyed by ticker:
        {ticker: {"close": float, "chg_1w": float, "chg_4w": float}}
    """
    try:
        import yfinance as yf
    except ImportError:
        log.warning("yfinance not installed — macro data unavailable")
        return {}

    results = {}
    try:
        # Batch download — single API call for all tickers
        data = yf.download(tickers, period=period, interval="1d",
                           auto_adjust=True, progress=False, threads=True)

        if data.empty:
            log.warning("yfinance returned empty data for macro ETFs")
            return {}

        close = data["Close"] if "Close" in data.columns else data.get("close")
        if close is None or close.empty:
            log.warning("No Close column in yfinance macro data")
            return {}

        # Handle single ticker case (returns Series, not DataFrame)
        if isinstance(close, type(data)):
            pass  # already DataFrame
        else:
            # Single ticker returns Series — unlikely but handle
            close = close.to_frame(name=tickers[0])

        for ticker in tickers:
            if ticker not in close.columns:
                continue

            series = close[ticker].dropna()
            if len(series) < 2:
                continue

            latest = float(series.iloc[-1])

            # 1-week change (5 trading days back)
            idx_1w = min(5, len(series) - 1)
            close_1w = float(series.iloc[-1 - idx_1w])
            chg_1w = ((latest - close_1w) / close_1w) * 100 if close_1w != 0 else 0.0

            # 4-week change (20 trading days back)
            idx_4w = min(20, len(series) - 1)
            close_4w = float(series.iloc[-1 - idx_4w])
            chg_4w = ((latest - close_4w) / close_4w) * 100 if close_4w != 0 else 0.0

            results[ticker] = {
                "close": round(latest, 2),
                "chg_1w": round(chg_1w, 2),
                "chg_4w": round(chg_4w, 2),
            }

    except Exception as e:
        log.warning(f"yfinance macro fetch failed: {e}")

    return results


# ════════════════════════════════════════════════════════
# PUBLIC API
# ════════════════════════════════════════════════════════

def get_sector_data(force_refresh: bool = False) -> dict:
    """
    Returns sector performance data.

    Response shape:
    {
        "sectors": [
            {"ticker": "XLE", "name": "Energy", "color": "#e67e22",
             "close": 88.5, "chg_1w": 2.3, "chg_4w": -1.1},
            ...
        ],
        "top5_1w": [...],
        "bottom5_1w": [...],
        "top5_4w": [...],
        "bottom5_4w": [...],
        "updated_at": 1700000000.0
    }
    """
    cache_key = "sectors"

    if not force_refresh and _is_cache_valid(cache_key):
        return _cache[cache_key]["data"]

    tickers = list(SECTOR_ETFS.keys())
    raw = _fetch_etf_changes(tickers)

    sectors = []
    for ticker, meta in SECTOR_ETFS.items():
        perf = raw.get(ticker, {})
        sectors.append({
            "ticker": ticker,
            "name": meta["name"],
            "color": meta["color"],
            "close": perf.get("close", 0),
            "chg_1w": perf.get("chg_1w", 0),
            "chg_4w": perf.get("chg_4w", 0),
        })

    # Sort helpers
    sorted_1w = sorted(sectors, key=lambda s: s["chg_1w"], reverse=True)
    sorted_4w = sorted(sectors, key=lambda s: s["chg_4w"], reverse=True)

    result = {
        "sectors": sectors,
        "top5_1w": sorted_1w[:5],
        "bottom5_1w": sorted_1w[-5:],
        "top5_4w": sorted_4w[:5],
        "bottom5_4w": sorted_4w[-5:],
        "updated_at": time.time(),
    }

    _cache[cache_key] = {"data": result, "ts": time.time()}
    log.info(f"Sector data refreshed — {len(sectors)} sectors loaded")
    return result


def get_country_data(force_refresh: bool = False) -> dict:
    """
    Returns country ETF performance data.

    Response shape:
    {
        "countries": [
            {"ticker": "SPY", "name": "United States", "code": "US",
             "close": 440.5, "chg_1w": 1.2, "chg_4w": 3.5},
            ...
        ],
        "top5_1w": [...],
        "bottom5_1w": [...],
        "top5_4w": [...],
        "bottom5_4w": [...],
        "updated_at": 1700000000.0
    }
    """
    cache_key = "countries"

    if not force_refresh and _is_cache_valid(cache_key):
        return _cache[cache_key]["data"]

    tickers = list(COUNTRY_ETFS.keys())
    raw = _fetch_etf_changes(tickers)

    countries = []
    for ticker, meta in COUNTRY_ETFS.items():
        perf = raw.get(ticker, {})
        countries.append({
            "ticker": ticker,
            "name": meta["name"],
            "code": meta["code"],
            "close": perf.get("close", 0),
            "chg_1w": perf.get("chg_1w", 0),
            "chg_4w": perf.get("chg_4w", 0),
        })

    sorted_1w = sorted(countries, key=lambda c: c["chg_1w"], reverse=True)
    sorted_4w = sorted(countries, key=lambda c: c["chg_4w"], reverse=True)

    result = {
        "countries": countries,
        "top5_1w": sorted_1w[:5],
        "bottom5_1w": sorted_1w[-5:],
        "top5_4w": sorted_4w[:5],
        "bottom5_4w": sorted_4w[-5:],
        "updated_at": time.time(),
    }

    _cache[cache_key] = {"data": result, "ts": time.time()}
    log.info(f"Country data refreshed — {len(countries)} countries loaded")
    return result


# ════════════════════════════════════════════════════════
# CLI DIAGNOSTIC
# ════════════════════════════════════════════════════════

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(message)s")

    print("=" * 60)
    print("MACRO DATA — SECTOR ETFS")
    print("=" * 60)
    sd = get_sector_data(force_refresh=True)
    for s in sd["sectors"]:
        arrow_1w = "▲" if s["chg_1w"] >= 0 else "▼"
        arrow_4w = "▲" if s["chg_4w"] >= 0 else "▼"
        print(f"  {s['ticker']:5s}  {s['name']:28s}  "
              f"1W: {arrow_1w} {s['chg_1w']:+6.2f}%   "
              f"4W: {arrow_4w} {s['chg_4w']:+6.2f}%")

    print(f"\n  TOP 5 (1W):    {', '.join(s['name'] for s in sd['top5_1w'])}")
    print(f"  BOTTOM 5 (1W): {', '.join(s['name'] for s in sd['bottom5_1w'])}")

    print("\n" + "=" * 60)
    print("MACRO DATA — COUNTRY ETFS")
    print("=" * 60)
    cd = get_country_data(force_refresh=True)
    for c in cd["countries"]:
        arrow_1w = "▲" if c["chg_1w"] >= 0 else "▼"
        arrow_4w = "▲" if c["chg_4w"] >= 0 else "▼"
        print(f"  {c['ticker']:5s}  {c['code']:3s}  {c['name']:20s}  "
              f"1W: {arrow_1w} {c['chg_1w']:+6.2f}%   "
              f"4W: {arrow_4w} {c['chg_4w']:+6.2f}%")

    print(f"\n  TOP 5 (1W):    {', '.join(c['name'] for c in cd['top5_1w'])}")
    print(f"  BOTTOM 5 (1W): {', '.join(c['name'] for c in cd['bottom5_1w'])}")
    print("\nDONE")
