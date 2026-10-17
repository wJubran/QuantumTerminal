"""
================================================================================
Quantum Terminal — Yahoo Finance data feed (free, delayed)
================================================================================
Prices and bars from Yahoo Finance through the yfinance package (already a
dependency). No account or key. It covers almost everything:

    forex                 EURUSD=X, GBPUSD=X, JPY=X (USD/JPY) …
    metals and energy     front-month futures: GC=F gold, SI=F silver, HG=F copper,
                          CL=F WTI crude, BZ=F Brent, NG=F natural gas …
    agriculture           ZC=F corn, ZW=F wheat, ZS=F soybeans, KC=F coffee,
                          SB=F sugar, CC=F cocoa, CT=F cotton
    indices               ES=F / NQ=F / YM=F (US futures, nearly 24 h), ^GDAXI, ^FTSE, ^N225 …
    stocks, ETFs, crypto  AAPL, SPY, GLD, BTC-USD … (any Yahoo symbol works as a ticker)

Yahoo's data is delayed: by up to 10–15 minutes for futures and stocks, less
for forex and crypto. It suits analysis and paper trading, not scalping. Quotes
are polled every `quote_interval` seconds (default 30, one request per ticker)
to stay within Yahoo's limits. A quote is the last trade, so bid = ask: paper
orders on it fill without a spread. Intraday history is limited: about 7 days
of M1, 60 days of M5–M30, and 2 years of H1 (H4 is built from H1). Daily bars
go back years.

    account config (providers.accounts.yahoo_default)
        quote_interval   seconds between quote refreshes (default 30)
        symbols          {"XAUUSD": "XAUUSD=X", …} replacement mappings
================================================================================
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

from providers.feed_base import TF_SECONDS, FeedError, FeedProvider, Row

_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK",
               "PLN", "HUF", "CZK", "TRY", "ZAR", "MXN", "SGD", "HKD", "CNH", "CNY", "INR"}


class YahooProvider(FeedProvider):
    TYPE = "yahoo"
    LABEL = "Yahoo Finance (free, delayed)"
    SYMBOLS = {
        # forex (USD/XXX pairs are listed by Yahoo as XXX=X)
        "USDJPY": "JPY=X", "USDCHF": "CHF=X", "USDCAD": "CAD=X",
        # metals and energy: front-month futures
        "XAUUSD": "GC=F", "XAGUSD": "SI=F", "XPTUSD": "PL=F", "XPDUSD": "PA=F", "COPPER": "HG=F",
        "XTIUSD": "CL=F", "XBRUSD": "BZ=F", "NATGAS": "NG=F", "XNGUSD": "NG=F",
        "HEATOIL": "HO=F", "GASOLINE": "RB=F",
        # agriculture
        "CORN": "ZC=F", "WHEAT": "ZW=F", "SOYBEAN": "ZS=F", "COFFEE": "KC=F",
        "SUGAR": "SB=F", "COCOA": "CC=F", "COTTON": "CT=F", "CATTLE": "LE=F",
        # indices: US index futures trade nearly around the clock, like index CFDs
        "US500": "ES=F", "USTEC": "NQ=F", "US30": "YM=F", "US2000": "RTY=F",
        "GER40": "^GDAXI", "UK100": "^FTSE", "JP225": "^N225", "FRA40": "^FCHI",
        "EU50": "^STOXX50E", "HK50": "^HSI", "AUS200": "^AXJO", "VIX": "^VIX", "USDX": "DX-Y.NYB",
        # crypto
        "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD", "SOLUSD": "SOL-USD", "XRPUSD": "XRP-USD",
    }
    NATIVE = {"M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m", "H1": "60m", "D1": "1d", "W1": "1wk"}
    BUILD_FROM = {"H4": "H1"}
    DEFAULT_QUOTE_INTERVAL = 30.0      # Yahoo throttles frequent polling; one request per ticker
    BAR_TTL = 30.0
    HISTORY_LIMIT_DAYS = {"1m": 7, "5m": 59, "15m": 59, "30m": 59, "60m": 729}

    def _yf(self):
        try:
            import yfinance
        except ImportError as e:
            raise FeedError("the yfinance package is not installed (pip install yfinance)") from e
        return yfinance

    def guess_symbol(self, canonical: str):
        """EURUSD → EURUSD=X; anything else is taken as a Yahoo symbol (AAPL, SPY, ^GSPC)."""
        if len(canonical) == 6 and canonical[:3] in _CURRENCIES and canonical[3:] in _CURRENCIES:
            return f"{canonical}=X"
        return canonical

    def _history(self, symbol: str, interval: str, **kw):
        return self._yf().Ticker(symbol).history(interval=interval, prepost=True, auto_adjust=False,
                                                 actions=False, **kw)

    def _frame_rows(self, df, daily: bool) -> List[Row]:
        if df is None or len(df) == 0:
            return []
        cols = [c for c in ("Open", "High", "Low", "Close", "Volume") if c in df.columns]
        if len(cols) < 4:
            return []
        rows: List[Row] = []
        for ts, values in zip(df.index, df[cols].itertuples(index=False, name=None)):
            o, h, l, c = (float(x) for x in values[:4])
            v = float(values[4]) if len(values) > 4 and values[4] == values[4] else 0.0
            if not all(math.isfinite(x) and x > 0 for x in (o, h, l, c)):
                continue
            t = self.day_epoch(ts.date()) if daily else ts.timestamp()
            rows.append((t, o, h, l, c, v))
        return rows

    def _check_connection(self) -> None:
        df = self._history(self.feed_symbol("EURUSD") or "EURUSD=X", "1d", period="5d")
        if df is None or len(df) == 0:
            raise FeedError("Yahoo Finance returned no data: no internet access, or a temporary block "
                            "(wait a few minutes)")

    def _fetch_quotes(self, pairs: List[Tuple[str, str]]) -> Dict[str, Tuple[float, float, float, float]]:
        out = {}
        for canonical, symbol in pairs:
            try:
                rows = self._frame_rows(self._history(symbol, "1m", period="1d"), daily=False)
                if not rows and canonical not in self._quotes:
                    # market closed today, no price yet: the last 5-minute bar of recent days
                    rows = self._frame_rows(self._history(symbol, "5m", period="5d"), daily=False)
            except Exception as e:
                self._log_error(f"{canonical} quote", e)
                continue
            if rows:
                t, _, _, _, close, _ = rows[-1]
                out[canonical] = (close, close, close, t + 60)
        return out

    def _fetch_bars(self, symbol: str, timeframe: str, count: int) -> List[Row]:
        interval = self.NATIVE[timeframe]
        daily = timeframe in ("D1", "W1")
        # Calendar span for `count` bars, with room for nights, weekends and holidays.
        days = count * TF_SECONDS[timeframe] / 86400 * (1.6 if daily else 3.5) + 5
        days = min(days, self.HISTORY_LIMIT_DAYS.get(interval, days))
        start = datetime.now(timezone.utc) - timedelta(days=days)
        return self._frame_rows(self._history(symbol, interval, start=start), daily=daily)[-count:]

