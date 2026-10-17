# version: v1
"""Chart-preset REST endpoints.

Wire into data_server.py:
    from chart_presets_routes import create_chart_presets_router
    app.include_router(create_chart_presets_router())

Endpoints:
    GET    /api/chart-presets         — returns dict of all named presets
    PUT    /api/chart-presets/{name}  — body is the style dict; creates or replaces
    DELETE /api/chart-presets/{name}  — removes the named preset (idempotent)
"""

import logging
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config_manager


log = logging.getLogger("qt.chart_presets_routes")

# Pydantic body model — accepts the full chart-style shape but is permissive
# on field presence so future shape changes don't break the API.
class ChartStyleIn(BaseModel):
    chartType: str | None = None
    background: str | None = None
    bullishColor: str | None = None
    bearishColor: str | None = None
    gridLines: bool | None = None
    marketCloseSeparator: dict | None = None
    rthSeparator: dict | None = None

    class Config:
        extra = "allow"   # forward-compat: ignore unknown keys gracefully


_RESERVED_NAMES = {"defaults", "default"}
_MAX_NAME_LEN = 60


def _validate_name(name: str) -> None:
    if not name or not name.strip():
        raise HTTPException(400, detail="Preset name cannot be empty")
    if len(name) > _MAX_NAME_LEN:
        raise HTTPException(400, detail=f"Preset name exceeds {_MAX_NAME_LEN} characters")
    if name.strip().lower() in _RESERVED_NAMES:
        raise HTTPException(400, detail=f"'{name}' is a reserved name")


def create_chart_presets_router() -> APIRouter:
    router = APIRouter(prefix="/api/chart-presets", tags=["chart-presets"])

    @router.get("")
    async def list_presets() -> dict[str, Any]:
        return config_manager.get_chart_presets()

    @router.put("/{name}")
    async def upsert_preset(name: str, body: ChartStyleIn) -> dict[str, Any]:
        decoded = unquote(name)
        _validate_name(decoded)
        try:
            config_manager.save_chart_preset(decoded, body.model_dump(exclude_none=False))
        except Exception as e:
            log.exception("save_chart_preset failed")
            raise HTTPException(500, detail=f"Save failed: {e}") from e
        return config_manager.get_chart_presets()

    @router.delete("/{name}")
    async def delete_preset(name: str) -> dict[str, Any]:
        decoded = unquote(name)
        try:
            config_manager.delete_chart_preset(decoded)
        except Exception as e:
            log.exception("delete_chart_preset failed")
            raise HTTPException(500, detail=f"Delete failed: {e}") from e
        return config_manager.get_chart_presets()

    return router
