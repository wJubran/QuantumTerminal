"""app_paths: the one resolver for the per-user app-data and cache dirs."""
import shutil

import pytest

import app_paths

# Each test gets its own empty HOME / APPDATA (see conftest).
pytestmark = pytest.mark.usefixtures("user_dirs")


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


# ── layout ──────────────────────────────────────────────────────────────────

def test_default_name_and_layout(expected_app_dir):
    assert app_paths.app_dir_name() == "QuantumTerminal"
    assert app_paths.app_data_dir() == expected_app_dir()
    assert app_paths.cache_dir() == expected_app_dir() / "cache"
    assert app_paths.cache_dir().is_dir()


@pytest.mark.parametrize("name", ["QuantumTerminal-v2", "MyLab"])
def test_mk_app_dir_name_is_honoured_on_every_platform(monkeypatch, expected_app_dir, name):
    monkeypatch.setenv("MK_APP_DIR_NAME", name)
    assert app_paths.cache_dir() == expected_app_dir(name) / "cache"


def test_blank_mk_app_dir_name_means_default(monkeypatch, expected_app_dir):
    monkeypatch.setenv("MK_APP_DIR_NAME", "  ")
    assert app_paths.app_data_dir() == expected_app_dir()


def test_resolved_per_call_not_at_import(monkeypatch, expected_app_dir):
    assert app_paths.cache_dir() == expected_app_dir() / "cache"
    monkeypatch.setenv("MK_APP_DIR_NAME", "QuantumTerminal-v2")
    assert app_paths.cache_dir() == expected_app_dir("QuantumTerminal-v2") / "cache"


def test_appdata_is_ignored_off_windows(user_dirs, monkeypatch):
    monkeypatch.setattr(app_paths, "_is_windows", lambda: False)
    assert app_paths.app_data_dir() == user_dirs.home / ".QuantumTerminal"


def test_windows_without_appdata_uses_roaming_under_profile(user_dirs, monkeypatch):
    monkeypatch.setattr(app_paths, "_is_windows", lambda: True)
    monkeypatch.delenv("APPDATA")
    assert app_paths.app_data_dir() == user_dirs.home / "AppData" / "Roaming" / "QuantumTerminal"


# ── legacy locations ────────────────────────────────────────────────────────

def test_electron_dir_gets_nothing_new(user_dirs, monkeypatch):
    # Electron passes MK_APP_DIR_NAME=QuantumTerminal-v2: its existing
    # folder is already the target, so nothing is copied or added there.
    monkeypatch.setattr(app_paths, "_is_windows", lambda: True)
    monkeypatch.setenv("MK_APP_DIR_NAME", "QuantumTerminal-v2")
    write(user_dirs.appdata / "QuantumTerminal-v2" / "pulse_watchlist.json", "{}")

    target = app_paths.app_data_dir()

    assert target == user_dirs.appdata / "QuantumTerminal-v2"
    assert [p.name for p in target.iterdir()] == ["pulse_watchlist.json"]


def test_pulse_state_is_copied_from_its_old_default_dir(user_dirs, monkeypatch):
    # Without MK_APP_DIR_NAME, Pulse Room used %APPDATA%\QuantumTerminal-v2.
    monkeypatch.setattr(app_paths, "_is_windows", lambda: True)
    old = write(user_dirs.appdata / "QuantumTerminal-v2" / "pulse_watchlist.json",
                '{"assets": [{"symbol": "XAUUSD", "families": ["CO"]}]}')

    new = app_paths.app_data_dir() / "pulse_watchlist.json"

    assert new == user_dirs.appdata / "QuantumTerminal" / "pulse_watchlist.json"
    assert new.read_text(encoding="utf-8") == old.read_text(encoding="utf-8")
    assert old.exists()  # copied, not moved


def test_posix_files_are_copied_once_and_never_overwritten(user_dirs, monkeypatch):
    monkeypatch.setattr(app_paths, "_is_windows", lambda: False)
    home = user_dirs.home
    target = home / ".QuantumTerminal"
    write(home / ".config" / "QuantumTerminal-v2" / "pulse_state.json", '{"enabled": true}')
    write(home / "AppData" / "Roaming" / "QuantumTerminal" / "user_config.json", '{"universe": {}}')
    write(home / ".config" / "QuantumTerminal-v2" / "pulse_watchlist.json", "old")
    write(target / "pulse_watchlist.json", "current")

    assert app_paths.app_data_dir() == target
    assert (target / "pulse_state.json").read_text(encoding="utf-8") == '{"enabled": true}'
    assert (target / "user_config.json").read_text(encoding="utf-8") == '{"universe": {}}'
    assert (target / "pulse_watchlist.json").read_text(encoding="utf-8") == "current"

    # A later start must not resurrect a file the user has since deleted.
    (target / "user_config.json").unlink()
    monkeypatch.setattr(app_paths, "_migrated_targets", set())  # fresh process
    app_paths.app_data_dir()
    assert not (target / "user_config.json").exists()


def test_posix_account_files_are_copied_from_lowercase_dir(user_dirs, monkeypatch):
    monkeypatch.setattr(app_paths, "_is_windows", lambda: False)
    old_dir = user_dirs.home / ".quantumterminal"
    write(old_dir / "account_state.json", '{"peak_equity": 1}')
    write(old_dir / "sim_paper_account.json", '{"balance": 100000}')
    if (user_dirs.home / ".QuantumTerminal").exists():
        pytest.skip("case-insensitive filesystem: both spellings are one folder")

    new_dir = app_paths.app_data_dir()

    for name in ("account_state.json", "sim_paper_account.json"):
        assert (new_dir / name).read_text(encoding="utf-8") == \
            (old_dir / name).read_text(encoding="utf-8")


def test_failed_copy_is_retried_on_next_start(user_dirs, monkeypatch):
    monkeypatch.setattr(app_paths, "_is_windows", lambda: True)
    write(user_dirs.appdata / "QuantumTerminal-v2" / "pulse_state.json", '{"enabled": true}')
    real_copy2 = shutil.copy2

    def locked(src, dst):
        raise PermissionError("file in use")

    monkeypatch.setattr(shutil, "copy2", locked)
    target = app_paths.app_data_dir()
    assert not (target / "pulse_state.json").exists()

    monkeypatch.setattr(shutil, "copy2", real_copy2)
    monkeypatch.setattr(app_paths, "_migrated_targets", set())  # fresh process
    app_paths.app_data_dir()
    assert (target / "pulse_state.json").read_text(encoding="utf-8") == '{"enabled": true}'
