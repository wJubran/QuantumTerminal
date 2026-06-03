"""
End-to-end test for the TickerAll provider.

Spins up a mock TickerAll API — a real HTTP server for REST and a real
WebSocket server for the stream — and drives the provider through its full
contract: connect, symbol resolution, the WS-fed tick cache, bars, account
snapshot, open positions, symbol specs, and order placement.

No live TickerAll account or network access required. Run with:

    pip install tickerall websockets
    python -m pytest backend/providers/test_tickerall_provider.py
    # or: python backend/providers/test_tickerall_provider.py
"""

from __future__ import annotations

import asyncio
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import pytest

# Make `models`, `providers` importable when run from the repo root or here.
import os
import sys
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from models import OrderRequest  # noqa: E402

try:
    import websockets  # noqa: F401
    from websockets.asyncio.server import serve
    _WS_OK = True
except Exception:
    _WS_OK = False

try:
    import tickerall  # noqa: F401
    _SDK_OK = True
except Exception:
    _SDK_OK = False

pytestmark = pytest.mark.skipif(
    not (_WS_OK and _SDK_OK),
    reason="needs `tickerall` + `websockets` installed",
)

ACCOUNT_ID = "acc-test"
SYMBOLS = ["BTCUSDm", "ETHUSDm", "XAUUSDm", "EURUSDm"]


