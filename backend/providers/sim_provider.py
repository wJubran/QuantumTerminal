"""
================================================================================
Quantum Terminal — Simulated Market Provider (Bates model) + paper trading
================================================================================
A broker-free data + execution provider. It streams realistic, fully
deterministic prices for any symbol, so the terminal runs on any OS without
MetaTrader 5 or a broker account: demos, UI development, practising on paper,
automated tests and CI.

Price model — Bates (1996): Heston stochastic variance + Merton log-normal
jumps, the model family behind the terminal's volatility cones:

    dS/S = −λk dt + √v dW₁ + (e^J − 1) dN     N ~ Poisson(λ),  J ~ N(μ_J, σ_J²)
    dv   = κ(θ − v) dt + ξ √v dW₂             corr(dW₁, dW₂) = ρ,  θ = σ²

The path is built in three layers, each seeded from (seed, symbol, period):
  1. Daily  — one Bates step per calendar day since EPOCH.
  2. Minute — a variance-weighted Brownian bridge between each day's open and
     close, shaped by an intraday volatility profile (quiet Asia, busy
     London and New York opens), with the day's jump placed at one minute.
  3. Second — each minute's high/low is drawn from the exact distribution of
     a Brownian bridge's maximum/minimum; live ticks follow a bridge pinned
     to that minute's open, high, low and close.

Consequences: every timeframe aggregates the same minute bars, history never
changes when requested again, live ticks never leave the current bar's
high/low, and two terminals with the same seed see the same market. The
simulated market trades 24/7. Prices are BID (like MT5 bars); ask = bid +
spread.

Paper trading: market / limit / stop orders, SL/TP checked against the full
price range since the previous check (a wick through the stop triggers it),
partial closes, margin checks and USD P&L conversion. The account is saved
to a JSON file (see `state_file`) so it survives restarts; stops hit while
the terminal was closed are applied on the next start.

Account config keys (providers.accounts.sim_default):
    seed             int    — market identity (default 2026)
    initial_balance  float  — paper account size in USD (default 100000)
    leverage         int    — default 100
    persist          bool   — save the paper account (default True)
    state_file       str    — path of the account file (default: app data dir)
================================================================================
"""

import hashlib
import json
import logging
import math
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

import app_paths
from models import (
    TickData, BarData, AccountInfo, SymbolInfo, ClosedTrade,
    OrderRequest, OrderResult, Position, PendingOrder,
)
from providers.base_provider import BaseProvider

log = logging.getLogger("provider.sim")

EPOCH = datetime(2018, 1, 1, tzinfo=timezone.utc)   # a Monday → W1 bars start Mondays
EPOCH_TS = EPOCH.timestamp()
# Prices are scaled so that each instrument opens at its reference level on this day.
REF_DAY = (datetime(2026, 1, 1, tzinfo=timezone.utc) - EPOCH).days
MINUTES_PER_DAY = 1440
YEAR_DAYS = 365.0
BLOCK_DAYS = 256          # daily random draws come in seeded blocks → extending is deterministic
MAX_BARS = 5000
MAX_TRIGGER_LOOKBACK_SEC = 30 * 86400

TIMEFRAME_MINUTES = {
    "M1": 1, "M5": 5, "M15": 15, "M30": 30,
    "H1": 60, "H4": 240, "D1": 1440, "W1": 10080,
}

# Intraday volatility profile by UTC hour (relative; normalized below).
_HOURLY_VOL = [
    0.55, 0.50, 0.50, 0.55, 0.55, 0.60, 0.70, 0.95,   # 00–07  Asia
    1.30, 1.20, 1.05, 1.00, 1.10, 1.35, 1.60, 1.45,   # 08–15  London open, NY open
    1.20, 1.00, 0.85, 0.80, 0.75, 0.65, 0.55, 0.55,   # 16–23  US afternoon, roll-over
]
_SEASON = np.interp(
    (np.arange(MINUTES_PER_DAY) + 0.5) / 60.0,
    np.arange(24) + 0.5, _HOURLY_VOL, period=24,
)
_SEASON_W2 = _SEASON ** 2 / np.sum(_SEASON ** 2)      # per-minute share of daily variance
_ACTIVITY = np.sqrt(_SEASON_W2 * MINUTES_PER_DAY)       # RMS 1 — scales spread & volume

# Model parameters per asset class:
#   kappa, xi as a multiple of vol, rho, jumps/year, mean jump, jump sd, ticks/min, max lots
_CLASS_PARAMS = {
    "FX":        (3.0, 1.0, -0.10,  6.0,  0.000, 0.004, 60, 100.0),
    "INDEX":     (4.0, 1.5, -0.70,  5.0, -0.006, 0.012, 80, 500.0),
    "COMMODITY": (3.0, 1.2,  0.10,  6.0,  0.000, 0.012, 50, 100.0),
    "CRYPTO":    (2.0, 1.1, -0.30, 12.0, -0.005, 0.030, 40, 50.0),
    "OTHER":     (3.0, 1.2, -0.30,  6.0, -0.002, 0.010, 30, 100.0),
}

