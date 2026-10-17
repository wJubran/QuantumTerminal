// version: v3
// v3 — Regime summary bar now reads entropy v2 (DC msg #117 canary):
//      `market_entropy.intraday.state` instead of legacy `state`. Falls
//      back to v1 if v2 isn't present. Adds UNKNOWN as a fourth pill
//      color (gray, with explicit label). Same pattern wired into
//      MarketEntropyCard (OptionsPanel.jsx v44) and Cockpit SignalStack
//      (SignalStack.jsx v3).
// v2 — Added top-of-cockpit regime summary bar above the 2-col grid.
//   Operator opens the per-asset cockpit and gets an immediate one-line
//   read instead of going straight from the OptionsCockpit header to
//   the TradeCardSection. Surfaces: GEX regime + price-vs-flip distance
//   + composite (from local computeAgreement) + retail-trap status +
//   entropy state. All locally derived from the existing 2.3 payload —
//   no DC dependency.
// version: v1 — original 2-col layout matching the mockup.
//
// Cockpit.jsx — per-asset deep-reasoning view.
// Two-column layout matching docs/mockups/2026-05-12-options-cockpit.html.
import React from "react";
import { CK, mono } from "./cockpit_theme";
import TradeCardSection      from "./TradeCardSection";
import SignalStack           from "./SignalStack";
import AgreementMatrix       from "./AgreementMatrix";
import FlipConditionsPanel   from "./FlipConditionsPanel";
import HistoricalAnalogsPanel from "./HistoricalAnalogsPanel";
import { computeAgreement }  from "./compute_agreement";

// v2 — small inline pill for the regime summary bar.
function RegimePill({ label, value, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 6,
      padding: "3px 9px", borderRadius: 4,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color || CK.border}33`,
      fontSize: 11, lineHeight: 1.2,
    }}>
      <span style={{ color: CK.muted, letterSpacing: "0.5px",
        fontSize: 10, textTransform: "uppercase" }}>{label}</span>
      <strong style={{ color: color || CK.text, fontWeight: 700 }}>{value}</strong>
    </span>
  );
}

function RegimeSummary({ payload }) {
  if (!payload) return null;
  const spot       = payload.spot;
  const flip       = payload.gex_flip;
  const gexRegime  = payload.gex?.regime;
  const trap       = payload.sauce?.retail_trap?.status;
  // v3: entropy reads v2 INTRADAY when present, falls back to v1.
  const ent        = payload.sauce?.market_entropy;
  const entropy    = ent?.intraday?.state ?? ent?.state;
  const agreement  = computeAgreement(payload);
  const composite  = agreement?.composite || "FLAT";

  // Distance to flip — sign + magnitude.
  let flipLabel = "—";
  let flipColor = CK.muted;
  if (typeof spot === "number" && typeof flip === "number" && flip !== 0) {
    const dist = ((spot - flip) / flip) * 100;
    flipLabel = `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%`;
    flipColor = dist >= 0 ? CK.buy : CK.sell;
  }

  const gexCol  = gexRegime === "POSITIVE" ? CK.buy : gexRegime === "NEGATIVE" ? CK.sell : CK.muted;
  const trapCol = trap === "TRAP_ACTIVE" ? CK.warn : CK.buy;
  // v3: 4-state coloring (entropy v2 added UNKNOWN).
  const entCol  = entropy === "ORDERED"  ? CK.buy
                : entropy === "MODERATE" ? CK.warn
                : entropy === "CHAOTIC"  ? CK.sell
                : entropy === "UNKNOWN"  ? CK.muted
                :                          CK.muted;
  const compCol = composite === "BUY" ? CK.buy : composite === "SELL" ? CK.sell : CK.muted;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "10px 18px", background: "#0d1218",
      borderBottom: `1px solid ${CK.border}`, fontFamily: mono,
    }}>
      <span style={{ fontSize: 10, color: CK.dim, letterSpacing: "1.2px",
        textTransform: "uppercase", marginRight: 4 }}>Regime</span>
      <RegimePill label="GEX"      value={gexRegime || "—"}        color={gexCol} />
      <RegimePill label="vs Flip"  value={flipLabel}                color={flipColor} />
      <RegimePill label="Composite" value={composite}                color={compCol} />
      {agreement && (
        <RegimePill label="Aligned" value={`${agreement.aligned}/9`} color={CK.text} />
      )}
      <RegimePill label="Trap"     value={trap === "TRAP_ACTIVE" ? "ACTIVE" : (trap || "—")} color={trapCol} />
      <RegimePill label="Entropy"  value={entropy || "—"}           color={entCol} />
    </div>
  );
}

export default function Cockpit({ ticker, mode, payload, loading, error }) {
  if (error) {
    return (
      <div style={{
        padding: 24, fontFamily: mono, color: CK.sell, fontSize: 12,
        textAlign: "center",
      }}>
        Could not load options data for {ticker}: {String(error.message || error)}
      </div>
    );
  }
  if (!payload && loading) {
    return (
      <div style={{
        padding: 24, fontFamily: mono, color: CK.muted, fontSize: 12,
        textAlign: "center",
      }}>Loading {ticker}…</div>
    );
  }
  if (!payload) {
    return (
      <div style={{
        padding: 24, fontFamily: mono, color: CK.muted, fontSize: 12,
        textAlign: "center",
      }}>Options data unavailable for {ticker}.</div>
    );
  }
  return (
    <div>
      {/* v2: regime summary bar above the 2-col grid */}
      <RegimeSummary payload={payload} />
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        gap: 16, padding: 18,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <TradeCardSection ticker={ticker} mode={mode} payload={payload} />
          <SignalStack payload={payload} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <AgreementMatrix payload={payload} />
          <FlipConditionsPanel />
          <HistoricalAnalogsPanel />
        </div>
      </div>
    </div>
  );
}
