// version: v3
// v3 — Added CalibratingBadge to header (composite is a degraded local
//      stand-in until DC's `composite_verdict` ships per msg #122 design
//      contract). Badge says "Calibrating — local composite stand-in".
// v2 — Populated with local composite read instead of empty placeholder.
//   Reuses computeAgreement (already shipped, used by AgreementMatrix) to
//   derive a degraded-but-actionable read while DC's full multi-setup
//   composite_verdict is pending. Shows: composite direction (BUY/SELL/
//   FLAT), aligned/dissenting counts, headline named-signal alignment
//   list. Footer keeps the "DC composite_verdict pending" honest tag.
//   The placeholder dashed-card variant is gone — operator opens the
//   cockpit and gets an immediate read instead of "renders here when DC
//   ships."
// version: v1 — empty placeholder.
//
// TradeCardSection.jsx — top-of-cockpit trade card.
// Phase 1 (v1): empty placeholder awaiting DC composite_verdict.
// Phase 1.5 (v2): degraded local composite from computeAgreement so the
//   operator gets an actionable read NOW. Replaced in Phase 2 with the
//   real multi-setup card from DC's composite_verdict.{intraday,swing}.
import React from "react";
import { CK, mono } from "./cockpit_theme";
import { computeAgreement } from "./compute_agreement";
import CalibratingBadge from "../../shared/CalibratingBadge"; // v3

const SIGNAL_LABEL = {
  vanna_charm:      "Vanna",
  iv_skew:          "Skew",
  iv_skew_0dte:     "Skew 0DTE",
  dealer_scenarios: "Scenarios",
  market_entropy:   "Entropy",
  retail_trap:      "Retail Trap",
  iv_divergence:    "IV / RV",
  pc_ratio:         "P/C",
  charm_0dte:       "Charm 0DTE",
};

export default function TradeCardSection({ ticker, mode, payload }) {
  const spot      = payload?.spot;
  const expiryDte = payload?.iv_skew?.expiry_dte;
  const has0DTE   = !!payload?.charm_0dte || !!payload?.iv_skew_0dte;

  // v2: derive the local composite read.
  const agreement = computeAgreement(payload);
  const composite = agreement?.composite || "FLAT";
  const compositeCol = composite === "BUY"  ? CK.buy
                     : composite === "SELL" ? CK.sell
                     :                        CK.muted;
  const compositeBg  = composite === "BUY"  ? CK.buySoft
                     : composite === "SELL" ? CK.sellSoft
                     :                        "rgba(255,255,255,0.04)";

  const aligned    = agreement?.signals.filter(s => s.state === "aligned")    || [];
  const dissenting = agreement?.signals.filter(s => s.state === "dissenting") || [];

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
        <span>Composite Trade Card</span>
        <span style={{display:"inline-flex", alignItems:"center", gap:8, textTransform:"none"}}>
          <CalibratingBadge tooltip="Calibrating — local composite stand-in (BUY/SELL/FLAT direction from sign of vanna_charm.combined_pressure). Real composite_verdict with entry/stop/targets/conviction is PENDING DC ship per msg #122 design contract." />
          <span style={{ color: CK.dim, fontSize: 11 }}>
            local composite · DC composite_verdict pending
          </span>
        </span>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Asset header — ticker + spot + mode + expiry */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: CK.text, letterSpacing: 1 }}>{ticker || "—"}</div>
          <div style={{ color: CK.muted, fontSize: 12 }}>
            spot <strong style={{ color: CK.text }}>{typeof spot === "number" ? spot.toFixed(2) : "—"}</strong>
          </div>
          <div style={{
            padding: "2px 8px", border: `1px solid ${CK.border}`, borderRadius: 10,
            color: CK.text, fontSize: 11, textTransform: "uppercase",
          }}>{mode}</div>
          {typeof expiryDte === "number" && (
            <div style={{
              padding: "2px 8px", border: `1px solid ${CK.border}`, borderRadius: 10,
              color: CK.text, fontSize: 11,
            }}>Front · {expiryDte}DTE{has0DTE ? " (+0DTE)" : ""}</div>
          )}
        </div>

        {/* v2: composite read banner — local synthesis from computeAgreement */}
        {agreement && (
          <div style={{
            padding: "14px 16px", borderRadius: 6,
            background: compositeBg, border: `1px solid ${compositeCol}33`,
            borderLeft: `4px solid ${compositeCol}`,
          }}>
            <div style={{
              display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8,
            }}>
              <div style={{
                fontSize: 28, fontWeight: 800, color: compositeCol,
                letterSpacing: "1.5px", lineHeight: 1,
              }}>{composite}</div>
              <div style={{ fontSize: 11, color: CK.muted, letterSpacing: "0.5px" }}>
                composite read · {agreement.aligned}/9 aligned · {agreement.dissenting} dissent · {agreement.neutral} neutral
              </div>
            </div>
            {(aligned.length > 0 || dissenting.length > 0) && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                fontSize: 11, color: CK.textSoft,
              }}>
                {aligned.length > 0 && (
                  <div>
                    <span style={{ color: CK.buy, fontWeight: 600, marginRight: 6 }}>✓ Aligned:</span>
                    {aligned.map(s => SIGNAL_LABEL[s.name] || s.name).join(" · ")}
                  </div>
                )}
                {dissenting.length > 0 && (
                  <div>
                    <span style={{ color: CK.sell, fontWeight: 600, marginRight: 6 }}>✕ Dissents:</span>
                    {dissenting.map(s => SIGNAL_LABEL[s.name] || s.name).join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Honest footer about DC's pending work */}
        <div style={{
          fontSize: 10, color: CK.dim, fontStyle: "italic",
          letterSpacing: "0.3px", lineHeight: 1.5,
        }}>
          ◆ The full multi-setup card (entry / stop / targets / per-setup conviction) renders here when DC ships
          <code style={{ color: CK.muted }}> composite_verdict.{mode}</code>. Until then, the local composite above
          is derived from the sign of vanna_charm.combined_pressure cross-checked against the 9 signals (see
          Cross-signal agreement panel for per-signal detail).
        </div>
      </div>
    </div>
  );
}
