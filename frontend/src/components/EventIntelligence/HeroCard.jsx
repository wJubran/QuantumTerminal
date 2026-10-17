// version: v3
// v3 — countdown / eventDate now receive the full event object so per-event
//      time (ev.time) drives the headline countdown. Was hardcoded to 8:30 AM.
// HeroCard — countdown card. v2: 2× font sizes per operator feedback.

import { useEffect, useState, useMemo } from "react";
import { C, mono } from "./theme";
import { describeEvent, affectedPairs, currencyMeta } from "./dictionaries";
import { countdown, eventHistory, eventDate, impactColor } from "./utils";

function Sparkline({ history, width = 200, height = 48 }) {
  if (!history || history.length < 2) {
    return <div style={{ height, color: C.dim, fontSize: 16, fontFamily: mono, lineHeight: `${height}px` }}>(no history)</div>;
  }
  const pcts = history.map(h => Number(h.surprise_pct) || 0);
  const max = Math.max(1, ...pcts.map(Math.abs));
  const stepX = (width - 8) / Math.max(1, pcts.length - 1);
  const yOf = (v) => {
    const norm = (v + max) / (2 * max);
    return height - 4 - norm * (height - 8);
  };
  const path = pcts.map((v, i) => `${i === 0 ? "M" : "L"} ${4 + i * stepX} ${yOf(v).toFixed(1)}`).join(" ");
  const lastV = pcts[pcts.length - 1];
  const lastColor = lastV >= 0 ? C.green : C.red;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <line x1={4} y1={yOf(0)} x2={width - 4} y2={yOf(0)} stroke={C.border2} strokeWidth={1} />
      <path d={path} fill="none" stroke={C.gray} strokeWidth={2} />
      {pcts.map((v, i) => (
        <circle key={i} cx={4 + i * stepX} cy={yOf(v)} r={3}
          fill={v >= 0 ? C.green : C.red} opacity={0.9} />
      ))}
      <circle cx={4 + (pcts.length - 1) * stepX} cy={yOf(lastV)} r={5} fill={lastColor} />
    </svg>
  );
}

export default function HeroCard({ ev, allRecent }) {
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cd      = countdown(ev);
  const meta    = currencyMeta(ev?.currency);
  const desc    = describeEvent(ev?.event);
  const pairs   = affectedPairs(ev?.event, ev?.currency);
  const history = useMemo(() => eventHistory(allRecent, ev?.event, ev?.currency, 6), [allRecent, ev?.event, ev?.currency]);

  const fcst = ev?.forecast;
  const prev = ev?.previous;
  const delta = (() => {
    const f = parseFloat(fcst), p = parseFloat(prev);
    if (!Number.isFinite(f) || !Number.isFinite(p)) return null;
    return f - p;
  })();

  const cdColor =
    cd.kind === "now"     ? C.orange :
    cd.kind === "minutes" ? C.red    :
    cd.kind === "hours"   ? C.amber  :
    cd.kind === "days"    ? C.cyan   : C.muted;
  const impactDotColor = impactColor(ev?.impact, C);
  const dateObj = eventDate(ev);
  const tooltip = dateObj ? `${dateObj.toLocaleString()}  ·  ${dateObj.toUTCString()}` : "";

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: C.bg2,
      border: `1px solid ${C.border}`,
      borderTop: `5px solid ${impactDotColor}`,
      padding: "20px 22px 18px",
      display: "flex", flexDirection: "column", gap: 14,
      fontFamily: mono, color: C.white,
    }}>
      {/* Currency + impact */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          padding: "6px 14px",
          background: meta ? `${meta.color}22` : C.bg3,
          border: `1px solid ${meta ? `${meta.color}66` : C.border}`,
          color: meta?.color || C.gray,
          fontSize: 18, fontWeight: 800, letterSpacing: "2px",
        }}>{ev?.currency || "—"}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[1,2,3].map(n => {
            const k = (ev?.impact || "").toLowerCase();
            const lit = (k === "high" && n <= 3) || (k === "medium" && n <= 2) || (k === "low" && n <= 1);
            return <span key={n} style={{
              width: 14, height: 14, borderRadius: "50%",
              background: lit ? impactDotColor : C.bg4,
              border: `1px solid ${lit ? impactDotColor : C.border}`,
            }} />;
          })}
        </span>
      </div>

      {/* Live countdown */}
      <div title={tooltip} style={{
        fontSize: 52, fontWeight: 800, letterSpacing: "2px",
        color: cdColor, textAlign: "center", padding: "8px 0 6px",
        fontVariantNumeric: "tabular-nums",
      }}>
        {cd.primary}
      </div>

      {/* Event name */}
      <div style={{
        fontSize: 22, fontWeight: 700, letterSpacing: "0.5px",
        color: C.white, lineHeight: 1.3, minHeight: 56,
      }}>
        {ev?.event || "—"}
      </div>

      {/* Forecast / Previous / Delta */}
      <div style={{
        display: "flex", gap: 14, padding: "12px 0",
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.8px" }}>FORECAST</div>
          <div style={{ fontSize: 26, color: C.orange, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {fcst != null && fcst !== "" ? fcst : "—"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.8px" }}>PREVIOUS</div>
          <div style={{ fontSize: 26, color: C.gray, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {prev != null && prev !== "" ? prev : "—"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.8px" }}>Δ</div>
          <div style={{
            fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 4,
            color: delta == null ? C.muted : delta > 0 ? C.green : delta < 0 ? C.red : C.gray,
          }}>
            {delta == null ? "—" : `${delta > 0 ? "▲ " : delta < 0 ? "▼ " : ""}${Math.abs(delta).toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Sparkline of past surprises */}
      <div>
        <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.8px", marginBottom: 6 }}>
          LAST {history.length} PRINTS — SURPRISE %
        </div>
        <Sparkline history={history} />
      </div>

      {/* Description */}
      {desc && (
        <div style={{ fontSize: 16, color: C.gray, lineHeight: 1.6, fontFamily: mono }}>
          {desc}
        </div>
      )}

      {/* Affected instruments */}
      {pairs.length > 0 && (
        <div>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: "1.8px", marginBottom: 6 }}>AFFECTS</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pairs.slice(0, 5).map(p => (
              <span key={p} style={{
                padding: "4px 10px", fontSize: 14,
                background: C.bg3, color: C.cyan,
                border: `1px solid ${C.border2}`,
              }}>{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
