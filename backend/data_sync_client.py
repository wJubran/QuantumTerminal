# version: v12
"""
================================================================================
Quantum Terminal Consumer — Data Sync Client
================================================================================
Downloads pre-computed data from the Quantum Terminal VPS and caches it locally
for offline resilience.

v11 — Parallel sync via httpx + asyncio.gather. The manifest path now
      issues all per-file GETs concurrently (semaphore-bounded at 8) using
      a single httpx.AsyncClient. On a typical fresh install (~150 files),
      drops total sync time from ~3 min serial to ~20-30 s. Public
      sync_all() stays a synchronous method; it spins up its own event
      loop via asyncio.run() so existing callers (lifespan thread,
      asyncio.to_thread wrappers in route handlers, periodic_sync) keep
      working unchanged. The legacy path (manifest 404) stays serial
      using `requests` — it's rarely hit in production and not worth the
      additional surface area.

v10 — Download-speed instrumentation. Adds `sync_bytes_total` (cumulative
      bytes synced this run) to /api/sync/status. The frontend remembers
      the previous poll's value + timestamp via useRef and computes a
      live KB/s or MB/s readout next to the progress bar. Each successful
      download adds the JSON-encoded payload size — an estimate (no
      transport headers / compression accounted for) but close enough
      for a user-visible speed indicator.

v9 — Sync-progress instrumentation. Tracks `_sync_total` (files the
     manifest says we need) and `_sync_done` (files completed so far),
     plus exposes both alongside `sync_in_progress` in /api/sync/status.
     Drives the new top-toolbar download progress bar in the consumer UI.

v8 — Async-handler fix. The /api/sync/refresh, /api/sync/refresh/{ticker}
     and /api/sync/clear-cache routes were declared `async def` but called
     the synchronous `client.sync_all()` / `client.sync_ticker()` /
     `client.clear_cache()` directly. That FROZE the FastAPI event loop
     for the entire duration of sync (5+ min on first install), starving
     every other endpoint — including /api/sync/status, which is what the
     LoginScreen v9 fast-path polls to detect format-version mismatch.
     Symptom: user passes login, sees "Verifying data version…" forever
     because the status poll was queued behind the blocked refresh.
     Fix: wrap every blocking sync call in `asyncio.to_thread()` so it
     runs on the worker thread pool while the event loop stays free to
     serve other requests.

v7 — Startup-latency fix. Previous behavior made the initial sync take up
     to 15 minutes for users whose servers returned persistent 5xx on
     specific endpoints (notably /data/{ticker}/probfield returning 500
     instead of 404 — known server bug). Each failing endpoint cost up to
     70 s (30 s timeout + 10 s sleep + 30 s retry). Changes:
       • Per-file `timeout` dropped 30 s → 8 s. Consumer is display-only;
         a healthy server responds in well under a second.
       • Retry sleep on 5xx dropped 10 s → 1 s (retains transient-blip
         protection without stalling).
       • Manifest fetch timeout dropped 15 s → 8 s (same reasoning).
     Worst case per failing endpoint now ~17 s (8 + 1 + 8) vs prior 70 s.
     Across a universe with several persistent 500s this turns a 15-min
     startup into roughly ~2 min.

v2.1 — Incremental sync with full data category support:
    - Manifest-first sync (only download what changed)
    - If-Modified-Since headers (server returns 304)
    - Categories: cones, options, probfield, bands, fundamentals, signals,
      lifecycle, weeklystate
    - Global data (fundamentals, signals, etc.) stored under ticker "GLOBAL"
    - Falls back to legacy full sync if manifest unavailable

v2 — Data Center transition: bands externalized to {TICKER}_bands.json
     (previously nested inside {TICKER}_cones.json). Bands is now a first-class
     per-ticker category synced alongside cones/options/probfield.

v6 — Fix: `total` counter in _load_all_from_cache was referenced but never
     initialized after the v5 rewrite, causing an UnboundLocalError the first
     time the sweep matched a file. This crashed the end-of-sync_all orphan
     sweep (added in v5), so misnamed cache files like GLOBAL_eurusd_bands.json
     never got loaded → bands empty for those tickers. Just adds `total = 0`
     above the loop.

v5 — _load_all_from_cache() is now also invoked at the END of every
     successful sync_all() (online path), not just on offline/failure. The
     manifest-driven sync only knows about files the server advertises —
     orphan cache files (e.g. legacy GLOBAL_<tkr>_bands.json drops that
     aren't in the manifest) were never getting into the in-memory stores.
     Now they are, via the shared resolver. HTTP-fresh data is still written
     first, so the reload confirms the same content for advertised files
     and adds any orphans as a second pass. Slot guard prevents the reload
     from clobbering fresher HTTP data.

v4 — Filename-resolution helper `resolve_cache_filename()` added and used by
     `_load_all_from_cache()` (and reused from cache_watcher.py). Handles:
       - bare globals                  e.g. "money_flow.json"
       - prefixed globals              e.g. "GLOBAL_probability_state.json"
                                       (fixes mis-parse of multi-word categories)
       - legacy per-ticker misnaming   e.g. "GLOBAL_eurusd_bands.json" →
                                       reroutes in-memory to (EURUSD, bands)
       - normal per-ticker             e.g. "EURUSD_bands.json"
     Keeps stale/mislabeled cache files usable without touching disk.

v3 — Data Center transition: five new GLOBAL categories registered for the
     forward-looking probability layer (shipped under temp_out/probability/
     on the DC side, served as /data/GLOBAL/<key> and cached as
     GLOBAL_<key>.json):
       - probability_state    (aggregator containing the 4 below)
       - regime_transitions   (Markov model between regimes)
       - score_cones          (per-asset probability cones for 15 tickers)
       - leading_composite    (leading vs coincident indicator composite)
       - liquidity_forecast   (6-mo net-liquidity projection with cones)
     Each file is independently synced, watched, and served — lets the DC
     recompute components at different cadences without redownloading the
     whole bundle. Exposed to the frontend via /api/data/global/{key}.

Storage:
    %APPDATA%\\QuantumTerminal\\cache\\{TICKER}_cones.json
    %APPDATA%\\QuantumTerminal\\cache\\{TICKER}_bands.json
    %APPDATA%\\QuantumTerminal\\cache\\{TICKER}_options.json
    %APPDATA%\\QuantumTerminal\\cache\\{TICKER}_probfield.json
    %APPDATA%\\QuantumTerminal\\cache\\GLOBAL_fundamentals.json
    %APPDATA%\\QuantumTerminal\\cache\\GLOBAL_signals.json
    %APPDATA%\\QuantumTerminal\\cache\\GLOBAL_lifecycle.json
    %APPDATA%\\QuantumTerminal\\cache\\GLOBAL_weeklystate.json
    %APPDATA%\\QuantumTerminal\\cache\\_data_status.json
    %APPDATA%\\QuantumTerminal\\cache\\_sync_timestamps.json

This module does NOT introduce any calculation triggers.
================================================================================
"""

