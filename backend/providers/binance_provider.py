"""
================================================================================
Quantum Terminal — Binance data feed (crypto, real time)
================================================================================
Public market data from the Binance spot REST API. No account or API key is
needed for prices and bars.

    account config (providers.accounts.binance_default)
        base_url     https://api.binance.com (default)
                     https://api.binance.us for the United States
                     https://data-api.binance.vision for market data only
        quote_asset  USDT (default): BTCUSD is read as BTCUSDT
        symbols      {"BTCUSD": "BTCFDUSD", …} extra or replacement mappings

Quotes are the best bid/ask (bookTicker), polled once a second, for all
symbols in one request. Bars come from /api/v3/klines; times are UTC, and
daily and weekly bars start at 00:00 UTC (weeks on Monday).
================================================================================
"""

from __future__ import annotations

import json
import time
from typing import Dict, List, Tuple

from providers.feed_base import FeedError, FeedProvider, Row, check_response, http_client


class BinanceProvider(FeedProvider):
    TYPE = "binance"
    LABEL = "Binance (crypto, real time)"
    # Crypto bases traded against the quote asset: <BASE>USD → <BASE><quote_asset>.
    CRYPTO_BASES = ("BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC", "AVAX", "DOT",
                    "LINK", "TRX", "TON", "SHIB", "BCH", "XLM", "ATOM", "NEAR", "UNI", "APT",
                    "ARB", "OP", "SUI", "PEPE", "FIL", "ETC", "AAVE", "ICP", "MATIC", "POL")
    NATIVE = {"M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m",
              "H1": "1h", "H4": "4h", "D1": "1d", "W1": "1w"}
    DEFAULT_QUOTE_INTERVAL = 1.0
    MAX_LIMIT = 1000

    def __init__(self, account_config: Dict):
        super().__init__(account_config)
        self.base_url = (self._cfg.get("base_url") or "https://api.binance.com").rstrip("/")
        self.quote_asset = str(self._cfg.get("quote_asset") or "USDT").upper()
        self._client = None

    def _http(self):
        if self._client is None:
            self._client = http_client()
        return self._client

    def _get(self, path: str, params=None):
        return check_response(self._http().get(self.base_url + path, params=params), "Binance").json()

    def guess_symbol(self, canonical: str):
        """BTCUSD → BTCUSDT (or BTC + the configured quote asset); a full
        Binance symbol (ETHBTC, SOLUSDC) as is. Forex, metals and indices
        are not on Binance."""
        if canonical.endswith("USD") and canonical[:-3] in self.CRYPTO_BASES:
            return canonical[:-3] + self.quote_asset
        if canonical.endswith(("USDT", "USDC", "FDUSD", "BTC", "ETH", "EUR", "TRY")) and len(canonical) > 5:
            return canonical
        return None

    def _check_connection(self) -> None:
        self._get("/api/v3/ping")

    def _fetch_quotes(self, pairs: List[Tuple[str, str]]) -> Dict[str, Tuple[float, float, float, float]]:
        by_symbol = {f: c for c, f in pairs}
        try:
            rows = self._get("/api/v3/ticker/bookTicker", {"symbols": json.dumps(list(by_symbol))})
        except FeedError:
            # One unknown symbol fails the whole batch: ask one at a time.
            rows = []
            for sym in by_symbol:
                try:
                    rows.append(self._get("/api/v3/ticker/bookTicker", {"symbol": sym}))
                except FeedError:
                    continue
        now = time.time()
        out = {}
        for r in rows:
            c = by_symbol.get(r.get("symbol"))
            if c is None:
                continue
            bid, ask = float(r["bidPrice"]), float(r["askPrice"])
            if bid <= 0 and ask <= 0:
                continue
            out[c] = (bid, ask, bid, now)
        return out

    def _fetch_bars(self, symbol: str, timeframe: str, count: int) -> List[Row]:
        rows: List[Row] = []
        end = None
        while len(rows) < count:
            params = {"symbol": symbol, "interval": self.NATIVE[timeframe],
                      "limit": min(self.MAX_LIMIT, count - len(rows))}
            if end is not None:
                params["endTime"] = end
            batch = self._get("/api/v3/klines", params)
            if not batch:
                break
            rows = [(k[0] / 1000.0, float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5]))
                    for k in batch] + rows
            if len(batch) < params["limit"]:
                break
            end = int(batch[0][0]) - 1
        return rows[-count:]