# symbol: (reference price, annual vol, digits, typical spread, contract size, class, profit ccy)
# Reference levels are illustrative — this is a simulation, not market data.
_SPECS: Dict[str, Tuple[float, float, int, float, float, str, str]] = {
    "EURUSD": (1.0850, 0.075, 5, 0.00008, 100_000, "FX", "USD"),
    "GBPUSD": (1.2700, 0.085, 5, 0.00012, 100_000, "FX", "USD"),
    "USDJPY": (150.00, 0.095, 3, 0.012,   100_000, "FX", "JPY"),
    "AUDUSD": (0.6600, 0.100, 5, 0.00010, 100_000, "FX", "USD"),
    "NZDUSD": (0.6000, 0.105, 5, 0.00014, 100_000, "FX", "USD"),
    "USDCHF": (0.8800, 0.080, 5, 0.00012, 100_000, "FX", "CHF"),
    "USDCAD": (1.3600, 0.065, 5, 0.00014, 100_000, "FX", "CAD"),
    "EURJPY": (162.50, 0.100, 3, 0.018,   100_000, "FX", "JPY"),
    "US500":  (5800.0, 0.170, 2, 0.50,    1,       "INDEX", "USD"),
    "USTEC":  (20500.0, 0.220, 2, 1.20,   1,       "INDEX", "USD"),
    "US30":   (42000.0, 0.160, 2, 2.00,   1,       "INDEX", "USD"),
    "GER40":  (19500.0, 0.180, 2, 1.20,   1,       "INDEX", "EUR"),
    "UK100":  (8300.0, 0.150, 2, 1.00,    1,       "INDEX", "GBP"),
    "JP225":  (39000.0, 0.210, 1, 8.00,   1,       "INDEX", "JPY"),
    "XAUUSD": (4000.00, 0.160, 2, 0.30,   100,     "COMMODITY", "USD"),
    "XAGUSD": (48.000, 0.280, 3, 0.030,   5000,    "COMMODITY", "USD"),
    "XTIUSD": (65.00, 0.340, 2, 0.03,     1000,    "COMMODITY", "USD"),
    "XBRUSD": (68.00, 0.320, 2, 0.03,     1000,    "COMMODITY", "USD"),
    "NATGAS": (3.200, 0.550, 3, 0.006,    10000,   "COMMODITY", "USD"),
    "BTCUSD": (100000.0, 0.550, 2, 30.0,  1,       "CRYPTO", "USD"),
    "ETHUSD": (3500.0, 0.700, 2, 2.50,    1,       "CRYPTO", "USD"),
}
_DEFAULT_SPEC = (100.0, 0.25, 2, 0.05, 1, "OTHER", "USD")

# Profit currency → (conversion pair, True if USD per unit = pair price, False if = 1/price)
_USD_CONVERSION = {
    "EUR": ("EURUSD", True), "GBP": ("GBPUSD", True), "AUD": ("AUDUSD", True),
    "NZD": ("NZDUSD", True), "JPY": ("USDJPY", False), "CHF": ("USDCHF", False),
    "CAD": ("USDCAD", False),
}


def _seed_int(*parts: Any) -> int:
    digest = hashlib.blake2b("|".join(map(str, parts)).encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "little")


def _rng(*parts: Any) -> np.random.Generator:
    return np.random.default_rng(_seed_int(*parts))


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


@dataclass(frozen=True)
class Instrument:
    symbol: str
    price: float
    vol: float
    digits: int
    spread: float
    contract_size: float
    asset_class: str
    profit_ccy: str
    kappa: float
    xi: float
    rho: float
    jump_rate: float
    jump_mean: float
    jump_sd: float
    ticks_per_min: int
    max_lot: float

    @property
    def point(self) -> float:
        return 10.0 ** -self.digits


@lru_cache(maxsize=None)
def instrument(symbol: str) -> Instrument:
    """Spec for any symbol — unknown tickers get generic, still deterministic, parameters."""
    price, vol, digits, spread, cs, cls, ccy = _SPECS.get(symbol, _DEFAULT_SPEC)
    kappa, xi_mult, rho, lam, mu_j, sd_j, tpm, max_lot = _CLASS_PARAMS[cls]
    return Instrument(symbol, price, vol, digits, spread, cs, cls, ccy,
                      kappa, xi_mult * vol, rho, lam, mu_j, sd_j, tpm, max_lot)