import asyncio  # v8: needed for asyncio.to_thread to keep async handlers from blocking
import json
import logging
import os
import time
import configparser
from pathlib import Path

# AppData directory name.
APP_DIR = os.environ.get("MK_APP_DIR_NAME", "QuantumTerminal")
from datetime import datetime, timezone, timedelta
from email.utils import formatdate
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum

log = logging.getLogger("qt.data_sync")

PROJECT_ROOT = Path(__file__).resolve().parent

# -- Format version this client expects (Rule C6) --
EXPECTED_MAJOR_VERSION = 1

# Per-ticker data categories (well-known types)
TICKER_CATEGORIES = ("cones", "options", "probfield", "bands")

# Known global categories — but the system accepts ANY category from the manifest.
# New global files are auto-discovered; no code change needed.
KNOWN_GLOBAL = ("fundamentals", "fundamental_state", "daily_signals",
                "signal_lifecycle", "weekly_state", "money_flow",
                "central_bank_rates", "macro_sectors", "macro_countries", "macro_flows",
                "macro_sector_flows",
                # v3: probability layer (Data Center forward-looking globals)
                "probability_state", "regime_transitions", "score_cones",
                "leading_composite", "liquidity_forecast")

# ── Global data endpoints (universe-level, not per-ticker) ──────────────────
GLOBAL_ENDPOINTS = {
    "fundamentals":            "/data/GLOBAL/fundamentals",
    "fundamental_state":       "/data/GLOBAL/fundamental_state",
    "money_flow":              "/data/GLOBAL/money_flow",
    "macro_sectors":           "/data/GLOBAL/macro_sectors",
    "macro_countries":         "/data/GLOBAL/macro_countries",
    "macro_flows":             "/data/GLOBAL/macro_flows",
    "macro_sector_flows":      "/data/GLOBAL/global_macro_sector_flows",
    "central_bank_rates":      "/data/GLOBAL/central_bank_rates",
    # v3: probability layer
    "probability_state":       "/data/GLOBAL/probability_state",
    "regime_transitions":      "/data/GLOBAL/regime_transitions",
    "score_cones":             "/data/GLOBAL/score_cones",
    "leading_composite":       "/data/GLOBAL/leading_composite",
    "liquidity_forecast":      "/data/GLOBAL/liquidity_forecast",
}

# Cache filenames for global data
GLOBAL_CACHE_NAMES = {
    "fundamentals":       "GLOBAL_fundamentals.json",
    "fundamental_state":  "GLOBAL_fundamental_state.json",
    "money_flow":         "GLOBAL_money_flow.json",
    "macro_sectors":      "GLOBAL_macro_sectors.json",
    "macro_countries":    "GLOBAL_macro_countries.json",
    "macro_flows":        "GLOBAL_macro_flows.json",
    "macro_sector_flows": "GLOBAL_macro_sector_flows.json",
    "central_bank_rates": "GLOBAL_central_bank_rates.json",
    # v3: probability layer
    "probability_state":  "GLOBAL_probability_state.json",
    "regime_transitions": "GLOBAL_regime_transitions.json",
    "score_cones":        "GLOBAL_score_cones.json",
    "leading_composite":  "GLOBAL_leading_composite.json",
    "liquidity_forecast": "GLOBAL_liquidity_forecast.json",
}


# ============================================================
# 1. STALENESS LEVELS (Rule C4)
# ============================================================

class FreshnessLevel(str, Enum):
    FRESH = "fresh"
    WARNING = "warning"
    ERROR = "error"
    UNKNOWN = "unknown"


@dataclass
class StalenessInfo:
    ticker: str
    computed_at: Optional[str] = None
    age_hours: float = 0.0
    level: FreshnessLevel = FreshnessLevel.UNKNOWN
    display_date: str = "N/A"


# ============================================================
# 2. CONFIG
# ============================================================

def _read_config() -> configparser.ConfigParser:
    import platform as _plat
    # Values are literal: "%APPDATA%" is a Windows-style path, not configparser
    # interpolation (which rejected the built-in defaults when no ini exists).
    config = configparser.ConfigParser(interpolation=None)

    search_paths = [
        PROJECT_ROOT / "consumer_config.ini",
        PROJECT_ROOT.parent / "consumer_config.ini",
    ]

    import sys as _sys
    if getattr(_sys, 'frozen', False):
        search_paths.append(Path(_sys.executable).parent / "consumer_config.ini")

    if _plat.system() == "Windows":
        import os as _os
        appdata = _os.environ.get("APPDATA", "")
        if appdata:
            search_paths.append(Path(appdata) / APP_DIR / "consumer_config.ini")

    for p in _sys.path:
        candidate = Path(p) / "consumer_config.ini"
        if candidate not in search_paths:
            search_paths.append(candidate)

    for path in search_paths:
        if path.exists():
            config.read(str(path), encoding="utf-8-sig")
            return config

    config.read_dict({
        "data": {
            "cache_dir": f"%APPDATA%\\{APP_DIR}\\cache",
            "stale_warning_hours": "48",
            "stale_error_hours": "72",
        },
    })
    return config


def _get_stale_thresholds() -> Tuple[float, float]:
    cfg = _read_config()
    warn = float(cfg.get("data", "stale_warning_hours", fallback="48"))
    err = float(cfg.get("data", "stale_error_hours", fallback="72"))
    return warn, err


# ============================================================
# 3. CACHE DIRECTORY
# ============================================================

