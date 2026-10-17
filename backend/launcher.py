"""
================================================================================
Quantum Terminal Consumer — Launcher
================================================================================
Single entry point for the packaged .exe.
Starts data server + serves React frontend + opens browser.
Auto-creates consumer_config.ini on first run.

Usage:
    python launcher.py              # Dev mode
    QuantumTerminal.exe                    # Packaged mode

This module does NOT introduce any calculation triggers.
================================================================================
"""

import sys
import os
import threading
import time
import webbrowser
import shutil
import logging
from pathlib import Path

log = logging.getLogger("mk.launcher")


def _resolve_frontend_dir(candidates) -> Path:
    """Pick the React build to serve. MK_FRONTEND_DIR always wins; otherwise
    the first candidate that contains an index.html (falls back to the first)."""
    override = os.environ.get("MK_FRONTEND_DIR")
    if override:
        return Path(override).expanduser().resolve()
    for c in candidates:
        if (c / "index.html").exists():
            return c
    return candidates[0]


# — Determine base paths (works for both dev and PyInstaller) —
if getattr(sys, 'frozen', False):
    # Running as packaged .exe — everything is flat in _MEIPASS
    BASE_DIR = Path(sys._MEIPASS)
    EXE_DIR = Path(sys.executable).parent
    BACKEND_DIR = BASE_DIR          # PyInstaller bundles flat, no backend/ subfolder
    FRONTEND_DIR = _resolve_frontend_dir([BASE_DIR / "frontend"])
else:
    # Running as script (dev mode). Prefer a locally rebuilt UI
    # (terminal_app/build) and fall back to the compiled build shipped
    # in this repository (frontend_build/).
    BASE_DIR = Path(__file__).resolve().parent
    EXE_DIR = BASE_DIR
    BACKEND_DIR = BASE_DIR
    FRONTEND_DIR = _resolve_frontend_dir([
        BASE_DIR.parent / "terminal_app" / "build",
        BASE_DIR.parent / "frontend_build",
    ])

PORT = int(os.environ.get("MK_PORT", "8502"))   # v2: Electron passes MK_PORT

# v2: AppData dir name (env-var driven; default "QuantumTerminal" preserves v1 path).
APP_DIR = os.environ.get("MK_APP_DIR_NAME", "QuantumTerminal")

# — Default config content (f-string so APP_DIR is substituted at module load) —
DEFAULT_CONFIG = f"""\
[server]
# No external server needed for Quantum Terminal (open source)
base_url = 

[data]
cache_dir = %APPDATA%\\{APP_DIR}\\cache
stale_warning_hours = 48
stale_error_hours = 72
"""


def ensure_config():
    """Create consumer_config.ini on first run. User never touches this."""
    # Check next to .exe first (packaged mode)
    config_path = EXE_DIR / "consumer_config.ini"

    if config_path.exists():
        return config_path

    # Also check AppData (fallback location)
    appdata_config = _get_appdata_base() / "consumer_config.ini"
    if appdata_config.exists():
        return appdata_config

    # Try to write next to .exe
    try:
        template = BASE_DIR / "consumer_config.ini.template"
        if template.exists():
            shutil.copy2(template, config_path)
        else:
            config_path.write_text(DEFAULT_CONFIG, encoding="utf-8")
        print(f"  Config created: {config_path}")
        return config_path
    except PermissionError:
        # Program Files is write-protected — use AppData instead
        appdata_dir = _get_appdata_base()
        appdata_dir.mkdir(parents=True, exist_ok=True)
        appdata_config = appdata_dir / "consumer_config.ini"
        try:
            template = BASE_DIR / "consumer_config.ini.template"
            if template.exists():
                shutil.copy2(template, appdata_config)
            else:
                appdata_config.write_text(DEFAULT_CONFIG, encoding="utf-8")
            print(f"  Config created (AppData): {appdata_config}")
            return appdata_config
        except Exception as e:
            print(f"  [WARN] Could not create config: {e}")
            return appdata_config


