"""
================================================================================
Quantum Terminal — data sources API (Settings → DATA SOURCES)
================================================================================
Lists the configured data sources and execution accounts, edits their
settings, tests a connection, and switches the active ones while the terminal
runs.

    GET   /api/providers                  accounts, their status, the types and their fields
    PATCH /api/providers/{id}             change an account's settings
    POST  /api/providers/{id}/test        connect a throw-away instance, fetch one quote
    POST  /api/providers/activate         {"data": id, "execution": id} → switch, reconnect
    POST  /api/providers/{id}/reset       start a paper account over

Secrets (API tokens, passwords) are never sent back: they read as
"••••••", and a PATCH that sends that mask leaves the stored secret alone.
================================================================================
"""

from __future__ import annotations

import asyncio
import copy
import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from config_manager import SECRET_KEYS, SECRET_MASK as MASK

log = logging.getLogger("qt.provider_routes")

TEST_TICKERS = {"binance": "BTCUSD", "alpaca": "SPY", "oanda": "EURUSD", "yahoo": "EURUSD",
                "sim": "EURUSD", "mt5": "EURUSD"}


def mask_secrets(account: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(account)
    for k in SECRET_KEYS:
        if out.get(k):
            out[k] = MASK
    return out


def drop_masked(patch: Dict[str, Any]) -> Dict[str, Any]:
    """A PATCH body without the secret fields the browser echoed back masked."""
    return {k: v for k, v in patch.items() if not (k in SECRET_KEYS and v == MASK)}


def create_provider_router(cfg_manager, app, broadcast_event=None) -> APIRouter:
    router = APIRouter(prefix="/api/providers", tags=["providers"])

    def _accounts() -> Dict[str, Dict[str, Any]]:
        return cfg_manager._providers_config().get("accounts", {}) or {}

    def _listing() -> Dict[str, Any]:
        from providers import DATA_ONLY_TYPES, PROVIDER_INFO, list_provider_types
        pcfg = cfg_manager._providers_config()
        instances = cfg_manager.get_all_providers()
        rows = []
        for pid, acc in (pcfg.get("accounts") or {}).items():
            ptype = (acc or {}).get("type", "")
            inst = instances.get(pid)
            rows.append({
                "id": pid, "type": ptype, "label": acc.get("label") or PROVIDER_INFO.get(ptype, {}).get("label", ptype),
                "enabled": bool(acc.get("enabled", True)), "available": ptype in list_provider_types(),
                "connected": bool(getattr(inst, "connected", False)),
                "can_execute": bool(getattr(inst, "can_execute", False)) if inst else
                PROVIDER_INFO.get(ptype, {}).get("execution", False),
                "data_only": ptype in DATA_ONLY_TYPES,
                "last_error": getattr(inst, "last_error", "") if inst else "",
                "settings": mask_secrets({k: v for k, v in acc.items() if k not in ("id", "type", "aliases")}),
            })
        return {
            "active_data": pcfg.get("active_data"),
            "active_execution": pcfg.get("active_execution"),
            "forced_by_launcher": os.environ.get("MK_PROVIDER", "") or None,
            "accounts": rows,
            "types": {t: PROVIDER_INFO.get(t, {"label": t}) for t in list_provider_types()},
        }

    @router.get("")
    async def list_providers():
        return _listing()

    @router.patch("/{provider_id}")
    async def update_provider(provider_id: str, request: Request):
        if provider_id not in _accounts():
            raise HTTPException(404, f"No data source {provider_id!r}")
        try:
            patch = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")
        if not isinstance(patch, dict):
            raise HTTPException(400, "Expected an object")
        patch = drop_masked({k: v for k, v in patch.items() if k not in ("id", "type")})
        cfg_manager.update({"providers": {"accounts": {provider_id: patch}}})
        return _listing()

    @router.post("/{provider_id}/test")
    async def test_provider(provider_id: str, request: Request):
        """Connect a separate instance with the saved settings (plus any
        unsaved ones in the body) and fetch one quote."""
        acc = copy.deepcopy(_accounts().get(provider_id))
        if acc is None:
            raise HTTPException(404, f"No data source {provider_id!r}")
        try:
            body = await request.json()
        except Exception:
            body = {}
        if isinstance(body, dict):
            acc.update(drop_masked(body))
        from providers import create_provider
        try:
            prov = create_provider(acc)
        except KeyError as e:
            return {"ok": False, "message": str(e)}
        if acc.get("type") == "paper":
            prov.bind_providers(cfg_manager.get_provider)
        try:
            ok = await asyncio.wait_for(asyncio.to_thread(prov.connect), timeout=20.0)
        except asyncio.TimeoutError:
            return {"ok": False, "message": "No answer within 20 s"}
        if not ok:
            return {"ok": False, "message": getattr(prov, "last_error", "") or "Connection failed"}
        sample = None
        ticker = (body or {}).get("ticker") or TEST_TICKERS.get(acc.get("type", ""), "EURUSD")
        try:
            ticks = await asyncio.wait_for(asyncio.to_thread(prov.get_latest_ticks, [ticker]), timeout=20.0)
            t = ticks.get(ticker)
            if t is not None:
                sample = {"ticker": ticker, "bid": t.bid, "ask": t.ask, "time": t.time}
        except Exception as e:
            log.info(f"test {provider_id}: quote failed: {e}")
        finally:
            try:
                await asyncio.to_thread(prov.disconnect)
            except Exception:
                pass
        msg = (f"Connected — {ticker} {sample['bid']}" if sample
               else f"Connected, but no quote for {ticker} on this source")
        return {"ok": True, "message": msg, "sample": sample}

    @router.post("/{provider_id}/reset")
    async def reset_account(provider_id: str):
        """Start a paper account (the simulator's, or the one on live
        prices) over at its starting balance."""
        acc = _accounts().get(provider_id)
        if acc is None:
            raise HTTPException(404, f"No account {provider_id!r}")
        inst = cfg_manager.get_all_providers().get(provider_id)
        if inst is None:                          # not running: reset its saved file
            from providers import create_provider
            try:
                inst = create_provider({**copy.deepcopy(acc), "id": provider_id})
            except KeyError as e:
                raise HTTPException(400, str(e))
        if not hasattr(inst, "reset_account"):
            raise HTTPException(400, f"{provider_id} is not a paper account")
        await asyncio.to_thread(inst.reset_account)
        balance = float(acc.get("initial_balance", 100_000))
        return {"ok": True, "message": f"Paper account reset to {balance:,.0f} USD"}

    @router.post("/activate")
    async def activate(request: Request):
        """Make `data` the price source and `execution` the account orders go
        to (default: the data source if it can trade, else the paper account)."""
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")
        accounts = _accounts()
        from providers import DATA_ONLY_TYPES, PROVIDER_INFO
        data_id = body.get("data") or cfg_manager._providers_config().get("active_data")
        if data_id not in accounts:
            raise HTTPException(404, f"No data source {data_id!r}")
        if not PROVIDER_INFO.get(accounts[data_id].get("type"), {}).get("data", True):
            raise HTTPException(400, f"{data_id} does not deliver prices")
        exec_id = body.get("execution")
        if not exec_id:
            exec_id = "paper_default" if accounts[data_id].get("type") in DATA_ONLY_TYPES else data_id
        if exec_id not in accounts:
            raise HTTPException(404, f"No execution account {exec_id!r}")

        # A launcher override (--sim / --provider) would otherwise win again.
        os.environ.pop("MK_PROVIDER", None)
        cfg_manager.update({"providers": {
            "active_data": data_id, "active_execution": exec_id,
            "accounts": {data_id: {"enabled": True}, exec_id: {"enabled": True}},
        }})

        await asyncio.to_thread(cfg_manager.shutdown_providers)
        await asyncio.to_thread(cfg_manager.init_providers)
        provider = cfg_manager.get_provider()
        connected = False
        message = ""
        if provider is not None:
            try:
                connected = await asyncio.wait_for(asyncio.to_thread(provider.connect), timeout=20.0)
            except asyncio.TimeoutError:
                message = "the data source did not answer within 20 s"
            if connected:
                universe = cfg_manager.get_active_universe()
                await asyncio.to_thread(provider.resolve_universe, universe)
            else:
                message = message or getattr(provider, "last_error", "") or "connection failed"
        execution = cfg_manager.get_execution_provider()
        if execution is not None and execution is not provider and not execution.connected:
            try:
                await asyncio.wait_for(asyncio.to_thread(execution.connect), timeout=20.0)
            except Exception as e:
                log.warning(f"execution account {exec_id} failed to connect: {e}")
        app.state.provider = provider
        log.info(f"Data source → {data_id} ({'connected' if connected else 'NOT connected'}), "
                 f"execution → {exec_id}")
        try:                            # rebuild the cones and bands from the new source now
            from local_analysis.runner import request_pass
            request_pass()
        except Exception:
            pass
        if broadcast_event is not None:
            try:
                await broadcast_event({"type": "provider_changed", "data": data_id, "execution": exec_id,
                                       "connected": connected})
                await broadcast_event({"type": "data_sync_complete", "source": "provider_changed",
                                       "synced": 0, "tickers": []})
            except Exception:
                pass
        out = _listing()
        out.update(connected=connected, message=message)
        return out

    return router
