"""
Test sandbox for the backend.

Every test gets throwaway HOME / USERPROFILE / APPDATA folders and no
MK_APP_DIR_NAME, so nothing reads or writes the real per-user directories.
Tests that depend on the platform layout take the `os_layout` fixture, which
runs them once with the Windows layout and once with the Linux/macOS one.
"""
from types import SimpleNamespace

import pytest

import app_paths


@pytest.fixture(autouse=True)
def sandbox(tmp_path, monkeypatch):
    home = tmp_path / "home"
    appdata = tmp_path / "appdata"
    home.mkdir()
    appdata.mkdir()
    monkeypatch.setenv("HOME", str(home))          # Path.home() on Linux/macOS
    monkeypatch.setenv("USERPROFILE", str(home))   # Path.home() on Windows
    monkeypatch.setenv("APPDATA", str(appdata))
    monkeypatch.delenv("MK_APP_DIR_NAME", raising=False)
    monkeypatch.delenv("MK_USER_DATA_DIR", raising=False)
    # The sync client is a process-wide singleton that caches what it reads.
    monkeypatch.setattr("data_sync_client._sync_client", None)
    return SimpleNamespace(home=home, appdata=appdata)


@pytest.fixture(params=["windows", "posix"])
def os_layout(request, monkeypatch):
    monkeypatch.setattr(app_paths, "_is_windows", lambda: request.param == "windows")
    return request.param


@pytest.fixture
def expected_app_dir(sandbox, os_layout):
    """Where app_paths should put the app-data dir called `name` under the
    layout being tested."""
    def expected(name=app_paths.DEFAULT_APP_DIR_NAME):
        if os_layout == "windows":
            return sandbox.appdata / name
        return sandbox.home / f".{name}"
    return expected
