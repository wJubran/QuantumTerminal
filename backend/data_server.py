# version: v27
# v27 — Registered the /api/chart-templates router (chart_templates_routes.py).
#       Companion to /api/chart-presets — named full-chart-config snapshots
#       the operator saves/loads via the TPL ▾ button. (2026-05-11)
# v26 — /api/bands attaches `_last_modified` (unix epoch float) sourced from
#       the resolved JSON file's mtime (PRO local OR sync cache). Frontend
#       uses it to detect when bands are older than the most recent market
#       close and flag the BANDS toolbar button red. Best-effort: if the
#       cache file path can't be resolved (legacy fallback or unknown sync
#       layout), the field is omitted and the frontend treats the bands as
#       fresh (no red flag, no false alarms).
"""
================================================================================
Quantum Terminal — Data Server (Consumer Build)
================================================================================
FastAPI backend for the consumer terminal. Display-only — no computation.

v25 — Added env-gated install of debug_telemetry harness during lifespan
      startup. No effect when MK_DEBUG_TELEMETRY != "1". Disposable —
      see docs/specs/2026-05-05-debug-telemetry-harness-design.md.

v19 — Non-blocking initial sync. Previous lifespan ran consumer_gate() end-
      to-end before the FastAPI HTTP server became responsive, so every
      retry/slow endpoint in sync_all() added to the user-visible loading
      screen (up to 15 min in the field). Now:
        1. consumer_gate(skip_sync=True) runs synchronously — auth only,
           fast. Lifespan returns, HTTP routes go live immediately.
        2. A daemon thread runs sync_all() in the background; when it
           finishes, `app.state.consumer_gate["sync_summary"]` is
           populated. Frontend polls /api/sync/status for the SYNCING
           pill (already wired) and shows the terminal UI the whole time.
      Net: users always see the terminal within seconds, regardless of
      server-side data-endpoint health. Per CLAUDE.md Rule C2 relaxed.

v18 — Force OPTIONS_AVAILABLE = False unconditionally. The PRO
      `options_routes.create_options_router` serves `/api/options/{ticker}/full`
      directly from `compute_all_multi(snap)` and never applies the ETF→CFD
      conversion — so if its `options_data_manager` + `options_engine`
      dependencies happen to be bundled into the consumer's PyInstaller
      payload (older builds shipped them), the router takes over the route
      and every GEX level, wall, max pain etc. renders in raw ETF price
      space. Bug symptom reported in the field: XAUUSD candles stream fine
      (MT5 connected) but options levels are in ETF numbers (GLD ~200 vs
      XAUUSD ~4700). Consumer is display-only (Rule C1) — the PRO options
      engine should never run here, period. We keep the import attempt (so
      upstream module resolution doesn't change) but set OPTIONS_AVAILABLE
      to False after, guaranteeing the sync-cache fallback route (which
      applies the CFD conversion) always handles /api/options/*.

v2 — Data Center transition: /api/bands/{ticker} now reads standalone
     {TICKER}_bands.json from the sync cache (Data Center schema), with a
     legacy fallback to the old nested bands key inside {TICKER}_cones.json.
     /api/cones was already shape-flexible (wrapped or flat) — no change.

v3 — Cache directory watcher: new background task started in consumer lifespan
     that polls %APPDATA%\\QuantumTerminal\\cache\\ and broadcasts data_sync_complete
     when any {TICKER}_{category}.json changes. Enables live updates without
     browser refresh for manual drops and future auto-uploaders. Feature-flagged
     via consumer_config.ini [sync] cache_watcher_enabled (default: on).

v4 — New endpoint /api/historical_cones/{ticker} for the REPLAY sub-tab of
     quant analysis. Serves per-anchor historical cone payloads from the
     sync cache (weekly + monthly anchors, each with gbm/mjd/bates models).

v9 — Focused-symbol fast tick loop. Per-symbol MT5 polling is the bottleneck
     (≈5ms × universe_size per iteration) so dropping the global tick interval
     hits a wall ≈ 5-7 fps at universe=20. New focus_tick_loop polls ONLY the
     symbol the user is watching every FOCUS_TICK_INTERVAL (0.05s = 20 fps),
     while the existing tick_loop keeps the rest of the universe fresh at the
     normal 1s rate. Frontend sets focus via POST /api/focus/{ticker}.

v8 — Tick loop reads providers.accounts.mt5_default.use_tick_data on every
     iteration. When True, polls MT5 every 0.2s instead of 1.0s, giving the
     chart MT5-style live tick movement. Toggle surfaces in Settings →
     PROVIDERS. Default OFF; switching it via PATCH /api/mt5/config takes
     effect on the next loop tick — no restart required.

v7 — /api/quarterly_cones/{ticker} now also resolves the Data Center's
     GLOBAL_<lower>_quarterly_cones.json naming via the sync client + a
     direct second-path fallback. Schema upgraded to quarterly_cones_v2
     (4 anchors × 2 models). Frontend maps the 8 keys into the QUARTERLY
     row of the CONES dropdown with per-anchor sub-toggles.

v6 — New endpoint /api/quarterly_cones/{ticker} — reads
     {TICKER}_quarterly_cones.json directly from the consumer cache. Temporary
     wiring: the frontend maps gbm_quarter_curr / mjd_quarter_curr /
     bates_quarter_curr into the existing "MANUAL" cone slots so the user can
     see the quarterly forecast by toggling MANUAL in the CONES dropdown.

v5 — New endpoint /api/scalp_bands/{ticker} for the MICRO toggle in the
     bands dropdown. Serves the scalp bands JSON (per-horizon point values
     anchored at a recent timestamp) from the sync cache.

Responsibilities:
    1. MT5 Price Feed — poll ticks and bars, detect new closed bars
    2. WebSocket Broadcasting — push prices and state-change events to clients
    3. REST API — serve pre-computed data (cones, bands, anchors, probability field)
    4. File Watching — monitor JSON state files for changes, notify clients
    5. Consumer Auth — JWT login/register via license_client proxy
    6. Data Sync — download pre-computed data from server via data_sync_client

REMOVED from PRO (Rule C1 — no calculation triggers):
    - Signal engine evaluation (signal_engine_v2, signal_live_manager)
    - OU analysis (ou_mean_reversion)
    - Flow confirmation (flow_confirmation)
    - Auto executor (auto_executor)
    - Orchestrator endpoints (/api/orchestrator/*)
    - Calculate endpoints (/api/calculate/*)
    - Signal evaluate endpoints (/api/signals/evaluate/*)
    - Anchor calibration endpoints (/api/anchor/calibrate)
    - Manual cone computation (/api/cones/manual/*)
    - Dev endpoints (/api/dev/*)
    - Trade reconciliation loop
    - Options archive scheduler
    - Broker DPP cache population

Usage:
    python data_server.py --port 8502

This file does NOT introduce any calculation triggers.
================================================================================
"""

import json
import asyncio
import logging
import time
import argparse
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Set, Optional, Any
from contextlib import asynccontextmanager

# ── Project root (portable — Rule 3) ──
PROJECT_ROOT = Path(__file__).resolve().parent

import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server_config import ServerConfig, PROJECT_ROOT
from config_manager import ConfigManager
from config_routes import create_config_router
from execution_routes import create_execution_router
from regime_routes import create_regime_router
from system_routes import create_system_router
from account_routes import create_account_router
# v18: keep the import attempt (some downstream module trees expect the
#   symbol to resolve) but force OPTIONS_AVAILABLE = False so the PRO
#   router can never register over the sync-cache fallback. The fallback
#   at `/api/options/{ticker}/full` is the ONLY path that applies the
#   ETF→CFD conversion for strikes/walls/levels/GEX.
try:
    from options_routes import create_options_router  # noqa: F401
except ImportError:
    create_options_router = None  # noqa: F811
OPTIONS_AVAILABLE = False
from freshness_routes import create_freshness_router
from trade_mapper_routes import create_trade_mapper_router
from pulse_room.routes import create_pulse_router
from chart_presets_routes import create_chart_presets_router
from chart_templates_routes import create_chart_templates_router

# ── Macro rotation data (yfinance sector + country ETFs) ──
try:
    from macro_data import get_sector_data, get_country_data
    MACRO_DATA_AVAILABLE = True
except ImportError:
    MACRO_DATA_AVAILABLE = False

# ── Consumer terminal wiring (Project B) ──
try:
    from consumer_startup import consumer_gate, wire_consumer_routes
    CONSUMER_MODE = True
except ImportError:
    CONSUMER_MODE = False


# ── Third-party imports ──
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ── MT5 availability flag (for provider type detection, no direct calls) ──
try:
    import MetaTrader5 as _mt5_check
    MT5_AVAILABLE = True
    del _mt5_check
except ImportError:
    MT5_AVAILABLE = False

# ── File watcher ──
try:
    from watchfiles import awatch, Change
    WATCHFILES_AVAILABLE = True
except ImportError:
    WATCHFILES_AVAILABLE = False

# ── Signal live manager — REMOVED in consumer (Rule C1) ──
SIGNAL_MANAGER_AVAILABLE = False
lifecycle_mgr = None
signal_evaluator = None

# ── Auto executor — REMOVED in consumer (Rule C1) ──
AUTO_EXECUTOR_AVAILABLE = False


log = logging.getLogger("data_server")

# ── Session file logging ──
try:
    from session_logger import setup_session_logging, create_logs_router
    _session_log_path = setup_session_logging()
    log.info(f"Session log: {_session_log_path}")
except ImportError:
    log.info("session_logger not available — console only")
    create_logs_router = None
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)




