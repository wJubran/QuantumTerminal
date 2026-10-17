// OptionsLevelsDiagram — schematic of the GEX-levels ladder in the Options
// Quant page. Strikes listed vertically, call-GEX bars extend right (green),
// put-GEX bars extend left (red). Flip zone is where call ≈ put. Walls are
// the heaviest bars. Spot line sits horizontally across.

import React from "react";

const LEFT_AXIS  = 60;   // x of the centerline (spot axis)
const BAR_MAX    = 180;  // half-width of the widest bar
const PLOT_X     = LEFT_AXIS - BAR_MAX;   // left-most bar starts here
const PLOT_W     = BAR_MAX * 2;
const ROW_H      = 14;
const TOP        = 24;

// Strikes top→bottom (high price → low price).
// Each strike has callGex (drawn right, green) and putGex (drawn left, red).
// Magnitudes are schematic; pattern: puts dominate above spot (resistance),
// calls dominate below spot (support) — classic positive-GEX backdrop.
const LEVELS = [
  { strike: "6800", call: 15,  put: 130, isCallWall: false, isPutWall: false },
  { strike: "6750", call: 22,  put: 95,  isCallWall: false, isPutWall: false },
  { strike: "6700", call: 35,  put: 160, isCallWall: false, isPutWall: true  }, // PUT WALL
  { strike: "6650", call: 48,  put: 110, isCallWall: false, isPutWall: false },
  { strike: "6620", call: 75,  put: 80,  isCallWall: false, isPutWall: false, isFlip: true },
  { strike: "6600", call: 100, put: 60,  isCallWall: false, isPutWall: false, isSpot: true },
  { strike: "6580", call: 135, put: 45,  isCallWall: false, isPutWall: false },
  { strike: "6550", call: 175, put: 30,  isCallWall: true,  isPutWall: false }, // CALL WALL
  { strike: "6500", call: 100, put: 22,  isCallWall: false, isPutWall: false },
  { strike: "6450", call: 60,  put: 18,  isCallWall: false, isPutWall: false },
  { strike: "6400", call: 35,  put: 15,  isCallWall: false, isPutWall: false },
];

export default function OptionsLevelsDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width="460" height="220" fill="#0a0a0a"/>

      {/* Header labels */}
      <text x={LEFT_AXIS - BAR_MAX / 2} y="14" fill="#e8383b" fontSize="9"
        fontFamily="monospace" textAnchor="middle" fontWeight="700">PUT GEX ←</text>
      <text x={LEFT_AXIS + BAR_MAX / 2} y="14" fill="#2ebd59" fontSize="9"
        fontFamily="monospace" textAnchor="middle" fontWeight="700">→ CALL GEX</text>

      {/* Centerline (strike axis) */}
      <line x1={LEFT_AXIS} y1={TOP - 6} x2={LEFT_AXIS} y2={TOP + LEVELS.length * ROW_H + 6}
        stroke="#333" strokeWidth="1"/>

      {LEVELS.map((lvl, i) => {
        const y = TOP + i * ROW_H;
        const putW  = (lvl.put  / 200) * BAR_MAX;
        const callW = (lvl.call / 200) * BAR_MAX;
        return (
          <g key={i}>
            {/* Strike label (left) */}
            <text x={PLOT_X - 4} y={y + 7} fill="#c5cdd9"
              fontSize="8" fontFamily="monospace" textAnchor="end">
              {lvl.strike}
            </text>

            {/* Put bar — extends LEFT from centerline */}
            <rect x={LEFT_AXIS - putW} y={y + 2} width={putW} height={ROW_H - 4}
              fill="#e8383b" fillOpacity={lvl.isPutWall ? 0.9 : 0.55}
              stroke={lvl.isPutWall ? "#ff5e5e" : "none"}
              strokeWidth={lvl.isPutWall ? 1 : 0}/>

            {/* Call bar — extends RIGHT from centerline */}
            <rect x={LEFT_AXIS} y={y + 2} width={callW} height={ROW_H - 4}
              fill="#2ebd59" fillOpacity={lvl.isCallWall ? 0.9 : 0.55}
              stroke={lvl.isCallWall ? "#4ade80" : "none"}
              strokeWidth={lvl.isCallWall ? 1 : 0}/>

            {/* Wall tag */}
            {lvl.isPutWall && (
              <text x={LEFT_AXIS - putW - 4} y={y + 9} fill="#ff5e5e"
                fontSize="8" fontFamily="monospace" textAnchor="end" fontWeight="800">
                ← PUT WALL
              </text>
            )}
            {lvl.isCallWall && (
              <text x={LEFT_AXIS + callW + 4} y={y + 9} fill="#4ade80"
                fontSize="8" fontFamily="monospace" fontWeight="800">
                CALL WALL →
              </text>
            )}

            {/* Flip marker (horizontal dashed line across full width) */}
            {lvl.isFlip && (
              <g>
                <line x1={PLOT_X} y1={y + ROW_H / 2} x2={PLOT_X + PLOT_W} y2={y + ROW_H / 2}
                  stroke="#ff6d00" strokeWidth="1" strokeDasharray="4 3"/>
                <rect x={PLOT_X + PLOT_W + 4} y={y + 1} width="40" height="12"
                  fill="#ff6d00" fillOpacity="0.18"
                  stroke="#ff6d00" strokeOpacity="0.7" strokeWidth="0.6" rx="2"/>
                <text x={PLOT_X + PLOT_W + 8} y={y + 10} fill="#ff6d00"
                  fontSize="8" fontFamily="monospace" fontWeight="800">
                  FLIP
                </text>
              </g>
            )}

            {/* Spot marker (cyan line across) */}
            {lvl.isSpot && (
              <g>
                <line x1={PLOT_X} y1={y + ROW_H / 2} x2={PLOT_X + PLOT_W} y2={y + ROW_H / 2}
                  stroke="#22d3ee" strokeWidth="1.5"/>
                <rect x={PLOT_X + PLOT_W + 4} y={y + 1} width="40" height="12"
                  fill="#22d3ee" rx="2"/>
                <text x={PLOT_X + PLOT_W + 24} y={y + 10} fill="#000"
                  fontSize="8" fontFamily="monospace" fontWeight="800"
                  textAnchor="middle">
                  SPOT
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Caption */}
      <text x="230" y="215" fill="#ffd89e" fontSize="9" fontFamily="monospace"
        textAnchor="middle" opacity="0.85">
        {L("Bar size = dealer gamma at that strike",
           "حجم الـ bar = dealer gamma عند ذاك الـ strike")}
      </text>
    </svg>
  );
}
