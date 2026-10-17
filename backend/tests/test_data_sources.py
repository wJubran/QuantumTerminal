"""Data sources: the feed base, Binance, OANDA, Alpaca, Yahoo Finance, CSV
files, the paper account on live prices, and the Settings → DATA SOURCES API.

Network calls never leave the test. httpx.MockTransport answers with
payloads in the format each API documents, so these tests check how the
terminal builds its requests and reads the answers. The services themselves
are not contacted."""

import json
import math
import os
import sys
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from providers.alpaca_provider import AlpacaProvider
from providers.binance_provider import BinanceProvider
from providers.csv_provider import CsvProvider, parse_csv
from providers.feed_base import aggregate, bucket_start, clock_offset, decimals_for, parse_iso
from providers.oanda_provider import OandaProvider
from providers.paper_provider import PaperProvider
from providers.yahoo_provider import YahooProvider


def ts(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp()


def mock(provider, handler):
    """Route the provider's HTTP client through `handler(request) -> (status, json)`.
    The client is still built by the provider's own _http(), with its own
    headers (API keys), so those are checked too."""
    def respond(request):
        status, payload = handler(request)
        return httpx.Response(status, json=payload)

    module = sys.modules[type(provider).__module__]
    real = module.http_client

    def fake_client(headers=None, timeout=10.0):
        return httpx.Client(transport=httpx.MockTransport(respond), headers=headers or {})
    module.http_client = fake_client
    try:
        provider._client = None
        provider._http()
    finally:
        module.http_client = real
    return provider


def query(request):
    return {k: v[0] for k, v in parse_qs(urlparse(str(request.url)).query).items()}


# ── feed base ─────────────────────────────────────────────────────────

def test_bar_buckets_on_utc_and_new_york_close_clocks():
    t = ts("2026-10-16T13:47:12")                                   # a Friday
    assert bucket_start(t, "M15") == ts("2026-10-16T13:45:00")
    assert bucket_start(t, "H4") == ts("2026-10-16T12:00:00")
    assert bucket_start(t, "D1") == ts("2026-10-16T00:00:00")
    assert bucket_start(t, "W1") == ts("2026-10-12T00:00:00")       # Monday
    # New York close: the FX day starts at 17:00 New York (21:00 UTC in summer, 22:00 in winter)
    assert clock_offset("ny_close", ts("2026-07-01T12:00:00")) == 3 * 3600
    assert clock_offset("ny_close", ts("2026-01-15T12:00:00")) == 2 * 3600
    assert bucket_start(ts("2026-10-15T22:30:00"), "D1", "ny_close") == ts("2026-10-15T21:00:00")
    assert bucket_start(ts("2026-01-15T22:30:00"), "D1", "ny_close") == ts("2026-01-15T22:00:00")


def test_aggregate_builds_coarser_bars():
    rows = [(ts(f"2026-10-16T{h:02d}:00:00"), 10 + h, 11 + h, 9 + h, 10.5 + h, 1) for h in range(8)]
    h4 = aggregate(rows, "H4")
    assert [r[0] for r in h4] == [ts("2026-10-16T00:00:00"), ts("2026-10-16T04:00:00")]
    assert h4[0][1:] == (10, 14, 9, 13.5, 4)


def test_helpers():
    assert decimals_for(1.0850) == 5 and decimals_for(4012.5) == 2 and decimals_for(0.00012) == 8
    assert parse_iso("2026-10-16T20:59:59.123456789Z") == pytest.approx(ts("2026-10-16T20:59:59") + 0.123456)
    assert parse_iso("2026-10-16T04:00:00-04:00") == ts("2026-10-16T08:00:00")


# ── Binance ───────────────────────────────────────────────────────────

def test_binance_quotes_and_symbol_mapping():
    p = BinanceProvider({"id": "binance_default"})
    assert p.feed_symbol("BTCUSD") == "BTCUSDT" and p.feed_symbol("SOLUSDC") == "SOLUSDC"
    assert p.feed_symbol("EURUSD") is None and p.feed_symbol("XAUUSD") is None
    seen = []

    def handler(req):
        seen.append(req.url.path)
        if req.url.path == "/api/v3/ping":
            return 200, {}
        assert json.loads(query(req)["symbols"]) == ["BTCUSDT", "ETHUSDT"]
        return 200, [{"symbol": "BTCUSDT", "bidPrice": "67000.10000000", "bidQty": "1", "askPrice": "67000.20000000", "askQty": "2"},
                     {"symbol": "ETHUSDT", "bidPrice": "3500.01000000", "bidQty": "1", "askPrice": "3500.02000000", "askQty": "2"}]
    mock(p, handler)
    assert p.connect()
    ticks = p.get_latest_ticks(["BTCUSD", "ETHUSD"])
    assert ticks["BTCUSD"].bid == 67000.10 and ticks["BTCUSD"].ask == 67000.20
    assert ticks["ETHUSD"].spread == pytest.approx(0.01)
    p.get_latest_ticks(["BTCUSD", "ETHUSD"])                 # within quote_interval: cached
    assert seen.count("/api/v3/ticker/bookTicker") == 1


def test_binance_unknown_symbol_does_not_sink_the_batch():
    p = BinanceProvider({})

    def handler(req):
        q = query(req)
        if "symbols" in q:
            return 400, {"code": -1121, "msg": "Invalid symbol."}
        if q.get("symbol") == "DOGEUSDT":
            return 200, {"symbol": "DOGEUSDT", "bidPrice": "0.15", "askPrice": "0.1501"}
        return 400, {"code": -1121, "msg": "Invalid symbol."}
    mock(p, handler)._connected = True
    ticks = p.get_latest_ticks(["DOGEUSD", "TONUSD"])
    assert set(ticks) == {"DOGEUSD"}
    assert "TONUSD" in p._dead                                  # not asked again every second


def test_binance_klines_paginate_and_use_utc():
    p = BinanceProvider({})
    start = ts("2026-10-01T00:00:00") * 1000
    all_bars = [[int(start + i * 60_000), "1.0", "1.2", "0.9", "1.1", "10", 0, "0", 1, "0", "0", "0"]
                for i in range(1500)]
    calls = []

    def handler(req):
        q = query(req)
        calls.append(q)
        end = int(q.get("endTime", 10 ** 15))
        rows = [b for b in all_bars if b[0] <= end][-int(q["limit"]):]
        return 200, rows
    mock(p, handler)._connected = True
    bars = p.get_bars("BTCUSD", "M1", 1200)
    assert len(bars) == 1200 and len(calls) == 2
    assert bars[-1].time == "2026-10-02T00:59:00"               # 1,499 minutes after the start
    assert [b.time for b in bars] == sorted(b.time for b in bars)


def test_check_new_bars_fetches_only_after_a_boundary():
    p = BinanceProvider({})
    calls = []

    def handler(req):
        calls.append(1)
        now = math.floor(datetime.now(timezone.utc).timestamp() / 900) * 900
        return 200, [[int((now - 900 * k) * 1000), "1", "2", "0.5", "1.5", "3", 0, "0", 1, "0", "0", "0"]
                     for k in (2, 1, 0)]
    mock(p, handler)._connected = True
    assert p.check_new_bars(["BTCUSD"], "M15") == [] and not calls     # first call only sets the mark
    p._bar_marks[("BTCUSD", "M15")] -= 900                               # pretend a bar has closed since
    events = p.check_new_bars(["BTCUSD"], "M15")
    assert len(events) == 1 and events[0]["ticker"] == "BTCUSD" and len(calls) == 1
    assert p.check_new_bars(["BTCUSD"], "M15") == []


# ── OANDA ─────────────────────────────────────────────────────────────

class OandaFake:
    """A minimal v20 account: pricing, candles, orders, trades, summary."""

    def __init__(self):
        self.orders = []
        self.trades = [{"id": "41", "instrument": "XAU_USD", "price": "4000.50", "openTime": "2026-10-16T08:00:00.000000000Z",
                        "initialUnits": "50", "currentUnits": "50", "unrealizedPL": "125.00", "financing": "-1.20",
                        "stopLossOrder": {"price": "3950.00"}, "takeProfitOrder": {"price": "4100.00"}}]
        self.puts = []

    def __call__(self, req):
        path, method = req.url.path, req.method
        if path == "/v3/accounts":
            return 200, {"accounts": [{"id": "101-004-1-001", "tags": []}]}
        if path.endswith("/instruments"):
            return 200, {"instruments": [
                {"name": "EUR_USD", "displayPrecision": 5, "tradeUnitsPrecision": 0},
                {"name": "XAU_USD", "displayPrecision": 3, "tradeUnitsPrecision": 0},
                {"name": "SPX500_USD", "displayPrecision": 1, "tradeUnitsPrecision": 0}]}
        if path.endswith("/pricing"):
            insts = query(req)["instruments"].split(",")
            prices = {"EUR_USD": ("1.08001", "1.08015"), "XAU_USD": ("4010.120", "4010.450")}
            return 200, {"prices": [{"instrument": i, "time": "2026-10-16T13:00:00.123456789Z",
                                     "bids": [{"price": prices[i][0], "liquidity": 1}],
                                     "asks": [{"price": prices[i][1], "liquidity": 1}]} for i in insts if i in prices]}
        if "/candles" in path:
            q = query(req)
            assert q["price"] == "B" and q["dailyAlignment"] == "17"
            return 200, {"candles": [
                {"complete": True, "volume": 10, "time": "2026-10-14T21:00:00.000000000Z", "bid": {"o": "1.0800", "h": "1.0850", "l": "1.0790", "c": "1.0840"}},
                {"complete": True, "volume": 12, "time": "2026-10-15T21:00:00.000000000Z", "bid": {"o": "1.0840", "h": "1.0870", "l": "1.0820", "c": "1.0860"}},
                {"complete": False, "volume": 3, "time": "2026-10-16T21:00:00.000000000Z", "bid": {"o": "1.0860", "h": "1.0865", "l": "1.0855", "c": "1.0861"}}]}
        if path.endswith("/orders") and method == "POST":
            body = json.loads(req.content)["order"]
            self.orders.append(body)
            if body["instrument"] == "SPX500_USD":
                return 400, {"orderRejectTransaction": {"rejectReason": "INSUFFICIENT_MARGIN"},
                             "errorMessage": "Insufficient margin"}
            if body["type"] == "MARKET":
                return 201, {"orderCreateTransaction": {"id": "50"},
                             "orderFillTransaction": {"id": "51", "price": "1.08015", "tradeOpened": {"tradeID": "51", "units": body["units"]}}}
            return 201, {"orderCreateTransaction": {"id": "52"}}
        if path.endswith("/openTrades"):
            return 200, {"trades": self.trades}
        if "/trades/41/" in path and method == "PUT":
            self.puts.append((path, json.loads(req.content)))
            if path.endswith("/close"):
                return 200, {"orderFillTransaction": {"price": "4012.00"}}
            return 200, {}
        if path.endswith("/summary"):
            return 200, {"account": {"id": "101-004-1-001", "currency": "USD", "balance": "100000.00", "NAV": "100125.00",
                                     "marginUsed": "8000.00", "marginAvailable": "92125.00", "unrealizedPL": "125.00",
                                     "marginRate": "0.02"}}
        return 404, {"errorMessage": f"unexpected {method} {path}"}


@pytest.fixture
def oanda():
    p = OandaProvider({"id": "oanda_default", "token": "t0k3n"})
    fake = OandaFake()
    mock(p, fake)
    assert p.connect() and p.account_id == "101-004-1-001"
    return p, fake


def test_oanda_needs_a_token():
    p = OandaProvider({})
    assert p.connect() is False and "API token" in p.last_error


def test_oanda_prices_and_daily_candles_on_the_new_york_close(oanda):
    p, _ = oanda
    assert p.feed_symbol("EURUSD") == "EUR_USD" and p.feed_symbol("XTIUSD") == "WTICO_USD"
    t = p.get_latest_ticks(["EURUSD", "XAUUSD"])
    assert (t["EURUSD"].bid, t["EURUSD"].ask) == (1.08001, 1.08015) and t["XAUUSD"].bid == 4010.12
    d1 = p.get_bars("EURUSD", "D1", 3)
    # 21:00 UTC (17:00 New York, summer time) is 00:00 of the next trading day on this clock.
    assert [b.time for b in d1] == ["2026-10-15T00:00:00", "2026-10-16T00:00:00", "2026-10-17T00:00:00"]
    assert d1[1].close == 1.0860


def test_oanda_orders_use_contract_units_and_instrument_precision(oanda):
    p, fake = oanda
    from models import OrderRequest
    r = p.place_order(OrderRequest(ticker="EURUSD", direction="BUY", order_type="MARKET", lots=0.1,
                                   stop_loss=1.07512345, take_profit=1.09))
    assert r.success and r.order_id == "51" and r.price == 1.08015
    body = fake.orders[-1]
    assert body["units"] == "10000" and body["timeInForce"] == "FOK"
    assert body["stopLossOnFill"]["price"] == "1.07512" and body["takeProfitOnFill"]["price"] == "1.09000"
    r = p.place_order(OrderRequest(ticker="XAUUSD", direction="SELL", order_type="LIMIT", lots=0.5, price=4050))
    assert r.success and r.order_id == "52"
    assert fake.orders[-1]["units"] == "-50" and fake.orders[-1]["price"] == "4050.000"
    r = p.place_order(OrderRequest(ticker="US500", direction="BUY", order_type="MARKET", lots=1))
    assert not r.success and "INSUFFICIENT_MARGIN" in r.error


def test_oanda_positions_closes_edits_and_account(oanda):
    p, fake = oanda
    pos = p.get_positions()[0]
    assert (pos.ticker, pos.direction, pos.lots, pos.open_price) == ("XAUUSD", "BUY", 0.5, 4000.5)
    assert (pos.stop_loss, pos.take_profit, pos.profit) == (3950.0, 4100.0, 125.0)
    assert pos.current_price == 4010.12                         # the live bid
    assert p.close_position("41", 0.2).success
    assert fake.puts[-1][1] == {"units": "20"}
    assert p.modify_position("41", stop_loss=0, take_profit=4200)["success"]
    assert fake.puts[-1][1] == {"stopLoss": None, "takeProfit": {"price": "4200.000", "timeInForce": "GTC"}}
    acc = p.get_account_info()
    assert (acc.balance, acc.equity, acc.margin, acc.leverage) == (100000.0, 100125.0, 8000.0, 50)


# ── Alpaca ────────────────────────────────────────────────────────────

def test_alpaca_symbols_quotes_and_daily_bars():
    p = AlpacaProvider({"key_id": "k", "secret_key": "s"})
    assert (p.feed_symbol("GLD"), p.feed_symbol("BTCUSD"), p.feed_symbol("EURUSD")) == ("GLD", "BTC/USD", None)
    assert p.feed_symbol("CORN") is None                    # the commodity, not the Teucrium fund
    assert AlpacaProvider({"symbols": {"CORN": "CORN"}}).feed_symbol("CORN") == "CORN"

    def handler(req):
        path = req.url.path
        assert req.headers["APCA-API-KEY-ID"] == "k"
        if path == "/v2/stocks/quotes/latest":
            return 200, {"quotes": {"SPY": {"t": "2026-10-16T14:00:00Z", "bp": 660.1, "ap": 660.2},
                                    "GLD": {"t": "2026-10-16T14:00:00Z", "bp": 0, "ap": 0}}}
        if path == "/v2/stocks/trades/latest":
            return 200, {"trades": {"GLD": {"t": "2026-10-16T13:59:00Z", "p": 371.5}}}
        if path == "/v1beta3/crypto/us/latest/quotes":
            return 200, {"quotes": {"BTC/USD": {"t": "2026-10-16T14:00:00Z", "bp": 67000.5, "ap": 67010.0}}}
        if path == "/v2/stocks/bars":
            return 200, {"bars": {"SPY": [{"t": "2026-10-15T04:00:00Z", "o": 650, "h": 662, "l": 649, "c": 660, "v": 1e6},
                                          {"t": "2026-10-16T04:00:00Z", "o": 660, "h": 665, "l": 655, "c": 663, "v": 9e5}]},
                         "next_page_token": None}
        return 404, {"message": path}
    mock(p, handler)._connected = True
    t = p.get_latest_ticks(["SPY", "GLD", "BTCUSD"])
    assert t["SPY"].bid == 660.1 and t["GLD"].last == 371.5 and t["BTCUSD"].ask == 67010.0
    d1 = p.get_bars("SPY", "D1", 2)
    assert [b.time for b in d1] == ["2026-10-15T00:00:00", "2026-10-16T00:00:00"]


# ── Yahoo Finance ─────────────────────────────────────────────────────

class FakeYF:
    """Stands in for the yfinance module."""

    def __init__(self, frames):
        self.frames, self.calls = frames, []

    def Ticker(self, symbol):
        outer = self

        class T:
            def history(self, interval, **kw):
                outer.calls.append((symbol, interval, kw))
                return outer.frames.get((symbol, interval))
        return T()


def frame(index, rows, tz):
    import pandas as pd
    idx = pd.DatetimeIndex(index).tz_localize(tz)
    return pd.DataFrame(rows, index=idx, columns=["Open", "High", "Low", "Close", "Volume"])


def test_yahoo_maps_commodities_and_reads_frames(monkeypatch):
    p = YahooProvider({})
    assert p.feed_symbol("XAUUSD") == "GC=F" and p.feed_symbol("CORN") == "ZC=F"
    assert p.feed_symbol("EURUSD") == "EURUSD=X" and p.feed_symbol("AAPL") == "AAPL"
    yf = FakeYF({
        ("GC=F", "1m"): frame(["2026-10-16 09:58", "2026-10-16 09:59"], [[4010, 4011, 4009, 4010.5, 5]] * 2,
                              "America/New_York"),
        ("GC=F", "1d"): frame(["2026-10-15", "2026-10-16"], [[3990, 4020, 3980, 4005, 9], [4005, 4015, 3995, 4010, 9]],
                              "America/New_York"),
        ("EURUSD=X", "1d"): frame(["2026-10-16"], [[1.08, 1.09, 1.07, 1.085, 0]], "Europe/London"),
    })
    monkeypatch.setattr(p, "_yf", lambda: yf)
    assert p.connect()
    tick = p.get_latest_ticks(["XAUUSD"])["XAUUSD"]
    assert tick.last == 4010.5
    assert tick.time == "2026-10-16T14:00:00"                  # 09:59 New York + 1 min, in UTC
    d1 = p.get_bars("XAUUSD", "D1", 2)
    assert [b.time for b in d1] == ["2026-10-15T00:00:00", "2026-10-16T00:00:00"]   # the trading days
    assert any(c[1] == "1d" and "start" in c[2] for c in yf.calls)


# ── CSV files ─────────────────────────────────────────────────────────

def _mt5_rows():
    out = []
    for i, (h, m) in enumerate((h, m) for h in (10, 11) for m in (0, 15, 30, 45)):
        o = 1.10000 + i * 0.00010
        out.append(f"2026.10.16\t{h:02d}:{m:02d}:00\t{o:.5f}\t{o + 0.00005:.5f}\t{o - 0.00003:.5f}\t{o + 0.00002:.5f}\t10\t0\t5\n")
    return "".join(out)


MT5_EXPORT = "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n" + _mt5_rows()


def test_csv_parses_common_export_formats():
    rows = parse_csv(MT5_EXPORT)
    assert len(rows) == 8 and rows[0][0] == ts("2026-10-16T10:00:00") and rows[0][4] == 1.10002
    assert rows[-1][0] == ts("2026-10-16T11:45:00") and rows[-1][1] == pytest.approx(1.1007)
    tv = "time,open,high,low,close,Volume\n1760608800,4010,4012,4008,4011,7\n1760609700,4011,4013,4010,4012,3\n"
    assert parse_csv(tv)[1] == (1760609700.0, 4011.0, 4013.0, 4010.0, 4012.0, 3.0)
    eu = "Date;Time;Open;High;Low;Close\n16.10.2026;10:00;1,0850;1,0860;1,0840;1,0855\n"
    assert parse_csv(eu)[0][1:5] == (1.085, 1.086, 1.084, 1.0855)


def test_csv_source_builds_missing_timeframes(tmp_path):
    (tmp_path / "EURUSD_M15.csv").write_text(MT5_EXPORT)
    p = CsvProvider({"folder": str(tmp_path)})
    assert p.connect() and p.resolve_universe(["EURUSD", "XAUUSD"]) == ["EURUSD"]
    h1 = p.get_bars("EURUSD", "H1", 10)
    assert [b.time for b in h1] == ["2026-10-16T10:00:00", "2026-10-16T11:00:00"]
    assert (h1[0].open, h1[0].high, h1[0].low, h1[0].close) == (1.1, 1.10035, 1.09997, 1.10032)
    assert p.get_latest_ticks(["EURUSD"])["EURUSD"].last == 1.10072


def test_csv_source_without_files_explains_the_naming(tmp_path):
    p = CsvProvider({"folder": str(tmp_path / "empty")})
    assert not p.connect() and "XAUUSD_M15.csv" in p.last_error


# ── paper account on live prices ──────────────────────────────────────

class FakeFeed:
    provider_type, provider_id, label, clock, connected = "fake", "fake_default", "Fake feed", "utc", True

    def __init__(self):
        self.bid, self.ask, self.m1 = 4000.0, 4000.5, []

    def get_latest_ticks(self, symbols):
        from models import TickData
        return {s: TickData(ticker=s, bid=self.bid, ask=self.ask, last=self.bid,
                            time=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
                for s in symbols if s == "XAUUSD"}

    def get_bars(self, ticker, timeframe, count):
        return list(self.m1)[-count:]

    def get_symbol_info(self, ticker):
        return None


@pytest.fixture
def paper(tmp_path):
    clock = {"t": ts("2026-10-16T12:00:30")}
    feed = FakeFeed()
    p = PaperProvider({"state_file": str(tmp_path / "paper.json")}, clock=lambda: clock["t"])
    p.bind_providers(lambda pid=None: feed)
    p.connect()
    return p, feed, clock


def bar(time, low, high):
    from models import BarData
    return BarData(time=time, open=(low + high) / 2, high=high, low=low, close=(low + high) / 2)


def test_paper_fills_at_the_live_ask_and_triggers_sl_on_a_later_wick(paper):
    p, feed, clock = paper
    from models import OrderRequest
    feed.m1 = [bar("2026-10-16T12:00:00", 3900.0, 4001.0)]          # a low from BEFORE the entry
    r = p.place_order(OrderRequest(ticker="XAUUSD", direction="BUY", order_type="MARKET", lots=0.1,
                                   stop_loss=3950.0, take_profit=4100.0))
    assert r.success and r.price == 4000.5
    clock["t"] += 50                                              # 12:01:20
    assert len(p.get_positions()) == 1                            # the pre-entry low does not count
    feed.m1.append(bar("2026-10-16T12:01:00", 3990.0, 4002.0))
    clock["t"] += 60                                              # 12:02:20
    assert len(p.get_positions()) == 1
    feed.m1.append(bar("2026-10-16T12:02:00", 3940.0, 3999.0))    # a later wick through the stop
    clock["t"] += 60
    assert p.get_positions() == []
    trade = p.get_trade_history(1)[0]
    assert trade.close_price == 3950.0 and trade.profit == pytest.approx((3950.0 - 4000.5) * 100 * 0.1)


def test_paper_account_reports_itself_and_refuses_unknown_tickers(paper):
    p, feed, _ = paper
    from models import OrderRequest
    info = p.get_account_info()
    assert info.provider_type == "paper" and info.balance == 100000.0 and "Fake feed" in info.server
    r = p.place_order(OrderRequest(ticker="EURUSD", direction="BUY", order_type="MARKET", lots=0.1))
    assert not r.success and "no live price" in r.error


# ── Settings → DATA SOURCES API ───────────────────────────────────────

def test_launcher_override_puts_data_only_sources_on_the_paper_account(monkeypatch):
    from config_manager import _apply_provider_override
    monkeypatch.setenv("MK_PROVIDER", "binance")
    out = _apply_provider_override({"accounts": {"binance_default": {"type": "binance", "enabled": False},
                                                 "paper_default": {"type": "paper", "enabled": False}}})
    assert out["active_data"] == "binance_default" and out["active_execution"] == "paper_default"
    assert out["accounts"]["paper_default"]["enabled"]


def test_data_sources_api_lists_masks_and_switches(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            listing = client.get("/api/providers").json()
            types = listing["types"]
            assert {"yahoo", "binance", "oanda", "alpaca", "csv", "paper"} <= set(types)
            assert any(a["id"] == "oanda_default" for a in listing["accounts"])

            client.patch("/api/providers/oanda_default", json={"token": "secret-token"})
            oanda = next(a for a in client.get("/api/providers").json()["accounts"] if a["id"] == "oanda_default")
            assert oanda["settings"]["token"] == "••••••"
            assert client.get("/api/config").json()["providers"]["accounts"]["oanda_default"]["token"] == "••••••"
            client.patch("/api/providers/oanda_default", json={"token": "••••••", "environment": "practice"})
            from data_server import cfg_manager
            assert cfg_manager._providers_config()["accounts"]["oanda_default"]["token"] == "secret-token"

            # CSV files as the data source, the paper account trading on them
            (tmp_path / "XAUUSD_M15.csv").write_text(
                "time,open,high,low,close\n" + "".join(
                    f"2026-10-16 {h:02d}:{m:02d},4000,4002,3998,{4000 + h + m / 100:.2f}\n"
                    for h in range(9, 15) for m in (0, 15, 30, 45)))
            client.patch("/api/providers/csv_default", json={"folder": str(tmp_path)})
            out = client.post("/api/providers/activate", json={"data": "csv_default"}).json()
            assert out["connected"] and out["active_data"] == "csv_default"
            assert out["active_execution"] == "paper_default"           # CSV can't trade: paper account
            bars = client.get("/api/bars/XAUUSD", params={"timeframe": "H1", "count": 10}).json()["bars"]
            assert bars[-1]["time"].startswith("2026-10-16T14:00")
            client.patch("/api/config", json={"execution": {"live_trading": True}})
            order = client.post("/api/orders", json={"ticker": "XAUUSD", "direction": "BUY", "order_type": "MARKET",
                                                     "lots": 0.1}).json()
            assert order["success"] and order["price"] == 4014.45
            status = client.get("/api/mt5/status").json()
            assert status["simulated"] and status["provider"] == "paper"

            # TEST connects a throw-away instance; OANDA (mocked) refuses the token
            import providers.oanda_provider as oanda_module
            seen = []

            def refuse(request):
                seen.append(request.headers["Authorization"])
                return httpx.Response(401, json={"errorMessage": "Insufficient authorization"})
            monkeypatch.setattr(oanda_module, "http_client", lambda headers=None, timeout=10.0: httpx.Client(
                transport=httpx.MockTransport(refuse), headers=headers or {}))
            test = client.post("/api/providers/oanda_default/test").json()
            assert test["ok"] is False and "401" in test["message"]
            assert seen == ["Bearer secret-token"]                     # the stored token, not the mask

            assert client.post("/api/providers/paper_default/reset").json()["ok"]
            assert client.get("/api/positions").json()["positions"] == []
            client.patch("/api/config", json={"execution": {"live_trading": False}})
            client.post("/api/providers/activate", json={"data": "sim_default"})
    finally:
        os.environ.pop("MK_PROVIDER", None)


def test_secrets_stay_out_of_profiles_and_the_browser():
    from fastapi.testclient import TestClient
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    from data_server import cfg_manager
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            cfg_manager.update({"providers": {"accounts": {
                "oanda_default": {"token": "tok-old-123"}, "mt5_default": {"password": "mt5-pass-456"}}}})
            assert client.post("/api/config/profiles", json={"name": "secrets-test"}).json()["success"]
            body = client.get("/api/config").text
            assert "tok-old-123" not in body and "mt5-pass-456" not in body
            saved = list((cfg_manager_profiles_dir()).glob("*.json"))
            assert saved and not any("tok-old-123" in p.read_text(encoding="utf-8") for p in saved)

            client.patch("/api/providers/oanda_default", json={"token": "tok-new-789"})
            assert client.post("/api/config/profiles/secrets-test/load").json()["success"]
            accounts = cfg_manager._providers_config()["accounts"]
            assert accounts["oanda_default"]["token"] == "tok-new-789"       # a profile never resets a token
            assert accounts["mt5_default"]["password"] == "mt5-pass-456"
            client.delete("/api/config/profiles/secrets-test")
            cfg_manager.update({"providers": {"accounts": {
                "oanda_default": {"token": ""}, "mt5_default": {"password": ""}}}})
    finally:
        os.environ.pop("MK_PROVIDER", None)


def cfg_manager_profiles_dir():
    from config_manager import _user_data_dir
    return _user_data_dir() / "profiles"
