// version: v1
// chartSeparators.js — pure helpers for vertical session-separator overlays.
// Pure functions only; no DOM, no React. The drawing-side mount logic lives
// in MainChart.jsx's useEffect that wires this in.

const NY_TZ = "America/New_York";

// Cache one DateTimeFormat instance — Intl.DateTimeFormat construction is
// surprisingly hot when called per-bar.
const _hhmmFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function _hhmmInNY(unixSec) {
  // Returns "HH:MM" wall-clock in America/New_York.
  // Intl uses 24-hour because hour12: false; "24" is normalized to "00".
  const parts = _hhmmFormatter.formatToParts(new Date(unixSec * 1000));
  let hh = "00", mm = "00";
  for (const p of parts) {
    if (p.type === "hour")   hh = p.value === "24" ? "00" : p.value.padStart(2, "0");
    if (p.type === "minute") mm = p.value.padStart(2, "0");
  }
  return `${hh}:${mm}`;
}

/**
 * Walk `bars` (each {time: unix-seconds}) and return the unix-seconds where
 * a bar matches the configured boundary wall-clock. For each boundary, the
 * smallest bar whose NY-local time is >= the threshold within the same NY
 * day counts (so a 1-hour grid still produces a stamp even if the threshold
 * is :30). To keep the helper simple we use exact-string match for now —
 * caller is expected to pass bar timeframes that line up. If timeframes
 * don't align (e.g. 1-min bars on a 17:00 boundary), the function still
 * works; if they don't (e.g. :30 boundary on hour-bars), the boundary is
 * silently skipped — fine for v1.
 *
 * @param {Array<{time: number}>} bars
 * @param {{ rthOpen: string|null, marketClose: string|null }} sessions
 * @returns {{ close: number[], rth: number[] }}
 */
export function findBoundaryBars(bars, sessions) {
  const out = { close: [], rth: [] };
  if (!Array.isArray(bars) || bars.length === 0) return out;
  const wantClose = sessions?.marketClose || null;
  const wantRth   = sessions?.rthOpen     || null;
  if (!wantClose && !wantRth) return out;
  for (const bar of bars) {
    if (typeof bar?.time !== "number") continue;
    const hhmm = _hhmmInNY(bar.time);
    if (wantClose && hhmm === wantClose) out.close.push(bar.time);
    if (wantRth   && hhmm === wantRth)   out.rth.push(bar.time);
  }
  return out;
}

/**
 * Canvas line-dash array for a style name. "solid" → [], "dashed" → [6,4],
 * "dotted" → [2,3]. Unknown values fall back to solid.
 */
export function lineDashFor(style) {
  switch (style) {
    case "dashed": return [6, 4];
    case "dotted": return [2, 3];
    default:       return [];
  }
}

/**
 * Draw a vertical line on a canvas context at x position `x`, from y=0 to
 * y=height. Sets stroke style + line width + dash pattern from `style` block
 * (fields: color, style, width).
 */
export function drawVerticalLine(ctx, x, height, style) {
  if (x == null || !isFinite(x)) return;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = style?.color || "#666";
  ctx.lineWidth   = Math.min(4, Math.max(1, style?.width || 1));
  ctx.setLineDash(lineDashFor(style?.style));
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();
}
