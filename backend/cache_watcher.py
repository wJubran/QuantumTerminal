# version: v4
"""
================================================================================
Quantum Terminal Consumer — Cache Directory Watcher
================================================================================
Async task that watches %APPDATA%\\QuantumTerminal\\cache\\ for JSON file changes and:
  1. Loads the changed file into the sync client's in-memory store.
  2. Broadcasts a 'data_sync_complete' WS event so the frontend re-fetches.

Purpose
-------
During the Data Center transition (and for local debugging) the user may drop
files directly into the cache dir. Without this watcher the running server
never re-reads disk after startup, so those drops are invisible until a full
restart. This watcher closes the gap.

It also gives live updates when sync_all() writes new cache files — the usual
periodic_sync broadcast happens too, but this provides a second, finer-grained
trigger (per-file, immediate) and covers the case where sync_all is not the
writer (manual drop, future DC auto-uploader, etc.).

Mechanism
---------
Polls os.stat() mtime on *.json in the cache dir (no new dependency). A file
must have a *stable* mtime for two consecutive ticks before we act on it —
this debounces partial-write races.

Poll interval defaults to 1 second (configurable). Zero compute, Rule C1 safe.

Config (consumer_config.ini)
----------------------------
    [sync]
    cache_watcher_enabled = true        ; set false to disable entirely
    cache_watcher_interval_seconds = 1  ; floor enforced at 0.25s

Integration
-----------
Wired from data_server.py lifespan, same pattern as periodic_sync. Takes the
WS broadcast_event callable. Cancellation honored via asyncio.CancelledError.

v2 — Deletions detected and propagated. When a file vanishes from the cache
     directory, the corresponding entry in the sync client's in-memory store is
     purged and the broadcast payload reports it via a "removed_files" list.
     Frontend treats this like any other data_sync_complete event → refetches
     and gets a 404/null → clears the overlay.

v3 — Filename parsing now delegates to data_sync_client.resolve_cache_filename
     so bare globals ("money_flow.json"), prefixed globals with multi-word
     categories ("GLOBAL_probability_state.json"), and the legacy
     GLOBAL_<lowercase_ticker>_<category>.json misnaming all route to the
     correct in-memory slot. Same resolver used by _load_all_from_cache at
     startup, ensuring watcher and loader stay consistent.

v4 — Watched dir and the consumer_config.ini fallback both come from
     app_paths (shared with data_sync_client and Pulse Room), on every
     platform rather than only when APPDATA is set.

Rule C1 compliance: this module performs ZERO calculations — it only reads
files already on disk and pushes WS events.
================================================================================
"""

import asyncio
import configparser
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable, Optional

import app_paths  # v4: per-user app-data + cache dirs, shared by every module

log = logging.getLogger("mk.cache_watcher")

DEFAULT_INTERVAL_SECONDS = 1.0
MIN_INTERVAL_SECONDS = 0.25

# Same filename pattern as data_sync_client._load_all_from_cache().
# Greedy first group + underscore-delimited category tail.
_FILE_PATTERN = re.compile(r'^(.+)_([a-z_]+)\.json$', re.IGNORECASE)


def _read_config() -> tuple[bool, float]:
    """Read cache_watcher_enabled + interval from consumer_config.ini.
    Returns (enabled, interval_seconds). Defaults: enabled=True, interval=1.0."""
    project_root = Path(__file__).resolve().parent

    candidates = [
        project_root / "consumer_config.ini",
        project_root.parent / "consumer_config.ini",
    ]

    import sys as _sys
    if getattr(_sys, "frozen", False):
        candidates.append(Path(_sys.executable).parent / "consumer_config.ini")

    candidates.append(app_paths.app_data_dir() / "consumer_config.ini")

    enabled = True
    interval = DEFAULT_INTERVAL_SECONDS

    for p in candidates:
        if not p.exists():
            continue
        try:
            cp = configparser.ConfigParser()
            cp.read(str(p), encoding="utf-8-sig")
            if cp.has_option("sync", "cache_watcher_enabled"):
                enabled = cp.getboolean("sync", "cache_watcher_enabled")
            if cp.has_option("sync", "cache_watcher_interval_seconds"):
                try:
                    interval = max(MIN_INTERVAL_SECONDS,
                                   cp.getfloat("sync", "cache_watcher_interval_seconds"))
                except (ValueError, TypeError):
                    pass
            break
        except Exception as e:
            log.warning(f"Could not parse cache_watcher config from {p.name}: {e}")
            break

    return enabled, interval


def _get_cache_dir() -> Optional[Path]:
    """Resolve the cache dir data_sync_client writes to (app_paths.cache_dir())."""
    try:
        return app_paths.cache_dir()
    except Exception:
        return None


