"""
================================================================================
Quantum Terminal — paper account on live prices from any data source
================================================================================
Practise on the real market without a broker. Pick any data source (Yahoo
Finance, Binance, OANDA, Alpaca, MetaTrader 5, CSV files) and make this the
execution account. Orders then fill at that source's live bid/ask.

It is the simulator's paper engine, unchanged:
- market, limit and stop orders;
- SL/TP that trigger on wicks;
- partial closes, margin checks, P&L converted to USD;
- the account is saved to disk.

Only the prices come from the chosen source. SL/TP are checked against two
things, so a price from before an order or position existed never triggers
it:
- every quote seen since the last check;
- the source's completed M1 bars (to catch wicks between checks, and moves
  while the terminal was closed).

    account config (providers.accounts.paper_default)
        initial_balance  starting balance in USD (default 100000)
        leverage         default 100
        data_account     id of the data source to trade on (default: the active one)
        state_file       where the account is kept (default: <app-data>/paper_account.json)

Contract sizes are those of the usual CFDs: 100,000 units of forex, 100 oz of
gold, 1 unit of an index, 1 coin of crypto, 1 share of a stock.
================================================================================
"""

from __future__ import annotations

import dataclasses
import logging
import math
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

import app_paths
from models import AccountInfo
from providers.sim_provider import _SPECS, _USD_CONVERSION, Instrument, SimProvider, instrument

log = logging.getLogger("qt.provider.paper")

_OBSERVED = 4000          # quotes kept per symbol for SL/TP checks


