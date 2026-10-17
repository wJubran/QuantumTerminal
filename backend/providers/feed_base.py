"""
================================================================================
Quantum Terminal — base for internet data feeds
================================================================================
Everything the HTTP data sources (Yahoo Finance, Binance, OANDA, Alpaca) and
the CSV-file source share, so each of them only implements two calls:

    _fetch_quotes(pairs)                  → {canonical: (bid, ask, last, epoch)}
    _fetch_bars(symbol, timeframe, count) → [(epoch, open, high, low, close, volume), …]

and gets, from this class:

- Symbol mapping. A canonical ticker (XAUUSD, US500, …) is resolved to the
  feed's own symbol in this order:
  1. the user's override (Settings → custom tickers → broker symbol);
  2. the account's "symbols" map in user_config.json;
  3. the feed's defaults (SYMBOLS);
  4. the feed's own guess (guess_symbol).
  A symbol the feed keeps answering with nothing is skipped for a while
  instead of being requested every second.
- Polite caching. Quotes are reused for `quote_interval` seconds, bars for a
  few seconds, so the tick loops never exceed the feed's rate limits.
- Bar-close detection. check_new_bars() fetches only when a bar boundary has
  passed, not on every check.
- The feed clock. Every time leaves here as a naive "YYYY-MM-DDTHH:MM:SS"
  string on one clock, like MetaTrader 5's server time:
  - "utc": UTC;
  - "ny_close": New York time + 7 h. The FX day then starts at 00:00 at the
    17:00 New York roll, as on most MT5 brokers.
  Daily bars carry 00:00 of their trading day.
- Timeframes the feed lacks are built from a finer one (aggregate()).

Feeds are data-only. Orders go to the execution account: MetaTrader 5, OANDA,
or the paper account, which trades on the live prices of any feed.
================================================================================
"""

from __future__ import annotations

import logging
import math
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from models import AccountInfo, BarData, SymbolInfo, TickData
from providers.base_provider import BaseProvider

log = logging.getLogger("qt.provider.feed")

TF_SECONDS = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800,
              "H1": 3600, "H4": 14400, "D1": 86400, "W1": 604800}
ALL_TIMEFRAMES = list(TF_SECONDS)
_MONDAY = 4 * 86400          # the Unix epoch is a Thursday; weeks start on Monday 00:00
_DEAD_SYMBOL_SEC = 600       # skip a symbol that returned nothing for this long

Row = Tuple[float, float, float, float, float, float]   # (epoch, o, h, l, c, v)


class FeedError(Exception):
    """A request the feed refused or could not answer; the message is for the user."""


def decimals_for(price: float) -> int:
    """Display decimals for a price without a known tick size (5 for 1.0850, 2 for 4012.5)."""
    if not price or not math.isfinite(price) or price <= 0:
        return 5
    return max(2, min(8, 5 - math.floor(math.log10(price))))


def _ny_offset(epoch: float) -> int:
    from zoneinfo import ZoneInfo
    dt = datetime.fromtimestamp(epoch, tz=ZoneInfo("America/New_York"))
    return int(dt.utcoffset().total_seconds())


def clock_offset(clock: str, epoch: float) -> int:
    """Seconds to add to a Unix time to get the feed clock."""
    if clock == "ny_close":
        return _ny_offset(epoch) + 7 * 3600
    return 0


def bucket_start(epoch: float, timeframe: str, clock: str = "utc") -> float:
    """Unix time at which the `timeframe` bar containing `epoch` starts, with
    bar boundaries aligned on the feed clock."""
    step = TF_SECONDS[timeframe]
    off = clock_offset(clock, epoch)
    local = epoch + off
    if timeframe == "W1":
        start = math.floor((local - _MONDAY) / step) * step + _MONDAY
    else:
        start = math.floor(local / step) * step
    return start - clock_offset(clock, start - off)


