// version: v4
// DrawingStyleEditor.jsx — floating popover shown when a drawing is
// selected. Lets the user change color, line width, opacity, and delete
// the drawing. Absolutely positioned inside the chart container so it
// follows fullscreen and resize naturally.
//
// v2 — for text drawings, replace the WIDTH control with FONT SIZE so
//      changing "size" actually affects the rendered glyphs. Other types
//      keep the line-width buttons unchanged.

import React from "react";
import { C, mono } from "./chart_constants";

const COLORS = [
  "#ff6d00", "#e8383b", "#2ebd59", "#3796ff", "#9b59b6",
  "#00d2d3", "#f1c40f", "#ffffff", "#888888",
];

export default function DrawingStyleEditor({ drawing, onChange, onDelete, onDeselect }) {
  if (!drawing) return null;

  const style = drawing.style || {};
  const color = style.color || "#ff6d00";
  const lineWidth = style.lineWidth ?? 1;
  const opacity = style.opacity ?? 0.8;
  // v3: price_point also uses fontSize for the bordered price label.
  const hasFontSize = drawing.type === "text" || drawing.type === "price_point";
  const fontSize = style.fontSize ?? 11;
  // v4: fib/fib_ext expose an internal color fill toggle.
  const hasFibFill = drawing.type === "fib" || drawing.type === "fib_ext";
  const fibFill = style.fibFill === true;

  const set = (patch) => onChange?.(patch);

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: "absolute", top: 10, right: 10, zIndex: 70,
        background: C.bgCard,
        border: `1px solid ${C.borderLt}`,
        borderRadius: 4, padding: "8px 10px",
        fontFamily: mono, boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        minWidth: 220,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{
          fontSize: 8, color: C.orange, letterSpacing: "1.5px",
          textTransform: "uppercase", fontWeight: 700,
        }}>Edit · {drawing.type}</span>
        <button
          onClick={onDeselect}
          title="Close (deselect)"
          style={{
            background: "transparent", border: "none",
            color: C.muted, cursor: "pointer", fontSize: 11,
            padding: "0 2px", lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* Color swatches */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 7, color: C.muted, letterSpacing: "1px",
          textTransform: "uppercase", marginBottom: 4, fontWeight: 700,
        }}>COLOR</div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => set({ color: c })}
              title={c}
              style={{
                width: 16, height: 16,
                background: c,
                border: c === color
                  ? `2px solid ${C.orange}`
                  : `1px solid ${C.borderLt}`,
                borderRadius: 2, cursor: "pointer", padding: 0,
                boxShadow: c === color ? `0 0 0 1px ${C.bgCard}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* Line width (non-text) OR Font size (text / price_point) */}
      {hasFontSize ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 3,
          }}>
            <span style={{
              fontSize: 7, color: C.muted, letterSpacing: "1px",
              textTransform: "uppercase", fontWeight: 700,
            }}>FONT SIZE</span>
            <span style={{ fontSize: 9, color: C.white, fontFamily: mono }}>
              {fontSize}px
            </span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {[10, 12, 16, 20, 28].map(s => (
              <button
                key={s}
                onClick={() => set({ fontSize: s })}
                title={`${s}px`}
                style={{
                  flex: 1, height: 18,
                  background: s === fontSize ? `${C.orange}20` : "transparent",
                  border: `1px solid ${s === fontSize ? C.orange : C.borderLt}`,
                  color: s === fontSize ? C.orange : C.muted,
                  cursor: "pointer", borderRadius: 2,
                  fontSize: 9, fontFamily: mono, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 3,
          }}>
            <span style={{
              fontSize: 7, color: C.muted, letterSpacing: "1px",
              textTransform: "uppercase", fontWeight: 700,
            }}>WIDTH</span>
            <span style={{ fontSize: 9, color: C.white, fontFamily: mono }}>
              {lineWidth}px
            </span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {[1, 2, 3, 4].map(w => (
              <button
                key={w}
                onClick={() => set({ lineWidth: w })}
                title={`${w}px`}
                style={{
                  flex: 1, height: 18,
                  background: w === lineWidth ? `${C.orange}20` : "transparent",
                  border: `1px solid ${w === lineWidth ? C.orange : C.borderLt}`,
                  color: w === lineWidth ? C.orange : C.muted,
                  cursor: "pointer", borderRadius: 2, fontSize: 9, fontFamily: mono,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <div style={{
                  width: "70%", height: w, background: "currentColor", borderRadius: 1,
                }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Opacity */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 3,
        }}>
          <span style={{
            fontSize: 7, color: C.muted, letterSpacing: "1px",
            textTransform: "uppercase", fontWeight: 700,
          }}>OPACITY</span>
          <span style={{ fontSize: 9, color: C.white, fontFamily: mono }}>
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.1} max={1} step={0.05}
          value={opacity}
          onChange={e => set({ opacity: parseFloat(e.target.value) })}
          style={{
            width: "100%", accentColor: C.orange,
          }}
        />
      </div>

      {/* v4: Fill toggle — only for fib / fib_ext drawings */}
      {hasFibFill && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => set({ fibFill: !fibFill })}
            style={{
              width: "100%", padding: "4px 8px",
              background: fibFill ? `${C.orange}20` : "transparent",
              border: `1px solid ${fibFill ? C.orange : C.borderLt}`,
              color: fibFill ? C.orange : C.muted,
              fontSize: 8, fontWeight: 700, letterSpacing: "1.2px",
              fontFamily: mono, cursor: "pointer", borderRadius: 2,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <span>INTERNAL FILL</span>
            <span>{fibFill ? "ON" : "OFF"}</span>
          </button>
        </div>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        style={{
          width: "100%", marginTop: 4,
          padding: "5px 8px", borderRadius: 2,
          background: `${C.red}15`, color: C.red,
          border: `1px solid ${C.red}60`,
          fontSize: 9, fontWeight: 800, letterSpacing: "1px",
          fontFamily: mono, cursor: "pointer",
        }}
      >DELETE DRAWING</button>
    </div>
  );
}
