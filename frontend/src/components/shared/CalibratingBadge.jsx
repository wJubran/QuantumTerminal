// version: v1
// CalibratingBadge.jsx — small amber "⚠ CALIBRATING" pill placed on
// blocks whose verdict / classification is not yet trustworthy.
// Hover-tooltip explains what's specifically still being calibrated.
//
// REMOVAL CHECKLIST: when DC validates a block, REMOVE the badge from
// that block's wiring (search the codebase for `<CalibratingBadge`).
// See memory file `project_calibrating_badges_to_remove.md` for the
// per-block validation conditions that retire each badge.
import React from "react";

export default function CalibratingBadge({
  tooltip = "Calibrating — don't trust this signal yet. Producer-side cutoffs / formula are provisional.",
  label   = "⚠ CALIBRATING",
}) {
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "1px 6px", borderRadius: 3,
        fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", lineHeight: 1.3,
        background: "rgba(255,171,0,0.10)",
        color:      "#ffab00",
        border:     "1px solid rgba(255,171,0,0.30)",
        cursor:     "help",
        fontFamily: "ui-monospace, monospace",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