# ============================================================
# 3. WEBSOCKET CONNECTION MANAGER
# ============================================================

class ConnectionManager:
    """Manages WebSocket connections across channels."""

    def __init__(self):
        self._price_clients: Set[WebSocket] = set()
        self._event_clients: Set[WebSocket] = set()

    async def connect_prices(self, ws: WebSocket):
        await ws.accept()
        self._price_clients.add(ws)
        log.info(f"Price client connected ({len(self._price_clients)} total)")

    async def connect_events(self, ws: WebSocket):
        await ws.accept()
        self._event_clients.add(ws)
        log.info(f"Event client connected ({len(self._event_clients)} total)")

    def disconnect_prices(self, ws: WebSocket):
        self._price_clients.discard(ws)
        log.info(f"Price client disconnected ({len(self._price_clients)} remaining)")

    def disconnect_events(self, ws: WebSocket):
        self._event_clients.discard(ws)
        log.info(f"Event client disconnected ({len(self._event_clients)} remaining)")

    async def broadcast_prices(self, message: dict):
        """Send to all price channel subscribers."""
        if not self._price_clients:
            return
        data = json.dumps(message)
        dead = []
        for ws in self._price_clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._price_clients.discard(ws)

    async def broadcast_event(self, message: dict):
        """Send to all event channel subscribers."""
        if not self._event_clients:
            return
        data = json.dumps(message)
        dead = []
        for ws in self._event_clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._event_clients.discard(ws)

    @property
    def price_client_count(self) -> int:
        return len(self._price_clients)

    @property
    def event_client_count(self) -> int:
        return len(self._event_clients)


# ============================================================
# 4. FILE STATE READER
# ============================================================

def read_json_safe(path: Path) -> Optional[dict]:
    """Read a JSON file, returning None on any error."""
    try:
        if not path.exists():
            return None
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError, OSError) as e:
        log.warning(f"Failed to read {path.name}: {e}")
        return None


# ============================================================
# 5. BACKGROUND TASKS
# ============================================================

# ── Tick price cache (populated by tick_loop, read by signal lifecycle) ──
_latest_ticks: Dict[str, float] = {}


FAST_TICK_INTERVAL  = 1.0   # v9: full-universe loop stays at config rate when
                             # USE TICK DATA is on (fast loop now handles the
                             # focused chart at FOCUS_TICK_INTERVAL).
FOCUS_TICK_INTERVAL = 0.1    # v9/v10: focused-symbol fast loop — 10 fps.
                             # Was 0.05 (20 fps) but that saturated React's
                             # main thread with re-renders, causing chart drag
                             # to freeze. 10 fps still feels live and leaves
                             # event-loop budget for mouse input. True MT5-style
                             # fluidity needs Option C (bypass React state on
                             # the price hot path) — defer until requested.

# v9: focused symbol the user is actively watching. None = no focus → fast
# loop idles. Set via POST /api/focus/{ticker}.
_focused_symbol: Optional[str] = None


def set_focused_symbol(ticker: Optional[str]):
    global _focused_symbol
    _focused_symbol = ticker.upper() if ticker else None
    log.info(f"Focused symbol = {_focused_symbol or '(none)'}")


def get_focused_symbol() -> Optional[str]:
    return _focused_symbol


def _resolve_tick_interval(cfg_manager: ConfigManager, base: float) -> float:
    """v9: Main full-universe tick loop always uses base config.tick_interval.
    The fast path is now focus_tick_loop, which polls only the focused symbol
    at FOCUS_TICK_INTERVAL. (Kept for backward-compat / future hooks.)"""
    return base


async def tick_loop(app_state, manager: ConnectionManager, config: ServerConfig, cfg_manager: ConfigManager):
    """
    Polls MT5 for latest ticks. Default interval = config.tick_interval (1.0s).
    v8: When user enables 'USE TICK DATA' in Settings → PROVIDERS, switches
    to FAST_TICK_INTERVAL (0.2s) on the next iteration — no restart needed.
    Broadcasts to all /ws/prices subscribers.
    """
    log.info(f"Tick loop started (base interval={config.tick_interval}s, "
             f"fast interval={FAST_TICK_INTERVAL}s when use_tick_data=True)")
    last_mode = None
    while True:
        try:
            provider = app_state.provider
            if provider and provider.connected and manager.price_client_count > 0:
                universe = cfg_manager.get_active_universe()
                ticks = await asyncio.to_thread(provider.get_latest_ticks, universe)
                if ticks:
                    # Update tick cache for signal lifecycle price checks
                    for t, tick in ticks.items():
                        _latest_ticks[t] = tick.last
                    # Send all ticks as one batch — avoids React render-frame drops
                    await manager.broadcast_prices({
                        "type": "ticks_batch",
                        "ticks": {t: tick.to_dict() for t, tick in ticks.items()},
                    })
            elif provider and provider.connected:
                # Still update cache even if no WS clients (signals need prices)
                universe = cfg_manager.get_active_universe()
                ticks = await asyncio.to_thread(provider.get_latest_ticks, universe)
                if ticks:
                    for t, tick in ticks.items():
                        _latest_ticks[t] = tick.last
        except Exception as e:
            log.error(f"Tick loop error: {e}")
        # v8: dynamic sleep — re-read each iteration so the user toggle is live.
        interval = _resolve_tick_interval(cfg_manager, config.tick_interval)
        if interval != last_mode:
            log.info(f"Tick interval = {interval}s "
                     f"({'FAST / use_tick_data ON' if interval == FAST_TICK_INTERVAL else 'NORMAL'})")
            last_mode = interval
        await asyncio.sleep(interval)


async def focus_tick_loop(app_state, manager: ConnectionManager, cfg_manager: ConfigManager):
    """v9: Fast loop dedicated to the symbol the user is actively watching.
    Polls ONLY the focused symbol every FOCUS_TICK_INTERVAL when USE TICK DATA
    is on. This avoids the universe-size ceiling that caps the main tick loop.

    Sleeps 1s when:
      - USE TICK DATA is off
      - No focused symbol set
      - No WS price clients connected
      - MT5 disconnected
    """
    log.info(f"Focus tick loop started (interval={FOCUS_TICK_INTERVAL}s when active)")
    last_active = None
    while True:
        try:
            mt5_cfg = (cfg_manager.get_config().get("providers", {})
                       .get("accounts", {}).get("mt5_default", {}) or {})
            use_tick = bool(mt5_cfg.get("use_tick_data", False))
            sym = get_focused_symbol()
            provider = app_state.provider

            active = (
                use_tick
                and sym is not None
                and provider is not None
                and provider.connected
                and manager.price_client_count > 0
            )
            if active != last_active:
                log.info(
                    f"Focus tick loop: {'ACTIVE' if active else 'IDLE'} "
                    f"(use_tick={use_tick}, sym={sym}, "
                    f"connected={provider.connected if provider else False}, "
                    f"clients={manager.price_client_count})"
                )
                last_active = active

            if active:
                ticks = await asyncio.to_thread(provider.get_latest_ticks, [sym])
                if ticks:
                    for t, tick in ticks.items():
                        _latest_ticks[t] = tick.last
                    await manager.broadcast_prices({
                        "type": "ticks_batch",
                        "ticks": {t: tick.to_dict() for t, tick in ticks.items()},
                    })
                await asyncio.sleep(FOCUS_TICK_INTERVAL)
            else:
                await asyncio.sleep(1.0)
        except Exception as e:
            log.error(f"Focus tick loop error: {e}")
            await asyncio.sleep(1.0)


async def bar_check_loop(
    app_state, manager: ConnectionManager, config: ServerConfig, cfg_manager: ConfigManager
):
    """
    Checks for newly closed M15 bars at config.bar_check_interval.
    Broadcasts new bars to /ws/prices subscribers.
    """
    log.info(f"Bar check loop started (interval={config.bar_check_interval}s)")
    while True:
        try:
            provider = app_state.provider
            if provider and provider.connected:
                universe = cfg_manager.get_active_universe()
                new_bars = await asyncio.to_thread(
                    provider.check_new_bars, universe, config.default_timeframe
                )
                for bar_msg in new_bars:
                    await manager.broadcast_prices(bar_msg)
                    log.debug(
                        f"New {bar_msg['timeframe']} bar: "
                        f"{bar_msg['ticker']} @ {bar_msg['bar']['time']}"
                    )
        except Exception as e:
            log.error(f"Bar check error: {e}")
        await asyncio.sleep(config.bar_check_interval)


async def mt5_reconnect_loop(app_state, config: ServerConfig):
    """
    Monitors MT5 connection. Reconnects with backoff if dropped.
    """
    while True:
        await asyncio.sleep(10)
        provider = app_state.provider
        if provider and not provider.connected:
            log.info("MT5 disconnected — attempting reconnect...")
            for attempt in range(config.mt5_max_reconnect_attempts):
                success = await asyncio.to_thread(provider.reconnect)
                if success:
                    log.info("MT5 reconnected successfully")
                    break
                delay = min(config.mt5_reconnect_delay * (2 ** attempt), 60)
                log.warning(
                    f"MT5 reconnect attempt {attempt + 1} failed, "
                    f"retrying in {delay:.0f}s"
                )
                await asyncio.sleep(delay)
        elif provider:
            # Heartbeat check — ask the provider to verify its connection
            try:
                alive = await asyncio.to_thread(provider.heartbeat)
                if not alive:
                    log.warning("Provider heartbeat failed — will reconnect next cycle")
            except Exception:
                log.warning("Provider heartbeat exception — will reconnect next cycle")


