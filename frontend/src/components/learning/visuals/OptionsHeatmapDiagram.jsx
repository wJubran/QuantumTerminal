// OptionsHeatmapDiagram — schematic of the options-quant heatmap surface.
// A 22×14 grid of cells tinted by probability density (peaked near spot,
// widening with time) + all the reference lines (MAX PAIN, FLIP, CALL WALL,
// PUT WALL, HVL, EXP±) the live panel draws on top.

import React, { useMemo } from "react";

const COLS = 22;   // time steps
const ROWS = 14;   // price buckets
const X0 = 35;     // left margin (leave room for y-axis tags)
const Y0 = 20;     // top margin
const W  = 390;    // plot width
const H  = 160;    // plot height
const CELL_W = W / COLS;
const CELL_H = H / ROWS;

// Density: bright ridge near the "spot" row, widening with time.
function density(col, row) {
  const centerRow = (ROWS - 1) * 0.55; // slightly above middle (drift up)
  const widen = 1 + col * 0.18;
  const dRow = (row - centerRow) / widen;
  const g = Math.exp(-(dRow * dRow) / 3);
  return Math.min(1, g * (1 + col * 0.01));
}

function cellColor(v) {
  // Ramp dark-navy → orange → yellow
  if (v < 0.08) return `rgba(20,28,42, ${0.6})`;
  const a = Math.min(1, v * 1.15);
  // mix between orange (#ff6d00) and yellow (#ffd800) by v
  const mix = v * v;
  const r = Math.round(0xff);
  const g = Math.round(0x6d + (0xd8 - 0x6d) * mix);
  const b = Math.round(0x00 + (0x00 - 0x00) * mix);
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

export default function OptionsHeatmapDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  const cells = useMemo(() => {
    const out = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        out.push({ c, r, v: density(c, r) });
      }
    }
    return out;
  }, []);

  // Convert a row index → y pixel
  const rowY = (r) => Y0 + r * CELL_H + CELL_H / 2;

  // Reference lines (row indices → price bands)
  const lines = [
    { row: 4,   color: "#e8383b", label: "CALL WALL", dash: "5 2" },
    { row: 5.5, color: "#555",    label: "EXP+",      dash: "2 5" },
    { row: 7.8, color: "#9b59b6", label: "MAX PAIN",  dash: "3 4" },
    { row: 8.2, color: "#ff6d00", label: "FLIP",      dash: "5 3" },
    { row: 9.2, color: "#ffd800", label: "HVL",       dash: "2 4" },
    { row: 11,  color: "#555",    label: "EXP−",      dash: "2 5" },
    { row: 12,  color: "#2ebd59", label: "PUT WALL",  dash: "5 2" },
  ];

  // Spot (cyan line)
  const spotRow = 8.5;

  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width="460" height="220" fill="#0a0a0a"/>

      {/* Heatmap grid */}
      {cells.map((c, i) => (
        <rect key={i}
          x={X0 + c.c * CELL_W}
          y={Y0 + c.r * CELL_H}
          width={CELL_W + 0.5}
          height={CELL_H + 0.5}
          fill={cellColor(c.v)}
        />
      ))}

      {/* Reference lines + left labels */}
      {lines.map((l, i) => {
        const y = rowY(l.row);
        const labelW = 8 + l.label.length * 5.2;
        return (
          <g key={i}>
            <line x1={X0} y1={y} x2={X0 + W} y2={y}
              stroke={l.color} strokeWidth="1" strokeDasharray={l.dash} opacity="0.9"/>
            <rect x={X0 + 2} y={y - 6} width={labelW} height={12}
              fill="#000" fillOpacity="0.72"
              stroke={l.color} strokeOpacity="0.6" strokeWidth="0.5" rx="2"/>
            <text x={X0 + 5} y={y + 3}
              fill={l.color} fontSize="8" fontFamily="monospace" fontWeight="800">
              {l.label}
            </text>
          </g>
        );
      })}

      {/* Spot */}
      <line x1={X0} y1={rowY(spotRow)} x2={X0 + W} y2={rowY(spotRow)}
        stroke="#22d3ee" strokeWidth="1.4"/>
      <rect x="2" y={rowY(spotRow) - 8} width={X0 - 4} height="16" fill="#22d3ee" rx="2"/>
      <text x={X0 / 2} y={rowY(spotRow) + 4} fill="#000" fontSize="9"
        fontFamily="monospace" fontWeight="800" textAnchor="middle">SPOT</text>

      {/* Axis tags */}
      <text x={X0} y="14" fill="#8b96a3" fontSize="8" fontFamily="monospace">
        {L("PRICE (y) · FORWARD DAYS (x)", "السعر (y) · الأيام للأمام (x)")}
      </text>
      <text x={X0 + W / 2} y="213" fill="#ffd89e" fontSize="9" fontFamily="monospace"
        textAnchor="middle" opacity="0.85">
        {L("Hotter cell = higher options-implied probability", "الخلية الأشد حرارة = احتمال أعلى وفق options")}
      </text>

      {/* Legend ramp on the right */}
      <g transform={`translate(${X0 + W + 8},${Y0})`}>
        <text x="0" y="-4" fill="#8b96a3" fontSize="7" fontFamily="monospace">HIGH</text>
        {Array.from({ length: 10 }).map((_, i) => {
          const v = 1 - i * 0.1;
          return <rect key={i} x="0" y={i * 12} width="12" height="12" fill={cellColor(v)}/>;
        })}
        <text x="0" y="134" fill="#8b96a3" fontSize="7" fontFamily="monospace">LOW</text>
      </g>
    </svg>
  );
}
