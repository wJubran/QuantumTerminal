"""Simulated market provider: price engine consistency + paper trading."""

import math
from datetime import datetime, timezone

import numpy as np
import pytest

from models import OrderRequest
from providers import create_provider, list_provider_types
from providers.sim_provider import REF_DAY, SimProvider, _DailyPath, instrument

# A fixed instant (mid-session, mid-minute) — the simulator never reads the wall clock here.
T0 = datetime(2026, 3, 10, 14, 30, 17, tzinfo=timezone.utc).timestamp() + 0.25
MINUTE0 = T0 - T0 % 60


class Clock:
    def __init__(self, t: float):
        self.t = float(t)

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def make(clock: Clock, **cfg) -> SimProvider:
    p = SimProvider({"persist": False, **cfg}, clock=clock)
    p.connect()
    return p


def dt(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def ts(iso: str) -> float:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp()


def ohlcv(bars):
    return [(b.time, b.open, b.high, b.low, b.close, b.volume) for b in bars]


def order(ticker, direction, lots, kind="MARKET", price=0.0, sl=None, tp=None) -> OrderRequest:
    return OrderRequest(ticker=ticker, direction=direction, order_type=kind, lots=lots,
                        volume=lots, price=price, stop_loss=sl, take_profit=tp)


def find_window(sym: str, kind: str, horizon: int = 900):
    """A start time whose next `horizon` seconds contain a dip (or spike) at least
    five spreads beyond the entry quote, with the price back away from that
    extreme at the end — so only intrabar range checks can catch it.
    Returns (t0, extreme, quote at t0, quote at the end)."""
    spread = instrument(sym).spread
    for i in range(80):
        t0 = T0 + i * horizon
        probe = make(Clock(t0 + horizon))
        first_full = (t0 // 60 + 1) * 60
        bars = probe.get_bars_range(sym, "M1", dt(first_full), dt(t0 + horizon - 60))
        start = make(Clock(t0)).get_latest_ticks([sym])[sym]
        end = probe.get_latest_ticks([sym])[sym]
        if kind == "dip":
            low = min(b.low for b in bars)
            if start.ask - low > 5 * spread and end.bid - low > 5 * spread:
                return t0, low, start, end
        else:
            high = max(b.high for b in bars)
            if high - start.ask > 5 * spread and high - end.bid > 5 * spread:
                return t0, high, start, end
    pytest.fail(f"no {kind} window found for {sym}")


# ── Registry ──

def test_registered_and_created_from_config():
    assert "sim" in list_provider_types()
    p = create_provider({"id": "sim_default", "type": "sim", "persist": False})
    assert isinstance(p, SimProvider) and p.can_execute and p.is_simulated


# ── Price engine ──

def test_ticks_are_quotes_inside_the_forming_bar():
    clock = Clock(MINUTE0)
    p = make(clock)
    for second in (0.0, 7.3, 21.9, 44.5, 59.9):
        clock.t = MINUTE0 + second
        tick = p.get_latest_ticks(["XAUUSD"])["XAUUSD"]
        bar = p.get_bars("XAUUSD", "M1", 1)[-1]
        assert tick.ask > tick.bid > 0
        assert bar.low <= tick.bid <= bar.high
        assert bar.close == tick.bid
        assert bar.time == dt(MINUTE0).strftime("%Y-%m-%dT%H:%M:%S")


def test_bars_are_valid_on_every_timeframe():
    p = make(Clock(T0))
    for tf in ("M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"):
        bars = p.get_bars("US500", tf, 120)
        assert len(bars) == 120
        times = [ts(b.time) for b in bars]
        assert times == sorted(times) and len(set(times)) == len(times)
        for b in bars:
            assert b.low <= min(b.open, b.close) <= max(b.open, b.close) <= b.high
            assert b.volume >= 1


@pytest.mark.parametrize("tf,sub,n", [
    ("M15", "M1", 15), ("H1", "M5", 12), ("H4", "H1", 4), ("D1", "H1", 24), ("W1", "D1", 7),
])
def test_timeframes_aggregate_the_same_path(tf, sub, n):
    p = make(Clock(T0))
    span = n * {"M1": 60, "M5": 300, "H1": 3600, "D1": 86400}[sub]
    small = p.get_bars("GER40", sub, 7 * n)       # covers 6 big bars + the forming one
    big = p.get_bars("GER40", tf, 6)
    for bar in big:
        parts = [x for x in small if ts(bar.time) <= ts(x.time) < ts(bar.time) + span]
        assert len(parts) == n or (bar is big[-1] and 0 < len(parts) < n)
        assert bar.open == parts[0].open
        assert bar.close == parts[-1].close
        assert bar.high == max(x.high for x in parts)
        assert bar.low == min(x.low for x in parts)
        assert bar.volume == sum(x.volume for x in parts)


def test_same_seed_same_market_and_history_never_changes():
    a, b = make(Clock(T0)), make(Clock(T0))
    assert ohlcv(a.get_bars("EURUSD", "M5", 300)) == ohlcv(b.get_bars("EURUSD", "M5", 300))
    assert ohlcv(make(Clock(T0), seed=7).get_bars("EURUSD", "M5", 300)) != ohlcv(a.get_bars("EURUSD", "M5", 300))

    window = (dt(T0 - 86400), dt(T0 - 3600))
    later = make(Clock(T0 + 3 * 86400))
    assert ohlcv(a.get_bars_range("EURUSD", "M15", *window)) == ohlcv(later.get_bars_range("EURUSD", "M15", *window))


def test_new_closed_bar_is_reported_once():
    clock = Clock(MINUTE0 + 30)
    p = make(clock)
    assert p.check_new_bars(["EURUSD"], "M1") == []
    clock.advance(20)
    assert p.check_new_bars(["EURUSD"], "M1") == []
    clock.advance(60)
    events = p.check_new_bars(["EURUSD"], "M1")
    assert len(events) == 1 and events[0]["type"] == "bar" and events[0]["ticker"] == "EURUSD"
    closed = p.get_bars("EURUSD", "M1", 2)[0]
    assert events[0]["bar"]["time"] == closed.time == dt(MINUTE0).strftime("%Y-%m-%dT%H:%M:%S")
    assert events[0]["bar"]["close"] == closed.close
    assert p.check_new_bars(["EURUSD"], "M1") == []


@pytest.mark.parametrize("sym", ["EURUSD", "US500", "XAUUSD", "BTCUSD"])
def test_daily_returns_match_the_configured_volatility(sym):
    path = _DailyPath(instrument(sym), 2026)
    returns = np.diff(path.close[:REF_DAY])
    realized = returns.std() * math.sqrt(365)
    assert 0.75 * instrument(sym).vol < realized < 1.25 * instrument(sym).vol


def test_bars_range_is_clamped_to_now_and_history_start():
    p = make(Clock(T0))
    bars = p.get_bars_range("EURUSD", "M15", dt(T0 - 3600), dt(T0 + 7 * 86400))
    assert ts(bars[-1].time) <= T0 < ts(bars[-1].time) + 900
    assert p.get_bars_range("EURUSD", "D1", datetime(2000, 1, 1), datetime(2018, 1, 3))[0].time == "2018-01-01T00:00:00"


def test_unknown_symbols_are_simulated_too():
    p = make(Clock(T0))
    tick = p.get_latest_ticks(["FOOBAR"])["FOOBAR"]
    assert tick.bid > 0 and len(p.get_bars("FOOBAR", "H1", 10)) == 10


def test_symbol_and_account_info():
    p = make(Clock(T0))
    usdjpy = p.get_latest_ticks(["USDJPY"])["USDJPY"].bid
    info = p.get_symbol_info("USDJPY")
    assert info.digits == 3 and info.trade_contract_size == 100_000
    assert info.tick_value == pytest.approx(0.001 * 100_000 / usdjpy, rel=1e-3)
    acct = p.get_account_info()
    assert acct.balance == acct.equity == 100_000 and acct.currency == "USD" and acct.simulated


# ── Paper trading ──

def test_market_order_fills_at_the_quote_and_tracks_pnl():
    clock = Clock(T0)
    p = make(clock)
    quote = p.get_latest_ticks(["EURUSD"])["EURUSD"]
    res = p.place_order(order("EURUSD", "BUY", 1.0))
    assert res.success and res.price == quote.ask

    clock.advance(600)
    pos = p.get_positions()[0]
    assert pos.direction == "BUY" and pos.lots == 1.0
    assert pos.profit == pytest.approx((pos.current_price - quote.ask) * 100_000, abs=0.01)
    assert p.get_account_info().equity == pytest.approx(100_000 + pos.profit, abs=0.01)


def test_partial_close_realizes_pnl_into_balance():
    clock = Clock(T0)
    p = make(clock)
    ticket = p.place_order(order("XAUUSD", "SELL", 1.0)).order_id
    clock.advance(300)
    res = p.close_position(ticket, 0.4)
    assert res.success and res.lots == 0.4 and res.direction == "BUY"
    [pos] = p.get_positions()
    assert pos.lots == 0.6
    [trade] = p.get_trade_history(1)
    assert trade.lots == 0.4 and trade.reason == "manual"
    assert p.get_account_info().balance == pytest.approx(100_000 + trade.profit, abs=0.01)
    assert p.close_position(ticket).success and p.get_positions() == []


def test_stop_loss_triggers_on_a_wick_between_polls():
    t0, low, _, _ = find_window("EURUSD", "dip")
    clock = Clock(t0)
    p = make(clock)
    sl = round(low + instrument("EURUSD").point, 5)
    assert p.place_order(order("EURUSD", "BUY", 1.0, sl=sl)).success

    clock.t = t0 + 900  # one poll, after the dip: the current bid is back above the stop
    assert p.get_latest_ticks(["EURUSD"])["EURUSD"].bid > sl
    assert p.get_positions() == []
    [trade] = p.get_trade_history(1)
    assert trade.reason == "sl" and trade.close_price == sl and trade.profit < 0


def test_take_profit_triggers_on_a_spike_between_polls():
    t0, high, _, _ = find_window("XAUUSD", "spike")
    clock = Clock(t0)
    p = make(clock)
    tp = round(high - instrument("XAUUSD").point, 2)
    assert p.place_order(order("XAUUSD", "BUY", 0.1, tp=tp)).success
    clock.t = t0 + 900
    assert p.get_positions() == []
    [trade] = p.get_trade_history(1)
    assert trade.reason == "tp" and trade.close_price == tp and trade.profit > 0


def test_buy_limit_fills_when_the_ask_dips_to_it():
    t0, low, start, _ = find_window("XAUUSD", "dip")
    inst = instrument("XAUUSD")
    limit = round(low + 1.6 * inst.spread + inst.point, 2)   # reachable by the ask at max spread
    assert limit < start.ask
    clock = Clock(t0)
    p = make(clock)
    assert p.place_order(order("XAUUSD", "BUY", 0.1, kind="LIMIT", price=limit)).success
    assert len(p.get_pending_orders()) == 1 and p.get_positions() == []

    clock.t = t0 + 900
    assert p.get_pending_orders() == []
    [pos] = p.get_positions()
    assert pos.open_price == limit and pos.direction == "BUY"


def test_invalid_orders_are_rejected():
    p = make(Clock(T0))
    quote = p.get_latest_ticks(["XAUUSD"])["XAUUSD"]
    assert "Invalid volume" in p.place_order(order("XAUUSD", "BUY", 1000)).error
    assert "Not enough money" in p.place_order(order("XAUUSD", "BUY", 50)).error
    assert "Invalid stops" in p.place_order(order("XAUUSD", "BUY", 0.1, sl=quote.ask + 10)).error
    assert "Invalid stops" in p.place_order(order("XAUUSD", "SELL", 0.1, tp=quote.bid + 10)).error
    assert "Invalid price" in p.place_order(order("XAUUSD", "BUY", 0.1, kind="LIMIT", price=quote.ask + 10)).error
    assert "Invalid price" in p.place_order(order("XAUUSD", "SELL", 0.1, kind="STOP", price=quote.bid + 10)).error
    assert p.get_positions() == [] and p.get_pending_orders() == []


def test_modify_and_cancel():
    p = make(Clock(T0))
    quote = p.get_latest_ticks(["EURUSD"])["EURUSD"]
    ticket = p.place_order(order("EURUSD", "BUY", 0.5)).order_id
    assert p.modify_position(ticket, stop_loss=quote.bid - 0.002, take_profit=quote.bid + 0.004)["success"]
    assert not p.modify_position(ticket, stop_loss=quote.bid + 0.002)["success"]
    assert p.modify_position(ticket, stop_loss=0)["stop_loss"] is None   # 0 clears, like MT5
    assert p.get_positions()[0].take_profit == pytest.approx(quote.bid + 0.004)

    pending = p.place_order(order("EURUSD", "SELL", 0.5, kind="LIMIT", price=quote.bid + 0.005)).order_id
    assert p.modify_order(pending, price=quote.bid + 0.006).success
    assert not p.modify_order(pending, price=quote.bid - 0.006).success
    assert p.get_pending_orders()[0].price == pytest.approx(quote.bid + 0.006)
    assert p.cancel_order(pending).success and p.get_pending_orders() == []
    assert not p.cancel_order(pending).success


def test_account_survives_restart_and_applies_stops_hit_while_closed(tmp_path):
    t0, low, _, _ = find_window("EURUSD", "dip")
    state = tmp_path / "paper.json"
    p = make(Clock(t0), persist=True, state_file=str(state))
    assert p.place_order(order("EURUSD", "BUY", 1.0, sl=round(low + instrument("EURUSD").point, 5))).success
    assert p.place_order(order("EURUSD", "SELL", 0.5)).success
    p.disconnect()
    assert state.exists()

    later = make(Clock(t0 + 900), persist=True, state_file=str(state))
    assert [pos.direction for pos in later.get_positions()] == ["SELL"]
    [trade] = later.get_trade_history(1)
    assert trade.reason == "sl"
    assert later.get_account_info().balance == pytest.approx(100_000 + trade.profit, abs=0.01)
