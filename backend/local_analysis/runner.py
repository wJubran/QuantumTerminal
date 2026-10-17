# version: v1
"""
Keeps the analysis cache's cone files up to date from the active feed, so the
chart's CONES / BATES / QUARTERLY overlays work without a data server.

- Runs in the background (wired from data_server's lifespan). Every few
  minutes it looks at each universe ticker's latest daily bar and rebuilds
  that ticker's cones only when the bar changed, so normally once a day.
- Writes {TICKER}_cones.json and {TICKER}_quarterly_cones.json in the flat
  layout the cone routes and Pulse Room read, stamped
  "producer": "quantum-terminal-local". A file written by any other producer
  is never overwritten.
- MK_LOCAL_ANALYSIS=0 turns it off.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Optional

from . import cones

log = logging.getLogger("qt.local_analysis")

PRODUCER = "quantum-terminal-local"
ENGINE_VERSION = 1
DAILY_BARS = 900            # ~3.5 years on a 5-day calendar; covers four quarters plus a year of estimation
CHECK_INTERVAL_SEC = 300

# ticker → signature of the last build written (or found up to date) this run
_built: Dict[str, str] = {}


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
            json.dump(payload, f, separators=(",", ":"))
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def update_ticker(ticker: str, provider, cache_dir: Optional[Path] = None, force: bool = False) -> bool:
    """Rebuild one ticker's cone files if its latest daily bar changed.
    True when a file was written."""
    ticker = ticker.upper()
    cache_dir = cache_dir or _cache_dir()
    latest = cones.normalize(provider.get_bars(ticker, "D1", 2) or [])
    if not latest:
        return False
    signature = f"v{ENGINE_VERSION}|{latest[-1].time.isoformat()}"
    if not force and _built.get(ticker) == signature:
        return False

    paths = {"cones": cache_dir / f"{ticker}_cones.json",
             "quarterly": cache_dir / f"{ticker}_quarterly_cones.json"}
    existing = {k: _read(p) for k, p in paths.items()}
    ours = [k for k, d in existing.items() if d is None or d.get("producer") == PRODUCER]
    if not ours or (not force and all(existing[k] is not None and existing[k].get("signature") == signature
                                      for k in ours)):
        _built[ticker] = signature      # another producer's files, or ours are up to date
        return False

    result = cones.build(ticker, provider.get_bars(ticker, "D1", DAILY_BARS) or [])
    if result is None:
        return False
    meta = {
        "ticker": ticker,
        "producer": PRODUCER,
        "engine_version": ENGINE_VERSION,
        "signature": signature,
        "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": {"provider": getattr(provider, "provider_type", "?"),
                   "last_bar": result["last_bar"].strftime("%Y-%m-%d %H:%M"),
                   "trading_weekdays": result["weekdays"]},
    }
    wrote = False
    for kind, path in paths.items():
        if kind not in ours or not result[kind]:
            continue
        payload = {**meta, **result[kind]}
        _write_atomic(path, payload)
        _remember(ticker, kind, payload)
        wrote = True
    _built[ticker] = signature
    if wrote:
        log.info(f"{ticker}: cones rebuilt from {len(result['cones']) + len(result['quarterly'])} "
                 f"anchors×models (last daily bar {meta['source']['last_bar']})")
    return wrote


def _remember(ticker: str, kind: str, payload: dict) -> None:
    """Hand the fresh payload to the sync client's in-memory store so the
    cone routes serve it immediately (the cache watcher may be disabled)."""
    try:
        from data_sync_client import get_sync_client
        get_sync_client()._get_store("cones" if kind == "cones" else "quarterly_cones")[ticker] = payload
    except Exception:
        pass


async def run_loop(app_state, broadcast_event: Optional[Callable] = None,
                   interval: float = CHECK_INTERVAL_SEC) -> None:
    await asyncio.sleep(3)              # let the provider finish connecting
    while True:
        provider = getattr(app_state, "provider", None)
        cfg = getattr(app_state, "cfg_manager", None)
        if provider is not None and getattr(provider, "connected", False) and cfg is not None:
            updated = []
            for ticker in cfg.get_active_universe():
                try:
                    if await asyncio.to_thread(update_ticker, ticker, provider):
                        updated.append(ticker)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    log.warning(f"{ticker}: cone build failed: {e}")
            if updated and broadcast_event is not None:
                try:
                    await broadcast_event({"type": "data_sync_complete", "source": "local_analysis",
                                           "synced": len(updated), "tickers": updated})
                except Exception:
                    pass
        await asyncio.sleep(interval)


def create_local_analysis_task(app_state, broadcast_event: Optional[Callable] = None):
    """Factory for data_server's lifespan; None when turned off."""
    if not enabled():
        log.info("Local analysis disabled (MK_LOCAL_ANALYSIS=0)")
        return None
    return lambda: run_loop(app_state, broadcast_event)