class _DailyPath:
    """Layer 1: one Bates step per calendar day from EPOCH, extended lazily."""

    def __init__(self, inst: Instrument, seed: int):
        self.inst = inst
        self.seed = seed
        self.close: List[float] = []      # log level at the end of day d (unscaled, start = 0)
        self.var: List[float] = []        # annualized variance during day d
        self.jump: List[float] = []       # total jump log-return on day d
        self.jump_minute: List[int] = []  # minute of day the jump lands on
        self._x = 0.0
        self._v = inst.vol ** 2
        self.ensure(REF_DAY)
        self.log_scale = math.log(inst.price) - self.open(REF_DAY)

    def open(self, d: int) -> float:
        return self.close[d - 1] if d > 0 else 0.0

    def ensure(self, d: int) -> None:
        while len(self.close) <= d:
            self._extend_block()

    def _extend_block(self) -> None:
        i = self.inst
        rng = _rng(self.seed, i.symbol, "daily", len(self.close) // BLOCK_DAYS)
        z1 = rng.standard_normal(BLOCK_DAYS)
        z2 = rng.standard_normal(BLOCK_DAYS)
        n_jumps = rng.poisson(i.jump_rate / YEAR_DAYS, BLOCK_DAYS)
        zj = rng.standard_normal(BLOCK_DAYS)
        jump_minutes = rng.integers(0, MINUTES_PER_DAY, BLOCK_DAYS)

        dt = 1.0 / YEAR_DAYS
        theta = i.vol ** 2
        compensator = i.jump_rate * (math.exp(i.jump_mean + 0.5 * i.jump_sd ** 2) - 1.0)
        rho_c = math.sqrt(1.0 - i.rho ** 2)
        for k in range(BLOCK_DAYS):
            v = self._v
            n = int(n_jumps[k])
            jump = n * i.jump_mean + math.sqrt(n) * i.jump_sd * zj[k] if n else 0.0
            shock = i.rho * z2[k] + rho_c * z1[k]
            self._x += (-0.5 * v - compensator) * dt + math.sqrt(v * dt) * shock + jump
            self.close.append(self._x)
            self.var.append(v)
            self.jump.append(jump)
            self.jump_minute.append(int(jump_minutes[k]))
            # Heston variance, Euler step with a floor (keeps the process positive)
            v_next = v + i.kappa * (theta - v) * dt + i.xi * math.sqrt(v * dt) * z2[k]
            self._v = max(v_next, 0.05 * theta)


@dataclass
class _Day:
    """Layer 2: one day of minute bars, in unscaled log space."""
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray
    var: np.ndarray      # diffusion variance of each minute


class _LRU(OrderedDict):
    def __init__(self, maxsize: int):
        super().__init__()
        self.maxsize = maxsize

    def put(self, key, value):
        self[key] = value
        self.move_to_end(key)
        if len(self) > self.maxsize:
            self.popitem(last=False)
        return value

    def hit(self, key):
        value = self.get(key)
        if value is not None:
            self.move_to_end(key)
        return value


class SimProvider(BaseProvider):
    """Simulated market data (Bates model) with an in-process paper-trading account."""

    is_simulated = True

    def __init__(self, account_config: Dict[str, Any], clock: Optional[Callable[[], float]] = None):
        self._id = account_config.get("id", "sim_default")
        self._label = account_config.get("label", "Simulated Market (paper trading)")
        self._seed = int(account_config.get("seed", 2026))
        self._initial_balance = float(account_config.get("initial_balance", 100_000.0))
        self._leverage = int(account_config.get("leverage", 100))
        self._state_path = self._resolve_state_path(account_config)
        self._clock = clock or time.time
        self._connected = False
        self._lock = threading.RLock()
        self._last_now = 0.0

        self._paths: Dict[str, _DailyPath] = {}
        self._days = _LRU(256)            # (symbol, day) → _Day
        self._day_summary: Dict[Tuple[str, int], Tuple[float, float, float, float, float]] = {}
        self._minutes = _LRU(128)         # (symbol, day, minute) → 61-point tick path
        self._last_bar_idx: Dict[str, int] = {}

        # Paper account
        self._balance = self._initial_balance
        self._positions: Dict[int, Dict[str, Any]] = {}
        self._pending: Dict[int, Dict[str, Any]] = {}
        self._history: List[Dict[str, Any]] = []
        self._next_ticket = 100_000_001
        self._last_check: Optional[float] = None

    # ── Identity / capabilities ──

    @property
    def provider_type(self) -> str:
        return "sim"

    @property
    def provider_id(self) -> str:
        return self._id

    @property
    def label(self) -> str:
        return self._label

    @property
    def can_execute(self) -> bool:
        return True

    @property
    def supported_timeframes(self) -> List[str]:
        return list(TIMEFRAME_MINUTES)

    # ── Lifecycle ──

    @property
    def connected(self) -> bool:
        return self._connected

    def connect(self) -> bool:
        with self._lock:
            if not self._connected:
                self._load_state()
                self._connected = True
                log.warning(f"SIMULATED market feed active (seed={self._seed}) — "
                            f"prices are NOT real; orders go to a paper account")
            return True

    def disconnect(self) -> None:
        with self._lock:
            if self._connected:
                self._save_state()
                self._connected = False
                log.info("Simulated market feed stopped")

    def heartbeat(self) -> bool:
        return self._connected

    # ── Symbols ──

    def resolve_symbol(self, canonical: str) -> Optional[str]:
        return canonical.upper() if canonical else None

    def resolve_universe(self, universe: List[str]) -> List[str]:
        unknown = [s for s in universe if s not in _SPECS]
        if unknown:
            log.info(f"Simulating generic instruments for: {', '.join(unknown)}")
        return list(universe)

    def get_available_symbols(self) -> List[str]:
        return sorted(_SPECS)

    def get_symbol_info(self, ticker: str) -> Optional[SymbolInfo]:
        inst = instrument(ticker)
        with self._lock:
            now = self._now()
            tick_value = self._to_usd(inst.point * inst.contract_size, inst.profit_ccy, now)
        return SymbolInfo(
            ticker=ticker, symbol=ticker, broker_symbol=ticker,
            asset_class=inst.asset_class, description=f"{ticker} (simulated)",
            digits=inst.digits, decimals=inst.digits, point=inst.point,
            tick_size=inst.point, tick_value=tick_value,
            volume_min=0.01, volume_max=inst.max_lot, volume_step=0.01,
            min_lot=0.01, max_lot=inst.max_lot, lot_step=0.01,
            trade_contract_size=inst.contract_size, contract_size=inst.contract_size,
            currency_base=ticker[:3] if inst.asset_class == "FX" else "",
            currency_profit=inst.profit_ccy, currency_margin=inst.profit_ccy,
            spread=int(round(inst.spread / inst.point)), trade_mode=4, trade_allowed=True,
        )

    # ── Market data ──

    def get_latest_ticks(self, symbols: List[str]) -> Dict[str, TickData]:
        if not self._connected:
            return {}
        with self._lock:
            now = self._now()
            self._process_orders(now)
            ticks = {}
            for sym in symbols:
                inst = instrument(sym)
                bid = self._bid(sym, now)
                spread = self._spread(inst, now)
                ticks[sym] = TickData(
                    ticker=sym,
                    bid=round(bid, inst.digits),
                    ask=round(bid + spread, inst.digits),
                    last=round(bid, inst.digits),
                    time=_iso(now),
                    time_msc=int(now * 1000),
                    spread=round(spread, inst.digits),
                )
            return ticks

    def get_bars(self, ticker: str, timeframe: str = "M15", count: int = 200) -> List[BarData]:
        n = TIMEFRAME_MINUTES.get(timeframe)
        if not self._connected or n is None:
            return []
        with self._lock:
            now = self._now()
            last_bar = self._minute_index(now) // n
            count = max(1, min(int(count), MAX_BARS))
            return self._bars(ticker, timeframe, max(0, last_bar - count + 1), last_bar, now)

    def get_bars_range(self, ticker: str, timeframe: str, from_dt: datetime, to_dt: datetime) -> List[BarData]:
        n = TIMEFRAME_MINUTES.get(timeframe)
        if not self._connected or n is None:
            return []
        if from_dt.tzinfo is None:
            from_dt = from_dt.replace(tzinfo=timezone.utc)
        if to_dt.tzinfo is None:
            to_dt = to_dt.replace(tzinfo=timezone.utc)
        with self._lock:
            now = self._now()
            bar_sec = n * 60
            first = max(0, math.ceil((from_dt.timestamp() - EPOCH_TS) / bar_sec))
            last = math.floor((min(to_dt.timestamp(), now) - EPOCH_TS) / bar_sec)
            if last < first:
                return []
            first = max(first, last - MAX_BARS + 1)
            return self._bars(ticker, timeframe, first, last, now)

    def check_new_bars(self, symbols: List[str], timeframe: str = "M15") -> List[dict]:
        n = TIMEFRAME_MINUTES.get(timeframe)
        if not self._connected or n is None:
            return []
        with self._lock:
            now = self._now()
            closed = self._minute_index(now) // n - 1
            out = []
            for sym in symbols:
                key = f"{sym}_{timeframe}"
                if key in self._last_bar_idx and closed > self._last_bar_idx[key]:
                    bar = self._bars(sym, timeframe, closed, closed, now)[0]
                    out.append({"type": "bar", "ticker": sym, "timeframe": timeframe,
                                "bar": bar.to_dict()})
                self._last_bar_idx[key] = closed
            return out

    # ── Price engine ──

    def _now(self) -> float:
        # Never let the simulated clock run backwards (NTP adjustments).
        t = max(float(self._clock()), self._last_now)
        self._last_now = t
        return t

    @staticmethod
    def _minute_index(ts: float) -> int:
        return int((ts - EPOCH_TS) // 60)

    def _path(self, sym: str) -> _DailyPath:
        path = self._paths.get(sym)
        if path is None:
            path = self._paths[sym] = _DailyPath(instrument(sym), self._seed)
        return path

    def _day(self, sym: str, d: int) -> _Day:
        cached = self._days.hit((sym, d))
        if cached is not None:
            return cached
        path = self._path(sym)
        path.ensure(d)
        a, b = path.open(d), path.close[d]
        rng = _rng(self._seed, sym, "minute", d)

        var = path.var[d] / YEAR_DAYS * _SEASON_W2
        steps = np.sqrt(var) * rng.standard_normal(MINUTES_PER_DAY)
        steps[path.jump_minute[d]] += path.jump[d]
        # Brownian bridge: pin the minute path to the day's close
        steps += (b - a - steps.sum()) * (var / var.sum())
        close = a + np.cumsum(steps)
        close[-1] = b
        opn = np.empty(MINUTES_PER_DAY)
        opn[0] = a
        opn[1:] = close[:-1]

        # Exact draw of a Brownian bridge's max / min given its endpoints:
        #   P(max ≥ m) = exp(−2 (m − a)(m − b) / σ²T)
        u = np.clip(rng.random((2, MINUTES_PER_DAY)), 1e-12, 1.0)
        gap2 = (close - opn) ** 2
        high = 0.5 * (opn + close + np.sqrt(gap2 - 2.0 * var * np.log(u[0])))
        low = 0.5 * (opn + close - np.sqrt(gap2 - 2.0 * var * np.log(u[1])))

        tpm = instrument(sym).ticks_per_min
        volume = np.maximum(1.0, np.round(
            tpm * _ACTIVITY * np.exp(0.35 * rng.standard_normal(MINUTES_PER_DAY) - 0.06)))
        return self._days.put((sym, d), _Day(opn, high, low, close, volume, var))

    def _minute_path(self, sym: str, d: int, k: int) -> np.ndarray:
        """Layer 3: 61 log levels at whole seconds 0..60 of minute k, pinned to
        the minute's open (0), close (60), high and low (at random seconds)."""
        key = (sym, d, k)
        cached = self._minutes.hit(key)
        if cached is not None:
            return cached
        day = self._day(sym, d)
        a, b, hi, lo = day.open[k], day.close[k], day.high[k], day.low[k]
        rng = _rng(self._seed, sym, "second", d * MINUTES_PER_DAY + k)
        t_hi, t_lo = (int(t) for t in rng.choice(np.arange(1, 60), size=2, replace=False))
        anchors = sorted([(0, a), (t_hi, hi), (t_lo, lo), (60, b)])
        z = rng.standard_normal(60) * math.sqrt(day.var[k] / 60.0)
        q = np.empty(61)
        q[0] = a
        for (t0, x0), (t1, x1) in zip(anchors, anchors[1:]):
            seg = z[t0:t1]
            seg = seg + ((x1 - x0) - seg.sum()) / (t1 - t0)
            q[t0 + 1:t1 + 1] = x0 + np.cumsum(seg)
            q[t1] = x1
        np.clip(q, lo, hi, out=q)
        return self._minutes.put(key, q)

    def _log_bid(self, sym: str, ts: float) -> float:
        m = self._minute_index(ts)
        d, k = divmod(m, MINUTES_PER_DAY)
        q = self._minute_path(sym, d, k)
        s = ts - EPOCH_TS - m * 60.0
        i = min(int(s), 59)
        return float(q[i] + (q[i + 1] - q[i]) * (s - i))

    def _bid(self, sym: str, ts: float) -> float:
        return math.exp(self._log_bid(sym, ts) + self._path(sym).log_scale)

    def _spread(self, inst: Instrument, ts: float) -> float:
        k = self._minute_index(ts) % MINUTES_PER_DAY
        widen = 1.0 + 0.6 * max(0.0, 1.0 - float(_ACTIVITY[k]))   # wider in quiet hours
        return max(inst.point, round(inst.spread * widen, inst.digits))

    def _day_arrays(self, sym: str, d: int, now: float):
        """(open, high, low, close, volume) minute arrays for day d, cut at `now`
        — the current minute is partial: close = live bid, high/low so far."""
        cur = self._minute_index(now)
        cur_day, cur_k = divmod(cur, MINUTES_PER_DAY)
        day = self._day(sym, d)
        if d < cur_day:
            return day.open, day.high, day.low, day.close, day.volume
        if d > cur_day:
            empty = np.empty(0)
            return empty, empty, empty, empty, empty
        n = cur_k + 1
        o, h, l, c, v = (arr[:n].copy() for arr in (day.open, day.high, day.low, day.close, day.volume))
        q = self._minute_path(sym, d, cur_k)
        s = now - EPOCH_TS - cur * 60.0
        i = min(int(s), 59)
        x = self._log_bid(sym, now)
        h[-1] = max(float(q[:i + 1].max()), x)
        l[-1] = min(float(q[:i + 1].min()), x)
        c[-1] = x
        v[-1] = max(1.0, round(day.volume[cur_k] * s / 60.0))
        return o, h, l, c, v

    def _summary(self, sym: str, d: int, now: float):
        """(open, high, low, close, volume) of a whole day; complete days are cached."""
        complete = d < self._minute_index(now) // MINUTES_PER_DAY
        if complete and (sym, d) in self._day_summary:
            return self._day_summary[(sym, d)]
        o, h, l, c, v = self._day_arrays(sym, d, now)
        if len(o) == 0:
            return None
        s = (float(o[0]), float(h.max()), float(l.min()), float(c[-1]), float(v.sum()))
        if complete:
            self._day_summary[(sym, d)] = s
        return s

    def _bars(self, sym: str, timeframe: str, first: int, last: int, now: float) -> List[BarData]:
        """Bars first..last (global indexes of `timeframe` since EPOCH)."""
        n = TIMEFRAME_MINUTES[timeframe]
        scale = self._path(sym).log_scale
        digits = instrument(sym).digits
        rows = []   # (start minute, o, h, l, c, v) in log space
        if n < MINUTES_PER_DAY:
            per_day = MINUTES_PER_DAY // n
            for d in range(first // per_day, last // per_day + 1):
                o, h, l, c, v = self._day_arrays(sym, d, now)
                if len(o) == 0:
                    break
                starts = np.arange(0, len(o), n)
                ends = np.minimum(starts + n - 1, len(o) - 1)
                bh = np.maximum.reduceat(h, starts)
                bl = np.minimum.reduceat(l, starts)
                bv = np.add.reduceat(v, starts)
                for j, st in enumerate(starts):
                    idx = d * per_day + j
                    if first <= idx <= last:
                        rows.append((d * MINUTES_PER_DAY + int(st), o[st], bh[j], bl[j], c[ends[j]], bv[j]))
        else:
            days_per_bar = n // MINUTES_PER_DAY
            for idx in range(first, last + 1):
                parts = [s for s in (self._summary(sym, d, now)
                                     for d in range(idx * days_per_bar, (idx + 1) * days_per_bar))
                         if s is not None]
                if not parts:
                    break
                rows.append((idx * n, parts[0][0], max(p[1] for p in parts), min(p[2] for p in parts),
                             parts[-1][3], sum(p[4] for p in parts)))

        def px(x: float) -> float:
            return round(math.exp(float(x) + scale), digits)

        return [
            BarData(time=_iso(EPOCH_TS + m * 60), open=px(o), high=px(h), low=px(l),
                    close=px(c), volume=int(v))
            for m, o, h, l, c, v in rows
        ]

    def _bid_range(self, sym: str, t0: float, t1: float,
                   created: Optional[float] = None) -> Tuple[float, float]:
        """(lowest, highest) bid over [t0, t1] — exact for the piecewise-linear tick path."""
        t0 = min(max(t0, t1 - MAX_TRIGGER_LOOKBACK_SEC), t1)
        m0, m1 = self._minute_index(t0), self._minute_index(t1)
        extremes = []

        def partial(m: int, s_from: float, s_to: float) -> None:
            # Extremes of a piecewise-linear path lie at the ends or at knots.
            q = self._minute_path(sym, *divmod(m, MINUTES_PER_DAY))
            for s in (s_from, s_to):
                i = min(int(s), 59)
                extremes.append(q[i] + (q[i + 1] - q[i]) * (s - i))
            inner = q[int(math.floor(s_from)) + 1:int(math.ceil(s_to))]
            if len(inner):
                extremes.extend((inner.min(), inner.max()))

        s0 = t0 - EPOCH_TS - m0 * 60.0
        s1 = t1 - EPOCH_TS - m1 * 60.0
        if m0 == m1:
            partial(m0, s0, s1)
        else:
            partial(m0, s0, 60.0)
            partial(m1, 0.0, s1)
            m = m0 + 1
            while m < m1:   # whole minutes: the tick path touches exactly the bar's high/low
                d, k = divmod(m, MINUTES_PER_DAY)
                k_end = min(MINUTES_PER_DAY, k + (m1 - m))
                day = self._day(sym, d)
                extremes.extend((day.low[k:k_end].min(), day.high[k:k_end].max()))
                m += k_end - k
        scale = self._path(sym).log_scale
        return math.exp(float(min(extremes)) + scale), math.exp(float(max(extremes)) + scale)

    # ── Paper trading ──

    def _instrument(self, sym: str) -> Instrument:
        """Contract spec used by the paper account (overridden by PaperProvider)."""
        return instrument(sym)

    def _quote(self, sym: str, now: float) -> Tuple[float, float]:
        inst = self._instrument(sym)
        bid = round(self._bid(sym, now), inst.digits)
        return bid, round(bid + self._spread(inst, now), inst.digits)

    def _to_usd(self, amount: float, ccy: str, now: float) -> float:
        conv = _USD_CONVERSION.get(ccy)
        if conv is None:
            return amount
        pair, direct = conv
        rate = self._bid(pair, now)
        return amount * rate if direct else amount / rate

    def _profit(self, pos: Dict[str, Any], exit_price: float, lots: float, now: float) -> float:
        inst = self._instrument(pos["ticker"])
        sign = 1.0 if pos["direction"] == "BUY" else -1.0
        raw = (exit_price - pos["open_price"]) * sign * lots * inst.contract_size
        return round(self._to_usd(raw, inst.profit_ccy, now), 2)

    def _margin(self, sym: str, lots: float, price: float, now: float) -> float:
        inst = self._instrument(sym)
        return self._to_usd(lots * inst.contract_size * price, inst.profit_ccy, now) / self._leverage

    def _account_figures(self, now: float) -> Tuple[float, float, float]:
        """(floating P&L, used margin, equity)."""
        floating = margin = 0.0
        for pos in self._positions.values():
            bid, ask = self._quote(pos["ticker"], now)
            floating += self._profit(pos, bid if pos["direction"] == "BUY" else ask, pos["lots"], now)
            margin += self._margin(pos["ticker"], pos["lots"], pos["open_price"], now)
        return floating, margin, self._balance + floating

    def _new_ticket(self) -> int:
        t = self._next_ticket
        self._next_ticket += 1
        return t

    @staticmethod
    def _stops_error(direction: str, ref: float, sl: Optional[float], tp: Optional[float]) -> Optional[str]:
        if direction == "BUY":
            if sl and sl >= ref:
                return f"Invalid stops: BUY stop loss {sl} must be below {ref}"
            if tp and tp <= ref:
                return f"Invalid stops: BUY take profit {tp} must be above {ref}"
        else:
            if sl and sl <= ref:
                return f"Invalid stops: SELL stop loss {sl} must be above {ref}"
            if tp and tp >= ref:
                return f"Invalid stops: SELL take profit {tp} must be below {ref}"
        return None

    @staticmethod
    def _fail(message: str) -> OrderResult:
        return OrderResult(success=False, error=message, message=message)

    def _normalize_lots(self, sym: str, lots: Any) -> Optional[float]:
        try:
            lots = round(round(float(lots) / 0.01) * 0.01, 2)
        except (TypeError, ValueError):
            return None
        return lots if 0.01 <= lots <= self._instrument(sym).max_lot else None

    def place_order(self, order: OrderRequest) -> OrderResult:
        if not self._connected:
            return self._fail("Simulator not connected")
        sym = (order.ticker or order.symbol or "").upper()
        direction = (order.direction or "").upper()
        kind = (order.order_type or "MARKET").upper()
        if not sym or direction not in ("BUY", "SELL") or kind not in ("MARKET", "LIMIT", "STOP"):
            return self._fail(f"Unsupported order: {kind} {direction} {sym}")
        lots = self._normalize_lots(sym, getattr(order, "lots", None) or order.volume)
        if lots is None:
            return self._fail(f"Invalid volume (0.01 – {self._instrument(sym).max_lot} lots, step 0.01)")
        sl = getattr(order, "stop_loss", None) or order.sl or None
        tp = getattr(order, "take_profit", None) or order.tp or None

        with self._lock:
            now = self._now()
            self._process_orders(now)
            bid, ask = self._quote(sym, now)
            ticket = None
            if kind == "MARKET":
                price = ask if direction == "BUY" else bid
            else:
                price = float(order.price or 0)
                market = ask if direction == "BUY" else bid
                below = price < market
                valid = price > 0 and ((direction == "BUY") == (below if kind == "LIMIT" else not below))
                if not valid:
                    side = "below" if (direction == "BUY") == (kind == "LIMIT") else "above"
                    return self._fail(f"Invalid price: {direction} {kind} must be {side} {market}")
            err = self._stops_error(direction, price, sl, tp)
            if err:
                return self._fail(err)

            _, used, equity = self._account_figures(now)
            need = self._margin(sym, lots, price, now)
            if need > equity - used:
                return self._fail(f"Not enough money: margin {need:,.2f} USD > free margin "
                                  f"{equity - used:,.2f} USD")

            ticket = self._new_ticket()
            record = {"ticket": ticket, "ticker": sym, "direction": direction, "lots": lots,
                      "sl": sl, "tp": tp, "comment": order.comment or "", "magic": getattr(order, "magic", 0)}
            if kind == "MARKET":
                self._positions[ticket] = {**record, "open_price": price, "open_time": now}
            else:
                self._pending[ticket] = {**record, "kind": kind, "price": price, "time_setup": now}
            self._save_state()
            log.info(f"[paper] {kind} {direction} {lots} {sym} @ {price} → #{ticket}")
            return OrderResult(success=True, order_id=str(ticket), ticker=sym,
                               direction=direction, lots=lots, price=price)

    def get_positions(self) -> List[Position]:
        if not self._connected:
            return []
        with self._lock:
            now = self._now()
            self._process_orders(now)
            out = []
            for pos in self._positions.values():
                bid, ask = self._quote(pos["ticker"], now)
                current = bid if pos["direction"] == "BUY" else ask
                out.append(Position(
                    ticket=str(pos["ticket"]), ticker=pos["ticker"], symbol=pos["ticker"],
                    direction=pos["direction"], lots=pos["lots"], volume=pos["lots"],
                    open_price=pos["open_price"], current_price=current,
                    stop_loss=pos["sl"], take_profit=pos["tp"],
                    profit=self._profit(pos, current, pos["lots"], now), swap=0.0,
                    open_time=_iso(pos["open_time"]), comment=pos["comment"],
                ))
            return out

    def close_position(self, ticket: str, lots: Optional[float] = None) -> OrderResult:
        with self._lock:
            now = self._now()
            self._process_orders(now)
            pos = self._positions.get(self._ticket(ticket))
            if pos is None:
                return self._fail(f"Position {ticket} not found")
            close_lots = pos["lots"] if lots is None else self._normalize_lots(pos["ticker"], lots)
            if close_lots is None or close_lots > pos["lots"] + 1e-9:
                return self._fail(f"Invalid close volume: {lots}")
            bid, ask = self._quote(pos["ticker"], now)
            price = bid if pos["direction"] == "BUY" else ask
            self._realize(pos, price, close_lots, now, "manual")
            self._save_state()
            return OrderResult(success=True, order_id=str(pos["ticket"]), ticker=pos["ticker"],
                               direction="SELL" if pos["direction"] == "BUY" else "BUY",
                               lots=close_lots, price=price)

    def modify_position(self, ticket: str, stop_loss=None, take_profit=None) -> dict:
        """Same contract as MT5Provider: None keeps a level, 0 clears it."""
        with self._lock:
            now = self._now()
            self._process_orders(now)
            pos = self._positions.get(self._ticket(ticket))
            if pos is None:
                return {"success": False, "error": f"Position {ticket} not found"}
            sl = pos["sl"] if stop_loss is None else (float(stop_loss) or None)
            tp = pos["tp"] if take_profit is None else (float(take_profit) or None)
            bid, ask = self._quote(pos["ticker"], now)
            err = self._stops_error(pos["direction"], bid if pos["direction"] == "BUY" else ask, sl, tp)
            if err:
                return {"success": False, "error": err}
            pos["sl"], pos["tp"] = sl, tp
            self._save_state()
            return {"success": True, "ticket": str(pos["ticket"]), "stop_loss": sl, "take_profit": tp}

    def get_pending_orders(self) -> List[PendingOrder]:
        if not self._connected:
            return []
        with self._lock:
            self._process_orders(self._now())
            return [
                PendingOrder(
                    ticket=str(o["ticket"]), symbol=o["ticker"], ticker=o["ticker"],
                    direction=o["direction"], order_type=o["kind"], lots=o["lots"], volume=o["lots"],
                    price=o["price"], price_open=o["price"], stop_loss=o["sl"], take_profit=o["tp"],
                    comment=o["comment"], time_setup=_iso(o["time_setup"]),
                )
                for o in self._pending.values()
            ]

    def cancel_order(self, ticket: str) -> OrderResult:
        with self._lock:
            self._process_orders(self._now())
            o = self._pending.pop(self._ticket(ticket), None)
            if o is None:
                return self._fail(f"Order {ticket} not found")
            self._save_state()
            return OrderResult(success=True, order_id=str(o["ticket"]))

    def modify_order(self, ticket: str, price: Optional[float] = None,
                     stop_loss: Optional[float] = None, take_profit: Optional[float] = None) -> OrderResult:
        with self._lock:
            now = self._now()
            self._process_orders(now)
            o = self._pending.get(self._ticket(ticket))
            if o is None:
                return self._fail(f"Order {ticket} not found")
            new_price = o["price"] if price is None else float(price)
            sl = o["sl"] if stop_loss is None else (float(stop_loss) or None)
            tp = o["tp"] if take_profit is None else (float(take_profit) or None)
            bid, ask = self._quote(o["ticker"], now)
            market = ask if o["direction"] == "BUY" else bid
            below = new_price < market
            if new_price <= 0 or (o["direction"] == "BUY") != (below if o["kind"] == "LIMIT" else not below):
                return self._fail(f"Invalid price {new_price} for {o['direction']} {o['kind']}")
            err = self._stops_error(o["direction"], new_price, sl, tp)
            if err:
                return self._fail(err)
            o["price"], o["sl"], o["tp"] = new_price, sl, tp
            self._save_state()
            return OrderResult(success=True, order_id=str(o["ticket"]))

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self._connected:
            return None
        with self._lock:
            now = self._now()
            self._process_orders(now)
            floating, margin, equity = self._account_figures(now)
            return AccountInfo(
                provider_type="sim", account_id="SIM-PAPER", label=self._label,
                broker="Quantum Terminal Simulator", company="Quantum Terminal Simulator",
                server=f"SIM-{self._seed}", name="Paper account", currency="USD",
                balance=round(self._balance, 2), equity=round(equity, 2),
                margin=round(margin, 2), free_margin=round(equity - margin, 2),
                margin_free=round(equity - margin, 2), profit=round(floating, 2),
                margin_level=round(equity / margin * 100.0, 2) if margin else 0.0,
                leverage=self._leverage, connected=True, simulated=True,
            )

    def get_trade_history(self, days: int = 7) -> List[ClosedTrade]:
        with self._lock:
            cutoff = self._now() - days * 86400
            trades = [
                ClosedTrade(
                    ticket=str(h["ticket"]), ticker=h["ticker"], direction=h["direction"],
                    lots=h["lots"], open_price=h["open_price"], close_price=h["close_price"],
                    profit=h["profit"],
                    open_time=datetime.fromtimestamp(h["open_time"], tz=timezone.utc).isoformat(),
                    close_time=datetime.fromtimestamp(h["close_time"], tz=timezone.utc).isoformat(),
                    comment=h["comment"], magic=h.get("magic", 0), reason=h["reason"],
                )
                for h in self._history if h["close_time"] >= cutoff
            ]
            trades.sort(key=lambda t: t.close_time, reverse=True)
            return trades

    @staticmethod
    def _ticket(ticket: Any) -> int:
        try:
            return int(ticket)
        except (TypeError, ValueError):
            return -1

    def _realize(self, pos: Dict[str, Any], price: float, lots: float, now: float, reason: str) -> None:
        profit = self._profit(pos, price, lots, now)
        self._balance += profit
        self._history.append({
            "ticket": pos["ticket"], "ticker": pos["ticker"], "direction": pos["direction"],
            "lots": lots, "open_price": pos["open_price"], "close_price": price, "profit": profit,
            "open_time": pos["open_time"], "close_time": now, "comment": pos["comment"],
            "magic": pos.get("magic", 0), "reason": reason,
        })
        remaining = round(pos["lots"] - lots, 2)
        if remaining >= 0.01:
            pos["lots"] = remaining
        else:
            self._positions.pop(pos["ticket"], None)
        log.info(f"[paper] close #{pos['ticket']} {lots} {pos['ticker']} @ {price} "
                 f"({reason}) P&L {profit:+,.2f} USD")

    def _process_orders(self, now: float) -> None:
        """Fill pending orders and trigger SL/TP over the price range since the last check."""
        since = self._last_check if self._last_check is not None else now
        self._last_check = now
        if now <= since or not (self._positions or self._pending):
            return
        changed = False
        ranges: Dict[Tuple[str, float], Tuple[float, float, float]] = {}

        def price_range(sym: str, created: float):
            # Never look at prices from before the order/position existed.
            start = max(since, created)
            if (sym, start) not in ranges:
                lo, hi = self._bid_range(sym, start, now, created)
                ranges[(sym, start)] = (lo, hi, self._spread(self._instrument(sym), now))
            return ranges[(sym, start)]

        for o in list(self._pending.values()):
            lo, hi, spread = price_range(o["ticker"], o["time_setup"])
            buy = o["direction"] == "BUY"
            touched_low, touched_high = (lo + spread, hi + spread) if buy else (lo, hi)
            wants_lower = buy == (o["kind"] == "LIMIT")   # BUY LIMIT / SELL STOP fill on a dip
            if (touched_low <= o["price"]) if wants_lower else (touched_high >= o["price"]):
                del self._pending[o["ticket"]]
                self._positions[o["ticket"]] = {
                    k: o[k] for k in ("ticket", "ticker", "direction", "lots", "sl", "tp", "comment", "magic")
                } | {"open_price": o["price"], "open_time": now}
                log.info(f"[paper] {o['kind']} #{o['ticket']} filled @ {o['price']}")
                changed = True

        for pos in list(self._positions.values()):
            if pos["open_time"] >= now or not (pos["sl"] or pos["tp"]):
                continue
            lo, hi, spread = price_range(pos["ticker"], pos["open_time"])
            if pos["direction"] == "BUY":       # closes on the bid
                if pos["sl"] and lo <= pos["sl"]:
                    self._realize(pos, pos["sl"], pos["lots"], now, "sl")
                elif pos["tp"] and hi >= pos["tp"]:
                    self._realize(pos, pos["tp"], pos["lots"], now, "tp")
                else:
                    continue
            else:                                # closes on the ask
                if pos["sl"] and hi + spread >= pos["sl"]:
                    self._realize(pos, pos["sl"], pos["lots"], now, "sl")
                elif pos["tp"] and lo + spread <= pos["tp"]:
                    self._realize(pos, pos["tp"], pos["lots"], now, "tp")
                else:
                    continue
            changed = True
        if changed:
            self._save_state()

    # ── Persistence ──

    @staticmethod
    def _resolve_state_path(cfg: Dict[str, Any]) -> Optional[Path]:
        if not cfg.get("persist", True):
            return None
        if cfg.get("state_file"):
            return Path(cfg["state_file"]).expanduser()
        return app_paths.app_data_dir() / "sim_paper_account.json"

    def _save_state(self) -> None:
        if self._state_path is None:
            return
        state = {
            "version": 1, "seed": self._seed, "balance": self._balance,
            "next_ticket": self._next_ticket, "last_check": self._last_check,
            "positions": list(self._positions.values()), "pending": list(self._pending.values()),
            "history": self._history[-2000:],
        }
        try:
            self._state_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._state_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(state, indent=1), encoding="utf-8")
            os.replace(tmp, self._state_path)
        except OSError as e:
            log.warning(f"Could not save paper account to {self._state_path}: {e}")

    def _load_state(self) -> None:
        if self._state_path is None or not self._state_path.exists():
            return
        try:
            state = json.loads(self._state_path.read_text(encoding="utf-8"))
            self._balance = float(state.get("balance", self._initial_balance))
            self._next_ticket = int(state.get("next_ticket", self._next_ticket))
            self._last_check = state.get("last_check")
            self._positions = {int(p["ticket"]): p for p in state.get("positions", [])}
            self._pending = {int(o["ticket"]): o for o in state.get("pending", [])}
            self._history = list(state.get("history", []))
            log.info(f"Paper account restored: balance {self._balance:,.2f} USD, "
                     f"{len(self._positions)} positions, {len(self._pending)} pending orders")
        except (OSError, ValueError, KeyError, TypeError) as e:
            log.warning(f"Ignoring unreadable paper account file {self._state_path}: {e}")

    def reset_account(self) -> None:
        """Start the paper account over: the starting balance, no positions,
        no pending orders, no history. Ticket numbers keep counting up."""
        with self._lock:
            self._balance = self._initial_balance
            self._positions.clear()
            self._pending.clear()
            self._history = []
            self._last_check = None
            self._save_state()
        log.info(f"Paper account reset to {self._initial_balance:,.2f} USD")
