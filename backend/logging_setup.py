"""
================================================================================
Quantum Terminal Consumer v2 — Logging setup
================================================================================
Centralized logging configuration. Adds a daily-rotating file handler so logs
survive across runs and can be attached to support tickets, while keeping the
console output identical to v1.

Log location: <app-data dir>\\logs\\backend.log — app_paths.app_data_dir(),
              i.e. %APPDATA%\\<APP_DIR>\\ on Windows, ~/.<APP_DIR>/ elsewhere
Rotation:     daily at midnight, 14 days retained.
Format:       same as console — `YYYY-MM-DD HH:MM:SS [logger.name] LEVEL: msg`

Call setup_logging() ONCE at process startup — launcher.py does this.
================================================================================
"""
from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path

import app_paths

_LOG_FORMAT = "%(asctime)s [%(name)s] %(levelname)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
_RETENTION_DAYS = 14
_FILE_MAX_BYTES = 50 * 1024 * 1024  # 50 MB hard cap per file as a backstop


def _appdata_logs_dir() -> Path:
    """Resolve <app-data dir>/logs/ (see app_paths)."""
    return app_paths.app_data_dir() / "logs"


def setup_logging(level: int = logging.INFO) -> Path:
    """Configure root logging once. Returns the log file path so callers can
    print it on startup (`launcher.py` does)."""
    log_dir = _appdata_logs_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "backend.log"

    root = logging.getLogger()
    root.setLevel(level)

    # If already configured (e.g., re-import in tests), don't double-attach.
    if any(getattr(h, "_mk_managed", False) for h in root.handlers):
        return log_file

    fmt = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    # Console handler — stderr keeps the existing capture path used by Electron.
    ch = logging.StreamHandler(stream=sys.stderr)
    ch.setLevel(level)
    ch.setFormatter(fmt)
    ch._mk_managed = True
    root.addHandler(ch)

    # Daily rotating file handler. Use TimedRotatingFileHandler (rolls at
    # midnight) with 14 backups. Hard size cap as a backstop in case of
    # log floods.
    try:
        fh = logging.handlers.TimedRotatingFileHandler(
            filename=str(log_file),
            when="midnight",
            interval=1,
            backupCount=_RETENTION_DAYS,
            encoding="utf-8",
            delay=True,  # don't open until first emit (avoids a stale empty file)
        )
        fh.setLevel(level)
        fh.setFormatter(fmt)
        fh._mk_managed = True
        root.addHandler(fh)
    except Exception as e:
        # File logging is a nice-to-have — don't kill startup if disk is read-only.
        print(f"[logging] file handler unavailable: {e}", file=sys.stderr)

    # uvicorn / fastapi loggers tend to set up their own handlers; let them
    # bubble up to root by stripping their handlers and unsetting `propagate=False`.
    for noisy in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        lg = logging.getLogger(noisy)
        lg.handlers.clear()
        lg.propagate = True

    return log_file
