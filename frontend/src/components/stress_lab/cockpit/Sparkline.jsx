// version: v1
// Sparkline.jsx — small SVG sparkline used in the Signal Stack.
//
// Phase 1: callers pass a flat-line series (`[v, v, v, ...]`) as a
// placeholder; the line renders flat at the SVG mid-point.
// Phase 2: callers pass the real signal_history series from DC's
// /api/options/{ticker}/history?lookback_h=N endpoint.
//
// Pure transform `sparklinePoints` is exported separately so the math
// is unit-testable without rendering.
import React from "react";

// Returns an SVG-polyline points-string ("x1,y1 x2,y2 ...") or null when
// the series is too small to draw.
export function sparklinePoints(series, width, height) {
  if (!Array.isArray(series) || series.length < 2) return null;
  let min = Infinity, max = -Infinity;
  for (const v of series) {
    if (typeof v !== "number" || !isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return null;
  const range = max - min;
  const n     = series.length;
  const pts   = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    // Flat series → mid-line; otherwise scale into [height*0.1, height*0.9]
    // and invert (SVG y grows down).
    let y;
    if (range === 0) {
      y = height / 2;
    } else {
      const norm = (series[i] - min) / range;          // 0..1
      const inset = height * 0.1;
      y = height - inset - norm * (height - 2 * inset);
    }
    pts.push(`${x},${y}`);
  }
  return pts.join(" ");
}

export default function Sparkline({
  series, width = 120, height = 24, color = "#8b949e", strokeWidth = 1.6,
}) {
  const pts = sparklinePoints(series, width, height);
  if (!pts) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2}
              stroke={color} strokeWidth={1} strokeDasharray="2,2" opacity="0.4" />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth={strokeWidth} points={pts} />
    </svg>
  );
}
