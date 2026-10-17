// version: v9
// v9 — ConeStyleEditor adds "HIDE GBM" and "HIDE MJD" checkboxes per group
//      (2026-05-12). Stored in coneStyles[group].hide_gbm / hide_mjd; rides
//      the existing onUpdate(group, {...}) pattern. MainChart v110 reads
//      these in the cone-key filter to skip the matching model's keys, and
//      suppresses the FILL_GROUPS fill when either is set. Spec:
//      docs/specs/2026-05-12-daily-cones-and-per-model-hide-design.md.
// v8 — BandsDropdown gains a `stale` prop (2026-05-08). When true, the
//      BANDS button + caret render in red instead of orange so the user
//      sees at a glance that the bands JSON predates the last market
//      close. Staleness is computed in MainChart from bandsD._last_modified.
//   v6 — ConeStyleEditor adds a COLOR FILL toggle. When on, MainChart
//        paints a filled band between the GBM and MJD lines at each SD
//        level for that group (sd1_high↔sd1_high, sd1_low↔sd1_low, sd2,
//        sd3) — visualizes model disagreement at each deviation. The
//        actual rendering is in MainChart's coneFillOverlay (SVG, same
//        style as the heat overlay). Currently scoped to the "now"
//        group as a test; widen by removing the group-key gate later.
//   v5 — ConeStyleEditor exposes GBM and MJD as separate color pickers
//        (single COLOR replaced by GBM COLOR + MJD COLOR). Schema for
//        coneStyles[group] gains `color_gbm` + `color_mjd`; legacy `color`
//        kept as a read-side fallback so saved settings don't break.
//        Width and opacity remain shared across both models.
/**
 * ChartToolbar.jsx — Toolbar dropdown components for the MainChart.
 * Quantum Terminal
 *
 * Extracted from MainChart.jsx during Phase 3D modularization.
 * Pure UI components — no chart ref dependencies.
 *
 * v2 — Dropdown label + arrow buttons enlarged ~1.5x and brightened for
 *      readability (fontSize 7→11px, padding 1px 5px → 2px 9px). Inactive
 *      labels now white instead of muted so they read clearly on the dark
 *      toolbar.
 *
 * v3 — BandsDropdown caught up to the v2 sizing pass (was using its own
 *      btnBase, missed in v2). Added a MICRO toggle inside the bands
 *      submenu — wired to a new prop pair (microOn, onToggleMicro) that
 *      MainChart binds to its own scalp-bands fetch + render pipeline.
 */
import { useState, useEffect, useRef } from "react";
import { C, mono, CALC_PARAM_DEFS, DEFAULT_CALC_PARAMS, CALC_MODULES, groupSlots, slotLabel } from "./chart_constants";

