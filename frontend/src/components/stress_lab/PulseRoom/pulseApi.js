// version: v1
// pulseApi.js — REST client for the Pulse Room backend.
// All URLs are server-relative; resolution against page host is
// handled by the v2 build (matches LoginScreen / ConsumerApp pattern).

const BASE = "/api/pulse";

async function _json(res) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Pulse API: expected JSON, got ${res.status} ${ct}`);
  }
  return res.json();
}

export async function fetchState() {
  const res = await fetch(`${BASE}/state`, { credentials: "include" });
  if (!res.ok) throw new Error(`Pulse /state failed: ${res.status}`);
  return _json(res);
}

export async function calculate() {
  const res = await fetch(`${BASE}/calculate`, {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 400) {
    const body = await _json(res).catch(() => ({}));
    throw new Error(body.detail || "Watchlist is empty");
  }
  if (res.status === 409) {
    throw new Error("A calculate is already in progress");
  }
  if (!res.ok) {
    const body = await _json(res).catch(() => ({}));
    throw new Error(body.detail || `Calculate failed: ${res.status}`);
  }
  return _json(res);
}

export async function putWatchlist(watchlist) {
  const res = await fetch(`${BASE}/watchlist`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(watchlist),
  });
  if (!res.ok) throw new Error(`PUT watchlist failed: ${res.status}`);
  return _json(res);
}

export async function putScanner(enabled) {
  const res = await fetch(`${BASE}/scanner`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`PUT scanner failed: ${res.status}`);
  return _json(res);
}
