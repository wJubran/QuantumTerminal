// version: v2
// v2 — Added CalibratingBadge to header. Whole panel is a placeholder
//      until DC ships historical_analogs (gated on Step 2 backfill — 6mo
//      pre-test running, then full 10y).
// version: v1
// HistoricalAnalogsPanel.jsx — Phase 1 placeholder.
// Replaced in Phase 2 by the win/chop/loss bar driven by DC's
// historical_analogs (per asset per horizon: n_matches, hit_rate,
// chop_rate, adverse_rate, median moves). The biggest single DC build.
import React from "react";
import { CK, mono } from "./cockpit_theme";
import CalibratingBadge from "../../shared/CalibratingBadge"; // v2

export default function HistoricalAnalogsPanel() {
  return (
    <div style={{
      background: CK.bgCard, border: `1px solid ${CK.border}`,
      borderRadius: 8, overflow: "hidden", fontFamily: mono,
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CK.border}`,
        fontSize: 11, color: CK.muted, letterSpacing: "0.8px",
        textTransform: "uppercase", display: "flex",
        justifyContent: "space-between", alignItems: "center", gap: 8,
      }}>
        <span>Historical analogs</span>
        <CalibratingBadge tooltip="Calibrating — placeholder text only. DC's historical_analogs gated on Step 2 backfill (6mo pre-test running, then full 10y). Per-asset per-horizon hit/chop/adverse rates will populate here once the analog matcher + backtest endpoint are live." />
      </div>
      <div style={{ padding: 14, color: CK.textSoft, fontSize: 12, lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>
          When the current signal combination has fired in the past, what
          happened next at 1h / 4h / 1d horizons — populates here once DC's
          Step 2 backfill ships <code>historical_analogs</code> per asset
          per horizon.
        </p>
        <div style={{
          marginTop: 6, padding: 10, background: "#0d1218",
          border: `1px dashed ${CK.border}`, borderRadius: 4,
          color: CK.dim, fontSize: 11,
        }}>
          DC is currently running the 6-month ThetaData pre-test ahead of
          the full 10y backfill (per bus thread{" "}
          <code>dc-thetadata-migration-2026-05-12</code> #90/#91). This
          panel fills in once the analog matcher + backtest endpoint are
          live.
        </div>
      </div>
    </div>
  );
}
