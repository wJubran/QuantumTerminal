// version: v1
// UniverseScanStrip.jsx — table of watchlist assets, one row per ticker.
// Each row shows ticker · strength dots · setups summary · conviction ·
// horizon/expiry label · freshness. Click → setSelectedAsset.
//
// Phase 1: strength comes from deriveSignalStrength (hand rule). Setups
// summary is "WAIT" when retail_trap.status === "TRAP_ACTIVE", "see
// cockpit" otherwise (real multi-setup card lives in TradeCardSection
// which awaits DC's composite_verdict).
import React from "react";
import { CK, mono } from "./cockpit_theme";
import { deriveSignalStrength } from "./derive_signal_strength";

function StrengthDots({ score }) {
  if (typeof score !== "number") return <span style={{ color: CK.dim }}>—</span>;
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return (
    <span style={{ letterSpacing: "1px", color: CK.dim }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < filled ? CK.buy : CK.dim }}>●</span>
      ))}
    </span>
  );
}

function freshness(cachedAt) {
  if (!cachedAt) return { label: "—", color: CK.muted };
  const ts = typeof cachedAt === "string" ? Date.parse(cachedAt) : Number(cachedAt);
  if (!isFinite(ts)) return { label: "—", color: CK.muted };
  const minutes = Math.round((Date.now() - ts) / 60_000);
  const label = `${minutes}m`;
  if (minutes < 5)  return { label, color: CK.buy  };
  if (minutes < 15) return { label, color: CK.warn };
  return                  { label, color: CK.sell };
}

function setupsSummary(payload) {
  if (!payload) return <span style={{ color: CK.dim }}>—</span>;
  const trap = payload.sauce?.retail_trap;
  if (trap?.status === "TRAP_ACTIVE") {
    return (
      <span style={{
        padding: "1px 7px", borderRadius: 3, fontSize: 11, fontWeight: 600,
        background: CK.warnSoft, color: CK.warn,
        border: `1px solid ${CK.warnBorder}`,
      }}>
        WAIT · TRAP_ACTIVE {trap.retail_positioning || ""}
      </span>
    );
  }
  return <span style={{ color: CK.textSoft, fontSize: 11 }}>see cockpit</span>;
}

function expiryLabel(payload) {
  if (!payload) return "—";
  const ex = payload.iv_skew?.expiry_class;
  const dt = payload.iv_skew?.expiry_dte;
  const has0 = !!payload.iv_skew_0dte;
  if (has0 && (dt === 0 || ex === "0dte")) return "Front · 0DTE";
  if (ex === "front_non_0dte") return `Front · ${dt}DTE${has0 ? " (+0DTE)" : ""}`;
  if (typeof dt === "number") return `${dt}DTE`;
  return "Front";
}

export default function UniverseScanStrip({
  universe, selectedAsset, onSelect, onRefresh, mode,
}) {
  const rows = (universe || []).map(row => ({
    ...row,
    score: deriveSignalStrength(row.payload),
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return (
    <div style={{
      borderBottom: `1px solid ${CK.border}`,
      background: CK.bgCard, fontFamily: mono,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "90px 80px 1fr 110px 170px 70px 30px",
        gap: 14, padding: "8px 18px",
        fontSize: 10, color: CK.dim, letterSpacing: "0.8px",
        textTransform: "uppercase",
        borderBottom: `1px solid ${CK.border}`,
        alignItems: "center",
      }}>
        <span>Ticker</span>
        <span>Strength</span>
        <span>Setups</span>
        <span>Score</span>
        <span>Horizon · Expiry</span>
        <span>Fresh</span>
        <span style={{ textAlign: "right" }}>
          {onRefresh && (
            <button onClick={onRefresh} style={{
              background: "transparent", border: `1px solid ${CK.border}`,
              color: CK.muted, borderRadius: 3,
              padding: "2px 6px", cursor: "pointer", fontSize: 10,
            }} title="Refresh universe">↻</button>
          )}
        </span>
      </div>
      {rows.length === 0 && (
        <div style={{ padding: 18, color: CK.muted, fontSize: 12 }}>
          Loading universe…
        </div>
      )}
      {rows.map(row => {
        const isSel = row.ticker === selectedAsset;
        const fresh = freshness(row.payload?.cached_at);
        return (
          <div
            key={row.ticker}
            onClick={() => onSelect(row.ticker)}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 80px 1fr 110px 170px 70px 30px",
              alignItems: "center", gap: 14, padding: "8px 18px",
              cursor: "pointer",
              background: isSel ? "#182232" : "transparent",
              boxShadow: isSel ? `inset 3px 0 0 ${CK.info}` : "none",
              borderBottom: "1px solid #131a24",
              height: 36, transition: "background 120ms",
            }}
          >
            <span style={{ fontWeight: 700, color: CK.text, letterSpacing: "0.5px" }}>{row.ticker}</span>
            <StrengthDots score={row.score} />
            <span>{setupsSummary(row.payload)}</span>
            <span style={{ color: CK.text, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
              {typeof row.score === "number" ? `${row.score.toFixed(0)}` : "—"}
            </span>
            <span style={{ color: CK.muted, fontSize: 11 }}>{expiryLabel(row.payload)}</span>
            <span style={{ color: fresh.color, fontSize: 11 }}>{fresh.label}</span>
            <span style={{ textAlign: "right", color: isSel ? CK.info : CK.dim, fontSize: 11 }}>▶</span>
          </div>
        );
      })}
    </div>
  );
}
