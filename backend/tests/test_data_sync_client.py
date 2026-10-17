"""data_sync_client: configuration loading and cache file names."""

import sys
from pathlib import Path

import data_sync_client


def test_cache_filenames_map_to_ticker_and_category():
    resolve = data_sync_client.resolve_cache_filename
    assert resolve("EURUSD_bands") == ("EURUSD", "bands")
    assert resolve("XAUUSD_quarterly_cones") == ("XAUUSD", "quarterly_cones")
    assert resolve("US500_historical_cones") == ("US500", "historical_cones")
    assert resolve("GLOBAL_eurusd_scalp_bands") == ("EURUSD", "scalp_bands")
    assert resolve("GLOBAL_fundamentals") == ("GLOBAL", "fundamentals")
    assert resolve("_sync_timestamps") is None


def test_built_in_config_loads_without_an_ini_file(monkeypatch, tmp_path):
    # Fresh clone or CI: consumer_config.ini (written by the launcher) does
    # not exist anywhere, so the built-in defaults apply. Their %APPDATA%
    # path must be read literally, not as configparser interpolation.
    monkeypatch.setattr(data_sync_client, "PROJECT_ROOT", tmp_path / "backend")
    monkeypatch.setattr(sys, "path", [p for p in sys.path
                                      if not (Path(p or ".") / "consumer_config.ini").exists()])
    cfg = data_sync_client._read_config()
    assert cfg.get("data", "cache_dir").startswith("%APPDATA%")
    assert cfg.get("server", "base_url", fallback="") == ""
    assert data_sync_client.get_sync_client().server_configured is False
