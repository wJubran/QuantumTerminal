# version: v1
"""Chart-template REST endpoints.

A "chart template" is a named full-chart-config snapshot the operator can
save and re-apply to any chart ("XAUUSD swing", "XAUUSD scalp", ...).
Distinct from /api/chart-presets, which holds chart-STYLE-only fragments.

Wire into data_server.py:
    from chart_templates_routes import create_chart_templates_router
    app.include_router(create_chart_templates_router())

Endpoints:
    GET    /api/chart-templates         — returns dict of all named templates {name: {sourceTicker, config, savedAt}}
    PUT    /api/chart-templates/{name}  — body is {sourceTicker, config, savedAt}; creates or replaces
    DELETE /api/chart-templates/{name}  — removes the named template (idempotent)
"""

import logging
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config_manager


log = logging.getLogger("qt.chart_templates_routes")


# Permissive body model: a template carries a sourceTicker, a config dict
# (the full chart-config bundle), and a savedAt timestamp. `extra = "allow"`
# keeps the API forward-compatible if the shape grows.
class ChartTemplateIn(BaseModel):
    sourceTicker: str | None = None
    config: dict | None = None
    savedAt: str | None = None

    class Config:
        extra = "allow"


_RESERVED_NAMES = {"defaults", "default"}
_MAX_NAME_LEN = 60


def _validate_name(name: str) -> None:
    if not name or not name.strip():
        raise HTTPException(400, detail="Template name cannot be empty")
    if len(name) > _MAX_NAME_LEN:
        raise HTTPException(400, detail=f"Template name exceeds {_MAX_NAME_LEN} characters")
    if name.strip().lower() in _RESERVED_NAMES:
        raise HTTPException(400, detail=f"'{name}' is a reserved name")


def create_chart_templates_router() -> APIRouter:
    router = APIRouter(prefix="/api/chart-templates", tags=["chart-templates"])

    @router.get("")
    async def list_templates() -> dict[str, Any]:
        return config_manager.get_chart_templates()

    @router.put("/{name}")
    async def upsert_template(name: str, body: ChartTemplateIn) -> dict[str, Any]:
        decoded = unquote(name)
        _validate_name(decoded)
        try:
            config_manager.save_chart_template(decoded, body.model_dump(exclude_none=False))
        except Exception as e:
            log.exception("save_chart_template failed")
            raise HTTPException(500, detail=f"Save failed: {e}") from e
        return config_manager.get_chart_templates()

    @router.delete("/{name}")
    async def delete_template(name: str) -> dict[str, Any]:
        decoded = unquote(name)
        try:
            config_manager.delete_chart_template(decoded)
        except Exception as e:
            log.exception("delete_chart_template failed")
            raise HTTPException(500, detail=f"Delete failed: {e}") from e
        return config_manager.get_chart_templates()

    return router
