// version: v1
//
// TimeframeDropdown — replaces the chart toolbar's inline 8 TF buttons +
// bar-timer + `+ MORE` block with a single TF box that opens an
// ATAS-style dropdown panel.
//
// Spec: docs/specs/2026-05-10-chart-toolbar-timeframe-dropdown-design.md
//
// Behaviour summary:
//   - Closed state: TF box (orange-active) + inline bar-timer pill.
//   - Click TF box → dropdown panel opens, populated from this asset's
//     last-committed state (props).
//   - Inside the dropdown: TF grid (3 rows from TF_GROUPS), days input,
//     `Load historical period` master switch + disabled date pickers,
//     LOAD button.
//   - Selecting a TF inside the dropdown stages it locally and swaps the
//     days input to that TF's saved value — nothing fetches yet.
//   - LOAD button reads the staged values, calls onLoad(...), closes the
//     panel.
//   - Click-outside or ESC closes and discards staging.
//   - The yellow ⚠ icon next to the days input appears when
//     estimateBarCount(days, tf) > 2000 (soft warning, not enforced).

import React, { useState, useRef, useEffect, useMemo } from "react";
import { C, mono, TF_GROUPS } from "./chart_constants";
import {
  estimateBarCount,
  daysInputLabel,
  defaultDaysPerTf,
} from "./timeframeMath";

const BAR_COUNT_WARNING_THRESHOLD = 2000;
const WARNING_YELLOW = "#ffc107";

