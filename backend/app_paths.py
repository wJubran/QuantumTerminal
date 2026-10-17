"""
================================================================================
Quantum Terminal — per-user app-data and cache directories
================================================================================
Single source of truth for where the backend keeps per-user files. Every module
that reads or writes them (sync client, cone/regime/stress-lab routes, Pulse
Room, config, account state, logs, cache watcher) resolves its folder here, so
they can never disagree about which directory holds the analysis files.

    Windows:      %APPDATA%\\<name>\\     (APPDATA unset: ~\\AppData\\Roaming\\<name>\\)
    Linux/macOS:  ~/.<name>/
    cache:        <app-data dir>/cache/

<name> is MK_APP_DIR_NAME when set, else "QuantumTerminal". The Electron shell
passes MK_APP_DIR_NAME=QuantumTerminal-v2, so the desktop app keeps using the
%APPDATA%\\QuantumTerminal-v2\\ data it already has, apart from browser-mode
(`python launcher.py`) installs, which keep %APPDATA%\\QuantumTerminal\\.

Paths are resolved on every call, not at import, so the process environment
(or a test's monkeypatched one) always wins.

Legacy locations: earlier builds kept a few files elsewhere. Pulse Room
defaulted to "QuantumTerminal-v2" (under ~/.config off Windows), and off
Windows the account files, consumer_config.ini and user_config.json each had
their own folder. The first time a process resolves the app-data dir, any of
those files missing from it are copied in — never moved, never overwritten —
and a marker file stops the copy from running again.
================================================================================
"""

import logging
import os
import shutil
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("qt.app_paths")

DEFAULT_APP_DIR_NAME = "QuantumTerminal"

# Pulse Room's own default before it resolved through this module.
_OLD_PULSE_DIR_NAME = "QuantumTerminal-v2"
_PULSE_STATE_FILES = ("pulse_watchlist.json", "pulse_state.json")
_MIGRATION_MARKER = ".migrated_legacy_paths"

_migration_lock = threading.Lock()
_migrated_targets: set = set()


def _is_windows() -> bool:
    return sys.platform == "win32"


def app_dir_name() -> str:
    """MK_APP_DIR_NAME if set and not blank, else "QuantumTerminal"."""
    return os.environ.get("MK_APP_DIR_NAME", "").strip() or DEFAULT_APP_DIR_NAME


def app_data_dir_for(name: str) -> Path:
    """Where the app-data dir called `name` lives on this platform. Creates
    nothing — use app_data_dir() for this process's own directory."""
    if _is_windows():
        appdata = os.environ.get("APPDATA", "")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / name
    return Path.home() / f".{name}"


def app_data_dir() -> Path:
    """This process's per-user app-data dir, created if missing."""
    name = app_dir_name()
    target = app_data_dir_for(name)
    target.mkdir(parents=True, exist_ok=True)
    if target not in _migrated_targets:
        _copy_legacy_files(target, name)
    return target


def cache_dir() -> Path:
    """The cache dir every reader and writer shares: <app-data dir>/cache."""
    d = app_data_dir() / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Legacy locations ─────────────────────────────────────────────────────────

def _legacy_locations(name: str) -> list:
    """(directory, filenames) pairs where earlier builds kept files that now
    belong in app_data_dir_for(name)."""
    # Pulse Room honoured MK_APP_DIR_NAME but had its own default name.
    if os.environ.get("MK_APP_DIR_NAME", "").strip():
        pulse_name = name
    else:
        pulse_name = _OLD_PULSE_DIR_NAME
    if _is_windows():
        # Every other module already used %APPDATA%\<name>.
        return [(app_data_dir_for(pulse_name), _PULSE_STATE_FILES)]
    home = Path.home()
    return [
        # pulse_room: ~/.config/<name>
        (home / ".config" / pulse_name, _PULSE_STATE_FILES),
        # account_manager, plus launcher's consumer_config.ini fallback
        (home / f".{name.lower()}",
         ("account_settings.json", "account_state.json", "consumer_config.ini")),
        # config_manager used the Windows layout under $HOME
        (home / "AppData" / "Roaming" / name, ("user_config.json",)),
    ]


def _copy_legacy_files(target: Path, name: str) -> None:
    """Copy files missing from `target` in from their legacy locations. Never
    moves or overwrites anything; failures are logged and retried next run."""
    with _migration_lock:
        if target in _migrated_targets:
            return
        _migrated_targets.add(target)

        marker = target / _MIGRATION_MARKER
        if marker.exists():
            return
        sources = [(d, files) for d, files in _legacy_locations(name)
                   if d != target and d.is_dir()]
        if not sources:
            return

        copied, failed = [], False
        for src_dir, files in sources:
            for fname in files:
                src, dst = src_dir / fname, target / fname
                try:
                    if src.is_file() and not dst.exists():
                        shutil.copy2(src, dst)
                        copied.append(f"{src} -> {dst}")
                        log.info(f"Copied legacy {src} -> {dst}")
                except OSError as e:
                    failed = True
                    log.warning(f"Could not copy legacy {src} -> {dst}: {e}")
        if failed:
            return  # no marker, so the next start retries what's still missing

        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            marker.write_text("\n".join([f"migrated {stamp}", *copied]) + "\n",
                              encoding="utf-8")
        except OSError as e:
            log.warning(f"Could not write {marker}: {e}")
