# version: v2
"""
config_routes.py — Terminal Configuration API Routes
=====================================================

v2 — PATCH handler now detects broker_symbol changes in
     universe.custom_tickers[*].broker_symbol and, for each affected ticker,
     calls provider.reset_symbol() on every live provider so MT5 picks up
     the new mapping at the next tick/bar fetch (no restart required).
     Also triggers a data_sync_complete broadcast so the frontend refetches
     bars for the affected tickers.
Serves GET /api/config and all mutation endpoints used by useConfig.js.

Endpoints:
    GET    /api/config                       → full merged config
    PATCH  /api/config                       → partial update
    POST   /api/config/tickers               → add ticker
    DELETE /api/config/tickers/{ticker}       → remove ticker
    POST   /api/config/tickers/{ticker}/toggle → hide/show
    PUT    /api/config/tickers/order          → reorder
    POST   /api/config/profiles              → save profile
    POST   /api/config/profiles/{name}/load  → load profile
    DELETE /api/config/profiles/{name}        → delete profile

This module does NOT introduce any calculation triggers.
"""

import logging
from typing import Callable, Optional, Set
from fastapi import APIRouter, Request, HTTPException

log = logging.getLogger("config_routes")


# v2 — helpers for broker_symbol hot-rewiring.
def _collect_broker_symbol_changes(patch: dict) -> Set[str]:
    """Walk a PATCH body and return the set of tickers whose broker_symbol
    is being set (value may be null to clear). Safe for any patch shape."""
    out = set()
    try:
        custom = (patch.get("universe", {}) or {}).get("custom_tickers", {}) or {}
        for ticker, fields in custom.items():
            if isinstance(fields, dict) and "broker_symbol" in fields:
                out.add(str(ticker).upper())
    except Exception as e:
        log.warning(f"Failed to scan patch for broker_symbol changes: {e}")
    return out


def _apply_broker_symbol_resets(cfg_manager, tickers: Set[str]) -> None:
    """For each live provider that supports it, evict and re-resolve each
    ticker so the new broker_symbol override takes effect at the next fetch."""
    try:
        providers = cfg_manager.get_all_providers()
    except Exception as e:
        log.warning(f"get_all_providers failed: {e}")
        return
    for pid, prov in (providers or {}).items():
        if not hasattr(prov, "reset_symbol"):
            continue
        for t in tickers:
            try:
                resolved = prov.reset_symbol(t)
                log.info(f"[{pid}] reset_symbol({t}) → {resolved}")
            except Exception as e:
                log.warning(f"[{pid}] reset_symbol({t}) failed: {e}")


def create_config_router(cfg_manager, broadcast_event: Optional[Callable] = None) -> APIRouter:
    """
    Create config API router wired to the given ConfigManager instance.
    broadcast_event: async callable to push WS events on config change.
    """
    router = APIRouter(prefix="/api/config", tags=["config"])

    async def _notify():
        """Push config_update event to all WS clients."""
        if broadcast_event:
            try:
                await broadcast_event({"type": "config_update"})
            except Exception:
                pass  # Non-critical

    # ── GET /api/config — full merged config ──
    @router.get("")
    async def get_config():
        return cfg_manager.get_config()

    # ── PATCH /api/config — partial update ──
    @router.patch("")
    async def patch_config(request: Request):
        try:
            patch = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        # Secrets come back masked from GET /api/config: never store the mask.
        try:
            for acc in ((patch.get("providers") or {}).get("accounts") or {}).values():
                if isinstance(acc, dict):
                    for key in [k for k, v in acc.items() if v == "••••••"]:
                        acc.pop(key)
        except AttributeError:
            pass

        # v2: detect broker_symbol changes in custom_tickers so we can re-resolve
        # the affected tickers on the live MT5 provider without a restart.
        affected_tickers = _collect_broker_symbol_changes(patch)

        cfg_manager.update(patch)

        if affected_tickers:
            _apply_broker_symbol_resets(cfg_manager, affected_tickers)
            try:
                if broadcast_event:
                    await broadcast_event({
                        "type": "data_sync_complete",
                        "source": "broker_symbol_change",
                        "tickers": sorted(affected_tickers),
                    })
            except Exception:
                pass  # non-critical

        await _notify()
        return cfg_manager.get_config()

    # ── POST /api/config/tickers — add ticker ──
    @router.post("/tickers")
    async def add_ticker(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        ticker = body.get("ticker", "").strip().upper()
        if not ticker:
            raise HTTPException(400, "ticker is required")

        metadata = body.get("metadata")
        success = cfg_manager.add_ticker(ticker, metadata)
        if success:
            await _notify()
        return {"success": success, "ticker": ticker}

    # ── DELETE /api/config/tickers/{ticker} — remove ticker ──
    @router.delete("/tickers/{ticker}")
    async def remove_ticker(ticker: str):
        canonical = ticker.upper()
        success = cfg_manager.remove_ticker(canonical)
        if success:
            await _notify()
        return {"success": success, "ticker": canonical}

    # ── POST /api/config/tickers/{ticker}/toggle — hide/show ──
    @router.post("/tickers/{ticker}/toggle")
    async def toggle_ticker(ticker: str):
        canonical = ticker.upper()
        visible = cfg_manager.toggle_ticker_visibility(canonical)
        await _notify()
        return {"ticker": canonical, "visible": visible}

    # ── PUT /api/config/tickers/order — reorder display ──
    @router.put("/tickers/order")
    async def reorder_tickers(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        order = body.get("order", [])
        if not isinstance(order, list):
            raise HTTPException(400, "order must be a list of ticker strings")

        cfg_manager.reorder_tickers(order)
        await _notify()
        return {"success": True, "order": order}

    # ── POST /api/config/profiles — save profile ──
    @router.post("/profiles")
    async def save_profile(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        name = body.get("name", "").strip()
        if not name:
            raise HTTPException(400, "name is required")

        cfg_manager.save_profile(name)
        await _notify()
        return {"success": True, "name": name}

    # ── POST /api/config/profiles/{name}/load — load profile ──
    @router.post("/profiles/{name}/load")
    async def load_profile(name: str):
        success = cfg_manager.load_profile(name)
        if not success:
            raise HTTPException(404, f"Profile '{name}' not found")
        await _notify()
        return {"success": True, "name": name}

    # ── DELETE /api/config/profiles/{name} — delete profile ──
    @router.delete("/profiles/{name}")
    async def delete_profile(name: str):
        success = cfg_manager.delete_profile(name)
        if not success:
            raise HTTPException(404, f"Profile '{name}' not found")
        await _notify()
        return {"success": True, "name": name}

    return router