/**
 * CloseConfirmDialog.jsx — Chart Close Confirmation Modal
 * Quantum Terminal | Phase 4B
 *
 * Displays a centered modal overlay asking the user to confirm
 * before removing a chart tab from the workspace.
 *
 * Props:
 *   chart    — { id, ticker, timeframe } of the chart to close
 *   onConfirm — () => void — removes the chart
 *   onCancel  — () => void — dismisses the dialog
 */
import { useEffect, useCallback } from "react";

const C = {
  bg:      "#000000",
  bgPanel: "#0a0a0a",
  bgCard:  "#111111",
  border:  "#222222",
  white:   "#ffffff",
  muted:   "#444444",
  orange:  "#ff6d00",
  red:     "#e8383b",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

export default function CloseConfirmDialog({ chart, onConfirm, onCancel }) {
  // Escape key dismisses
  const handleKey = useCallback((e) => {
    if (e.key === "Escape") onCancel?.();
    if (e.key === "Enter") onConfirm?.();
  }, [onCancel, onConfirm]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (!chart) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        fontFamily: mono,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          padding: "20px 28px",
          minWidth: 280,
          maxWidth: 360,
          textAlign: "center",
        }}
      >
        <div style={{
          fontSize: "11px",
          fontWeight: 700,
          color: C.white,
          letterSpacing: "1px",
          marginBottom: 6,
        }}>
          CLOSE CHART
        </div>
        <div style={{
          fontSize: "10px",
          color: C.muted,
          marginBottom: 18,
          lineHeight: 1.6,
        }}>
          Remove{" "}
          <span style={{ color: C.orange, fontWeight: 700 }}>
            {chart.ticker} {chart.timeframe || "M15"}
          </span>{" "}
          from workspace?
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 20px",
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.muted,
              fontSize: "9px",
              fontWeight: 700,
              fontFamily: mono,
              letterSpacing: "1px",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "6px 20px",
              background: `${C.red}22`,
              border: `1px solid ${C.red}55`,
              color: C.red,
              fontSize: "9px",
              fontWeight: 700,
              fontFamily: mono,
              letterSpacing: "1px",
              cursor: "pointer",
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