def _get_cache_dir() -> Path:
    import platform, os
    if platform.system() == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            base = Path(appdata) / APP_DIR / "cache"
        else:
            base = Path.home() / "AppData" / "Roaming" / APP_DIR / "cache"
    else:
        base = Path.home() / ".QuantumTerminal" / "cache"

    base.mkdir(parents=True, exist_ok=True)
    return base


def _cache_path(ticker: str, data_type: str) -> Path:
    return _get_cache_dir() / f"{ticker.upper()}_{data_type}.json"


def _status_cache_path() -> Path:
    return _get_cache_dir() / "_data_status.json"


def _sync_timestamps_path() -> Path:
    return _get_cache_dir() / "_sync_timestamps.json"


# ============================================================
# 4. CACHE I/O
# ============================================================

def _write_cache(path: Path, data: dict):
    try:
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    except Exception as e:
        log.warning(f"Failed to write cache {path.name}: {e}")


def _read_cache(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning(f"Failed to read cache {path.name}: {e}")
        return None


# ============================================================
# 5. SYNC TIMESTAMP TRACKER
# ============================================================

def _load_sync_timestamps() -> dict:
    data = _read_cache(_sync_timestamps_path())
    return data if data else {}


def _save_sync_timestamps(timestamps: dict):
    _write_cache(_sync_timestamps_path(), timestamps)


def _ts_key(category: str, ticker: str) -> str:
    return f"{category}:{ticker.upper()}"


# v4: single source of truth for parsing cache filenames. Returns (ticker, category)
# or None. Handles bare globals, prefixed globals (incl. multi-word categories),
# legacy GLOBAL_<lowercase_ticker>_<category> misnaming, and normal per-ticker.
def resolve_cache_filename(stem: str):
    """Map a cache filename stem (without .json) to (ticker, category).

    Examples:
        "EURUSD_bands"                      → ("EURUSD", "bands")
        "GLOBAL_fundamentals"               → ("GLOBAL", "fundamentals")
        "GLOBAL_fundamental_state"          → ("GLOBAL", "fundamental_state")
        "GLOBAL_probability_state"          → ("GLOBAL", "probability_state")
        "GLOBAL_money_flow"                 → ("GLOBAL", "money_flow")
        "GLOBAL_eurusd_bands"               → ("EURUSD", "bands")   [legacy reroute]
        "GLOBAL_xauusd_historical_cones"    → ("XAUUSD", "historical_cones") [legacy reroute]
        "money_flow"                        → ("GLOBAL", "money_flow")  [bare global]
        "probability_state"                 → ("GLOBAL", "probability_state")  [bare global]
    """
    import re as _re
    if not stem:
        return None
    low = stem.lower()
    known_global_cats = set(KNOWN_GLOBAL) | set(GLOBAL_ENDPOINTS.keys())

    # (a) Bare global — DC writes "money_flow.json" instead of "GLOBAL_money_flow.json".
    if low in known_global_cats:
        return ("GLOBAL", low)

    # (b) Prefixed global — "GLOBAL_<known_cat>". Must come BEFORE the greedy
    #     regex (which would misparse multi-word categories).
    if low.startswith("global_"):
        suffix = low[len("global_"):]
        if suffix in known_global_cats:
            return ("GLOBAL", suffix)
        # (c) Legacy misnaming — "GLOBAL_<lowercase_ticker>_<category>".
        m = _re.match(r'^([a-z0-9]+)_([a-z_]+)$', suffix)
        if m:
            return (m.group(1).upper(), m.group(2))
        return None

    # (d) Normal per-ticker — greedy split on the last "_<category>" suffix.
    m = _re.match(r'^(.+)_([a-z_]+)$', stem, _re.IGNORECASE)
    if m:
        return (m.group(1).upper(), m.group(2).lower())
    return None


# ============================================================
# 6. FORMAT VERSION CHECK (Rule C6)
# ============================================================

def _check_format_version(data: dict) -> bool:
    """Telemetry only — logs format_version but never gates (Rule C6 reversal 2026-05-03)."""
    version_str = data.get("format_version", "1.0")
    try:
        major = int(version_str.split(".")[0])
        if major != EXPECTED_MAJOR_VERSION:
            log.info(
                f"format_version telemetry: server={version_str}, baseline major={EXPECTED_MAJOR_VERSION}"
            )
    except (ValueError, IndexError):
        log.warning(f"Could not parse format_version: {version_str}")
    return True


# ============================================================
# 7. STALENESS CALCULATOR (Rule C4)
# ============================================================

def _compute_staleness(computed_at: Optional[str], ticker: str) -> StalenessInfo:
    if not computed_at:
        return StalenessInfo(ticker=ticker)

    try:
        ts = datetime.fromisoformat(computed_at.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        age = (now - ts).total_seconds() / 3600.0

        warn_h, err_h = _get_stale_thresholds()

        if age > err_h:
            level = FreshnessLevel.ERROR
        elif age > warn_h:
            level = FreshnessLevel.WARNING
        else:
            level = FreshnessLevel.FRESH

        display_date = ts.strftime("%Y-%m-%d")

        return StalenessInfo(
            ticker=ticker,
            computed_at=computed_at,
            age_hours=round(age, 1),
            level=level,
            display_date=display_date,
        )
    except Exception:
        return StalenessInfo(ticker=ticker, computed_at=computed_at)


# ============================================================
# 8. DATA SYNC CLIENT
# ============================================================

class DataSyncClient:
    """
    Singleton data sync client with incremental sync.

    v2.1 flow (sync_all):
        1. GET /data/manifest -> per-file metadata with updated_at
        2. Compare each file's updated_at against local _sync_timestamps.json
        3. Only download files where server version is newer
        4. Each request includes If-Modified-Since header (server returns 304)
        5. Global data (fundamentals, signals, etc.) fetched as GLOBAL ticker
        6. On any failure -> fall back to cache (Rule C5)
    """

    def __init__(self):
        # In-memory data stores by category (dynamic — no hardcoded list)
        self._stores: Dict[str, Dict[str, dict]] = {}
        self._data_status: Optional[dict] = None
        self._sync_errors: List[str] = []
        self._format_version_ok = True
        self._offline_mode = False
        self._last_synced_at: Optional[str] = None
        # Tracks background sync activity so the terminal top-bar pill can
        # show "SYNCING" / "READY" without the user being stuck on a loader.
        self._sync_in_progress: bool = False
        # v9: progress counters — drive the toolbar progress bar.
        self._sync_total: int = 0
        self._sync_done: int = 0
        # v10: cumulative bytes downloaded this sync — frontend computes
        #   speed from the delta between two consecutive /api/sync/status polls.
        self._sync_bytes_total: int = 0
        self._sync_timestamps: Dict[str, str] = _load_sync_timestamps()
        # Track which categories we've seen (from manifest or cache)
        self._known_categories: set = set(TICKER_CATEGORIES)

    def _get_store(self, category: str) -> Dict[str, dict]:
        if category not in self._stores:
            self._stores[category] = {}
        return self._stores[category]

    # ---- Public: sync all (manifest-first) ----

    def sync_all(self) -> dict:
        """Public entry — runs the async core in a fresh event loop via
        asyncio.run() so existing synchronous callers stay unchanged.
        Caller MUST NOT be inside a running event loop; wrap with
        asyncio.to_thread(client.sync_all) if calling from async context."""
        self._sync_in_progress = True
        # v9: reset counters on each entry so a re-sync starts at 0.
        self._sync_total = 0
        self._sync_done  = 0
        # v10: reset cumulative bytes too.
        self._sync_bytes_total = 0
        try:
            return asyncio.run(self._sync_all_async())
        finally:
            self._sync_in_progress = False
            # v9: clamp `done` to `total` so the bar reads 100% on completion
            #     even if the manifest path bailed out before populating total.
            if self._sync_total > 0:
                self._sync_done = self._sync_total

    async def _sync_all_async(self) -> dict:
        """v11: parallel manifest-based sync. Issues all per-file GETs
        concurrently via httpx.AsyncClient + asyncio.gather, semaphore-
        bounded at 8 to avoid hammering the server. Falls back to the
        synchronous legacy path on manifest 404."""
        import httpx

        self._sync_errors = []
        summary = {"offline_mode": False, "format_version_ok": True,
                   "synced": 0, "skipped": 0}

        # Quantum Terminal: No auth required — load from cache directly.
        jwt = ""

        if not jwt:
            log.info("Analysis data: no data server sync — reading the local cache (Rule C5)")
            self._offline_mode = True
            summary["offline_mode"] = True
            self._load_all_from_cache()
            return summary

        base_url = _read_config().get("server", "base_url", fallback="").rstrip("/")
        headers = {"Authorization": f"Bearer {jwt}"}
        timeout = httpx.Timeout(connect=8.0, read=8.0, write=8.0, pool=8.0)
        # Pool limits — keep headroom over the semaphore concurrency so we
        # never starve.
        limits = httpx.Limits(max_connections=20, max_keepalive_connections=12)

        async with httpx.AsyncClient(base_url=base_url, headers=headers,
                                      timeout=timeout, limits=limits) as http:
            # Step 1: manifest
            try:
                r = await http.get("/data/manifest")
            except Exception as e:
                log.warning(f"Manifest unreachable: {e}")
                self._offline_mode = True
                summary["offline_mode"] = True
                self._load_all_from_cache()
                return summary

            m_status = r.status_code

            if m_status in (401, 403):
                log.warning(f"Auth error during data sync (HTTP {m_status})")
                self._load_all_from_cache()
                return summary

            if m_status == 404:
                log.info("Manifest not found — falling back to legacy serial sync")
                # Legacy path is sync (uses requests) — run it on a worker thread.
                return await asyncio.to_thread(self._sync_all_legacy_sync, summary)

            if m_status != 200:
                log.warning(f"Manifest failed (HTTP {m_status}) — using cache")
                self._offline_mode = True
                summary["offline_mode"] = True
                self._load_all_from_cache()
                return summary

            try:
                manifest = r.json()
            except Exception as e:
                log.warning(f"Manifest JSON parse failed: {e}")
                self._offline_mode = True
                summary["offline_mode"] = True
                self._load_all_from_cache()
                return summary

            # Step 2: format-version check at the manifest level.
            if not _check_format_version(manifest):
                self._format_version_ok = False
                summary["format_version_ok"] = False
                return summary

            # Step 3: parallel downloads.
            server_files = manifest.get("files", {})
            self._sync_total = sum(len(c) for c in server_files.values())
            self._sync_done  = 0

            sem = asyncio.Semaphore(8)
            tasks = []

            async def fetch_one(ticker: str, category: str, server_updated: str):
                async with sem:
                    local_key = _ts_key(category, ticker)
                    local_updated = self._sync_timestamps.get(local_key, "")
                    # Skip if local is current
                    if local_updated and server_updated and local_updated >= server_updated:
                        cached = _read_cache(_cache_path(ticker, category))
                        if cached:
                            self._get_store(category)[ticker.upper()] = cached
                        summary["skipped"] += 1
                        self._sync_done += 1
                        return
                    result = await self._sync_one_async(http, ticker, category)
                    if result in ("synced", "not_modified"):
                        self._sync_timestamps[local_key] = server_updated
                        if result == "not_modified":
                            cached = _read_cache(_cache_path(ticker, category))
                            if cached:
                                self._get_store(category)[ticker.upper()] = cached
                            summary["skipped"] += 1
                        else:
                            summary["synced"] += 1
                    self._sync_done += 1

            for category, cat_files in server_files.items():
                self._known_categories.add(category)
                for ticker, meta in cat_files.items():
                    tasks.append(fetch_one(ticker, category, meta.get("updated_at", "")))

            await asyncio.gather(*tasks, return_exceptions=True)

        _save_sync_timestamps(self._sync_timestamps)
        # Sweep cache for orphan files (legacy misnaming, manual drops).
        self._load_all_from_cache(skip_existing=True)

        log.info(f"Parallel sync: {summary['synced']} downloaded, {summary['skipped']} skipped (concurrency=8)")
        self._last_synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        return summary

    async def _sync_one_async(self, http, ticker: str, data_type: str) -> str:
        """v11: async equivalent of _sync_one using httpx. Same retry / 304 /
        404 / 5xx behavior as the sync version."""
        canonical = ticker.upper()
        endpoint = f"/data/{canonical}/{data_type}"

        extra_headers = {}
        local_key = _ts_key(data_type, canonical)
        local_ts = self._sync_timestamps.get(local_key)
        if local_ts:
            try:
                ts_dt = datetime.fromisoformat(local_ts)
                extra_headers["If-Modified-Since"] = formatdate(ts_dt.timestamp(), usegmt=True)
            except (ValueError, TypeError):
                pass

        async def _do_request():
            return await http.get(endpoint, headers=extra_headers)

        try:
            r = await _do_request()
        except Exception as e:
            log.warning(f"Sync request failed for {canonical}/{data_type}: {e}")
            await asyncio.sleep(1)
            try:
                r = await _do_request()
            except Exception as e2:
                log.warning(f"Sync retry failed: {e2}")
                cached = _read_cache(_cache_path(canonical, data_type))
                if cached:
                    self._get_store(data_type)[canonical] = cached
                    return "cached"
                return "failed"

        status = r.status_code

        # v8: retry once on 5xx with a short sleep (matches sync version).
        if status >= 500:
            log.warning(f"Server error {status} for {endpoint} — retrying in 1s")
            await asyncio.sleep(1)
            try:
                r = await _do_request()
                status = r.status_code
            except Exception:
                pass

        if status == 304:
            return "not_modified"

        if status == 200:
            try:
                data = r.json()
            except Exception as e:
                log.warning(f"JSON parse failed for {canonical}/{data_type}: {e}")
                return "failed"
            if not _check_format_version(data):
                self._format_version_ok = False
                return "failed"
            self._get_store(data_type)[canonical] = data
            _write_cache(_cache_path(canonical, data_type), data)
            try:
                self._sync_bytes_total += len(json.dumps(data).encode("utf-8"))
            except Exception:
                pass
            return "synced"

        if status == 404:
            return "cached"

        # Other / unexpected — fall back to disk cache if present.
        log.warning(f"Failed to sync {data_type} for {canonical} (HTTP {status})")
        self._sync_errors.append(f"{canonical}/{data_type}: HTTP {status}")
        cached = _read_cache(_cache_path(canonical, data_type))
        if cached:
            self._get_store(data_type)[canonical] = cached
            return "cached"
        return "failed"

    def _sync_all_legacy_sync(self, summary: dict) -> dict:
        """v11: thin wrapper invoking the existing sync legacy path on the
        worker thread. The legacy path uses `requests` and is rarely hit
        (only when the server returns 404 on /data/manifest)."""
        log.warning("Legacy sync unavailable in Quantum Terminal — using cache")
        self._load_all_from_cache()
        return summary

    def _sync_all_unchecked(self) -> dict:
        # Quantum Terminal: no license client needed
        client = None

        self._sync_errors = []
        summary = {"offline_mode": False, "format_version_ok": True,
                   "synced": 0, "skipped": 0}

        # Step 1: Try manifest
        manifest, m_status = client.auth_request("GET", "/data/manifest", timeout=8)  # v7

        if m_status == 0:
            log.warning("Server unreachable -- loading from cache (Rule C5)")
            self._offline_mode = True
            summary["offline_mode"] = True
            self._load_all_from_cache()
            return summary

        if m_status in (401, 403):
            log.warning(f"Auth error during data sync (HTTP {m_status})")
            self._load_all_from_cache()
            return summary

        if m_status == 404:
            log.info("Manifest not found -- falling back to legacy sync")
            return self._sync_all_legacy(client, summary)

        if m_status != 200 or manifest is None:
            log.warning(f"Manifest failed (HTTP {m_status}) -- using cache")
            self._offline_mode = True
            summary["offline_mode"] = True
            self._load_all_from_cache()
            return summary

        # Step 2: Format version check
        if not _check_format_version(manifest):
            self._format_version_ok = False
            summary["format_version_ok"] = False
            return summary

        # Step 3: Download only changed files — iterate ALL categories from manifest
        server_files = manifest.get("files", {})

        # v9: count total files in this sync up front so the toolbar
        #   progress bar can render `done / total`.
        self._sync_total = sum(len(c) for c in server_files.values())
        self._sync_done = 0

        for category, cat_files in server_files.items():
            self._known_categories.add(category)

            for ticker, meta in cat_files.items():
                server_updated = meta.get("updated_at", "")
                local_key = _ts_key(category, ticker)
                local_updated = self._sync_timestamps.get(local_key, "")

                # Skip if local is up to date
                if local_updated and server_updated and local_updated >= server_updated:
                    cached = _read_cache(_cache_path(ticker, category))
                    if cached:
                        self._get_store(category)[ticker.upper()] = cached
                    summary["skipped"] += 1
                    self._sync_done += 1   # v9
                    continue

                # Download this file
                result = self._sync_one(client, ticker, category)
                if result in ("synced", "not_modified"):
                    self._sync_timestamps[local_key] = server_updated
                    if result == "not_modified":
                        cached = _read_cache(_cache_path(ticker, category))
                        if cached:
                            self._get_store(category)[ticker.upper()] = cached
                        summary["skipped"] += 1
                    else:
                        summary["synced"] += 1
                self._sync_done += 1   # v9 — count even on failed/cached fall-through

        _save_sync_timestamps(self._sync_timestamps)

        # v5: sweep cache for orphan files not in the manifest (legacy
        # misnaming, manually dropped files, older categories). HTTP-fresh
        # entries already in the store are preserved via skip_existing=True.
        self._load_all_from_cache(skip_existing=True)

        log.info(f"Incremental sync: {summary['synced']} downloaded, {summary['skipped']} skipped")
        self._last_synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        return summary

    # ---- Legacy full sync (fallback) ----

    def _sync_all_legacy(self, client, summary: dict) -> dict:
        data, status = client.auth_request("GET", "/data/status")

        if status != 200 or data is None:
            self._offline_mode = True
            summary["offline_mode"] = True
            self._load_all_from_cache()
            return summary

        if not _check_format_version(data):
            self._format_version_ok = False
            summary["format_version_ok"] = False
            return summary

        self._data_status = data
        _write_cache(_status_cache_path(), data)

        for ticker in data.get("assets_available", []):
            for cat in TICKER_CATEGORIES:
                result = self._sync_one(client, ticker, cat)
                if result == "synced":
                    summary["synced"] = summary.get("synced", 0) + 1

        # Try known global data too
        for cat in KNOWN_GLOBAL:
            self._sync_one(client, "GLOBAL", cat)

        # Sync global datasets (fundamentals, macro, money flow, rates)
        self.sync_global()

        self._last_synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        return summary

    # ---- Public: sync single ticker ----

    def sync_ticker(self, ticker: str) -> dict:
        # Quantum Terminal: no license client needed
        client = None

        result = {}
        if ticker.upper() == "GLOBAL":
            # Sync all known global categories
            for cat in self._known_categories:
                if cat not in TICKER_CATEGORIES:
                    result[cat] = self._sync_one(client, ticker, cat)
        else:
            for cat in TICKER_CATEGORIES:
                result[cat] = self._sync_one(client, ticker, cat)
        return result

    # ---- Public: read data ----

    def get_cones(self, ticker: str) -> Optional[dict]:
        return self._get_data(ticker, "cones")

    def get_bands(self, ticker: str) -> Optional[dict]:
        return self._get_data(ticker, "bands")

    def get_options(self, ticker: str) -> Optional[dict]:
        return self._get_data(ticker, "options")

    def get_probfield(self, ticker: str) -> Optional[dict]:
        return self._get_data(ticker, "probfield")

    def get_fundamentals(self) -> Optional[dict]:
        """Get global fundamental data (regime, liquidity, yields, COT, etc.)."""
        return self._get_data("GLOBAL", "fundamental_state")

    def get_signals(self) -> Optional[dict]:
        """Get daily signals data."""
        return self._get_data("GLOBAL", "daily_signals")

    def get_lifecycle(self) -> Optional[dict]:
        """Get signal lifecycle data."""
        return self._get_data("GLOBAL", "signal_lifecycle")

    def get_weekly_state(self) -> Optional[dict]:
        """Get weekly state data."""
        return self._get_data("GLOBAL", "weekly_state")

    def get_global(self, category: str) -> Optional[dict]:
        """
        Get any global data by category name.
        Works for any file synced from the server — no code changes needed.
        Examples: get_global("central_bank_rates"), get_global("macro_flows")
        """
        return self._get_data("GLOBAL", category)

    # ── Global data getters ──────────────────────────────────────────────────────

    def _fetch_global(self, key: str) -> dict | None:
        """
        Fetch one global (GLOBAL ticker) dataset from the server.
        Falls back to cache on any error. Returns None if unavailable.
        """
        endpoint = GLOBAL_ENDPOINTS.get(key)
        cache_file = _get_cache_dir() / GLOBAL_CACHE_NAMES.get(key, f"GLOBAL_{key}.json")

        if not endpoint:
            log.warning(f"[DataSync] Unknown global key: {key}")
            return None

        # Quantum Terminal: no auth and no default data server — when
        # [server] base_url is empty there is nothing to fetch, use the cache.
        base_url = _read_config().get("server", "base_url", fallback="").rstrip("/")
        if not base_url:
            return self._load_global_cache(key)

        try:
            import httpx
            url = f"{base_url}{endpoint}"
            resp = httpx.get(
                url,
                timeout=8,  # v7: was 15 — consumer is display-only, fast fail beats long wait
            )

            if resp.status_code == 200:
                data = resp.json()
                # Write to cache
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                cache_file.write_text(json.dumps(data), encoding="utf-8")
                log.info(f"[DataSync] Global {key}: fetched and cached ({len(resp.content)} bytes)")
                return data

            elif resp.status_code == 304:
                log.info(f"[DataSync] Global {key}: 304 Not Modified — using cache")
                return self._load_global_cache(key)

            elif resp.status_code == 404:
                log.warning(f"[DataSync] Global {key}: 404 — not on server yet")
                return self._load_global_cache(key)

            else:
                log.warning(f"[DataSync] Global {key}: HTTP {resp.status_code} — using cache")
                return self._load_global_cache(key)

        except Exception as e:
            log.warning(f"[DataSync] Global {key}: fetch failed ({e}) — using cache")
            return self._load_global_cache(key)

    def _load_global_cache(self, key: str) -> dict | None:
        """Load global data from AppData cache. Returns None if not cached."""
        cache_file = _get_cache_dir() / GLOBAL_CACHE_NAMES.get(key, f"GLOBAL_{key}.json")
        if cache_file.exists():
            try:
                return json.loads(cache_file.read_text(encoding="utf-8"))
            except Exception as e:
                log.warning(f"[DataSync] Cache read failed for {key}: {e}")
        return None

    def sync_global(self) -> dict:
        """
        Fetch all global datasets from server.
        Called inside sync_all() — runs once at startup, not per-ticker.
        Returns dict of {key: success_bool}.
        """
        results = {}
        for key in GLOBAL_ENDPOINTS:
            data = self._fetch_global(key)
            results[key] = data is not None
        return results

    def get_macro_sectors(self) -> dict | None:
        """Get macro sector rotation data."""
        return self._load_global_cache("macro_sectors") or self._fetch_global("macro_sectors")

    def get_macro_countries(self) -> dict | None:
        """Get macro country data."""
        return self._load_global_cache("macro_countries") or self._fetch_global("macro_countries")

    def get_macro_flows(self) -> dict | None:
        """Get country capital flow data (1W and 4W periods)."""
        return self._load_global_cache("macro_flows") or self._fetch_global("macro_flows")

    def get_macro_sector_flows(self) -> dict | None:
        """Get inter-sector money flow data (macro + weekly periods)."""
        return self._load_global_cache("macro_sector_flows") or self._fetch_global("macro_sector_flows")

    def get_central_bank_rates(self) -> dict | None:
        """Get central bank rate differential data."""
        return self._load_global_cache("central_bank_rates") or self._fetch_global("central_bank_rates")

    def _get_data(self, ticker: str, category: str) -> Optional[dict]:
        canonical = ticker.upper()
        store = self._get_store(category)
        if canonical in store:
            return store[canonical]
        cached = _read_cache(_cache_path(canonical, category))
        if cached:
            store[canonical] = cached
        return cached

    def get_data_status(self) -> Optional[dict]:
        if self._data_status:
            return self._data_status
        return _read_cache(_status_cache_path())

    # ---- Public: staleness (Rule C4) ----

    def get_staleness_info(self) -> List[StalenessInfo]:
        results = []
        for ticker, data in self._get_store("cones").items():
            computed_at = data.get("computed_at")
            results.append(_compute_staleness(computed_at, ticker))
        return results

    def get_overall_staleness(self) -> StalenessInfo:
        infos = self.get_staleness_info()
        # Use last_synced_at as the authoritative freshness signal
        sync_time = getattr(self, "_last_synced_at", None) or getattr(self, "last_synced_at", None)
        if sync_time:
            return _compute_staleness(sync_time, "ALL")
        if not infos:
            return StalenessInfo(ticker="ALL", level=FreshnessLevel.FRESH)
        worst = max(infos, key=lambda x: x.age_hours)
        worst.ticker = "ALL"
        return worst

    # ---- Public: status flags ----

    @property
    def is_offline(self) -> bool:
        return self._offline_mode

    @property
    def server_configured(self) -> bool:
        """True when consumer_config.ini names an analysis data server.
        The open-source edition ships none ([server] base_url is empty), so
        the UI shows "no data server" rather than an offline error."""
        return bool(_read_config().get("server", "base_url", fallback="").strip())

    @property
    def format_version_ok(self) -> bool:
        return self._format_version_ok

    @property
    def sync_errors(self) -> List[str]:
        return list(self._sync_errors)

    @property
    def is_syncing(self) -> bool:
        """True while sync_all is running — top-bar pill polls via
        /api/consumer/status.sync_in_progress."""
        return bool(getattr(self, "_sync_in_progress", False))

    @property
    def synced_tickers(self) -> List[str]:
        return sorted(self._get_store("cones").keys())

    @property
    def last_synced_at(self) -> Optional[str]:
        return self._last_synced_at

    # ---- Internal: sync one file ----

    def _sync_one(self, client, ticker: str, data_type: str) -> str:
        canonical = ticker.upper()
        endpoint = f"/data/{canonical}/{data_type}"

        extra_headers = {}
        local_key = _ts_key(data_type, canonical)
        local_ts = self._sync_timestamps.get(local_key)
        if local_ts:
            try:
                ts_dt = datetime.fromisoformat(local_ts)
                extra_headers["If-Modified-Since"] = formatdate(
                    ts_dt.timestamp(), usegmt=True
                )
            except (ValueError, TypeError):
                pass

        data, status = client.auth_request(
            "GET", endpoint, timeout=8, extra_headers=extra_headers   # v7: was 30
        )

        if status == 304:
            log.info(f"304 Not Modified: {canonical}/{data_type}")
            return "not_modified"

        # v7: retry once on 5xx with a SHORT sleep (was 10s). A genuine
        #    transient blip recovers in <1 s; a persistent 500 (e.g. a
        #    mis-served /probfield) would previously cost the user ~70 s per
        #    failure, stacking into multi-minute startup delays. Now worst
        #    case per failing endpoint is ~17 s (8 + 1 + 8).
        if status >= 500:
            log.warning(f"Server error {status} for {endpoint} -- retrying in 1s")
            time.sleep(1)
            data, status = client.auth_request(
                "GET", endpoint, timeout=8, extra_headers=extra_headers
            )

        if status == 304:
            return "not_modified"

        if status == 200 and data is not None:
            if not _check_format_version(data):
                self._format_version_ok = False
                return "failed"

            self._get_store(data_type)[canonical] = data
            _write_cache(_cache_path(canonical, data_type), data)
            # v10: rough byte count for the toolbar speed readout. Uses the
            #   serialized JSON length — close enough to wire bytes for a UX
            #   indicator (no headers / compression accounted for).
            try:
                self._sync_bytes_total += len(json.dumps(data).encode("utf-8"))
            except Exception:
                pass
            return "synced"

        elif status == 404:
            log.info(f"No {data_type} data for {canonical} (404)")
            return "cached"

        else:
            log.warning(f"Failed to sync {data_type} for {canonical} (HTTP {status})")
            self._sync_errors.append(f"{canonical}/{data_type}: HTTP {status}")
            cached = _read_cache(_cache_path(canonical, data_type))
            if cached:
                self._get_store(data_type)[canonical] = cached
                log.info(f"Loaded {data_type} for {canonical} from cache")
                return "cached"
            return "failed"

    # ---- Internal: load from cache (offline) ----

    def _load_all_from_cache(self, skip_existing: bool = False):
        """Load all cache files into in-memory stores via resolve_cache_filename().

        If skip_existing=True, slots already populated (typically by a fresh
        HTTP sync in the same tick) are preserved — only orphan/missing slots
        get filled. Used by v5's end-of-sync_all sweep.
        """
        cache_dir = _get_cache_dir()
        if not cache_dir.exists():
            return

        self._data_status = _read_cache(_status_cache_path())

        total = 0
        for f in cache_dir.glob("*.json"):
            if f.name.startswith("_"):
                continue
            if not f.name.lower().endswith(".json"):
                continue
            stem = f.name[:-5]
            resolved = resolve_cache_filename(stem)
            if not resolved:
                continue
            ticker, category = resolved
            if skip_existing and ticker in self._get_store(category):
                continue
            data = _read_cache(f)
            if data:
                self._get_store(category)[ticker] = data
                self._known_categories.add(category)
                total += 1

        if total:
            log.info(f"Loaded {total} data files from cache (offline mode)")

    # ---- Public: clear cache (Rule C9 — reversible via _trash) ----

    def clear_cache(self) -> dict:
        """
        Move all cached data files to a timestamped trash folder.
        Resets in-memory stores and sync timestamps so the next sync_all()
        pulls everything fresh from the server.

        Files are NEVER deleted — they are preserved in
        %APPDATA%\\QuantumTerminal\\_trash\\cache_<timestamp>\\ for recovery
        per Rule C9. Operator can manually purge _trash/ when confident.

        Returns:
            {"moved": int, "trash_dir": str | None}
        """
        cache_dir = _get_cache_dir()
        if not cache_dir.exists():
            return {"moved": 0, "trash_dir": None}

        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        trash_dir = cache_dir.parent / "_trash" / f"cache_{ts}"
        try:
            trash_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            log.error(f"Failed to create trash dir {trash_dir}: {e}")
            return {"moved": 0, "trash_dir": None}

        moved = 0
        for f in cache_dir.glob("*.json"):
            try:
                f.replace(trash_dir / f.name)
                moved += 1
            except Exception as e:
                log.warning(f"Failed to move {f.name} to trash: {e}")

        # Reset in-memory state so next sync_all is a clean pull
        self._stores.clear()
        self._sync_timestamps.clear()
        try:
            _save_sync_timestamps(self._sync_timestamps)
        except Exception:
            pass
        self._data_status = None
        self._sync_errors = []
        self._offline_mode = False
        self._last_synced_at = None

        log.info(f"Cleared cache: {moved} files moved to {trash_dir}")
        return {"moved": moved, "trash_dir": str(trash_dir)}


# ============================================================
# 9. SINGLETON + REST API ROUTES
# ============================================================

_sync_client: Optional[DataSyncClient] = None


def get_sync_client() -> DataSyncClient:
    global _sync_client
    if _sync_client is None:
        _sync_client = DataSyncClient()
    return _sync_client


def create_data_sync_routes():
    from fastapi import APIRouter

    router = APIRouter(tags=["data_sync"])

    @router.get("/api/sync/status")
    async def api_sync_status():
        client = get_sync_client()
        staleness = client.get_overall_staleness()
        # v9: surface in-progress flag + progress counters so the top-toolbar
        #   download bar can render `done / total` and the post-sync "please
        #   refresh" prompt can fire on transition true → false.
        return {
            "offline_mode": client.is_offline,
            "server_configured": client.server_configured,
            "format_version_ok": client.format_version_ok,
            "synced_tickers": client.synced_tickers,
            "sync_errors": client.sync_errors,
            "analysis_date": staleness.display_date,
            "staleness_level": staleness.level.value,
            "staleness_hours": staleness.age_hours,
            "last_synced_at": client.last_synced_at,
            "sync_in_progress": bool(getattr(client, "_sync_in_progress", False)),
            "sync_total": int(getattr(client, "_sync_total", 0)),
            "sync_done":  int(getattr(client, "_sync_done", 0)),
            "sync_bytes_total": int(getattr(client, "_sync_bytes_total", 0)),  # v10
        }

    @router.get("/api/sync/cones/{ticker}")
    async def api_get_cones(ticker: str):
        client = get_sync_client()
        data = client.get_cones(ticker.upper())
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, f"No cone data for {ticker}")
        return data

    @router.get("/api/sync/options/{ticker}")
    async def api_get_options(ticker: str):
        client = get_sync_client()
        data = client.get_options(ticker.upper())
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, f"No options data for {ticker}")
        return data

    @router.get("/api/sync/probfield/{ticker}")
    async def api_get_probfield(ticker: str):
        client = get_sync_client()
        data = client.get_probfield(ticker.upper())
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, f"No probfield data for {ticker}")
        return data

    @router.get("/api/sync/fundamentals")
    async def api_get_fundamentals():
        client = get_sync_client()
        data = client.get_fundamentals()
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, "No fundamentals data")
        return data

    @router.get("/api/sync/signals")
    async def api_get_signals():
        client = get_sync_client()
        data = client.get_signals()
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, "No signals data")
        return data

    @router.get("/api/sync/lifecycle")
    async def api_get_lifecycle():
        client = get_sync_client()
        data = client.get_lifecycle()
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, "No lifecycle data")
        return data

    @router.get("/api/sync/weeklystate")
    async def api_get_weekly_state():
        client = get_sync_client()
        data = client.get_weekly_state()
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(404, "No weekly state data")
        return data

    @router.get("/api/sync/staleness")
    async def api_staleness():
        client = get_sync_client()
        infos = client.get_staleness_info()
        overall = client.get_overall_staleness()
        return {
            "overall": asdict(overall),
            "per_ticker": [asdict(i) for i in infos],
        }

    @router.post("/api/sync/refresh")
    async def api_refresh_sync():
        # v8: run on the worker thread pool so the event loop is free to
        #   serve concurrent requests (notably /api/sync/status, which the
        #   LoginScreen polls to detect format-version mismatch). Without
        #   this, sync_all blocks ALL other endpoints for ~5 min on a
        #   first-install full pull.
        client = get_sync_client()
        summary = await asyncio.to_thread(client.sync_all)
        return summary

    @router.post("/api/sync/refresh/{ticker}")
    async def api_refresh_ticker(ticker: str):
        # v8: same off-loop reasoning as /api/sync/refresh.
        client = get_sync_client()
        result = await asyncio.to_thread(client.sync_ticker, ticker.upper())
        return result

    @router.post("/api/sync/clear-cache")
    async def api_clear_cache():
        """
        Move cache to _trash and re-sync from server.
        Rule C9: files are preserved in _trash/, never deleted.
        """
        # v8: both clear_cache and sync_all are blocking I/O — keep them
        #   off the event loop so /api/sync/status keeps responding.
        client = get_sync_client()
        clear_result = await asyncio.to_thread(client.clear_cache)
        sync_summary = await asyncio.to_thread(client.sync_all)
        return {
            "cleared": clear_result,
            "resync": sync_summary,
        }

    @router.get("/api/sync/poll-config")
    async def api_poll_config():
        """Returns the current periodic sync interval (for UI display)."""
        try:
            from periodic_sync import _read_interval
            return {"interval_seconds": _read_interval()}
        except Exception:
            return {"interval_seconds": 300}

    @router.get("/api/data/global/{key}")
    async def get_global_data(key: str):
        """Proxy global data from local cache to React frontend."""
        valid_keys = set(GLOBAL_ENDPOINTS.keys())
        if key not in valid_keys:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Unknown global key: {key}")
        client = get_sync_client()
        data = client._load_global_cache(key)
        if data is None:
            # Try live fetch as fallback
            data = client._fetch_global(key)
        if data is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail=f"{key} not available yet")
        return data

    return router