// ════════════════════════════════════════════════════════
// DROPDOWN — enhanced with optional gear icon per row
// ════════════════════════════════════════════════════════
export function Dropdown({ label, anyOn, groups, state, onToggle, onAll, onGear, slotVis, onToggleSlot, disabled = false, disabledTitle = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if(!open) return; const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, [open]);
  const sv = slotVis || {};
  const slotOn = (s) => sv[s] !== false; // unknown slots are on
  // v4: disabled mode — greyed-out, unclickable, with a tooltip.
  if (disabled) {
    return (
      <div ref={ref} title={disabledTitle} style={{ position:"relative", display:"inline-block" }}>
        <div style={{ display:"flex" }}>
          <button disabled style={{
            background:"transparent", color:C.muted,
            border:`1px solid ${C.border}`, borderRight:"none",
            padding:"2px 9px", cursor:"not-allowed",
            fontSize:"11px", fontWeight:700, fontFamily:mono,
            borderRadius:"2px 0 0 2px", opacity:0.45,
          }}>{label}</button>
          <button disabled style={{
            background:"transparent", color:C.muted,
            border:`1px solid ${C.border}`,
            padding:"2px 5px", cursor:"not-allowed",
            fontSize:"11px", fontWeight:700, fontFamily:mono,
            borderRadius:"0 2px 2px 0", opacity:0.45,
          }}>▾</button>
        </div>
      </div>
    );
  }
  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block" }}>
      <div style={{ display:"flex" }}>
        <button onClick={onAll} style={{ background:anyOn?`${C.orange}20`:"transparent", color:anyOn?C.orange:C.white, border:`1px solid ${anyOn?C.orange+"50":C.borderLt}`, borderRight:"none", padding:"2px 9px", cursor:"pointer", fontSize:"11px", fontWeight:700, fontFamily:mono, borderRadius:"2px 0 0 2px" }}>{label}</button>
        <button onClick={()=>setOpen(!open)} style={{ background:open?`${C.orange}30`:anyOn?`${C.orange}20`:"transparent", color:anyOn?C.orange:C.white, border:`1px solid ${anyOn?C.orange+"50":C.borderLt}`, padding:"2px 5px", cursor:"pointer", fontSize:"11px", fontWeight:700, fontFamily:mono, borderRadius:"0 2px 2px 0" }}>{open?"\u25B4":"\u25BE"}</button>
      </div>
      {open && <div style={{ position:"absolute", top:"100%", left:0, zIndex:100, background:C.bgCard, border:`1px solid ${C.borderLt}`, padding:"4px 0", minWidth:160, marginTop:2, boxShadow:"0 4px 12px rgba(0,0,0,0.6)" }}>
        {Object.entries(groups).map(([k,g])=>{
          const slots = onToggleSlot ? groupSlots(g) : [];
          const showSubs = slots.length > 1; // single-slot groups don't need sub-toggles
          const groupOn = !!state[k];
          return (
            <div key={k} style={{ width:"100%" }}>
              <div style={{ display:"flex", alignItems:"center", width:"100%", padding:"0 4px 0 0" }}>
                <button onClick={()=>onToggle(k)} style={{ display:"flex", alignItems:"center", gap:6, flex:1, background:"transparent", border:"none", padding:"4px 10px", cursor:"pointer", color:groupOn?g.color:C.muted, fontSize:"9px", fontFamily:mono, fontWeight:600 }}>
                  <span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:groupOn?g.color:"transparent", border:`1px solid ${groupOn?g.color:C.muted}` }} />{g.label}
                </button>
                {onGear && <button onClick={(e)=>{e.stopPropagation();onGear(k);}} style={{ background:"transparent", border:"none", cursor:"pointer", color:C.muted, fontSize:"9px", padding:"2px 4px" }} title="Style settings">⚙</button>}
              </div>
              {showSubs && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:2, padding:"2px 8px 4px 22px", opacity: groupOn ? 1 : 0.35, pointerEvents: groupOn ? "auto" : "none" }}>
                  {slots.map(s => {
                    const on = slotOn(s);
                    return (
                      <button key={s} onClick={(e)=>{e.stopPropagation(); onToggleSlot(s);}}
                        style={{
                          display:"flex", alignItems:"center", gap:4,
                          background: on ? `${g.color}18` : "transparent",
                          border:`1px solid ${on ? g.color+"60" : C.border}`,
                          color: on ? g.color : C.muted,
                          padding:"1px 5px", cursor:"pointer",
                          fontSize:"7px", fontFamily:mono, fontWeight:700,
                          borderRadius:2,
                        }}>
                        <span style={{ display:"inline-block", width:6, height:6, borderRadius:1, background: on ? g.color : "transparent", border:`1px solid ${on ? g.color : C.muted}` }} />
                        {slotLabel(s)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>);
}

// ════════════════════════════════════════════════════════
// CONE STYLE EDITOR — inline popup for color/width/opacity
// ════════════════════════════════════════════════════════
export function ConeStyleEditor({ group, groupData, coneStyles, onUpdate, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const h=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, [onClose]);

  const current = coneStyles[group] || {};
  const defaultColor = groupData.color;
  // v5: per-model colors. Legacy `color` (single value) is read as the
  //   GBM fallback so existing saved settings still apply to GBM. MJD
  //   falls back to the intrinsic per-key color from chart_constants
  //   (groupData.color_mjd if present, else groupData.color).
  const colorGbm = current.color_gbm || current.color || defaultColor;
  const colorMjd = current.color_mjd || groupData.color_mjd || defaultColor;
  const width = current.width ?? 2;
  const opacity = current.opacity ?? 1.0;
  const colorFill = current.colorFill === true;  // v6: fill between models

  const update = (field, value) => {
    onUpdate(group, { ...current, [field]: value });
  };

  return (
    <div ref={ref} style={{ position:"absolute", top:"100%", left:0, zIndex:200, background:C.bgCard, border:`1px solid ${C.borderLt}`, padding:"8px 10px", minWidth:200, marginTop:2, boxShadow:"0 4px 16px rgba(0,0,0,0.8)" }}>
      <div style={{ fontSize:"8px", fontWeight:700, color:C.orange, letterSpacing:"1.5px", marginBottom:6, fontFamily:mono }}>
        {groupData.label} STYLE
      </div>
      {/* GBM Color */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:"8px", color:C.muted, fontFamily:mono }}>GBM COLOR</span>
        <input type="color" value={colorGbm} onChange={(e)=>update("color_gbm",e.target.value)}
          style={{ width:24, height:16, border:`1px solid ${C.border}`, background:"transparent", cursor:"pointer", padding:0 }} />
      </div>
      {/* v9: per-group model hide — checked = skip all gbm_* keys in this group */}
      <label style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:4, cursor:"pointer", userSelect:"none", padding:"3px 0",
      }}>
        <span style={{ fontSize:"8px", color:current.hide_gbm?C.orange:C.muted, fontFamily:mono, fontWeight:current.hide_gbm?800:400, letterSpacing:"0.5px" }}>
          HIDE GBM
        </span>
        <input
          type="checkbox"
          checked={!!current.hide_gbm}
          onChange={(e)=>update("hide_gbm", e.target.checked)}
          style={{ accentColor:C.orange, cursor:"pointer", margin:0 }}
        />
      </label>
      {/* MJD Color */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:"8px", color:C.muted, fontFamily:mono }}>MJD COLOR</span>
        <input type="color" value={colorMjd} onChange={(e)=>update("color_mjd",e.target.value)}
          style={{ width:24, height:16, border:`1px solid ${C.border}`, background:"transparent", cursor:"pointer", padding:0 }} />
      </div>
      {/* v9: per-group model hide — checked = skip all mjd_* keys in this group */}
      <label style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:4, cursor:"pointer", userSelect:"none", padding:"3px 0",
      }}>
        <span style={{ fontSize:"8px", color:current.hide_mjd?C.orange:C.muted, fontFamily:mono, fontWeight:current.hide_mjd?800:400, letterSpacing:"0.5px" }}>
          HIDE MJD
        </span>
        <input
          type="checkbox"
          checked={!!current.hide_mjd}
          onChange={(e)=>update("hide_mjd", e.target.checked)}
          style={{ accentColor:C.orange, cursor:"pointer", margin:0 }}
        />
      </label>
      {/* Width */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:"8px", color:C.muted, fontFamily:mono }}>WIDTH</span>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <input type="range" min={1} max={5} step={1} value={width} onChange={(e)=>update("width",parseInt(e.target.value))}
            style={{ width:60, accentColor:C.orange }} />
          <span style={{ fontSize:"8px", color:C.white, fontFamily:mono, width:12, textAlign:"right" }}>{width}</span>
        </div>
      </div>
      {/* Opacity */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:"8px", color:C.muted, fontFamily:mono }}>OPACITY</span>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <input type="range" min={0.1} max={1.0} step={0.1} value={opacity} onChange={(e)=>update("opacity",parseFloat(e.target.value))}
            style={{ width:60, accentColor:C.orange }} />
          <span style={{ fontSize:"8px", color:C.white, fontFamily:mono, width:24, textAlign:"right" }}>{(opacity*100).toFixed(0)}%</span>
        </div>
      </div>
      {/* v6: Color Fill toggle — fills the band between GBM and MJD
              lines at each SD level (sd1, sd2, sd3 high + low). */}
      <label style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginTop:6, marginBottom:4, cursor:"pointer", userSelect:"none",
        padding:"3px 0",
      }}>
        <span style={{ fontSize:"8px", color:colorFill?C.orange:C.muted, fontFamily:mono, fontWeight:colorFill?800:400, letterSpacing:"0.5px" }}>
          COLOR FILL
        </span>
        <input
          type="checkbox"
          checked={colorFill}
          onChange={(e)=>update("colorFill", e.target.checked)}
          style={{ accentColor:C.orange, cursor:"pointer", margin:0 }}
        />
      </label>
      {/* Reset */}
      <button onClick={()=>{onUpdate(group,{});onClose();}} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, fontSize:"7px", fontFamily:mono, padding:"2px 6px", cursor:"pointer", marginTop:4, width:"100%" }}>RESET TO DEFAULT</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// INDICATORS — Menu definition + dropdown with submenus
