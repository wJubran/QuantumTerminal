// version: v2
// v2 — Added CalibratingBadge to header. Whole panel is a placeholder
//      until DC ships flip_conditions[] (msg #122 design contract sent).
// version: v1
// FlipConditionsPanel.jsx — Phase 1 placeholder.
// Replaced in Phase 2 by a bullet list driven by DC's flip_conditions[].
import React from "react";
import { CK, mono } from "./cockpit_theme";
import CalibratingBadge from "../../shared/CalibratingBadge"; // v2

export default function FlipConditionsPanel() {
  return (
    <div style={{
      background: CK.bgCard, border: `1px solid ${CK.border}`,
      borderRadius: 8, overflow: "hidden", fontFamily: mono,
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CK.border}`,
        fontSize: 11, color: CK.muted, letterSpacing: "0.8px",
        textTransform: "uppercase", display: "flex",
        justifyContent: "space-between", alignItems: "center", gap: 8,
      }}>
        <span>What would flip the verdict</span>
        <CalibratingBadge tooltip="Calibrating — placeholder text only. DC's flip_conditions[] not shipped yet (msg #122 design contract sent). Watch the Signal Stack for STRONG_* ↔ *_BALANCED transitions and Retail Trap CLEAR ↔ TRAP_ACTIVE in the meantime." />
      </div>
      <div style={{ padding: 14, color: CK.textSoft, fontSize: 12, lineHeight: 1.6 }}>
        <div style={{
          padding: 12, borderLeft: `2px solid ${CK.warn}`,
          background: "#0d1218", borderRadius: "0 4px 4px 0",
        }}>
          Dynamic flip conditions render here when DC ships
          <code> flip_conditions[]</code> in the options payload. Until then,
          watch the Signal Stack for `STRONG_*` ↔ `*_BALANCED` transitions
          and Retail Trap `CLEAR ↔ TRAP_ACTIVE`.
        </div>
      </div>
    </div>
  );
}
