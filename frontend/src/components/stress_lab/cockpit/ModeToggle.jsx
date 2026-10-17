// version: v1
// ModeToggle.jsx — controlled two-state toggle for Intraday | Swing.
// Parent owns the state; this component renders the visual + emits onChange.
import React from "react";
import { CK, mono } from "./cockpit_theme";

export default function ModeToggle({ value, onChange }) {
  const modes = [
    { id: "intraday", label: "Intraday" },
    { id: "swing",    label: "Swing"    },
  ];
  return (
    <div style={{
      display: "inline-flex", background: "#161c26",
      border: `1px solid ${CK.border}`, borderRadius: 6, padding: 2,
      fontFamily: mono,
    }} role="tablist" aria-label="cockpit-horizon">
      {modes.map(m => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.id)}
            style={{
              border: 0, padding: "5px 14px", cursor: "pointer",
              background: active ? CK.info : "transparent",
              color:      active ? "#061018" : CK.muted,
              fontFamily: mono, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.4px", textTransform: "uppercase",
              borderRadius: 4,
            }}
          >{m.label}</button>
        );
      })}
    </div>
  );
}
