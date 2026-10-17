# version: v3
"""
================================================================================
Quantum Terminal Consumer — Startup Gate & Route Wiring
================================================================================
v3 — consumer_gate() now accepts `skip_sync=False`. data_server's lifespan
     calls it with `skip_sync=True` so the auth phase runs synchronously
     (needed for login routing) while the slow sync_all() is kicked off in
     a background thread after lifespan returns. HTTP routes become
     available immediately; frontend polls /api/sync/status for the SYNCING
     pill. Eliminates the "15-minute loading screen" symptom caused by
     persistent 5xx responses on specific data endpoints.

v2 — Wire /api/version (version_info.py) so the app can report its running
     version and check for updates via /api/version endpoint.
Bridges the consumer-specific modules (data_sync_client)
into the existing data_server.py with MINIMAL changes to the PRO codebase.

Usage in data_server.py lifespan:
    from consumer_startup import consumer_gate, wire_consumer_routes

    # In lifespan, BEFORE provider connect:
    gate_result = consumer_gate()
    if not gate_result["ok"]:
        # Terminal won't render — gate_result has details
        pass

    # After app creation:
    wire_consumer_routes(app)

This module does NOT introduce any calculation triggers.
================================================================================
"""

import logging
from typing import Optional

log = logging.getLogger("qt.consumer_startup")


# ============================================================
# 1. CONSUMER STARTUP GATE (Rule C2)
# ============================================================

def consumer_gate(skip_sync: bool = False) -> dict:
    """
    Run the consumer startup gate (Rule C2).

    Three conditions must be met before terminal renders:
        1. Auth always passes (Quantum Terminal is free)
        2. data_sync_client completes download OR loads from cache
        3. MT5 connection established (handled by existing data_server code)

    This function handles conditions 1 and 2.

    v3: when `skip_sync=True`, only the auth phase runs (fast). Caller is
        responsible for running sync in a background thread so the FastAPI
        lifespan isn't blocked by a slow/unhealthy server. `sync_summary`
        will be returned as {"in_progress": True} in that case — populate it
        from the thread when sync completes.
    Returns dict with gate status:
        {
            "ok": bool,
            "auth_result": AuthResult dict,
            "sync_summary": dict,
            "needs_login": bool,
            "needs_update": bool,
            "offline_mode": bool,
        }
    """
    result = {
        "ok": False,
        "auth_result": None,
        "sync_summary": None,
        "needs_login": False,
        "needs_update": False,
        "offline_mode": False,
    }

    # ── Gate 1: Auth validation ──
    # Removed in Quantum Terminal: Always authenticated
    result["auth_result"] = {"status": "ok", "message": "Quantum Terminal - Free Edition"}
    result["needs_login"] = False

    # ── Gate 2: Data sync ──
    # v3: skip_sync=True → lifespan will run sync_all() in a background
    #   thread instead, so the HTTP server is responsive immediately.
    if skip_sync:
        result["sync_summary"] = {"in_progress": True}
    else:
        try:
            from data_sync_client import get_sync_client
            sync_client = get_sync_client()
            sync_summary = sync_client.sync_all()
            result["sync_summary"] = sync_summary

            # Rule C6: format version mismatch blocks terminal
            if not sync_summary.get("format_version_ok", True):
                log.error("Startup gate: FORMAT VERSION MISMATCH — update required")
                result["needs_update"] = True
                result["ok"] = False
                return result

            if sync_summary.get("offline_mode", False):
                result["offline_mode"] = True

        except ImportError:
            log.warning("data_sync_client not available — skipping data sync (dev mode)")
            result["sync_summary"] = {"note": "dev mode — no sync"}
        except Exception as e:
            log.error(f"Data sync error: {e}")
            result["sync_summary"] = {"error": str(e)}

    result["ok"] = True
    log.info("Consumer startup gate PASSED")
    return result


# ============================================================
# 2. ROUTE WIRING
# ============================================================

