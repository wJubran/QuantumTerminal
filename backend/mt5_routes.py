# version: v6
"""
mt5_routes.py — MT5 Connection Management API
================================================
Endpoints for the consumer Settings → Providers panel.

    GET    /api/mt5/config      → read MT5 connection settings
    PATCH  /api/mt5/config      → save MT5 connection settings
    POST   /api/mt5/connect     → connect to MT5 with current config
    POST   /api/mt5/disconnect  → disconnect from MT5

Settings are stored in user_config.json under providers.accounts.mt5_default.
This module does NOT introduce any calculation triggers.

v2 — PATCH /config now disconnects and reinitializes the MT5 provider after
     saving, so the next /connect picks up the new terminal_path / server /
     login immediately. Previously the provider cached the old path in memory
     and stale connects kept firing until the backend was restarted — e.g.
     user couldn't revert an invalid GoDo path back to auto-detect.

v3 — Added `use_tick_data` to the GET/PATCH config payload. When True, the
     backend tick loop polls MT5 every 0.2s instead of 1.0s, giving the chart
     a live MT5-style "tick feel" on the last candle. Default OFF. Toggle
     surfaces in Settings → PROVIDERS.

v4 — PATCH /config no longer disconnects + reinits the MT5 provider on every
     change. Reinit now triggers ONLY when a connection-relevant field
     (connection_method / terminal_path / server / login / password) is
     touched. Flipping `use_tick_data` (and any other future cosmetic field)
     leaves the live connection alone. Without this, toggling USE TICK DATA
     in the UI caused a ~5s outage with a flood of 503 responses while the
     reconnect loop healed the connection.

v5 — POST /browse-terminal opens a native Windows file-picker so users with
     multiple MT5 installations can select the correct terminal64.exe without
     manually typing (or pasting) a long path. Runs tkinter.filedialog on a
     worker thread, returns the chosen absolute path.
"""

import asyncio
import logging
from fastapi import APIRouter, Request, HTTPException

log = logging.getLogger("mt5_routes")


def _resolve_account(provider):
    """Account dict {login, server, balance, equity, currency} for the frontend
    header. Reads the account_manager's cached snapshot (refreshed every ~5s by
    the provider sync loop) so this hot, polled path never triggers atlas's
    ~5s-per-call accounts.get. Falls back to a direct provider query, then a
    local MetaTrader5 terminal, only before the cache has been populated."""
    # Fast path: cached snapshot maintained by the provider sync loop (instant).
    try:
        from account_manager import get_account_manager
        s = get_account_manager().get_status_dict()
        if s.get("balance") is not None and (s.get("login") or s.get("server")):
            return {
                "login": s.get("login"),
                "server": s.get("server"),
                "balance": s.get("balance"),
                "equity": s.get("equity"),
                "currency": s.get("currency"),
            }
    except Exception:
        pass
    # Fallback (pre-first-sync): query the provider, else a local MT5 terminal.
    if provider is not None:
        try:
            info = provider.get_account_info()
        except Exception:
            info = None
        if info:
            return {
                "login": getattr(info, "account_id", None) or getattr(info, "login", None),
                "server": getattr(info, "server", None),
                "balance": getattr(info, "balance", None),
                "equity": getattr(info, "equity", None),
                "currency": getattr(info, "currency", None),
            }
    try:
        import MetaTrader5 as mt5
        info = mt5.account_info()
        if info:
            return {
                "login": info.login,
                "server": info.server,
                "balance": info.balance,
                "equity": info.equity,
                "currency": info.currency,
            }
    except Exception:
        pass
    return None