def aggregate(rows: Sequence[Row], timeframe: str, clock: str = "utc") -> List[Row]:
    """Combine finer bars into `timeframe` bars aligned on the feed clock."""
    out: List[list] = []
    for t, o, h, l, c, v in rows:
        b = bucket_start(t, timeframe, clock)
        if out and out[-1][0] == b:
            last = out[-1]
            last[2] = max(last[2], h)
            last[3] = min(last[3], l)
            last[4] = c
            last[5] += v
        else:
            out.append([b, o, h, l, c, v])
    return [tuple(r) for r in out]


class FeedProvider(BaseProvider):
    """Base class of the internet data feeds. Subclasses set the class
    attributes below and implement _fetch_quotes / _fetch_bars (and usually
    _check_connection)."""

    TYPE = "feed"
    LABEL = "Data feed"
    SYMBOLS: Dict[str, str] = {}               # canonical → feed symbol
    NATIVE: Dict[str, object] = {}             # timeframe → the feed's own code for it
    BUILD_FROM = {"H4": "H1", "W1": "D1", "M30": "M15"}   # missing timeframe → finer one
    DEFAULT_CLOCK = "utc"
    DEFAULT_QUOTE_INTERVAL = 1.0
    BAR_TTL = 5.0

    def __init__(self, account_config: Dict):
        cfg = dict(account_config or {})
        self._cfg = cfg
        self._id = cfg.get("id") or f"{self.TYPE}_default"
        self._label = cfg.get("label") or self.LABEL
        self.clock = cfg.get("clock") or self.DEFAULT_CLOCK
        self.quote_interval = float(cfg.get("quote_interval") or self.DEFAULT_QUOTE_INTERVAL)
        self._overrides = {str(k).upper(): str(v) for k, v in (cfg.get("symbols") or {}).items() if v}
        self._lock = threading.RLock()
        self._connected = False
        self.last_error = ""
        self._quotes: Dict[str, TickData] = {}
        self._quotes_at: Dict[str, float] = {}
        self._bars_cache: Dict[Tuple[str, str, int], Tuple[float, List[BarData]]] = {}
        self._bar_marks: Dict[Tuple[str, str], float] = {}
        self._dead: Dict[str, float] = {}
        self._digits: Dict[str, int] = {}
        self._resolved: List[str] = []
        self._broker_symbol_lookup: Optional[Callable[[str], Optional[str]]] = None
        self._error_logged_at = 0.0

    # ── identity & capabilities ──

    @property
    def provider_type(self) -> str:
        return self.TYPE

    @property
    def provider_id(self) -> str:
        return self._id

    @property
    def label(self) -> str:
        return self._label

    @property
    def can_execute(self) -> bool:
        return False

    @property
    def supported_timeframes(self) -> List[str]:
        return ALL_TIMEFRAMES

    @property
    def connected(self) -> bool:
        return self._connected

    # ── lifecycle ──

    def _check_connection(self) -> None:
        """Raise FeedError when the feed can't be used (bad key, no network…)."""

    def connect(self) -> bool:
        try:
            self._check_connection()
        except FeedError as e:
            self.last_error = str(e)
            self._connected = False
            log.warning(f"{self._label}: cannot connect: {e}")
            return False
        except Exception as e:          # network stack errors, unexpected payloads
            self.last_error = f"{type(e).__name__}: {e}"
            self._connected = False
            log.warning(f"{self._label}: cannot connect: {self.last_error}")
            return False
        self._connected = True
        self.last_error = ""
        log.info(f"{self._label}: connected")
        return True

    def disconnect(self) -> None:
        self._connected = False

    def heartbeat(self) -> bool:
        return self._connected

    # ── symbols ──

    def set_broker_symbol_lookup(self, fn) -> None:
        self._broker_symbol_lookup = fn

    def reset_symbol(self, canonical: str) -> Optional[str]:
        canonical = canonical.upper()
        self._dead.pop(canonical, None)
        for k in [k for k in self._bar_marks if k[0] == canonical]:
            self._bar_marks.pop(k, None)
        return self.resolve_symbol(canonical)

    def guess_symbol(self, canonical: str) -> Optional[str]:
        """The feed's symbol for a canonical ticker it has no entry for; None
        when the feed can't carry it."""
        return canonical

    def feed_symbol(self, canonical: str) -> Optional[str]:
        canonical = canonical.upper()
        if self._broker_symbol_lookup is not None:
            try:
                override = self._broker_symbol_lookup(canonical)
            except Exception:
                override = None
            if override:
                return override
        return self._overrides.get(canonical) or self.SYMBOLS.get(canonical) or self.guess_symbol(canonical)

    def resolve_symbol(self, canonical: str) -> Optional[str]:
        return self.feed_symbol(canonical)

    def resolve_universe(self, universe: List[str]) -> List[str]:
        self._resolved = [c.upper() for c in universe if self.feed_symbol(c)]
        missing = [c for c in universe if c.upper() not in self._resolved]
        log.info(f"{self._label}: {len(self._resolved)}/{len(universe)} symbols mapped"
                 + (f" (not on this feed: {', '.join(missing)})" if missing else ""))
        return list(self._resolved)

    def get_available_symbols(self) -> List[str]:
        return list(self._resolved)

    def _alive(self, canonical: str) -> bool:
        until = self._dead.get(canonical)
        return until is None or time.time() >= until

    def _mark_dead(self, canonical: str, why: str) -> None:
        if canonical not in self._dead or time.time() >= self._dead[canonical]:
            log.warning(f"{self._label}: no data for {canonical} ({why}); retrying in "
                        f"{_DEAD_SYMBOL_SEC // 60} min")
        self._dead[canonical] = time.time() + _DEAD_SYMBOL_SEC

    # ── clock & formatting ──

    def fmt(self, epoch: float) -> str:
        local = epoch + clock_offset(self.clock, epoch)
        return datetime.fromtimestamp(local, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    def day_epoch(self, d) -> float:
        """Unix time whose feed-clock rendering is 00:00 of trading day `d`."""
        local = datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp()
        return local - clock_offset(self.clock, local)

    def digits(self, canonical: str, price: float = 0.0) -> int:
        if canonical not in self._digits:
            from providers.sim_provider import _SPECS
            spec = _SPECS.get(canonical)
            self._digits[canonical] = spec[2] if spec else decimals_for(price)
        return self._digits[canonical]

    def _log_error(self, what: str, e: Exception) -> None:
        now = time.time()
        if now - self._error_logged_at > 60:
            self._error_logged_at = now
            log.warning(f"{self._label}: {what} failed: {e}")

    # ── quotes ──

    def _fetch_quotes(self, pairs: List[Tuple[str, str]]) -> Dict[str, Tuple[float, float, float, float]]:
        """{canonical: (bid, ask, last, unix_time)} for (canonical, feed_symbol) pairs."""
        raise NotImplementedError

    def get_latest_ticks(self, symbols: List[str]) -> Dict[str, TickData]:
        if not self._connected:
            return {}
        now = time.time()
        wanted = [s.upper() for s in symbols]
        with self._lock:
            stale = [c for c in wanted if self._alive(c)
                     and now - self._quotes_at.get(c, 0.0) >= self.quote_interval]
            pairs = [(c, self.feed_symbol(c)) for c in stale]
            pairs = [(c, f) for c, f in pairs if f]
            for c, _ in pairs:              # claimed: other callers don't request them meanwhile
                self._quotes_at[c] = now
        if pairs:
            # The request runs outside the lock: charts loading bars don't wait for it.
            try:
                fresh = self._fetch_quotes(pairs)
            except Exception as e:
                self._log_error("quote request", e)
                fresh = {}
            with self._lock:
                for c, _ in pairs:
                    q = fresh.get(c)
                    if q is None:
                        if c not in self._quotes:
                            self._mark_dead(c, "no quote")
                        continue
                    bid, ask, last, ts = q
                    ref = last or bid or ask
                    if not ref or not math.isfinite(ref):
                        continue
                    bid = bid if bid and bid > 0 else ref
                    ask = ask if ask and ask >= bid else bid
                    d = self.digits(c, ref)
                    self._quotes[c] = TickData(
                        ticker=c, symbol=self.feed_symbol(c) or c,
                        bid=round(bid, d), ask=round(ask, d), last=round(last or bid, d),
                        time=self.fmt(ts or now), time_msc=int((ts or now) * 1000),
                        spread=round(ask - bid, d),
                    )
        with self._lock:
            return {c: self._quotes[c] for c in wanted if c in self._quotes}

    # ── bars ──

    def _fetch_bars(self, symbol: str, timeframe: str, count: int) -> List[Row]:
        """Native-timeframe bars, oldest first, the forming bar included."""
        raise NotImplementedError

    def _rows(self, canonical: str, timeframe: str, count: int) -> List[Row]:
        symbol = self.feed_symbol(canonical)
        if not symbol:
            return []
        if timeframe in self.NATIVE:
            return self._fetch_bars(symbol, timeframe, count)
        base = self.BUILD_FROM.get(timeframe)
        if base is None or base not in self.NATIVE:
            return []
        ratio = TF_SECONDS[timeframe] // TF_SECONDS[base]
        return aggregate(self._fetch_bars(symbol, base, count * ratio + ratio), timeframe, self.clock)[-count:]

    def _to_bars(self, canonical: str, timeframe: str, rows: Iterable[Row]) -> List[BarData]:
        rows = list(rows)
        d = self.digits(canonical, rows[-1][4] if rows else 0.0)
        out = []
        for t, o, h, l, c, v in rows:
            if not all(math.isfinite(x) for x in (o, h, l, c)):
                continue
            out.append(BarData(ticker=canonical, timeframe=timeframe, time=self.fmt(t),
                               open=round(o, d), high=round(h, d), low=round(l, d),
                               close=round(c, d), volume=int(v or 0), tick_volume=int(v or 0)))
        return out

    def get_bars(self, ticker: str, timeframe: str = "M15", count: int = 200) -> List[BarData]:
        if not self._connected or timeframe not in TF_SECONDS:
            return []
        canonical = ticker.upper()
        count = max(1, int(count))
        key = (canonical, timeframe, count)
        with self._lock:
            hit = self._bars_cache.get(key)
            if hit and time.time() - hit[0] < self.BAR_TTL:
                return list(hit[1])
        try:
            bars = self._to_bars(canonical, timeframe, self._rows(canonical, timeframe, count)[-count:])
        except Exception as e:
            self._log_error(f"{canonical} {timeframe} bars", e)
            return []
        with self._lock:
            self._bars_cache[key] = (time.time(), bars)
            if len(self._bars_cache) > 256:
                for k in list(self._bars_cache)[:64]:
                    self._bars_cache.pop(k, None)
        return list(bars)

    def get_bars_range(self, ticker: str, timeframe: str, from_dt: datetime, to_dt: datetime) -> List[BarData]:
        if timeframe not in TF_SECONDS:
            return []
        if from_dt.tzinfo is None:
            from_dt = from_dt.replace(tzinfo=timezone.utc)
        if to_dt.tzinfo is None:
            to_dt = to_dt.replace(tzinfo=timezone.utc)
        span = (min(to_dt.timestamp(), time.time()) - from_dt.timestamp()) / TF_SECONDS[timeframe]
        count = min(5000, max(1, int(span) + 3))
        lo, hi = self.fmt(from_dt.timestamp()), self.fmt(to_dt.timestamp())
        return [b for b in self.get_bars(ticker, timeframe, count) if lo <= b.time <= hi]

    def check_new_bars(self, symbols: List[str], timeframe: str = "M15") -> List[dict]:
        """A bar event for each symbol whose `timeframe` bar closed since the
        last call. Fetches only after a bar boundary has passed."""
        if not self._connected or timeframe not in TF_SECONDS:
            return []
        now = time.time()
        current = bucket_start(now, timeframe, self.clock)
        out = []
        for sym in (s.upper() for s in symbols):
            key = (sym, timeframe)
            mark = self._bar_marks.get(key)
            self._bar_marks[key] = current
            if mark is None or current <= mark or not self._alive(sym):
                continue
            closed = [b for b in self.get_bars(sym, timeframe, 3) if b.time < self.fmt(current)]
            if closed:
                out.append({"type": "bar", "ticker": sym, "timeframe": timeframe,
                            "bar": closed[-1].to_dict()})
        return out

    # ── reference data ──

    def get_symbol_info(self, ticker: str) -> Optional[SymbolInfo]:
        from providers.sim_provider import instrument, _SPECS
        canonical = ticker.upper()
        q = self._quotes.get(canonical)
        known = canonical in _SPECS
        inst = instrument(canonical)
        d = self.digits(canonical, q.last if q else 0.0)
        contract = inst.contract_size if known else float(self._cfg.get("contract_size", 1.0))
        return SymbolInfo(
            ticker=canonical, symbol=self.feed_symbol(canonical) or canonical,
            broker_symbol=self.feed_symbol(canonical) or canonical,
            description=f"{canonical} ({self._label})", digits=d, decimals=d,
            point=10.0 ** -d, tick_size=10.0 ** -d,
            volume_min=0.01, volume_max=inst.max_lot, volume_step=0.01,
            min_lot=0.01, max_lot=inst.max_lot, lot_step=0.01,
            trade_contract_size=contract, contract_size=contract,
            currency_profit=inst.profit_ccy if known else "USD",
            currency_margin=inst.profit_ccy if known else "USD",
            asset_class=inst.asset_class if known else "OTHER", trade_allowed=False,
        )

    def get_account_info(self) -> Optional[AccountInfo]:
        return None


def http_client(headers: Optional[Dict[str, str]] = None, timeout: float = 10.0):
    """httpx client with the terminal's user agent; honours the system proxy."""
    import httpx
    base = {"User-Agent": "Mozilla/5.0 Quantum Terminal", "Accept": "application/json"}
    base.update(headers or {})
    return httpx.Client(headers=base, timeout=timeout, follow_redirects=True)


def check_response(resp, source: str):
    """Raise FeedError with a readable message for a non-2xx response."""
    if resp.status_code < 300:
        return resp
    try:
        body = resp.json()
        detail = (body.get("errorMessage") or body.get("msg") or body.get("message")
                  or body.get("error") or str(body))[:200]
    except Exception:
        detail = (resp.text or "")[:200]
    hint = {401: "check the API key / token", 403: "access denied (key permissions or region)",
            404: "not found (check the symbol or account id)", 429: "rate limit reached"}.get(resp.status_code, "")
    raise FeedError(f"{source}: HTTP {resp.status_code}{' — ' + hint if hint else ''}: {detail}")


_ISO = re.compile(r"^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?)(?:\.(\d+))?(Z|[+-]\d\d:?\d\d)?$")


def parse_iso(s: str) -> float:
    """RFC 3339 / ISO-8601 → Unix time. Accepts nanoseconds (OANDA), 'Z'
    and ±hh:mm offsets; no offset means UTC. Works on Python 3.10+."""
    m = _ISO.match(s.strip())
    if not m:
        raise ValueError(f"not an ISO-8601 time: {s!r}")
    base, frac, tz = m.groups()
    dt = datetime.fromisoformat(base.replace(" ", "T"))
    if frac:
        dt = dt.replace(microsecond=int(frac[:6].ljust(6, "0")))
    if tz and tz != "Z":
        sign = 1 if tz[0] == "+" else -1
        hh, mm = int(tz[1:3]), int(tz[-2:])
        dt = dt.replace(tzinfo=timezone(sign * timedelta(hours=hh, minutes=mm)))
    else:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def utc_day(epoch: float, tz_name: Optional[str] = None):
    """Calendar date of `epoch` in `tz_name` (UTC when None)."""
    if tz_name:
        from zoneinfo import ZoneInfo
        return datetime.fromtimestamp(epoch, tz=ZoneInfo(tz_name)).date()
    return datetime.fromtimestamp(epoch, tz=timezone.utc).date()