// ════════════════════════════════════════════════════════
export const INDICATOR_MENU = [
  { type: "submenu", label: "VOLUME", items: [
    { key: "volume_bar", label: "Volume Bar", settings: [
      { id: "color_up", label: "Up Color", type: "color", default: "#2ebd59" },
      { id: "color_down", label: "Down Color", type: "color", default: "#e8383b" },
      { id: "opacity", label: "Opacity", type: "range", min: 0.02, max: 0.3, step: 0.02, default: 0.08 },
    ]},
    { key: "daily_vp", label: "Daily VP", settings: [
      { id: "color", label: "Color", type: "color", default: "#3796ff" },
      { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.1, default: 0.3 },
      { id: "bins", label: "Bins", type: "number", min: 10, max: 100, step: 5, default: 30 },
    ]},
  ]},
  { type: "submenu", label: "STOCHASTICS", items: [
    { key: "rsi", label: "RSI (14)", settings: [
      { id: "period", label: "Period", type: "number", min: 2, max: 50, step: 1, default: 14 },
      { id: "color", label: "Color", type: "color", default: "#ff6d00" },
      { id: "width", label: "Width", type: "range", min: 1, max: 4, step: 1, default: 1 },
      { id: "overbought", label: "OB Level", type: "number", min: 60, max: 90, step: 5, default: 70 },
      { id: "oversold", label: "OS Level", type: "number", min: 10, max: 40, step: 5, default: 30 },
    ]},
    { key: "atr", label: "ATR (14)", settings: [
      { id: "period", label: "Period", type: "number", min: 2, max: 50, step: 1, default: 14 },
      { id: "color", label: "Color", type: "color", default: "#00d2d3" },
      { id: "width", label: "Width", type: "range", min: 1, max: 4, step: 1, default: 1 },
    ]},
  ]},
  { type: "submenu", label: "AVERAGES", items: [
    { key: "ema_bands", label: "EMA Bands", settings: [
      { id: "period_fast", label: "Fast EMA", type: "number", min: 5, max: 100, step: 1, default: 9 },
      { id: "period_slow", label: "Slow EMA", type: "number", min: 10, max: 200, step: 1, default: 21 },
      { id: "color", label: "Color", type: "color", default: "#3796ff" },
      { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.1, default: 0.6 },
    ]},
    { key: "vwap", label: "VWAP", settings: [
      { id: "color", label: "Color", type: "color", default: "#9b59b6" },
      { id: "width", label: "Width", type: "range", min: 1, max: 5, step: 1, default: 2 },
      { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.1, default: 0.8 },
    ]},
  ]},
  { type: "separator" },
  { type: "submenu", label: "ORDERS", items: [
    { key: "show_positions", label: "Current Positions" },
    { key: "show_trade_history", label: "Trade History", settings: [
      { id: "buy_color", label: "Buy Color", type: "color", default: "#2ebd59" },
      { id: "sell_color", label: "Sell Color", type: "color", default: "#e8383b" },
      { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1.0, step: 0.1, default: 0.7 },
    ]},
  ]},
  { type: "separator" },
  { type: "action", label: "IMPORT...", action: "import" },
];

