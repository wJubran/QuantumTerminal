"""/api/version: GitHub release check, caching and opt-out."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import version_info


@pytest.fixture
def api(monkeypatch):
    """Client for a bare app with the version router; update checks enabled
    but the GitHub call replaced by a stub that counts its invocations."""
    monkeypatch.setenv("MK_UPDATE_CHECK", "1")
    monkeypatch.setattr(version_info, "_release_cache", {"at": 0.0, "release": None})
    monkeypatch.setattr(version_info, "CURRENT_VERSION", "1.1.0")
    calls = {"n": 0, "release": None, "error": None}

    async def fake_fetch():
        calls["n"] += 1
        if calls["error"]:
            raise calls["error"]
        return calls["release"]

    monkeypatch.setattr(version_info, "fetch_latest_release", fake_fetch)
    app = FastAPI()
    app.include_router(version_info.create_version_router())
    return TestClient(app), calls


def test_newer_release_is_offered(api):
    client, calls = api
    calls["release"] = {"version": "1.2.0", "url": "https://github.com/wJubran/QuantumTerminal/releases/tag/v1.2.0",
                        "published_at": "2026-11-02"}
    v = client.get("/api/version").json()
    assert v["latest"] == "1.2.0" and v["update_available"] is True
    assert v["download_url"].endswith("/tag/v1.2.0") and v["released_at"] == "2026-11-02"


@pytest.mark.parametrize("latest", ["1.1.0", "1.0.9", "0.9.0"])
def test_same_or_older_release_is_not_an_update(api, latest):
    client, calls = api
    calls["release"] = {"version": latest, "url": version_info.DOWNLOAD_BASE, "published_at": ""}
    assert client.get("/api/version").json()["update_available"] is False


def test_offline_or_no_release_falls_back_to_current(api):
    client, calls = api
    calls["error"] = OSError("network unreachable")
    v = client.get("/api/version").json()
    assert v["latest"] == "1.1.0" and v["update_available"] is False
    assert v["download_url"] == version_info.DOWNLOAD_BASE


def test_result_is_cached_until_refresh(api):
    client, calls = api
    calls["release"] = {"version": "1.2.0", "url": version_info.DOWNLOAD_BASE, "published_at": ""}
    client.get("/api/version"); client.get("/api/version")
    assert calls["n"] == 1
    client.get("/api/version", params={"refresh": "true"})
    assert calls["n"] == 2


def test_opt_out_never_calls_github(api, monkeypatch):
    client, calls = api
    monkeypatch.setenv("MK_UPDATE_CHECK", "0")
    calls["release"] = {"version": "9.9.9", "url": "x", "published_at": ""}
    assert client.get("/api/version").json()["update_available"] is False
    assert calls["n"] == 0


@pytest.mark.parametrize("raw,parsed", [
    ("v1.2.0", (1, 2, 0)), ("1.2", (1, 2, 0)), ("1.10.3", (1, 10, 3)),
    ("2.0.0-beta.1", (2, 0, 0)), ("", (0, 0, 0)),
])
def test_parse_version(raw, parsed):
    assert version_info.parse_version(raw) == parsed


def test_fetch_ignores_drafts_and_prereleases(monkeypatch):
    class FakeResponse:
        status_code = 200
        def __init__(self, payload): self._payload = payload
        def json(self): return self._payload

    class FakeClient:
        payload = None
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def get(self, url): return FakeResponse(FakeClient.payload)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    FakeClient.payload = {"tag_name": "v1.3.0", "html_url": "https://x/tag/v1.3.0", "published_at": "2026-12-01T10:00:00Z"}
    assert asyncio.run(version_info.fetch_latest_release()) == {
        "version": "1.3.0", "url": "https://x/tag/v1.3.0", "published_at": "2026-12-01"}
    FakeClient.payload = {"tag_name": "v1.4.0", "prerelease": True}
    assert asyncio.run(version_info.fetch_latest_release()) is None
