// version: v1
// ReplayConfigPopup.jsx — Modal popup for the Replay tab. Form fields,
//   validation, localStorage rehydrate. Calls onApply(config) / onCancel().
//
// Layout:
//   - Required: Ticker (searchable combobox), Timeframe, Period
//   - Layers (all OFF by default): Weekly, Monthly, Quarterly (+ 8 sub),
//     Bands, Regime (+ 3 sub: top_bar, bg_shading, candle_color)
//   - Footer: Cancel | Apply (disabled until isConfigApplyable)

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_CONFIG, loadStoredConfig, saveConfig,
  validateAgainstAssets, isConfigApplyable,
} from "./replay/replayConfigStore";

const C = {
  bg: "#0a0a0a", border: "#222", borderLt: "#333",
  white: "#fff", gray: "#999", muted: "#666",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b", cyan: "#00d2d3",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const TIMEFRAMES = ["M5", "M15", "H1", "H4"];
const PERIODS    = ["3M", "6M", "12M", "18M"];

function tickerListFromAssets(assets) {
  if (!assets) return [];
  if (assets instanceof Map) return Array.from(assets.keys()).sort();
  if (Array.isArray(assets)) return assets.map(a => a.ticker || a).filter(Boolean).sort();
  return Object.keys(assets).sort();
}

// Tiny searchable combobox (mirrors v25 TickerSearchSelect from ReplayView).
function TickerCombo({ value, list, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setQ("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(t => t.toLowerCase().includes(s));
  }, [q, list]);

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", textAlign: "left", padding: "6px 10px",
          background: "#000", color: value ? C.white : C.muted,
          border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11,
          letterSpacing: "1px", cursor: "pointer",
        }}>
        {value || "select ticker…"}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: C.bg, border: `1px solid ${C.borderLt}`,
          maxHeight: 280, overflowY: "auto", zIndex: 100,
          fontFamily: mono,
        }}>
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="search…"
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); setQ(""); }
              else if (e.key === "Enter" && filtered.length) {
                onChange(filtered[0]); setOpen(false); setQ("");
              }
            }}
            style={{
              width: "100%", padding: "6px 10px", background: "#000",
              color: C.white, border: "none", borderBottom: `1px solid ${C.border}`,
              fontFamily: mono, fontSize: 10, outline: "none",
            }}/>
          {filtered.length === 0 ? (
            <div style={{ padding: "10px", color: C.muted, fontSize: 10, textAlign: "center" }}>
              no match
            </div>
          ) : filtered.map(t => (
            <div key={t}
              onClick={() => { onChange(t); setOpen(false); setQ(""); }}
              style={{
                padding: "5px 10px", color: t === value ? C.orange : C.white,
                cursor: "pointer", fontSize: 10, letterSpacing: "1px",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#171717"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map(o => {
        const on = o === value;
        return (
          <button key={o} type="button"
            onClick={() => onChange(o)}
            style={{
              padding: "6px 12px", background: on ? C.orange : "transparent",
              color: on ? "#000" : C.white, border: `1px solid ${on ? C.orange : C.border}`,
              fontFamily: mono, fontSize: 10, letterSpacing: "1px",
              fontWeight: 700, cursor: "pointer",
            }}>{o}</button>
        );
      })}
    </div>
  );
}

function Check({ checked, onChange, label, indent = 0 }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 0", paddingLeft: indent,
      cursor: "pointer", userSelect: "none",
    }}>
      <input type="checkbox" checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: C.orange, margin: 0 }}/>
      <span style={{
        color: checked ? C.white : C.gray, fontSize: 10,
        fontFamily: mono, letterSpacing: "1px", fontWeight: 700,
      }}>{label}</span>
    </label>
  );
}

