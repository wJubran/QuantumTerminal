"""
================================================================================
Quantum Terminal — Alpaca data feed (US stocks & ETFs, crypto)
================================================================================
Market data from Alpaca's data API. It needs a free Alpaca account and an API
key pair (paper-trading keys work too).

    account config (providers.accounts.alpaca_default)
        key_id       API key ID (or the APCA_API_KEY_ID environment variable)
        secret_key   API secret (or APCA_API_SECRET_KEY)
        feed         "iex" (default, free real-time IEX quotes) or "sip" (paid, all US exchanges)
        symbols      {"GOLD": "GLD", …} extra or replacement mappings

What it covers:
- Stocks and ETFs by their symbol: AAPL, SPY, QQQ. Commodity ETFs work too:
  GLD and IAU gold, SLV silver, USO oil, UNG natural gas, CPER copper, DBA
  agriculture.
- Crypto: BTCUSD, ETHUSD and others, read as BTC/USD.
- Forex, spot metals and index CFDs are not on Alpaca.

Times are UTC. Daily bars are labelled with their trading day. This feed is
data-only: practise with the paper account, which fills orders at these live
prices.
================================================================================
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

from providers.feed_base import TF_SECONDS, FeedError, FeedProvider, Row, check_response, http_client, parse_iso

_CRYPTO = ("BTC", "ETH", "SOL", "LTC", "BCH", "DOGE", "AVAX", "LINK", "UNI", "AAVE", "DOT",
           "XRP", "SHIB", "XTZ", "MKR", "CRV", "GRT", "SUSHI", "YFI", "BAT", "USDT", "USDC")
_STOCK = re.compile(r"^[A-Z]{1,5}([.][A-Z])?$")
# Commodity tickers of the terminal that look like stock symbols (CORN is also
# an ETF): never guessed, so a commodity doesn't show a fund's price by
# accident. Map one explicitly (broker symbol) to use the fund.
_COMMODITIES = {"CORN", "WHEAT", "SUGAR", "COCOA"}


class AlpacaProvider(FeedProvider):
    TYPE = "alpaca"
    LABEL = "Alpaca (US stocks & ETFs, crypto)"
    NATIVE = {"M1": "1Min", "M5": "5Min", "M15": "15Min", "M30": "30Min",
              "H1": "1Hour", "H4": "4Hour", "D1": "1Day", "W1": "1Week"}
    DEFAULT_QUOTE_INTERVAL = 1.0
    DATA_URL = "https://data.alpaca.markets"

    def __init__(self, account_config: Dict):
        super().__init__(account_config)
        self.key_id = self._cfg.get("key_id") or os.environ.get("APCA_API_KEY_ID", "")
        self.secret_key = self._cfg.get("secret_key") or os.environ.get("APCA_API_SECRET_KEY", "")
        self.feed = str(self._cfg.get("feed") or "iex").lower()
        self.base_url = (self._cfg.get("base_url") or self.DATA_URL).rstrip("/")
        self._client = None

    def _http(self):
        if self._client is None:
            self._client = http_client({"APCA-API-KEY-ID": self.key_id,
                                        "APCA-API-SECRET-KEY": self.secret_key})
        return self._client

    def _get(self, path: str, params=None):
        return check_response(self._http().get(self.base_url + path, params=params), "Alpaca").json()

    @staticmethod
    def _is_crypto(symbol: str) -> bool:
        return "/" in symbol

    def guess_symbol(self, canonical: str):
        """BTCUSD → BTC/USD; a stock or ETF symbol (AAPL, GLD, BRK.B) as is."""
        if canonical.endswith("USD") and canonical[:-3] in _CRYPTO:
            return f"{canonical[:-3]}/USD"
        if "/" in canonical or (_STOCK.match(canonical) and canonical not in _COMMODITIES):
            return canonical
        return None

    def _check_connection(self) -> None:
        if not (self.key_id and self.secret_key):
            raise FeedError("Alpaca needs an API key ID and secret: create them in the Alpaca dashboard, "
                            "then enter them in Settings → DATA SOURCES (or set APCA_API_KEY_ID / "
                            "APCA_API_SECRET_KEY)")
        self._get("/v2/stocks/quotes/latest", {"symbols": "SPY", "feed": self.feed})

    def _fetch_quotes(self, pairs: List[Tuple[str, str]]) -> Dict[str, Tuple[float, float, float, float]]:
        stocks = {f: c for c, f in pairs if not self._is_crypto(f)}
        crypto = {f: c for c, f in pairs if self._is_crypto(f)}
        out: Dict[str, Tuple[float, float, float, float]] = {}
        if stocks:
            quotes = self._get("/v2/stocks/quotes/latest",
                               {"symbols": ",".join(stocks), "feed": self.feed}).get("quotes", {})
            missing = []
            for sym, q in quotes.items():
                bid, ask = float(q.get("bp") or 0), float(q.get("ap") or 0)
                if bid > 0 and ask > 0:
                    out[stocks[sym]] = (bid, ask, bid, parse_iso(q["t"]) if q.get("t") else time.time())
                else:
                    missing.append(sym)
            missing += [s for s in stocks if s not in quotes]
            if missing:      # no live quote (e.g. outside market hours): the last trade
                trades = self._get("/v2/stocks/trades/latest",
                                   {"symbols": ",".join(missing), "feed": self.feed}).get("trades", {})
                for sym, t in trades.items():
                    p = float(t.get("p") or 0)
                    if p > 0:
                        out[stocks[sym]] = (p, p, p, parse_iso(t["t"]) if t.get("t") else time.time())
        if crypto:
            quotes = self._get("/v1beta3/crypto/us/latest/quotes",
                               {"symbols": ",".join(crypto)}).get("quotes", {})
            for sym, q in quotes.items():
                bid, ask = float(q.get("bp") or 0), float(q.get("ap") or 0)
                if sym in crypto and bid > 0:
                    out[crypto[sym]] = (bid, ask or bid, bid, parse_iso(q["t"]) if q.get("t") else time.time())
        return out

    def _fetch_bars(self, symbol: str, timeframe: str, count: int) -> List[Row]:
        crypto = self._is_crypto(symbol)
        daily = timeframe in ("D1", "W1")
        span = count * TF_SECONDS[timeframe] * (1.5 if crypto else (1.6 if daily else 4.0)) + 5 * 86400
        start = (datetime.now(timezone.utc) - timedelta(seconds=span)).isoformat().replace("+00:00", "Z")
        path = "/v1beta3/crypto/us/bars" if crypto else "/v2/stocks/bars"
        params = {"symbols": symbol, "timeframe": self.NATIVE[timeframe], "start": start,
                  "limit": 10000, "sort": "asc"}
        if not crypto:
            params.update(feed=self.feed, adjustment="raw")
        rows: List[Row] = []
        while True:
            data = self._get(path, params)
            for b in (data.get("bars") or {}).get(symbol, []):
                t = parse_iso(b["t"])
                if daily:     # midnight New York (stocks) or UTC (crypto) → that trading day
                    t = self.day_epoch(datetime.fromtimestamp(t + 12 * 3600, tz=timezone.utc).date())
                rows.append((t, float(b["o"]), float(b["h"]), float(b["l"]), float(b["c"]), float(b.get("v", 0))))
            token = data.get("next_page_token")
            if not token or len(rows) >= 50_000:
                break
            params["page_token"] = token
        return rows[-count:]