def _get_appdata_base() -> Path:
    """Get AppData\\Roaming\\<APP_DIR> path. APP_DIR comes from MK_APP_DIR_NAME env var."""
    import platform
    if platform.system() == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            return Path(appdata) / APP_DIR
    return Path.home() / f".{APP_DIR.lower()}"


def ensure_appdata():
    """Create AppData directories for auth cache and data cache."""
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        base = Path(appdata) / APP_DIR
    else:
        base = Path.home() / "AppData" / "Roaming" / APP_DIR

    for subdir in ["", "cache"]:
        d = base / subdir if subdir else base
        d.mkdir(parents=True, exist_ok=True)

    return base


def open_browser():
    """Wait for server to start, then open browser."""
    for _ in range(30):  # Wait up to 30 seconds
        time.sleep(1)
        try:
            import urllib.request
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=2)
            break
        except Exception:
            continue

    webbrowser.open(f"http://127.0.0.1:{PORT}")


def mount_frontend(app, frontend_dir: Path) -> bool:
    """Serve the React build from `frontend_dir` on `app`. False if absent.

    IMPORTANT: Use StaticFiles mount (not catch-all routes) so API routes
    always take priority. The catch-all @app.get("/{path}") pattern causes
    405 errors on PATCH/POST to /api/* endpoints.
    """
    if not (frontend_dir.exists() and (frontend_dir / "index.html").exists()):
        return False

    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from starlette.middleware.base import BaseHTTPMiddleware

    root = frontend_dir.resolve()

    # Helper: serve index.html with no-cache headers so browser
    # always fetches the latest after an update. JS/CSS files have
    # content hashes in their filenames so they cache safely.
    def _serve_index():
        return FileResponse(
            str(root / "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    # Serve /static/* assets (JS, CSS, images)
    app.mount("/static", StaticFiles(directory=str(root / "static")), name="static")

    # SPA middleware: for non-API, non-static GET requests that don't match
    # a file, serve index.html. This replaces the old @app.get("/{full_path:path}")
    # catch-all which caused 405 errors on API PATCH/POST requests.
    class SPAMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            response = await call_next(request)

            # If the API returned 404 and this is a GET request
            # that doesn't target /api/ or /ws/, serve index.html
            # (React client-side routing)
            if (
                response.status_code == 404
                and request.method == "GET"
                and not request.url.path.startswith("/api/")
                and not request.url.path.startswith("/ws/")
                and not request.url.path.startswith("/static/")
            ):
                # A real file in the build directory (sounds, manifest...).
                # Resolved and confined to the build dir: "/../.." paths
                # must not read arbitrary files off the disk.
                file_path = (root / request.url.path.lstrip("/")).resolve()
                if file_path.is_relative_to(root) and file_path.is_file():
                    return FileResponse(str(file_path))
                # Otherwise serve index.html for React Router
                return _serve_index()

            return response

    app.add_middleware(SPAMiddleware)

    # Root route — serve index.html
    @app.get("/", include_in_schema=False)
    async def serve_root():
        return _serve_index()

    # Favicon
    favicon_path = root / "favicon.ico"
    if favicon_path.exists():
        @app.get("/favicon.ico", include_in_schema=False)
        async def serve_favicon():
            return FileResponse(str(favicon_path))

    return True


def _parse_args(argv=None):
    """CLI flags are thin wrappers over the MK_* env vars, so the Electron
    shell (env) and a terminal user (flags) configure the same knobs."""
    import argparse
    parser = argparse.ArgumentParser(description="Quantum Terminal launcher")
    parser.add_argument("--port", type=int, help="HTTP port (env MK_PORT, default 8502)")
    parser.add_argument("--no-browser", action="store_true",
                        help="Don't open the system browser (env MK_NO_BROWSER=1)")
    parser.add_argument("--sim", action="store_true",
                        help="Use the built-in simulated market feed with paper "
                             "trading - no broker needed (env MK_PROVIDER=sim)")
    # parse_known_args: tolerate extra args injected by packagers / shells.
    args, _unknown = parser.parse_known_args(argv)
    return args


def main():
    global PORT
    args = _parse_args()
    if args.port:
        PORT = args.port
        os.environ["MK_PORT"] = str(PORT)
    if args.no_browser:
        os.environ["MK_NO_BROWSER"] = "1"
    if args.sim:
        os.environ["MK_PROVIDER"] = "sim"

    # v2 Phase D: persistent rotating log file under %APPDATA%\<APP_DIR>\logs\.
    #   Console behavior unchanged; file logging is additive.
    try:
        from logging_setup import setup_logging
        _log_file = setup_logging()
    except Exception as _e:
        _log_file = None
        print(f"[launcher] logging setup skipped: {_e}")

    print()
    print("=" * 50)
    print("  Quantum Terminal Consumer Terminal")
    print("=" * 50)
    if _log_file:
        print(f"  Logs   : {_log_file}")

    # Step 1: Ensure config exists
    config_path = ensure_config()
    print(f"  Config : {config_path}")

    # Step 2: Ensure AppData dirs exist
    appdata = ensure_appdata()
    print(f"  AppData: {appdata}")

    # Step 3: Setup Python path
    sys.path.insert(0, str(BACKEND_DIR))
    os.chdir(str(BACKEND_DIR))

    # Also add EXE_DIR so consumer_config.ini is found
    if str(EXE_DIR) not in sys.path:
        sys.path.insert(0, str(EXE_DIR))

    # Add config directory to path so modules find it
    config_dir = str(config_path.parent)
    if config_dir not in sys.path:
        sys.path.insert(0, config_dir)

    # Copy config next to backend modules if packaged
    if getattr(sys, 'frozen', False):
        backend_config = BACKEND_DIR / "consumer_config.ini"
        if not backend_config.exists() and config_path.exists():
            try:
                shutil.copy2(config_path, backend_config)
            except PermissionError:
                pass  # Read-only _internal — config found via sys.path instead

    print(f"  Server : http://127.0.0.1:{PORT}")
    if os.environ.get("MK_PROVIDER", "").strip().lower() == "sim":
        print("  Feed   : SIMULATED market data + paper trading (not real prices)")
    print(f"  Press Ctrl+C to stop")
    print("=" * 50)
    print()

    # Step 4: Open browser in background — skipped when running under Electron.
    if not os.environ.get("MK_NO_BROWSER"):
        threading.Thread(target=open_browser, daemon=True).start()

    # Step 5: Import and start server
    from data_server import app

    # Serve React build as static files (production mode)
    if mount_frontend(app, FRONTEND_DIR):
        print(f"  Frontend: serving React build ({FRONTEND_DIR})")
    else:
        print("  Frontend: not found — use npm start for dev mode")

    # v2 Phase E: graceful shutdown.
    #   Electron sends SIGTERM (Windows: terminates the process group) when
    #   the user closes the window. uvicorn handles SIGTERM by setting its
    #   `should_exit` flag and draining in-flight requests. We additionally
    #   register a Python-level signal handler that flushes logs and lets
    #   any pending sync_timestamps write finish before exit. SIGINT (Ctrl+C
    #   in dev) goes through the same path.
    import uvicorn
    import signal

    config = uvicorn.Config(
        app=app,
        host="127.0.0.1",
        port=PORT,
        log_level="info",
        # Give in-flight HTTP requests up to 5s to finish before forcing exit.
        timeout_graceful_shutdown=5,
    )
    server = uvicorn.Server(config)

    def _on_signal(signum, frame):
        log.info(f"Received signal {signum} — initiating graceful shutdown")
        server.should_exit = True

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _on_signal)
        except Exception:
            # Some platforms don't allow custom handlers in non-main threads.
            pass

    try:
        server.run()
    finally:
        # Final flush — make sure log records on disk are complete and
        # any in-memory state (sync timestamps) has been persisted.
        try:
            from data_sync_client import get_sync_client as _gsc
            _sc = _gsc()
            try:
                # Best-effort: persist sync timestamps if anything was changed
                # mid-request when the signal arrived.
                from data_sync_client import _save_sync_timestamps
                _save_sync_timestamps(_sc._sync_timestamps)
            except Exception:
                pass
        except Exception:
            pass
        try:
            logging.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    main()