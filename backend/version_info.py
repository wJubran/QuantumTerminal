# version: v3 (Quantum Terminal)
"""
version_info.py — Quantum Terminal version endpoint.

Exposes:
    GET /api/version[?refresh=true]
        → {
            current:          "1.2.1",
            latest:           "1.2.0",
            update_available: true,
            download_url:     "https://github.com/wJubran/QuantumTerminal/releases/tag/v1.2.0",
            released_at:      "2026-11-02",
            banner_message:   "",
            checked_at:       "2026-11-03T08:00:00+00:00",
          }

Behavior:
    - current reads VERSION from bundled data (PyInstaller) or repo root (dev).
    - latest is the newest published GitHub release of the project, cached
      for 10 minutes (refresh=true bypasses the cache). Offline, rate-limited,
      or no release yet → latest = current and update_available = false.
    - MK_UPDATE_CHECK=0 disables the GitHub request entirely.
"""

from __future__ import annotations

import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter

log = logging.getLogger("qt.version")

GITHUB_REPO = "wJubran/QuantumTerminal"
DOWNLOAD_BASE = f"https://github.com/{GITHUB_REPO}/releases"
LATEST_RELEASE_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
CACHE_TTL_SEC = 600  # 10 min

_release_cache = {"at": 0.0, "release": None}


def _read_bundled_version() -> str:
    """Load VERSION from PyInstaller bundle or dev repo root. Falls back to '1.0.0'."""
    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(getattr(sys, "_MEIPASS", ".")) / "VERSION")
    candidates.append(Path(__file__).resolve().parents[1] / "VERSION")  # repo root
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


def parse_version(v: str) -> tuple:
    """'v1.2.0' / '1.2' / '1.2.0-beta' → (1, 2, 0) for ordering."""
    nums = [int(n) for n in re.findall(r"\d+", (v or "").split("-")[0])[:3]]
    return tuple(nums + [0] * (3 - len(nums)))


def update_check_enabled() -> bool:
    return os.environ.get("MK_UPDATE_CHECK", "1").strip().lower() not in ("0", "false", "no", "off")


async def fetch_latest_release() -> Optional[dict]:
    """Newest published (non-draft, non-prerelease) GitHub release, or None."""
    import httpx
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "QuantumTerminal"}
    async with httpx.AsyncClient(timeout=4.0, headers=headers) as client:
        r = await client.get(LATEST_RELEASE_API)
    if r.status_code != 200:   # 404 = no release published yet
        return None
    d = r.json()
    if d.get("draft") or d.get("prerelease"):
        return None
    return {
        "version": str(d.get("tag_name") or "").lstrip("vV"),
        "url": d.get("html_url") or DOWNLOAD_BASE,
        "published_at": str(d.get("published_at") or "")[:10],
    }


async def latest_release(force: bool = False) -> Optional[dict]:
    if not update_check_enabled():
        return None
    now = time.monotonic()
    if not force and _release_cache["at"] and now - _release_cache["at"] < CACHE_TTL_SEC:
        return _release_cache["release"]
    try:
        release = await fetch_latest_release()
    except Exception as e:   # offline, DNS, timeout, unexpected payload
        log.info(f"Update check skipped: {e}")
        release = None
    _release_cache.update(at=now, release=release)
    return release


def create_version_router() -> APIRouter:
    router = APIRouter(tags=["version"])

    @router.get("/api/version")
    async def api_version(refresh: bool = False):
        release = await latest_release(force=refresh)
        latest = CURRENT_VERSION
        update_available = False
        if release and release.get("version"):
            latest = release["version"]
            update_available = parse_version(latest) > parse_version(CURRENT_VERSION)
        return {
            "current": CURRENT_VERSION,
            "latest": latest,
            "update_available": update_available,
            "download_url": (release or {}).get("url") or DOWNLOAD_BASE,
            "released_at": (release or {}).get("published_at", ""),
            "banner_message": "",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    return router
