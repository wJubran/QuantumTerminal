// version: v2
// v2 — Added CalibratingBadge to header. The "composite" direction is a
//      local stand-in (sign of vanna_charm.combined_pressure) — not the
//      real composite_verdict.primary_direction (pending DC ship).
//      Aligned/dissent counts inherit the same stand-in.
// version: v1
// AgreementMatrix.jsx — chip-row of aligned / dissenting / neutral signals
// with a header summary. All locally derived from computeAgreement.
import React from "react";
import { CK, mono } from "./cockpit_theme";
import { computeAgreement } from "./compute_agreement";
import CalibratingBadge from "../../shared/CalibratingBadge"; // v2

const SIGNAL_LABEL = {
  vanna_charm:      "Vanna / Charm",
  iv_skew:          "IV Skew (front)",
  iv_skew_0dte:     "IV Skew 0DTE",
  dealer_scenarios: "Dealer Scenarios",
  market_entropy:   "Market Entropy",
  retail_trap:      "Retail Trap",
  iv_divergence:    "IV vs Realized",
  pc_ratio:         "P/C OI Ratio",
  charm_0dte:       "0-DTE Pin Pressure",
};

const STATE_COLOR = {
  aligned:    { bg: CK.buySoft,  fg: CK.buy,  label: "aligned" },
  dissenting: { bg: CK.sellSoft, fg: CK.sell, label: "DISSENTS" },
  neutral:    { bg: "rgba(255,255,255,0.05)", fg: CK.muted, label: "neutral" },
};

export default function AgreementMatrix({ payload }) {
  const a = computeAgreement(payload);
  if (!a) {
    return (
      <div style={{
        background: CK.bgCard, border: `1px solid ${CK.border}`,
        borderRadius: 8, padding: 14, fontFamily: mono, color: CK.muted,
        fontSize: 12,
      }}>No options data.</div>
    );
  }
  return (
    <div style={{
      background: CK.bgCard, border: `1px solid ${CK.border}`,
      borderRadius: 8, overflow: "hidden", fontFamily: mono,
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CK.border}`,
        fontSize: 11, color: CK.muted, letterSpacing: "0.8px",
        textTransform: "uppercase", display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 8,
      }}>
        <span style={{display:"inline-flex",alignItems:"center",gap:8}}>
          Cross-signal agreement
          <CalibratingBadge tooltip="Calibrating — composite direction is a local stand-in (sign of vanna_charm.combined_pressure). Real composite_verdict.primary_direction pending DC ship. Aligned/dissent counts inherit this stand-in." />
        </span>
        <span style={{
          color: a.composite === "BUY" ? CK.buy : a.composite === "SELL" ? CK.sell : CK.muted,
          textTransform: "none",
        }}>composite: {a.composite}</span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 12px", marginBottom: 12,
          background: "#0d1218", border: `1px solid ${CK.border}`, borderRadius: 6,
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: CK.buy }}>{a.aligned} / 9</div>
            <div style={{ fontSize: 10, color: CK.muted, textTransform: "uppercase",
                          letterSpacing: "0.6px" }}>aligned with composite</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, color: CK.sell }}>{a.dissenting} dissent</div>
            <div style={{ fontSize: 14, color: CK.muted }}>{a.neutral} neutral</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {a.signals.map(s => {
            const sc = STATE_COLOR[s.state];
            return (
              <div key={s.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 8px", borderRadius: 4, background: "#0d1218",
                fontSize: 12,
              }}>
                <span style={{ color: CK.text }}>{SIGNAL_LABEL[s.name] || s.name}</span>
                <span style={{
                  padding: "1px 7px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                  background: sc.bg, color: sc.fg,
                }}>{sc.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
