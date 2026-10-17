// version: v1
// chartPresetsApi.js — REST client for /api/chart-presets endpoints.
// Server-relative URLs (matches v2's existing fetch pattern).

const BASE = "/api/chart-presets";

async function _json(res) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Chart-presets API: expected JSON, got ${res.status} ${ct}`);
  }
  return res.json();
}

export async function fetchPresets() {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok) throw new Error(`GET /api/chart-presets failed: ${res.status}`);
  return _json(res);
}

export async function savePreset(name, style) {
  const url = `${BASE}/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(style),
  });
  if (res.status === 400) {
    const body = await _json(res).catch(() => ({}));
    throw new Error(body.detail || "Save rejected (validation)");
  }
  if (!res.ok) {
    const body = await _json(res).catch(() => ({}));
    throw new Error(body.detail || `Save failed: ${res.status}`);
  }
  return _json(res);
}

export async function deletePreset(name) {
  const url = `${BASE}/${encodeURIComponent(name)}`;
  const res = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    const body = await _json(res).catch(() => ({}));
    throw new Error(body.detail || `Delete failed: ${res.status}`);
  }
  return _json(res);
}
