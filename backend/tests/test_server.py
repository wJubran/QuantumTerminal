"""End-to-end: the real FastAPI app running on the simulated market."""

import os

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

BASE = "http://127.0.0.1:8502"
EVIL = {"Origin": "https://evil.example"}


@pytest.fixture(scope="module")
def client():
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url=BASE) as c:
            yield c
    finally:
        os.environ.pop("MK_PROVIDER", None)


def test_health_reports_the_simulator(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["mt5_connected"] is True
    assert h["provider"] == {"type": "sim", "label": "Simulated Market (paper trading)",
                             "connected": True, "simulated": True}


def test_config_reflects_the_override(client):
    cfg = client.get("/api/config").json()
    assert "sim" in cfg["available_provider_types"]
    assert cfg["providers"]["active_data"] == "sim_default"


def test_market_data_endpoints(client):
    bars = client.get("/api/bars/XAUUSD", params={"timeframe": "M15", "count": 50}).json()
    assert bars["count"] == 50 and {"time", "open", "high", "low", "close", "volume"} <= set(bars["bars"][0])
    ticks = client.get("/api/ticks").json()["ticks"]
    assert ticks["EURUSD"]["ask"] > ticks["EURUSD"]["bid"] > 0
    assert client.get("/api/symbol-info/USDJPY").json()["digits"] == 3


def test_no_accounts_or_subscriptions(client):
    assert client.get("/api/auth/status").status_code == 404
    health = client.get("/api/health").json()
    assert "license" not in health["components"]
    status = client.get("/api/consumer/status").json()
    assert not {"authenticated", "user_email", "subscription_status"} & set(status)


def test_missing_data_server_is_reported_as_such(client):
    # The open-source edition ships no analysis data server: the UI must be
    # able to tell "none configured" apart from "configured but offline".
    assert client.get("/api/sync/status").json()["server_configured"] is False
    assert client.get("/api/consumer/status").json()["server_configured"] is False
    assert client.get("/api/regime/macro").status_code == 404


def test_bands_replay_reads_the_analysis_cache(client):
    from data_sync_client import _get_cache_dir
    path = _get_cache_dir() / "EURUSD_bands_replay.json"
    path.write_text('{"daily": {}}', encoding="utf-8")
    try:
        assert client.get("/api/bands_replay/EURUSD").json() == {"daily": {}}
    finally:
        path.unlink()
    assert client.get("/api/bands_replay/EURUSD").status_code == 404


def test_version_endpoint_offline(client):
    v = client.get("/api/version").json()   # MK_UPDATE_CHECK=0 in the test env
    assert v["current"] == v["latest"] and v["update_available"] is False
    assert v["download_url"] == "https://github.com/wJubran/QuantumTerminal/releases"


def test_paper_order_roundtrip(client):
    r = client.post("/api/orders", json={"ticker": "EURUSD", "direction": "BUY", "lots": 0.1}).json()
    assert r["success"] and r["price"] > 0
    positions = client.get("/api/positions").json()
    assert positions["mt5_connected"] is True
    [pos] = [p for p in positions["positions"] if p["ticket"] == r["order_id"]]
    assert pos["direction"] == "BUY" and pos["lots"] == 0.1

    status = client.get("/api/mt5/status").json()
    assert status["connected"] and status["simulated"] and status["account"]["currency"] == "USD"

    closed = client.post(f"/api/positions/{r['order_id']}/close").json()
    assert closed["success"]
    assert all(p["ticket"] != r["order_id"] for p in client.get("/api/positions").json()["positions"])


def test_foreign_sites_cannot_trade_or_read(client):
    before = client.get("/api/positions").json()["positions"]
    r = client.post("/api/orders", json={"ticker": "EURUSD", "direction": "BUY", "lots": 1}, headers=EVIL)
    assert r.status_code == 403
    assert client.get("/api/positions").json()["positions"] == before
    assert client.get("/api/health", headers={"host": "evil.example:8502"}).status_code == 403
    assert client.post("/api/consumer/restart", headers=EVIL).status_code == 403


def test_cors_only_answers_the_dev_origin(client):
    ok = client.options("/api/orders", headers={"Origin": "http://localhost:3000",
                                                "Access-Control-Request-Method": "POST"})
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert client.get("/api/health", headers=EVIL).status_code == 403


def test_price_stream_pushes_ticks(client):
    # TestClient sends "Host: testserver" on WebSocket handshakes; a browser sends this:
    with client.websocket_connect("/ws/prices", headers={"host": "127.0.0.1:8502"}) as ws:
        msg = ws.receive_json()
        while msg.get("type") != "ticks_batch":
            msg = ws.receive_json()
        assert msg["ticks"]["EURUSD"]["bid"] > 0


def test_price_stream_refuses_foreign_origins(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/prices", headers={"host": "127.0.0.1:8502",
                                                             "origin": "https://evil.example"}):
            pass
