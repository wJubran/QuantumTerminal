// version: v1
// StatsFooter.jsx — bottom bar with aggregate counts and last-calc clock.

import React, { useEffect, useState } from "react";
import css from "./styles.module.css";

export default function StatsFooter({ counts, lastCalcAt, onRecalc, calculating, onEditWatchlist }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = lastCalcAt ? formatElapsed(now - new Date(lastCalcAt).getTime()) : "—";

  return (
    <div className={css.statsBar}>
      <span><span className={css.statLabel}>Scanned</span><span className={css.statValue}>{counts.scanned}</span></span>
      <div className={css.sep} />
      <span><span className={css.statLabel}>Impact</span>
            <span className={`${css.statValue} ${css.statValueImpact}`}>{counts.impact}</span></span>
      <div className={css.sep} />
      <span><span className={css.statLabel}>Elevated</span><span className={css.statValue}>{counts.elevated}</span></span>
      <div className={css.sep} />
      <span><span className={css.statLabel}>Quiet</span><span className={css.statValue}>{counts.quiet}</span></span>
      <div className={css.sep} />
      <span><span className={css.statLabel}>Last calc</span><span className={css.statValue}>{elapsed}</span></span>

      <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button onClick={onEditWatchlist} style={miniBtn}>Edit watchlist</button>
        <button onClick={onRecalc} disabled={calculating} style={miniBtn}>
          {calculating ? "…" : "Recalculate"}
        </button>
      </span>
    </div>
  );
}

const miniBtn = {
  background: "transparent", border: "1px solid #4A3C28",
  color: "#E8B84B", padding: "3px 10px",
  font: "8px monospace", letterSpacing: 2, textTransform: "uppercase",
  cursor: "pointer", borderRadius: 3,
};

function formatElapsed(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m.toString().padStart(2, "0")}:${ss}`;
}
