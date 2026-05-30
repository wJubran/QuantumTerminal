import pytest
import os
import shutil
from pathlib import Path
from backend.launcher import ensure_appdata, ensure_config, _get_appdata_base

def test_ensure_appdata_creates_paths(tmp_path):
    os.environ["APPDATA"] = str(tmp_path)
    base_path = ensure_appdata()
    assert base_path.exists()
    assert (base_path / "cache").exists()

def test_ensure_config_creates_file_if_missing(tmp_path, monkeypatch):
    os.environ["APPDATA"] = str(tmp_path)
    # Force the launcher to use our temp path for EXE_DIR
    from backend import launcher
    monkeypatch.setattr(launcher, "EXE_DIR", tmp_path)
    
    result = ensure_config()
    assert result.exists()
    assert "base_url" in result.read_text()

def test_ensure_config_returns_existing_file(tmp_path, monkeypatch):
    os.environ["APPDATA"] = str(tmp_path)
    config_path = tmp_path / "consumer_config.ini"
    config_path.write_text("dummy_config")
    
    # Force the launcher to use our temp path for EXE_DIR
    from backend import launcher
    monkeypatch.setattr(launcher, "EXE_DIR", tmp_path)
    
    result = ensure_config()
    assert result == config_path
    assert result.read_text() == "dummy_config"

def test_ensure_config_handles_permission_error(tmp_path, monkeypatch):
    os.environ["APPDATA"] = str(tmp_path)
    config_path = tmp_path / "consumer_config.ini"
    config_path.mkdir() # Force permission error by creating a directory where file should be
    
    # Force the launcher to use our temp path
    from backend import launcher
    monkeypatch.setattr(launcher, "EXE_DIR", tmp_path)
    
    result = ensure_config()
    assert result.exists()
    assert result.name == "consumer_config.ini"

def test_get_appdata_base_path(tmp_path):
    os.environ["APPDATA"] = str(tmp_path)
    path = _get_appdata_base()
    assert str(tmp_path) in str(path)