"""data_sync_client: configuration loading."""

import sys
from pathlib import Path

import data_sync_client


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
