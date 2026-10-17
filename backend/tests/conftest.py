"""
Shared test setup.

Several backend modules resolve AppData / home-directory paths at import
time, so every user-data location is pointed at a throwaway sandbox *before*
any of them is imported — tests never touch a real profile.

Tests that need their own empty folders (path resolution, legacy-file copies)
take the `user_dirs` fixture; `os_layout` also runs them once with the Windows
layout and once with the Linux/macOS one.
"""

import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

_SANDBOX = Path(tempfile.mkdtemp(prefix="qt-tests-"))
os.environ["HOME"] = str(_SANDBOX)
os.environ["USERPROFILE"] = str(_SANDBOX)
os.environ["APPDATA"] = str(_SANDBOX / "AppData" / "Roaming")
os.environ["MK_USER_DATA_DIR"] = str(_SANDBOX / "Documents" / "Quantum Terminal")
os.environ.pop("MK_PROVIDER", None)
os.environ["MK_UPDATE_CHECK"] = "0"   # never call the GitHub API from tests

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture
def user_dirs(tmp_path, monkeypatch):
    """Fresh, empty HOME / USERPROFILE / APPDATA for one test, and no
    MK_APP_DIR_NAME."""
    home = tmp_path / "home"
    appdata = tmp_path / "appdata"
    home.mkdir()
    appdata.mkdir()
    monkeypatch.setenv("HOME", str(home))          # Path.home() on Linux/macOS
    monkeypatch.setenv("USERPROFILE", str(home))   # Path.home() on Windows
    monkeypatch.setenv("APPDATA", str(appdata))
    monkeypatch.delenv("MK_APP_DIR_NAME", raising=False)
    # The sync client is a process-wide singleton that caches what it reads.
    monkeypatch.setattr("data_sync_client._sync_client", None)
    return SimpleNamespace(home=home, appdata=appdata)


@pytest.fixture(params=["windows", "posix"])
def os_layout(request, monkeypatch):
    import app_paths
    monkeypatch.setattr(app_paths, "_is_windows", lambda: request.param == "windows")
    return request.param


@pytest.fixture
def expected_app_dir(user_dirs, os_layout):
    """Where app_paths should put the app-data dir called `name` under the
    layout being tested."""
    def expected(name="QuantumTerminal"):
        if os_layout == "windows":
            return user_dirs.appdata / name
        return user_dirs.home / f".{name}"
    return expected
