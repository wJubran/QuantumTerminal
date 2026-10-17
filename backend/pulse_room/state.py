# version: v3
# v3 — AppData root comes from app_paths.app_data_dir() (default name
#      "QuantumTerminal", like the rest of the backend, instead of
#      "QuantumTerminal-v2"). Existing watchlist/scanner files are copied
#      over from the old folder once by app_paths.
"""Pulse Room state persistence.

Owns the two AppData JSON files:
  - pulse_watchlist.json   : per-asset family selection
  - pulse_state.json       : scanner enabled flag

All writes go through atomic_write() so partial writes can never
corrupt the live file.
"""

import hashlib
import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

import app_paths


# Process-wide lock guarding pulse snapshot rebuilds. Both the user-initiated
# Calculate (routes.py) and the auto-rebuild after sync (sync_hook.py) acquire
# this so they cannot race. Defined here (rather than in routes.py) so both
# importers see the same lock instance.
calc_lock = threading.Lock()


def _appdata_root() -> Path:
    """Return the backend's app-data dir (app_paths.app_data_dir()) —
    %APPDATA%/<MK_APP_DIR_NAME or "QuantumTerminal"> on Windows — so Pulse
    Room state sits beside the cache the snapshot is built from.
    """
    return app_paths.app_data_dir()


def _pulse_dir() -> Path:
    p = _appdata_root()
    p.mkdir(parents=True, exist_ok=True)
    return p


def _atomic_write(path: Path, payload: Any) -> None:
    """Write JSON atomically: tempfile next to target, then rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=path.stem + ".",
        suffix=".tmp",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


# ---------- watchlist ----------

_WATCHLIST_DEFAULT = {"assets": []}


def load_watchlist() -> dict:
    path = _pulse_dir() / "pulse_watchlist.json"
    if not path.exists():
        return dict(_WATCHLIST_DEFAULT)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return dict(_WATCHLIST_DEFAULT)


def save_watchlist(wl: dict) -> None:
    _atomic_write(_pulse_dir() / "pulse_watchlist.json", wl)


def watchlist_hash(wl: dict) -> str:
    """Stable hash regardless of asset order or family-list order."""
    canonical = {
        "assets": sorted(
            (
                {"symbol": a["symbol"], "families": sorted(a.get("families", []))}
                for a in wl.get("assets", [])
            ),
            key=lambda a: a["symbol"],
        )
    }
    encoded = json.dumps(canonical, sort_keys=True).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


# ---------- scanner ----------

_SCANNER_DEFAULT = {"enabled": False}


def load_scanner() -> dict:
    path = _pulse_dir() / "pulse_state.json"
    if not path.exists():
        return dict(_SCANNER_DEFAULT)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return dict(_SCANNER_DEFAULT)


def save_scanner(s: dict) -> None:
    _atomic_write(_pulse_dir() / "pulse_state.json", s)