async def file_watch_loop(manager: ConnectionManager, config: ServerConfig):
    """
    Watches state JSON files for changes and pushes events to /ws/events.
    Falls back to polling if watchfiles is unavailable.
    """
    watched_paths = config.watched_files
    path_to_source = {
        config.resolve_path(config.terminal_payload): "terminal_payload",
        config.resolve_path(config.daily_signals): "daily_signals",
        config.resolve_path(config.signal_lifecycle): "signal_lifecycle",
        config.resolve_path(config.weekly_state): "weekly_state",
    }

    if WATCHFILES_AVAILABLE:
        log.info(f"File watcher started (watchfiles, {len(watched_paths)} paths)")
        # Watch the project root directory, filter for our files
        watch_dir = PROJECT_ROOT

        async for changes in awatch(watch_dir, debounce=1000):
            for change_type, changed_path in changes:
                changed = Path(changed_path)
                source = path_to_source.get(changed)
                if source is None:
                    continue

                log.info(f"File change detected: {changed.name} ({change_type.name})")
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

                if source == "terminal_payload":
                    # Read which tickers were updated
                    data = read_json_safe(changed)
                    tickers = list(data.get("assets", {}).keys()) if data else []
                    await manager.broadcast_event({
                        "type": "payload_update",
                        "source": source,
                        "timestamp": now,
                        "tickers_updated": tickers,
                    })
                elif source in ("daily_signals", "signal_lifecycle"):
                    data = read_json_safe(changed)
                    summary = {}
                    if data and isinstance(data, dict):
                        # Count signals per state if available
                        all_signals = []
                        for ticker_signals in data.values():
                            if isinstance(ticker_signals, list):
                                all_signals.extend(ticker_signals)
                        summary = {
                            "total_signals": len(all_signals),
                            "tickers_affected": list(data.keys()),
                        }
                    await manager.broadcast_event({
                        "type": "state_update",
                        "source": source,
                        "timestamp": now,
                        "summary": summary,
                    })
                else:
                    await manager.broadcast_event({
                        "type": "state_update",
                        "source": source,
                        "timestamp": now,
                        "summary": {},
                    })
    else:
        # Fallback: polling-based file watcher
        log.info("File watcher started (polling mode — install watchfiles for efficiency)")
        mtimes: Dict[str, float] = {}

        while True:
            for path in watched_paths:
                if not path.exists():
                    continue
                mtime = path.stat().st_mtime
                key = str(path)
                if key in mtimes and mtime > mtimes[key]:
                    source = path_to_source.get(path, path.stem)
                    log.info(f"File change detected (poll): {path.name}")
                    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
                    await manager.broadcast_event({
                        "type": "state_update",
                        "source": source,
                        "timestamp": now,
                        "summary": {},
                    })
                mtimes[key] = mtime

            await asyncio.sleep(config.file_watch_debounce)


# ============================================================
# 6. FASTAPI APPLICATION
# ============================================================

server_config = ServerConfig()
cfg_manager = ConfigManager()
manager = ConnectionManager()
start_time = time.time()

def _get_current_prices() -> dict:
    """Return latest known prices for all tickers from tick cache."""
    return dict(_latest_ticks)



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    # ── Startup ──
    log.info("=" * 60)
    log.info("  Quantum Terminal Data Server — Starting")


    # ── Consumer startup gate (Rule C2, relaxed — v19) ──
    # Run auth synchronously (need the result for login routing); spawn the
    # slow sync_all() in a daemon thread so this lifespan returns in <1s and
    # the HTTP server starts serving API routes immediately.
    if CONSUMER_MODE:
        gate_result = consumer_gate(skip_sync=True)
        app.state.consumer_gate = gate_result
        log.info(
            f"Consumer gate (auth phase): ok={gate_result['ok']}, "
            f"login={gate_result.get('needs_login')}, "
            f"offline={gate_result.get('offline_mode')}"
        )

        # Spawn background sync only when auth succeeded (no login needed).
        # If login is required, sync waits — user logs in, periodic_sync.py
        # or a post-login hook picks it up.
        if gate_result.get("ok") and not gate_result.get("needs_login"):
            import threading
            def _run_initial_sync():
                try:
                    from data_sync_client import get_sync_client
                    sc = get_sync_client()
                    log.info("[initial-sync] thread started")
                    summary = sc.sync_all()
                    # Persist summary onto app.state so /api/sync/status can surface it.
                    try:
                        app.state.consumer_gate["sync_summary"] = summary
                        if summary.get("offline_mode"):
                            app.state.consumer_gate["offline_mode"] = True
                        # Rule C6 — format version mismatch surfaces after sync too.
                        if not summary.get("format_version_ok", True):
                            app.state.consumer_gate["needs_update"] = True
                    except Exception:
                        pass
                    log.info(
                        f"[initial-sync] complete: "
                        f"synced={summary.get('synced', 0)} "
                        f"skipped={summary.get('skipped', 0)} "
                        f"offline={summary.get('offline_mode', False)}"
                    )
                except Exception as e:
                    log.error(f"[initial-sync] failed: {e}")
                    try:
                        app.state.consumer_gate["sync_summary"] = {"error": str(e)}
                    except Exception:
                        pass
            threading.Thread(
                target=_run_initial_sync,
                daemon=True,
                name="consumer-initial-sync",
            ).start()
            log.info("Consumer gate: initial sync spawned in background")
    log.info("=" * 60)

    # Initialize providers from config (graceful — server starts even if MT5 fails)
    provider = None
    connected = False
    try:
        providers = await asyncio.to_thread(cfg_manager.init_providers)
        provider = cfg_manager.get_provider()  # Active data provider

        if provider:
            try:
                connected = await asyncio.wait_for(
                    asyncio.to_thread(provider.connect),
                    timeout=15.0,  # Don't hang forever if MT5 is stuck
                )
            except asyncio.TimeoutError:
                log.warning("MT5 connection timed out (15s) — continuing without live prices")
                connected = False
            except Exception as e:
                log.warning(f"MT5 connection failed: {e} — continuing without live prices")
                connected = False

            if connected:
                # Resolve universe symbols through the provider
                universe = cfg_manager.get_active_universe()
                resolved = await asyncio.to_thread(provider.resolve_universe, universe)
                log.info(f"Provider ready: {len(resolved)} symbols resolved")
            else:
                log.warning("Running in DEMO MODE — provider failed to connect")
        else:
            log.warning("Running in DEMO MODE — no provider configured")
    except Exception as e:
        log.warning(f"Provider initialization failed: {e} — server will start without MT5")
        provider = None
        connected = False

    # Store provider reference for background tasks
    app.state.provider = provider
    app.state.cfg_manager = cfg_manager

    # Launch background tasks (consumer: tick loop + bar check + file watch only)
    tasks = [
        asyncio.create_task(tick_loop(app.state, manager, server_config, cfg_manager)),
        asyncio.create_task(focus_tick_loop(app.state, manager, cfg_manager)),  # v9
        asyncio.create_task(bar_check_loop(app.state, manager, server_config, cfg_manager)),
        asyncio.create_task(file_watch_loop(manager, server_config)),
    ]
    if provider and provider.connected:
        tasks.append(asyncio.create_task(mt5_reconnect_loop(app.state, server_config)))
        # Keep account equity/balance synced from the active provider (e.g. hosted
        # TickerAll). The built-in equity sync is hardcoded to the MetaTrader5
        # package and is a no-op off a local terminal; this fills that gap.
        try:
            from account_sync import account_sync_loop
            tasks.append(asyncio.create_task(account_sync_loop(app.state)))
            log.info("Provider account-sync task started")
        except Exception as e:
            log.warning(f"Provider account-sync task not started: {e}")

    # ── Consumer periodic sync (Rule C1: display-only refresh, 5 min default) ──
    # Polls the VPS at a configurable interval and broadcasts data_sync_complete
    # WS event when fresh files arrive. Frontend listens and refreshes panels.
    if CONSUMER_MODE:
        try:
            from periodic_sync import create_periodic_sync_task
            sync_task_factory = create_periodic_sync_task(manager.broadcast_event)
            tasks.append(asyncio.create_task(sync_task_factory()))
            log.info("Consumer periodic sync task started")
        except Exception as e:
            log.warning(f"Failed to start periodic sync task: {e}")

        # ── Cache directory watcher (v3) ───────────────────────────────────
        # Live updates whenever a file in the cache dir changes on disk.
        # Covers manual drops and future automated DC uploaders. Disable via
        # consumer_config.ini → [sync] cache_watcher_enabled = false.
        try:
            from cache_watcher import create_cache_watcher_task
            watcher_factory = create_cache_watcher_task(manager.broadcast_event)
            if watcher_factory is not None:
                tasks.append(asyncio.create_task(watcher_factory()))
                log.info("Cache watcher task started")
        except Exception as e:
            log.warning(f"Failed to start cache watcher task: {e}")

    # NOTE: Signal lifecycle, auto executor, options archive, trade reconciliation
    # are all PRO-only features — removed in consumer (Rule C1).

    log.info(
        f"Data server ready — "
        f"{len(cfg_manager.get_active_universe())} assets, "
        f"Provider {'connected' if (provider and provider.connected) else 'disconnected (demo mode)'}"
    )
    log.info(f"Listening on http://{server_config.host}:{server_config.port}")

    # --- Disposable debug telemetry harness (env-gated) ---
    if os.environ.get("MK_DEBUG_TELEMETRY") == "1":
        import debug_telemetry
        debug_telemetry.install(app)

    yield

    # ── Shutdown ──
    log.info("Shutting down...")
    for t in tasks:
        t.cancel()
    # Disconnect all providers
    for pid, prov in cfg_manager.get_all_providers().items():
        prov.disconnect()
    log.info("Data server stopped")


