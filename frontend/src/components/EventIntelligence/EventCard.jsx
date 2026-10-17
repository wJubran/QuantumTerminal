// version: v3
// v3 — countdown / eventDate now receive the full event object so per-event
//      time (ev.time) drives the headline countdown.
// EventCard — full-width detail card. v2: 2× fonts.

import { useMemo, useState } from "react";
import { C, mono } from "./theme";
import { describeEvent, affectedPairs, currencyMeta } from "./dictionaries";
import { countdown, eventHistory, eventDate, impactColor } from "./utils";

function MiniSparkline({ history, width = 220, height = 40 }) {
  if (!history || history.length < 2) return null;
  const pcts = history.map(h => Number(h.surprise_pct) || 0);
  const max = Math.max(1, ...pcts.map(Math.abs));
  const stepX = (width - 8) / Math.max(1, pcts.length - 1);
  const yOf = (v) => {
    const norm = (v + max) / (2 * max);
    return height - 4 - norm * (height - 8);
  };
  const path = pcts.map((v, i) => `${i === 0 ? "M" : "L"} ${4 + i * stepX} ${yOf(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <line x1={4} y1={yOf(0)} x2={width - 4} y2={yOf(0)} stroke={C.border2} strokeWidth={1} />
      <path d={path} fill="none" stroke={C.gray} strokeWidth={1.5} />
      {pcts.map((v, i) => (
        <circle key={i} cx={4 + i * stepX} cy={yOf(v)} r={2.5}
          fill={v >= 0 ? C.green : C.red} opacity={0.85} />
      ))}
    </svg>
  );
}

function ImpactDots({ impact }) {
  const k = (impact || "").toLowerCase();
  const col = impactColor(impact, C);
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[1, 2, 3].map(n => {
        const lit = (k === "high" && n <= 3) || (k === "medium" && n <= 2) || (k === "low" && n <= 1);
        return <span key={n} style={{
          width: 12, height: 12, borderRadius: "50%",
          background: lit ? col : C.bg4,
          border: `1px solid ${lit ? col : C.border}`,
        }} />;
      })}
    </span>
  );
}

export default function EventCard({ ev, kind = "upcoming", allRecent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = currencyMeta(ev?.currency);
  const desc = describeEvent(ev?.event);
  const pairs = affectedPairs(ev?.event, ev?.currency);
  const history = useMemo(() => eventHistory(allRecent, ev?.event, ev?.currency, 8), [allRecent, ev?.event, ev?.currency]);
  const cd = countdown(ev);
  const dateObj = eventDate(ev);
  const impactDotColor = impactColor(ev?.impact, C);

  const cdColor =
    cd.kind === "now"     ? C.orange :
    cd.kind === "minutes" ? C.red    :
    cd.kind === "hours"   ? C.amber  :
    cd.kind === "days"    ? C.cyan   : C.muted;

  const surprise = ev?.surprise_pct;
  const surpriseColorVal =
    !Number.isFinite(surprise) ? C.muted :
    surprise > 0 ? C.green :
    surprise < 0 ? C.red : C.gray;

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`,
      borderLeft: `5px solid ${impactDotColor}`,
      padding: "14px 18px",
      fontFamily: mono, color: C.white,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Top row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        <ImpactDots impact={ev?.impact} />
        <span style={{
          padding: "4px 12px",
          background: meta ? `${meta.color}22` : C.bg3,
          border: `1px solid ${meta ? `${meta.color}66` : C.border}`,
          color: meta?.color || C.gray,
          fontSize: 16, fontWeight: 800, letterSpacing: "2px",
        }}>{ev?.currency || "—"}</span>
        <span style={{
          fontSize: 22, fontWeight: 700, color: C.white,
          flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{ev?.event || "—"}</span>

        {kind === "upcoming" ? (
          <span title={dateObj ? dateObj.toLocaleString() : ""} style={{
            fontSize: 22, fontWeight: 700, color: cdColor,
            fontVariantNumeric: "tabular-nums",
          }}>{cd.primary}</span>
        ) : (
          <span style={{ fontSize: 16, color: C.muted, letterSpacing: "0.5px" }}>
            {ev?.date}
          </span>
        )}
      </div>

      {/* Numbers row */}
      <div style={{
        display: "flex", gap: 22,
        padding: "10px 0",
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        flexWrap: "wrap",
      }}>
        {kind === "recent" && (
          <div style={{ minWidth: 110 }}>
            <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px" }}>ACTUAL</div>
            <div style={{ fontSize: 26, color: C.white, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
              {ev?.actual ?? "—"}
            </div>
          </div>
        )}
        <div style={{ minWidth: 110 }}>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px" }}>FORECAST</div>
          <div style={{ fontSize: 24, color: C.orange, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {ev?.forecast ?? "—"}
          </div>
        </div>
        <div style={{ minWidth: 110 }}>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px" }}>PREVIOUS</div>
          <div style={{ fontSize: 24, color: C.gray, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {ev?.previous ?? "—"}
          </div>
        </div>
        {kind === "recent" && Number.isFinite(surprise) && (
          <div style={{ minWidth: 110 }}>
            <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px" }}>SURPRISE</div>
            <div style={{
              display: "inline-block", marginTop: 4,
              padding: "4px 14px",
              fontSize: 22, fontWeight: 800, color: C.bg, fontVariantNumeric: "tabular-nums",
              background: surpriseColorVal,
              letterSpacing: "0.5px",
            }}>
              {surprise > 0 ? "+" : ""}{surprise.toFixed(1)}%
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {history.length >= 2 && (
          <div>
            <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px" }}>
              LAST {history.length} SURPRISES
            </div>
            <div style={{ marginTop: 4 }}>
              <MiniSparkline history={history} />
            </div>
          </div>
        )}
      </div>

      {/* Description + affects */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {desc && (
          <div style={{ flex: 2, minWidth: 320, fontSize: 16, color: C.gray, lineHeight: 1.6 }}>
            {desc}
          </div>
        )}
        {pairs.length > 0 && (
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px", marginBottom: 6 }}>AFFECTS</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {pairs.slice(0, 5).map(p => (
                <span key={p} style={{
                  padding: "4px 10px", fontSize: 14, color: C.cyan,
                  background: C.bg3, border: `1px solid ${C.border2}`,
                }}>{p}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Placeholder for upstream-pending data */}
      <div style={{
        display: "flex", gap: 24, fontSize: 14, color: C.dim,
        padding: "8px 0", borderTop: `1px dashed ${C.border}`, flexWrap: "wrap",
      }}>
        <span>Typical 1h move on top affected pair: <span style={{ color: C.muted }}>data pending</span></span>
        {kind === "recent" && (
          <span>Reaction (+1h): <span style={{ color: C.muted }}>data pending</span></span>
        )}
      </div>

      {/* Expand history */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: "transparent", border: "none",
              color: C.cyan, fontSize: 16, fontWeight: 700, letterSpacing: "1.2px",
              fontFamily: mono, cursor: "pointer", padding: 0,
            }}
          >
            {expanded ? "▲ Hide history" : `▼ Expand history (${history.length} prints)`}
          </button>
          {expanded && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{
                display: "flex", gap: 14, padding: "4px 8px",
                fontSize: 14, color: C.muted, letterSpacing: "1.2px",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ width: 100 }}>DATE</span>
                <span style={{ width: 100, textAlign: "right" }}>ACTUAL</span>
                <span style={{ width: 100, textAlign: "right" }}>FCST</span>
                <span style={{ flex: 1, textAlign: "right" }}>SURPRISE</span>
              </div>
              {[...history].reverse().map((h, i) => (
                <div key={i} style={{
                  display: "flex", gap: 14, padding: "6px 8px", fontSize: 16,
                  borderBottom: `1px solid ${C.border}07`,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  <span style={{ width: 100, color: C.muted }}>{h.date}</span>
                  <span style={{ width: 100, textAlign: "right", color: C.white, fontWeight: 700 }}>{h.actual ?? "—"}</span>
                  <span style={{ width: 100, textAlign: "right", color: C.muted }}>{h.forecast ?? "—"}</span>
                  <span style={{
                    flex: 1, textAlign: "right", fontWeight: 700,
                    color: !Number.isFinite(Number(h.surprise_pct)) ? C.muted :
                      h.surprise_pct > 0 ? C.green : h.surprise_pct < 0 ? C.red : C.gray,
                  }}>
                    {Number.isFinite(Number(h.surprise_pct))
                      ? `${h.surprise_pct > 0 ? "+" : ""}${h.surprise_pct.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