def _parse_feed_time(s: str) -> Optional[float]:
    try:
        return datetime.strptime(str(s)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


class PaperProvider(SimProvider):
    """Paper account that trades on another provider's live prices."""

    is_simulated = True          # a paper account: the UI says orders go to it

    def __init__(self, account_config: Dict[str, Any], clock: Optional[Callable[[], float]] = None):
        cfg = {"label": "Paper account (live prices)", **(account_config or {})}
        cfg.setdefault("id", "paper_default")
        super().__init__(cfg, clock)
        self._data_account = cfg.get("data_account") or ""
        self._lookup: Optional[Callable[[Optional[str]], Any]] = None
        self._observed: Dict[str, Deque[Tuple[float, float, float]]] = defaultdict(lambda: deque(maxlen=_OBSERVED))
        self._offsets: Dict[int, float] = {}
        self._warned: set = set()

    @property
    def provider_type(self) -> str:
        return "paper"

    @staticmethod
    def _resolve_state_path(cfg: Dict[str, Any]) -> Optional[Path]:
        if not cfg.get("persist", True):
            return None
        if cfg.get("state_file"):
            return Path(cfg["state_file"]).expanduser()
        return app_paths.app_data_dir() / "paper_account.json"

    # ── the data source ──

    def bind_providers(self, get_provider: Callable[[Optional[str]], Any]) -> None:
        """Given by config_manager: provider by id (None → the active data source)."""
        self._lookup = get_provider

    def feed(self):
        if self._lookup is None:
            return None
        p = self._lookup(self._data_account or None)
        if p is None or p is self or isinstance(p, PaperProvider):
            return None
        return p

    @property
    def connected(self) -> bool:
        f = self.feed()
        return self._connected and f is not None and bool(getattr(f, "connected", False))

    def connect(self) -> bool:
        with self._lock:
            if not self._connected:
                self._load_state()
                self._connected = True
                f = self.feed()
                log.info(f"Paper account ready — orders fill at the live prices of "
                         f"{getattr(f, 'label', 'the active data source')}")
            return True

    # ── market data: straight from the source ──

    def get_latest_ticks(self, symbols: List[str]):
        f = self.feed()
        return f.get_latest_ticks(symbols) if f else {}

    def get_bars(self, ticker: str, timeframe: str = "M15", count: int = 200):
        f = self.feed()
        return f.get_bars(ticker, timeframe, count) if f else []

    def get_bars_range(self, ticker, timeframe, from_dt, to_dt):
        f = self.feed()
        return f.get_bars_range(ticker, timeframe, from_dt, to_dt) if f else []

    def check_new_bars(self, symbols: List[str], timeframe: str = "M15"):
        f = self.feed()
        return f.check_new_bars(symbols, timeframe) if f else []

    def get_symbol_info(self, ticker: str):
        f = self.feed()
        return f.get_symbol_info(ticker) if f else None

    def resolve_symbol(self, canonical: str):
        f = self.feed()
        return f.resolve_symbol(canonical) if f else None

    def resolve_universe(self, universe: List[str]) -> List[str]:
        f = self.feed()
        return f.resolve_universe(universe) if f else []

    def get_available_symbols(self) -> List[str]:
        f = self.feed()
        return f.get_available_symbols() if f else []

    # ── prices for the paper engine ──

    def _tick(self, sym: str):
        f = self.feed()
        tick = f.get_latest_ticks([sym]).get(sym) if f else None
        if tick is None or not (tick.bid or tick.ask or tick.last):
            raise ValueError(f"no live price for {sym} from the data source")
        bid = float(tick.bid or tick.last or tick.ask)
        ask = float(tick.ask or bid)
        return bid, max(ask, bid), tick

    def _quote(self, sym: str, now: float) -> Tuple[float, float]:
        bid, ask, tick = self._tick(sym)
        self._observed[sym].append((now, bid, ask))
        self._remember_offset(tick, now)
        return bid, ask

    def _spread(self, inst: Instrument, now: float) -> float:
        bid, ask, _ = self._tick(inst.symbol)
        return ask - bid

    def _remember_offset(self, tick, now: float) -> None:
        """For a source without a declared clock (MetaTrader 5 server time):
        its clock minus real time, from a fresh tick, in quarter hours."""
        f = self.feed()
        if f is None or hasattr(f, "clock"):
            return
        t = _parse_feed_time(getattr(tick, "time", "") or "")
        if t is not None and abs(t - now) <= 14 * 3600:      # a stale weekend tick says nothing
            self._offsets[id(f)] = round((t - now) / 900.0) * 900.0

    def _feed_offset(self, f, now: float) -> float:
        if hasattr(f, "clock"):
            from providers.feed_base import clock_offset
            return float(clock_offset(f.clock, now))
        return self._offsets.get(id(f), 0.0)

    def _bid_range(self, sym: str, t0: float, t1: float,
                   created: Optional[float] = None) -> Tuple[float, float]:
        """Lowest and highest bid in [t0, t1] for an order/position that
        exists since `created`: the quotes seen in [t0, t1], plus the source's
        M1 bars that overlap that window and started at or after `created`.
        A bar that began before the order existed is never used, since its
        low or high may predate the order."""
        bid, _ = self._quote(sym, t1)
        lo = hi = bid
        for ts, b, _ in self._observed[sym]:
            if t0 <= ts <= t1:
                lo, hi = min(lo, b), max(hi, b)
        f = self.feed()
        since_created = t0 if created is None else created
        minutes = int(math.ceil((t1 - min(t0, since_created)) / 60.0))
        if f is not None:
            offset = self._feed_offset(f, t1)
            for b in f.get_bars(sym, "M1", min(1000, minutes + 2)):
                start = _parse_feed_time(b.time)
                if start is None:
                    continue
                start -= offset
                if start >= since_created and start + 60 > t0 and start <= t1:
                    lo, hi = min(lo, float(b.low)), max(hi, float(b.high))
        return lo, hi

    def _to_usd(self, amount: float, ccy: str, now: float) -> float:
        conv = _USD_CONVERSION.get(ccy)
        if conv is None:
            return amount
        pair, direct = conv
        try:
            rate, _, _ = self._tick(pair)
        except ValueError:
            if ccy not in self._warned:
                self._warned.add(ccy)
                log.warning(f"Paper account: no {pair} price on this data source — "
                            f"{ccy} amounts are counted 1:1 as USD")
            return amount
        return amount * rate if direct else amount / rate

    def _instrument(self, sym: str) -> Instrument:
        if sym in _SPECS:
            return instrument(sym)
        base = instrument(sym)              # generic spec: 1 unit per lot, USD
        f = self.feed()
        info = f.get_symbol_info(sym) if f else None
        digits = int(getattr(info, "digits", 0) or base.digits)
        return dataclasses.replace(base, digits=digits, contract_size=1.0, max_lot=10_000.0,
                                   profit_ccy=getattr(info, "currency_profit", "") or "USD")

    def place_order(self, order):
        sym = (order.ticker or order.symbol or "").upper()
        try:
            self._tick(sym)
        except ValueError as e:
            return self._fail(f"{e}: pick a ticker the data source carries")
        return super().place_order(order)

    def get_account_info(self) -> Optional[AccountInfo]:
        info = super().get_account_info()
        if info is None:
            return None
        f = self.feed()
        info.provider_type = "paper"
        info.account_id = "PAPER"
        info.label = self._label
        info.broker = info.company = "Quantum Terminal paper account"
        info.server = f"PAPER · {getattr(f, 'label', 'no data source')}"
        return info
