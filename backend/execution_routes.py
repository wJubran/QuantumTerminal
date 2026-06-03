# version: v3
"""
execution_routes.py — MT5 trade execution HTTP layer (v3).

v1 was a stub (PRO-only). v2 exposes the provider's execution methods as
HTTP endpoints so the consumer OrderTicket / ExposureStrip / quick-trade
buttons can act on the user's live MT5 account.
v3 adds the pending-order lifecycle: list / modify-price-or-SLTP / cancel.

Endpoints:
    GET    /api/positions                  — list open positions
    POST   /api/orders                     — place a market/limit/stop order
    POST   /api/positions/{ticket}/close   — close (full or partial) a position
    PATCH  /api/positions/{ticket}         — modify SL / TP on an open position
    GET    /api/orders/pending             — list resting pending orders           (v3)
    PATCH  /api/orders/{ticket}            — modify pending-order price / SL / TP  (v3)
    DELETE /api/orders/{ticket}            — cancel a pending order                (v3)

All endpoints are thin wrappers over `provider.place_order` / `get_positions`
/ `close_position` / `modify_position`. Results flow back as JSON.

Consumer-safety notes:
    - Every request goes through the cached MT5 provider — no fresh connect.
    - provider None or disconnected → returns a structured error, not 500.
    - Magic number defaults to 777 (Quantum Terminal tag) unless overridden.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models import OrderRequest

log = logging.getLogger("execution_routes")

MK_MAGIC = 777  # Quantum Terminal tag on broker side for attribution / filtering


class OrderBody(BaseModel):
    ticker: str
    direction: str                         # "BUY" | "SELL"
    order_type: str = "MARKET"             # "MARKET" | "LIMIT" | "STOP"
    lots: float
    price: Optional[float] = None          # required for LIMIT/STOP
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    comment: Optional[str] = "Quantum Terminal"
    # Signal attribution (optional — logged only)
    signal_id: Optional[str] = None
    signal_type: Optional[str] = None
    signal_confidence: Optional[float] = None


class ClosePositionBody(BaseModel):
    lots: Optional[float] = None  # None = full close


class ModifyPositionBody(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class ModifyOrderBody(BaseModel):
    """v3: Modify a pending order — any field left None is preserved server-side."""
    price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


def _pending_to_dict(o) -> dict:
    """Normalize a PendingOrder object to the JSON shape the frontend expects."""
    def g(obj, *names, default=None):
        for n in names:
            v = getattr(obj, n, None)
            if v is not None and v != 0:
                return v
        return default
    return {
        "ticket":      str(g(o, "ticket") or ""),
        "ticker":      g(o, "ticker", "symbol", default=""),
        "direction":   g(o, "direction", default=""),
        "order_type":  g(o, "order_type", default=""),
        "lots":        float(g(o, "lots", "volume", default=0) or 0),
        "price":       float(g(o, "price", "price_open", default=0) or 0),
        "stop_loss":   float(g(o, "stop_loss", "sl", default=0) or 0),
        "take_profit": float(g(o, "take_profit", "tp", default=0) or 0),
        "comment":     str(getattr(o, "comment", "") or ""),
        "time_setup":  str(g(o, "time_setup", "time_open") or ""),
    }


def _position_to_dict(p) -> dict:
    """Normalize a Position object to the JSON shape the frontend expects."""
    def g(obj, *names, default=None):
        for n in names:
            v = getattr(obj, n, None)
            if v is not None and v != 0:
                return v
        return default
    return {
        "ticket":       str(g(p, "ticket") or ""),
        "ticker":       g(p, "ticker", "symbol", default=""),
        "direction":    g(p, "direction", default=""),
        "lots":         float(g(p, "lots", "volume", default=0) or 0),
        "open_price":   float(g(p, "open_price", "price_open", default=0) or 0),
        "current_price":float(g(p, "current_price", "price_current", default=0) or 0),
        "stop_loss":    float(g(p, "stop_loss", "sl", default=0) or 0),
        "take_profit":  float(g(p, "take_profit", "tp", default=0) or 0),
        "profit":       float(getattr(p, "profit", 0) or 0),
        "swap":         float(getattr(p, "swap", 0) or 0),
        "commission":   float(getattr(p, "commission", 0) or 0),
        "open_time":    str(g(p, "open_time") or getattr(p, "time_open", "") or ""),
        "comment":      str(getattr(p, "comment", "") or ""),
    }


def create_execution_router(cfg_manager=None, app=None, broadcast_event=None) -> APIRouter:
    router = APIRouter(tags=["execution"])

    def _provider():
        if cfg_manager is None:
            return None
        try:
            # Prefer the configured active execution provider; fall back to the
            # historical "mt5_default" id so existing single-provider setups are
            # unaffected. (active_execution defaults to mt5_default, so this is
            # a no-op unless another provider — e.g. TickerAll — is made active.)
            return (
                cfg_manager.get_execution_provider()
                or cfg_manager.get_provider("mt5_default")
            )
        except Exception:
            return None

    # ── GET /api/positions ─────────────────────────────────────────────
    @router.get("/api/positions")
    async def get_positions():
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            return {"positions": [], "mt5_connected": False}
        try:
            positions = await asyncio.to_thread(prov.get_positions)
        except Exception as e:
            log.warning(f"get_positions failed: {e}")
            return {"positions": [], "mt5_connected": True, "error": str(e)}
        return {
            "positions": [_position_to_dict(p) for p in (positions or [])],
            "mt5_connected": True,
        }

    # ── POST /api/orders ───────────────────────────────────────────────
    @router.post("/api/orders")
    async def place_order(body: OrderBody):
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            raise HTTPException(503, {"error": "mt5_disconnected",
                                      "message": "MT5 is not connected. Connect in Settings → Providers."})

        # Build the provider's OrderRequest. FlexModel accepts extra fields.
        req = OrderRequest(
            ticker=body.ticker.upper(),
            direction=body.direction.upper(),
            order_type=body.order_type.upper(),
            lots=float(body.lots),
            volume=float(body.lots),   # dual-name for safety
            price=body.price or 0,
            stop_loss=body.stop_loss,
            take_profit=body.take_profit,
            sl=float(body.stop_loss) if body.stop_loss else 0,
            tp=float(body.take_profit) if body.take_profit else 0,
            comment=body.comment or "Quantum Terminal",
            magic=MK_MAGIC,
        )

        log.info(
            f"ORDER {req.direction} {req.lots} {req.ticker} @ "
            f"{body.price or 'market'} SL={body.stop_loss} TP={body.take_profit}"
            + (f" signal={body.signal_id}" if body.signal_id else "")
        )

        try:
            result = await asyncio.to_thread(prov.place_order, req)
        except Exception as e:
            log.error(f"place_order exception: {e}")
            raise HTTPException(500, {"error": "place_order_failed", "message": str(e)})

        # Normalize response — mt5_provider returns OrderResult (FlexModel).
        ok = bool(getattr(result, "success", False))
        payload = {
            "success":  ok,
            "order_id": str(getattr(result, "order_id", "") or ""),
            "price":    float(getattr(result, "price", 0) or 0),
            "ticker":   getattr(result, "ticker", req.ticker) or req.ticker,
            "direction": getattr(result, "direction", req.direction) or req.direction,
            "lots":     float(getattr(result, "lots", req.lots) or req.lots),
        }
        if not ok:
            payload["error"] = str(
                getattr(result, "error", None)
                or getattr(result, "message", None)
                or "Order rejected"
            )
        return payload

    # ── POST /api/positions/{ticket}/close ─────────────────────────────
    @router.post("/api/positions/{ticket}/close")
    async def close_position(ticket: str, body: Optional[ClosePositionBody] = None):
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            raise HTTPException(503, {"error": "mt5_disconnected"})

        lots = body.lots if body else None
        log.info(f"CLOSE position {ticket} lots={lots or 'full'}")
        try:
            result = await asyncio.to_thread(prov.close_position, ticket, lots)
        except Exception as e:
            log.error(f"close_position exception: {e}")
            raise HTTPException(500, {"error": "close_failed", "message": str(e)})

        ok = bool(getattr(result, "success", False))
        return {
            "success": ok,
            "ticket":  ticket,
            "price":   float(getattr(result, "price", 0) or 0),
            **({"error": str(getattr(result, "error", None) or "")} if not ok else {}),
        }

    # ── PATCH /api/positions/{ticket} ──────────────────────────────────
    @router.patch("/api/positions/{ticket}")
    async def modify_position(ticket: str, body: ModifyPositionBody):
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            raise HTTPException(503, {"error": "mt5_disconnected"})

        if not hasattr(prov, "modify_position"):
            raise HTTPException(501, {"error": "modify_unsupported"})

        log.info(f"MODIFY position {ticket} SL={body.stop_loss} TP={body.take_profit}")
        try:
            result = await asyncio.to_thread(
                prov.modify_position, ticket, body.stop_loss, body.take_profit
            )
        except Exception as e:
            log.error(f"modify_position exception: {e}")
            raise HTTPException(500, {"error": "modify_failed", "message": str(e)})

        # modify_position returns a dict per mt5_provider
        if isinstance(result, dict):
            return {"success": bool(result.get("success", False)), **result}
        return {"success": True}

    # ── GET /api/orders/pending ────────────────────────────────── v3 ──
    @router.get("/api/orders/pending")
    async def list_pending_orders():
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            return {"orders": [], "mt5_connected": False}
        try:
            orders = await asyncio.to_thread(prov.get_pending_orders)
        except Exception as e:
            log.warning(f"get_pending_orders failed: {e}")
            return {"orders": [], "mt5_connected": True, "error": str(e)}
        return {
            "orders": [_pending_to_dict(o) for o in (orders or [])],
            "mt5_connected": True,
        }

    # ── PATCH /api/orders/{ticket} ─────────────────────────────── v3 ──
    @router.patch("/api/orders/{ticket}")
    async def modify_pending_order(ticket: str, body: ModifyOrderBody):
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            raise HTTPException(503, {"error": "mt5_disconnected"})
        if not hasattr(prov, "modify_order"):
            raise HTTPException(501, {"error": "modify_order_unsupported"})
        log.info(f"MODIFY order {ticket} price={body.price} SL={body.stop_loss} TP={body.take_profit}")
        try:
            result = await asyncio.to_thread(
                prov.modify_order, ticket, body.price, body.stop_loss, body.take_profit
            )
        except Exception as e:
            log.error(f"modify_order exception: {e}")
            raise HTTPException(500, {"error": "modify_order_failed", "message": str(e)})
        ok = bool(getattr(result, "success", False))
        payload = {"success": ok, "ticket": ticket}
        if not ok:
            payload["error"] = str(getattr(result, "error", None) or "Modify rejected")
        return payload

    # ── DELETE /api/orders/{ticket} ────────────────────────────── v3 ──
    @router.delete("/api/orders/{ticket}")
    async def cancel_pending_order(ticket: str):
        import asyncio
        prov = _provider()
        if prov is None or not getattr(prov, "connected", False):
            raise HTTPException(503, {"error": "mt5_disconnected"})
        if not hasattr(prov, "cancel_order"):
            raise HTTPException(501, {"error": "cancel_order_unsupported"})
        log.info(f"CANCEL order {ticket}")
        try:
            result = await asyncio.to_thread(prov.cancel_order, ticket)
        except Exception as e:
            log.error(f"cancel_order exception: {e}")
            raise HTTPException(500, {"error": "cancel_order_failed", "message": str(e)})
        ok = bool(getattr(result, "success", False))
        payload = {"success": ok, "ticket": ticket}
        if not ok:
            payload["error"] = str(getattr(result, "error", None) or "Cancel rejected")
        return payload

    return router
