// version: v1
//
// REST client for /api/chart-templates. Relative URLs (resolves against the
// page host — the Electron shell loads the renderer from the backend, so
// "/api/..." is the right base; do not hardcode localhost/port).
//
// A "chart template" is a named full-chart-config snapshot:
//   { sourceTicker: string, config: {<full chart config>}, savedAt: ISO string }
// The API returns/accepts a dict keyed by template name.

const BASE = "/api/chart-templates";

/** Returns { [name]: { sourceTicker, config, savedAt } } — {} on error. */
export async function listTemplates() {
  try {
    const r = await fetch(BASE);
    if (!r.ok) return {};
    const data = await r.json();
    return (data && typeof data === "object") ? data : {};
  } catch {
    return {};
  }
}

/**
 * Create or replace a template. Returns the updated templates dict, or
 * throws on a non-OK response (caller surfaces the error).
 */
export async function saveTemplate(name, config, sourceTicker) {
  const body = { sourceTicker: sourceTicker || null, config: config || {}, savedAt: new Date().toISOString() };
  const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `${r.status}`;
    try { const e = await r.json(); detail = e.detail || detail; } catch {}
    throw new Error(`Save failed: ${detail}`);
  }
  return r.json();
}

/** Delete a template. Returns the updated templates dict, or throws. */
export async function deleteTemplate(name) {
  const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!r.ok) {
    let detail = `${r.status}`;
    try { const e = await r.json(); detail = e.detail || detail; } catch {}
    throw new Error(`Delete failed: ${detail}`);
  }
  return r.json();
}