app = FastAPI(
    title="Quantum Terminal Data Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Wire consumer routes (auth + sync + status) ──
if CONSUMER_MODE:
    wire_consumer_routes(app)
    log.info("Consumer routes wired")

# ── Wire API routers (must be at module level, not inside lifespan) ──
app.include_router(create_config_router(cfg_manager, manager.broadcast_event))
app.include_router(create_execution_router(cfg_manager, app, manager.broadcast_event))
app.include_router(create_regime_router(cfg_manager, app))
app.include_router(create_system_router())
app.include_router(create_account_router(manager.broadcast_event))
app.include_router(create_freshness_router(cfg_manager))
app.include_router(create_trade_mapper_router(app))
app.include_router(create_pulse_router())
app.include_router(create_chart_presets_router())
app.include_router(create_chart_templates_router())

# ── MT5 connection management routes (consumer settings panel) ──
try:
    from mt5_routes import create_mt5_router
    app.include_router(create_mt5_router(cfg_manager, app))
    log.info("MT5 management routes registered (/api/mt5/*)")
except ImportError:
    log.warning("mt5_routes not available — MT5 settings panel won't work")

# ── Tradovate POC routes (consumer settings panel) ──
# v13: standalone proof-of-work integration. Removing this block + the file
#       backend/tradovate_routes.py + providers/tradovate_provider.py fully
#       disables Tradovate without touching anything else.
try:
    from tradovate_routes import create_tradovate_router
    app.include_router(create_tradovate_router(cfg_manager))
    log.info("Tradovate POC routes registered (/api/tradovate/*)")
except ImportError as _e:
    log.warning(f"tradovate_routes not available: {_e}")

if create_logs_router is not None:
    app.include_router(create_logs_router())

if OPTIONS_AVAILABLE:
    try:
        app.include_router(create_options_router())
        log.info("Options quant routes registered (/api/options/*)")
    except Exception as e:
        log.warning(f"Options routes failed to load: {e}")
        OPTIONS_AVAILABLE = False

# ── Fallback options from sync cache (consumer mode) ──
# v12: convert ETF strikes → live CFD prices server-side so frontend never
#      does ratio math. Ratio = mt5_live_price / options.spot (ETF). Frozen
#      per request so both MainChart's sauce lines and OptionsPanel eat the
#      exact same numbers. When MT5 is offline we pass the raw payload
#      through with _conversion_applied=false and the frontend can flag it.

def _mul_options_prices_inplace(data: dict, ratio: float) -> None:
    """Multiply known strike/level/price fields by ratio in-place."""
    def mul(v):
        return v * ratio if isinstance(v, (int, float)) and v is not None else v

    for k in ("hvl", "max_pain", "gex_flip"):
        if k in data and data[k] is not None:
            data[k] = mul(data[k])

    w = data.get("walls") or {}
    for k in ("primary_call_wall", "primary_put_wall"):
        if k in w and w[k] is not None:
            w[k] = mul(w[k])
    for arr_key in ("call_walls", "put_walls"):
        for item in (w.get(arr_key) or []):
            if isinstance(item, dict) and item.get("strike") is not None:
                item["strike"] = mul(item["strike"])

    # v15: convert both swing `expected_move` and the new `expected_move_0dte`
    #   block (shipped by DC 2026-04-21). Same shape — only `pct` is
    #   dimensionless and stays untouched.
    for em_key in ("expected_move", "expected_move_0dte"):
        em = data.get(em_key) or {}
        for k in ("atm_strike", "move_up", "move_down", "straddle"):
            if k in em and em[k] is not None:
                em[k] = mul(em[k])

    for iv_key in ("iv_divergence", "iv_skew"):
        iv = data.get(iv_key) or {}
        for k in ("atm_strike", "call_25d_strike", "put_25d_strike"):
            if k in iv and iv[k] is not None:
                iv[k] = mul(iv[k])

    dh = data.get("dealer_heatmap") or {}
    for k in ("max_buy_strike", "max_sell_strike"):
        if k in dh and dh[k] is not None:
            dh[k] = mul(dh[k])
    if isinstance(dh.get("strikes"), list):
        dh["strikes"] = [mul(s) for s in dh["strikes"]]

    for gex_key in ("gex", "gex_0dte", "gex_stack"):
        g = data.get(gex_key) or {}
        if isinstance(g.get("strikes"), list):
            g["strikes"] = [mul(s) for s in g["strikes"]]

    # v16: convert both `sauce` (swing) and the new `sauce_0dte` block
    #   (shipped by DC 2026-04-21). Same per-level strike conversion — no
    #   mixing. sauce_0dte is null when today ∉ chain (expected).
    for sauce_key in ("sauce", "sauce_0dte"):
        s_block = data.get(sauce_key) or {}
        for s_key in ("volatility_gravity", "structural_integrity"):
            s = s_block.get(s_key) or {}
            for item in (s.get("levels") or []):
                if isinstance(item, dict) and item.get("strike") is not None:
                    item["strike"] = mul(item["strike"])


def _mt5_mid_for(ticker: str) -> Optional[float]:
    """Fetch current MT5 mid price ((bid+ask)/2) for a canonical ticker.
    Returns None if provider offline or tick unavailable."""
    prov = app.state.provider
    if not prov or not getattr(prov, "connected", False):
        return None
    try:
        ticks = prov.get_latest_ticks([ticker])
        t = ticks.get(ticker) if ticks else None
        if t is None:
            return None
        bid = getattr(t, "bid", None)
        ask = getattr(t, "ask", None)
        if bid and ask:
            return (bid + ask) / 2.0
        return getattr(t, "last", None)
    except Exception:
        return None


if not OPTIONS_AVAILABLE:
    @app.get("/api/options/{ticker}/full")
    async def get_options_from_sync(ticker: str, n: int = 8):
        """Serve options data from consumer sync cache with ETF→CFD conversion
        baked in (v12). All strikes / levels / walls in the returned JSON are
        in MT5 CFD price space — frontend consumes as-is."""
        canonical = ticker.upper()
        try:
            import copy
            from data_sync_client import get_sync_client
            raw = get_sync_client().get_options(canonical)
            if not raw:
                raise HTTPException(404, f"No options data for {canonical}")
            # v12 fix: sync_client returns the live cached reference — mutating
            # it double-multiplies strikes on every subsequent request. Deep
            # copy so conversion only applies to the response, not the cache.
            data = copy.deepcopy(raw)

            # Normalize keys: sync cache may use spot_etf; ensure we have an ETF spot.
            etf_spot = data.get("spot_etf") or data.get("spot")
            if etf_spot is None:
                raise HTTPException(502, f"Options data for {canonical} missing spot price")

            if "canonical" not in data:
                data["canonical"] = canonical
            if "cboe_ticker" not in data:
                cboe_map = {"US500": "SPY", "USTEC": "QQQ", "XAUUSD": "GLD"}
                data["cboe_ticker"] = cboe_map.get(canonical)

            mt5_price = await asyncio.to_thread(_mt5_mid_for, canonical)
            levels_space = data.get("levels_space")

            if levels_space == "broker":
                # Producer (v2.0+) pre-multiplied levels to broker space; consumer no-op.
                if mt5_price:
                    data["spot"] = mt5_price
                data["_conversion_applied"] = True
                data["_conversion_source"] = "broker_native"
            elif mt5_price and etf_spot > 0:
                ratio = mt5_price / etf_spot
                _mul_options_prices_inplace(data, ratio)
                # Always preserve the raw ETF spot; replace top-level spot with the
                # live MT5 price so frontend sees CFD space consistently.
                data["spot_etf"] = etf_spot
                data["spot"] = mt5_price
                data["_conversion_applied"] = True
                data["_conversion_ratio"] = ratio
                data["_conversion_source"] = "mt5_live"
            else:
                # No MT5 price available — fall through with raw ETF values so
                # the panel still renders, but flagged so the UI can warn.
                if "spot" not in data:
                    data["spot"] = etf_spot
                data["_conversion_applied"] = False
                data["_conversion_source"] = "mt5_unavailable"
            return data
        except HTTPException:
            raise
        except Exception as e:
            log.warning(f"options fallback failed for {canonical}: {e}")
            raise HTTPException(404, f"No options data for {canonical}")

    log.info("Options fallback route registered (sync cache, v12 CFD-converted)")


# ── Macro Rotation Endpoints (Money Flow Tabs 2 & 3) ──
if MACRO_DATA_AVAILABLE:
    @app.get("/api/macro/sectors")
    async def api_macro_sectors(refresh: bool = False):
        try:
            from data_sync_client import get_sync_client
            data = get_sync_client().get_macro_sectors()
            if data:
                return data
        except Exception as e:
            log.warning(f"[MACRO] macro_sectors failed: {e}")
        raise HTTPException(404, "No sector data available")

    @app.get("/api/macro/countries")
    async def api_macro_countries(refresh: bool = False):
        try:
            from data_sync_client import get_sync_client
            data = get_sync_client().get_macro_countries()
            if data:
                return data
        except Exception as e:
            log.warning(f"[MACRO] macro_countries failed: {e}")
        raise HTTPException(404, "No country data available")

    @app.get("/api/macro/flows")
    async def api_macro_flows(period: str = "1W"):
        try:
            from data_sync_client import get_sync_client
            data = get_sync_client().get_macro_flows()
            if data:
                key = "4W" if period.upper() == "4W" else "1W"
                flows_obj = data.get(key)
                if flows_obj and "flows" in flows_obj:
                    return flows_obj
        except Exception as e:
            log.warning(f"[MACRO] macro_flows failed: {e}")
        raise HTTPException(404, "No country flow data available")

    log.info("Macro rotation routes registered (/api/macro/sectors, /api/macro/countries, /api/macro/flows)")
else:
    log.info("macro_data not available -- yfinance may not be installed")

# -- Money Flow from sync cache (consumer mode) --
@app.get("/api/fundamental/money-flow")
async def get_money_flow(period: str = "macro"):
    """Serve capital flow data from consumer sync cache."""
    try:
        from data_sync_client import get_sync_client
        data = get_sync_client().get_global("macro_sector_flows")
        if data:
            # Data is keyed by period (1W, 4W). Extract requested period.
            period_map = {"macro": "macro", "weekly": "weekly", "1w": "macro", "4w": "weekly"}
            key = period_map.get(period.lower(), period)
            if key in data:
                return data[key]
            # If only one period exists, return it
            for k, v in data.items():
                if isinstance(v, dict) and "flows" in v:
                    return v
            return data
    except Exception:
        pass
    raise HTTPException(404, "No money flow data available")


# -- Fundamental state (macro regime, liquidity, yields, COT, scores) --
@app.get("/api/fundamental_state")
async def get_fundamental_state():
    """Serve fundamental_state.json from consumer sync cache (Rule C1: read-only)."""
    try:
        from data_sync_client import get_sync_client
        data = get_sync_client().get_fundamentals()
        if data:
            return data
    except Exception as e:
        log.warning(f"[FUNDAMENTAL] fundamental_state failed: {e}")
    raise HTTPException(404, "No fundamental state data available")




# ── REST ENDPOINTS ──────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Server health check — backwards-compatible top-level fields plus
    a v11+ `components` block where each subsystem reports its own
    status. Frontends that want detailed diagnostics read components;
    legacy clients that just check `status == "ok"` still work."""
    uptime = time.time() - start_time
    provider = app.state.provider

    # ── Component health ──
    components: Dict[str, Any] = {}

    # MT5 / data provider
    mt5_connected = bool(provider and provider.connected)
    components["mt5"] = {
        "status": "ok" if mt5_connected else "disconnected",
        "type":   provider.provider_type if provider else None,
        "label":  provider.label if provider else None,
        "connected": mt5_connected,
        "active_symbols": len(cfg_manager.get_active_universe()),
    }

    # License / auth — Quantum Terminal: always free
    components[\"license\"] = {
        \"status\": \"ok\",
        \"user_email\": \"free@quantumterminal\",
        \"subscription_status\": \"active\",
        \"subscription_type\": \"free\",
        \"offline\": False,
    }

    # Sync status
    try:
        from data_sync_client import get_sync_client as _gsc
        _sc = _gsc()
        sync_in_progress = bool(getattr(_sc, "_sync_in_progress", False))
        sync_total = int(getattr(_sc, "_sync_total", 0))
        sync_done  = int(getattr(_sc, "_sync_done",  0))
        sync_errors = list(getattr(_sc, "_sync_errors", []) or [])
        last_synced = getattr(_sc, "last_synced_at", None)
        # Status: error if errors and not in progress, syncing if in progress, ok otherwise
        if sync_in_progress:
            sync_status = "syncing"
        elif sync_errors:
            sync_status = "degraded"
        else:
            sync_status = "ok"
        components["sync"] = {
            "status": sync_status,
            "in_progress": sync_in_progress,
            "progress": (sync_done, sync_total),
            "last_synced_at": last_synced,
            "format_version_ok": bool(getattr(_sc, "format_version_ok", True)),
            "errors_count": len(sync_errors),
            "offline": bool(getattr(_sc, "is_offline", False)),
        }
    except Exception as e:
        components["sync"] = {"status": "error", "error": str(e)}

    # WebSocket clients
    components["websockets"] = {
        "status": "ok",
        "price_clients": manager.price_client_count,
        "event_clients": manager.event_client_count,
    }

    # Build version
    version = None
    try:
        from pathlib import Path as _Path
        for vp in [_Path(__file__).parent / "VERSION",
                   _Path(__file__).parent.parent.parent / "VERSION",
                   _Path(__file__).parent.parent / "VERSION"]:
            if vp.exists():
                version = vp.read_text(encoding="utf-8").strip()
                break
    except Exception:
        pass

    # Roll up overall status — error if any component errored, degraded
    # if any is in a non-ok-but-recoverable state, otherwise ok.
    overall = "ok"
    for c in components.values():
        s = c.get("status")
        if s == "error":
            overall = "error"
            break
        if s in ("disconnected", "auth_required", "degraded", "syncing"):
            overall = "degraded"

    return {
        # Back-compat top-level fields (v1 and earlier readers)
        "status": "ok" if overall != "error" else "error",
        "mt5_connected": mt5_connected,
        "uptime_seconds": round(uptime, 1),
        "active_symbols": len(cfg_manager.get_active_universe()),
        "ws_price_clients": manager.price_client_count,
        "ws_event_clients": manager.event_client_count,
        "universe": cfg_manager.get_display_order(),
        "signal_engine_available": False,
        "active_signals": 0,
        "provider": {
            "type": provider.provider_type if provider else None,
            "label": provider.label if provider else None,
            "connected": mt5_connected,
        },
        # v11+ structured component view
        "overall": overall,
        "version": version,
        "components": components,
    }


@app.get("/api/ticks")
async def get_all_ticks():
    """
    Latest tick for every symbol in the universe.
    Used by the frontend on initial load to seed prices
    (before the WebSocket starts streaming).
    """
    provider = app.state.provider
    if not provider or not provider.connected:
        return {"ticks": {}, "note": "MT5 not connected"}
    universe = cfg_manager.get_active_universe()
    ticks = await asyncio.to_thread(provider.get_latest_ticks, universe)
    return {
        "ticks": {t: tick.to_dict() for t, tick in ticks.items()},
    }


@app.post("/api/focus/{ticker}")
async def post_focus(ticker: str):
    """v9: Tell the backend which symbol the user is actively watching.
    The focus_tick_loop polls only this symbol at FOCUS_TICK_INTERVAL when
    USE TICK DATA is on, giving the chart MT5-style live tick movement
    without paying universe-size MT5 polling cost."""
    set_focused_symbol(ticker)
    return {"focused": get_focused_symbol(), "interval": FOCUS_TICK_INTERVAL}


@app.delete("/api/focus")
async def delete_focus():
    """v9: Clear the focused symbol (focus_tick_loop goes idle)."""
    set_focused_symbol(None)
    return {"focused": None}


@app.get("/api/symbol-info/{ticker}")
async def get_symbol_info(ticker: str):
    """
    Real broker symbol metadata — tick_value, contract_size, etc.
    Used by OrderTicket for accurate P&L preview.
    """
    provider = app.state.provider
    if not provider or not provider.connected:
        raise HTTPException(503, "Provider not connected")
    canonical = ticker.upper()
    info = await asyncio.to_thread(provider.get_symbol_info, canonical)
    if info is None:
        raise HTTPException(404, f"Symbol info not found for {canonical}")
    return info.to_dict()


@app.get("/api/symbol-info")
async def get_all_symbol_info():
    """Batch symbol info for the entire universe."""
    provider = app.state.provider
    if not provider or not provider.connected:
        return {"symbols": {}, "note": "Provider not connected"}
    universe = cfg_manager.get_active_universe()
    infos = await asyncio.to_thread(provider.get_all_symbol_info, universe)
    return {
        "symbols": {t: info.to_dict() for t, info in infos.items()},
    }


@app.get("/api/payload")
async def get_payload():
    """Full terminal_payload.json contents. Returns empty in consumer mode."""
    path = server_config.resolve_path(server_config.terminal_payload)
    data = read_json_safe(path)
    if data is None:
        # Consumer mode: no local payload file — data comes via sync cache
        return {"assets": {}, "note": "Consumer mode — data served via /api/cones and /api/sync"}
    return data


@app.get("/api/payload/{ticker}")
async def get_payload_ticker(ticker: str):
    """Single ticker's payload entry."""
    path = server_config.resolve_path(server_config.terminal_payload)
    data = read_json_safe(path)
    if data is None:
        return {"note": "Consumer mode — use /api/sync/cones/{ticker}"}
    assets = data.get("assets", {})
    canonical = ticker.upper()
    if canonical not in assets:
        return {"note": f"No payload entry for {canonical}"}
    return assets[canonical]


@app.get("/api/signals")
async def get_signals():
    """All signals from daily_signals.json."""
    path = server_config.resolve_path(server_config.daily_signals)
    data = read_json_safe(path)
    if data is None:
        return {"signals": {}, "note": "No signals file found"}
    return data


@app.get("/api/signals/{ticker}")
async def get_signals_ticker(ticker: str):
    """Signals for one ticker."""
    path = server_config.resolve_path(server_config.daily_signals)
    data = read_json_safe(path)
    if data is None:
        raise HTTPException(404, "daily_signals.json not found")
    canonical = ticker.upper()
    if canonical not in data:
        return {"ticker": canonical, "signals": []}
    return {"ticker": canonical, "signals": data[canonical]}


# ── Stress Lab (v10) ─────────────────────────────────────────────────────
# Phase 1: consume DC's stress_lab JSON files from the standard AppData
# cache. Files land there either via data_sync_client (future wiring) or
# manual copy for testing. No computation, no synthesis — display-only (C1).
#
# Expected files in %APPDATA%\QuantumTerminal\cache\ :
#   _stress_lab_index.json         — watchlist
#   {TICKER}_stress_lab.json       — per-asset thesis


def _stress_lab_cache_dir() -> Path:
    """Same cache dir the sync_client writes to — flat layout."""
    from data_sync_client import _get_cache_dir
    return _get_cache_dir()


@app.get("/api/stress_lab/index")
async def get_stress_lab_index():
    """Watchlist — list of assets with conviction + spot + one-liner."""
    path = _stress_lab_cache_dir() / "_stress_lab_index.json"
    data = read_json_safe(path)
    if data is None:
        raise HTTPException(404, "Stress Lab index not available yet — waiting on first sync")
    return data


@app.get("/api/stress_lab/{ticker}")
async def get_stress_lab_thesis(ticker: str):
    """Full per-asset thesis JSON produced by DC stress_lab_engine."""
    canonical = ticker.upper()
    path = _stress_lab_cache_dir() / f"{canonical}_stress_lab.json"
    data = read_json_safe(path)
    if data is None:
        raise HTTPException(404, f"No Stress Lab thesis for {canonical}")
    return data


# v11: Historical backtest positions for the "last filled signal" replay panel.
@app.get("/api/stress_lab/backtest/positions")
async def get_stress_lab_backtest_positions():
    path = _stress_lab_cache_dir() / "_stress_lab_backtest_positions.json"
    data = read_json_safe(path)
    if data is None:
        raise HTTPException(404, "Backtest positions not available yet")
    return data


# v11: Historical bar range — replay chart on Stress Lab last-signal panel.
#      `from` is a Python keyword, so we accept it via Query(alias="from").
from fastapi import Query as _Query
from datetime import datetime as _dt, timezone as _tz

@app.get("/api/bars_range/{ticker}")
async def get_bars_range(
    ticker: str,
    timeframe: str = "M15",
    from_: str = _Query(..., alias="from"),
    to: str = _Query(...),
):
    """OHLCV bars between two ISO-8601 UTC datetimes.
    Used by the Stress Lab last-signal replay chart."""
    canonical = ticker.upper()
    provider = app.state.provider
    if not provider or not provider.connected:
        raise HTTPException(503, "No data provider connected")
    try:
        f_dt = _dt.fromisoformat(from_.replace("Z", "+00:00"))
        t_dt = _dt.fromisoformat(to.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(400, f"bad ISO datetime: {e}")
    if f_dt.tzinfo is None: f_dt = f_dt.replace(tzinfo=_tz.utc)
    if t_dt.tzinfo is None: t_dt = t_dt.replace(tzinfo=_tz.utc)
    if not hasattr(provider, "get_bars_range"):
        raise HTTPException(501, "provider does not support range fetch")
    bars = await asyncio.to_thread(
        provider.get_bars_range, canonical, timeframe, f_dt, t_dt
    )
    if not bars:
        return {"bars": [], "ticker": canonical, "timeframe": timeframe,
                "from": from_, "to": to}
    # Normalize to the shape frontend expects (LWC candles).
    return {
        "ticker": canonical,
        "timeframe": timeframe,
        "from": from_,
        "to": to,
        "bars": [{
            "time": b.time, "open": b.open, "high": b.high,
            "low": b.low, "close": b.close, "volume": b.volume,
        } for b in bars],
    }


@app.get("/api/bands/{ticker}")
async def get_bands(ticker: str):
    """Probability bands data for a ticker. Falls back to sync cache."""
    canonical = ticker.upper()
    # Try PRO local file first
    bands_dir = server_config.resolve_path(server_config.bands_data_dir)
    bands_file = bands_dir / f"{canonical}_bands.json"
    data = read_json_safe(bands_file)
    if data:
        # v26: stamp file mtime for staleness detection on the frontend.
        try:
            data["_last_modified"] = bands_file.stat().st_mtime
        except Exception:
            pass
        return data

    # Fallback 1 (v2 — Data Center): standalone {TICKER}_bands.json in sync cache.
    try:
        from data_sync_client import get_sync_client
        client = get_sync_client()
        bands_data = client.get_bands(canonical)
        if bands_data:
            # v26: best-effort mtime from the sync cache file. Naming
            # patterns observed: <TICKER>_bands.json or GLOBAL_<lower>_bands.json.
            try:
                cache_dir = getattr(client, "cache_dir", None)
                if cache_dir is not None:
                    from pathlib import Path as _P
                    cache_dir_p = _P(cache_dir) if not isinstance(cache_dir, _P) else cache_dir
                    for name in (f"{canonical}_bands.json",
                                 f"GLOBAL_{canonical.lower()}_bands.json"):
                        candidate = cache_dir_p / name
                        if candidate.exists():
                            bands_data["_last_modified"] = candidate.stat().st_mtime
                            break
            except Exception:
                pass
            return bands_data
    except Exception:
        pass

    # Fallback 2 (legacy): bands nested inside the cones sync blob.
    # Retained so any cache still holding pre-transition files keeps working.
    try:
        sync_data = client.get_cones(canonical)
        if sync_data and "bands" in sync_data:
            return sync_data["bands"]
    except Exception:
        pass

    raise HTTPException(404, f"No bands data for {canonical}")


def _sanitize_json(data):
    """Replace NaN/Infinity with None — these are not valid JSON."""
    raw = json.dumps(data, allow_nan=True, default=str)
    raw = raw.replace(": NaN", ": null").replace(":NaN", ":null")
    raw = raw.replace(": Infinity", ": null").replace(":Infinity", ":null")
    raw = raw.replace(": -Infinity", ": null").replace(":-Infinity", ":null")
    return json.loads(raw)


@app.get("/api/state")
async def get_state():
    """Weekly state (regime, anchors, WF params)."""
    path = server_config.resolve_path(server_config.weekly_state)
    data = read_json_safe(path)
    if data is None:
        return {"assets": {}, "note": "No weekly state found — run orchestrator weekly tier"}
    return _sanitize_json(data)


@app.get("/api/bars/{ticker}")
async def get_bars(ticker: str, timeframe: str = "M15", count: int = 200):
    """
    Fetch historical bars directly from MT5.
    Used for initial chart load and timeframe switches.
    """
    canonical = ticker.upper()
    if canonical not in cfg_manager.get_active_universe():
        raise HTTPException(404, f"Ticker {canonical} not in universe")

    provider = app.state.provider
    if not provider or not provider.connected:
        raise HTTPException(503, "No data provider connected")

    bars = await asyncio.to_thread(provider.get_bars, canonical, timeframe, count)
    if not bars:
        raise HTTPException(404, f"No bar data for {canonical} {timeframe}")

    return {
        "ticker": canonical,
        "timeframe": timeframe,
        "count": len(bars),
        "bars": [b.to_dict() for b in bars],
    }


@app.get("/api/lifecycle")
async def get_lifecycle():
    """Signal lifecycle state."""
    path = server_config.resolve_path(server_config.signal_lifecycle)
    data = read_json_safe(path)
    if data is None:
        return {"signals": {}, "note": "No lifecycle file found"}
    return data



# REMOVED: /api/signals/evaluate, /api/orchestrator, /api/calculate (Rule C1)


@app.get("/api/anchors/{ticker}")
async def get_anchors(ticker: str):
    """Institutional anchors + extremes. Falls back to sync cache."""
    canonical = ticker.upper()
    # Try PRO local file first
    anchors_path = PROJECT_ROOT / "terminal_anchors.json"
    data = read_json_safe(anchors_path)
    if data and canonical in data:
        return data[canonical]

    # Fallback: consumer sync cache — anchors are inside the cones response
    try:
        from data_sync_client import get_sync_client
        sync_data = get_sync_client().get_cones(canonical)
        if sync_data:
            result = {}
            if "anchors" in sync_data:
                result["anchors"] = sync_data["anchors"]
            if "extremes" in sync_data:
                result["extremes"] = sync_data["extremes"]
            if result:
                return result
    except Exception:
        pass

    raise HTTPException(404, f"No anchor data for {canonical}")


@app.get("/api/anchors")
async def get_all_anchors():
    """All tickers' anchor data. Falls back to sync cache."""
    anchors_path = PROJECT_ROOT / "terminal_anchors.json"
    data = read_json_safe(anchors_path)
    if data:
        return data
    # Fallback: consumer sync cache
    try:
        from data_sync_client import get_sync_client
        client = get_sync_client()
        result = {}
        for ticker in client.synced_tickers:
            sync_data = client.get_cones(ticker)
            if sync_data:
                entry = {}
                if "anchors" in sync_data:
                    entry["anchors"] = sync_data["anchors"]
                if "extremes" in sync_data:
                    entry["extremes"] = sync_data["extremes"]
                if entry:
                    result[ticker] = entry
        if result:
            return result
    except Exception:
        pass
    return {"anchors": {}, "note": "No anchor data found"}


@app.get("/api/regime_live/{ticker}")
async def get_regime_live_stub(ticker: str, timeframe: str = "M15", bars: int = 500):
    """Stub — regime_live is a PRO-only endpoint (Rule C1).
    Returns empty payload so the frontend stops 404-retrying."""
    return {
        "ticker": ticker.upper(),
        "timeframe": timeframe,
        "data": [],
        "note": "regime_live unavailable in consumer build"
    }


@app.get("/api/cones/{ticker}")
async def get_cones(ticker: str):
    """Probability cone data for a ticker. Falls back to sync cache in consumer mode.
    Also merges GEX cones from the options sync cache (gex_cones lives in
    options JSON, not cones JSON, on the producer side)."""
    canonical = ticker.upper()
    # Try PRO local file first
    cones_file = server_config.resolve_path("terminal_cones.json")
    data = read_json_safe(cones_file)
    if data and canonical in data:
        return data[canonical]

    # Fallback: consumer sync cache (Rule C5)
    result = None
    try:
        from data_sync_client import get_sync_client
        client = get_sync_client()
        sync_data = client.get_cones(canonical)
        if sync_data and "cones" in sync_data:
            result = dict(sync_data.get("cones", {}))
        elif sync_data:
            result = dict(sync_data)

        # Merge gex_cones from the options sync cache. The producer writes
        # gex_now / gex_weekly_1 / gex_weekly_2 into the options JSON, not
        # the cones JSON. Their shape (median, sd1_high, sd1_low, sd2_high,
        # sd2_low, sd3_high, sd3_low, dates) matches the standard cone shape
        # the frontend renderer expects, so a flat merge is enough.
        opt_data = client.get_options(canonical)
        if opt_data and isinstance(opt_data.get("gex_cones"), dict):
            if result is None:
                result = {}
            for k, v in opt_data["gex_cones"].items():
                # Don't clobber any pre-existing key (cones JSON wins if both exist)
                if k not in result:
                    result[k] = v
    except Exception:
        pass

    if result:
        return result
    raise HTTPException(404, f"No cone data for {canonical}")


@app.get("/api/quarterly_cones/{ticker}")
async def get_quarterly_cones(ticker: str):
    """Quarterly cone forecast (183-day+ horizon, 4 anchors × 2 models).
    v6 — Reads {TICKER}_quarterly_cones.json from the consumer cache.
    v7 — Also handles the Data Center's GLOBAL_<lower>_quarterly_cones.json
         naming convention (same legacy pattern as historical_cones / scalp_bands).
         Routes through the sync client first (in-memory store populated by
         resolve_cache_filename), then falls back to direct file reads.
    Shape: median + sd1/2/3 high/low + dates per model, keys prefixed
           gbm_quarter_*, mjd_quarter_*."""
    import json as _json
    canonical = ticker.upper()
    try:
        from data_sync_client import get_sync_client, _get_cache_dir
        client = get_sync_client()
        # (1) in-memory store (populated by sync_all + _load_all_from_cache)
        data = client._get_data(canonical, "quarterly_cones")
        if data:
            return data
        # (2) direct disk fallback — try both naming conventions explicitly,
        #     in case the cache scan hasn't run yet for this session.
        cache_dir = _get_cache_dir()
        for path in (
            cache_dir / f"{canonical}_quarterly_cones.json",
            cache_dir / f"GLOBAL_{canonical.lower()}_quarterly_cones.json",
        ):
            if path.is_file():
                return _json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning(f"quarterly_cones load failed for {canonical}: {e}")
    raise HTTPException(404, f"No quarterly cone data for {canonical}")


# v14: TEMPORARY dev-only route. Reads the producer's bands-replay JSON
#      directly from D:\MK_DATA_CENTER\temp_out so the replay view can
#      render the new per-day anchor schema before the real sync pipeline
#      exists. Delete this function (and its import side-effects) to revert.
@app.get("/api/bands_replay/{ticker}")
async def get_bands_replay(ticker: str):
    """Bands-replay prototype — reads {TICKER}_bands_replay.json from
    D:\\MK_DATA_CENTER\\temp_out (dev path only). Schema matches
    /api/historical_cones but with a 'daily' bucket, a 'head' warm-start
    block, and fusion_instructions metadata. Returns 404 if the file
    isn't present (non-XAUUSD tickers, production boxes, etc)."""
    import json as _json
    from pathlib import Path as _Path
    canonical = ticker.upper()
    test_dir = _Path(r"D:\MK_DATA_CENTER\temp_out")
    path = test_dir / f"{canonical}_bands_replay.json"
    if not path.is_file():
        raise HTTPException(404, f"No bands_replay data for {canonical}")
    try:
        return _json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning(f"bands_replay load failed for {canonical}: {e}")
        raise HTTPException(500, f"bands_replay parse failed for {canonical}")


@app.get("/api/scalp_bands/{ticker}")
async def get_scalp_bands(ticker: str):
    """Scalp bands (5-min anchor + per-horizon projections) for the MICRO
    toggle in the BANDS dropdown. Served from the sync cache.
    Source file: GLOBAL_<lower_ticker>_scalp_bands.json (resolver-routed)."""
    canonical = ticker.upper()
    try:
        from data_sync_client import get_sync_client
        client = get_sync_client()
        data = client._get_data(canonical, "scalp_bands")
        if data:
            return data
    except Exception:
        pass
    raise HTTPException(404, f"No scalp bands data for {canonical}")


@app.get("/api/historical_cones/{ticker}")
async def get_historical_cones(ticker: str):
    """Historical cone anchors (weekly + monthly) for the REPLAY sub-tab.
    Each anchor date maps to a dict with gbm / mjd / bates model payloads
    (median + sd1/2/3 high/low + dates). Served from the sync cache.
    v17: mirrors the quarterly_cones endpoint — falls back to direct file
    reads (both `{TICKER}_*.json` and `GLOBAL_<lower>_*.json` shapes)
    when the in-memory store hasn't been populated yet. Without this, a
    cold-boot or stalled-sync session would 404 on tickers that have a
    file-on-disk but no store entry yet (e.g. EURUSD).
    """
    import json as _json
    canonical = ticker.upper()
    try:
        from data_sync_client import get_sync_client, _get_cache_dir
        client = get_sync_client()
        # (1) in-memory store (populated by sync_all + _load_all_from_cache)
        data = client._get_data(canonical, "historical_cones")
        if data:
            return data
        # (2) direct disk fallback — handles legacy GLOBAL_<lower> naming.
        cache_dir = _get_cache_dir()
        for path in (
            cache_dir / f"{canonical}_historical_cones.json",
            cache_dir / f"GLOBAL_{canonical.lower()}_historical_cones.json",
        ):
            if path.is_file():
                return _json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning(f"historical_cones load failed for {canonical}: {e}")
    raise HTTPException(404, f"No historical cone data for {canonical}")


@app.get("/api/cones")
async def get_all_cones():
    """All computed cone data. Falls back to sync cache."""
    cones_file = server_config.resolve_path("terminal_cones.json")
    data = read_json_safe(cones_file)
    if data:
        return data
    # Fallback: consumer sync cache
    try:
        from data_sync_client import get_sync_client
        client = get_sync_client()
        result = {}
        for ticker in client.synced_tickers:
            sync_data = client.get_cones(ticker)
            if sync_data and "cones" in sync_data:
                result[ticker] = sync_data["cones"]
            elif sync_data:
                result[ticker] = sync_data
        if result:
            return result
    except Exception:
        pass
    return {"note": "No cones data found"}


# ── PROBABILITY FIELD ENDPOINT ────────────────────────────

@app.get("/api/probability-field/{ticker}")
async def get_probability_field(ticker: str):
    """
    Probability field (v2.0) — consumer version.

    Serves the full pre-computed payload from sync cache.
    Both modes (month_curr, month_prev) are bundled in one response —
    the frontend picks which mode to render from the cached payload.

    Rule C1: no live computation. Rule C5: cache-only serving.
    """
    canonical = ticker.upper()

    try:
        from data_sync_client import get_sync_client
        probfield = get_sync_client().get_probfield(canonical)
    except Exception as e:
        log.warning(f"[probfield] get_probfield failed for {canonical}: {e}")
        probfield = None

    if not probfield:
        raise HTTPException(
            404,
            f"No probability field data for {canonical}. "
            f"Data may not have synced yet."
        )

    # Return the full v2.0 payload unchanged.
    # Frontend reads probfield.modes.month_curr / month_prev directly.
    return probfield

# ── PATH OUTCOME FOREST (PRO) ─────────────────────────────
# v20: serve the per-ticker path_forest forecast from sync cache. Producer
# writes GLOBAL_<lower>_path_forest.json once live; meanwhile DC has shipped
# 5 scenario fixtures (trend / range / stress / mixed / miscal) so the
# frontend can develop against varied conditions. The `scenario` query param
# picks among the fixtures; live filename takes priority when present.

@app.get("/api/forest")
async def list_forest_assets():
    """
    v21: List every ticker that has a path_forest forecast in cache.
    Used by the Stress Lab → Forest Path sub-tab so its asset selector
    auto-populates with whatever DC has shipped instead of relying on a
    hardcoded probe list. Returns ISO sorted upper-case tickers.
    """
    import re
    from data_sync_client import _get_cache_dir
    cache_dir = _get_cache_dir()
    if not cache_dir or not cache_dir.exists():
        return {"tickers": []}
    pattern = re.compile(r"^GLOBAL_([a-z0-9_]+)_path_forest(?:_[a-z]+)?\.json$")
    found = set()
    try:
        for p in cache_dir.iterdir():
            if not p.is_file():
                continue
            m = pattern.match(p.name)
            if m:
                found.add(m.group(1).upper())
    except Exception as e:
        log.warning(f"[forest] index scan failed: {e}")
    return {"tickers": sorted(found)}


@app.get("/api/forest/{ticker}")
async def get_forest(ticker: str, scenario: str = "mixed"):
    """
    Path Outcome Forest forecast (PRO feature).
    Reads the cached path_forest JSON for the given ticker.
    Rule C1: no live computation. Rule C5: cache-only.
    """
    from data_sync_client import _get_cache_dir
    canonical = (ticker or "").lower()
    if not canonical:
        raise HTTPException(400, "ticker required")

    valid = {"trend", "range", "stress", "mixed", "miscal"}
    if scenario not in valid:
        scenario = "mixed"

    cache_dir = _get_cache_dir()
    candidates = [
        cache_dir / f"GLOBAL_{canonical}_path_forest.json",
        cache_dir / f"GLOBAL_{canonical}_path_forest_{scenario}.json",
    ]
    for p in candidates:
        try:
            if p.exists():
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            log.warning(f"[forest] read failed for {p}: {e}")
            continue

    raise HTTPException(
        404,
        f"No path_forest data for {ticker} (tried scenario '{scenario}'). "
        f"Producer may not have fired yet."
    )

# ── MANUAL CONE ENDPOINTS ──────────────────────────────────


# REMOVED: /api/cones/manual (Rule C1 — computation endpoint)


@app.get("/api/performance/summary")
async def get_performance_summary(days: int = 90):
    """
    Comprehensive performance summary from auto_executor_log.json.
    Includes win/loss metrics in $ and pips, gate funnel, daily timeline.
    Used by the PerformanceDashboard component.
    Note: win/loss are EXPECTED (based on TP/SL), not realised (no outcome tracking yet).
    """
    log_path = PROJECT_ROOT / "auto_executor_log.json"
    if not log_path.exists():
        return {"total": 0, "days": days}

    try:
        with open(log_path) as f:
            all_records = json.load(f)
    except Exception:
        return {"total": 0, "error": "Failed to read log"}

    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    records = [r for r in all_records if r.get("timestamp", "") >= cutoff]

    if not records:
        return {"total": 0, "days": days}

    # ── Gate funnel (all records) ──
    funnel: dict = {}
    for r in records:
        action = r.get("action", "unknown")
        gate   = r.get("gate", action)
        key = gate if action in ("skipped", "blocked") else action
        funnel[key] = funnel.get(key, 0) + 1

    # ── Executed trades ONLY for P&L metrics ──
    executed = [r for r in records if r.get("action") == "executed"]
    # Dry-run trades for activity display only
    dry_run  = [r for r in records if r.get("action") == "dry_run"]
    trades   = executed + dry_run  # combined for non-P&L distributions

    ne = len(executed)  # count of real executions

    # ── Win/loss helpers (expected, based on TP/SL distances) ──
    def _win_usd(r):
        return round(r.get("risk_usd", 0) * r.get("risk_reward", 0), 2)

    def _loss_usd(r):
        return round(r.get("risk_usd", 0), 2)

    def _win_pips(r):
        entry  = r.get("fill_price") or r.get("entry_price", 0)
        target = r.get("take_profit", 0)
        if not entry or not target:
            return 0.0
        return _to_pips(r.get("ticker", ""), abs(target - entry))

    def _loss_pips(r):
        entry = r.get("fill_price") or r.get("entry_price", 0)
        sl    = r.get("stop_loss", 0)
        if not entry or not sl:
            return 0.0
        return _to_pips(r.get("ticker", ""), abs(entry - sl))

    avg_win_usd  = round(sum(_win_usd(r)  for r in executed) / ne, 2) if ne else 0
    avg_loss_usd = round(sum(_loss_usd(r) for r in executed) / ne, 2) if ne else 0
    avg_win_pips  = round(sum(_win_pips(r)  for r in executed) / ne, 1) if ne else 0
    avg_loss_pips = round(sum(_loss_pips(r) for r in executed) / ne, 1) if ne else 0
    total_risk_usd   = round(sum(_loss_usd(r) for r in executed), 2)
    avg_risk_pct     = round(sum(r.get("risk_pct", 0) for r in executed) / ne, 4) if ne else 0
    avg_conf         = round(sum(r.get("confidence", 0) for r in executed) / ne, 4) if ne else 0
    avg_rr           = round(sum(r.get("risk_reward", 0) for r in executed) / ne, 2) if ne else 0

    # ── By ticker (executed only) ──
    by_ticker: dict = {}
    for r in executed:
        t = r.get("ticker", "?")
        by_ticker.setdefault(t, {
            "count": 0, "risk_usd": 0.0, "win_usd": 0.0,
            "win_pips": 0.0, "loss_pips": 0.0, "confidence": [],
        })
        by_ticker[t]["count"] += 1
        by_ticker[t]["risk_usd"]  = round(by_ticker[t]["risk_usd"]  + _loss_usd(r), 2)
        by_ticker[t]["win_usd"]   = round(by_ticker[t]["win_usd"]   + _win_usd(r),  2)
        by_ticker[t]["win_pips"]  = round(by_ticker[t]["win_pips"]  + _win_pips(r), 1)
        by_ticker[t]["loss_pips"] = round(by_ticker[t]["loss_pips"] + _loss_pips(r), 1)
        by_ticker[t]["confidence"].append(r.get("confidence", 0))
    for t, d in by_ticker.items():
        c = d.pop("confidence")
        cnt = d["count"]
        d["avg_confidence"] = round(sum(c) / len(c), 4) if c else 0
        d["avg_win_usd"]    = round(d["win_usd"]   / cnt, 2) if cnt else 0
        d["avg_loss_usd"]   = round(d["risk_usd"]  / cnt, 2) if cnt else 0
        d["avg_win_pips"]   = round(d["win_pips"]  / cnt, 1) if cnt else 0
        d["avg_loss_pips"]  = round(d["loss_pips"] / cnt, 1) if cnt else 0

    # ── By signal type (executed only) ──
    by_type: dict = {}
    for r in executed:
        st = r.get("signal_type", "?")
        by_type[st] = by_type.get(st, 0) + 1

    # ── By calibration grade (executed only) ──
    by_grade: dict = {}
    for r in executed:
        g = r.get("calibration_grade", "?") or "?"
        by_grade[g] = by_grade.get(g, 0) + 1

    # ── By regime (executed only) ──
    by_regime: dict = {}
    for r in executed:
        reg = r.get("regime", "?") or "?"
        by_regime[reg] = by_regime.get(reg, 0) + 1

    # ── By direction (executed only) ──
    by_direction: dict = {"long": 0, "short": 0}
    for r in executed:
        d = r.get("direction", "")
        if d in by_direction:
            by_direction[d] += 1

    # ── Daily timeline (all records for activity view) ──
    daily: dict = {}
    for r in records:
        ts = r.get("timestamp", "")[:10]
        if not ts:
            continue
        if ts not in daily:
            daily[ts] = {"executed": 0, "dry_run": 0, "skipped": 0, "blocked": 0, "awaiting": 0}
        action = r.get("action", "")
        if action == "executed":           daily[ts]["executed"] += 1
        elif action == "dry_run":          daily[ts]["dry_run"] += 1
        elif action == "skipped":          daily[ts]["skipped"] += 1
        elif action == "blocked":          daily[ts]["blocked"] += 1
        elif action == "awaiting_confirmation": daily[ts]["awaiting"] += 1
    timeline = [{"date": d, **counts} for d, counts in sorted(daily.items())]

    # ── Skipped by gate ──
    by_gate: dict = {}
    for r in records:
        if r.get("action") == "skipped":
            g = r.get("gate", "unknown")
            by_gate[g] = by_gate.get(g, 0) + 1

    return {
        "days": days,
        "total_records": len(records),
        "total_executed": ne,
        "total_dry_run": len(dry_run),
        "avg_confidence": avg_conf,
        "avg_risk_reward": avg_rr,
        "avg_win_usd": avg_win_usd,
        "avg_loss_usd": avg_loss_usd,
        "avg_win_pips": avg_win_pips,
        "avg_loss_pips": avg_loss_pips,
        "total_risk_usd": total_risk_usd,
        "avg_risk_pct": avg_risk_pct,
        "funnel": funnel,
        "by_gate": by_gate,
        "timeline": timeline,
        "by_ticker": by_ticker,
        "by_type": by_type,
        "by_grade": by_grade,
        "by_regime": by_regime,
        "by_direction": by_direction,
    }


# ── WEBSOCKET ENDPOINTS ─────────────────────────────────────

@app.websocket("/ws/prices")
async def ws_prices(ws: WebSocket):
    """
    Live price stream.
    Client can optionally send subscribe messages to filter tickers.
    By default, all universe tickers are streamed.
    """
    await manager.connect_prices(ws)
    try:
        while True:
            # Keep connection alive; process client messages
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                # Parse client commands (subscribe/unsubscribe)
                try:
                    msg = json.loads(raw)
                    if msg.get("action") == "subscribe":
                        # Future: per-client filtering
                        log.debug(f"Client subscribe: {msg.get('tickers', [])}")
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await ws.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_prices(ws)


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    """
    State change event stream.
    Pushes notifications when state files change.
    """
    await manager.connect_events(ws)
    try:
        while True:
            try:
                # Just keep alive — events are pushed server-side
                await asyncio.wait_for(ws.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                try:
                    await ws.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_events(ws)


# ============================================================
# 7. ENTRY POINT
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Quantum Terminal Data Server")
    parser.add_argument("--host", default=server_config.host, help="Bind address")
    parser.add_argument("--port", type=int, default=server_config.port, help="Port number")
    parser.add_argument("--reload", action="store_true", help="Auto-reload on code changes")
    args = parser.parse_args()

    server_config.host = args.host
    server_config.port = args.port

    uvicorn.run(
        "data_server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()