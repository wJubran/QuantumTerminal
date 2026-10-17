// version: v1
// alertText.js — generates the headline alert string for an asset
// based on its top contributors.
//
// Templates per docs/specs/2026-05-04-pulse-room-design.md §3.4

export function generateAlertText(contributors) {
  if (!contributors || contributors.length === 0) return null;

  const top = contributors.slice(0, 2);

  if (top.length === 1) {
    const c = top[0];
    return `${c.label} — ${Math.round(c.distPips)} pips ${c.side}`;
  }

  // Two contributors
  const [a, b] = top;
  if (a.side === b.side) {
    return `${a.label} + ${b.label} converging — ${Math.round(Math.min(a.distPips, b.distPips))} pips ${a.side}`;
  }
  // Mixed sides — price between two levels
  const above = a.side === "above" ? a : b;
  const below = a.side === "below" ? a : b;
  return `${above.label} above + ${below.label} below — price between`;
}
