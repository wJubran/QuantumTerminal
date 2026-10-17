// version: v1
// ChartSettingsModal.jsx — chart-style settings popup.
// Lives over the chart, dim backdrop, modal-style. All changes apply LIVE
// via onChange; the parent persists into tickerSettings + redraws the chart.
//
// Preset save/load talks to the backend through chartPresetsApi.

import React, { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CHART_STYLE, BACKGROUND_PRESETS, CHART_TYPES, LINE_STYLES, LINE_WIDTHS,
  withDefaults, normalizeHex,
} from "./chartStyleDefaults";
import * as presetsApi from "./chartPresetsApi";

const C = {
  bg:        "#0a0a0a",
  bgPanel:   "#111114",
  border:    "#222222",
  borderLt:  "#333333",
  white:     "#ffffff",
  gray:      "#999999",
  muted:     "#666666",
  dim:       "#444444",
  orange:    "#ff6d00",
  green:     "#2ebd59",
  red:       "#e8383b",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const RESERVED = new Set(["defaults", "default"]);

function SectionTitle({ children }) {
  return (
    <div style={{
      color: C.orange, fontSize: 9, letterSpacing: "2px",
      fontWeight: 800, textTransform: "uppercase",
      marginTop: 18, marginBottom: 8, fontFamily: mono,
    }}>{children}</div>
  );
}

function Btn({ active, onClick, children, disabled, danger }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        padding: "5px 10px", fontFamily: mono, fontSize: 10,
        letterSpacing: 1, textTransform: "uppercase",
        background: active ? C.orange : "transparent",
        color: active ? "#000" : (danger ? C.red : C.white),
        border: `1px solid ${active ? C.orange : (danger ? C.red : C.borderLt)}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}>{children}</button>
  );
}

function Swatch({ color, active, onClick, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 22, height: 22, padding: 0,
        background: color,
        border: `1px solid ${active ? C.orange : C.borderLt}`,
        outline: active ? `2px solid ${C.orange}40` : "none",
        cursor: "pointer",
      }} />
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
      <span style={{
        width: 110, color: C.gray, fontSize: 9, fontFamily: mono,
        letterSpacing: 1, textTransform: "uppercase",
      }}>{label}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function SeparatorBlock({ title, value, onChange }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, padding: "10px 12px",
      marginTop: 8, background: C.bgPanel,
    }}>
      <div style={{
        color: C.white, fontSize: 9, letterSpacing: 1.5,
        fontWeight: 700, textTransform: "uppercase",
        fontFamily: mono, marginBottom: 8,
      }}>{title}</div>

      <Field label="Show">
        <input type="checkbox" checked={!!value.show}
          onChange={(e) => onChange({ ...value, show: e.target.checked })} />
      </Field>

      <Field label="Color">
        <input type="color" value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
          style={{ width: 36, height: 22, border: `1px solid ${C.borderLt}`, padding: 0, background: "transparent" }} />
        <input type="text" value={value.color}
          onChange={(e) => {
            const n = normalizeHex(e.target.value);
            if (n) onChange({ ...value, color: n });
          }}
          style={{
            background: "#000", color: C.white, border: `1px solid ${C.border}`,
            padding: "3px 6px", fontFamily: mono, fontSize: 10, width: 90,
          }} />
      </Field>

      <Field label="Style">
        <div style={{ display: "flex", gap: 4 }}>
          {LINE_STYLES.map((s) => (
            <Btn key={s.id} active={value.style === s.id}
              onClick={() => onChange({ ...value, style: s.id })}>{s.label}</Btn>
          ))}
        </div>
      </Field>

      <Field label="Width">
        <div style={{ display: "flex", gap: 4 }}>
          {LINE_WIDTHS.map((w) => (
            <Btn key={w} active={value.width === w}
              onClick={() => onChange({ ...value, width: w })}>{w}px</Btn>
          ))}
        </div>
      </Field>
    </div>
  );
}

export default function ChartSettingsModal({
  open,
  initialStyle,
  onChange,
  onClose,
}) {
  const [style, setStyle] = useState(() => withDefaults(initialStyle));
  const [presets, setPresets] = useState({});
  const [presetError, setPresetError] = useState(null);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);

  // Load presets on mount
  useEffect(() => {
    if (!open) return;
    presetsApi.fetchPresets()
      .then((p) => setPresets(p || {}))
      .catch((e) => setPresetError(String(e.message || e)));
  }, [open]);

  // Reflect prop changes if the parent reloads style externally
  useEffect(() => {
    setStyle(withDefaults(initialStyle));
  }, [initialStyle]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const apply = (next) => { setStyle(next); onChange?.(next); };

  const handleResetDefaults = () => {
    apply(JSON.parse(JSON.stringify(DEFAULT_CHART_STYLE)));
  };

  const handleLoadPreset = (name) => {
    const p = presets[name];
    if (!p) return;
    apply(withDefaults(p));
  };

  const trimmedSaveName = saveName.trim();
  const saveDisabled =
    busy ||
    !trimmedSaveName ||
    trimmedSaveName.length > 60 ||
    RESERVED.has(trimmedSaveName.toLowerCase());

  const handleSave = async () => {
    if (saveDisabled) return;
    if (presets[trimmedSaveName] !== undefined) {
      // Overwrite confirm via window.confirm (simple, native — acceptable in Electron)
      const ok = window.confirm(`Overwrite preset "${trimmedSaveName}"?`);
      if (!ok) return;
    }
    setBusy(true);
    setPresetError(null);
    try {
      const newPresets = await presetsApi.savePreset(trimmedSaveName, style);
      setPresets(newPresets);
      setSaveName("");
    } catch (e) {
      setPresetError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePreset = async (name) => {
    const ok = window.confirm(`Delete preset "${name}"?`);
    if (!ok) return;
    setBusy(true);
    setPresetError(null);
    try {
      const newPresets = await presetsApi.deletePreset(name);
      setPresets(newPresets);
    } catch (e) {
      setPresetError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1500,
      }}>
      <div style={{
        width: 480, maxHeight: "92vh", overflowY: "auto",
        background: C.bg, border: `1px solid ${C.borderLt}`,
        boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
        padding: 18, fontFamily: mono,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 4,
        }}>
          <div style={{
            color: C.orange, fontSize: 12, fontWeight: 800,
            letterSpacing: 3, textTransform: "uppercase",
          }}>Chart Settings</div>
          <button onClick={() => onClose?.()} style={{
            background: "transparent", color: C.gray, border: "none",
            fontSize: 16, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        {/* Chart type */}
        <SectionTitle>Chart Type</SectionTitle>
        <div style={{ display: "flex", gap: 4 }}>
          {CHART_TYPES.map((t) => (
            <Btn key={t.id} active={style.chartType === t.id}
              onClick={() => apply({ ...style, chartType: t.id })}>{t.label}</Btn>
          ))}
        </div>

        {/* Background */}
        <SectionTitle>Background</SectionTitle>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {BACKGROUND_PRESETS.map((p) => (
            <Swatch key={p.color} color={p.color}
              active={style.background === p.color}
              onClick={() => apply({ ...style, background: p.color })}
              title={p.name} />
          ))}
          <span style={{ color: C.dim, fontSize: 9, marginLeft: 10 }}>Custom:</span>
          <input type="color" value={style.background}
            onChange={(e) => apply({ ...style, background: e.target.value })}
            style={{ width: 36, height: 22, border: `1px solid ${C.borderLt}`, padding: 0, background: "transparent" }} />
          <input type="text" value={style.background}
            onChange={(e) => {
              const n = normalizeHex(e.target.value);
              if (n) apply({ ...style, background: n });
            }}
            style={{
              background: "#000", color: C.white, border: `1px solid ${C.border}`,
              padding: "3px 6px", fontFamily: mono, fontSize: 10, width: 90,
            }} />
        </div>

        {/* Candle colors */}
        <SectionTitle>Candle Colors</SectionTitle>
        <Field label="Bullish">
          <input type="color" value={style.bullishColor}
            onChange={(e) => apply({ ...style, bullishColor: e.target.value })}
            style={{ width: 36, height: 22, border: `1px solid ${C.borderLt}`, padding: 0, background: "transparent" }} />
          <input type="text" value={style.bullishColor}
            onChange={(e) => {
              const n = normalizeHex(e.target.value);
              if (n) apply({ ...style, bullishColor: n });
            }}
            style={{
              background: "#000", color: C.white, border: `1px solid ${C.border}`,
              padding: "3px 6px", fontFamily: mono, fontSize: 10, width: 90,
            }} />
        </Field>
        <Field label="Bearish">
          <input type="color" value={style.bearishColor}
            onChange={(e) => apply({ ...style, bearishColor: e.target.value })}
            style={{ width: 36, height: 22, border: `1px solid ${C.borderLt}`, padding: 0, background: "transparent" }} />
          <input type="text" value={style.bearishColor}
            onChange={(e) => {
              const n = normalizeHex(e.target.value);
              if (n) apply({ ...style, bearishColor: n });
            }}
            style={{
              background: "#000", color: C.white, border: `1px solid ${C.border}`,
              padding: "3px 6px", fontFamily: mono, fontSize: 10, width: 90,
            }} />
        </Field>

        {/* Display toggles */}
        <SectionTitle>Display</SectionTitle>
        <Field label="Grid lines">
          <input type="checkbox" checked={!!style.gridLines}
            onChange={(e) => apply({ ...style, gridLines: e.target.checked })} />
        </Field>

        {/* Separator blocks */}
        <SeparatorBlock title="Market Close Separator"
          value={style.marketCloseSeparator}
          onChange={(v) => apply({ ...style, marketCloseSeparator: v })} />

        <SeparatorBlock title="RTH Separator"
          value={style.rthSeparator}
          onChange={(v) => apply({ ...style, rthSeparator: v })} />

        {/* Presets */}
        <div style={{ height: 1, background: C.border, margin: "18px 0 10px" }} />
        <SectionTitle>Presets</SectionTitle>

        {presetError && (
          <div style={{
            color: C.red, fontSize: 9, marginBottom: 6,
          }}>{presetError}</div>
        )}

        <Field label="Load">
          <select onChange={(e) => { if (e.target.value) handleLoadPreset(e.target.value); e.target.value = ""; }}
            disabled={Object.keys(presets).length === 0}
            style={{
              flex: 1, background: "#000", color: C.white,
              border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10,
              padding: "4px 6px",
            }}>
            <option value="">{Object.keys(presets).length === 0 ? "(no presets saved yet)" : "Pick a preset…"}</option>
            {Object.keys(presets).sort().map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>

        {Object.keys(presets).length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8,
            fontSize: 9,
          }}>
            {Object.keys(presets).sort().map((n) => (
              <span key={n} style={{
                padding: "2px 6px", border: `1px solid ${C.border}`,
                color: C.gray, display: "flex", gap: 4, alignItems: "center",
              }}>
                {n}
                <button onClick={() => handleDeletePreset(n)}
                  style={{
                    background: "transparent", color: C.red, border: "none",
                    cursor: "pointer", fontSize: 9, padding: 0,
                  }}>×</button>
              </span>
            ))}
          </div>
        )}

        <Field label="Save as">
          <input type="text" value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="preset name…"
            maxLength={60}
            style={{
              flex: 1, background: "#000", color: C.white,
              border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10,
              padding: "4px 6px",
            }} />
          <Btn onClick={handleSave} disabled={saveDisabled}>Save</Btn>
        </Field>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C.border}`,
        }}>
          <button onClick={handleResetDefaults}
            style={{
              background: "transparent", color: C.muted, border: "none",
              fontFamily: mono, fontSize: 9, letterSpacing: 1,
              textTransform: "uppercase", cursor: "pointer",
            }}>↺ Reset to defaults</button>
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </div>
    </div>
  );
}