def create_cache_watcher_task(
    broadcast_event: Callable[[dict], Awaitable[None]],
) -> Optional[Callable]:
    """
    Returns an async coroutine factory that watches the cache dir.
    Returns None if disabled via config, so the caller can skip task creation.

    Usage in data_server.py lifespan:
        from cache_watcher import create_cache_watcher_task
        watcher = create_cache_watcher_task(manager.broadcast_event)
        if watcher:
            tasks.append(asyncio.create_task(watcher()))
    """
    enabled, interval = _read_config()
    if not enabled:
        log.info("Cache watcher disabled via config")
        return None

    cache_dir = _get_cache_dir()
    if cache_dir is None:
        log.warning("Cache watcher: cannot resolve cache dir — disabled")
        return None

    log.info(f"Cache watcher configured: dir={cache_dir}, interval={interval}s")

    async def _task():
        # Track stable mtimes (the "known good" state we've already processed).
        stable_mtimes: dict[str, int] = {}
        # Track the most-recent-seen mtime so we can require two consecutive
        # equal readings before acting (debounce against partial writes).
        last_seen: dict[str, int] = {}

        # Seed stable_mtimes with everything currently on disk so we don't
        # fire a flood of "data_sync_complete" events on startup.
        try:
            if cache_dir.exists():
                for f in cache_dir.glob("*.json"):
                    if f.name.startswith("_"):
                        continue
                    try:
                        stable_mtimes[f.name] = f.stat().st_mtime_ns
                    except OSError:
                        continue
        except Exception as e:
            log.warning(f"Cache watcher seed failed: {e}")

        while True:
            try:
                if not cache_dir.exists():
                    await asyncio.sleep(interval)
                    continue

                changed: list[Path] = []
                current_names: set[str] = set()

                for f in cache_dir.glob("*.json"):
                    if f.name.startswith("_"):
                        continue
                    current_names.add(f.name)
                    try:
                        mt = f.stat().st_mtime_ns
                    except OSError:
                        continue

                    prev_seen = last_seen.get(f.name)
                    prev_stable = stable_mtimes.get(f.name)

                    if mt == prev_stable:
                        # Already processed at this mtime — nothing to do.
                        last_seen[f.name] = mt
                        continue

                    if prev_seen == mt:
                        # Stable for 2 ticks at a new mtime → accept.
                        changed.append(f)
                        stable_mtimes[f.name] = mt
                    last_seen[f.name] = mt

                # Detect deletions: files that were known-stable last tick but
                # are no longer in the directory. Drop bookkeeping AND purge
                # the sync client's in-memory store so /api endpoints stop
                # serving the stale data.
                deleted: list[str] = []
                for gone in list(stable_mtimes.keys()):
                    if gone not in current_names:
                        deleted.append(gone)
                        stable_mtimes.pop(gone, None)
                        last_seen.pop(gone, None)

                if changed or deleted:
                    await _handle_changes(changed, deleted, broadcast_event)

            except asyncio.CancelledError:
                log.info("Cache watcher task cancelled")
                break
            except Exception as e:
                log.error(f"Cache watcher tick error: {e}", exc_info=True)

            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    return _task


async def _handle_changes(
    changed: list[Path],
    deleted: list[str],
    broadcast_event: Callable[[dict], Awaitable[None]],
) -> None:
    """Reconcile the sync client's in-memory store with disk, then broadcast."""
    try:
        from data_sync_client import get_sync_client
        client = get_sync_client()
    except Exception as e:
        log.warning(f"Cache watcher: sync client unavailable: {e}")
        return

    # v3: use data_sync_client's shared resolver for consistent naming rules.
    try:
        from data_sync_client import resolve_cache_filename
    except Exception:
        resolve_cache_filename = None

    def _resolve(fname: str):
        if not fname.lower().endswith(".json"):
            return None
        stem = fname[:-5]
        if resolve_cache_filename:
            return resolve_cache_filename(stem)
        # Fallback — legacy regex if sync client unavailable for any reason.
        m = _FILE_PATTERN.match(fname)
        return (m.group(1).upper(), m.group(2).lower()) if m else None

    loaded: list[dict] = []
    for path in changed:
        resolved = _resolve(path.name)
        if not resolved:
            continue
        ticker, category = resolved

        try:
            with path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as e:
            log.warning(f"Cache watcher: failed to read {path.name}: {e}")
            continue

        try:
            client._get_store(category)[ticker] = data
            client._known_categories.add(category)
            loaded.append({"file": path.name, "ticker": ticker, "category": category})
            log.info(f"Cache watcher: reloaded {path.name} → ({ticker}, {category})")
        except Exception as e:
            log.warning(f"Cache watcher: store update failed for {path.name}: {e}")

    removed: list[dict] = []
    for fname in deleted:
        resolved = _resolve(fname)
        if not resolved:
            continue
        ticker, category = resolved
        try:
            store = client._get_store(category)
            if ticker in store:
                store.pop(ticker, None)
                removed.append({"file": fname, "ticker": ticker, "category": category})
                log.info(f"Cache watcher: purged {fname} (deleted from disk)")
        except Exception as e:
            log.warning(f"Cache watcher: store purge failed for {fname}: {e}")

    if not loaded and not removed:
        return

    try:
        await broadcast_event({
            "type": "data_sync_complete",
            "synced": len(loaded),
            "deleted": len(removed),
            "source": "cache_watcher",
            "files": [x["file"] for x in loaded],
            "removed_files": [x["file"] for x in removed],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        log.warning(f"Cache watcher: broadcast failed: {e}")
