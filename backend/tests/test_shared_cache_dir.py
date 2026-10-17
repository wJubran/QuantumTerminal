"""
Pulse Room and the regime routes must read analysis files from the folder the
sync client writes — on Windows and Linux/macOS, with MK_APP_DIR_NAME unset
(`python launcher.py`) and set (Electron passes QuantumTerminal-v2).
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app_paths
import data_sync_client
from pulse_room import builder, state
from regime_routes import create_regime_router

# Each test gets its own empty HOME / APPDATA (see conftest).
pytestmark = pytest.mark.usefixtures("user_dirs")


@pytest.fixture(params=[None, "QuantumTerminal-v2"], ids=["launcher", "electron"])
def launched_by(request, monkeypatch):
    if request.param:
        monkeypatch.setenv("MK_APP_DIR_NAME", request.param)
    return request.param


@pytest.fixture
def regime_api():
    app = FastAPI()
    app.include_router(create_regime_router())
    return TestClient(app)


def _dates(hours):
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    return [(now + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M") for h in hours]


HOURS = [0, 12, 24, 36, 48]


def _cones():
    return {"gbm_curr": {
        "dates": _dates(HOURS),
        "median": [100.0] * len(HOURS),
        "sd1_high": [100.0, 101.0, 102.0, 103.0, 104.0],
        "sd1_low": [100.0, 99.0, 98.0, 97.0, 96.0],
    }}


def _bands():
    bands = {"timestamps": _dates(HOURS), "mean": [100.0] * len(HOURS)}
    for sd in (1, 2, 3):
        bands[f"gbm_{sd}sd_high"] = [100.0 + sd] * len(HOURS)
        bands[f"gbm_{sd}sd_low"] = [100.0 - sd] * len(HOURS)
    return bands


def test_pulse_builder_and_regime_routes_resolve_the_same_cache_dir(
        os_layout, launched_by, expected_app_dir, regime_api):
    # Lay the files down exactly where the sync client writes them.
    sync_cache = data_sync_client._get_cache_dir()
    data_sync_client._write_cache(data_sync_client._cache_path("XAUUSD", "cones"), _cones())
    data_sync_client._write_cache(sync_cache / builder.bands_path("XAUUSD").name, _bands())
    data_sync_client._write_cache(sync_cache / "GLOBAL_macro_regime.json", {"regime": "GOLDILOCKS"})
    # GLOBAL_<lower> naming bypasses the sync client's memory store, so this
    # exercises the route's own disk lookup.
    data_sync_client._write_cache(sync_cache / "GLOBAL_xauusd_regime.json", {"slow": "bull"})

    assert sync_cache == expected_app_dir(launched_by or "QuantumTerminal") / "cache"
    assert builder._default_cache_dir() == sync_cache
    assert regime_api.get("/api/regime/macro").json() == {"regime": "GOLDILOCKS"}
    assert regime_api.get("/api/regime/XAUUSD").json() == {"slow": "bull"}

    watchlist = {"assets": [{"symbol": "XAUUSD", "families": ["CO", "QB"]}]}
    snapshot = builder.build_snapshot(watchlist, write=True)

    families = {e["family"] for e in snapshot["assets"]["XAUUSD"]["elements"]}
    assert families == {"CO", "QB"}
    assert (sync_cache.parent / "pulse_snapshot.json").is_file()


def test_every_module_resolves_the_same_app_data_dir(os_layout, launched_by):
    import account_manager
    import cache_watcher
    import config_manager
    import launcher
    import logging_setup

    app_dir = app_paths.app_data_dir()
    cache = app_dir / "cache"

    assert data_sync_client._get_cache_dir() == cache
    assert cache_watcher._get_cache_dir() == cache
    assert builder._default_cache_dir() == cache
    assert state._pulse_dir() == app_dir
    assert config_manager._appdata_user_config_path() == app_dir / "user_config.json"
    assert account_manager._get_user_data_dir() == app_dir
    assert logging_setup._appdata_logs_dir() == app_dir / "logs"
    assert launcher._get_appdata_base() == app_dir
    assert launcher.ensure_appdata() == app_dir
    assert cache.is_dir()


def test_profile_migration_reads_live_user_config_off_windows(monkeypatch):
    # Off Windows the v11 profile migration used to find no sources and then
    # strip profiles from user_config.json without copying them anywhere.
    import config_manager

    monkeypatch.setattr(app_paths, "_is_windows", lambda: False)
    monkeypatch.delenv("APPDATA")
    live = config_manager._appdata_user_config_path()
    live.write_text('{"profiles": {"Day": {}}}', encoding="utf-8")

    assert config_manager._legacy_user_config_paths() == [live]