def create_mt5_router(cfg_manager, app) -> APIRouter:
    router = APIRouter(prefix="/api/mt5", tags=["mt5"])

    def _get_mt5_config() -> dict:
        """Read MT5 config from user_config providers section."""
        config = cfg_manager.get_config()
        providers = config.get("providers", {})
        accounts = providers.get("accounts", {})
        mt5_acct = accounts.get("mt5_default", {})
        return {
            "connection_method": mt5_acct.get("connection_method", "path"),
            "terminal_path": mt5_acct.get("terminal_path") or "",
            "server": mt5_acct.get("server", ""),
            "login": mt5_acct.get("login", ""),
            "password": "",  # Never send password back
            "enabled": mt5_acct.get("enabled", True),
            # v3: USE TICK DATA — when ON, tick loop polls MT5 5×/sec instead
            # of 1×/sec. Default OFF; user opts in via Settings → PROVIDERS.
            "use_tick_data": bool(mt5_acct.get("use_tick_data", False)),
        }

    # ── GET /api/mt5/config ──
    @router.get("/config")
    async def get_mt5_config():
        return _get_mt5_config()

    # ── PATCH /api/mt5/config ──
    @router.patch("/config")
    async def patch_mt5_config(request: Request):
        import asyncio

        try:
            patch = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")

        # Build the nested update for providers.accounts.mt5_default
        mt5_update = {}
        for key in ["connection_method", "terminal_path", "server", "login", "password",
                    "use_tick_data"]:  # v3
            if key in patch:
                mt5_update[key] = patch[key]

        if mt5_update:
            cfg_manager.update({
                "providers": {
                    "accounts": {
                        "mt5_default": mt5_update
                    }
                }
            })
            log.info(f"MT5 config updated: {list(mt5_update.keys())}")

            # v4: reinit only when a connection-relevant field changed.
            # use_tick_data is read live by focus_tick_loop on every iteration
            # — flipping it must NOT bounce the MT5 connection (5s 503 outage).
            CONNECTION_FIELDS = {"connection_method", "terminal_path",
                                 "server", "login", "password"}
            if CONNECTION_FIELDS.intersection(mt5_update.keys()):
                try:
                    prov = cfg_manager.get_provider("mt5_default")
                    if prov is not None:
                        try:
                            if getattr(prov, "connected", False):
                                await asyncio.to_thread(prov.disconnect)
                        except Exception as e:
                            log.warning(f"MT5 disconnect during reinit failed: {e}")
                    await asyncio.to_thread(cfg_manager.init_providers)
                    log.info("MT5 provider reinitialized with new config")
                except Exception as e:
                    log.warning(f"MT5 provider reinit failed: {e}")

        return {"config": _get_mt5_config()}

    # ── POST /api/mt5/browse-terminal ──
    @router.post("/browse-terminal")
    async def browse_terminal():
        """v5: Open a native OS file picker for the user to select terminal64.exe.
        Runs tkinter.filedialog on a worker thread (FastAPI's async loop can't
        block on a dialog). Returns {"path": "..."} on pick, {"path": null,
        "cancelled": true} on cancel. Windows-only for now — defaults to the
        most likely MT5 install dir if nothing is configured yet."""
        import asyncio
        import os
        import platform

        if platform.system() != "Windows":
            raise HTTPException(501, "Browse dialog is Windows-only for now.")

        # Pick a sensible initial directory: current configured path → its dir,
        # or %ProgramFiles% as a fallback.
        current = _get_mt5_config().get("terminal_path") or ""
        if current and os.path.isfile(current):
            initial_dir = os.path.dirname(current)
        elif current and os.path.isdir(current):
            initial_dir = current
        else:
            pf = os.environ.get("ProgramFiles", r"C:\Program Files")
            initial_dir = pf

        def _pick() -> dict:
            # v6: switched tkinter → native comdlg32 via ctypes.
            # tkinter is not bundled in the PyInstaller build (strips by
            # default unless explicitly hidden-imported), so the installed
            # .exe would fail with "No module named 'tkinter'". comdlg32.dll
            # is core Windows — always available, no dependencies, no build
            # change needed. Still runs on a worker thread because the native
            # call blocks until the user picks or cancels.
            try:
                import ctypes
                from ctypes import wintypes, Structure, byref, sizeof, c_void_p

                class OPENFILENAMEW(Structure):
                    _fields_ = [
                        ("lStructSize",      wintypes.DWORD),
                        ("hwndOwner",        wintypes.HWND),
                        ("hInstance",        wintypes.HINSTANCE),
                        ("lpstrFilter",      wintypes.LPCWSTR),
                        ("lpstrCustomFilter",wintypes.LPWSTR),
                        ("nMaxCustFilter",   wintypes.DWORD),
                        ("nFilterIndex",     wintypes.DWORD),
                        ("lpstrFile",        wintypes.LPWSTR),
                        ("nMaxFile",         wintypes.DWORD),
                        ("lpstrFileTitle",   wintypes.LPWSTR),
                        ("nMaxFileTitle",    wintypes.DWORD),
                        ("lpstrInitialDir",  wintypes.LPCWSTR),
                        ("lpstrTitle",       wintypes.LPCWSTR),
                        ("Flags",            wintypes.DWORD),
                        ("nFileOffset",      wintypes.WORD),
                        ("nFileExtension",   wintypes.WORD),
                        ("lpstrDefExt",      wintypes.LPCWSTR),
                        ("lCustData",        wintypes.LPARAM),
                        ("lpfnHook",         c_void_p),
                        ("lpTemplateName",   wintypes.LPCWSTR),
                        ("pvReserved",       c_void_p),
                        ("dwReserved",       wintypes.DWORD),
                        ("FlagsEx",          wintypes.DWORD),
                    ]

                OFN_FILEMUSTEXIST = 0x00001000
                OFN_PATHMUSTEXIST = 0x00000800
                OFN_EXPLORER      = 0x00080000
                OFN_NOCHANGEDIR   = 0x00000008

                buf = ctypes.create_unicode_buffer(4096)
                ofn = OPENFILENAMEW()
                ctypes.memset(byref(ofn), 0, sizeof(ofn))
                ofn.lStructSize   = sizeof(OPENFILENAMEW)
                ofn.lpstrFile     = ctypes.cast(buf, wintypes.LPWSTR)
                ofn.nMaxFile      = 4096
                # Filter string: pairs of "label\0pattern\0" terminated with an extra \0.
                ofn.lpstrFilter   = (
                    "MT5 terminal\0terminal64.exe;terminal.exe\0"
                    "Executables\0*.exe\0"
                    "All files\0*.*\0\0"
                )
                ofn.lpstrInitialDir = initial_dir
                ofn.lpstrTitle      = "Select MT5 terminal (terminal64.exe)"
                ofn.Flags           = (OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST
                                       | OFN_EXPLORER | OFN_NOCHANGEDIR)

                ok = ctypes.windll.comdlg32.GetOpenFileNameW(byref(ofn))
                if not ok:
                    # User cancelled OR dialog failed. CommDlgExtendedError
                    # returns 0 for cancel, non-zero for actual errors.
                    err = ctypes.windll.comdlg32.CommDlgExtendedError()
                    if err != 0:
                        return {"path": None, "error": f"comdlg32 error {err:#x}"}
                    return {"path": None, "cancelled": True}

                picked = buf.value
                if not picked:
                    return {"path": None, "cancelled": True}
                return {"path": os.path.normpath(picked), "cancelled": False}
            except Exception as e:
                log.error(f"browse-terminal dialog failed: {e}")
                return {"path": None, "error": str(e)}

        try:
            result = await asyncio.to_thread(_pick)
        except Exception as e:
            raise HTTPException(500, f"Dialog launch failed: {e}")
        if result.get("error"):
            raise HTTPException(500, result["error"])
        return result


    # ── POST /api/mt5/connect ──
    @router.post("/connect")
    async def connect_mt5(request: Request):
        import asyncio

        provider = cfg_manager.get_provider("mt5_default")
        if provider is None:
            # Try to init providers first
            try:
                await asyncio.to_thread(cfg_manager.init_providers)
                provider = cfg_manager.get_provider("mt5_default")
            except Exception as e:
                raise HTTPException(500, f"Failed to initialize MT5 provider: {e}")

        if provider is None:
            raise HTTPException(500, "MT5 provider not available")

        # If already connected, return current state
        if provider.connected:
            account = await asyncio.to_thread(_resolve_account, provider)
            return {"connected": True, "account": account}

        # Try to connect
        try:
            connected = await asyncio.wait_for(
                asyncio.to_thread(provider.connect),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            return {"connected": False, "error": "Connection timed out (15s)"}
        except Exception as e:
            return {"connected": False, "error": str(e)}

        if not connected:
            return {"connected": False, "error": "MT5 connection failed — check terminal path or credentials"}

        # Update app state
        app.state.provider = provider

        # Resolve symbols
        try:
            universe = cfg_manager.get_active_universe()
            await asyncio.to_thread(provider.resolve_universe, universe)
        except Exception:
            pass

        # Get account info
        account = await asyncio.to_thread(_resolve_account, provider)

        log.info("MT5 connected via settings panel")
        return {"connected": True, "account": account}

    # ── POST /api/mt5/disconnect ──
    @router.post("/disconnect")
    async def disconnect_mt5():
        import asyncio
        provider = cfg_manager.get_provider("mt5_default")
        if provider and provider.connected:
            try:
                await asyncio.to_thread(provider.disconnect)
                log.info("MT5 disconnected via settings panel")
            except Exception as e:
                log.warning(f"MT5 disconnect error: {e}")
        return {"connected": False}

    # ── GET /api/mt5/status ──
    @router.get("/status")
    async def get_mt5_status():
        """Quick status check — used by settings panel."""
        provider = cfg_manager.get_provider("mt5_default")
        connected = provider.connected if provider else False
        account = None
        if connected:
            account = await asyncio.to_thread(_resolve_account, provider)
        return {"connected": connected, "account": account}

    return router
