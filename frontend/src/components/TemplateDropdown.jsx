// version: v2
//
// TemplateDropdown — the "TPL ▾" button in the chart toolbar (right after
// the TimeframeDropdown). Opens a small popup to save / load / delete named
// chart configurations ("XAUUSD swing", "XAUUSD scalp", ...).
//
// A template stores the full chart config + the ticker it was captured on.
// Loading onto the same ticker restores everything (incl. drawings); onto a
// different ticker, everything except the drawings (with a note).
//
// Spec: docs/specs/2026-05-11-per-tab-chart-state-and-templates-design.md (§4).

// v2 — Active-template indicator (2026-05-11). New `loadedTemplateName`
//      prop: the TPL button shows "TPL · <name>" when a template is the
//      active one for the chart; the popup's name input pre-fills with it
//      so SAVE overwrites that template. doLoad now passes the template's
//      name to onLoadTemplate. Spec: docs/specs/2026-05-11-active-template-indicator-design.md.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { C, mono } from "./chart_constants";
import { listTemplates, saveTemplate, deleteTemplate } from "./chartTemplatesApi";

export default function TemplateDropdown({
  currentTicker,        // string — the chart's current ticker (sourceTicker on save + the mismatch note on load)
  getCurrentConfig,     // () => <chart config bundle minus scrollPos/toolbarCollapsed>
  onLoadTemplate,       // (template, tplName) => void — MainChart applies template.config (+ drawings if sourceTicker matches)
  loadedTemplateName,   // string | null — the template currently "active" on this chart
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState({});   // { name: { sourceTicker, config, savedAt } }
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);           // transient info note (e.g. "drawings skipped")
  const wrapperRef = useRef(null);

  const refresh = useCallback(async () => {
    const t = await listTemplates();
    setTemplates(t || {});
  }, []);

  // Fetch on open; pre-fill name with the active template so SAVE overwrites it.
  useEffect(() => {
    if (open) {
      setError(null);
      setNote(null);
      setName(loadedTemplateName || "");
      refresh();
    }
  }, [open, refresh, loadedTemplateName]);

  // Click-outside + ESC close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Transient note auto-clear.
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(id);
  }, [note]);

  const doSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name cannot be empty"); return; }
    if (templates[trimmed] && !window.confirm(`Overwrite template "${trimmed}"?`)) return;
    setBusy(true); setError(null);
    try {
      const cfg = typeof getCurrentConfig === "function" ? getCurrentConfig() : {};
      const updated = await saveTemplate(trimmed, cfg, currentTicker || null);
      setTemplates(updated || {});
      setName("");
      setNote(`Saved "${trimmed}"`);
    } catch (e) {
      setError(e && e.message ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const doLoad = (tplName) => {
    const tpl = templates[tplName];
    if (!tpl) return;
    onLoadTemplate?.(tpl, tplName);
    if (tpl.sourceTicker && currentTicker && tpl.sourceTicker !== currentTicker) {
      setNote(`Loaded "${tplName}" — drawings skipped (made on ${tpl.sourceTicker})`);
    } else {
      setNote(`Loaded "${tplName}"`);
    }
    setOpen(false);
  };

  const doDelete = async (tplName) => {
    if (!window.confirm(`Delete template "${tplName}"?`)) return;
    setBusy(true); setError(null);
    try {
      const updated = await deleteTemplate(tplName);
      setTemplates(updated || {});
    } catch (e) {
      setError(e && e.message ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const names = Object.keys(templates).sort((a, b) => a.localeCompare(b));

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? "Close templates" : "Chart templates — save / load / delete"}
        style={{
          background: open ? `${C.orange}25` : "transparent",
          color: open ? C.orange : C.white,
          border: `1px solid ${open ? C.orange + "70" : C.borderLt}`,
          padding: "3px 10px", cursor: "pointer",
          fontSize: "13px", fontWeight: 700, fontFamily: mono,
          borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 5,
        }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
          {loadedTemplateName ? `TPL · ${loadedTemplateName}` : "TPL"}
        </span>
        <span style={{ fontSize: "9px", opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }}>▾</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0,
            zIndex: 1000, minWidth: 280, padding: "10px 12px",
            background: C.bgPanel, border: `1px solid ${C.border}`,
            borderRadius: 3, boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
            fontFamily: mono, color: C.white,
          }}
        >
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.6px", marginBottom: 6 }}>CHART TEMPLATES</div>

          {/* Save row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSave(); }}
              placeholder={`name${currentTicker ? " (e.g. " + currentTicker + " swing)" : ""}`}
              disabled={busy}
              style={{
                flex: 1, background: C.bg, color: C.white,
                border: `1px solid ${C.borderLt}`, padding: "3px 6px",
                fontSize: "11px", fontFamily: mono, outline: "none", borderRadius: 2,
              }}
            />
            <button
              onClick={doSave}
              disabled={busy || !name.trim()}
              style={{
                background: (busy || !name.trim()) ? "transparent" : C.orange,
                color: (busy || !name.trim()) ? C.muted : C.bg,
                border: (busy || !name.trim()) ? `1px solid ${C.border}` : "none",
                padding: "3px 12px", cursor: (busy || !name.trim()) ? "not-allowed" : "pointer",
                fontSize: "11px", fontWeight: 800, fontFamily: mono, borderRadius: 2,
              }}
            >SAVE</button>
          </div>

          <div style={{ height: 1, background: C.border, margin: "6px 0" }} />

          {/* Template list */}
          {names.length === 0 ? (
            <div style={{ fontSize: "10px", color: C.muted, padding: "6px 2px" }}>no templates yet</div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {names.map(n => {
                const tpl = templates[n] || {};
                const src = tpl.sourceTicker || "";
                const sameTicker = src && currentTicker && src === currentTicker;
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                    <span style={{ flex: 1, fontSize: "11px", color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</span>
                    {src && (
                      <span style={{
                        fontSize: "8px", color: sameTicker ? C.green : C.muted,
                        border: `1px solid ${sameTicker ? C.green + "60" : C.borderLt}`,
                        borderRadius: 2, padding: "0 4px", flexShrink: 0,
                      }}>{src}</span>
                    )}
                    <button
                      onClick={() => doLoad(n)}
                      disabled={busy}
                      style={{
                        background: "transparent", color: C.cyan,
                        border: `1px solid ${C.cyan}50`, borderRadius: 2,
                        padding: "1px 7px", cursor: busy ? "not-allowed" : "pointer",
                        fontSize: "9px", fontWeight: 700, fontFamily: mono, flexShrink: 0,
                      }}
                    >load</button>
                    <button
                      onClick={() => doDelete(n)}
                      disabled={busy}
                      title="Delete"
                      style={{
                        background: "transparent", color: C.red,
                        border: `1px solid ${C.red}40`, borderRadius: 2,
                        padding: "1px 6px", cursor: busy ? "not-allowed" : "pointer",
                        fontSize: "10px", fontWeight: 800, fontFamily: mono, flexShrink: 0,
                      }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}

          {error && <div style={{ fontSize: "9px", color: C.red, marginTop: 6 }}>{error}</div>}
          {note && <div style={{ fontSize: "9px", color: "#ffc107", marginTop: 6 }}>{note}</div>}

          <div style={{ fontSize: "8px", color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
            SAVE captures this chart's full config + ticker. Loading a template made on a different ticker applies everything except the drawings.
          </div>
        </div>
      )}
    </div>
  );
}
