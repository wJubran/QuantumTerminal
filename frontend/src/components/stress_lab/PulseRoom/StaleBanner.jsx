// version: v1
// StaleBanner.jsx — amber banner shown when the snapshot is stale and
// scanner is OFF (when ON, auto-rebuild handles it transparently).

import React from "react";
import css from "./styles.module.css";

export default function StaleBanner({ ageMs, onRecalc, calculating }) {
  const minutes = Math.floor(ageMs / 60_000);
  return (
    <div className={css.staleBanner}>
      <span>Snapshot is stale ({minutes} min old)</span>
      <button onClick={onRecalc} disabled={calculating}
              style={{ background: "transparent", color: "#E8B84B",
                       border: "1px solid #E8B84B", padding: "3px 10px",
                       fontSize: 9, letterSpacing: 2, cursor: "pointer",
                       textTransform: "uppercase", borderRadius: 3,
                       fontFamily: "monospace" }}>
        {calculating ? "Calculating…" : "Recalculate"}
      </button>
    </div>
  );
}
