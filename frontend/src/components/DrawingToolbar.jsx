// version: v7
/**
 * DrawingToolbar.jsx — Drawing Tool Palette
 * Quantum Terminal | Phase 4C
 * v2 — added RAY tool.
 * v6 — F1..F11 keyboard shortcuts mapped to the 11 non-position tools in
 *      the order they appear in TOOLS. Pressing F1..F11 outside an input
 *      toggles the corresponding tool. Each tool row in the dropdown
 *      shows its F-key on the right, in a small bordered pill, so the
 *      mapping is discoverable without docs.
 *
 * Dropdown for selecting drawing tools, picking color/width,
 * managing existing drawings, and configuring Fibonacci levels.
 *
 * Props:
 *   activeTool       — current tool string or null
 *   onSelectTool     — (toolType) => void
 *   drawStyle        — { color, lineWidth, opacity, fibLevels, fibExtLevels }
 *   onStyleChange    — (styleUpdate) => void
 *   drawingCount     — number of drawings on current chart
 *   onClearAll       — () => void
 *   onDeleteSelected — () => void
 *   hasSelected      — boolean
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { C, mono } from "./chart_constants";
import { DEFAULT_DRAW_STYLE, DEFAULT_FIB_LEVELS, DEFAULT_FIB_EXT_LEVELS } from "./DrawingManager";

// v7: exported so the chart's right-click context menu (ChartContextMenu)
//      can render the same Draw submenu without duplicating the list.
export const TOOLS = [
  { key: "hline",        icon: "─",  label: "HORIZONTAL LINE" },
  { key: "trendline",    icon: "╲",  label: "TREND LINE" },
  { key: "ray",          icon: "↗",  label: "RAY" },
  { key: "path",         icon: "↝",  label: "PATH (CLICK TO ADD, DBL-CLICK TO END)" },
  { key: "rectangle",    icon: "▭",  label: "RECTANGLE" },
  { key: "text",         icon: "T",  label: "TEXT" },
  { key: "price_point",  icon: "⊙",  label: "PRICE POINT" },
  { key: "circle",    icon: "○",  label: "CIRCLE" },
  { key: "fib",       icon: "⊟",  label: "FIB RETRACEMENT", hasGear: true },
  { key: "fib_ext",   icon: "⊞",  label: "FIB EXTENSION",   hasGear: true },
  { key: "pen",       icon: "✎",  label: "FREEHAND PEN" },
  { key: "_sep" },
  { key: "position_long",  icon: "▲", label: "LONG POSITION",  color: "#2ebd59" },
  { key: "position_short", icon: "▼", label: "SHORT POSITION", color: "#e8383b" },
];

// v6: F1..F11 mapped to the 11 non-separator, non-position tools in the
//     order they appear above. Position tools sit below the separator and
//     are intentionally not bound to F-keys (only 11 keys available, and
//     the position markers are a different mental category).
// v7: exported alongside TOOLS so ChartContextMenu shows the same F-key
//      pills next to each tool in its Draw submenu.
export const FKEY_MAP = (() => {
  const m = {};
  let i = 1;
  for (const t of TOOLS) {
    if (t.key === "_sep") continue;
    if (t.key.startsWith("position_")) continue;
    if (i > 11) break;
    m[t.key] = `F${i}`;
    i++;
  }
  return m;
})();

const COLORS = [
  "#ff6d00", "#e8383b", "#2ebd59", "#3796ff", "#9b59b6",
  "#00d2d3", "#f1c40f", "#ffffff", "#888888",
];

// ════════════════════════════════════════════════════════
// FIB SETTINGS EDITOR — add/remove/recolor/toggle levels
// ════════════════════════════════════════════════════════
function FibSettingsEditor({ type, levels, defaults, onChange, onClose }) {
  const ref = useRef(null);
  const [addValue, setAddValue] = useState("");

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const title = type === "fib" ? "FIB RETRACEMENT LEVELS" : "FIB EXTENSION LEVELS";

  const toggleLevel = (idx) => {
    const next = levels.map((l, i) => i === idx ? { ...l, enabled: !l.enabled } : l);
    onChange(next);
  };

  const changeColor = (idx, color) => {
    const next = levels.map((l, i) => i === idx ? { ...l, color } : l);
    onChange(next);
  };

  const removeLevel = (idx) => {
    onChange(levels.filter((_, i) => i !== idx));
  };

  const addLevel = () => {
    const val = parseFloat(addValue);
    if (isNaN(val) || val < -10 || val > 50) return;
    if (levels.some(l => Math.abs(l.level - val) < 0.0001)) return;
    const next = [...levels, { level: val, color: "#ff6d00", enabled: true }]
      .sort((a, b) => a.level - b.level);
    onChange(next);
    setAddValue("");
  };

  const handleRestore = () => {
    if (window.confirm(`Restore ${type === "fib" ? "retracement" : "extension"} levels to defaults?\n\nThis will overwrite your custom levels.`)) {
      onChange(JSON.parse(JSON.stringify(defaults)));
    }
  };

  return (
    <div ref={ref} style={{
      // v5: anchor to the right edge of the parent (opens leftward) so the
      //     submenu stays inside the viewport — the DRAW dropdown sits at
      //     the far right of the toolbar and the old right-side flyout was
      //     clipped off-screen.
      position: "absolute", top: 0, right: "100%", zIndex: 300,
      background: C.bgCard, border: `1px solid ${C.borderLt}`,
      padding: "10px 12px", minWidth: 240, marginRight: 4,
      boxShadow: "0 6px 20px rgba(0,0,0,0.8)", maxHeight: "60vh", overflowY: "auto",
    }}>
      <div style={{ fontSize: "8px", fontWeight: 700, color: C.orange, letterSpacing: "1.5px", marginBottom: 8, fontFamily: mono }}>
        {title}
      </div>

      {/* ── Level list ── */}
      {levels.map((lvl, idx) => (
        <div key={idx} style={{
          display: "flex", alignItems: "center", gap: 5, marginBottom: 3,
          opacity: lvl.enabled ? 1 : 0.4,
        }}>
          <button
            onClick={() => toggleLevel(idx)}
            style={{
              width: 14, height: 14, borderRadius: 2, border: `1px solid ${C.border}`,
              background: lvl.enabled ? lvl.color : "transparent", cursor: "pointer", padding: 0, flexShrink: 0,
            }}
          />
          <span style={{
            fontSize: "9px", fontFamily: mono, fontWeight: 600, width: 42, textAlign: "right",
            color: lvl.enabled ? C.white : C.muted,
          }}>
            {(lvl.level * 100).toFixed(1)}%
          </span>
          <input
            type="color" value={lvl.color}
            onChange={(e) => changeColor(idx, e.target.value)}
            style={{ width: 20, height: 14, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", padding: 0 }}
          />
          <button
            onClick={() => removeLevel(idx)}
            style={{
              background: "transparent", border: "none", color: C.muted, cursor: "pointer",
              fontSize: "9px", fontFamily: mono, padding: "0 2px", marginLeft: "auto",
            }}
            title="Remove level"
          >✕</button>
        </div>
      ))}

      {/* ── Add level ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
        <input
          type="number" step="0.001" placeholder="e.g. 0.786" value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addLevel(); }}
          style={{
            flex: 1, background: C.bgPanel, border: `1px solid ${C.border}`,
            color: C.white, fontSize: "8px", fontFamily: mono, padding: "3px 5px",
          }}
        />
        <button
          onClick={addLevel}
          style={{
            background: C.orange, color: C.bg, border: "none", fontSize: "7px",
            fontFamily: mono, fontWeight: 800, padding: "3px 8px", cursor: "pointer",
          }}
        >ADD</button>
      </div>
      <div style={{ fontSize: "6.5px", color: C.muted, fontFamily: mono, marginTop: 2 }}>
        Enter as decimal (0.786) not percentage
      </div>

      {/* ── Restore defaults ── */}
      <button
        onClick={handleRestore}
        style={{
          width: "100%", marginTop: 10, background: "transparent",
          border: `1px solid ${C.red}40`, color: C.red, fontSize: "7px",
          fontFamily: mono, fontWeight: 700, padding: "4px 6px", cursor: "pointer",
        }}
      >RESTORE DEFAULTS</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MAIN DRAWING TOOLBAR
// ════════════════════════════════════════════════════════
export default function DrawingToolbar({
  activeTool, onSelectTool, drawStyle, onStyleChange,
  drawingCount, onClearAll, onDeleteSelected, hasSelected,
}) {
  const [open, setOpen] = useState(false);
  const [editingFib, setEditingFib] = useState(null);
  const ref = useRef(null);
  const anyOn = !!activeTool;
  const style = drawStyle || DEFAULT_DRAW_STYLE;

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setEditingFib(null); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // v6: Global F1..F11 → drawing tool shortcuts. Only fires when the user
  //     isn't typing in an input/textarea/contentEditable, mirroring the
  //     existing useKeyboardShortcuts behavior in the rest of the app.
  //     preventDefault is essential because several F-keys have native
  //     bindings (F5 = reload, F11 = fullscreen, F12 = devtools).
  useEffect(() => {
    const reverse = {};
    for (const k of Object.keys(FKEY_MAP)) reverse[FKEY_MAP[k]] = k;

    const handler = (e) => {
      if (!reverse[e.key]) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (document.activeElement?.isContentEditable) return;
      e.preventDefault();
      const tool = reverse[e.key];
      onSelectTool(activeTool === tool ? null : tool);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTool, onSelectTool]);

  const getFibLevels = useCallback((type) => {
    if (type === "fib") return style.fibLevels || JSON.parse(JSON.stringify(DEFAULT_FIB_LEVELS));
    return style.fibExtLevels || JSON.parse(JSON.stringify(DEFAULT_FIB_EXT_LEVELS));
  }, [style]);

  const handleFibChange = useCallback((type, levels) => {
    if (type === "fib") onStyleChange({ fibLevels: levels });
    else onStyleChange({ fibExtLevels: levels });
  }, [onStyleChange]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          // v4: size + color match the BATES dropdown (bright white when
          //     idle, orange when a tool is active) for visual parity.
          background: anyOn ? `${C.orange}20` : "transparent",
          color: anyOn ? C.orange : C.white,
          border: `1px solid ${anyOn ? C.orange + "50" : C.borderLt}`,
          padding: "2px 9px", cursor: "pointer", fontSize: "11px",
          fontWeight: 700, fontFamily: mono, borderRadius: 2,
        }}
      >DRAW {open ? "▴" : "▾"}</button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 200,
          background: C.bgCard, border: `1px solid ${C.borderLt}`,
          padding: "8px 0", minWidth: 200, marginTop: 2,
          boxShadow: "0 4px 16px rgba(0,0,0,0.8)",
        }}>
          {/* ── Tools ── */}
          <div style={{ padding: "0 10px 4px", fontSize: "7px", fontWeight: 700, color: C.orange, letterSpacing: "1.5px", fontFamily: mono }}>
            TOOLS
          </div>
          {TOOLS.map((tool) => {
            if (tool.key === "_sep") return <div key="_sep" style={{ height: 1, background: C.border, margin: "4px 10px" }} />;
            const isActive = activeTool === tool.key;
            const isEditing = editingFib === tool.key;
            const toolColor = tool.color || (isActive ? C.orange : C.muted);
            return (
              <div key={tool.key} style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", background: isActive ? `${C.orange}18` : "transparent" }}>
                  <button
                    onClick={() => { onSelectTool(isActive ? null : tool.key); if (!isActive) setOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, flex: 1,
                      background: "transparent", border: "none", padding: "5px 10px",
                      cursor: "pointer", color: isActive ? C.orange : toolColor,
                      fontSize: "9px", fontFamily: mono, fontWeight: 600,
                    }}
                  >
                    <span style={{ fontSize: "12px", width: 16, textAlign: "center", color: tool.color || undefined }}>{tool.icon}</span>
                    <span>{tool.label}</span>
                    {/* v6: F-key pill + ACTIVE label, both aligned right */}
                    <span style={{
                      marginLeft: "auto", display: "inline-flex",
                      alignItems: "center", gap: 6,
                    }}>
                      {FKEY_MAP[tool.key] && (
                        <span style={{
                          fontSize: "7px", fontWeight: 700, letterSpacing: "0.5px",
                          color: isActive ? C.orange : C.muted,
                          padding: "1px 5px",
                          border: `1px solid ${isActive ? `${C.orange}80` : C.borderLt}`,
                          borderRadius: 2, fontFamily: mono,
                        }}>{FKEY_MAP[tool.key]}</span>
                      )}
                      {isActive && (
                        <span style={{ fontSize: "7px", color: C.green }}>ACTIVE</span>
                      )}
                    </span>
                  </button>
                  {tool.hasGear && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingFib(isEditing ? null : tool.key); }}
                      style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        color: isEditing ? C.orange : C.muted, fontSize: "10px", padding: "4px 8px",
                      }}
                      title="Configure levels"
                    >⚙</button>
                  )}
                </div>
                {isEditing && (
                  <FibSettingsEditor
                    type={tool.key}
                    levels={getFibLevels(tool.key)}
                    defaults={tool.key === "fib" ? DEFAULT_FIB_LEVELS : DEFAULT_FIB_EXT_LEVELS}
                    onChange={(levels) => handleFibChange(tool.key, levels)}
                    onClose={() => setEditingFib(null)}
                  />
                )}
              </div>
            );
          })}

          <div style={{ height: 1, background: C.border, margin: "6px 10px" }} />

          {/* ── Color ── */}
          <div style={{ padding: "0 10px 4px", fontSize: "7px", fontWeight: 700, color: C.orange, letterSpacing: "1.5px", fontFamily: mono }}>COLOR</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "0 10px 6px" }}>
            {COLORS.map((c) => (
              <button key={c} onClick={() => onStyleChange({ color: c })} style={{
                width: 16, height: 16, borderRadius: 2, background: c,
                border: style.color === c ? `2px solid ${C.white}` : `1px solid ${C.border}`,
                cursor: "pointer", padding: 0,
              }} />
            ))}
          </div>

          {/* ── Width ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 10px" }}>
            <span style={{ fontSize: "7px", color: C.muted, fontFamily: mono, fontWeight: 700 }}>WIDTH</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="range" min={1} max={4} step={1} value={style.lineWidth || 1}
                onChange={(e) => onStyleChange({ lineWidth: parseInt(e.target.value) })} style={{ width: 50, accentColor: C.orange }} />
              <span style={{ fontSize: "8px", color: C.white, fontFamily: mono, width: 10, textAlign: "right" }}>{style.lineWidth || 1}</span>
            </div>
          </div>

          {/* ── Opacity ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 10px" }}>
            <span style={{ fontSize: "7px", color: C.muted, fontFamily: mono, fontWeight: 700 }}>OPACITY</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="range" min={0.1} max={1.0} step={0.1} value={style.opacity ?? 0.8}
                onChange={(e) => onStyleChange({ opacity: parseFloat(e.target.value) })} style={{ width: 50, accentColor: C.orange }} />
              <span style={{ fontSize: "8px", color: C.white, fontFamily: mono, width: 20, textAlign: "right" }}>{((style.opacity ?? 0.8) * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div style={{ height: 1, background: C.border, margin: "6px 10px" }} />

          {/* ── Actions ── */}
          <div style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 3 }}>
            {hasSelected && (
              <button onClick={() => onDeleteSelected()} style={{
                background: "transparent", border: `1px solid ${C.red}40`, color: C.red,
                fontSize: "7px", fontFamily: mono, fontWeight: 700, padding: "3px 6px", cursor: "pointer", width: "100%",
              }}>DELETE SELECTED</button>
            )}
            {drawingCount > 0 && (
              <button onClick={() => { if (window.confirm(`Clear all ${drawingCount} drawing(s) on this chart?`)) onClearAll(); }} style={{
                background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                fontSize: "7px", fontFamily: mono, fontWeight: 600, padding: "3px 6px", cursor: "pointer", width: "100%",
              }}>CLEAR ALL ({drawingCount})</button>
            )}
          </div>

          {activeTool && (
            <div style={{ padding: "6px 10px 0", fontSize: "7px", color: C.muted, fontFamily: mono, lineHeight: 1.5 }}>
              {activeTool === "pen" ? "Press and drag to draw." : "Click chart to place."} ESC to cancel.
            </div>
          )}
        </div>
      )}
    </div>
  );
}