// Build default indicator settings from menu definition
export const DEFAULT_INDICATOR_SETTINGS = {};
INDICATOR_MENU.forEach(item => {
  if (item.type === "submenu") {
    item.items.forEach(si => {
      if (si.settings) {
        const d = {};
        si.settings.forEach(s => { d[s.id] = s.default; });
        DEFAULT_INDICATOR_SETTINGS[si.key] = d;
      }
    });
  }
});

// ── Indicator Settings Editor popup ──
function IndicatorSettingsEditor({ indicatorKey, settingsDef, currentValues, onUpdate, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const h=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, [onClose]);

  const vals = currentValues || {};
  const update = (id, value) => {
    onUpdate(indicatorKey, { ...vals, [id]: value });
  };

  return (
    <div ref={ref} style={{ position:"absolute", top:0, right:"100%", zIndex:202, background:C.bgCard, border:`1px solid ${C.borderLt}`, padding:"8px 10px", minWidth:170, boxShadow:"0 4px 16px rgba(0,0,0,0.8)", marginRight:2 }}>
      <div style={{ fontSize:"8px", fontWeight:700, color:C.orange, letterSpacing:"1.5px", marginBottom:6, fontFamily:mono }}>
        {indicatorKey.replace(/_/g," ").toUpperCase()}
      </div>
      {settingsDef.map(s => (
        <div key={s.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ fontSize:"8px", color:C.muted, fontFamily:mono }}>{s.label.toUpperCase()}</span>
          {s.type === "color" && (
            <input type="color" value={vals[s.id] || s.default} onChange={(e)=>update(s.id, e.target.value)}
              style={{ width:24, height:16, border:`1px solid ${C.border}`, background:"transparent", cursor:"pointer", padding:0 }} />
          )}
          {s.type === "number" && (
            <input type="number" min={s.min} max={s.max} step={s.step} value={vals[s.id] ?? s.default}
              onChange={(e)=>update(s.id, parseFloat(e.target.value) || s.default)}
              style={{ width:44, background:C.bgPanel, border:`1px solid ${C.border}`, color:C.white, fontSize:"9px", fontFamily:mono, textAlign:"right", padding:"1px 4px" }} />
          )}
          {s.type === "range" && (
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <input type="range" min={s.min} max={s.max} step={s.step} value={vals[s.id] ?? s.default}
                onChange={(e)=>update(s.id, parseFloat(e.target.value))}
                style={{ width:50, accentColor:C.orange }} />
              <span style={{ fontSize:"8px", color:C.white, fontFamily:mono, width:22, textAlign:"right" }}>
                {s.max <= 1 ? `${((vals[s.id] ?? s.default)*100).toFixed(0)}%` : (vals[s.id] ?? s.default)}
              </span>
            </div>
          )}
        </div>
      ))}
      <button onClick={()=>{onUpdate(indicatorKey, null);onClose();}}
        style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, fontSize:"7px", fontFamily:mono, padding:"2px 6px", cursor:"pointer", marginTop:4, width:"100%" }}>
        RESET TO DEFAULT
      </button>
    </div>
  );
}