export default function ReplayConfigPopup({ assets, onApply, onCancel }) {
  const [config, setConfig] = useState(() => {
    const stored = validateAgainstAssets(loadStoredConfig(), assets);
    if (!stored) return EMPTY_CONFIG;
    // Validate tf/period against known sets — drop them if stored value is no
    // longer in the allowed list (e.g. v16 dropped D1; old configs would
    // otherwise rehydrate an unselectable Segmented value). Code-review
    // observation M2 from Task 1.
    return {
      ...stored,
      tf:     TIMEFRAMES.includes(stored.tf)     ? stored.tf     : "",
      period: PERIODS.includes(stored.period)    ? stored.period : "",
    };
  });

  const tickerList = useMemo(() => tickerListFromAssets(assets), [assets]);
  const applyable = isConfigApplyable(config);

  // I4: assets may arrive after the popup mounts (sync still loading).
  //   Re-validate the ticker when the asset universe changes; preserves
  //   ticker if it's still valid, clears it if it disappeared.
  useEffect(() => {
    if (!assets) return;
    setConfig(c => validateAgainstAssets(c, assets) || c);
  }, [assets]);

  // I1: Esc closes the modal. Mounted at popup-level so it works regardless
  //   of which child has focus.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Helpers — keep state mutations terse.
  const set    = (patch) => setConfig(c => ({ ...c, ...patch }));
  const setL   = (key, val) => setConfig(c => ({ ...c, layers: { ...c.layers, [key]: val } }));
  const setQ   = (key, val) => setConfig(c => ({
    ...c, layers: { ...c.layers, quarterly: { ...c.layers.quarterly, [key]: val } },
  }));
  const setR   = (key, val) => setConfig(c => ({
    ...c, layers: { ...c.layers, regime: { ...c.layers.regime, [key]: val } },
  }));

  const handleApply = () => {
    if (!applyable) return;
    saveConfig(config);
    onApply(config);
  };

  const Q = config.layers.quarterly;
  const R = config.layers.regime;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mk-replay-config-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, background: C.bg, border: `1px solid ${C.borderLt}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
          fontFamily: mono, color: C.white,
        }}>
        <div
          id="mk-replay-config-title"
          style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            color: C.orange, fontSize: 11, fontWeight: 800, letterSpacing: "2px",
          }}>REPLAY · CONFIGURATION</div>

        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Required */}
          <div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: "1.5px", marginBottom: 4 }}>TICKER</div>
            <TickerCombo value={config.ticker} list={tickerList}
              onChange={(t) => set({ ticker: t })}/>
          </div>
          <div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: "1.5px", marginBottom: 4 }}>TIMEFRAME</div>
            <Segmented options={TIMEFRAMES} value={config.tf} onChange={(v) => set({ tf: v })}/>
          </div>
          <div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: "1.5px", marginBottom: 4 }}>PERIOD</div>
            <Segmented options={PERIODS} value={config.period} onChange={(v) => set({ period: v })}/>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: "1.5px", marginBottom: 4 }}>LAYERS</div>
            <Check checked={config.layers.weekly}    onChange={(v) => setL("weekly",  v)} label="WEEKLY CONES"/>
            <Check checked={config.layers.monthly}   onChange={(v) => setL("monthly", v)} label="MONTHLY CONES"/>
            <Check checked={Q.enabled}               onChange={(v) => setQ("enabled", v)} label="QUARTERLY CONES"/>
            {Q.enabled && (
              <div style={{ paddingLeft: 24 }}>
                {[
                  ["q_curr",  "Q-CURR"],
                  ["q_prev1", "Q-1"], ["q_prev2", "Q-2"], ["q_prev3", "Q-3"],
                  ["q_prev4", "Q-4"], ["q_prev5", "Q-5"], ["q_prev6", "Q-6"],
                  ["q_prev7", "Q-7"],
                ].map(([k, label]) => (
                  <Check key={k} checked={Q[k]} onChange={(v) => setQ(k, v)} label={label}/>
                ))}
              </div>
            )}
            <Check checked={config.layers.bands}     onChange={(v) => setL("bands", v)} label="BANDS (MEAN)"/>
            <Check checked={R.enabled}               onChange={(v) => setR("enabled", v)} label="REGIME"/>
            {R.enabled && (
              <div style={{ paddingLeft: 24 }}>
                <Check checked={R.top_bar}      onChange={(v) => setR("top_bar", v)}      label="TOP REGIME BAR"/>
                <Check checked={R.bg_shading}   onChange={(v) => setR("bg_shading", v)}   label="BACKGROUND SHADING"/>
                <Check checked={R.candle_color} onChange={(v) => setR("candle_color", v)} label="CANDLE COLOR"/>
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: "10px 16px", borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button type="button" onClick={onCancel}
            style={{
              padding: "6px 16px", background: "transparent", color: C.gray,
              border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10,
              letterSpacing: "1px", fontWeight: 700, cursor: "pointer",
            }}>CANCEL</button>
          <button type="button" onClick={handleApply} disabled={!applyable}
            style={{
              padding: "6px 16px",
              background: applyable ? C.orange : "#333",
              color: applyable ? "#000" : C.muted,
              border: `1px solid ${applyable ? C.orange : C.border}`,
              fontFamily: mono, fontSize: 10, letterSpacing: "1px",
              fontWeight: 800, cursor: applyable ? "pointer" : "not-allowed",
            }}>APPLY</button>
        </div>
      </div>
    </div>
  );
}
