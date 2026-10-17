/**
 * DebugPanel.jsx — Debug/error log panel for the terminal.
 * Quantum Terminal | Phase 4A
 *
 * Slide-out panel (toggled from nav bar) showing timestamped logs from:
 *   - Orchestrator runs (status, progress, errors)
 *   - Calculation pipeline (per-ticker status, errors)
 *   - WebSocket connection events
 *   - CALC ALL batch progress
 *   - General terminal errors
 *
 * Uses a shared log store (passed as prop) — parent manages the log array.
 */
import { useState, useEffect, useRef, useMemo } from "react";

const C = {
  bg: "#000", bgPanel: "#0a0a0a", bgCard: "#111", bgHover: "#1a1a1a",
  border: "#222", borderLt: "#333", white: "#fff", gray: "#999", muted: "#444",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", cyan: "#00d2d3",
};
const mono = "'Courier New', Consolas, monospace";

const LEVEL_COLORS = {
  info: C.gray,
  success: C.green,
  warn: C.orange,
  error: C.red,
  debug: C.muted,
};

const LEVEL_ICONS = {
  info: "ℹ",
  success: "✓",
  warn: "⚠",
  error: "✗",
  debug: "⊡",
};

export default function DebugPanel({ open, onClose, logs = [] }) {
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("all"); // all, error, warn, info, success

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, autoScroll]);

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter(l => l.level === filter);
  }, [logs, filter]);

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 420, zIndex: 1000,
      background: C.bg, borderLeft: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.8)",
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.bgPanel,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "10px", fontWeight: 800, color: C.orange, fontFamily: mono, letterSpacing: "1.5px" }}>
            DEBUG LOG
          </span>
          <span style={{ fontSize: "8px", color: C.muted, fontFamily: mono }}>
            {logs.length} entries
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setAutoScroll(!autoScroll)} style={{
            background: autoScroll ? `${C.green}20` : "transparent",
            border: `1px solid ${autoScroll ? C.green + "50" : C.border}`,
            color: autoScroll ? C.green : C.muted,
            padding: "1px 5px", cursor: "pointer", fontSize: "7px",
            fontWeight: 700, fontFamily: mono,
          }}>
            {autoScroll ? "AUTO ↓" : "SCROLL"}
          </button>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${C.border}`,
            color: C.muted, cursor: "pointer", padding: "1px 8px",
            fontSize: "12px", fontFamily: mono,
          }}>✕</button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{
        display: "flex", gap: 2, padding: "4px 12px",
        borderBottom: `1px solid ${C.border}`, background: C.bg, flexShrink: 0,
      }}>
        {["all", "error", "warn", "info", "success", "debug"].map(f => {
          const count = f === "all" ? logs.length : logs.filter(l => l.level === f).length;
          const isActive = filter === f;
          const color = f === "all" ? C.orange : LEVEL_COLORS[f] || C.muted;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: isActive ? `${color}20` : "transparent",
              border: `1px solid ${isActive ? color + "50" : C.border}`,
              color: isActive ? color : C.muted,
              padding: "1px 5px", cursor: "pointer", fontSize: "7px",
              fontWeight: 700, fontFamily: mono,
            }}>
              {f.toUpperCase()} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* LOG ENTRIES */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "4px 0", minHeight: 0,
      }}
        onScroll={(e) => {
          const el = e.target;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
          if (autoScroll && !atBottom) setAutoScroll(false);
        }}
      >
        {filtered.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: C.muted, fontSize: "9px", fontFamily: mono,
          }}>
            {filter === "all" ? "No log entries yet" : `No ${filter} entries`}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={entry.id || i} style={{
              display: "flex", gap: 6, padding: "3px 12px",
              borderBottom: `1px solid ${C.border}08`,
              background: i % 2 === 0 ? "transparent" : C.bgPanel + "40",
              fontSize: "8px", fontFamily: mono, lineHeight: 1.4,
            }}>
              {/* Timestamp */}
              <span style={{ color: C.muted, flexShrink: 0, width: 55 }}>
                {entry.time || ""}
              </span>
              {/* Level icon */}
              <span style={{ color: LEVEL_COLORS[entry.level] || C.muted, flexShrink: 0, width: 10, textAlign: "center" }}>
                {LEVEL_ICONS[entry.level] || "·"}
              </span>
              {/* Source tag */}
              {entry.source && (
                <span style={{
                  color: C.bg, background: LEVEL_COLORS[entry.level] || C.muted,
                  padding: "0 3px", fontSize: "6.5px", fontWeight: 700,
                  flexShrink: 0, lineHeight: "14px", letterSpacing: "0.5px",
                }}>
                  {entry.source}
                </span>
              )}
              {/* Message */}
              <span style={{
                color: entry.level === "error" ? C.red : entry.level === "warn" ? C.orange : C.gray,
                wordBreak: "break-word", flex: 1,
              }}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* FOOTER */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${C.border}`,
        background: C.bgPanel, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: "7px", color: C.muted, fontFamily: mono,
      }}>
        <span>
          {filtered.length === logs.length
            ? `${logs.length} total`
            : `${filtered.length} of ${logs.length} shown`}
        </span>
        <span style={{ letterSpacing: "1px" }}>ESC TO CLOSE</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// LOG HELPER — creates properly formatted log entries
// ════════════════════════════════════════════════════════
let _logId = 0;

/**
 * Create a log entry. Used by the parent component to push into the logs array.
 * @param {"info"|"success"|"warn"|"error"|"debug"} level
 * @param {string} source - e.g. "ORCH", "CALC", "WS", "CALC_ALL"
 * @param {string} message
 */
export function createLogEntry(level, source, message) {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour12: false }) + "." + String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
  return {
    id: ++_logId,
    level,
    source: source?.toUpperCase(),
    message,
    time,
    timestamp: now.getTime(),
  };
}
