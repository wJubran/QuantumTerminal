// version: v2
// v2 — Optional `showCadence` prop renders a sibling label "updates every Nmin"
//      next to the freshness pill so users see both the age AND the producer's
//      refresh schedule at a glance. Off by default (back-compat); opt-in
//      per-card. Added TIER_CADENCE map mirroring TIER_THRESHOLDS.
// FreshnessBadge.jsx — small "Xm ago" badge color-coded against producer tier.
// Used by the legacy SauceView in OptionsPanel.jsx and (later) by the Options
// Cockpit's Signal Stack. Tier thresholds reflect DC's scheduler cadences
// shipped in format_version 2.4 (2026-05-14):
//   Tier A = 5 min  | green<5  amber<10  red≥10
//   Tier B = 15 min | green<15 amber<25  red≥25
//   Tier C = 30 min | green<30 amber<45  red≥45
//   Tier D = daily  | green<12h amber<24h red≥24h
// Renders nothing when computed_at is absent / unparseable AND showCadence is off.
import React from "react";

const TIER_THRESHOLDS = {
  A: { greenMin: 5,    amberMin: 10   },
  B: { greenMin: 15,   amberMin: 25   },
  C: { greenMin: 30,   amberMin: 45   },
  D: { greenMin: 720,  amberMin: 1440 }, // 12h / 24h
};

const TIER_CADENCE = {
  A: "5 min",
  B: "15 min",
  C: "30 min",
  D: "daily",
};

function ageMinutes(iso) {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return (Date.now() - t) / 60000;
}

function fmtAge(min) {
  if (min == null) return "—";
  if (min < 1)         return `${Math.max(1, Math.round(min*60))}s`;
  if (min < 60)        return `${Math.round(min)}m`;
  if (min < 24*60)     return `${Math.round(min/60)}h`;
  if (min < 48*60)     return `yest`;
  return `${Math.round(min/(24*60))}d`;
}

function colorFor(tier, age) {
  const t = TIER_THRESHOLDS[tier] || TIER_THRESHOLDS.B;
  if (age < t.greenMin) return { fg: "#00c853", bg: "rgba(0,200,83,0.10)",  border: "rgba(0,200,83,0.30)" };
  if (age < t.amberMin) return { fg: "#ffab00", bg: "rgba(255,171,0,0.10)", border: "rgba(255,171,0,0.30)" };
  return                       { fg: "#f44336", bg: "rgba(244,67,54,0.10)", border: "rgba(244,67,54,0.30)" };
}

export default function FreshnessBadge({ computedAt, tier = "B", title, showCadence = false }) {
  const age = ageMinutes(computedAt);
  const cadence = showCadence ? TIER_CADENCE[tier] : null;
  // If we have nothing to show (no age + no cadence opt-in), render nothing.
  if (age == null && !cadence) return null;
  const c = age != null ? colorFor(tier, age) : null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "ui-monospace, monospace",
    }}>
      {age != null && (
        <span
          title={title || (computedAt ? `Computed ${computedAt} (tier ${tier})` : null)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600,
            letterSpacing: "0.4px", lineHeight: 1.3,
            background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
          }}
        >
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: c.fg,
            display: "inline-block",
          }} />
          {fmtAge(age)}
        </span>
      )}
      {cadence && (
        <span style={{
          color: "#aaa", fontSize: 10, letterSpacing: "0.3px", whiteSpace: "nowrap",
        }}>
          updates every {cadence}
        </span>
      )}
    </span>
  );
}

/** Helper: pick the OLDEST computed_at among a list of ISO strings.
 *  Used by composite cards (e.g. IV & Sentiment Snapshot reads multiple blocks).
 *  Returns null if all inputs are null/invalid. */
export function oldestComputedAt(...isos) {
  let oldestMs = null;
  let oldestIso = null;
  for (const iso of isos) {
    if (!iso || typeof iso !== "string") continue;
    const t = Date.parse(iso);
    if (!isFinite(t)) continue;
    if (oldestMs == null || t < oldestMs) {
      oldestMs = t;
      oldestIso = iso;
    }
  }
  return oldestIso;
}
