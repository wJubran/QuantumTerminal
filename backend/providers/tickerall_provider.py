"""
================================================================================
Quantum Terminal — TickerAll Provider
================================================================================
A data + execution provider backed by the hosted TickerAll API
(https://tickerall.com) instead of a local MetaTrader 5 terminal.

Why this exists
---------------
The MT5 provider talks to a local terminal over MetaTrader5's single-threaded
IPC bridge. Two consequences the data_server works around today:

  * `get_latest_ticks()` does one blocking `symbol_info_tick()` call PER symbol
    (~5 ms each), so the tick loop hits a wall around 5-7 fps at universe=20
    (see data_server.py v9 notes), and a separate "focus loop" exists to
    fast-poll a single symbol.
  * The MT5 IPC channel is not thread-safe, hence the `help wanted` thread
    safety issue.

This provider keeps a live WebSocket open to TickerAll on a background thread.
Ticks are pushed and cached in memory, so `get_latest_ticks()` becomes an O(1)
dict read with no network call and no IPC — the per-symbol polling wall
disappears, and there is no shared MT5 handle to make thread-unsafe.

It implements the SAME BaseProvider contract as MT5Provider and returns the
SAME model field shapes, so it is a drop-in alternative selected by config
(or the TICKERALL_API_KEY env var) — the MT5 provider is left fully intact.

Capabilities & limits (honest, at the public-API surface)
---------------------------------------------------------
  * Ticks, bars, account snapshot, open positions, market/limit/stop orders,
    position close, SL/TP modify — all supported.
  * Account `equity` is computed as balance + floating P/L (TickerAll's account
    snapshot exposes balance + leverage; margin figures are not surfaced, so
    `margin_free` mirrors equity as a best effort).
  * Pending-order LISTING / cancel / pending-modify are not exposed by the
    TickerAll API, so `get_pending_orders()` returns [] and cancel/modify-order
    report unsupported. (Placing a pending order still works.)

Requires the `tickerall` package: `pip install tickerall`.
================================================================================
"""

from __future__ import annotations

import logging
import math
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from models import (
    AccountInfo, BarData, OrderRequest, OrderResult, PendingOrder, Position,
    SymbolInfo, TickData,
)
from providers.base_provider import BaseProvider

log = logging.getLogger("tickerall_provider")

# Minutes per timeframe — used to convert a bar `count` into the `hours` of
# look-back the TickerAll candles endpoint expects.
_TF_MINUTES = {
    "M1": 1, "M5": 5, "M15": 15, "M30": 30,
    "H1": 60, "H4": 240, "D1": 1440, "W1": 10080, "MN1": 43200,
}
_TF_SUPPORTED = list(_TF_MINUTES.keys())

# Look-backs at or under this many hours are served from the hosted resident
# bar store (fast, but sparse for fine timeframes right after connect); deeper
# windows run the full broker history walk. Kept ~in sync with the API; only
# used to decide when to widen a sparse fetch, so an exact match isn't required.
_DEEP_HISTORY_HOURS = 168

# Candidate broker-symbol suffixes Exness-style feeds use, tried during fuzzy
# resolution (canonical "BTCUSD" → "BTCUSDm", "XAUUSD" → "XAUUSDm", …).
_SYMBOL_SUFFIXES = ("", "m", "z", ".cash", "c", "_i", "i")


def tickerall_account_from_env() -> Optional[Dict[str, Any]]:
    """Build a TickerAll provider account-config dict from environment
    variables, or return None when TICKERALL_API_KEY is not set.

    Env vars:
        TICKERALL_API_KEY   (required — the opt-in switch)
        TICKERALL_BROKER    (default "mt5")
        TICKERALL_SERVER    (e.g. "Exness-MT5Trial7")
        TICKERALL_ACCOUNT   (the numeric broker login)
        TICKERALL_PASSWORD  (the broker password)
        TICKERALL_LABEL     (optional display label)
        TICKERALL_BASE_URL  (optional; override the REST base URL)
        TICKERALL_STREAM_URL(optional; override the WS URL)
        TICKERALL_ACCOUNT_ID(optional; reuse an already-connected account id
                             instead of starting a new session)
    """
    api_key = os.environ.get("TICKERALL_API_KEY", "").strip()
    if not api_key:
        return None
    cfg: Dict[str, Any] = {
        "id": "tickerall_default",
        "type": "tickerall",
        "label": os.environ.get("TICKERALL_LABEL", "TickerAll (hosted MT5)"),
        "enabled": True,
        "api_key": api_key,
        "broker": os.environ.get("TICKERALL_BROKER", "mt5"),
        "server": os.environ.get("TICKERALL_SERVER", ""),
        "account": os.environ.get("TICKERALL_ACCOUNT", ""),
        "password": os.environ.get("TICKERALL_PASSWORD", ""),
    }
    for env_key, cfg_key in (
        ("TICKERALL_BASE_URL", "base_url"),
        ("TICKERALL_STREAM_URL", "stream_url"),
        ("TICKERALL_ACCOUNT_ID", "account_id"),
    ):
        val = os.environ.get(env_key, "").strip()
        if val:
            cfg[cfg_key] = val
    return cfg


