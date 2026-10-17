"""launcher: UI discovery, CLI flags and the SPA static server."""

import json
import subprocess
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

import debug_subprocess
import launcher

REPO = launcher.BASE_DIR.parent
SHIPPED_UI = REPO / "frontend_build"


def test_dev_mode_serves_the_build_shipped_in_the_repo():
    assert launcher.FRONTEND_DIR == SHIPPED_UI


def test_frontend_dir_resolution(monkeypatch, tmp_path):
    monkeypatch.delenv("MK_FRONTEND_DIR", raising=False)
    assert launcher._resolve_frontend_dir([tmp_path / "missing", SHIPPED_UI]) == SHIPPED_UI
    monkeypatch.setenv("MK_FRONTEND_DIR", str(tmp_path))
    assert launcher._resolve_frontend_dir([SHIPPED_UI]) == tmp_path.resolve()


def test_cli_flags():
    args = launcher._parse_args(["--sim", "--port", "9000", "--no-browser", "--unknown-extra"])
    assert args.sim and args.port == 9000 and args.no_browser


def test_spa_serving_and_no_path_traversal():
    app = FastAPI()

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    assert launcher.mount_frontend(app, SHIPPED_UI)
    client = TestClient(app, base_url="http://127.0.0.1:8502")

    index = client.get("/")
    assert index.status_code == 200 and '<div id="root">' in index.text
    main_js = json.loads((SHIPPED_UI / "asset-manifest.json").read_text())["files"]["main.js"]
    assert client.get(main_js).status_code == 200
    assert client.get("/sounds/connected.wav").headers["content-type"].startswith("audio/")
    assert '<div id="root">' in client.get("/some/client/route").text     # React Router fallback
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/missing").status_code == 404                  # never the SPA

    # "/../backend/launcher.py" must not escape the build directory
    for path in ("/..%2fbackend%2flauncher.py", "/%2e%2e/backend/launcher.py"):
        r = client.get(path)
        assert "def mount_frontend" not in r.text


def test_mount_frontend_without_a_build(tmp_path):
    assert launcher.mount_frontend(FastAPI(), tmp_path) is False


def test_debug_popen_logs_output_and_uses_this_interpreter():
    proc = debug_subprocess.debug_popen(
        ["python", "-c", "import sys; print('hello from', sys.executable)"], label="unit test")
    assert proc.wait(timeout=60) == 0
    log = (debug_subprocess.subprocess_logs_dir() / "unit_test.log").read_text(encoding="utf-8")
    assert "hello from" in log and sys.executable in log


def test_launcher_help_runs():
    out = subprocess.run([sys.executable, str(launcher.BASE_DIR / "launcher.py"), "--help"],
                         capture_output=True, text=True, timeout=60)
    assert out.returncode == 0 and "--sim" in out.stdout
