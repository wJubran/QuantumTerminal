"""
options_routes.py — Options Quant REST Endpoints
=================================================
Quantum Terminal | Phase 4F — Options Quant Engine

Wire into data_server.py:
    from options_routes import create_options_router
    app.include_router(create_options_router())

Endpoints:
    GET /api/options/symbols          — supported canonical assets + Yahoo mapping
    GET /api/options/{ticker}/snapshot — full metrics (GEX + levels + IV divergence)
    GET /api/options/{ticker}/chain   — raw calls/puts chain data
    GET /api/options/{ticker}/expiries — available expiry dates from Yahoo
"""

import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

log = logging.getLogger("qt.options_routes")

PROJECT_ROOT = Path(__file__).resolve().parent


def create_options_router() -> APIRouter:
    router = APIRouter(tags=["options"])

    from options_data_manager import get_options_dm, OPTIONS_SYMBOL_MAP
    from options_engine import compute_all, compute_all_multi

    @router.get("/api/options/symbols")
    async def get_options_symbols():
        """
        Return list of assets with options support and their Yahoo mappings.
        """
        return {
            "supported": [
                {"canonical": k, "cboe_ticker": v}
                for k, v in OPTIONS_SYMBOL_MAP.items()
            ]
        }

    @router.get("/api/options/{ticker}/snapshot")
    async def get_options_snapshot(
        ticker: str,
        expiry: Optional[str] = Query(None, description="ISO date e.g. 2025-03-21"),
    ):
        """
        Full options analytics snapshot for one asset.
        Includes GEX, flip level, max pain, walls, P/C ratio, IV divergence.
        Response is cached 15 minutes — stale data served outside market hours.
        """
        canonical = ticker.upper()
        if canonical not in OPTIONS_SYMBOL_MAP:
            raise HTTPException(
                404,
                f"{canonical} not supported. Supported: {list(OPTIONS_SYMBOL_MAP.keys())}"
            )

        odm = get_options_dm()
        snap = odm.get_snapshot(canonical, expiry=expiry)

        if snap is None:
            raise HTTPException(503, f"Could not fetch options data for {canonical}. "
                                     f"Check yfinance install and network.")

        try:
            metrics = compute_all(snap)
        except Exception as e:
            log.error(f"Options engine error for {canonical}: {e}")
            raise HTTPException(500, f"Options calculation failed: {e}")

        return metrics

    @router.get("/api/options/{ticker}/chain")
    async def get_options_chain(
        ticker: str,
        expiry: Optional[str] = Query(None),
    ):
        """
        Raw options chain (calls + puts) for one asset and expiry.
        Useful for frontend to render custom strike tables.
        """
        canonical = ticker.upper()
        if canonical not in OPTIONS_SYMBOL_MAP:
            raise HTTPException(404, f"{canonical} not supported")

        odm = get_options_dm()
        snap = odm.get_snapshot(canonical, expiry=expiry)

        if snap is None:
            raise HTTPException(503, f"Could not fetch chain for {canonical}")

        return {
            "canonical":   snap["canonical"],
            "cboe_ticker": snap.get("cboe_ticker"),
            "expiry":      snap.get("expiry"),
            "spot":        snap.get("spot"),
            "calls":       snap.get("calls", []),
            "puts":        snap.get("puts",  []),
            "cached_at":   snap.get("cached_at"),
            "is_stale":    snap.get("is_stale", False),
        }

    @router.get("/api/options/{ticker}/expiries")
    async def get_options_expiries(ticker: str):
        """Available expiry dates. Returns list of ISO date strings."""
        canonical = ticker.upper()
        if canonical not in OPTIONS_SYMBOL_MAP:
            raise HTTPException(404, f"{canonical} not supported")
        odm = get_options_dm()
        return {"canonical": canonical, "expiries": odm.get_available_expiries(canonical)}

    @router.get("/api/options/{ticker}/full")
    async def get_options_full(
        ticker: str,
        n: int = Query(8, description="Number of expiries for GEX stack (1-12)"),
    ):
        """
        Full multi-expiry options analytics.
        Includes GEX stack (GEX1–GEXn), 0DTE GEX, HVL, expected move.
        This is the primary endpoint for the enhanced OPTIONS QUANT UI.
        """
        canonical = ticker.upper()
        if canonical not in OPTIONS_SYMBOL_MAP:
            raise HTTPException(404, f"{canonical} not supported")

        odm = get_options_dm()
        n = max(1, min(n, 12))
        snap = odm.get_full_snapshot(canonical, n_expiries=n)
        if snap is None:
            raise HTTPException(503, f"Could not fetch options data for {canonical}")

        try:
            return compute_all_multi(snap)
        except Exception as e:
            log.error(f"Options multi-expiry calc error {canonical}: {e}")
            raise HTTPException(500, f"Calculation failed: {e}")

    return router