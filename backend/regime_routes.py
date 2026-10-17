# version: v3
"""
regime_routes.py — Consumer terminal HMM regime routes.

v3 — Disk fallback reads app_paths.cache_dir(), the same folder the sync
     client writes and Pulse Room builds from.

v2 — Lit up from stub. Serves the DC HMM-regime cache files produced by the
     Data Center and synced into %APPDATA%\\QuantumTerminal\\cache\\:

     /api/regime/macro           → GLOBAL_macro_regime.json
                                   (4-state macro HMM, daily, no ticker dim)
     /api/regime/transitions     → GLOBAL_regime_transitions.json
                                   (macro transition analytics — aux, optional)
     /api/regime/{ticker}        → GLOBAL_<lower>_regime.json
                                   (per-ticker slow D1 + fast M15; 404 for
                                    tickers where DC's hmm_regime flag is off)

     Pattern mirrors /api/historical_cones in data_server.py (v17): try the
     sync client's in-memory store first so periodic-sync populated stores
     are reused, then fall back to direct disk reads for both `{TICKER}_*`
     and `GLOBAL_<lower>_*` naming.

     Rule C1: display-only. No computation here — just reads cache JSON and
     returns it unmodified.
"""
import json as _json
from fastapi import APIRouter, HTTPException
from pathlib import Path as _Path


def create_regime_router(cfg_manager=None, app=None) -> APIRouter:
    router = APIRouter(tags=["regime"])

    def _read_disk(*candidates):
        """Return first existing JSON file from candidates, else None."""
        for p in candidates:
            if p and p.is_file():
                try:
                    return _json.loads(p.read_text(encoding="utf-8"))
                except Exception as e:
                    # Corrupt file — surface as 500 to the caller.
                    raise HTTPException(500, f"corrupt regime file: {p.name} ({e})")
        return None

    def _cache_dir() -> _Path:
        try:
            from app_paths import cache_dir
            return cache_dir()
        except Exception:
            return None

    def _try_memory_store(canonical: str, data_type: str):
        """Ask the sync client's in-memory store. Returns None if absent."""
        try:
            from data_sync_client import get_sync_client
            client = get_sync_client()
            return client._get_data(canonical, data_type)
        except Exception:
            return None

    @router.get("/api/regime/macro")
    async def get_macro_regime():
        """Macro HMM regime — 4-state daily (GOLDILOCKS / REFLATION / STAGFLATION / DEFLATION)."""
        cache = _cache_dir()
        data = _read_disk(
            cache / "GLOBAL_macro_regime.json" if cache else None,
            cache / "macro_regime.json"        if cache else None,
        )
        if data is None:
            raise HTTPException(404, "macro regime not available")
        return data

    @router.get("/api/regime/transitions")
    async def get_regime_transitions():
        """Macro regime transition analytics (7d/30d/90d probs, duration stats)."""
        cache = _cache_dir()
        data = _read_disk(
            cache / "GLOBAL_regime_transitions.json" if cache else None,
            cache / "regime_transitions.json"        if cache else None,
        )
        if data is None:
            raise HTTPException(404, "regime transitions not available")
        return data

    @router.get("/api/regime/{ticker}")
    async def get_ticker_regime(ticker: str):
        """Per-ticker HMM regime — slow D1 (palette-adaptive) + fast M15 hazard.

        404 is the normal response when the ticker's `hmm_regime` flag is off
        in the Data Center's universe config — the consumer should treat 404
        as "not enabled for this ticker" rather than an error.
        """
        canonical = ticker.upper()
        # (1) sync-client in-memory store (populated by sync_all / _load_all_from_cache)
        mem = _try_memory_store(canonical, "regime")
        if mem:
            return mem
        # (2) direct-disk fallback — handles both naming conventions.
        cache = _cache_dir()
        if cache is None:
            raise HTTPException(503, "cache directory unavailable")
        data = _read_disk(
            cache / f"{canonical}_regime.json",
            cache / f"GLOBAL_{canonical.lower()}_regime.json",
        )
        if data is None:
            raise HTTPException(404, f"no regime data for {canonical}")
        return data

    return router
