"""
================================================================================
Quantum Terminal — Subprocess launcher for long-running helper engines
================================================================================
account_routes starts verbose engines (walk-forward, flow calibrator) as child
processes. Piping their output deadlocks once the OS pipe buffer fills
(~64 KB on Windows), so debug_popen() redirects stdout + stderr to a per-label
log file instead and returns the Popen handle:

    <logs dir>/subprocess_logs/<label>.log

The logs dir is the same one logging_setup uses (%APPDATA%\\<APP_DIR>\\logs\\
on Windows, ~/.<APP_DIR>/logs/ elsewhere — see app_paths).
================================================================================
"""

import logging
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional, Sequence

log = logging.getLogger("debug_subprocess")


def subprocess_logs_dir() -> Path:
    """Directory holding one log file per launched helper process."""
    try:
        from logging_setup import _appdata_logs_dir
        base = _appdata_logs_dir()
    except Exception:
        base = Path(__file__).resolve().parent / "logs"
    d = base / "subprocess_logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def debug_popen(cmd: Sequence[str], label: Optional[str] = None, **kwargs) -> subprocess.Popen:
    """Start `cmd` with stdout+stderr captured to subprocess_logs/<label>.log.

    A bare "python"/"python3" as the executable is replaced by the interpreter
    running the server, so helper scripts see the same venv and packages.
    (Not in a PyInstaller build: there sys.executable is the app itself.)
    Extra keyword arguments are passed through to subprocess.Popen.
    """
    cmd = [str(c) for c in cmd]
    if cmd and cmd[0] in ("python", "python3") and not getattr(sys, "frozen", False):
        cmd[0] = sys.executable

    stem = label or (Path(cmd[0]).stem if cmd else "subprocess")
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem).strip("._") or "subprocess"
    log_path = subprocess_logs_dir() / f"{safe}.log"

    with open(log_path, "w", encoding="utf-8", errors="replace") as fh:
        popen_kwargs = {"stdout": fh, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
        popen_kwargs.update(kwargs)
        # The child inherits its own copy of the handle; ours closes on exit.
        proc = subprocess.Popen(cmd, **popen_kwargs)

    log.info(f"Started {cmd[0]} (pid={proc.pid}) — output → {log_path}")
    return proc
