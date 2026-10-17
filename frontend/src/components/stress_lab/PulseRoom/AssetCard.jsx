// version: v2
// AssetCard.jsx — single asset card in the radar grid.
// Header (symbol + score badge), price label, then a flex row containing:
//   - element list (left): top-N visible elements with origin swatch + label
//   - radar (right)        : glowing dots colored by origin, APEX badges on overlap
//
// APEX detection mirrors RadarCanvas's positioning math so the JSX list and
// the canvas agree on which dots overlap.

import React, { useMemo } from "react";
import RadarCanvas from "./RadarCanvas";
import { colorFor } from "./originColors";
import css from "./styles.module.css";

// Must mirror RadarCanvas constants
const RADAR_R = 72;
const RADAR_CX = 77;
const RADAR_CY = 77;
const APEX_THRESHOLD_PX = 10;

// How many contributors render on the radar / element list
const TOP_N = 8;

function jitterFromId(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ((h % 1000) / 1000 - 0.5) * 0.8;
}
function angleFor(c, idx) {
  const base = c.side === "above" ? -Math.PI / 2 : Math.PI / 2;
  return base + jitterFromId(c.id || `idx${idx}`);
}
function distFor(c) {
  const p = Math.max(0, Math.min(1, c.proximity ?? 0));
  return 1 - p;
}
function radarPos(c, idx) {
  const a = angleFor(c, idx);
  const d = distFor(c);
  return {
    x: RADAR_CX + d * RADAR_R * Math.cos(a),
    y: RADAR_CY + d * RADAR_R * Math.sin(a),
  };
}
function findApex(contributors) {
  const apex = new Set();
  for (let i = 0; i < contributors.length; i++) {
    for (let j = i + 1; j < contributors.length; j++) {
      const p1 = radarPos(contributors[i], i);
      const p2 = radarPos(contributors[j], j);
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      if (Math.sqrt(dx * dx + dy * dy) < APEX_THRESHOLD_PX) {
        apex.add(contributors[i].id);
        apex.add(contributors[j].id);
      }
    }
  }
  return apex;
}

export default function AssetCard({ card }) {
  const { symbol, priceNow, score, level, contributors } = card;
  // Top N by proximity (already sorted desc in scoring.js)
  const top = (contributors || []).slice(0, TOP_N);
  const apexIds = useMemo(() => findApex(top), [top]);

  const borderClass =
    level === "high" ? css.borderHigh :
    level === "med"  ? css.borderMed  :
    level === "low"  ? css.borderLow  :
                       css.borderDefault;
  const badgeClass =
    level === "high" ? css.scoreHigh :
    level === "med"  ? css.scoreMed  :
                       css.scoreLow;

  return (
    <div className={`${css.cardBg} ${borderClass}`}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className={css.white}
             style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          {symbol}
        </div>
        <div className={`${css.scoreBadge} ${badgeClass}`}>{score}</div>
      </div>

      {/* Price */}
      <div className={css.muted}
           style={{ fontFamily: "monospace", fontSize: 9, marginTop: 2 }}>
        {priceNow != null ? formatPrice(priceNow, symbol) : "—"}
      </div>

      {/* Body: element list (left) + radar (right) */}
      <div className={css.cardBody}>
        <div className={css.elementList}>
          {top.length === 0 ? (
            <div className={css.muted} style={{ fontStyle: "italic" }}>
              (no elements in range)
            </div>
          ) : top.map((c) => (
            <div key={c.id} className={css.elementRow}>
              <span className={css.swatch} style={{ background: colorFor(c.origin) }} />
              <span className={css.elementLabel}>{c.label}</span>
              {apexIds.has(c.id) && <span className={css.elementApex}>APEX</span>}
              <span className={css.elementDist}>{Math.round(c.distPips)}p</span>
            </div>
          ))}
        </div>
        <RadarCanvas contributors={top} tier={level} apexIds={apexIds} />
      </div>
    </div>
  );
}

function formatPrice(p, symbol) {
  // Simple decimals: more for FX, fewer for indices/metals.
  if (symbol?.endsWith("JPY")) return p.toFixed(3);
  if (/^[A-Z]{6}$/.test(symbol)) return p.toFixed(5);  // FX
  if (symbol === "BTCUSD") return p.toFixed(0);
  return p.toFixed(2);
}
