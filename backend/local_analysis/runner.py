# version: v3
"""
Keeps the analysis cache's files up to date from the active feed, so the
chart's CONES / BATES / QUARTERLY / BANDS overlays, the REGIMES strip, the
Pulse Room and the Replay page work without a data server.

- Runs in the background (wired from data_server's lifespan). Every few
  minutes it looks at each universe ticker's latest daily bar and rebuilds
  that ticker's files only when the bar changed, so normally once a day.
- Three phases per pass, so the overlays appear first:
      live     {T}_cones.json, {T}_quarterly_cones.json, {T}_bands.json
      regime   {T}_regime.json: daily HMM regimes (refitted once a day) and
               the 15-minute volatility alarm (refreshed every new M15 bar)
      replay   {T}_historical_cones.json, {T}_bands_replay.json (Replay page)
  plus the macro regime from FRED data: GLOBAL_macro_regime.json and
  GLOBAL_regime_transitions.json.
- Files are stamped "producer": "quantum-terminal-local". A file written by
  any other producer is never overwritten.
- The data source is part of each file's signature. After a switch
  (Settings → DATA SOURCES) a pass runs at once and rebuilds every ticker
  from the new source; our files for a ticker the new source doesn't carry
  are removed, so no chart shows analysis made from other prices.
- MK_LOCAL_ANALYSIS=0 turns it off.

v2 — bands, the Replay page's files, eight quarterly anchors with
     meta.anchors, a Pulse Room rebuild after new live files.
v3 — regimes (per asset and macro); a source switch starts a pass at once.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Optional, Sequence, Tuple

from . import bands, cones, fred, regimes

log = logging.getLogger("qt.local_analysis")

PRODUCER = "quantum-terminal-local"
ENGINE_VERSION = 2
REGIME_VERSION = 1
DAILY_BARS = 1200           # ~4.5 years of weekdays, ~3.3 of a 7-day calendar: 8 quarters + a year of estimation
CHECK_INTERVAL_SEC = 300
START_DELAY_SEC = 3         # let the provider finish connecting

# kind → file name, in-memory store of the sync client (None: its route reads the disk)
FILES = {
    "cones": ("{T}_cones.json", "cones"),
    "quarterly": ("{T}_quarterly_cones.json", "quarterly_cones"),
    "bands": ("{T}_bands.json", "bands"),
    "historical_cones": ("{T}_historical_cones.json", "historical_cones"),
    "bands_replay": ("{T}_bands_replay.json", None),
    "regime": ("{T}_regime.json", "regime"),
}
PHASES = {
    "live": ("cones", "quarterly", "bands"),
    "regime": ("regime",),
    "replay": ("historical_cones", "bands_replay"),
}
MACRO_FILE = "GLOBAL_macro_regime.json"
TRANSITIONS_FILE = "GLOBAL_regime_transitions.json"

# (ticker, phase) → signature of the last build written (or found up to date) this run
_built: Dict[Tuple[str, str], str] = {}
# Set to start the next pass now instead of after CHECK_INTERVAL_SEC.
_wake: Optional[asyncio.Event] = None


def enabled() -> bool:
    return os.environ.get("MK_LOCAL_ANALYSIS", "1").strip().lower() not in ("0", "false", "no", "off")


def _cache_dir() -> Path:
    from data_sync_client import _get_cache_dir
    return _get_cache_dir()


def _read(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_atomic(path: Path, payload: dict) -> None:
    fd, tmp = tempfile.mkstemp(prefix=path.stem + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"), allow_nan=False)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _build_live(ticker: str, bars: Sequence, previous: Dict[str, Optional[dict]], provider=None) -> Optional[dict]:
    result = cones.build(ticker, bars)
    if result is None:
        return None
    out = {"cones": result["cones"],
           "quarterly": {**result["quarterly"],
                         "meta": {"schema": "quarterly_cones_v2", "anchors": result["quarterly_anchors"]}},
           "_source": result}
    live_bands = bands.live(ticker, bars)
    if live_bands:
        out["bands"] = {**live_bands, "_last_modified": round(time.time(), 3)}
    return out


def _build_replay(ticker: str, bars: Sequence, previous: Dict[str, Optional[dict]], provider=None) -> Optional[dict]:
    history = cones.history(ticker, bars, previous.get("historical_cones"))
    replay = bands.replay(ticker, bars, previous.get("bands_replay"))
    if not history and not replay:
        return None
    normalized = cones.normalize(bars)
    return {"historical_cones": history, "bands_replay": replay,
            "_source": {"weekdays": sorted(cones.trading_weekdays(normalized)),
                        "last_bar": normalized[-1].time}}


def _build_regime(ticker: str, bars: Sequence, previous: Dict[str, Optional[dict]], provider=None) -> Optional[dict]:
    daily = cones.normalize(bars)
    if not daily:
        return None
    tick = (provider.get_latest_ticks([ticker]) or {}).get(ticker) if provider is not None else None
    done = regimes.completed(daily, getattr(tick, "time", None))
    if not done:
        return None
    m15 = cones.normalize(provider.get_bars(ticker, "M15", regimes.FAST_BARS + 1) or []) if provider is not None else []
    slow_key = f"r{REGIME_VERSION}|{len(done)}|{done[-1].time:%Y-%m-%d}|{done[-1].close:.10g}"
    body = regimes.micro_payload(done, m15[:-1], previous.get("regime"), slow_key)   # [:-1]: the forming bar
    if body is None:
        return None
    return {"regime": body, "_source": {"weekdays": sorted(cones.trading_weekdays(daily)),
                                        "last_bar": daily[-1].time}}


BUILDERS: Dict[str, Callable] = {"live": _build_live, "regime": _build_regime, "replay": _build_replay}


def _m15_key(provider, ticker: str) -> str:
    """Time of the last completed 15-minute bar: the regime file follows it."""
    try:
        m15 = provider.get_bars(ticker, "M15", 2) or []
    except Exception:
        return ""
    return str(getattr(m15[0], "time", "")) if len(m15) >= 2 else ""


def update_ticker(ticker: str, provider, cache_dir: Optional[Path] = None, force: bool = False,
                  phases: Sequence[str] = ("live", "replay")) -> bool:
    """Rebuild one ticker's files if its latest daily bar changed.
    True when a file was written."""
    ticker = ticker.upper()
    cache_dir = cache_dir or _cache_dir()
    # The source is part of the signature: switching data sources rebuilds
    # the files even on the same day.
    source_id = f"{getattr(provider, 'provider_type', '?')}:{getattr(provider, 'provider_id', '?')}"
    latest = cones.normalize(provider.get_bars(ticker, "D1", 2) or [])
    if not latest:
        _discard_other_sources(ticker, cache_dir, source_id, phases)
        return False
    signature = f"v{ENGINE_VERSION}|{source_id}|{latest[-1].time.isoformat()}"
    daily_signature = signature
    bars = None
    wrote = False
    for phase in phases:
        signature = daily_signature
        if phase == "regime":
            signature = f"{daily_signature}|r{REGIME_VERSION}|{_m15_key(provider, ticker)}"
        if not force and _built.get((ticker, phase)) == signature:
            continue
        paths = {k: cache_dir / FILES[k][0].format(T=ticker) for k in PHASES[phase]}
        existing = {k: _read(p) for k, p in paths.items()}
        ours = [k for k, d in existing.items() if d is None or d.get("producer") == PRODUCER]
        if not ours or (not force and all(existing[k] is not None and existing[k].get("signature") == signature
                                          for k in ours)):
            _built[(ticker, phase)] = signature      # another producer's files, or ours are up to date
            continue
        if bars is None:
            bars = provider.get_bars(ticker, "D1", DAILY_BARS) or []
        previous = {k: (existing[k] if k in ours else None) for k in existing}
        result = BUILDERS[phase](ticker, bars, previous, provider)
        _built[(ticker, phase)] = signature
        if result is None:
            continue
        source = result.pop("_source")
        meta = {
            "ticker": ticker,
            "producer": PRODUCER,
            "engine_version": ENGINE_VERSION,
            "signature": signature,
            "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "source": {"provider": getattr(provider, "provider_type", "?"),
                       "last_bar": source["last_bar"].strftime("%Y-%m-%d %H:%M"),
                       "trading_weekdays": source["weekdays"]},
        }
        written = []
        for kind in ours:
            body = result.get(kind)
            if not body:
                continue
            payload = {**meta, **body}
            _write_atomic(paths[kind], payload)
            _remember(ticker, kind, payload)
            written.append(kind)
        if written:
            wrote = True
            log.info(f"{ticker}: {', '.join(written)} rebuilt (last daily bar {meta['source']['last_bar']})")
    return wrote


_macro_note = {"logged": 0.0}


def update_macro(cache_dir: Optional[Path] = None, download=None, force: bool = False) -> bool:
    """Rebuild the macro regime files when FRED has new data. True when
    they were written. Needs internet access to fred.stlouisfed.org; the
    last download is kept for when it can't be reached."""
    cache_dir = cache_dir or _cache_dir()
    path, tpath = cache_dir / MACRO_FILE, cache_dir / TRANSITIONS_FILE
    existing = _read(path)
    if existing is not None and existing.get("producer") != PRODUCER:
        return False                    # another producer's file
    try:
        data = {sid: fred.series(sid, cache_dir, download=download) for sid in regimes.MACRO_SERIES}
    except fred.FredError as e:
        if time.time() - _macro_note["logged"] > 3600:
            _macro_note["logged"] = time.time()
            log.info(f"Macro regime unavailable: {e} (needs fred.stlouisfed.org)")
        return False
    signature = f"r{REGIME_VERSION}|" + "|".join(f"{sid}:{s[-1][0]}" for sid, s in data.items() if s)
    if not force and existing is not None and existing.get("signature") == signature:
        return False
    built = regimes.macro_payload(data)
    if built is None:
        return False
    body, transitions = built
    meta = {"producer": PRODUCER, "engine_version": ENGINE_VERSION, "signature": signature,
            "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "source": {"provider": "fred", "series": list(regimes.MACRO_SERIES)}}
    _write_atomic(path, {**meta, **body})
    theirs = _read(tpath)
    if theirs is None or theirs.get("producer") == PRODUCER:
        _write_atomic(tpath, {**meta, **transitions})
    log.info(f"Macro regime rebuilt: {body['slow']['regime']} "
             f"({body['slow']['confidence']:.0%}, data to {body['slow']['as_of']})")
    return True


def _discard_other_sources(ticker: str, cache_dir: Path, source_id: str, phases: Sequence[str]) -> None:
    """The source has no bars for this ticker: remove our files for it that
    were built from another source's prices. Files of other producers, and
    ours from this same source (a passing outage), are kept."""
    removed = []
    for phase in phases:
        for kind in PHASES[phase]:
            path = cache_dir / FILES[kind][0].format(T=ticker)
            existing = _read(path)
            if not existing or existing.get("producer") != PRODUCER:
                continue
            if f"|{source_id}|" in str(existing.get("signature", "")):
                continue
            try:
                path.unlink()
            except OSError:
                continue
            _forget(ticker, kind)
            _built.pop((ticker, phase), None)
            removed.append(kind)
    if removed:
        log.info(f"{ticker}: {', '.join(removed)} removed (built from another data source; "
                 f"this one has no bars for {ticker})")


def _forget(ticker: str, kind: str) -> None:
    store = FILES[kind][1]
    if store is None:
        return
    try:
        from data_sync_client import get_sync_client
        get_sync_client()._get_store(store).pop(ticker, None)
    except Exception:
        pass


def request_pass() -> None:
    """Start the next pass now: the data source changed."""
    if _wake is not None:
        _wake.set()


def _remember(ticker: str, kind: str, payload: dict) -> None:
    """Hand the fresh payload to the sync client's in-memory store so the
    routes serve it immediately (the cache watcher may be disabled)."""
    store = FILES[kind][1]
    if store is None:
        return
    try:
        from data_sync_client import get_sync_client
        get_sync_client()._get_store(store)[ticker] = payload
    except Exception:
        pass


def _pulse_room_rebuild() -> None:
    """Rebuild the Pulse Room snapshot if its scanner is on (it reads the
    cones and bands files)."""
    try:
        from pulse_room.sync_hook import on_sync_complete
        on_sync_complete()
    except Exception:
        pass


async def _pass(app_state, phase: str, broadcast_event: Optional[Callable]) -> list:
    provider = getattr(app_state, "provider", None)
    cfg = getattr(app_state, "cfg_manager", None)
    if provider is None or not getattr(provider, "connected", False) or cfg is None:
        return []
    updated = []
    for ticker in cfg.get_active_universe():
        if getattr(app_state, "provider", None) is not provider:
            break                       # the data source changed: the next pass starts at once
        try:
            if await asyncio.to_thread(update_ticker, ticker, provider, None, False, (phase,)):
                updated.append(ticker)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning(f"{ticker}: {phase} analysis build failed: {e}")
    if updated and broadcast_event is not None:
        try:
            await broadcast_event({"type": "data_sync_complete", "source": "local_analysis",
                                   "phase": phase, "synced": len(updated), "tickers": updated})
        except Exception:
            pass
    return updated


async def _macro_pass(broadcast_event: Optional[Callable]) -> bool:
    try:
        wrote = await asyncio.to_thread(update_macro)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        log.warning(f"Macro regime build failed: {e}")
        return False
    if wrote and broadcast_event is not None:
        try:
            await broadcast_event({"type": "data_sync_complete", "source": "local_analysis",
                                   "phase": "macro", "synced": 1, "tickers": []})
        except Exception:
            pass
    return wrote


async def run_loop(app_state, broadcast_event: Optional[Callable] = None,
                   interval: float = CHECK_INTERVAL_SEC) -> None:
    global _wake
    _wake = asyncio.Event()
    await asyncio.sleep(START_DELAY_SEC)
    while True:
        _wake.clear()
        if await _pass(app_state, "live", broadcast_event):
            _pulse_room_rebuild()
        await _pass(app_state, "regime", broadcast_event)
        await _macro_pass(broadcast_event)
        await _pass(app_state, "replay", broadcast_event)
        try:
            await asyncio.wait_for(_wake.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass


def create_local_analysis_task(app_state, broadcast_event: Optional[Callable] = None):
    """Factory for data_server's lifespan; None when turned off."""
    if not enabled():
        log.info("Local analysis disabled (MK_LOCAL_ANALYSIS=0)")
        return None
    return lambda: run_loop(app_state, broadcast_event)
