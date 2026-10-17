# version: v3
# v3 — consumer_config.ini AppData fallback comes from app_paths (every
#      platform, same dir as the rest of the backend).
"""
================================================================================
Quantum Terminal Consumer — Periodic Data Sync Poller
================================================================================
Background asyncio task that polls the VPS at a configurable interval and
broadcasts a 'data_sync_complete' WebSocket event whenever fresh data arrives.
This solves the problem where a long-running terminal would never re-check
the server after the initial startup gate.

Configurable via consumer_config.ini:
    [sync]
    poll_interval_seconds = 300

Default interval: 300s (5 minutes). Floor: 60s (no hammering the server).

Rule C1 compliance: this module performs ZERO calculations. It only re-runs
the same display-data sync as the startup gate (consumer_gate -> sync_all).

This module does NOT introduce any calculation triggers.
================================================================================
"""

import asyncio
import logging
import configparser
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

import app_paths  # v3: per-user app-data dir, shared by every module
from pulse_room.sync_hook import on_sync_complete as _pulse_on_sync_complete

log = logging.getLogger("qt.periodic_sync")

DEFAULT_INTERVAL_SECONDS = 300  # 5 minutes
MIN_INTERVAL_SECONDS = 60       # safety floor


def _read_interval() -> int:
    """
    Read sync.poll_interval_seconds from consumer_config.ini.
    Searches the same locations as data_sync_client._read_config().
    Returns DEFAULT_INTERVAL_SECONDS if not configured.
    Floor is enforced at MIN_INTERVAL_SECONDS.
    """
    project_root = Path(__file__).resolve().parent

    candidates = [
        project_root / "consumer_config.ini",
        project_root.parent / "consumer_config.ini",
    ]

    import sys as _sys
    if getattr(_sys, "frozen", False):
        candidates.append(Path(_sys.executable).parent / "consumer_config.ini")

    candidates.append(app_paths.app_data_dir() / "consumer_config.ini")

    for p in candidates:
        if not p.exists():
            continue
        try:
            cp = configparser.ConfigParser()
            cp.read(str(p), encoding="utf-8-sig")
            if cp.has_option("sync", "poll_interval_seconds"):
                val = cp.getint("sync", "poll_interval_seconds")
                return max(MIN_INTERVAL_SECONDS, val)
            break
        except Exception as e:
            log.warning(f"Could not parse sync interval from {p.name}: {e}")
            break

    return DEFAULT_INTERVAL_SECONDS


def create_periodic_sync_task(
    broadcast_event: Callable[[dict], Awaitable[None]],
) -> Callable:
    """
    Returns an async coroutine factory that polls sync_all() at a configurable
    interval. Pass the result to asyncio.create_task() inside the FastAPI
    lifespan.

    Usage in data_server.py lifespan:
        from periodic_sync import create_periodic_sync_task
        sync_task = create_periodic_sync_task(manager.broadcast_event)
        tasks.append(asyncio.create_task(sync_task()))

    Each tick the task:
        1. Calls data_sync_client.sync_all() in a worker thread
        2. Logs the result (synced / skipped / offline)
        3. If new files arrived (synced > 0), broadcasts WS event:
              {"type": "data_sync_complete", "synced": N, ...}
           Frontend (useTerminalData.js) listens and refreshes panels.

    Errors do not kill the task — they back off and retry on the next interval.
    """
    interval = _read_interval()
    log.info(f"Periodic sync task configured: interval={interval}s")

    async def _task():
        # Wait one full interval before first poll —
        # the startup gate has already done the initial sync.
        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return

        while True:
            try:
                from data_sync_client import get_sync_client
                client = get_sync_client()

                # sync_all() does blocking HTTP — run in a thread
                summary = await asyncio.to_thread(client.sync_all)

                synced = summary.get("synced", 0)
                skipped = summary.get("skipped", 0)
                offline = summary.get("offline_mode", False)

                log.info(
                    f"Periodic sync tick: synced={synced}, "
                    f"skipped={skipped}, offline={offline}"
                )

                # Only broadcast when fresh data actually arrived.
                # Skipping silent ticks keeps frontend quiet during quiet hours.
                if synced > 0:
                    try:
                        await broadcast_event({
                            "type": "data_sync_complete",
                            "synced": synced,
                            "skipped": skipped,
                            "offline_mode": offline,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    except Exception as e:
                        log.warning(f"Failed to broadcast data_sync_complete: {e}")

                    # Pulse Room auto-rebuild — only when fresh source data
                    # arrived. Fires only if scanner ON + watchlist non-empty
                    # (eligibility check is inside on_sync_complete itself);
                    # daemon thread, fire-and-forget; never breaks sync pipeline.
                    try:
                        _pulse_on_sync_complete()
                    except Exception:
                        log.exception("pulse_room.sync_hook threw")

            except asyncio.CancelledError:
                log.info("Periodic sync task cancelled")
                break
            except Exception as e:
                log.error(f"Periodic sync task error: {e}", exc_info=True)
                # Back off on error but never longer than the configured interval
                try:
                    await asyncio.sleep(min(interval, 120))
                except asyncio.CancelledError:
                    break
                continue

            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    return _task
