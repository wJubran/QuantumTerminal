# version: v2
"""
Keeps the analysis cache's files up to date from the active feed, so the
chart's CONES / BATES / QUARTERLY / BANDS overlays, the Pulse Room and the
Replay page work without a data server.

- Runs in the background (wired from data_server's lifespan). Every few
  minutes it looks at each universe ticker's latest daily bar and rebuilds
  that ticker's files only when the bar changed, so normally once a day.
- Two phases per pass, so the overlays appear first:
      live     {T}_cones.json, {T}_quarterly_cones.json, {T}_bands.json
      replay   {T}_historical_cones.json, {T}_bands_replay.json (Replay page)
- Files are stamped "producer": "quantum-terminal-local". A file written by
  any other producer is never overwritten.
- MK_LOCAL_ANALYSIS=0 turns it off.

v2 — bands, the Replay page's files, eight quarterly anchors with
     meta.anchors, a Pulse Room rebuild after new live files.
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

from . import bands, cones

log = logging.getLogger("qt.local_analysis")

PRODUCER = "quantum-terminal-local"
ENGINE_VERSION = 2
DAILY_BARS = 1200           # ~4.5 years of weekdays, ~3.3 of a 7-day calendar: 8 quarters + a year of estimation
CHECK_INTERVAL_SEC = 300

# kind → file name, in-memory store of the sync client (None: its route reads the disk)
FILES = {
    "cones": ("{T}_cones.json", "cones"),
    "quarterly": ("{T}_quarterly_cones.json", "quarterly_cones"),
    "bands": ("{T}_bands.json", "bands"),
    "historical_cones": ("{T}_historical_cones.json", "historical_cones"),
    "bands_replay": ("{T}_bands_replay.json", None),
}
PHASES = {
    "live": ("cones", "quarterly", "bands"),
    "replay": ("historical_cones", "bands_replay"),
}

# (ticker, phase) → signature of the last build written (or found up to date) this run
_built: Dict[Tuple[str, str], str] = {}


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


def _build_live(ticker: str, bars: Sequence, previous: Dict[str, Optional[dict]]) -> Optional[dict]:
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


def _build_replay(ticker: str, bars: Sequence, previous: Dict[str, Optional[dict]]) -> Optional[dict]:
    history = cones.history(ticker, bars, previous.get("historical_cones"))
    replay = bands.replay(ticker, bars, previous.get("bands_replay"))
    if not history and not replay:
        return None
    normalized = cones.normalize(bars)
    return {"historical_cones": history, "bands_replay": replay,
            "_source": {"weekdays": sorted(cones.trading_weekdays(normalized)),
                        "last_bar": normalized[-1].time}}


BUILDERS: Dict[str, Callable] = {"live": _build_live, "replay": _build_replay}


def update_ticker(ticker: str, provider, cache_dir: Optional[Path] = None, force: bool = False,
                  phases: Sequence[str] = ("live", "replay")) -> bool:
    """Rebuild one ticker's files if its latest daily bar changed.
    True when a file was written."""
    ticker = ticker.upper()
    cache_dir = cache_dir or _cache_dir()
    latest = cones.normalize(provider.get_bars(ticker, "D1", 2) or [])
    if not latest:
        return False
    signature = f"v{ENGINE_VERSION}|{latest[-1].time.isoformat()}"
    bars = None
    wrote = False
    for phase in phases:
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
        result = BUILDERS[phase](ticker, bars, previous)
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


async def run_loop(app_state, broadcast_event: Optional[Callable] = None,
                   interval: float = CHECK_INTERVAL_SEC) -> None:
    await asyncio.sleep(3)              # let the provider finish connecting
    while True:
        if await _pass(app_state, "live", broadcast_event):
            _pulse_room_rebuild()
        await _pass(app_state, "replay", broadcast_event)
        await asyncio.sleep(interval)


def create_local_analysis_task(app_state, broadcast_event: Optional[Callable] = None):
    """Factory for data_server's lifespan; None when turned off."""
    if not enabled():
        log.info("Local analysis disabled (MK_LOCAL_ANALYSIS=0)")
        return None
    return lambda: run_loop(app_state, broadcast_event)
