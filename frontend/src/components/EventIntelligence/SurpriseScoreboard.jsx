// version: v2
// SurpriseScoreboard — per-currency aggregate stats. v2: 2× fonts.

import { useMemo } from "react";
import { C, mono } from "./theme";
import { currencyMeta } from "./dictionaries";
import { scoreboardByCurrency } from "./utils";

const LEAN_META = {
  "bullish":         { label: "Bullish",  color: C.green },
  "bearish":         { label: "Bearish",  color: C.red   },
  "neutral":         { label: "Neutral",  color: C.gray  },
  "dovish-surprise": { label: "Dovish",   color: C.cyan  },
};

export default function SurpriseScoreboard({ recentSurprises, days = 30, onCurrencyClick }) {
  const stats = useMemo(() => scoreboardByCurrency(recentSurprises, days), [recentSurprises, days]);

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, padding: "16px 18px",
      fontFamily: mono, color: C.white,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 14,
      }}>
        <span style={{
          fontSize: 20, color: C.gray, fontWeight: 700, letterSpacing: "2px",
          textTransform: "uppercase",
        }}>Surprise Scoreboard</span>
        <span style={{ fontSize: 14, color: C.muted, letterSpacing: "1px" }}>
          last {days}d · click to filter
        </span>
      </div>

      {stats.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 16, padding: 22, textAlign: "center" }}>
          No surprise data in window.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{
            display: "flex", gap: 14, padding: "6px 8px 8px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 14, color: C.muted, letterSpacing: "1.2px",
          }}>
            <span style={{ width: 60 }}>CCY</span>
            <span style={{ width: 110 }}>BEATS</span>
            <span style={{ flex: 1, textAlign: "right" }}>AVG</span>
            <span style={{ width: 110, textAlign: "right" }}>LEAN</span>
          </div>
          {stats.map(s => {
            const meta = currencyMeta(s.code);
            const lean = LEAN_META[s.lean] || LEAN_META.neutral;
            const ratio = s.total ? Math.round((s.beats / s.total) * 100) : 0;
            return (
              <div key={s.code}
                onClick={() => onCurrencyClick && onCurrencyClick(s.code)}
                style={{
                  display: "flex", gap: 14, alignItems: "center",
                  padding: "10px 8px", fontSize: 18,
                  borderBottom: `1px solid ${C.border}07`,
                  cursor: "pointer",
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg3}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{
                  width: 60, color: meta?.color || C.gray, fontWeight: 800, letterSpacing: "1.5px",
                }}>{s.code}</span>
                <span style={{ width: 110, color: C.white, fontVariantNumeric: "tabular-nums" }}>
                  {s.beats}/{s.total}
                  <span style={{ fontSize: 14, color: C.muted, marginLeft: 8 }}>{ratio}%</span>
                </span>
                <span style={{
                  flex: 1, textAlign: "right", fontVariantNumeric: "tabular-nums",
                  color: s.avgPct > 0 ? C.green : s.avgPct < 0 ? C.red : C.gray,
                  fontWeight: 700,
                }}>
                  {s.avgPct >= 0 ? "+" : ""}{s.avgPct.toFixed(1)}%
                </span>
                <span style={{
                  width: 110, textAlign: "right",
                  fontSize: 16, fontWeight: 700, letterSpacing: "1.5px",
                  color: lean.color,
                }}>● {lean.label.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
