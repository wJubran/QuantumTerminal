"""mt5_safe: MetaTrader5 calls are serialized across threads."""

import threading
import time
import types

import pytest

import mt5_safe
from mt5_safe import LockedModule


def fake_mt5():
    """A stand-in module whose call records how many threads are inside it."""
    state = {"active": 0, "max": 0}
    guard = threading.Lock()

    def symbol_info_tick(*_):
        with guard:
            state["active"] += 1
            state["max"] = max(state["max"], state["active"])
        time.sleep(0.01)
        with guard:
            state["active"] -= 1
        return "tick"

    return types.SimpleNamespace(TIMEFRAME_M1=1, symbol_info_tick=symbol_info_tick), state


def hammer(fn, threads=8):
    barrier = threading.Barrier(threads)

    def worker():
        barrier.wait()
        fn("EURUSD")

    pool = [threading.Thread(target=worker) for _ in range(threads)]
    for t in pool:
        t.start()
    for t in pool:
        t.join()


def test_raw_module_races_but_proxy_serializes():
    raw, state = fake_mt5()
    hammer(raw.symbol_info_tick)
    assert state["max"] > 1          # the hazard is real without the proxy

    raw, state = fake_mt5()
    hammer(LockedModule(raw, threading.RLock()).symbol_info_tick)
    assert state["max"] == 1


def test_constants_pass_through_and_wrappers_are_cached():
    raw, _ = fake_mt5()
    proxy = LockedModule(raw, threading.RLock())
    assert proxy.TIMEFRAME_M1 == 1
    assert proxy.symbol_info_tick is proxy.symbol_info_tick
    assert proxy.symbol_info_tick("EURUSD") == "tick"


def test_lock_is_reentrant_for_atomic_sequences():
    raw, _ = fake_mt5()
    lock = threading.RLock()
    proxy = LockedModule(raw, lock)
    with lock:
        assert proxy.symbol_info_tick("EURUSD") == "tick"


def test_require_mt5_raises_like_a_failed_import(monkeypatch):
    monkeypatch.setattr(mt5_safe, "mt5", None)
    with pytest.raises(ModuleNotFoundError):
        mt5_safe.require_mt5()
