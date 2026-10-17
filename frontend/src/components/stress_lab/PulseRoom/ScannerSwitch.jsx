// version: v1
// ScannerSwitch.jsx — top-bar toggle for live scanning.

import React from "react";
import css from "./styles.module.css";

export default function ScannerSwitch({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        background: "transparent",
        border: "1px solid " + (enabled ? "#50C878" : "#4A3C28"),
        padding: "4px 10px", cursor: "pointer", borderRadius: 3,
        display: "flex", alignItems: "center", gap: 6,
      }}
      aria-label={enabled ? "Scanner: ON" : "Scanner: OFF"}
    >
      {enabled
        ? (<><span className={css.liveDot} /><span className={css.liveText}>Scanning live</span></>)
        : <span className={css.scannerOff}>Scanner off</span>}
    </button>
  );
}
