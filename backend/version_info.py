# version: v2 (Quantum Terminal)
"""
version_info.py — Quantum Terminal version endpoint.

Exposes:
    GET /api/version
        → {
            current:          "1.0.0",
            latest:           "1.0.0",
            update_available: false,
            download_url:     "https://github.com/wJubran/QuantumTerminal/releases",
            released_at:      "",
            banner_message:   "",
            telegram_url:     "",
            checked_at:       "2026-05-21T00:00:00Z",
          }

Behavior:
    - current reads VERSION from bundled data (PyInstaller) or repo root (dev).
    - No remote update checking in open-source version.
"""

from __future__ import annotations

import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter

log = logging.getLogger("qt.version")

DOWNLOAD_BASE = "https://github.com/wJubran/QuantumTerminal/releases"
CACHE_TTL_SEC = 600  # 10 min


def _read_bundled_version() -> str:
    """Load VERSION from PyInstaller bundle or dev repo root. Falls back to '1.0.0'."""
    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(getattr(sys, "_MEIPASS", ".")) / "VERSION")
    candidates.append(Path(__file__).resolve().parents[2] / "VERSION")  # repo root
    candidates.append(Path(__file__).resolve().parents[1] / "VERSION")
    candidates.append(Path.cwd() / "VERSION")

    for p in candidates:
        try:
            if p.is_file():
                v = p.read_text(encoding="utf-8").strip()
                if v:
                    return v
        except Exception:
            continue
    log.warning("VERSION file not found — using 1.0.0")
    return "1.0.0"


CURRENT_VERSION = _read_bundled_version()
log.info(f"Quantum Terminal version: {CURRENT_VERSION}")


def create_version_router() -> APIRouter:
    router = APIRouter(tags=["version"])

    @router.get("/api/version")
    async def api_version(refresh: bool = False):
        return {
            "current": CURRENT_VERSION,
            "latest": CURRENT_VERSION,
            "update_available": False,
            "download_url": DOWNLOAD_BASE,
            "released_at": "",
            "banner_message": "",
            "telegram_url": "",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    return router