export function IndicatorsDropdown({ indicators, onToggle, onImport, indicatorStyles, onUpdateStyle }) {
  const [open, setOpen] = useState(false);
  const [hoveredSub, setHoveredSub] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const ref = useRef(null);
  useEffect(() => { if(!open) return; const h=e=>{if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setHoveredSub(null);setEditingKey(null);}}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, [open]);

  const anyOn = Object.values(indicators).some(v => v);

  const findSettingsDef = (key) => {
    for (const item of INDICATOR_MENU) {
      if (item.type === "submenu") {
        const found = item.items.find(si => si.key === key);
        if (found?.settings) return found.settings;
      }
    }
    return null;
  };

  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block" }}>
      <div style={{ display:"flex" }}>
        <button onClick={()=>{setOpen(!open);setHoveredSub(null);setEditingKey(null);}} style={{
          background: anyOn ? `${C.orange}20` : "transparent",
          color: anyOn ? C.orange : C.muted,
          border: `1px solid ${anyOn ? C.orange+"50" : C.border}`,
          padding: "1px 6px", cursor: "pointer", fontSize: "7px",
          fontWeight: 700, fontFamily: mono, borderRadius: 2,
        }}>
          INDICATORS {open ? "\u25B4" : "\u25BE"}
        </button>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", right:0, zIndex:100, background:C.bgCard, border:`1px solid ${C.borderLt}`, padding:"4px 0", minWidth:130, marginTop:2, boxShadow:"0 4px 12px rgba(0,0,0,0.6)" }}>
          {INDICATOR_MENU.map((item, i) => {
            if (item.type === "separator") {
              return <div key={i} style={{ height:1, background:C.border, margin:"4px 8px" }} />;
            }
            if (item.type === "action") {
              return (
                <button key={i} onClick={()=>{onImport();setOpen(false);}} style={{
                  display:"flex", alignItems:"center", gap:6, width:"100%",
                  background:"transparent", border:"none", padding:"4px 10px",
                  cursor:"pointer", color:C.muted, fontSize:"9px", fontFamily:mono, fontWeight:600,
                }}>
                  {item.label}
                </button>
              );
            }
            // Submenu
            const isHovered = hoveredSub === i;
            const subAnyOn = item.items.some(si => indicators[si.key]);
            return (
              <div key={i} style={{ position:"relative" }}
                onMouseEnter={()=>setHoveredSub(i)} onMouseLeave={()=>{if(!editingKey)setHoveredSub(null);}}>
                <div style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"4px 10px", cursor:"default",
                  color: subAnyOn ? C.orange : C.muted,
                  fontSize:"9px", fontFamily:mono, fontWeight:600,
                  background: isHovered ? C.bgHover : "transparent",
                }}>
                  <span>{item.label}</span>
                  <span style={{ fontSize:"7px" }}>◂</span>
                </div>
                {isHovered && (
                  <div style={{
                    position:"absolute", top:0, right:"100%", zIndex:101,
                    background:C.bgCard, border:`1px solid ${C.borderLt}`,
                    padding:"4px 0", minWidth:140, boxShadow:"0 4px 12px rgba(0,0,0,0.6)",
                  }}>
                    {item.items.map(si => {
                      const hasCfg = !!si.settings;
                      return (
                        <div key={si.key} style={{ display:"flex", alignItems:"center", width:"100%", padding:"0 4px 0 0", position:"relative" }}>
                          <button onClick={()=>onToggle(si.key)} style={{
                            display:"flex", alignItems:"center", gap:6, flex:1,
                            background:"transparent", border:"none", padding:"4px 10px",
                            cursor:"pointer", color: indicators[si.key] ? C.green : C.muted,
                            fontSize:"9px", fontFamily:mono, fontWeight:600,
                          }}>
                            <span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:indicators[si.key]?C.green:"transparent", border:`1px solid ${indicators[si.key]?C.green:C.muted}` }} />
                            {si.label}
                          </button>
                          {hasCfg && (
                            <button onClick={(e)=>{e.stopPropagation();setEditingKey(editingKey===si.key?null:si.key);}}
                              style={{ background:"transparent", border:"none", cursor:"pointer", color:C.muted, fontSize:"9px", padding:"2px 4px" }} title="Settings">
                              ⚙
                            </button>
                          )}
                          {editingKey === si.key && si.settings && (
                            <IndicatorSettingsEditor
                              indicatorKey={si.key}
                              settingsDef={si.settings}
                              currentValues={indicatorStyles?.[si.key]}
                              onUpdate={onUpdateStyle}
                              onClose={()=>setEditingKey(null)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// CALCULATE SETTINGS DROPDOWN
// ════════════════════════════════════════════════════════
export function CalcSettingsDropdown({ calcParams, onUpdate, onCalc, onReset, calcing }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if(!open) return; const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, [open]);

  const handleChange = (key, value, def) => {
    const parsed = def.type === "float" ? parseFloat(value) : parseInt(value);
    if (!isNaN(parsed)) onUpdate({ ...calcParams, [key]: parsed });
  };

  const enabledModules = calcParams.modules || CALC_MODULES.map(m => m.key);
  const toggleModule = (key) => {
    const current = new Set(enabledModules);
    if (current.has(key)) { current.delete(key); } else { current.add(key); }
    if (current.size === 0) return;
    onUpdate({ ...calcParams, modules: [...current] });
  };
  const allModulesOn = enabledModules.length === CALC_MODULES.length;

  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block" }}>
      <div style={{ display:"flex" }}>
        <button onClick={()=>{if(!calcing)onCalc();}} disabled={calcing}
          style={{ background:calcing?C.bgHover:C.orange, color:calcing?C.orange:C.bg, border:"none",
            borderRight:calcing?"none":`1px solid ${C.bg}`, padding:"2px 8px", cursor:calcing?"wait":"pointer",
            fontSize:"8px", fontWeight:800, fontFamily:mono, opacity:calcing?0.7:1, borderRadius:"2px 0 0 2px" }}>
          {calcing?"CALCULATING...":"CALCULATE"}
        </button>
        <button onClick={()=>setOpen(!open)}
          style={{ background:calcing?C.bgHover:open?`${C.orange}cc`:C.orange, color:calcing?C.orange:C.bg,
            border:"none", padding:"2px 4px", cursor:"pointer", fontSize:"8px", fontWeight:800, fontFamily:mono,
            opacity:calcing?0.7:1, borderRadius:"0 2px 2px 0" }}>
          {open?"\u25B4":"\u25BE"}
        </button>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", right:0, zIndex:200, background:C.bgCard, border:`1px solid ${C.borderLt}`,
          padding:"10px 12px", minWidth:260, marginTop:2, boxShadow:"0 6px 20px rgba(0,0,0,0.8)", maxHeight:"70vh", overflowY:"auto" }}>

          {/* MODULE SELECTION */}
          <div style={{ fontSize:"8px", fontWeight:700, color:C.orange, letterSpacing:"1.5px", marginBottom:6, fontFamily:mono }}>
            MODULES TO RUN
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10 }}>
            {CALC_MODULES.map(m => {
              const on = enabledModules.includes(m.key);
              return (
                <button key={m.key} onClick={()=>toggleModule(m.key)} title={m.desc}
                  style={{ display:"flex", alignItems:"center", gap:4, background:on?`${m.color}18`:"transparent",
                    border:`1px solid ${on?m.color+"50":C.border}`, padding:"2px 6px", cursor:"pointer",
                    fontSize:"7.5px", fontWeight:700, fontFamily:mono, color:on?m.color:C.muted }}>
                  <span style={{ display:"inline-block", width:7, height:7, borderRadius:1,
                    background:on?m.color:"transparent", border:`1px solid ${on?m.color:C.muted}` }} />
                  {m.label}
                </button>
              );
            })}
          </div>
          {!allModulesOn && (
            <div style={{ fontSize:"6.5px", color:C.muted, fontFamily:mono, marginBottom:8, opacity:0.7 }}>
              {enabledModules.length} of {CALC_MODULES.length} modules selected — faster calculation
            </div>
          )}

          {/* SEPARATOR */}
          <div style={{ height:1, background:C.border, margin:"4px 0 10px" }} />

          {/* PARAMETERS */}
          <div style={{ fontSize:"8px", fontWeight:700, color:C.orange, letterSpacing:"1.5px", marginBottom:8, fontFamily:mono }}>
            PARAMETERS
          </div>
          {CALC_PARAM_DEFS.map(def => {
            const val = calcParams[def.key] ?? DEFAULT_CALC_PARAMS[def.key];
            const isDefault = val === DEFAULT_CALC_PARAMS[def.key];
            return (
              <div key={def.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5, gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"7.5px", color:isDefault?C.muted:C.orange, fontFamily:mono, fontWeight:600 }}>{def.label}</div>
                  <div style={{ fontSize:"6.5px", color:C.muted, fontFamily:mono, opacity:0.6 }}>{def.desc}</div>
                </div>
                <input type="number" min={def.min} max={def.max} step={def.step} value={val}
                  onChange={(e)=>handleChange(def.key, e.target.value, def)}
                  style={{ width:58, background:C.bgPanel, border:`1px solid ${isDefault?C.border:C.orange+"50"}`,
                    color:isDefault?C.white:C.orange, fontSize:"9px", fontFamily:mono, textAlign:"right", padding:"2px 4px" }} />
              </div>
            );
          })}
          <div style={{ display:"flex", gap:6, marginTop:10 }}>
            <button onClick={()=>{onCalc();setOpen(false);}} disabled={calcing}
              style={{ flex:1, background:C.orange, color:C.bg, border:"none", padding:"4px 8px", cursor:calcing?"wait":"pointer",
                fontSize:"8px", fontWeight:800, fontFamily:mono, opacity:calcing?0.6:1 }}>
              {calcing?"RUNNING...":"RUN CALCULATION"}
            </button>
            <button onClick={()=>{onReset();}}
              style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, padding:"4px 8px",
                cursor:"pointer", fontSize:"7px", fontFamily:mono, fontWeight:600 }}>
              RESET
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════
// MANUAL CONE DROPDOWN — select anchor point on chart
// ════════════════════════════════════════════════════════
export function ManualConeDropdown({ hasManualCone, isSelecting, onSelectPoint, onToggleVisibility, onDelete, visible }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if(!open) return; const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, [open]);

  const activeColor = "#ff00ff";

  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block" }}>
      <div style={{ display:"flex" }}>
        <button onClick={()=>setOpen(!open)}
          style={{
            background: isSelecting ? `${activeColor}30` : hasManualCone ? `${activeColor}15` : "transparent",
            color: isSelecting ? activeColor : hasManualCone ? activeColor : C.muted,
            border: `1px solid ${isSelecting ? activeColor : hasManualCone ? activeColor+"50" : C.border}`,
            padding: "1px 6px", cursor: "pointer", fontSize: "7px", fontWeight: 700,
            fontFamily: mono, borderRadius: "2px",
          }}>
          {isSelecting ? "\u2295 CLICK CHART" : "MANUAL CONE"} {open?"\u25B4":"\u25BE"}
        </button>
      </div>
      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, zIndex:100,
          background:C.bgCard, border:`1px solid ${C.borderLt}`,
          padding:"4px 0", minWidth:150, marginTop:2,
          boxShadow:"0 4px 12px rgba(0,0,0,0.6)",
        }}>
          {/* Select Point */}
          <button onClick={()=>{onSelectPoint();setOpen(false);}}
            style={{
              display:"flex", alignItems:"center", gap:8, width:"100%",
              background: isSelecting ? `${activeColor}20` : "transparent",
              border:"none", padding:"6px 12px", cursor:"pointer",
              color: isSelecting ? activeColor : C.white,
              fontSize:"9px", fontFamily:mono, fontWeight:600, textAlign:"left",
            }}>
            <span style={{ fontSize:"11px" }}>{"\u2295"}</span>
            {isSelecting ? "CANCEL SELECTION" : "SELECT POINT"}
          </button>

          {/* Show / Hide */}
          {hasManualCone && (
            <button onClick={()=>{onToggleVisibility();setOpen(false);}}
              style={{
                display:"flex", alignItems:"center", gap:8, width:"100%",
                background:"transparent", border:"none", padding:"6px 12px",
                cursor:"pointer", color: visible ? C.white : C.muted,
                fontSize:"9px", fontFamily:mono, fontWeight:600, textAlign:"left",
              }}>
              <span style={{ fontSize:"11px" }}>{visible ? "\u25C9" : "\u25CB"}</span>
              {visible ? "HIDE CONE" : "SHOW CONE"}
            </button>
          )}

          {/* Delete */}
          {hasManualCone && (
            <button onClick={()=>{onDelete();setOpen(false);}}
              style={{
                display:"flex", alignItems:"center", gap:8, width:"100%",
                background:"transparent", border:"none", padding:"6px 12px",
                cursor:"pointer", color: C.red,
                fontSize:"9px", fontFamily:mono, fontWeight:600, textAlign:"left",
              }}>
              <span style={{ fontSize:"11px" }}>{"\u2715"}</span>
              DELETE CONE
            </button>
          )}

          {/* Info when no cone exists */}
          {!hasManualCone && !isSelecting && (
            <div style={{ padding:"4px 12px", fontSize:"7px", color:C.muted, fontFamily:mono }}>
              Click "Select Point" then click on the chart to place an anchor
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ================================================================
// BANDS DROPDOWN -- per-model (GBM/MJD) visibility + style
// ================================================================

const BAND_MODELS = [
  { key: "gbm",   label: "GBM",   defaultColor: "#ff6d00" },
  { key: "mjd",   label: "MJD",   defaultColor: "#ffc107" },
  { key: "bates", label: "BATES", defaultColor: "#e056fd" },
];

const BAND_DEFAULTS = {
  gbm:   { color: "#ff6d00", width: 1, op1: 0.75, op2: 0.40, op3: 0.18, visible: true },
  mjd:   { color: "#ffc107", width: 1, op1: 0.65, op2: 0.32, op3: 0.15, visible: true },
  bates: { color: "#e056fd", width: 1, op1: 0.65, op2: 0.32, op3: 0.15, visible: true },
};

function BandsStyleEditor({ modelKey, style, onUpdate, onClose }) {
  const def   = BAND_DEFAULTS[modelKey] || BAND_DEFAULTS.gbm;
  const color = style.color ?? def.color;
  const width = style.width ?? def.width;
  const op1   = style.op1   ?? def.op1;
  const op2   = style.op2   ?? def.op2;
  const op3   = style.op3   ?? def.op3;

  const upd = (k, v) => onUpdate({ ...style, [k]: v });

  const Row = ({ label, children }) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
      <span style={{ fontSize:"8px", color:C.muted, fontFamily:mono }}>{label}</span>
      {children}
    </div>
  );

  const Slider = ({ k, val, min, max, step, fmt }) => (
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <input type="range" min={min} max={max} step={step || 0.05} value={val}
        onChange={e => upd(k, parseFloat(e.target.value))}
        style={{ width:60, accentColor:C.orange }} />
      <span style={{ fontSize:"8px", color:C.white, fontFamily:mono, width:28, textAlign:"right" }}>
        {fmt ? fmt(val) : val}
      </span>
    </div>
  );

  return (
    <div style={{ borderTop:`1px solid ${C.border}`, padding:"8px 10px" }}>
      <div style={{ fontSize:"8px", fontWeight:700, color:C.orange, letterSpacing:"1.5px", marginBottom:6, fontFamily:mono }}>
        {modelKey.toUpperCase()} STYLE
      </div>
      <Row label="COLOR">
        <input type="color" value={color} onChange={e => upd("color", e.target.value)}
          style={{ width:24, height:16, border:`1px solid ${C.border}`, background:"transparent", cursor:"pointer", padding:0 }} />
      </Row>
      <Row label="WIDTH">
        <Slider k="width" val={width} min={1} max={4} step={1} fmt={v => v} />
      </Row>
      <div style={{ fontSize:"7px", color:C.muted, fontFamily:mono, marginBottom:3, marginTop:2 }}>OPACITY</div>
      <Row label="1SD">
        <Slider k="op1" val={op1} min={0.05} max={1.0} fmt={v => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="2SD">
        <Slider k="op2" val={op2} min={0.02} max={0.8} fmt={v => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="3SD">
        <Slider k="op3" val={op3} min={0.01} max={0.6} fmt={v => `${Math.round(v * 100)}%`} />
      </Row>
      <button onClick={() => { onUpdate({}); onClose(); }}
        style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, fontSize:"7px", fontFamily:mono, padding:"2px 6px", cursor:"pointer", marginTop:4, width:"100%" }}>
        RESET TO DEFAULT
      </button>
    </div>
  );
}

export function BandsDropdown({ bandStyles, layerOn, onToggleAll, onToggleModel, onUpdateStyle, meanStyle, onUpdateMeanColor, stale = false }) {
  const [open,         setOpen]         = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open && !editingModel) return;
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setEditingModel(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, editingModel]);

  // layerOn=false means master switch is off — button should go dark even if models are individually visible
  const anyOn = layerOn && BAND_MODELS.some(m => (bandStyles[m.key]?.visible ?? true));

  // v8: when bands data is older than the last market close, paint the
  //     button + caret in red regardless of on/off state so the operator
  //     sees a stale-data warning before relying on the band lines.
  const accent = stale ? "#e8383b" : C.orange;
  const btnBase = {
    background: anyOn ? `${accent}20` : "transparent",
    color:      anyOn ? accent : (stale ? accent : C.white),
    border:     `1px solid ${anyOn ? accent + "50" : (stale ? accent + "60" : C.borderLt)}`,
    cursor:     "pointer", fontSize:"11px", fontWeight:700, fontFamily:mono,
  };

  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block" }}>
      <div style={{ display:"flex" }}>
        <button onClick={onToggleAll}
          style={{ ...btnBase, padding:"2px 9px", borderRight:"none", borderRadius:"2px 0 0 2px" }}>
          BANDS
        </button>
        <button onClick={() => { setOpen(o => !o); setEditingModel(null); }}
          style={{ ...btnBase, padding:"2px 5px", borderRadius:"0 2px 2px 0" }}>
          {open ? "\u25B4" : "\u25BE"}
        </button>
      </div>

      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, zIndex:100,
          background:C.bgCard, border:`1px solid ${C.borderLt}`,
          padding:"4px 0 0 0", minWidth:160, marginTop:2,
          boxShadow:"0 4px 12px rgba(0,0,0,0.6)",
        }}>
          {BAND_MODELS.map(m => {
            const s         = bandStyles[m.key] || {};
            const isOn      = s.visible !== false;
            const col       = s.color || m.defaultColor;
            const isEditing = editingModel === m.key;
            return (
              <div key={m.key}>
                <div style={{ display:"flex", alignItems:"center", padding:"0 4px 0 0" }}>
                  <button
                    onClick={() => onToggleModel(m.key)}
                    style={{
                      display:"flex", alignItems:"center", gap:6, flex:1,
                      background:"transparent", border:"none", padding:"5px 10px",
                      cursor:"pointer", color: isOn ? col : C.muted,
                      fontSize:"9px", fontFamily:mono, fontWeight:600,
                    }}>
                    <span style={{
                      display:"inline-block", width:8, height:8, borderRadius:2,
                      background: isOn ? col : "transparent",
                      border:`1px solid ${isOn ? col : C.muted}`,
                    }} />
                    {m.label}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setEditingModel(isEditing ? null : m.key); }}
                    style={{ background:"transparent", border:"none", cursor:"pointer", color: isEditing ? C.orange : C.muted, fontSize:"10px", padding:"2px 6px" }}
                    title="Style settings">&#9881;</button>
                </div>
                {isEditing && (
                  <BandsStyleEditor
                    modelKey={m.key}
                    style={s}
                    onUpdate={ns => onUpdateStyle(m.key, ns)}
                    onClose={() => setEditingModel(null)}
                  />
                )}
              </div>
            );
          })}
          {/* MEAN line color (replaces hardcoded white-25%) */}
          <div style={{
            borderTop: `1px solid ${C.border}`, marginTop: 2,
            padding: "5px 10px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: "9px", color: meanStyle?.color || "#ff0000",
              fontFamily: mono, fontWeight: 700, letterSpacing: "1px",
            }}>MEAN</span>
            <input
              type="color"
              value={meanStyle?.color || "#ff0000"}
              onChange={e => onUpdateMeanColor && onUpdateMeanColor(e.target.value)}
              style={{ width: 24, height: 16, border: `1px solid ${C.border}`,
                       background: "transparent", cursor: "pointer", padding: 0 }}
            />
          </div>
          <div style={{ height:4 }} />
        </div>
      )}
    </div>
  );
}