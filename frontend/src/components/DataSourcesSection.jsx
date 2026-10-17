// version: v1
/**
 * DataSourcesSection — Settings → DATA SOURCES
 * ════════════════════════════════════════════════
 * Pick where prices come from (MetaTrader 5, the simulator, Yahoo Finance,
 * Binance, OANDA, Alpaca, CSV files) and which account takes the orders
 * (the source itself when it can trade, else the paper account, which fills
 * at the source's live prices). Each source's fields come from the backend
 * (GET /api/providers → types[type].fields), so a new provider needs no UI
 * change.
 *
 * Secrets (API tokens) are never sent to the browser: they show as ••••••,
 * and leaving that value untouched keeps the stored one.
 * Switching, reconnecting or saving a running account re-creates the
 * providers, then the page reloads so every chart refetches its bars.
 */

import React, { useCallback, useEffect, useState } from "react";

const MASK = "••••••";
const EXEC = "__execution";        // results key of the execution-account block

export default function DataSourcesSection({ C, mono, labelStyle, inputStyle }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});        // id → {field: value}
  const [busy, setBusy] = useState(null);           // id being tested / saved / activated
  const [results, setResults] = useState({});       // id → {ok, message}
  const [openId, setOpenId] = useState(null);       // card whose settings are open

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/providers");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(`Could not load data sources: ${e.message}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const note = (id, ok, message) => setResults((p) => ({ ...p, [id]: { ok, message } }));

  const setField = (id, key, value) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));

  // Store the edited fields. True when there was nothing to save or it worked.
  const save = async (acc) => {
    const body = drafts[acc.id];
    if (!body) return true;
    setBusy(acc.id);
    try {
      const r = await fetch(`/api/providers/${acc.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setDrafts((prev) => { const n = { ...prev }; delete n[acc.id]; return n; });
      note(acc.id, true, "Saved");
      return true;
    } catch (e) {
      note(acc.id, false, `Save failed: ${e.message}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const test = async (acc) => {
    setBusy(acc.id);
    note(acc.id, null, "Testing…");
    try {
      const r = await fetch(`/api/providers/${acc.id}/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drafts[acc.id] || {}),
      });
      const d = await r.json();
      note(acc.id, !!d.ok, d.message || (d.ok ? "OK" : "Failed"));
    } catch (e) {
      note(acc.id, false, e.message);
    } finally {
      setBusy(null);
    }
  };

  // Make dataId the price source and execId the execution account (omitted:
  // the source itself if it trades, else the paper account), then reload.
  const activate = async (noteId, dataId, execId) => {
    setBusy(noteId);
    note(noteId, null, "Switching…");
    try {
      const r = await fetch("/api/providers/activate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataId, ...(execId ? { execution: execId } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      if (d.connected) {
        note(noteId, true, "Active — reloading the charts…");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        note(noteId, false, `Selected, but not connected: ${d.message || "check the settings"}`);
      }
    } catch (e) {
      note(noteId, false, e.message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async (acc) => {
    const balance = Number(acc.settings.initial_balance || 100000).toLocaleString();
    if (!window.confirm(`Reset the paper account?\n\nOpen positions, pending orders and the trade history are deleted, and the balance goes back to ${balance} USD.`)) return;
    setBusy(acc.id);
    try {
      const r = await fetch(`/api/providers/${acc.id}/reset`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      note(EXEC, true, d.message || "Reset");
    } catch (e) {
      note(EXEC, false, e.message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div style={{ fontSize: 9, color: C.red, fontFamily: mono, padding: 6 }}>{error}</div>;
  if (!data) return <div style={{ fontSize: 9, color: C.muted, fontFamily: mono, padding: 6 }}>Loading…</div>;

  const types = data.types || {};
  const sources = data.accounts.filter((a) => a.available && (types[a.type]?.data !== false));
  const executors = data.accounts.filter((a) => a.available && (types[a.type]?.execution));
  const execAcc = data.accounts.find((a) => a.id === data.active_execution);
  const running = (acc) => acc.id === data.active_data || acc.id === data.active_execution;

  // Saving an account that is running applies it at once (the providers are re-created).
  const saveAndApply = async (acc) => {
    if (await save(acc)) await activate(acc.id, data.active_data, data.active_execution);
  };

  const pill = (text, color) => (
    <span style={{ fontSize: 7, fontWeight: 800, color, border: `1px solid ${color}60`, padding: "1px 4px",
                   letterSpacing: "0.5px", marginLeft: 4, fontFamily: mono }}>{text}</span>
  );
  const btn = (color, disabled) => ({
    background: `${color}18`, border: `1px solid ${color}55`, color, fontFamily: mono, fontSize: 8,
    fontWeight: 800, letterSpacing: "0.5px", padding: "3px 8px", cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  });
  const resultLine = (res, fallback) => (res || fallback) ? (
    <div style={{
      marginTop: 5, fontSize: 8, fontFamily: mono,
      color: res ? (res.ok === null ? C.gray : res.ok ? C.green : C.red) : C.red,
    }}>
      {res ? res.message : fallback}
    </div>
  ) : null;

  const fieldsForm = (acc, fields, hint) => {
    const draft = { ...acc.settings, ...(drafts[acc.id] || {}) };
    const dirty = !!drafts[acc.id];
    return (
      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
        {fields.map((f) => (
          <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...labelStyle, minWidth: 130, fontSize: 8 }}>{f.label}</span>
            {f.type === "select" ? (
              <select value={draft[f.key] ?? ""} onChange={(e) => setField(acc.id, f.key, e.target.value)}
                      style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "3px 6px" }}>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"}
                value={draft[f.key] ?? ""}
                placeholder={f.type === "secret" && acc.settings[f.key] === MASK ? "saved — type to replace" : ""}
                onFocus={(e) => { if (f.type === "secret" && e.target.value === MASK) setField(acc.id, f.key, ""); }}
                onChange={(e) => setField(acc.id, f.key, f.type === "number" && e.target.value !== ""
                  ? Number(e.target.value) : e.target.value)}
                style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "3px 6px" }}
              />
            )}
          </label>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 7, color: C.muted, fontFamily: mono }}>{hint}</span>
          <button style={btn(C.green, !!busy || !dirty)} disabled={!!busy || !dirty}
                  onClick={() => (running(acc) ? saveAndApply(acc) : save(acc))}>
            {running(acc) ? "SAVE & APPLY" : "SAVE"}
          </button>
        </div>
      </div>
    );
  };

  const execFields = execAcc && execAcc.type === "paper" ? (types.paper?.fields || []) : [];

  return (
    <div>
      <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: 1.5, marginBottom: 8 }}>
        Prices for charts and analysis come from the <b style={{ color: C.white }}>data source</b>. Orders go to
        the <b style={{ color: C.white }}>execution account</b>: the source itself when it can trade (MetaTrader 5,
        OANDA), otherwise the paper account, which fills at the source's live prices.
        {data.forced_by_launcher && (
          <div style={{ color: C.yellow, marginTop: 4 }}>
            Started with --{data.forced_by_launcher === "sim" ? "sim" : `provider ${data.forced_by_launcher}`}: choosing a source here replaces it until the next start.
          </div>
        )}
      </div>

      {/* ── execution account ── */}
      <div style={{ border: `1px solid ${C.border}`, background: C.bgCard, padding: "7px 8px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...labelStyle, minWidth: 0 }}>ORDERS GO TO</span>
          <select
            value={data.active_execution || ""}
            disabled={!!busy}
            onChange={(e) => activate(EXEC, data.active_data, e.target.value)}
            style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "4px 6px" }}
          >
            {executors.map((a) => (
              <option key={a.id} value={a.id}>{a.label}{a.connected ? " ●" : ""}</option>
            ))}
          </select>
          {execAcc && (execAcc.type === "paper" || execAcc.type === "sim") && (
            <button style={btn(C.red, !!busy)} disabled={!!busy} onClick={() => reset(execAcc)}
                    title="Delete positions, orders and history; back to the starting balance">RESET</button>
          )}
        </div>
        {execFields.length > 0 && fieldsForm(execAcc, execFields, "The starting balance applies after a RESET.")}
        {resultLine(results[EXEC])}
        {execAcc && execAcc.id !== data.active_data && resultLine(results[execAcc.id])}
      </div>

      {/* ── one card per data source ── */}
      {sources.map((acc) => {
        const info = types[acc.type] || {};
        const active = acc.id === data.active_data;
        const fields = info.fields || [];
        const isOpen = openId === acc.id || (active && openId === null && fields.length > 0 && !acc.connected);
        return (
          <div key={acc.id} style={{
            border: `1px solid ${active ? C.orange : C.border}`, background: active ? `${C.orange}0c` : C.bgCard,
            padding: "7px 8px", marginBottom: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <div style={{ fontFamily: mono, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: active ? C.orange : C.white }}>{acc.label}</span>
                {active && pill(acc.connected ? "ACTIVE ●" : "ACTIVE ○", acc.connected ? C.green : C.red)}
                {info.realtime === false && pill("DELAYED", C.yellow)}
                {info.execution && pill("TRADES", C.cyan)}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {fields.length > 0 && (
                  <button style={btn(C.gray, false)} onClick={() => setOpenId(isOpen ? "" : acc.id)}>
                    {isOpen ? "CLOSE" : "SETTINGS"}
                  </button>
                )}
                <button style={btn(C.cyan, !!busy)} disabled={!!busy} onClick={() => test(acc)}>TEST</button>
                {active ? (
                  <button style={btn(C.orange, !!busy)} disabled={!!busy}
                          onClick={async () => { if (await save(acc)) activate(acc.id, acc.id, data.active_execution); }}>
                    RECONNECT
                  </button>
                ) : (
                  <button style={btn(C.orange, !!busy)} disabled={!!busy}
                          onClick={async () => { if (await save(acc)) activate(acc.id, acc.id); }}>
                    USE
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, marginTop: 3, lineHeight: 1.45 }}>
              {info.covers}
              {info.needs && <div style={{ color: C.muted }}>Needs: {info.needs}</div>}
            </div>
            {isOpen && fields.length > 0 && fieldsForm(acc, fields, "Kept on this computer only.")}
            {resultLine(results[acc.id], acc.last_error)}
          </div>
        );
      })}

      <div style={{ fontSize: 8, color: C.muted, fontFamily: mono, marginTop: 6, lineHeight: 1.5 }}>
        A ticker that the source doesn't carry stays empty. Map it under UNIVERSE → broker symbol (e.g. XAUUSD → GC=F on
        Yahoo, XAU_USD on OANDA). Step-by-step setup for every source: LEARN → Quantum Terminal → Data sources.
      </div>
    </div>
  );
}