def _norm(sym: str) -> str:
    """Normalize a symbol for fuzzy matching: uppercase, strip non-alphanumeric."""
    return re.sub(r"[^A-Z0-9]", "", (sym or "").upper())


class TickerAllProvider(BaseProvider):
    """Hosted-MT5 data + execution provider over the TickerAll API."""

    def __init__(self, account_config: Dict[str, Any]):
        self._cfg = account_config or {}
        self._id = self._cfg.get("id", "tickerall_default")
        self._label_str = self._cfg.get("label", "TickerAll (hosted MT5)")
        self._api_key = self._cfg.get("api_key", "")
        self._broker = self._cfg.get("broker", "mt5")
        self._server = self._cfg.get("server", "")
        self._account = self._cfg.get("account", "")
        self._password = self._cfg.get("password", "")
        self._base_url = self._cfg.get("base_url")
        self._stream_url = self._cfg.get("stream_url")
        self._preset_account_id = self._cfg.get("account_id")
        # canonical -> [aliases]; merged defaults + per-account, supplied by
        # ConfigManager.init_providers (same as the MT5 provider receives).
        self._aliases: Dict[str, List[str]] = self._cfg.get("aliases", {}) or {}

        self._client: Any = None
        self._stream: Any = None
        self._account_id: Optional[str] = None
        self._connected = False

        # Live, WS-fed tick cache: canonical ticker -> TickData. Read by
        # get_latest_ticks() with no network call.
        self._ticks: Dict[str, TickData] = {}
        self._ticks_lock = threading.Lock()

        # Symbol resolution maps.
        self._broker_symbols: List[str] = []
        self._broker_norm: Dict[str, str] = {}   # normalized -> broker symbol
        self._symbol_map: Dict[str, str] = {}     # canonical -> broker symbol
        self._reverse_map: Dict[str, str] = {}    # broker symbol -> canonical
        self._subscribed: set = set()             # broker symbols subscribed on the stream
        # Live open-positions cache, kept current by the WS position stream
        # (seeded + periodically re-seeded by REST) so get_positions() doesn't
        # block on a ~5s accounts.get per poll.
        self._positions_lock = threading.Lock()
        self._positions_cache: Dict[str, Any] = {}   # ticket -> SDK Position
        self._positions_seeded = False
        self._reseed_stop: Optional[threading.Event] = None
        self._reseed_thread: Optional[threading.Thread] = None
        self._broker_symbol_lookup = None         # Settings-panel override callable (v2 parity)
        self._resolved_symbols: List[str] = []    # canonical names resolved via resolve_universe

        self._last_bar_times: Dict[str, int] = {}

    # ── Identity ──

    @property
    def provider_type(self) -> str:
        return "tickerall"

    @property
    def provider_id(self) -> str:
        return self._id

    @property
    def label(self) -> str:
        return self._label_str

    # ── Capabilities ──

    @property
    def can_execute(self) -> bool:
        return True

    @property
    def supported_timeframes(self) -> List[str]:
        return list(_TF_SUPPORTED)

    # ── Connection lifecycle ──

    @property
    def connected(self) -> bool:
        return self._connected

    def connect(self) -> bool:
        if self._connected:
            return True
        try:
            from tickerall import Tickerall
        except ImportError:
            log.error("tickerall package not installed — run `pip install tickerall`")
            return False

        try:
            kwargs: Dict[str, Any] = {"api_key": self._api_key}
            if self._base_url:
                kwargs["base_url"] = self._base_url
            if self._stream_url:
                kwargs["stream_url"] = self._stream_url
            self._client = Tickerall(**kwargs)

            # Reuse a pre-connected account if given; otherwise start a session
            # and keep it alive (auto re-arm across TickerAll restarts).
            if self._preset_account_id:
                self._account_id = self._preset_account_id
            else:
                result = self._client.sessions.keep_alive(
                    broker=self._broker,
                    server=self._server,
                    account=self._account,
                    password=self._password,
                )
                self._account_id = result.account_id
                log.info(f"TickerAll session started: account_id={self._account_id} "
                         f"demo={result.is_demo}")

            # Build the broker-symbol index for resolution.
            try:
                self._broker_symbols = self._client.accounts.symbols(self._account_id)
                self._broker_norm = {_norm(s): s for s in self._broker_symbols}
                log.info(f"TickerAll: {len(self._broker_symbols)} tradeable symbols")
            except Exception as e:
                log.warning(f"TickerAll: symbol list fetch failed ({e}); "
                            f"fuzzy resolution will fall back to suffix guessing")

            # Open the live stream and wire ticks into the cache.
            self._stream = self._client.stream.connect()
            self._stream.on("tick", self._on_tick)
            # Real-time open positions: subscribe to the broker's position deltas
            # and keep a live cache so get_positions() / the /api/positions poll
            # serve instantly instead of blocking on a ~5s accounts.get.
            try:
                self._stream.on("position", self._on_position_update)
                self._stream.on("reconnect", self._on_stream_reconnect)
                self._stream.subscribe_positions(self._account_id)
                self._start_positions_reseed()   # seeds immediately in the bg
            except Exception as e:
                log.warning(f"TickerAll: live positions unavailable ({e}); "
                            f"get_positions() falls back to per-request fetch")
            self._connected = True
            log.info(f"TickerAll provider connected: {self._label_str}")
            return True
        except Exception as e:
            log.error(f"TickerAll connect failed: {e}")
            self._safe_teardown()
            return False

    def disconnect(self) -> None:
        self._stop_positions_reseed()
        self._safe_teardown()
        self._connected = False
        with self._ticks_lock:
            self._ticks.clear()
        with self._positions_lock:
            self._positions_cache.clear()
            self._positions_seeded = False
        self._symbol_map.clear()
        self._reverse_map.clear()
        self._subscribed.clear()
        log.info("TickerAll provider disconnected")

    def heartbeat(self) -> bool:
        if not self._connected:
            return False
        # The stream silently self-heals; treat a live (or reconnecting) stream
        # as healthy. Only a hard-closed stream counts as down.
        try:
            if self._stream is not None and self._stream.get_state() == "closed":
                self._connected = False
                return False
        except Exception:
            pass
        return True

    def _safe_teardown(self) -> None:
        try:
            if self._stream is not None:
                self._stream.close()
        except Exception:
            pass
        try:
            if self._client is not None and self._account_id and not self._preset_account_id:
                self._client.sessions.end(self._account_id)
        except Exception:
            pass
        try:
            if self._client is not None:
                self._client.close()
        except Exception:
            pass
        self._stream = None
        self._client = None

    # ── Stream callback ──

    def _on_tick(self, ev: Any) -> None:
        """WS tick handler — runs on the stream's background thread. Maps the
        broker symbol back to canonical and updates the cache. O(1)."""
        canonical = self._reverse_map.get(ev.symbol, ev.symbol)
        spread = round(ev.ask - ev.bid, 8)
        tick = TickData(
            ticker=canonical,
            symbol=ev.symbol,
            bid=ev.bid,
            ask=ev.ask,
            last=ev.bid,  # TickerAll streams bid/ask; last mirrors bid
            spread=spread,
            time=ev.timestamp,
        )
        with self._ticks_lock:
            self._ticks[canonical] = tick

    # ── Symbol resolution ──

    def set_broker_symbol_lookup(self, fn) -> None:
        """Parity with MT5Provider: a callable(canonical)->Optional[str] for
        user-configured broker-symbol overrides (Settings panel)."""
        self._broker_symbol_lookup = fn

    def resolve_symbol(self, canonical: str) -> Optional[str]:
        if not self._connected:
            return None
        canonical = (canonical or "").upper()

        # (0) user override from Settings, if present and valid.
        if self._broker_symbol_lookup is not None:
            try:
                override = self._broker_symbol_lookup(canonical)
            except Exception:
                override = None
            if override and (not self._broker_norm or _norm(override) in self._broker_norm):
                broker = self._broker_norm.get(_norm(override), override)
                self._symbol_map[canonical] = broker
                self._reverse_map[broker] = canonical
                return broker

        # (1) cache.
        if canonical in self._symbol_map:
            return self._symbol_map[canonical]

        broker = self._match_broker_symbol(canonical)
        if broker:
            self._symbol_map[canonical] = broker
            self._reverse_map[broker] = canonical
        return broker

    def _match_broker_symbol(self, canonical: str) -> Optional[str]:
        # If we have no broker list (fetch failed), guess with the suffixes.
        if not self._broker_norm:
            return f"{canonical}m"  # most common Exness form; best-effort

        # (2) configured aliases.
        for alias in self._aliases.get(canonical, []):
            hit = self._broker_norm.get(_norm(alias))
            if hit:
                return hit

        # (3) exact normalized match.
        hit = self._broker_norm.get(_norm(canonical))
        if hit:
            return hit

        # (4) suffix variants (BTCUSD -> BTCUSDm, etc.).
        for suf in _SYMBOL_SUFFIXES:
            hit = self._broker_norm.get(_norm(canonical + suf))
            if hit:
                return hit

        # (5) prefix match — first broker symbol whose normalized form starts
        # with the canonical (e.g. "EURUSD" -> "EURUSDm").
        ncanon = _norm(canonical)
        for nbroker, broker in self._broker_norm.items():
            if nbroker.startswith(ncanon):
                return broker
        return None

    def resolve_universe(self, universe: List[str]) -> List[str]:
        """Resolve a full universe of canonical tickers to broker symbols,
        populating the internal maps. Returns the canonical names that resolved
        (mirrors MT5Provider — data_server calls this right after connect)."""
        self._symbol_map.clear()
        self._reverse_map.clear()
        self._resolved_symbols.clear()
        for canonical in universe:
            broker_name = self.resolve_symbol(canonical)
            if broker_name is not None:
                self._resolved_symbols.append(canonical.upper())
        log.info(f"TickerAll resolved {len(self._resolved_symbols)}/{len(universe)} symbols")
        return list(self._resolved_symbols)

    def reset_symbol(self, canonical: str) -> Optional[str]:
        """Evict a ticker's cached mapping and re-resolve (Settings-panel
        broker-symbol override changed). Mirrors MT5Provider."""
        canonical = (canonical or "").upper()
        old = self._symbol_map.pop(canonical, None)
        if old is not None:
            self._reverse_map.pop(old, None)
            for k in list(self._last_bar_times.keys()):
                if k.startswith(canonical + "_"):
                    self._last_bar_times.pop(k, None)
        return self.resolve_symbol(canonical)

    def get_available_symbols(self) -> List[str]:
        """Canonical names successfully resolved (after resolve_universe).
        Mirrors MT5Provider; falls back to the broker symbol list before any
        universe has been resolved."""
        return list(self._resolved_symbols) or list(self._broker_symbols)

    def _broker_symbol(self, canonical: str) -> str:
        return self.resolve_symbol(canonical) or f"{canonical}m"

    def _ensure_subscribed(self, broker_symbols: List[str]) -> None:
        fresh = [s for s in broker_symbols if s and s not in self._subscribed]
        if not fresh or self._stream is None or self._account_id is None:
            return
        try:
            self._stream.subscribe_ticks(self._account_id, fresh)
            self._subscribed.update(fresh)
        except Exception as e:
            log.warning(f"TickerAll subscribe failed for {fresh}: {e}")

    # ── Market data ──

    def get_latest_ticks(self, symbols: List[str]) -> Dict[str, TickData]:
        """O(1) read from the WS-fed cache. Subscribes any not-yet-seen symbol
        so subsequent calls return live data (the broker pushes the first tick
        right after subscribe)."""
        if not self._connected:
            return {}
        # Make sure all requested symbols are subscribed on the stream.
        brokers = [self._broker_symbol(s) for s in symbols]
        self._ensure_subscribed(brokers)
        out: Dict[str, TickData] = {}
        with self._ticks_lock:
            for canonical in symbols:
                t = self._ticks.get(canonical.upper()) or self._ticks.get(canonical)
                if t is not None:
                    out[canonical] = t
        return out

    def _fetch_candles(self, broker_sym: str, hours: int, tf: str) -> List[Any]:
        try:
            return self._client.candles.get(
                self._account_id, symbol=broker_sym, hours=hours, timeframe=tf
            )
        except Exception as e:
            log.warning(f"TickerAll candles.get({broker_sym},{tf},{hours}h) failed: {e}")
            return []

    def get_bars(self, ticker: str, timeframe: str = "M15", count: int = 200) -> List[BarData]:
        if not self._connected or self._account_id is None:
            return []
        tf = timeframe if timeframe in _TF_MINUTES else "M15"
        broker_sym = self._broker_symbol(ticker)
        hours = self._count_to_hours(count, tf)
        candles = self._fetch_candles(broker_sym, hours, tf)
        # A look-back within the recent window is served from the resident bar
        # store, which can be sparse for fine timeframes right after connect.
        # If it returned fewer bars than asked, retry with a window that crosses
        # into the full broker history walk so `count` bars are reliably served.
        if len(candles) < count and hours <= _DEEP_HISTORY_HOURS:
            candles = self._fetch_candles(broker_sym, _DEEP_HISTORY_HOURS + 1, tf)
        bars = [self._candle_to_bar(c, ticker, tf) for c in candles]
        return bars[-count:] if count and len(bars) > count else bars

    def get_bars_range(self, ticker, timeframe, from_dt, to_dt) -> List[BarData]:
        if not self._connected or self._account_id is None:
            return []
        tf = timeframe if timeframe in _TF_MINUTES else "M15"
        broker_sym = self._broker_symbol(ticker)
        if from_dt.tzinfo is None:
            from_dt = from_dt.replace(tzinfo=timezone.utc)
        if to_dt.tzinfo is None:
            to_dt = to_dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        hours = max(1, math.ceil((now - from_dt).total_seconds() / 3600.0))
        candles = self._fetch_candles(broker_sym, hours, tf)
        # Same resident-store sparsity as get_bars: if a recent-window range
        # came back near-empty, widen to the full broker walk (which still
        # covers the requested range) before filtering.
        expected = (to_dt.timestamp() - from_dt.timestamp()) / 60.0 / _TF_MINUTES.get(tf, 15)
        if len(candles) < max(2, expected * 0.5) and hours <= _DEEP_HISTORY_HOURS:
            candles = self._fetch_candles(broker_sym, _DEEP_HISTORY_HOURS + 1, tf)
        lo, hi = int(from_dt.timestamp()), int(to_dt.timestamp())
        return [
            self._candle_to_bar(c, ticker, tf)
            for c in candles
            if lo <= c.timestamp <= hi
        ]

    def check_new_bars(self, symbols: List[str], timeframe: str = "M15") -> List[dict]:
        if not self._connected:
            return []
        tf = timeframe if timeframe in _TF_MINUTES else "M15"
        new_bars: List[dict] = []
        for canonical in symbols:
            bars = self.get_bars(canonical, tf, count=2)
            if len(bars) < 2:
                continue
            closed = bars[-2]  # second-to-last = most recently CLOSED bar
            bar_epoch = _epoch_of(closed.time)
            cache_key = f"{canonical}_{tf}"
            prev = self._last_bar_times.get(cache_key)
            if prev is not None and bar_epoch > prev:
                new_bars.append({
                    "type": "bar",
                    "ticker": canonical,
                    "timeframe": tf,
                    "bar": closed.to_dict(),
                })
            self._last_bar_times[cache_key] = bar_epoch
        return new_bars

    def _cached_symbol_specs(self):
        """Symbol specs are static per session — fetch the full list once and
        cache it (keyed by account_id). Without this, the per-symbol
        /api/symbol-info polling refetches the ENTIRE specs list every call,
        which is the bulk of the 'polling is horrible' load."""
        cache = getattr(self, "_specs_cache", None)
        if cache is not None and cache[0] == self._account_id:
            return cache[1]
        specs = self._client.accounts.symbol_specs(self._account_id)
        self._specs_cache = (self._account_id, specs)
        return specs

    def get_symbol_info(self, ticker: str) -> Optional[SymbolInfo]:
        if not self._connected or self._account_id is None:
            return None
        broker_sym = self._broker_symbol(ticker)
        spec = None
        try:
            specs = self._cached_symbol_specs()
            nbroker = _norm(broker_sym)
            for s in specs:
                if _norm(s.name) == nbroker:
                    spec = s
                    break
        except Exception as e:
            log.warning(f"TickerAll symbol_specs failed: {e}")
        if spec is None:
            # Minimal info so callers still get a broker-symbol mapping.
            return SymbolInfo(ticker=ticker, broker_symbol=broker_sym, symbol=broker_sym)
        # tradeMode: 0=DISABLED, 3=CLOSEONLY; anything else allows opens.
        trade_allowed = spec.trade_mode is None or spec.trade_mode not in (0, 3)
        return SymbolInfo(
            ticker=ticker,
            symbol=broker_sym,
            broker_symbol=broker_sym,
            min_lot=spec.volume_min,
            max_lot=spec.volume_max,
            lot_step=spec.volume_step,
            volume_min=spec.volume_min,
            volume_max=spec.volume_max,
            volume_step=spec.volume_step,
            trade_allowed=trade_allowed,
            trade_mode=spec.trade_mode or 0,
            # Risk/exposure inputs surfaced by the SDK (>= 0.1.5). Left at the
            # SymbolInfo defaults (tick_value/tick_size = 0 -> "unknown") when the
            # broker record didn't yield them, so the UI shows no exposure rather
            # than a wrong value derived from a forex-default contract size.
            point=spec.point if getattr(spec, "point", None) is not None else 0.0,
            digits=spec.digits if getattr(spec, "digits", None) is not None else 5,
            tick_size=spec.tick_size if getattr(spec, "tick_size", None) is not None else 0.0,
            tick_value=spec.tick_value if getattr(spec, "tick_value", None) is not None else 0.0,
            trade_contract_size=(spec.contract_size if getattr(spec, "contract_size", None) is not None else 100000.0),
            description=ticker,
        )

    # ── Period P&L ──

    def get_period_pnl(self, equity: float = 0.0) -> Optional[dict]:
        """Closed-trade P&L by period (today / yesterday / this_week /
        last_week / this_month / last_month) — the hosted-provider equivalent
        of AccountManager.get_period_pnl()'s MetaTrader5 history_deals_get path
        (which is a no-op off a local terminal).

        The /history feed returns each session-closed trade TWICE (a live close
        with close_ticket=None plus the broker deal-log entry with close_ticket
        set), so we dedup by position ticket and prefer the deal-log entry
        (authoritative profit). Cached ~20s so the polled endpoint never
        re-fetches history on every call."""
        import time as _time
        from datetime import datetime, timedelta
        if not self._connected or self._account_id is None:
            return None
        cached = getattr(self, "_period_pnl_cache", None)
        if cached is not None and (_time.time() - cached[0]) < 20.0:
            return cached[1]
        try:
            trades = self._client.history.get(self._account_id, limit=500, wait_ms=0)
        except Exception as e:
            log.warning(f"TickerAll period P&L history fetch failed: {e}")
            return None
        # Dedup by position ticket; prefer the deal-log entry (close_ticket set).
        best = {}
        for t in trades:
            prev = best.get(t.ticket)
            if prev is None or (t.close_ticket is not None and prev.close_ticket is None):
                best[t.ticket] = t
        deduped = list(best.values())

        def _close_epoch(ts):
            try:
                return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
            except Exception:
                return None

        now = datetime.now()
        today_start = datetime(now.year, now.month, now.day)
        yesterday_start = today_start - timedelta(days=1)
        this_week_start = today_start - timedelta(days=now.weekday())
        last_week_start = this_week_start - timedelta(days=7)
        this_month_start = datetime(now.year, now.month, 1)
        last_month_start = (datetime(now.year - 1, 12, 1) if now.month == 1
                            else datetime(now.year, now.month - 1, 1))
        end_cap = now + timedelta(hours=1)

        def _sum(dt_from, dt_to):
            ts_from, ts_to = dt_from.timestamp(), dt_to.timestamp()
            total, count = 0.0, 0
            for t in deduped:
                cts = _close_epoch(t.close_time)
                if cts is not None and ts_from <= cts < ts_to:
                    total += (t.profit or 0.0) + (t.swap or 0.0) + (t.commission or 0.0)
                    count += 1
            return round(total, 2), count

        eq = equity if (equity and equity > 0) else 0.0

        def _pct(p):
            return round(p / eq * 100, 2) if eq > 0 else 0

        periods = {
            "today": _sum(today_start, end_cap),
            "yesterday": _sum(yesterday_start, today_start),
            "this_week": _sum(this_week_start, end_cap),
            "last_week": _sum(last_week_start, this_week_start),
            "this_month": _sum(this_month_start, end_cap),
            "last_month": _sum(last_month_start, this_month_start),
        }
        result = {k: {"pnl": v[0], "trades": v[1], "pct": _pct(v[0])}
                  for k, v in periods.items()}
        result["source"] = "tickerall_history"
        result["deals_scanned"] = len(deduped)
        self._period_pnl_cache = (_time.time(), result)
        return result

    # ── Account ──

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self._connected or self._account_id is None:
            return None
        try:
            detail = self._client.accounts.get(self._account_id)
        except Exception as e:
            log.warning(f"TickerAll get_account_info failed: {e}")
            return None
        acct = detail.account
        balance = float(acct.balance) if acct else 0.0
        leverage = int(acct.leverage) if acct else 0
        # Prefer the broker's real figures — the API surfaces equity/margin/
        # freeMargin/currency and the SDK now parses them. Fall back to a
        # balance+floating estimate for older SDKs that drop those fields.
        floating = sum((p.profit or 0.0) for p in detail.positions)
        equity = float(acct.equity) if acct and getattr(acct, "equity", None) is not None else balance + floating
        used_margin = float(acct.margin) if acct and getattr(acct, "margin", None) is not None else 0.0
        free_m = float(acct.free_margin) if acct and getattr(acct, "free_margin", None) is not None else equity
        ccy = (getattr(acct, "currency", None) if acct else None) or "USD"
        return AccountInfo(
            provider_type="tickerall",
            account_id=str(detail.account_number or self._account_id),
            label=self._label_str,
            broker=(acct.broker_name if acct and acct.broker_name else "TickerAll"),
            server=detail.server,
            currency=ccy,
            balance=balance,
            equity=equity,
            margin=used_margin,
            free_margin=free_m,
            margin_free=free_m,
            leverage=leverage,
            connected=True,
        )

    # ── Execution ──

    def place_order(self, order: OrderRequest) -> OrderResult:
        if not self._connected or self._account_id is None:
            return OrderResult(success=False, error="TickerAll not connected")
        ticker = getattr(order, "ticker", None) or getattr(order, "symbol", "")
        direction = (getattr(order, "direction", "") or "").upper()
        order_type = (getattr(order, "order_type", "MARKET") or "MARKET").upper()
        lots = float(getattr(order, "lots", None) or getattr(order, "volume", 0) or 0)
        price = getattr(order, "price", None) or None
        sl = getattr(order, "stop_loss", None)
        tp = getattr(order, "take_profit", None)
        if sl in (0, 0.0):
            sl = None
        if tp in (0, 0.0):
            tp = None

        sdk_type = {"MARKET": "market", "LIMIT": "limit", "STOP": "stop"}.get(order_type)
        if sdk_type is None:
            return OrderResult(success=False, error=f"Unsupported order type: {order_type}")
        if direction not in ("BUY", "SELL"):
            return OrderResult(success=False, error=f"Unsupported direction: {direction}")

        broker_sym = self._broker_symbol(ticker)
        try:
            res = self._client.orders.place(
                self._account_id,
                type=sdk_type,
                symbol=broker_sym,
                side=direction,
                volume=lots,
                price=price,
                stop_loss=sl,
                take_profit=tp,
                comment=getattr(order, "comment", None) or "Quantum Terminal",
            )
        except Exception as e:
            return OrderResult(success=False, error=str(e))
        return OrderResult(
            success=True,
            order_id=str(res.ticket),
            ticker=ticker,
            direction=direction,
            lots=res.volume,
            price=res.price or (price or 0.0),
        )

    def _map_sdk_position(self, p: Any) -> Position:
        """Map an SDK Position (from a REST snapshot or a WS delta — same type)
        to the provider's Position model."""
        canonical = self._reverse_map.get(p.symbol, p.symbol)
        return Position(
            ticket=str(p.ticket),
            ticker=canonical,
            symbol=p.symbol,
            direction=p.side,
            lots=p.volume,
            volume=p.volume,
            open_price=p.entry_price or 0.0,
            current_price=p.current_price or 0.0,
            stop_loss=p.stop_loss if p.stop_loss else None,
            take_profit=p.take_profit if p.take_profit else None,
            profit=p.profit or 0.0,
            swap=p.swap,
            commission=p.commission,
            open_time=p.open_time or "",
            comment=p.comment,
        )

    def _on_position_update(self, ev: Any) -> None:
        """WS position delta — runs on the stream's bg thread. Upsert on
        opened/updated, remove on closed, keyed by ticket. O(1)."""
        try:
            pos = getattr(ev, "position", None)
            key = str(getattr(pos, "ticket", "") or "") if pos is not None else ""
            if not key:
                return
            with self._positions_lock:
                if getattr(ev, "event", "") == "closed":
                    self._positions_cache.pop(key, None)
                else:  # opened / updated
                    self._positions_cache[key] = pos
        except Exception as e:
            log.warning(f"TickerAll position_update handler error: {e}")

    def _on_stream_reconnect(self, *args: Any) -> None:
        """Re-seed after a stream gap so a delta missed mid-reconnect can't
        leave a phantom/stale position (the SDK auto-re-subscribes)."""
        self._seed_positions()

    def _seed_positions(self) -> None:
        """Authoritative REST snapshot -> replace the live cache, so the
        WS-delta cache can never drift (a missed 'closed' -> phantom). Runs in
        the background on connect, on reconnect, and every ~20s."""
        if self._client is None or self._account_id is None:
            return
        try:
            detail = self._client.accounts.get(self._account_id)
            snap = {str(p.ticket): p for p in (detail.positions or [])
                    if getattr(p, "ticket", None) is not None}
        except Exception as e:
            log.warning(f"TickerAll positions seed failed: {e}")
            return
        with self._positions_lock:
            self._positions_cache = snap
            self._positions_seeded = True

    def _start_positions_reseed(self) -> None:
        self._stop_positions_reseed()
        stop = threading.Event()
        self._reseed_stop = stop

        def _loop() -> None:
            self._seed_positions()                # initial seed (off the connect path)
            while not stop.wait(20.0):
                if self._connected:
                    self._seed_positions()

        th = threading.Thread(target=_loop, name="tickerall-pos-reseed", daemon=True)
        self._reseed_thread = th
        th.start()

    def _stop_positions_reseed(self) -> None:
        stop = self._reseed_stop
        if stop is not None:
            stop.set()
        self._reseed_stop = None
        self._reseed_thread = None

    def get_positions(self) -> List[Position]:
        if not self._connected or self._account_id is None:
            return []
        # Fast path: the WS position stream keeps this cache current in real
        # time (seeded + re-seeded by REST), so a poll no longer blocks on a
        # ~5s accounts.get.
        if self._positions_seeded:
            with self._positions_lock:
                cached = list(self._positions_cache.values())
            return [self._map_sdk_position(p) for p in cached]
        # Fallback (pre-seed / live positions unavailable): one REST fetch.
        try:
            detail = self._client.accounts.get(self._account_id)
        except Exception as e:
            log.warning(f"TickerAll get_positions failed: {e}")
            return []
        return [self._map_sdk_position(p) for p in detail.positions]

    def close_position(self, ticket: str, lots: Optional[float] = None) -> OrderResult:
        if not self._connected or self._account_id is None:
            return OrderResult(success=False, error="TickerAll not connected")
        try:
            res = self._client.positions.close(
                self._account_id, int(ticket), volume=lots if lots else None
            )
        except Exception as e:
            return OrderResult(success=False, error=str(e))
        canonical = None
        for cn, br in self._symbol_map.items():
            if br == res.symbol:
                canonical = cn
                break
        return OrderResult(
            success=True,
            order_id=str(res.ticket),
            ticker=canonical or res.symbol,
            direction="SELL" if res.side == "BUY" else "BUY",
            lots=res.volume,
        )

    def modify_position(self, ticket: str, stop_loss=None, take_profit=None) -> dict:
        if not self._connected or self._account_id is None:
            return {"success": False, "error": "TickerAll not connected"}
        if stop_loss is None and take_profit is None:
            return {"success": False, "error": "Provide at least one of stop_loss / take_profit"}
        try:
            res = self._client.positions.modify(
                self._account_id, int(ticket),
                stop_loss=stop_loss, take_profit=take_profit,
            )
        except Exception as e:
            return {"success": False, "error": str(e)}
        return {
            "success": True,
            "ticket": ticket,
            "stop_loss": res.stop_loss,
            "take_profit": res.take_profit,
        }

    def get_pending_orders(self) -> List[PendingOrder]:
        """List resting pending orders (LIMIT / STOP), mapped to the same shape
        the MT5 provider emits. Stop-limit variants are skipped (parity)."""
        if not self._connected or self._account_id is None:
            return []
        try:
            orders = self._client.orders.list_pending(self._account_id)
        except Exception as e:
            log.warning(f"TickerAll get_pending_orders failed: {e}")
            return []
        out: List[PendingOrder] = []
        for o in orders:
            if o.order_type not in ("LIMIT", "STOP"):
                continue  # mirror MT5 provider: skip stop-limit / other types
            canonical = self._reverse_map.get(o.symbol, o.symbol)
            out.append(PendingOrder(
                ticket=str(o.ticket),
                symbol=o.symbol,
                ticker=canonical,
                direction=o.side,
                order_type=o.order_type,
                lots=o.volume,
                price=o.price,
                stop_loss=o.stop_loss if o.stop_loss else None,
                take_profit=o.take_profit if o.take_profit else None,
                comment="",
                time_setup=o.set_time,
            ))
        return out

    def cancel_order(self, ticket: str) -> OrderResult:
        """Cancel a resting pending order by ticket."""
        if not self._connected or self._account_id is None:
            return OrderResult(success=False, error="TickerAll not connected")
        try:
            res = self._client.orders.cancel_pending(self._account_id, int(ticket))
        except Exception as e:
            return OrderResult(success=False, error=str(e))
        return OrderResult(success=True, order_id=int(res.ticket))

    def modify_order(
        self, ticket: str,
        price: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> OrderResult:
        """Modify a resting pending order's trigger price / SL / TP. Fields left
        None are preserved at their current value (broker-side)."""
        if not self._connected or self._account_id is None:
            return OrderResult(success=False, error="TickerAll not connected")
        try:
            res = self._client.orders.modify_pending(
                self._account_id, int(ticket),
                price=price, stop_loss=stop_loss, take_profit=take_profit,
            )
        except Exception as e:
            return OrderResult(success=False, error=str(e))
        return OrderResult(success=True, order_id=int(res.ticket))

    # ── Helpers ──

    @staticmethod
    def _count_to_hours(count: int, timeframe: str) -> int:
        minutes = _TF_MINUTES.get(timeframe, 15)
        # +1 bar of slack, rounded up to whole hours, never less than 1.
        return max(1, math.ceil(((count + 1) * minutes) / 60.0))

    @staticmethod
    def _candle_to_bar(c: Any, ticker: str, timeframe: str) -> BarData:
        return BarData(
            ticker=ticker,
            timeframe=timeframe,
            time=datetime.fromtimestamp(c.timestamp, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            open=c.open,
            high=c.high,
            low=c.low,
            close=c.close,
            volume=0,
        )


def _epoch_of(time_str: str) -> int:
    """Parse an ISO-ish '%Y-%m-%dT%H:%M:%S' (UTC) bar time string to epoch."""
    try:
        dt = datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return 0