export default function TimeframeDropdown({
  tf,                  // current committed TF (e.g. "H1")
  daysPerTf,           // map: { M1: 2, M5: 5, ... } — committed
  historicalOn,        // bool — committed
  historicalFrom,      // ISO "YYYY-MM-DD" or null — committed
  historicalTo,        // ISO "YYYY-MM-DD" or null — committed
  barTimer,            // string for the orange pill (e.g. "01:23")
  loading,             // bool — hides the bar-timer pill while fetching
  onLoad,              // ({ tf, days, daysPerTf, historicalOn, historicalFrom, historicalTo }) => void
}) {
  const [open, setOpen] = useState(false);

  // Staged values — local to the open panel. Reset to props every time
  // the panel opens so previously-discarded staging is gone.
  const [stagedTf, setStagedTf] = useState(tf);
  const [stagedDaysPerTf, setStagedDaysPerTf] = useState(
    daysPerTf || defaultDaysPerTf()
  );
  const [stagedHistOn, setStagedHistOn] = useState(historicalOn || false);
  const [stagedHistFrom, setStagedHistFrom] = useState(historicalFrom || "");
  const [stagedHistTo,   setStagedHistTo]   = useState(historicalTo   || "");

  // Snapshot props into staged state on the OPEN transition only — guard
  // against parent re-renders mid-edit clobbering what the user is typing.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStagedTf(tf);
      setStagedDaysPerTf(daysPerTf || defaultDaysPerTf());
      setStagedHistOn(historicalOn || false);
      setStagedHistFrom(historicalFrom || "");
      setStagedHistTo(historicalTo || "");
    }
    wasOpenRef.current = open;
  }, [open, tf, daysPerTf, historicalOn, historicalFrom, historicalTo]);

  const stagedDays = stagedDaysPerTf[stagedTf] ?? defaultDaysPerTf()[stagedTf] ?? 1;
  const projectedBars = useMemo(
    () => estimateBarCount(stagedDays, stagedTf),
    [stagedDays, stagedTf]
  );
  const overThreshold = projectedBars > BAR_COUNT_WARNING_THRESHOLD;
  const label = daysInputLabel(stagedTf);

  // ── click-outside + ESC close ────────────────────────────────────
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ── days-input handlers ──────────────────────────────────────────
  const onDaysChange = (e) => {
    const v = e.target.value;
    if (v === "") {
      setStagedDaysPerTf(prev => ({ ...prev, [stagedTf]: "" }));
      return;
    }
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    setStagedDaysPerTf(prev => ({ ...prev, [stagedTf]: Math.max(1, n) }));
  };

  const onDaysBlur = () => {
    setStagedDaysPerTf(prev => {
      const cur = prev[stagedTf];
      if (cur === "" || cur == null || cur < 1) {
        return { ...prev, [stagedTf]: 1 };
      }
      return prev;
    });
  };

  // ── LOAD ─────────────────────────────────────────────────────────
  const onLoadClick = () => {
    if (stagedHistOn) return;  // safety — button is disabled, but just in case
    const days = stagedDaysPerTf[stagedTf];
    const safeDays = (typeof days === "number" && days >= 1) ? days : 1;
    onLoad?.({
      tf: stagedTf,
      days: safeDays,
      daysPerTf: { ...stagedDaysPerTf, [stagedTf]: safeDays },
      historicalOn: stagedHistOn,
      historicalFrom: stagedHistFrom || null,
      historicalTo: stagedHistTo || null,
    });
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? "Close timeframe panel" : "Open timeframe panel"}
        style={{
          background: open ? `${C.orange}25` : "transparent",
          color: open ? C.orange : C.white,
          border: `1px solid ${open ? C.orange + "70" : C.borderLt}`,
          padding: "3px 12px", cursor: "pointer",
          fontSize: "13px", fontWeight: 700, fontFamily: mono,
          borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 6,
          minWidth: 64, justifyContent: "center",
        }}
      >
        <span>{tf}</span>
        <span style={{
          fontSize: "9px", opacity: 0.7,
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.12s",
        }}>▾</span>
      </button>

      {!loading && barTimer && (
        <span style={{
          color: C.orange, fontSize: "13px", fontFamily: mono,
          fontVariantNumeric: "tabular-nums", minWidth: 50, textAlign: "center",
          padding: "3px 6px", background: `${C.orange}15`,
          border: `1px solid ${C.orange}40`, borderRadius: 2, fontWeight: 700,
        }}>{barTimer}</span>
      )}

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
          {/* TF grid */}
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.6px", marginBottom: 4 }}>
            TIMEFRAME
          </div>
          {TF_GROUPS.map((row, idx) => (
            <div key={row.label} style={{
              display: "flex", gap: 4,
              marginBottom: idx === TF_GROUPS.length - 1 ? 8 : 4,
            }}>
              {row.keys.map(k => {
                const active = k === stagedTf;
                return (
                  <button
                    key={k}
                    onClick={() => setStagedTf(k)}
                    style={{
                      background: active ? C.orange : "transparent",
                      color: active ? C.bg : C.white,
                      border: active ? "none" : `1px solid ${C.borderLt}`,
                      padding: "3px 12px", cursor: "pointer",
                      fontSize: "12px", fontWeight: 700, fontFamily: mono,
                      borderRadius: 2, minWidth: 38,
                    }}
                  >{k}</button>
                );
              })}
            </div>
          ))}

          <div style={{ height: 1, background: C.border, margin: "8px 0" }} />

          {/* Days input — hidden when historical is on */}
          {!stagedHistOn && (
            <>
              <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.6px", marginBottom: 4 }}>
                DAYS TO LOAD
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="text"
                  value={stagedDaysPerTf[stagedTf] ?? ""}
                  onChange={onDaysChange}
                  onBlur={onDaysBlur}
                  style={{
                    width: 80, textAlign: "center",
                    background: C.bg, color: C.white,
                    border: `1px solid ${C.borderLt}`,
                    padding: "3px 4px", fontSize: "12px", fontWeight: 700,
                    fontFamily: mono, outline: "none", borderRadius: 2,
                  }}
                />
                <span style={{ fontSize: "10px", color: C.muted }}>{label}</span>
                {overThreshold && (
                  <span
                    title={`≈ ${projectedBars.toLocaleString()} bars — heavy load`}
                    style={{ color: WARNING_YELLOW, fontSize: "13px", cursor: "help" }}
                  >⚠</span>
                )}
              </div>
            </>
          )}

          {/* Historical master switch */}
          <div
            onClick={() => setStagedHistOn(v => !v)}
            title="Load a specific historical date range instead of the most-recent N bars (pending backend support)"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              margin: "10px 0 6px 0", cursor: "pointer", userSelect: "none",
            }}
          >
            <span style={{
              width: 12, height: 12, display: "inline-block",
              border: `1px solid ${C.borderLt}`,
              background: stagedHistOn ? C.orange : "transparent",
              borderRadius: 2,
            }} />
            <span style={{ fontSize: "11px", color: C.white }}>Load historical period</span>
          </div>

          {/* Disabled date pickers, only shown when toggle is on */}
          {stagedHistOn && (
            <div style={{ paddingLeft: 18, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: "10px", color: C.muted, width: 36 }}>FROM</span>
                <input
                  type="date"
                  value={stagedHistFrom}
                  onChange={(e) => setStagedHistFrom(e.target.value)}
                  disabled
                  title="Disabled — backend doesn't yet support date-anchored fetches"
                  style={{
                    background: C.bg, color: C.muted,
                    border: `1px solid ${C.border}`,
                    padding: "2px 4px", fontSize: "11px",
                    fontFamily: mono, borderRadius: 2,
                    opacity: 0.5, cursor: "not-allowed",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "10px", color: C.muted, width: 36 }}>TO</span>
                <input
                  type="date"
                  value={stagedHistTo}
                  onChange={(e) => setStagedHistTo(e.target.value)}
                  disabled
                  title="Disabled — backend doesn't yet support date-anchored fetches"
                  style={{
                    background: C.bg, color: C.muted,
                    border: `1px solid ${C.border}`,
                    padding: "2px 4px", fontSize: "11px",
                    fontFamily: mono, borderRadius: 2,
                    opacity: 0.5, cursor: "not-allowed",
                  }}
                />
              </div>
              <div style={{ fontSize: "9px", color: WARNING_YELLOW, marginTop: 6 }}>
                ⓘ Pending backend support — toggle stays remembered for when it ships
              </div>
            </div>
          )}

          <div style={{ height: 1, background: C.border, margin: "8px 0" }} />

          {/* LOAD button */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={onLoadClick}
              disabled={stagedHistOn}
              title={stagedHistOn ? "Historical date-range fetch pending backend support" : "Load with these settings"}
              style={{
                background: stagedHistOn ? "transparent" : C.orange,
                color:      stagedHistOn ? C.muted        : C.bg,
                border:     stagedHistOn ? `1px solid ${C.border}` : "none",
                padding: "5px 24px",
                cursor: stagedHistOn ? "not-allowed" : "pointer",
                fontSize: "12px", fontWeight: 800, fontFamily: mono,
                borderRadius: 2, letterSpacing: "0.5px",
                opacity: stagedHistOn ? 0.45 : 1,
              }}
            >LOAD</button>
          </div>
        </div>
      )}
    </div>
  );
}
