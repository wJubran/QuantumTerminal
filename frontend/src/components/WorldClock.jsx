/**
 * WorldClock.jsx — World Clock Display
 * Quantum Terminal | Phase 4D
 *
 * Shows up to 4 configurable clock slots in the terminal header.
 * Each slot: city label + time + session indicator (orange = in session, gray = out).
 * Session labels: "PRE-MARKET", "AM SESSION", "LUNCH", "PM SESSION", etc.
 *
 * Props:
 *   config      — { worldClocks: [{city, enabled}], showWorldClock: boolean }
 *   className   — optional extra class
 */
import { useState, useEffect } from "react";
import { TIMEZONE_PRESETS, getTimeInZone, getSessionStatus } from "./time_utils";

const C = {
  bg: "#000", bgPanel: "#0a0a0a", bgCard: "#111",
  border: "#222", borderLt: "#333",
  white: "#fff", gray: "#999", muted: "#444",
  orange: "#ff6d00", green: "#2ebd59",
};
const mono = "'Courier New', Consolas, monospace";

export default function WorldClock({ config }) {
  const [, setTick] = useState(0);

  // Tick every second
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!config?.showWorldClock) return null;

  const clocks = config.worldClocks || [];
  const enabled = clocks.filter(c => c.enabled);
  if (enabled.length === 0) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: mono,
    }}>
      <span style={{ color: C.border }}>|</span>
      {enabled.map((slot, i) => {
        const preset = TIMEZONE_PRESETS[slot.city];
        if (!preset) return null;

        const time = getTimeInZone(slot.city);
        const session = getSessionStatus(slot.city);
        const isActive = session.inSession;

        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {/* Session dot */}
            <span style={{
              display: "inline-block", width: 5, height: 5, borderRadius: "50%",
              background: isActive ? C.orange : C.muted,
              boxShadow: isActive ? `0 0 4px ${C.orange}` : "none",
            }} />
            {/* City label */}
            <span style={{
              fontSize: "7px", color: isActive ? C.orange : C.muted,
              fontWeight: 700, letterSpacing: "0.5px",
            }}>
              {preset.label.slice(0, 3)}
            </span>
            {/* Time */}
            <span style={{
              fontSize: "9px", color: isActive ? C.white : C.gray,
              fontVariantNumeric: "tabular-nums",
            }}>
              {time.timeStr.slice(0, 5)}
            </span>
            {/* Session label */}
            <span style={{
              fontSize: "6px", color: session.color,
              fontWeight: 600, letterSpacing: "0.3px",
              maxWidth: 55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {session.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