def _free_port() -> int:
    s = socket.socket()
    s.bind(("localhost", 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ── Mock REST server ──────────────────────────────────────────────────────────


class _MockAtlasHandler(BaseHTTPRequestHandler):
    def log_message(self, *_a):  # silence
        pass

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        _ = self.rfile.read(length) if length else b""
        if path == "/v1/sessions":
            return self._send(200, {
                "accountId": ACCOUNT_ID, "isDemo": True,
                "status": "connected", "expiresAt": "2026-12-31T00:00:00Z",
            })
        if path == f"/v1/accounts/{ACCOUNT_ID}/orders":
            return self._send(200, {
                "ticket": 50001, "symbol": "BTCUSDm", "side": "BUY",
                "type": "market", "volume": 0.1, "status": "open",
                "timestamp": "2026-06-02T00:00:00Z", "price": 65000.5,
            })
        return self._send(404, {"error": "NOT_FOUND", "message": path})

    def do_GET(self):
        path = urlparse(self.path).path
        if path == f"/v1/accounts/{ACCOUNT_ID}/symbols":
            return self._send(200, {"symbols": SYMBOLS})
        if path == f"/v1/accounts/{ACCOUNT_ID}/symbol-specs":
            return self._send(200, {"specs": [
                {"name": "BTCUSDm", "volumeMin": 0.01, "volumeMax": 100.0,
                 "volumeStep": 0.01, "specSource": "broker", "tradeMode": 4},
            ]})
        if path == f"/v1/accounts/{ACCOUNT_ID}/orders/pending":
            return self._send(200, {"orders": [
                {"ticket": "9001", "symbol": "BTCUSDm", "type": "BUY_LIMIT", "side": "BUY",
                 "orderType": "LIMIT", "volume": 0.2, "price": 60000.0, "limitPrice": None,
                 "stopLoss": 0.0, "takeProfit": 0.0, "setTime": "2026-06-02T00:00:00Z",
                 "expirationTime": None},
                {"ticket": "9002", "symbol": "BTCUSDm", "type": "SELL_STOP_LIMIT", "side": "SELL",
                 "orderType": "STOP_LIMIT", "volume": 0.1, "price": 70000.0, "limitPrice": 69900.0,
                 "stopLoss": 0.0, "takeProfit": 0.0, "setTime": "2026-06-02T00:00:00Z",
                 "expirationTime": None},
            ]})
        if path == f"/v1/accounts/{ACCOUNT_ID}/candles":
            candles = [
                {"timestamp": 1764633600 + i * 300, "open": 65000 + i, "high": 65010 + i,
                 "low": 64990 + i, "close": 65005 + i, "bid": 65005 + i}
                for i in range(20)
            ]
            return self._send(200, {"symbol": "BTCUSDm", "hours": 2,
                                    "timeframe": "M5", "candles": candles})
        if path == f"/v1/accounts/{ACCOUNT_ID}":
            return self._send(200, {
                "id": ACCOUNT_ID, "broker": "mt5", "server": "Exness-MT5Trial7",
                "accountNumber": "12345678", "isDemo": True, "status": "online",
                "account": {"name": "Demo", "accountType": "trial",
                            "leverage": 500, "balance": 10000.0, "brokerName": "Exness"},
                "positions": [
                    {"ticket": 70001, "symbol": "BTCUSDm", "side": "BUY", "volume": 0.1,
                     "stopLoss": 0.0, "takeProfit": 0.0, "magic": 777, "comment": "",
                     "swap": -0.5, "commission": -1.0, "entryPrice": 64000.0,
                     "currentPrice": 65000.0, "profit": 100.0},
                ],
            })
        return self._send(404, {"error": "NOT_FOUND", "message": path})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith(f"/v1/accounts/{ACCOUNT_ID}/orders/"):
            ticket = int(path.rsplit("/", 1)[-1])
            return self._send(200, {"ticket": ticket, "symbol": "BTCUSDm", "side": "BUY",
                                    "cancelled": True, "timestamp": "2026-06-02T00:00:00Z"})
        return self._send(404, {"error": "NOT_FOUND", "message": path})

    def do_PATCH(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        if path.startswith(f"/v1/accounts/{ACCOUNT_ID}/orders/"):
            ticket = int(path.rsplit("/", 1)[-1])
            return self._send(200, {"ticket": ticket, "symbol": "BTCUSDm", "side": "BUY",
                                    "price": body.get("price", 60000.0), "stopLoss": 0.0,
                                    "takeProfit": 0.0, "timestamp": "2026-06-02T00:00:00Z"})
        return self._send(404, {"error": "NOT_FOUND", "message": path})


class MockAtlasREST:
    def __init__(self):
        self.port = _free_port()
        self.base_url = f"http://localhost:{self.port}"
        self._srv = ThreadingHTTPServer(("localhost", self.port), _MockAtlasHandler)
        self._thread = threading.Thread(target=self._srv.serve_forever, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._srv.shutdown()
        self._srv.server_close()


# ── Mock WS server ────────────────────────────────────────────────────────────


class MockAtlasWS:
    def __init__(self):
        self.port = _free_port()
        self.url = f"ws://localhost:{self.port}"
        self._loop = None
        self._thread = None
        self._ready = threading.Event()
        self._stop_fut = None

    async def _handler(self, ws):
        async for raw in ws:
            try:
                frame = json.loads(raw)
            except Exception:
                continue
            if frame.get("type") == "ping":
                await ws.send(json.dumps({"type": "pong", "ts": 0}))
            elif frame.get("type") == "subscribe":
                # atlas protocol: {type:subscribe, channels:[{kind, accountId, symbols}]}
                for ch in frame.get("channels", []):
                    if ch.get("kind") == "ticks":
                        for sym in ch.get("symbols", []):
                            await ws.send(json.dumps({
                                "type": "tick", "accountId": ch.get("accountId", ""),
                                "symbol": sym, "bid": 65000.0, "ask": 65001.0,
                                "timestamp": "2026-06-02T00:00:00Z",
                            }))

    def start(self):
        def run():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)

            async def main():
                self._stop_fut = self._loop.create_future()
                async with serve(self._handler, "localhost", self.port):
                    self._ready.set()
                    await self._stop_fut

            try:
                self._loop.run_until_complete(main())
            finally:
                self._loop.close()

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()
        assert self._ready.wait(5.0)

    def stop(self):
        if self._loop and self._stop_fut:
            self._loop.call_soon_threadsafe(
                lambda: self._stop_fut.done() or self._stop_fut.set_result(None)
            )
        if self._thread:
            self._thread.join(timeout=3.0)


@pytest.fixture
def mock_atlas():
    rest = MockAtlasREST()
    ws = MockAtlasWS()
    rest.start()
    ws.start()
    yield rest, ws
    rest.stop()
    ws.stop()


def _make_provider(rest, ws):
    from providers.tickerall_provider import TickerAllProvider
    return TickerAllProvider({
        "id": "tickerall_default",
        "type": "tickerall",
        "label": "TickerAll (test)",
        "api_key": "cf_test_key",
        "broker": "mt5",
        "server": "Exness-MT5Trial7",
        "account": "12345678",
        "password": "x",
        "base_url": rest.base_url,
        "stream_url": ws.url,
        "aliases": {"BTCUSD": ["BTCUSD", "BTCUSDm"], "XAUUSD": ["XAUUSD", "XAUUSDm", "GOLD"]},
    })


def test_full_provider_lifecycle(mock_atlas):
    rest, ws = mock_atlas
    prov = _make_provider(rest, ws)
    try:
        assert prov.connect() is True
        assert prov.connected is True

        # Symbol resolution: canonical -> broker-native.
        assert prov.resolve_symbol("BTCUSD") == "BTCUSDm"
        assert prov.resolve_symbol("EURUSD") == "EURUSDm"   # suffix fuzzy
        assert prov.resolve_symbol("XAUUSD") == "XAUUSDm"   # alias

        # resolve_universe: data_server calls this right after connect; it must
        # resolve the known canonicals + skip unknowns, and get_available_symbols
        # then returns the resolved canonical names (MT5Provider parity).
        resolved = prov.resolve_universe(["BTCUSD", "ETHUSD", "NOPEUSD"])
        assert "BTCUSD" in resolved and "ETHUSD" in resolved
        assert "NOPEUSD" not in resolved
        assert set(prov.get_available_symbols()) == set(resolved)

        # WS-fed tick cache: first call subscribes; the mock pushes a tick; the
        # second call returns it from the cache with NO network round-trip.
        prov.get_latest_ticks(["BTCUSD"])
        deadline = time.monotonic() + 3.0
        ticks = {}
        while time.monotonic() < deadline:
            ticks = prov.get_latest_ticks(["BTCUSD"])
            if ticks:
                break
            time.sleep(0.02)
        assert "BTCUSD" in ticks, "tick cache should be fed by the WS stream"
        assert ticks["BTCUSD"].bid == 65000.0
        assert ticks["BTCUSD"].ask == 65001.0
        assert ticks["BTCUSD"].ticker == "BTCUSD"

        # Account snapshot: equity = balance + floating P/L.
        acct = prov.get_account_info()
        assert acct is not None
        assert acct.balance == 10000.0
        assert acct.equity == 10100.0   # 10000 + 100 floating
        assert acct.leverage == 500

        # Open positions, mapped to the MT5-provider field shapes.
        positions = prov.get_positions()
        assert len(positions) == 1
        p = positions[0]
        assert p.ticket == "70001"
        assert p.ticker == "BTCUSD"
        assert p.direction == "BUY"
        assert p.lots == 0.1
        assert p.open_price == 64000.0
        assert p.profit == 100.0

        # Bars.
        bars = prov.get_bars("BTCUSD", "M5", count=10)
        assert len(bars) == 10
        assert bars[-1].close > 0

        # Symbol info from broker-pushed specs.
        info = prov.get_symbol_info("BTCUSD")
        assert info is not None
        assert info.min_lot == 0.01
        assert info.lot_step == 0.01

        # Pending orders — mapped to the MT5-provider shape; stop-limit skipped.
        pendings = prov.get_pending_orders()
        assert len(pendings) == 1, "stop-limit variant should be skipped (parity)"
        pend = pendings[0]
        assert pend.ticket == "9001"
        assert pend.ticker == "BTCUSD"
        assert pend.direction == "BUY"
        assert pend.order_type == "LIMIT"
        assert pend.lots == 0.2
        assert pend.price == 60000.0

        # Pending cancel + modify map to OrderResult.
        cres = prov.cancel_order("9001")
        assert cres.success is True
        assert int(cres.order_id) == 9001
        mres = prov.modify_order("9001", price=61000.0)
        assert mres.success is True
        assert int(mres.order_id) == 9001

        # Order placement maps OrderRequest -> SDK -> OrderResult.
        result = prov.place_order(OrderRequest(
            ticker="BTCUSD", direction="BUY", order_type="MARKET", lots=0.1,
            volume=0.1, comment="test",
        ))
        assert result.success is True
        assert result.order_id == "50001"
        assert result.ticker == "BTCUSD"
        assert result.direction == "BUY"
    finally:
        prov.disconnect()
        assert prov.connected is False


if __name__ == "__main__":
    import sys as _sys
    _sys.exit(pytest.main([__file__, "-v"]))
