"""ConnectionManager broadcast: robust to churn, failures and stalled sockets."""

import asyncio
import time

import data_server
from data_server import ConnectionManager


class FakeWS:
    def __init__(self, delay=0.0, fail=False, on_send=None):
        self.delay, self.fail, self.on_send = delay, fail, on_send
        self.sent, self.closed = [], False

    async def send_text(self, data):
        if self.on_send:
            self.on_send()
        if self.fail:
            raise RuntimeError("socket gone")
        if self.delay:
            await asyncio.sleep(self.delay)
        self.sent.append(data)

    async def close(self, code=1000):
        self.closed = True


def test_clients_joining_during_a_broadcast_do_not_break_it():
    mgr = ConnectionManager()
    newcomer = FakeWS()
    a = FakeWS(on_send=lambda: mgr._price_clients.add(newcomer))
    b = FakeWS()
    mgr._price_clients.update({a, b})
    asyncio.run(mgr.broadcast_prices({"type": "ticks_batch"}))
    assert a.sent and b.sent
    assert newcomer in mgr._price_clients


def test_failed_and_stalled_clients_are_dropped_and_closed(monkeypatch):
    monkeypatch.setattr(data_server, "WS_SEND_TIMEOUT", 0.05)
    good, broken, stalled = FakeWS(), FakeWS(fail=True), FakeWS(delay=5.0)
    mgr = ConnectionManager()
    mgr._event_clients.update({good, broken, stalled})

    async def run():
        await mgr.broadcast_event({"type": "state_update"})
        await asyncio.sleep(0.1)   # let the close tasks finish

    started = time.perf_counter()
    asyncio.run(run())
    assert time.perf_counter() - started < 1.0   # one stalled socket can't hold the feed
    assert mgr._event_clients == {good}
    assert good.sent == ['{"type": "state_update"}']
    assert broken.closed and stalled.closed


def test_to_pips():
    assert data_server._to_pips("EURUSD", 0.0010) == 10.0
    assert data_server._to_pips("USDJPY", 0.10) == 10.0
    assert data_server._to_pips("XAUUSD", 1.0) == 10.0
    assert data_server._to_pips("US500", 5.0) == 5.0
    assert data_server._to_pips("BTCUSD", 100.0) == 100.0
