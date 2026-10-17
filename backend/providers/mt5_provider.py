# version: v6
"""
================================================================================
Quantum Terminal — MetaTrader 5 Provider

v6 — Auto-link broker symbol via fuzzy match. Brokers wrap canonical names
     in arbitrary suffixes / case variants — XAUUSD might be stored as
     `xauusd`, `XAUUSD.x`, `XAUUSD.cash`, `XAUUSDi`, `XAUUSD!`, `XAUUSD-cfd`
     etc.; common-name swaps like USTEC ↔ NAS100 / US100, US30 ↔ DOW are
     also widespread. Previously these required manual entry in Settings →
     Custom Tickers → broker_symbol. Now `resolve_symbol()` enumerates the
     broker's symbol catalog (`mt5.symbols_get()`), normalizes each name
     (lowercased, alphanumeric-only), and matches against the canonical
     plus a known-alias list. First hit wins, gets cached, logs an INFO
     line so the operator can see the auto-link. User overrides from
     Settings still take precedence.

v2 — Added broker-symbol override hook. set_broker_symbol_lookup(fn) lets
     the ConfigManager wire a runtime lookup for user-configured overrides
     (Settings panel → custom_tickers[X].broker_symbol). resolve_symbol()
     checks the override FIRST before the canonical / alias chain. New
     reset_symbol(canonical) method evicts a ticker's cached mapping so the
     next resolve picks up a changed override without requiring a restart.
================================================================================
================================================================================
Implements BaseProvider for MetaTrader 5.

This is the refactored MT5Adapter from data_server.py. Same proven logic:
    - Symbol alias resolution (XAUUSD → GOLD, GER40 → DE40, etc.)
    - Tick polling, bar fetching, new bar detection
    - Synchronous API wrapped by callers in asyncio.to_thread()

New in provider version:
    - Implements BaseProvider interface (swappable)
    - Account info reporting
    - Execution methods (place_order, get_positions, close_position)
    - Symbol info extraction from MT5 symbol_info()
    - Reads config from account dict, not ServerConfig

Usage:
    from providers.mt5_provider import MT5Provider

    provider = MT5Provider({
        "id": "mt5_primary",
        "label": "MT5 — CFI (Live)",
        "terminal_path": None,  # auto-detect
        "aliases": { "GER40": ["GER40", "DE40", "DAX40"] },
    })
    provider.connect()
    ticks = provider.get_latest_ticks(["XAUUSD", "EURUSD"])
================================================================================
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from models import (
    TickData, BarData, AccountInfo, SymbolInfo,
    OrderRequest, OrderResult, Position, PendingOrder,
)
from providers.base_provider import BaseProvider

log = logging.getLogger("provider.mt5")

# ── MT5 through the thread-safe proxy (mt5 is None if not installed —
#    provider works in degraded mode). Every mt5.* call below is serialized
#    with the tick/bar loops and routes running in other threads. ──
from mt5_safe import mt5, MT5_AVAILABLE

# ── MT5 timeframe constants ──
MT5_TIMEFRAMES = {
    "M1":  1,
    "M5":  5,
    "M15": 15,
    "M30": 30,
    "H1":  16385,
    "H4":  16388,
    "D1":  16408,
    "W1":  32769,
}

# ── MT5 order type mapping ──
MT5_ORDER_TYPES = {
    "MARKET_BUY":  None,   # Populated after mt5 import check
    "MARKET_SELL": None,
    "LIMIT_BUY":   None,
    "LIMIT_SELL":  None,
    "STOP_BUY":    None,
    "STOP_SELL":   None,
}

if MT5_AVAILABLE:
    MT5_ORDER_TYPES.update({
        "MARKET_BUY":  mt5.ORDER_TYPE_BUY,
        "MARKET_SELL": mt5.ORDER_TYPE_SELL,
        "LIMIT_BUY":   mt5.ORDER_TYPE_BUY_LIMIT,
        "LIMIT_SELL":  mt5.ORDER_TYPE_SELL_LIMIT,
        "STOP_BUY":    mt5.ORDER_TYPE_BUY_STOP,
        "STOP_SELL":   mt5.ORDER_TYPE_SELL_STOP,
    })


# v6: known-alias table for the auto-link fuzzy match. When a canonical
#   ticker's exact name isn't found at the broker, resolve_symbol() will
#   look for any of these names too, in addition to fuzzy-normalizing both
#   sides (lowercased, alphanumeric-only) so suffix/case quirks
#   (XAUUSD.x, XAUUSDi, xauusd, XAUUSD-cfd, etc.) auto-resolve.
#   Keep entries CASE-INSENSITIVE — they're normalized on lookup. The
#   canonical itself doesn't need to be repeated here.
KNOWN_ALIASES: Dict[str, List[str]] = {
    "US500":   ["SPX500", "SP500", "USA500", "ES500", "WS500", "S&P500", "USA500IDX"],
    "USTEC":   ["NAS100", "US100", "USTECH100", "USTEC100", "NDX", "NQ100", "NAS100IDX"],
    "US30":    ["DOW",    "DJ30",  "WS30",     "INDU",     "DJ30IDX", "US30Cash"],
    "GER40":   ["DE40",   "GER30", "DAX",      "DAX40",    "DE30",    "GER30Cash"],
    "UK100":   ["FTSE100", "FTSE", "UK100Cash"],
    "JP225":   ["NIK225", "NIKKEI", "NIKKEI225", "JP225Cash"],
    "FRA40":   ["CAC40", "CAC"],
    "ESP35":   ["IBEX35", "IBEX"],
    "AUS200":  ["ASX200", "AU200"],
    "HK50":    ["HKG33", "HKG50", "HSI"],
    "XAUUSD":  ["GOLD",   "XAU",   "XAUUSDX"],
    "XAGUSD":  ["SILVER", "XAG",   "XAGUSDX"],
    "XPTUSD":  ["PLATINUM"],
    "XPDUSD":  ["PALLADIUM"],
    "XTIUSD":  ["WTI",    "USOIL", "OIL",      "CRUDE",    "WTIUSD",  "OILUSD"],
    "BRENT":   ["UKOIL",  "BCOUSD", "BRENTUSD", "UKOIL.cash"],
    "BTCUSD":  ["BITCOIN", "BTC"],
    "ETHUSD":  ["ETHEREUM", "ETH"],
    "NATGAS":  ["NGAS",  "NATURALGAS", "GAS"],
    "COPPER":  ["XCUUSD", "HG"],
}


class MT5Provider(BaseProvider):
    """
    MetaTrader 5 data and execution provider.
    
    Config dict keys:
        id:             str  — unique provider instance ID (e.g., "mt5_primary")
        label:          str  — display name (e.g., "MT5 — CFI (Live)")
        terminal_path:  str or None — path to terminal64.exe (None = auto-detect)
        aliases:        dict — canonical → [broker_names] override map
    """

    def __init__(self, account_config: Dict[str, Any]):
        self._id = account_config.get("id", "mt5_default")
        self._label = account_config.get("label", "MetaTrader 5")
        self._terminal_path = account_config.get("terminal_path", None)
        self._aliases = account_config.get("aliases", {})
        self._connected = False

        # Symbol resolution caches
        self._symbol_map: Dict[str, str] = {}       # canonical → broker name
        self._reverse_map: Dict[str, str] = {}       # broker name → canonical
        self._resolved_symbols: List[str] = []       # canonical names that resolved
        # v6: lazy normalized index of the broker's full symbol catalog so
        #   resolve_symbol() can do an alphanumeric-only case-insensitive
        #   match. Built on first use after connect; cleared on disconnect.
        self._broker_symbols_norm: Dict[str, str] = {}   # normalized → real broker name

        # Bar tracking for check_new_bars
        self._last_bar_times: Dict[str, int] = {}    # "TICKER_TF" → epoch

        # v2: runtime broker-symbol override lookup (wired by ConfigManager).
        # Callable(canonical: str) -> Optional[str].
        self._broker_symbol_lookup = None

    # ── v6: fuzzy auto-link helpers ──

    @staticmethod
    def _normalize_symbol_name(name: str) -> str:
        """Lower-case, alphanumeric-only. So `XAUUSD.x`, `xauusd!`,
        `XAUUSD-cfd`, `xau usd` all collapse to `xauusd`."""
        if not name:
            return ""
        return "".join(ch.lower() for ch in str(name) if ch.isalnum())

    def _ensure_broker_index(self) -> None:
        """Lazy-build the normalized → real-name lookup over every symbol
        the broker exposes. Cheap (< 50ms for 1000+ symbols) and runs only
        once per connection. Cleared on disconnect / reset."""
        if self._broker_symbols_norm or not self._connected:
            return
        try:
            all_syms = mt5.symbols_get()
        except Exception as e:
            log.warning(f"[symbol auto-link] symbols_get() failed: {e}")
            return
        if not all_syms:
            return
        idx = {}
        for s in all_syms:
            try:
                key = self._normalize_symbol_name(s.name)
                if key and key not in idx:
                    idx[key] = s.name
            except Exception:
                continue
        self._broker_symbols_norm = idx
        log.info(f"[symbol auto-link] indexed {len(idx)} broker symbols")

    def _fuzzy_resolve(self, canonical: str) -> Optional[str]:
        """Match `canonical` (and KNOWN_ALIASES[canonical]) against the
        broker's full catalog with normalize-and-compare. First hit wins."""
        self._ensure_broker_index()
        if not self._broker_symbols_norm:
            return None
        candidates: List[str] = [canonical] + KNOWN_ALIASES.get(canonical.upper(), [])
        seen_keys = set()
        for c in candidates:
            key = self._normalize_symbol_name(c)
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            real = self._broker_symbols_norm.get(key)
            if real:
                return real
        return None

    # ── Identity ──

    @property
    def provider_type(self) -> str:
        return "mt5"

    @property
    def provider_id(self) -> str:
        return self._id

    @property
    def label(self) -> str:
        return self._label

    # ── Capabilities ──

    @property
    def can_execute(self) -> bool:
        return True  # MT5 supports order execution

    @property
    def supported_timeframes(self) -> List[str]:
        return list(MT5_TIMEFRAMES.keys())

    # ── Connection ──

    @property
    def connected(self) -> bool:
        return self._connected

    def connect(self) -> bool:
        """Initialize MT5 connection. Returns True on success."""
        if not MT5_AVAILABLE:
            log.warning("MetaTrader5 package not installed — provider unavailable")
            return False

        if self._connected:
            return True  # Idempotent

        init_kwargs = {}
        if self._terminal_path:
            init_kwargs["path"] = self._terminal_path
            log.info(f"MT5 terminal path: {self._terminal_path}")
        else:
            log.info("MT5 terminal path: auto-detect")

        if not mt5.initialize(**init_kwargs):
            log.error(f"MT5 initialize() failed: {mt5.last_error()}")
            return False

        info = mt5.terminal_info()
        if info is None:
            log.error("MT5 terminal_info() returned None")
            mt5.shutdown()
            return False

        self._connected = True
        log.info(
            f"MT5 connected: {info.name} | "
            f"Company: {info.company} | "
            f"Build: {info.build}"
        )
        return True

    def disconnect(self) -> None:
        """Shutdown MT5 connection."""
        if self._connected and MT5_AVAILABLE:
            mt5.shutdown()
            self._connected = False
            self._symbol_map.clear()
            self._reverse_map.clear()
            self._resolved_symbols.clear()
            self._broker_symbols_norm.clear()  # v6: drop broker-specific index on disconnect
            log.info("MT5 disconnected")

    def heartbeat(self) -> bool:
        """
        Lightweight MT5 health check.
        Calls mt5.terminal_info() — fast and read-only.
        Returns False and marks disconnected if MT5 is unresponsive.
        """
        if not self._connected or not MT5_AVAILABLE:
            return False
        try:
            info = mt5.terminal_info()
            if info is None:
                self._connected = False
                log.warning("MT5 heartbeat failed — terminal_info() returned None")
                return False
            return True
        except Exception as e:
            self._connected = False
            log.warning(f"MT5 heartbeat exception: {e}")
            return False

    # ── Symbol Resolution ──

    def set_broker_symbol_lookup(self, fn) -> None:
        """v2: Register a callable(canonical) -> Optional[str] that returns
        the user-configured broker-symbol override for a ticker, if any.
        Called on every cache miss in resolve_symbol so runtime config
        changes take effect without provider restart."""
        self._broker_symbol_lookup = fn

    def reset_symbol(self, canonical: str) -> Optional[str]:
        """v2: Evict a ticker's cached mapping and re-resolve. Call this
        after the user changes broker_symbol in Settings so the next
        tick/bar request uses the new mapping."""
        canonical = canonical.upper()
        old = self._symbol_map.pop(canonical, None)
        if old is not None:
            self._reverse_map.pop(old, None)
            # Also drop cached bar time so the next poll re-seeds.
            for k in list(self._last_bar_times.keys()):
                if k.startswith(canonical + "_"):
                    self._last_bar_times.pop(k, None)
        return self.resolve_symbol(canonical)

    def resolve_symbol(self, canonical: str) -> Optional[str]:
        """
        Map canonical name to broker symbol.
        Order:
          0. user override (Settings panel) via broker_symbol_lookup callable — v2
          1. cache
          2. canonical name itself
          3. provider-level aliases (from account_config["aliases"])
        Caches result in _symbol_map for fast lookups.
        """
        if not self._connected:
            return None

        # v2: (0) user override takes precedence over cache — so changing
        # broker_symbol in Settings and calling reset_symbol() picks it up.
        if self._broker_symbol_lookup is not None:
            try:
                override = self._broker_symbol_lookup(canonical)
            except Exception as e:
                log.warning(f"broker_symbol_lookup failed for {canonical}: {e}")
                override = None
            if override:
                sym = mt5.symbol_info(override)
                if sym is not None:
                    if not sym.visible:
                        mt5.symbol_select(override, True)
                    self._symbol_map[canonical] = override
                    self._reverse_map[override] = canonical
                    log.info(f"Symbol resolved via user override: {canonical} → {override}")
                    return override
                else:
                    log.warning(f"User override {canonical} → {override} not found in MT5; falling back")

        # (1) cache
        if canonical in self._symbol_map:
            return self._symbol_map[canonical]

        # (2) canonical name directly
        sym = mt5.symbol_info(canonical)
        if sym is not None:
            if not sym.visible:
                mt5.symbol_select(canonical, True)
            self._symbol_map[canonical] = canonical
            self._reverse_map[canonical] = canonical
            return canonical

        # v6: (2.5) fuzzy auto-link — handle suffix/case variants and known
        #   common aliases (USTEC ↔ NAS100/US100, US30 ↔ DOW, etc.) without
        #   the user needing to set Settings → broker_symbol manually.
        auto = self._fuzzy_resolve(canonical)
        if auto is not None:
            sym = mt5.symbol_info(auto)
            if sym is not None:
                if not sym.visible:
                    mt5.symbol_select(auto, True)
                self._symbol_map[canonical] = auto
                self._reverse_map[auto] = canonical
                log.info(f"[symbol auto-link] {canonical} → {auto}")
                return auto

        # (3) provider aliases
        aliases = self._aliases.get(canonical, [])
        for alias in aliases:
            if alias == canonical:
                continue
            sym = mt5.symbol_info(alias)
            if sym is not None:
                if not sym.visible:
                    mt5.symbol_select(alias, True)
                self._symbol_map[canonical] = alias
                self._reverse_map[alias] = canonical
                log.info(f"Symbol resolved: {canonical} → {alias}")
                return alias

        log.warning(f"Symbol {canonical} not found in MT5 (tried {len(aliases)} aliases)")
        return None

    def resolve_universe(self, universe: List[str]) -> List[str]:
        """
        Resolve a full universe of canonical tickers.
        Returns list of canonical names that successfully resolved.
        Populates internal symbol maps.
        """
        self._symbol_map.clear()
        self._reverse_map.clear()
        self._resolved_symbols.clear()

        for canonical in universe:
            broker_name = self.resolve_symbol(canonical)
            if broker_name is not None:
                self._resolved_symbols.append(canonical)
                if broker_name != canonical:
                    log.info(f"  ✓ {canonical} → {broker_name}")
                else:
                    log.info(f"  ✓ {canonical}")
            else:
                log.warning(f"  ✗ {canonical} — not found")

        log.info(f"Resolved {len(self._resolved_symbols)}/{len(universe)} symbols")
        return list(self._resolved_symbols)

    def get_available_symbols(self) -> List[str]:
        """Return canonical names that have been successfully resolved."""
        return list(self._resolved_symbols)

    def _broker_symbol(self, canonical: str) -> str:
        """Quick lookup: canonical → broker symbol (assumes already resolved)."""
        return self._symbol_map.get(canonical, canonical)

    # ── Market Data ──

    def get_latest_ticks(self, symbols: List[str]) -> Dict[str, TickData]:
        """Fetch latest tick for each symbol."""
        if not self._connected:
            return {}

        ticks = {}
        for canonical in symbols:
            broker_sym = self._broker_symbol(canonical)
            tick = mt5.symbol_info_tick(broker_sym)
            if tick is None:
                continue

            sym_info = mt5.symbol_info(broker_sym)
            dec = sym_info.digits if sym_info else 5

            ticks[canonical] = TickData(
                ticker=canonical,
                bid=round(tick.bid, dec),
                ask=round(tick.ask, dec),
                last=round(tick.last or tick.bid, dec),
                time=datetime.fromtimestamp(
                    tick.time, tz=timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%S"),
                spread=round(tick.ask - tick.bid, dec),
            )
        return ticks

    def get_bars(
        self, ticker: str, timeframe: str = "M15", count: int = 200
    ) -> List[BarData]:
        """Fetch recent OHLCV bars for a canonical ticker."""
        if not self._connected:
            return []

        tf_value = MT5_TIMEFRAMES.get(timeframe)
        if tf_value is None:
            log.error(f"Unknown timeframe: {timeframe}")
            return []

        broker_sym = self._broker_symbol(ticker)
        rates = mt5.copy_rates_from_pos(broker_sym, tf_value, 0, count)
        if rates is None or len(rates) == 0:
            return []

        sym_info = mt5.symbol_info(broker_sym)
        dec = sym_info.digits if sym_info else 5

        bars = []
        for r in rates:
            bars.append(BarData(
                time=datetime.fromtimestamp(
                    r[0], tz=timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%S"),
                open=round(float(r[1]), dec),
                high=round(float(r[2]), dec),
                low=round(float(r[3]), dec),
                close=round(float(r[4]), dec),
                volume=int(r[5]),
            ))
        return bars

    def get_bars_range(
        self, ticker: str, timeframe: str, from_dt: datetime, to_dt: datetime,
    ) -> List[BarData]:
        """v5: Fetch OHLCV bars between two UTC datetimes via copy_rates_range.
        Used by the Stress Lab last-signal panel to replay historical trades."""
        if not self._connected:
            return []
        tf_value = MT5_TIMEFRAMES.get(timeframe)
        if tf_value is None:
            log.error(f"Unknown timeframe: {timeframe}")
            return []
        broker_sym = self._broker_symbol(ticker)
        # Ensure tz-aware UTC for the MT5 call
        if from_dt.tzinfo is None: from_dt = from_dt.replace(tzinfo=timezone.utc)
        if to_dt.tzinfo   is None: to_dt   = to_dt.replace(tzinfo=timezone.utc)
        rates = mt5.copy_rates_range(broker_sym, tf_value, from_dt, to_dt)
        if rates is None or len(rates) == 0:
            return []
        sym_info = mt5.symbol_info(broker_sym)
        dec = sym_info.digits if sym_info else 5
        bars = []
        for r in rates:
            bars.append(BarData(
                time=datetime.fromtimestamp(r[0], tz=timezone.utc)
                     .strftime("%Y-%m-%dT%H:%M:%S"),
                open=round(float(r[1]), dec),
                high=round(float(r[2]), dec),
                low=round(float(r[3]), dec),
                close=round(float(r[4]), dec),
                volume=int(r[5]),
            ))
        return bars

    def check_new_bars(
        self, symbols: List[str], timeframe: str = "M15"
    ) -> List[dict]:
        """
        Detect newly closed bars since last check.
        Returns list of bar event dicts for broadcasting.
        """
        if not self._connected:
            return []

        tf_value = MT5_TIMEFRAMES.get(timeframe)
        if tf_value is None:
            return []

        new_bars = []
        for canonical in symbols:
            broker_sym = self._broker_symbol(canonical)
            rates = mt5.copy_rates_from_pos(broker_sym, tf_value, 0, 2)
            if rates is None or len(rates) < 2:
                continue

            # Second-to-last bar = most recently CLOSED bar
            closed_bar = rates[-2]
            bar_epoch = int(closed_bar[0])

            cache_key = f"{canonical}_{timeframe}"
            if cache_key in self._last_bar_times:
                if bar_epoch > self._last_bar_times[cache_key]:
                    sym_info = mt5.symbol_info(broker_sym)
                    dec = sym_info.digits if sym_info else 5
                    bar = BarData(
                        time=datetime.fromtimestamp(
                            bar_epoch, tz=timezone.utc
                        ).strftime("%Y-%m-%dT%H:%M:%S"),
                        open=round(float(closed_bar[1]), dec),
                        high=round(float(closed_bar[2]), dec),
                        low=round(float(closed_bar[3]), dec),
                        close=round(float(closed_bar[4]), dec),
                        volume=int(closed_bar[5]),
                    )
                    new_bars.append({
                        "type": "bar",
                        "ticker": canonical,
                        "timeframe": timeframe,
                        "bar": bar.to_dict(),
                    })

            self._last_bar_times[cache_key] = bar_epoch

        return new_bars

    # ── Symbol Info ──

    def get_symbol_info(self, ticker: str) -> Optional[SymbolInfo]:
        """Extract full symbol metadata from MT5."""
        if not self._connected:
            return None

        broker_sym = self._broker_symbol(ticker)
        sym = mt5.symbol_info(broker_sym)
        if sym is None:
            return None

        # Determine asset class from symbol path or properties
        asset_class = self._classify_symbol(sym)

        return SymbolInfo(
            ticker=ticker,
            broker_symbol=broker_sym,
            asset_class=asset_class,
            decimals=sym.digits,
            description=sym.description or ticker,
            trade_allowed=sym.trade_mode != 0,
            min_lot=sym.volume_min,
            max_lot=sym.volume_max,
            lot_step=sym.volume_step,
            contract_size=sym.trade_contract_size,
            currency_profit=sym.currency_profit,
            currency_margin=sym.currency_margin,
            tick_size=sym.trade_tick_size,
            tick_value=sym.trade_tick_value,
        )

    def _classify_symbol(self, sym) -> str:
        """Guess asset class from MT5 symbol properties."""
        path = (sym.path or "").lower()
        desc = (sym.description or "").lower()

        if "forex" in path or "currencies" in path:
            return "FX"
        if "index" in path or "indices" in path:
            return "INDEX"
        if "commodit" in path or "metals" in path or "energy" in path:
            return "COMMODITY"
        if "crypto" in path:
            return "CRYPTO"
        if "stock" in path or "equit" in path:
            return "STOCK"
        # Heuristic fallbacks
        if "gold" in desc or "silver" in desc or "oil" in desc:
            return "COMMODITY"
        if sym.currency_profit == sym.currency_margin and sym.digits >= 4:
            return "FX"
        return "OTHER"

    # ── Account Info ──

    def get_account_info(self) -> Optional[AccountInfo]:
        """Get MT5 account snapshot."""
        if not self._connected:
            return None

        info = mt5.account_info()
        if info is None:
            return None

        term = mt5.terminal_info()
        return AccountInfo(
            provider_type="mt5",
            account_id=str(info.login),
            label=self._label,
            broker=info.company,
            server=info.server,
            currency=info.currency,
            balance=info.balance,
            equity=info.equity,
            margin_free=info.margin_free,
            leverage=info.leverage,
            connected=True,
        )

    # ── Execution ──

    def place_order(self, order: OrderRequest) -> OrderResult:
        """Place a trade order through MT5."""
        if not self._connected:
            return OrderResult(success=False, error="MT5 not connected")

        broker_sym = self._broker_symbol(order.ticker)
        sym_info = mt5.symbol_info(broker_sym)
        if sym_info is None:
            return OrderResult(
                success=False,
                error=f"Symbol {order.ticker} not found",
            )

        # Determine MT5 order type
        type_key = f"{order.order_type}_{order.direction}"
        mt5_type = MT5_ORDER_TYPES.get(type_key)
        if mt5_type is None:
            return OrderResult(
                success=False,
                error=f"Unsupported order type: {type_key}",
            )

        # Build request
        request = {
            "action": mt5.TRADE_ACTION_DEAL if order.order_type == "MARKET" else mt5.TRADE_ACTION_PENDING,
            "symbol": broker_sym,
            "volume": order.lots,
            "type": mt5_type,
            "magic": order.magic,
            "comment": order.comment or "Quantum Terminal",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        # execution_routes sends price=0 for market orders, so treat any falsy
        # price as "fill at the current quote" (instant-execution brokers
        # reject a market request without a real price).
        if order.price:
            request["price"] = order.price
        elif order.order_type == "MARKET":
            # Use current ask/bid for market orders
            tick = mt5.symbol_info_tick(broker_sym)
            if tick:
                request["price"] = tick.ask if order.direction == "BUY" else tick.bid

        if order.stop_loss is not None:
            request["sl"] = order.stop_loss
        if order.take_profit is not None:
            request["tp"] = order.take_profit

        # Send order
        result = mt5.order_send(request)
        if result is None:
            return OrderResult(
                success=False,
                error=f"MT5 order_send returned None: {mt5.last_error()}",
            )

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return OrderResult(
                success=False,
                error=f"MT5 order rejected: {result.retcode} — {result.comment}",
                raw=result._asdict() if hasattr(result, '_asdict') else None,
            )

        return OrderResult(
            success=True,
            order_id=str(result.deal),
            ticker=order.ticker,
            direction=order.direction,
            lots=order.lots,
            price=result.price,
        )

    def get_positions(self) -> List[Position]:
        """Get all open positions."""
        if not self._connected:
            return []

        positions = mt5.positions_get()
        if positions is None:
            return []

        result = []
        for pos in positions:
            # Map broker symbol back to canonical
            canonical = self._reverse_map.get(pos.symbol, pos.symbol)
            result.append(Position(
                ticket=str(pos.ticket),
                ticker=canonical,
                direction="BUY" if pos.type == 0 else "SELL",
                lots=pos.volume,
                open_price=pos.price_open,
                current_price=pos.price_current,
                stop_loss=pos.sl if pos.sl != 0 else None,
                take_profit=pos.tp if pos.tp != 0 else None,
                profit=pos.profit,
                swap=pos.swap,
                open_time=datetime.fromtimestamp(
                    pos.time, tz=timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%S"),
            ))
        return result

    def close_position(
        self, ticket: str, lots: Optional[float] = None
    ) -> OrderResult:
        """Close a position by ticket (full or partial)."""
        if not self._connected:
            return OrderResult(success=False, error="MT5 not connected")

        # Find the position
        positions = mt5.positions_get(ticket=int(ticket))
        if not positions or len(positions) == 0:
            return OrderResult(
                success=False,
                error=f"Position {ticket} not found",
            )

        pos = positions[0]
        close_lots = lots if lots is not None else pos.volume

        # Determine close direction (opposite of position)
        close_type = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            return OrderResult(success=False, error=f"No tick data for {pos.symbol}")
        price = tick.bid if pos.type == 0 else tick.ask

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": close_lots,
            "type": close_type,
            "position": pos.ticket,
            "price": price,
            "comment": "Quantum Terminal close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        result = mt5.order_send(request)
        if result is None:
            return OrderResult(
                success=False,
                error=f"Close failed: {mt5.last_error()}",
            )

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return OrderResult(
                success=False,
                error=f"Close rejected: {result.retcode} — {result.comment}",
            )

        canonical = self._reverse_map.get(pos.symbol, pos.symbol)
        return OrderResult(
            success=True,
            order_id=str(result.deal),
            ticker=canonical,
            direction="SELL" if pos.type == 0 else "BUY",
            lots=close_lots,
            price=result.price,
        )

    def modify_position(
        self, ticket: str, stop_loss=None, take_profit=None
    ) -> dict:
        """Modify SL/TP on an open position."""
        if not self._connected:
            return {"success": False, "error": "MT5 not connected"}

        positions = mt5.positions_get(ticket=int(ticket))
        if not positions or len(positions) == 0:
            return {"success": False, "error": f"Position {ticket} not found"}

        pos = positions[0]
        tick = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            return {"success": False, "error": f"No tick data for {pos.symbol}"}

        # v3: Preserve the other side when only one is being modified.
        #     MT5 treats sl=0.0 / tp=0.0 as "clear the level", so passing None
        #     through as 0 would silently remove whichever side the caller
        #     omitted. Read the live pos.sl / pos.tp and pass them when the
        #     corresponding parameter is None.
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": pos.symbol,
            "position": pos.ticket,
            "sl": float(stop_loss)   if stop_loss   is not None else float(getattr(pos, "sl", 0.0) or 0.0),
            "tp": float(take_profit) if take_profit is not None else float(getattr(pos, "tp", 0.0) or 0.0),
        }

        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": f"Modify failed: {mt5.last_error()}"}

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Modify rejected: {result.retcode} — {result.comment}"}

        return {
            "success": True,
            "ticket": ticket,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
        }

    # ── Pending orders (LIMIT / STOP) — v4 ────────────────────────────

    def get_pending_orders(self) -> List[PendingOrder]:
        """List all resting pending orders (LIMIT / STOP) on this account."""
        if not self._connected:
            return []
        orders = mt5.orders_get()
        if orders is None:
            return []
        out = []
        for o in orders:
            t = o.type
            if t == mt5.ORDER_TYPE_BUY_LIMIT:   direction, kind = "BUY",  "LIMIT"
            elif t == mt5.ORDER_TYPE_SELL_LIMIT: direction, kind = "SELL", "LIMIT"
            elif t == mt5.ORDER_TYPE_BUY_STOP:   direction, kind = "BUY",  "STOP"
            elif t == mt5.ORDER_TYPE_SELL_STOP:  direction, kind = "SELL", "STOP"
            else:
                continue  # skip stop-limit / market / closed types
            canonical = self._reverse_map.get(o.symbol, o.symbol)
            out.append(PendingOrder(
                ticket=str(o.ticket),
                symbol=o.symbol,
                ticker=canonical,
                direction=direction,
                order_type=kind,
                lots=o.volume_current,
                price=o.price_open,
                stop_loss=o.sl if o.sl != 0 else None,
                take_profit=o.tp if o.tp != 0 else None,
                comment=o.comment or "",
                time_setup=datetime.fromtimestamp(
                    o.time_setup, tz=timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%S"),
            ))
        return out

    def cancel_order(self, ticket: str) -> OrderResult:
        """Remove (cancel) a resting pending order."""
        if not self._connected:
            return OrderResult(success=False, error="MT5 not connected")
        orders = mt5.orders_get(ticket=int(ticket))
        if not orders:
            return OrderResult(success=False, error=f"Order {ticket} not found")
        req = {"action": mt5.TRADE_ACTION_REMOVE, "order": int(ticket)}
        result = mt5.order_send(req)
        if result is None:
            return OrderResult(success=False, error=f"Cancel failed: {mt5.last_error()}")
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return OrderResult(
                success=False,
                error=f"Cancel rejected: {result.retcode} — {result.comment}",
            )
        return OrderResult(success=True, order_id=int(ticket))

    def modify_order(
        self, ticket: str,
        price: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> OrderResult:
        """
        Modify a resting pending order's trigger price and/or SL/TP.
        Parameters left as None are preserved from the existing order so
        the caller can patch a single field without clobbering the rest.
        """
        if not self._connected:
            return OrderResult(success=False, error="MT5 not connected")
        orders = mt5.orders_get(ticket=int(ticket))
        if not orders:
            return OrderResult(success=False, error=f"Order {ticket} not found")
        o = orders[0]
        req = {
            "action":  mt5.TRADE_ACTION_MODIFY,
            "order":   int(ticket),
            "symbol":  o.symbol,
            "price":   float(price)       if price       is not None else float(o.price_open),
            "sl":      float(stop_loss)   if stop_loss   is not None else float(o.sl or 0.0),
            "tp":      float(take_profit) if take_profit is not None else float(o.tp or 0.0),
            "type_time":    o.type_time,
            "type_filling": o.type_filling,
        }
        result = mt5.order_send(req)
        if result is None:
            return OrderResult(success=False, error=f"Modify failed: {mt5.last_error()}")
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return OrderResult(
                success=False,
                error=f"Modify rejected: {result.retcode} — {result.comment}",
            )
        return OrderResult(success=True, order_id=int(ticket))

    def get_trade_history(self, days: int = 7) -> list:
        """
        Get closed trade history from MT5 using history_deals_get().
        Groups DEAL_ENTRY_IN + DEAL_ENTRY_OUT by position_id into ClosedTrade records.
        """
        from models import ClosedTrade
        from datetime import timedelta

        if not self._connected:
            return []

        utc_to = datetime.now(timezone.utc)
        utc_from = utc_to - timedelta(days=days)

        deals = mt5.history_deals_get(utc_from, utc_to)
        if deals is None or len(deals) == 0:
            return []

        # Group deals by position_id
        positions = {}  # position_id -> {"in": deal, "out": deal}
        for deal in deals:
            pid = deal.position_id
            if pid == 0:
                continue  # Balance/correction operations
            if pid not in positions:
                positions[pid] = {"in": None, "out": None}
            # entry=0 is DEAL_ENTRY_IN, entry=1 is DEAL_ENTRY_OUT
            if deal.entry == 0:
                positions[pid]["in"] = deal
            elif deal.entry == 1:
                positions[pid]["out"] = deal

        # Build ClosedTrade records (only complete round-trips)
        trades = []
        for pid, pair in positions.items():
            entry = pair["in"]
            exit_deal = pair["out"]
            if entry is None or exit_deal is None:
                continue  # Partial — still open or missing leg

            # Resolve canonical ticker from broker symbol
            canonical = entry.symbol
            for canon, aliases in self._aliases.items():
                if entry.symbol in aliases:
                    canonical = canon
                    break

            direction = "BUY" if entry.type == 0 else "SELL"  # DEAL_TYPE_BUY=0
            trades.append(ClosedTrade(
                ticket=str(pid),
                ticker=canonical,
                direction=direction,
                lots=entry.volume,
                open_price=entry.price,
                close_price=exit_deal.price,
                profit=exit_deal.profit,
                commission=round((entry.commission or 0) + (exit_deal.commission or 0), 2),
                swap=round((entry.swap or 0) + (exit_deal.swap or 0), 2),
                open_time=datetime.fromtimestamp(entry.time, tz=timezone.utc).isoformat(),
                close_time=datetime.fromtimestamp(exit_deal.time, tz=timezone.utc).isoformat(),
                comment=entry.comment or "",
                magic=entry.magic,
            ))

        # Sort newest first
        trades.sort(key=lambda t: t.close_time, reverse=True)
        return trades