def wire_consumer_routes(app):
    """
    Wire consumer-specific FastAPI routes into the existing app.
    Call this AFTER app = FastAPI() in data_server.py.

    Adds:
        /api/sync/*       — sync status, cone/options data, staleness, refresh
        /api/consumer/*   — consumer-specific status endpoints
    """
    routes_added = []

    # Auth routes — none: Quantum Terminal has no accounts or subscriptions.

    # Data sync routes
    try:
        from data_sync_client import create_data_sync_routes
        app.include_router(create_data_sync_routes())
        routes_added.append("data_sync")
        log.info("Consumer data sync routes wired: /api/sync/*")
    except ImportError:
        log.warning("data_sync_client not available — sync routes not wired")
    except Exception as e:
        log.error(f"Failed to wire data sync routes: {e}")

    # v2: version/update-check route
    try:
        from version_info import create_version_router, CURRENT_VERSION
        app.include_router(create_version_router())
        routes_added.append("version")
        log.info(f"Consumer version route wired: /api/version (running v{CURRENT_VERSION})")
    except ImportError:
        log.warning("version_info not available — /api/version not wired")
    except Exception as e:
        log.error(f"Failed to wire version route: {e}")

    # Consumer status endpoint
    from fastapi import APIRouter
    consumer_router = APIRouter(tags=["consumer"])

    @consumer_router.get("/api/consumer/status")
    async def consumer_status():
        """Consumer terminal status — used by frontend to decide what to show."""
        status = {
            "is_consumer": True,
            "routes_available": routes_added,
        }

        # Sync status
        try:
            from data_sync_client import get_sync_client
            sc = get_sync_client()
            status["synced_tickers"] = sc.synced_tickers
            status["offline_mode"] = sc.is_offline
            status["server_configured"] = sc.server_configured
            status["format_version_ok"] = sc.format_version_ok
            status["sync_in_progress"] = sc.is_syncing   # drives the top-bar pill
            status["last_synced_at"] = sc.last_synced_at

            staleness = sc.get_overall_staleness()
            status["analysis_date"] = staleness.display_date
            status["staleness_level"] = staleness.level.value
        except Exception:
            status["synced_tickers"] = []
            status["offline_mode"] = True
            status["server_configured"] = False
            status["sync_in_progress"] = False

        return status

    @consumer_router.post("/api/consumer/restart")
    async def consumer_restart():
        """
        Restart the terminal backend process. Spawns a fresh instance and
        exits the current one after a brief delay so the HTTP response can
        flush before the process exits.

        Rule C1 compliance: this restarts the display server only — no
        calculation modules are involved.
        """
        import sys, os, subprocess, threading
        import time as _time

        def _do_restart():
            _time.sleep(1.0)
            try:
                creationflags = 0
                if os.name == "nt":
                    creationflags = getattr(subprocess, "DETACHED_PROCESS", 0) | \
                                    getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                subprocess.Popen(
                    [sys.executable] + sys.argv,
                    close_fds=True,
                    creationflags=creationflags,
                )
            except Exception as e:
                log.error(f"Restart spawn failed: {e}")
            os._exit(0)

        threading.Thread(target=_do_restart, daemon=True).start()
        log.warning("Consumer restart requested via /api/consumer/restart")
        return {"status": "restarting", "delay_ms": 1000}

    app.include_router(consumer_router)
    log.info("Consumer status route wired: /api/consumer/status")

    return routes_added


# ============================================================
# 3. BLOCKED ENDPOINTS (Rule C1)
# ============================================================

# These endpoint prefixes must NEVER exist in the consumer terminal.
# consumer_verify.py test script checks for them.
BLOCKED_ENDPOINT_PREFIXES = [
    "/api/calculate",
    "/api/calibrate",
    "/api/calibration/run",
    "/api/run-backtest",
    "/api/wf/run",
    "/api/flow/calibrate",
    "/api/anchor/calibrate",
    "/api/dev/clear-cache",   # calc target clears calculation data
]
