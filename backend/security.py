"""
================================================================================
Quantum Terminal — Local API guard (cross-site requests + DNS rebinding)
================================================================================
The data server listens on 127.0.0.1 and can place LIVE broker orders
(POST /api/orders). Binding to loopback alone does not protect it: any web
page open in the user's browser can send requests to http://127.0.0.1:<port>,
and a DNS-rebinding page (evil.example resolving to 127.0.0.1) can even read
the responses. LocalOriginGuard is a pure ASGI middleware that rejects:

  1. Requests whose Host header is not an allowed host (loopback by default)
     → defeats DNS rebinding.
  2. Requests carrying an Origin that is neither this server's own origin nor
     an allow-listed one (the React dev server) → defeats cross-site fetch,
     form posts and WebSocket connections (browsers don't apply CORS to
     WebSockets, so the Origin check is the only line of defense there).
  3. Cross-site requests that carry no Origin, detected via Sec-Fetch-Site
     (e.g. an <img src="http://127.0.0.1:8502/api/..."> on another site).

Top-level navigations to the UI shell (GET /, /static/...) stay allowed from
anywhere so links and bookmarks keep working — they can't read any data.
Non-browser clients (curl, scripts, the Electron main process) send neither
Origin nor Sec-Fetch-Site and are unaffected.

Configuration lives in ServerConfig: `allowed_hosts` (MK_ALLOWED_HOSTS, "*"
disables the Host check) and `cors_origins` (MK_CORS_ORIGINS).
================================================================================
"""

import json
import logging
import time
from typing import Dict, Iterable, Optional, Tuple
from urllib.parse import urlsplit

log = logging.getLogger("security")

# Paths that serve data or accept commands. Everything else is the static UI.
PROTECTED_PREFIXES: Tuple[str, ...] = ("/api", "/ws", "/docs", "/redoc", "/openapi.json")

_LOG_THROTTLE_SEC = 60.0


def host_without_port(host_header: str) -> str:
    """'127.0.0.1:8502' → '127.0.0.1', '[::1]:8502' → '::1', 'LocalHost' → 'localhost'."""
    h = (host_header or "").strip().lower()
    if h.startswith("["):
        end = h.find("]")
        return h[1:end] if end != -1 else h[1:]
    if h.count(":") == 1:
        return h.split(":", 1)[0]
    return h  # plain hostname, or a bare IPv6 literal


def _normalize_origin(origin: str) -> str:
    return (origin or "").strip().lower().rstrip("/")


class LocalOriginGuard:
    """ASGI middleware enforcing the rules described in the module docstring."""

    def __init__(self, app, allowed_hosts: Iterable[str] = ("127.0.0.1", "localhost", "::1"),
                 allowed_origins: Iterable[str] = ()):
        self.app = app
        hosts = {h.strip().lower().strip("[]") for h in allowed_hosts if h and h.strip()}
        self.any_host = "*" in hosts
        self.allowed_hosts = hosts - {"*"}
        self.allowed_origins = {_normalize_origin(o) for o in allowed_origins if o}
        self._last_logged: Dict[str, float] = {}

    # ── Policy ──

    def _origin_allowed(self, origin: str, host_header: str) -> bool:
        o = _normalize_origin(origin)
        if o in self.allowed_origins:
            return True
        if o == "null":  # sandboxed iframes, file:// pages, data: URLs
            return False
        parts = urlsplit(o)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            return False
        # Same-origin: the page was served by this very server. Safe because
        # the Host header itself was validated first.
        return parts.netloc == (host_header or "").strip().lower()

    def check(self, scope, headers: Dict[str, str]) -> Optional[str]:
        """Return None if the request may proceed, else a short reason."""
        host = headers.get("host", "")
        if not self.any_host and host_without_port(host) not in self.allowed_hosts:
            return f"host '{host}' is not allowed"

        origin = headers.get("origin")
        if origin is not None:
            if self._origin_allowed(origin, host):
                return None
            return f"origin '{origin}' is not allowed"

        site = headers.get("sec-fetch-site")
        if site in ("cross-site", "same-site"):
            path = scope.get("path", "")
            is_ui_navigation = (
                scope["type"] == "http"
                and scope.get("method") in ("GET", "HEAD")
                and headers.get("sec-fetch-mode") == "navigate"
                and not path.startswith(PROTECTED_PREFIXES)
            )
            if is_ui_navigation:
                return None
            return f"{site} request is not allowed"
        return None

    # ── ASGI ──

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = {
            k.decode("latin-1").lower(): v.decode("latin-1")
            for k, v in scope.get("headers") or []
        }
        reason = self.check(scope, headers)
        if reason is None:
            await self.app(scope, receive, send)
            return

        self._log_blocked(scope, reason)
        if scope["type"] == "websocket":
            # Consume the handshake, then refuse it: before accept, a close
            # makes the server answer the upgrade with HTTP 403.
            await receive()
            await send({"type": "websocket.close", "code": 1008})
            return

        body = json.dumps({"error": "forbidden", "detail": reason}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 403,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    def _log_blocked(self, scope, reason: str) -> None:
        # Throttled per rule ("host" / "origin" / "cross-site" / "same-site"):
        # a hostile page could otherwise flood the log file.
        rule = reason.split(" ", 1)[0]
        now = time.monotonic()
        if now - self._last_logged.get(rule, -_LOG_THROTTLE_SEC) < _LOG_THROTTLE_SEC:
            return
        self._last_logged[rule] = now
        log.warning(f"Blocked {scope['type']} {scope.get('path', '')}: {reason} "
                    f"(further '{rule}' blocks muted for {_LOG_THROTTLE_SEC:.0f}s)")
