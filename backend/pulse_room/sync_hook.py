# version: v2
"""Sync-completion hook for Pulse Room.

Called by periodic_sync.py after a successful background sync.
If scanner is ON and watchlist non-empty, rebuild the snapshot
in a daemon thread (non-blocking to the sync caller).
"""

import logging
import threading

from . import builder, state


log = logging.getLogger("qt.pulse_room.sync_hook")


def on_sync_complete() -> None:
    """Fire-and-forget: spawn a thread that rebuilds if eligible."""
    threading.Thread(target=_rebuild_if_eligible, daemon=True).start()


def _rebuild_if_eligible() -> None:
    try:
        scanner = state.load_scanner()
        if not scanner.get("enabled"):
            return
        wl = state.load_watchlist()
        if not wl.get("assets"):
            return
        # Don't fight a user-initiated Calculate. If the lock is held, skip
        # this rebuild silently — the user's Calculate will produce a fresh
        # snapshot momentarily.
        if not state.calc_lock.acquire(blocking=False):
            log.info("calc lock held — skipping auto-rebuild")
            return
        try:
            log.info("auto-rebuilding pulse snapshot after sync")
            builder.build_snapshot(wl, write=True)
        finally:
            state.calc_lock.release()
    except Exception:
        log.exception("auto-rebuild failed; existing snapshot retained")
