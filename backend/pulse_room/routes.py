# version: v2
"""Pulse Room REST endpoints.

Wire into data_server.py:
    from pulse_room.routes import create_pulse_router
    app.include_router(create_pulse_router())

Endpoints:
    GET  /api/pulse/state       — full state (scanner, watchlist, snapshot, meta)
    POST /api/pulse/calculate   — rebuild snapshot (sync; 409 if in-flight)
    PUT  /api/pulse/watchlist   — replace watchlist
    PUT  /api/pulse/scanner     — set scanner enabled flag
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import builder, state
# Concurrency: only one Calculate at a time. Lock lives in state.py so
# sync_hook.py shares the same instance and the two paths can't race.
from .state import calc_lock as _calc_lock


log = logging.getLogger("qt.pulse_room.routes")


# ---------- request models ----------

class WatchlistAssetIn(BaseModel):
    symbol: str
    families: list[str]


class WatchlistIn(BaseModel):
    assets: list[WatchlistAssetIn]


class ScannerIn(BaseModel):
    enabled: bool


# ---------- helpers ----------

def _read_snapshot() -> tuple[dict | None, dict]:
    """Return (snapshot, meta). Snapshot may be None if not yet built."""
    path = state._pulse_dir() / "pulse_snapshot.json"
    if not path.exists():
        return None, {"exists": False}
    try:
        with open(path, "r", encoding="utf-8") as f:
            snap = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None, {"exists": False}
    meta = {
        "exists": True,
        "computed_at": snap.get("computed_at"),
        "source_sync_at": snap.get("source_sync_at"),
        "watchlist_hash": snap.get("watchlist_hash"),
        "asset_count": len(snap.get("assets", {})),
        "size_bytes": path.stat().st_size,
    }
    return snap, meta


def _build_state_response() -> dict:
    snap, meta = _read_snapshot()
    return {
        "scanner_enabled": state.load_scanner().get("enabled", False),
        "watchlist": state.load_watchlist(),
        "snapshot_meta": meta,
        "snapshot": snap,
    }


# ---------- router ----------

def create_pulse_router() -> APIRouter:
    router = APIRouter(prefix="/api/pulse", tags=["pulse"])

    @router.get("/state")
    async def get_state():
        return _build_state_response()

    @router.put("/scanner")
    async def put_scanner(body: ScannerIn):
        state.save_scanner({"enabled": body.enabled})
        return _build_state_response()

    @router.put("/watchlist")
    async def put_watchlist(body: WatchlistIn):
        wl = {"assets": [a.model_dump() for a in body.assets]}
        state.save_watchlist(wl)
        return _build_state_response()

    @router.post("/calculate")
    async def post_calculate():
        wl = state.load_watchlist()
        if not wl.get("assets"):
            raise HTTPException(400, detail="Watchlist is empty")

        if not _calc_lock.acquire(blocking=False):
            raise HTTPException(409, detail="A calculate is already in progress")
        try:
            try:
                # build_snapshot does sync file I/O; offload to a worker
                # thread so we don't block the FastAPI event loop (which
                # would freeze /api/ticks, /ws/prices, etc. for 0.5–3 s).
                await asyncio.to_thread(builder.build_snapshot, wl, write=True)
            except Exception as e:
                log.exception("Calculate failed")
                raise HTTPException(500, detail=f"Calculate failed: {e}") from e
        finally:
            _calc_lock.release()

        return _build_state_response()

    return router
