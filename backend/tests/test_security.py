"""LocalOriginGuard: cross-site request and DNS-rebinding protection."""

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from security import LocalOriginGuard, host_without_port

BASE = "http://127.0.0.1:8502"
SAME_ORIGIN = "http://127.0.0.1:8502"


def build(hosts=("127.0.0.1", "localhost", "::1"), origins=("http://localhost:3000",)) -> TestClient:
    async def ok(request):
        return PlainTextResponse("ok")

    async def prices(ws):
        await ws.accept()
        await ws.send_text("tick")
        await ws.close()

    app = Starlette(routes=[
        Route("/", ok),
        Route("/api/orders", ok, methods=["GET", "POST"]),
        WebSocketRoute("/ws/prices", prices),
    ])
    app.add_middleware(LocalOriginGuard, allowed_hosts=list(hosts), allowed_origins=list(origins))
    return TestClient(app, base_url=BASE)


@pytest.mark.parametrize("method,path,headers,status", [
    # the terminal's own UI and non-browser clients
    ("POST", "/api/orders", {"origin": SAME_ORIGIN}, 200),
    ("GET", "/api/orders", {"sec-fetch-site": "same-origin"}, 200),
    ("GET", "/api/orders", {}, 200),
    ("GET", "/api/orders", {"host": "localhost:8502"}, 200),
    ("GET", "/api/orders", {"host": "[::1]:8502"}, 200),
    # the React dev server
    ("POST", "/api/orders", {"origin": "http://localhost:3000"}, 200),
    # cross-site requests
    ("POST", "/api/orders", {"origin": "https://evil.example"}, 403),
    ("POST", "/api/orders", {"origin": "http://127.0.0.1:9999"}, 403),
    ("POST", "/api/orders", {"origin": "null"}, 403),
    ("GET", "/api/orders", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors"}, 403),
    ("GET", "/api/orders", {"sec-fetch-site": "same-site", "sec-fetch-mode": "cors"}, 403),
    ("GET", "/api/orders", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate"}, 403),
    # links / bookmarks to the UI shell still open it
    ("GET", "/", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate"}, 200),
    # DNS rebinding: a foreign name resolving to 127.0.0.1
    ("GET", "/api/orders", {"host": "evil.example:8502"}, 403),
    ("POST", "/api/orders", {"host": "evil.example:8502", "origin": "http://evil.example:8502"}, 403),
])
def test_http_policy(method, path, headers, status):
    r = build().request(method, path, headers=headers)
    assert r.status_code == status
    if status == 403:
        assert r.json()["error"] == "forbidden"


def test_extra_hosts_and_wildcard():
    assert build(hosts=["127.0.0.1", "192.168.1.20"]).get(
        "/api/orders", headers={"host": "192.168.1.20:8502"}).status_code == 200
    assert build(hosts=["*"]).get("/api/orders", headers={"host": "anything:1"}).status_code == 200


# Starlette's TestClient sends "Host: testserver" on WebSocket handshakes
# whatever base_url says, so the tests spell out the Host a browser sends.
WS_HOST = {"host": "127.0.0.1:8502"}


def test_websocket_same_origin_is_accepted():
    with build().websocket_connect("/ws/prices", headers={**WS_HOST, "origin": SAME_ORIGIN}) as ws:
        assert ws.receive_text() == "tick"


@pytest.mark.parametrize("headers", [
    {**WS_HOST, "origin": "https://evil.example"},
    {"origin": SAME_ORIGIN, "host": "evil.example:8502"},
])
def test_websocket_cross_site_is_refused(headers):
    with pytest.raises(WebSocketDisconnect) as exc:
        with build().websocket_connect("/ws/prices", headers=headers):
            pass
    assert exc.value.code == 1008


@pytest.mark.parametrize("raw,host", [
    ("127.0.0.1:8502", "127.0.0.1"), ("LocalHost", "localhost"),
    ("[::1]:8502", "::1"), ("::1", "::1"), ("", ""),
])
def test_host_without_port(raw, host):
    assert host_without_port(raw) == host
