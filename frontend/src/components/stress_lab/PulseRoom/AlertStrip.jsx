// version: v2
// AlertStrip.jsx — Near Impact Alerts list below the asset grid.
// Pill colors are now keyed off `contributor.origin` (cone time scope or
// "bands"), matching the radar dot color, instead of the legacy CO/QB split.

import React from "react";
import { colorFor, labelFor } from "./originColors";
import css from "./styles.module.css";

export default function AlertStrip({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className={css.alertStrip}>
      <div className={css.alertHeader}>Near Impact Alerts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {alerts.map(a => {
          const rowClass = a.level === "high" ? css.alertCrit : css.alertWarn;
          return (
            <div key={a.symbol} className={rowClass}
                 style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className={css.alertAsset}>{a.symbol}</span>
              <span className={css.alertBody}>{a.text}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {a.contributors?.slice(0, 2).map(c => {
                  const col = colorFor(c.origin);
                  return (
                    <span key={c.id}
                          className={css.tag}
                          style={{
                            color: col,
                            borderColor: col + "44",
                            background: col + "1A",
                          }}>
                      {labelFor(c.origin)}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
