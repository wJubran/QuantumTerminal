// version: v2
/**
 * FundamentalPanel.jsx — Fundamental Intelligence Dashboard
 * ==========================================================
 * Renders macro regime, liquidity, yield curve, asset scores,
 * economic calendar, and COT positioning from fundamental_state.json
 * served by /api/fundamental/* endpoints.
 *
 * Sub-views: Dashboard | Macro Regime | Asset Scorecard | Events | COT | Replay
 *
 * v2 — Event Intelligence sub-view rebuilt as a dedicated component tree
 *      (components/EventIntelligence/*). Layout: status bar → 3 hero
 *      countdown cards → 14-day heatmap → filters + per-currency
 *      surprise scoreboard → cards/list of upcoming + recent + news
 *      placeholder. The original two-table block is replaced wholesale;
 *      everything else in this file is unchanged.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import EventIntelligence from "./EventIntelligence/index.jsx";
// Rule C1 / consumer port: ProbabilityView not delivered to consumer build (PRO-only feature)
// import ProbabilityView from "./ProbabilityView";

// Rule C3: relative URL — backend served by same FastAPI process.
// Consumer endpoint serves the entire fundamental_state.json blob from sync cache.
const API = "";
const FUNDAMENTAL_STATE_URL = "/api/fundamental_state";

// ── Colors (matches analytical_terminal.jsx palette) ──
const C = {
  bg: "#000000", bg1: "#080808", bg2: "#0e0e0e", bg3: "#141414", bg4: "#1a1a1a",
  border: "#1e1e1e", border2: "#2a2a2a",
  orange: "#ff6d00", orangeDim: "#7a3400",
  green: "#2ebd59", red: "#e8383b", blue: "#3796ff",
  amber: "#ffa500", cyan: "#00d2d3", purple: "#9b59b6",
  white: "#f0f0f0", gray: "#888", muted: "#444",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

// ── Regime colors ──
const REGIME_COLORS = {
  REFLATION: C.amber, GOLDILOCKS: C.green, STAGFLATION: C.red, DEFLATION: C.blue,
};
const IMPL_COLORS = {
  BULLISH: C.green, BEARISH: C.red, CAUTIOUS: C.amber, MIXED: C.amber, NEUTRAL: C.gray,
};

// ── Score bar color ──
function scoreColor(score) {
  if (score > 20) return C.green;
  if (score > 5) return "#3a7d4a";
  if (score > -5) return C.gray;
  if (score > -20) return "#a04040";
  return C.red;
}

// ── Shared styles ──
const S = {
  card: {
    background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden",
    display: "flex", flexDirection: "column",
  },
  cardHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
    background: C.bg3,
  },
  cardTitle: {
    fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", color: C.gray,
    textTransform: "uppercase", fontFamily: mono,
  },
  badge: (color = C.muted) => ({
    fontSize: 8, fontWeight: 700, letterSpacing: "1px", padding: "2px 7px",
    border: `1px solid ${color}40`, color, fontFamily: mono, borderRadius: 2,
  }),
  cardBody: { padding: "10px 12px", flex: 1 },
  kpiTile: (accentColor) => ({
    background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accentColor}`,
    padding: "10px 14px", borderRadius: 3, flex: 1, minWidth: 0,
  }),
  subTab: (active) => ({
    padding: "6px 14px", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px",
    color: active ? C.orange : C.gray, cursor: "pointer", fontFamily: mono,
    borderBottom: active ? `2px solid ${C.orange}` : "2px solid transparent",
    transition: "color 0.2s, border-color 0.2s",
    background: "transparent", border: "none",
    borderBottomWidth: 2, borderBottomStyle: "solid",
    borderBottomColor: active ? C.orange : "transparent",
  }),
  hint: { fontSize: 8, color: C.muted, letterSpacing: "0.5px", marginTop: 4 },
};

// ═══════════════════════════════════════════════════════════
//  MINI COMPONENTS
// ═══════════════════════════════════════════════════════════

function Badge({ children, color = C.muted }) {
  return <span style={S.badge(color)}>{children}</span>;
}

function LiquiditySparkline({ chart, events }) {
  const [hovered, setHovered] = useState(null);
  if (!chart || chart.length < 3) return null;
  const w = 320, h = 90, pad = { t: 14, r: 4, b: 20, l: 4 };
  const vals = chart.map(d => d.value);
  const dates = chart.map(d => d.date);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const xStep = (w - pad.l - pad.r) / (vals.length - 1);
  const yScale = v => pad.t + (h - pad.t - pad.b) * (1 - (v - minV) / range);
  const pts = vals.map((v, i) => `${pad.l + i * xStep},${yScale(v)}`).join(" ");
  const trend = vals[vals.length - 1] >= vals[vals.length - 5] ? C.green : C.red;

  const eventMarkers = (events || []).map(ev => {
    let bestIdx = -1, bestDist = Infinity;
    dates.forEach((d, i) => {
      const dist = Math.abs(new Date(d) - new Date(ev.date));
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });
    return (bestIdx >= 0 && bestDist < 10 * 86400000) ? { ...ev, idx: bestIdx } : null;
  }).filter(Boolean);

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={trend} strokeWidth={1.5} opacity={0.8} />
        <circle cx={pad.l + (vals.length - 1) * xStep} cy={yScale(vals[vals.length - 1])} r={3} fill={trend} />
        {(() => {
          // Filter to only events that get labels (skip HOLD)
          let labelIdx = 0;
          return eventMarkers.map((ev, i) => {
            const x = pad.l + ev.idx * xStep;
            const y = yScale(vals[ev.idx]);
            const isHold = ev.type === "hold" || (ev.event || "").includes("HOLD");
            const isCut = (ev.event || "").includes("CUT");
            const isHike = (ev.event || "").includes("HIKE");
            const isQT = ev.type === "qt_start" || ev.type === "qt_accel";
            const isQE = ev.type === "qe_start";
            const isTaper = ev.type === "qt_taper";
            const isPolicy = isQT || isQE || isTaper;
            const col = isQE ? C.green : isQT ? C.red : isTaper ? C.amber : isCut ? C.green : isHike ? C.red : C.cyan;
            const showLabel = !isHold;
            // Stagger labels: alternate top/bottom for non-hold events
            const labelOnBottom = showLabel && (labelIdx++ % 2 === 1);
            const labelY = labelOnBottom ? h - pad.b + 9 : 8;
            return (
              <g key={i} style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered({ ...ev, xPct: x / w * 100, val: vals[ev.idx] })}
                onMouseLeave={() => setHovered(null)}>
                <rect x={x - 10} y={0} width={20} height={h} fill="transparent" />
                <line x1={x} y1={pad.t} x2={x} y2={h - pad.b} stroke={col}
                  strokeWidth={isPolicy ? 0.8 : isHold ? 0.3 : 0.5}
                  strokeDasharray={isHold ? "1,4" : isPolicy ? "3,2" : "2,3"}
                  opacity={isHold ? 0.12 : isPolicy ? 0.5 : 0.3} />
                <circle cx={x} cy={y} r={isPolicy ? 3.5 : isHold ? 1.5 : 2.5}
                  fill={isPolicy ? C.bg : col} stroke={col}
                  strokeWidth={isPolicy ? 2 : 0.6}
                  opacity={isHold ? 0.2 : 0.9} />
                {showLabel && (
                  <text x={x} y={labelY} fontSize={5} fill={col} textAnchor="middle"
                    fontFamily={mono} fontWeight={700} opacity={0.9}>
                    {ev.event}
                  </text>
                )}
              </g>
            );
          });
        })()}
        <text x={pad.l} y={h - 2} fontSize={7} fill={C.muted} fontFamily={mono}>{chart[0].date}</text>
        <text x={w - pad.r} y={h - 2} fontSize={7} fill={C.muted} fontFamily={mono} textAnchor="end">{chart[chart.length - 1].date}</text>
      </svg>
      {hovered && (
        <div style={{
          position: "absolute", left: `${Math.min(78, Math.max(12, hovered.xPct))}%`, top: -4,
          transform: "translateX(-50%)", background: C.bg3, border: `1px solid ${hovered.event?.includes("CUT") ? C.green : hovered.event?.includes("HIKE") ? C.red : hovered.type?.startsWith("q") ? C.amber : C.cyan}50`,
          borderRadius: 3, padding: "5px 10px", zIndex: 10, pointerEvents: "none",
          boxShadow: "0 2px 10px rgba(0,0,0,0.6)", whiteSpace: "nowrap", maxWidth: 220,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: hovered.event?.includes("QE") ? C.green : hovered.event?.includes("QT") ? C.red : hovered.event?.includes("CUT") ? C.green : hovered.event?.includes("HIKE") ? C.red : C.cyan }}>
            {hovered.event}
          </div>
          {hovered.detail && (
            <div style={{ fontSize: 9, color: C.white, fontWeight: 600 }}>{hovered.detail}</div>
          )}
          <div style={{ fontSize: 9, color: C.gray, marginTop: 2 }}>{hovered.date}</div>
          <div style={{ fontSize: 9, color: C.white, marginTop: 1 }}>Net Liq: ${(hovered.val / 1000).toFixed(2)}T</div>
          {(hovered.type === "qe_start") && (
            <div style={{ fontSize: 8, color: C.green, marginTop: 3, whiteSpace: "normal", lineHeight: "1.3" }}>
              Fed expanding balance sheet → flooding system with cash. Bullish for equities, crypto, commodities.
            </div>
          )}
          {(hovered.type === "qt_start" || hovered.type === "qt_accel") && (
            <div style={{ fontSize: 8, color: C.red, marginTop: 3, whiteSpace: "normal", lineHeight: "1.3" }}>
              Fed shrinking balance sheet → draining liquidity. Headwind for risk assets, supports USD.
            </div>
          )}
          {(hovered.type === "qt_taper") && (
            <div style={{ fontSize: 8, color: C.amber, marginTop: 3, whiteSpace: "normal", lineHeight: "1.3" }}>
              Fed slowing QT pace → less liquidity drain. Market reads this as bullish pivot signal.
            </div>
          )}
          {(hovered.type === "change") && (
            <div style={{ fontSize: 8, color: C.gray, marginTop: 3, whiteSpace: "normal", lineHeight: "1.3" }}>
              {hovered.event?.includes("CUT") ? "Rate cut eases financial conditions → bullish for risk." : "Rate hike tightens conditions → bearish for risk."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function YieldCurveChart({ curve, curvePrev, prevDate }) {
  if (!curve || Object.keys(curve).length < 2) return null;
  const tenors = ["2Y", "5Y", "10Y", "30Y"];
  const points = tenors.filter(t => curve[t] != null).map(t => ({ label: t, val: curve[t], prev: curvePrev?.[t] }));
  if (points.length < 2) return null;
  const hasPrev = points.some(p => p.prev != null);
  const allVals = points.flatMap(p => [p.val, ...(p.prev != null ? [p.prev] : [])]);
  const w = 320, h = hasPrev ? 90 : 70, pad = { t: 8, r: 10, b: 18, l: 28 };
  const minY = Math.min(...allVals) - 0.2;
  const maxY = Math.max(...allVals) + 0.2;
  const range = maxY - minY || 1;
  const xStep = (w - pad.l - pad.r) / (points.length - 1);
  const yScale = v => pad.t + (h - pad.t - pad.b) * (1 - (v - minY) / range);

  const inverted = points.length >= 3 && points[0].val > points[2].val;
  const lineColor = inverted ? C.red : C.cyan;
  const pts = points.map((p, i) => `${pad.l + i * xStep},${yScale(p.val)}`).join(" ");
  const prevPts = hasPrev ? points.filter(p => p.prev != null).map((p, i) => `${pad.l + tenors.indexOf(p.label) * xStep},${yScale(p.prev)}`).join(" ") : "";

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {/* Previous curve (dashed, dimmed) */}
      {hasPrev && prevPts && (
        <polyline points={prevPts} fill="none" stroke={C.muted} strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
      )}
      {hasPrev && points.map((p, i) => p.prev != null ? (
        <circle key={`prev-${i}`} cx={pad.l + i * xStep} cy={yScale(p.prev)} r={2} fill={C.muted} opacity={0.4} />
      ) : null)}
      {/* Current curve */}
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={1.5} />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={pad.l + i * xStep} cy={yScale(p.val)} r={3} fill={lineColor} />
          {/* Tenor label */}
          <text x={pad.l + i * xStep} y={h - 3} fontSize={7} fill={C.gray}
            textAnchor="middle" fontFamily={mono}>{p.label}</text>
          {/* Current value */}
          <text x={pad.l + i * xStep} y={yScale(p.val) - 6} fontSize={7} fill={C.white}
            textAnchor="middle" fontFamily={mono}>{p.val.toFixed(2)}%</text>
          {/* Change arrow from prev */}
          {hasPrev && p.prev != null && (() => {
            const delta = p.val - p.prev;
            const absBp = Math.round(Math.abs(delta) * 100);
            if (absBp < 1) return null;
            const col = delta > 0 ? C.red : C.green; // higher rates = tighter = red
            const arrow = delta > 0 ? "↑" : "↓";
            return (
              <text x={pad.l + i * xStep + 16} y={yScale(p.val) + 3} fontSize={6} fill={col}
                fontFamily={mono} fontWeight={700}>{arrow}{absBp}bp</text>
            );
          })()}
        </g>
      ))}
      {/* Legend */}
      {hasPrev && (
        <>
          <line x1={pad.l + 2} y1={6} x2={pad.l + 16} y2={6} stroke={lineColor} strokeWidth={1.5} />
          <text x={pad.l + 19} y={9} fontSize={6} fill={C.gray} fontFamily={mono}>NOW</text>
          <line x1={pad.l + 42} y1={6} x2={pad.l + 56} y2={6} stroke={C.muted} strokeWidth={1} strokeDasharray="3,2" />
          <text x={pad.l + 59} y={9} fontSize={6} fill={C.muted} fontFamily={mono}>3M AGO</text>
        </>
      )}
    </svg>
  );
}

function RegimeQuadrant({ regime, size = "small" }) {
  if (!regime) return null;
  const pos = regime.current_position || { x: 0.5, y: 0.5 };
  const trail = regime.trail || [];
  const dim = size === "large" ? 340 : 280;
  const regColor = REGIME_COLORS[regime.label] || C.gray;
  const labelSize = size === "large" ? 11 : 10;

  return (
    <div style={{ position: "relative", width: dim, height: dim, margin: "4px auto" }}>
      {/* Background quadrants */}
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ background: `${C.red}0a`, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }} />
        <div style={{ background: `${C.amber}0a`, borderBottom: `1px solid ${C.border}` }} />
        <div style={{ background: `${C.blue}0a`, borderRight: `1px solid ${C.border}` }} />
        <div style={{ background: `${C.green}0a` }} />
      </div>
      {/* Quadrant labels */}
      <div style={{ position: "absolute", top: 6, left: 6, fontSize: 16, color: `${C.red}90`, fontFamily: mono, fontWeight: 700 }}>STAGFLATION</div>
      <div style={{ position: "absolute", top: 6, right: 6, fontSize: 16, color: `${C.amber}90`, fontFamily: mono, textAlign: "right", fontWeight: 700 }}>REFLATION</div>
      <div style={{ position: "absolute", bottom: 6, left: 6, fontSize: 16, color: `${C.blue}90`, fontFamily: mono, fontWeight: 700 }}>DEFLATION</div>
      <div style={{ position: "absolute", bottom: 6, right: 6, fontSize: 16, color: `${C.green}90`, fontFamily: mono, textAlign: "right", fontWeight: 700 }}>GOLDILOCKS</div>
      {/* Axis labels */}
      <div style={{ position: "absolute", left: -20, top: "50%", transform: "translateY(-50%) rotate(-90deg)", fontSize: 9, color: C.muted, letterSpacing: "1.5px", whiteSpace: "nowrap" }}>← GROWTH →</div>
      <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: C.muted, letterSpacing: "1px" }}>INFLATION ↑</div>
      {/* Trail dots */}
      {trail.map((pt, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${(pt.x * 100).toFixed(1)}%`, top: `${(pt.y * 100).toFixed(1)}%`,
          width: 5, height: 5, borderRadius: "50%",
          background: regColor, opacity: 0.12 + (i / trail.length) * 0.5,
          transform: "translate(-50%, -50%)",
        }} />
      ))}
      {/* Current position */}
      <div style={{
        position: "absolute",
        left: `${(pos.x * 100).toFixed(1)}%`, top: `${(pos.y * 100).toFixed(1)}%`,
        width: 14, height: 14, borderRadius: "50%",
        background: regColor, border: `2px solid ${C.white}`,
        boxShadow: `0 0 12px ${regColor}`, transform: "translate(-50%, -50%)",
        zIndex: 2,
      }} />
    </div>
  );
}

function ScoreBar({ score, label }) {
  const pct = Math.min(100, Math.max(0, (score + 100) / 2));
  const col = scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ width: 50, fontSize: 10, fontWeight: 700, color: col, fontFamily: mono, textAlign: "right" }}>
        {score > 0 ? "+" : ""}{score.toFixed(0)}
      </div>
      <div style={{ flex: 1, height: 6, background: C.bg4, borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", left: "50%", top: 0, height: "100%",
          width: `${Math.abs(pct - 50)}%`,
          marginLeft: pct >= 50 ? 0 : `${pct - 50}%`,
          background: col, borderRadius: 3, transition: "width 0.4s",
        }} />
        <div style={{ position: "absolute", left: "50%", top: -1, width: 1, height: 8, background: C.muted }} />
      </div>
      <div style={{ width: 90, fontSize: 8, color: col, fontFamily: mono, letterSpacing: "0.5px" }}>
        {label}
      </div>
    </div>
  );
}

function CotGauge({ ticker, data }) {
  if (!data) return null;
  const z = data.z_score || 0;
  const pct = Math.min(100, Math.max(0, (z + 3) / 6 * 100));
  const col = z > 1 ? C.green : z < -1 ? C.red : C.gray;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <div style={{ width: 60, fontSize: 9, fontWeight: 700, color: C.white, fontFamily: mono }}>{ticker}</div>
      <div style={{ flex: 1, height: 6, background: C.bg4, borderRadius: 3, position: "relative" }}>
        <div style={{ position: "absolute", left: "50%", top: -1, width: 1, height: 8, background: C.muted }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: -2, width: 8, height: 10,
          borderRadius: 2, background: col, transform: "translateX(-50%)",
          transition: "left 0.4s",
        }} />
      </div>
      <div style={{ width: 50, fontSize: 9, fontWeight: 700, color: col, fontFamily: mono, textAlign: "right" }}>
        {z > 0 ? "+" : ""}{z.toFixed(2)}
      </div>
      <div style={{ width: 90, fontSize: 8, color: col, fontFamily: mono, letterSpacing: "0.5px" }}>
        {data.label}
      </div>
      {data.squeeze_risk && <span style={{ fontSize: 8, color: C.amber, fontWeight: 700 }}>⚠ SQUEEZE</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
//  REPLAY ENGINE — Daily synthetic data + signal generator
// ═══════════════════════════════════════════════════════════

const REPLAY_ASSETS = {
  XAUUSD: { base: 2950, amp: 35, trend: 0.5, color: C.amber, label: "Gold · Spot", dec: 2, cls: "commodities" },
  XAGUSD: { base: 32, amp: 0.8, trend: 0.05, color: "#C0C0C0", label: "Silver · Spot", dec: 3, cls: "commodities" },
  EURUSD: { base: 1.07, amp: 0.005, trend: -0.0001, color: C.blue, label: "Euro · USD", dec: 4, cls: "fx" },
  GBPUSD: { base: 1.26, amp: 0.006, trend: 0.0001, color: "#6B8E23", label: "Cable · GBP/USD", dec: 4, cls: "fx" },
  USDJPY: { base: 150, amp: 1.2, trend: 0.02, color: C.cyan, label: "USD · JPY", dec: 2, cls: "fx" },
  USDCAD: { base: 1.36, amp: 0.004, trend: 0.0001, color: "#DC143C", label: "USD · CAD", dec: 4, cls: "fx" },
  USDCHF: { base: 0.88, amp: 0.004, trend: -0.0001, color: "#8B0000", label: "USD · CHF", dec: 4, cls: "fx" },
  AUDUSD: { base: 0.65, amp: 0.004, trend: 0.0001, color: "#FFD700", label: "AUD · USD", dec: 4, cls: "fx" },
  US500:  { base: 5400, amp: 50, trend: 1.5, color: C.green, label: "S&P 500 · CFD", dec: 0, cls: "equities" },
  US30:   { base: 39000, amp: 400, trend: 10, color: "#4169E1", label: "Dow 30 · CFD", dec: 0, cls: "equities" },
  USTEC:  { base: 18500, amp: 200, trend: 5, color: C.purple, label: "Nasdaq · CFD", dec: 0, cls: "equities" },
  XTIUSD: { base: 72, amp: 1.5, trend: -0.01, color: C.orange, label: "WTI Crude", dec: 2, cls: "commodities" },
  XBRUSD: { base: 76, amp: 1.5, trend: -0.01, color: "#8B4513", label: "Brent Crude", dec: 2, cls: "commodities" },
  BTCUSD: { base: 65000, amp: 2000, trend: 50, color: "#F7931A", label: "Bitcoin", dec: 0, cls: "equities" },
  ETHUSD: { base: 3200, amp: 120, trend: 5, color: "#627EEA", label: "Ethereum", dec: 1, cls: "equities" },
};

const REG_BIAS = {
  commodities: { REFLATION: 1, STAGFLATION: 0.6, GOLDILOCKS: -0.3, DEFLATION: -1 },
  equities:    { GOLDILOCKS: 1, REFLATION: 0.3, DEFLATION: -0.8, STAGFLATION: -1 },
  fx:          { GOLDILOCKS: 0.5, DEFLATION: -0.3, REFLATION: -0.5, STAGFLATION: 0.3 },
};

function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function _fireSignals(data, cls) {
  const THRESH = 10, COOLDOWN = 28;
  const signals = [];
  let lastBar = -COOLDOWN;
  for (let i = 10; i < data.length; i++) {
    const f = data[i];
    const mom5 = f.macroScore - data[Math.max(0, i - 5)].macroScore;
    const mom10 = f.macroScore - data[Math.max(0, i - 10)].macroScore;
    const rb = (REG_BIAS[cls] || {})[f.regime] || 0;
    const comp = f.macroScore * 0.6 + rb * 10 * 0.2 + (f.cotZ * -6) * 0.2;
    if (i - lastBar < COOLDOWN) continue;
    let dir = null, reasons = [];
    if (comp > THRESH && mom5 > 1.0) {
      dir = "BUY";
      if (f.macroScore > 8) reasons.push(`Macro score +${f.macroScore}`);
      if (rb > 0.1) reasons.push(`${f.regime} favors ${cls}`);
      if (f.cotZ < -0.3) reasons.push("COT contrarian — short squeeze risk");
      if (f.liqTrend > 0) reasons.push("Fed liquidity expanding");
      if (f.vix < 20) reasons.push("Low vol — risk-on");
      if (mom10 > 2) reasons.push("Strong macro momentum");
    } else if (comp < -THRESH && mom5 < -1.0) {
      dir = "SELL";
      if (f.macroScore < -8) reasons.push(`Macro score ${f.macroScore}`);
      if (rb < -0.1) reasons.push(`${f.regime} headwind for ${cls}`);
      if (f.cotZ > 0.5) reasons.push("COT crowded long — reversal risk");
      if (f.liqTrend < 0) reasons.push("Fed liquidity draining");
      if (f.vix > 20) reasons.push("Elevated vol — risk-off");
      if (mom10 < -2) reasons.push("Deteriorating macro trend");
    }
    if (dir && reasons.length >= 1) {
      signals.push({ bar: i, dir, price: f.close, date: f.date,
        score: Math.round(comp), reasons: reasons.slice(0, 3) });
      lastBar = i;
    }
  }
  return signals;
}

function generateReplayData(asset, N = 504) {
  const cfg = REPLAY_ASSETS[asset] || REPLAY_ASSETS.XAUUSD;
  const r = seededRand(asset.charCodeAt(0) * 37 + asset.charCodeAt(1) * 13 + N);
  let p = cfg.base;
  const regs = ["REFLATION", "GOLDILOCKS", "STAGFLATION", "DEFLATION"];
  const regC = { REFLATION: C.amber, GOLDILOCKS: C.green, STAGFLATION: C.red, DEFLATION: C.blue };
  const bd = new Date(); bd.setDate(bd.getDate() - N);
  const data = [];
  let gZ = (r() - 0.5) * 0.5, iZ = (r() - 0.5) * 0.5;
  let gM = 0, iM = 0, liq = 5500 + r() * 600, spr = 0.1 + r() * 0.3;
  let rY = 1.0 + r() * 1.5, vx = 16 + r() * 8, cZ = (r() - 0.5) * 1.0, lT = 0;

  const evts = [
    { fr: Math.round(N * 0.07), nm: "NFP +263K" }, { fr: Math.round(N * 0.15), nm: "CPI 3.2%" },
    { fr: Math.round(N * 0.24), nm: "FOMC Hold" }, { fr: Math.round(N * 0.33), nm: "GDP 2.8%" },
    { fr: Math.round(N * 0.42), nm: "NFP +187K" }, { fr: Math.round(N * 0.50), nm: "CPI 2.9%" },
    { fr: Math.round(N * 0.60), nm: "FOMC Cut 25bp" }, { fr: Math.round(N * 0.70), nm: "NFP +220K" },
    { fr: Math.round(N * 0.80), nm: "CPI 2.5%" }, { fr: Math.round(N * 0.90), nm: "GDP 3.1%" },
  ];

  for (let i = 0; i < N; i++) {
    const d = new Date(bd); d.setDate(d.getDate() + i);
    const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
    p += cfg.trend * 0.2 + (r() - 0.48) * cfg.amp * 0.08;
    p = Math.max(cfg.base * 0.7, Math.min(cfg.base * 1.5, p));
    const vol = cfg.amp * 0.02 * (0.4 + r() * 0.8);
    const op = data.length === 0 ? p : data[data.length - 1].close;
    const cl = p, bH = Math.max(op, cl), bL = Math.min(op, cl);
    const hi = bH + vol * (0.3 + r() * 0.7), lo = bL - vol * (0.3 + r() * 0.7);
    // Regime dynamics — mean-reverting (Ornstein-Uhlenbeck style)
    gM += (r() - 0.5) * 0.07; gM *= 0.90; iM += (r() - 0.5) * 0.06; iM *= 0.91;
    if (r() < 0.02) gM += (r() - 0.5) * 1.2;  // occasional shock
    if (r() < 0.02) iM += (r() - 0.5) * 1.0;
    // Forced slow cycle — amplitude dominates to guarantee regime transitions
    const cycle = Math.sin(data.length * 0.052) * 0.8;
    const cycle2 = Math.cos(data.length * 0.037) * 0.7;
    gZ += gM * 0.18 + cycle * 0.025;
    iZ += iM * 0.14 + cycle2 * 0.02;
    gZ *= 0.992;  // stronger mean-reversion
    iZ *= 0.992;
    gZ = Math.max(-3, Math.min(3, gZ)); iZ = Math.max(-3, Math.min(3, iZ));
    const reg = regs[(gZ > 0 ? 1 : 0) + (iZ > 0 ? 2 : 0)];
    const lP = liq; liq += (r() - 0.5) * 14; spr += (r() - 0.5) * 0.008;
    rY += (r() - 0.5) * 0.015; vx += (r() - 0.5) * 0.6;
    vx = Math.max(10, Math.min(45, vx));
    cZ += (r() - 0.5) * 0.1; cZ *= 0.993;
    cZ = Math.max(-3, Math.min(3, cZ)); lT = liq - lP;
    const rb = (REG_BIAS[cfg.cls] || {})[reg] || 0;
    // Balanced score — growth dominates, regime is secondary
    const raw = gZ * 18 + rb * 10 + cZ * -6 + lT * 0.5 + spr * 8;
    const ms = Math.round(Math.tanh(raw * 0.02) * 80);
    const ev = evts.find(e => e.fr === data.length);
    data.push({
      date: d.toISOString().slice(0, 10),
      open: +op.toFixed(cfg.dec), high: +hi.toFixed(cfg.dec),
      low: +lo.toFixed(cfg.dec), close: +cl.toFixed(cfg.dec),
      price: +cl.toFixed(cfg.dec), regime: reg, regimeColor: regC[reg] || C.gray,
      growthZ: +gZ.toFixed(3), inflZ: +iZ.toFixed(3),
      liq: +liq.toFixed(0), spread: +spr.toFixed(3),
      realYield: +rY.toFixed(2), vix: +vx.toFixed(1),
      cotZ: +cZ.toFixed(2), liqTrend: +lT.toFixed(1), macroScore: ms,
      event: ev ? { frame: data.length, name: ev.nm, impact: "high" } : null,
    });
  }
  const sigs = _fireSignals(data, cfg.cls);
  const events = evts.filter(e => e.fr < data.length).map(e => ({ frame: e.fr, name: e.nm, impact: "high" }));
  return { cfg, data, events, signals: sigs };
}

function _guessDecimals(candles) {
  if (!candles || candles.length === 0) return 2;
  const s = String(candles[0].close), dot = s.indexOf(".");
  return dot < 0 ? 0 : Math.min(5, s.length - dot - 1);
}

export default function FundamentalPanel() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subView, setSubView] = useState("dashboard");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const [, setTick] = useState(0); // force re-render for countdown timers

  // ── Replay state ──
  const [replayAsset, setReplayAsset] = useState("XAUUSD");
  const [replayFrame, setReplayFrame] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayMacro, setReplayMacro] = useState(null);    // from replay-macro endpoint
  const [replayCandles, setReplayCandles] = useState(null); // from MT5 replay endpoint
  const [replaySource, setReplaySource] = useState("loading");
  const [replayAssetList, setReplayAssetList] = useState([]); // from replay-list endpoint
  const [advancedOpen, setAdvancedOpen] = useState(false);    // sidebar expand toggle
  const [hoverBar, setHoverBar] = useState(null);              // crosshair hover index
  const [fqHorizon, setFqHorizon] = useState(21);              // validation horizon (trading days)
  const replayTimerRef = useRef(null);
  const chartColRef = useRef(null);                            // ref for chart column mouse tracking

  // Merge real macro + real candles by date
  const replayData = useMemo(() => {
    const cfg = REPLAY_ASSETS[replayAsset] || REPLAY_ASSETS.XAUUSD;

    // If we have real macro data from the replay engine
    if (replayMacro?.frames?.length > 0) {
      const macroByDate = {};
      replayMacro.frames.forEach(f => { macroByDate[f.date] = f; });

      // If we also have real candles, merge by date
      if (replayCandles?.length > 0) {
        const dec = _guessDecimals(replayCandles);
        const merged = [];
        replayCandles.forEach(c => {
          const macro = macroByDate[c.date];
          if (macro) {
            merged.push({
              date: c.date,
              open: c.open, high: c.high, low: c.low, close: c.close, price: c.close,
              growthZ: macro.growthZ, inflZ: macro.inflZ,
              regime: macro.regime, regimeColor: macro.regimeColor,
              liq: macro.netLiq, liqTrend: macro.liqDelta,
              spread: macro.spread2s10s, realYield: macro.realYield,
              vix: macro.vix, cotZ: macro.cotZ, macroScore: macro.macroScore,
              // New factors
              hySpreadZ: macro.hySpreadZ || 0, copperGoldZ: macro.copperGoldZ || 0,
              sentimentZ: macro.sentimentZ || 0, wageZ: macro.wageZ || 0,
              rateDiffZ: macro.rateDiffZ || 0, surpriseZ: macro.surpriseZ || 0,
              m2GrowthZ: macro.m2GrowthZ || 0,
              ouOutlook: macro.ouOutlook || 0,
              fqScoreMom: macro.fqScoreMom || 0, fqRegime: macro.fqRegime || 0,
              fqLiquidity: macro.fqLiquidity || 0, fqLeading: macro.fqLeading || 0,
              fqCot: macro.fqCot || 0, fqCredit: macro.fqCredit || 0,
            });
          } else {
            // Candle exists but no macro for that date — use last known
            const prev = merged.length > 0 ? merged[merged.length - 1] : {};
            merged.push({
              date: c.date,
              open: c.open, high: c.high, low: c.low, close: c.close, price: c.close,
              growthZ: prev.growthZ || 0, inflZ: prev.inflZ || 0,
              regime: prev.regime || "UNKNOWN", regimeColor: prev.regimeColor || "gray",
              liq: prev.liq || 0, liqTrend: prev.liqTrend || 0,
              spread: prev.spread || 0, realYield: prev.realYield || 0,
              vix: prev.vix || 0, cotZ: prev.cotZ || 0, macroScore: prev.macroScore || 0,
              hySpreadZ: prev.hySpreadZ || 0, copperGoldZ: prev.copperGoldZ || 0,
              sentimentZ: prev.sentimentZ || 0, wageZ: prev.wageZ || 0,
              rateDiffZ: prev.rateDiffZ || 0, surpriseZ: prev.surpriseZ || 0,
              m2GrowthZ: prev.m2GrowthZ || 0,
              ouOutlook: prev.ouOutlook || 0,
              fqScoreMom: prev.fqScoreMom || 0, fqRegime: prev.fqRegime || 0,
              fqLiquidity: prev.fqLiquidity || 0, fqLeading: prev.fqLeading || 0,
              fqCot: prev.fqCot || 0, fqCredit: prev.fqCredit || 0,
            });
          }
        });

        // Map signal bar indices to merged array indices + add price
        const dateToIdx = {};
        merged.forEach((d, i) => { dateToIdx[d.date] = i; });
        const signals = (replayMacro.signals || []).map(s => {
          const idx = dateToIdx[s.date] ?? s.bar;
          return {
            ...s,
            bar: idx,
            price: merged[idx]?.close || 0,
          };
        }).filter(s => s.bar != null && s.bar < merged.length);

        return {
          cfg: { ...cfg, dec },
          data: merged,
          signals,
          events: [],  // events come from macro data, not needed separately
        };
      }

      // Macro only, no candles — use macro frames with synthetic OHLC
      const frames = replayMacro.frames.map((f, i) => ({
        date: f.date,
        open: 0, high: 0, low: 0, close: 0, price: 0,
        growthZ: f.growthZ, inflZ: f.inflZ,
        regime: f.regime, regimeColor: f.regimeColor,
        liq: f.netLiq, liqTrend: f.liqDelta,
        spread: f.spread2s10s, realYield: f.realYield,
        vix: f.vix, cotZ: f.cotZ, macroScore: f.macroScore,
        // New factors
        hySpreadZ: f.hySpreadZ || 0, copperGoldZ: f.copperGoldZ || 0,
        sentimentZ: f.sentimentZ || 0, wageZ: f.wageZ || 0,
        rateDiffZ: f.rateDiffZ || 0, surpriseZ: f.surpriseZ || 0,
        m2GrowthZ: f.m2GrowthZ || 0,
        ouOutlook: f.ouOutlook || 0,
        fqScoreMom: f.fqScoreMom || 0, fqRegime: f.fqRegime || 0,
        fqLiquidity: f.fqLiquidity || 0, fqLeading: f.fqLeading || 0,
        fqCot: f.fqCot || 0, fqCredit: f.fqCredit || 0,
      }));
      return {
        cfg, data: frames, signals: replayMacro.signals || [], events: [],
      };
    }

    // Fallback: synthetic data if no replay engine output
    return generateReplayData(replayAsset, 504);
  }, [replayMacro, replayCandles, replayAsset]);

  const totalFrames = replayData.data.length;

  // Fetch both macro + candles when asset changes
  // Rule C1: replay endpoints are PRO-only — disabled on consumer.
  useEffect(() => {
    /*
    let cancelled = false;
    setReplayMacro(null);
    setReplayCandles(null);
    setReplaySource("loading");

    // Fetch both in parallel
    const fetchMacro = fetch(`${API}/replay-macro/${replayAsset}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    const fetchCandles = fetch(`${API}/replay/${replayAsset}?bars=504&timeframe=D1`)
      .then(r => r.ok ? r.json() : null).catch(() => null);

    Promise.all([fetchMacro, fetchCandles]).then(([macro, candles]) => {
      if (cancelled) return;
      if (macro?.frames?.length > 0) setReplayMacro(macro);
      if (candles?.candles?.length > 0) setReplayCandles(candles.candles);
      // Auto-set prediction horizon to asset's optimal from backtest
      if (macro?.calibration?.fq_horizon) setFqHorizon(macro.calibration.fq_horizon);
      // Determine source label
      const hasMacro = macro?.frames?.length > 0;
      const hasCandles = candles?.candles?.length > 0;
      if (hasMacro && hasCandles) setReplaySource("live");
      else if (hasMacro) setReplaySource("macro-only");
      else if (hasCandles) setReplaySource("prices-only");
      else setReplaySource("synthetic");
    });

    return () => { cancelled = true; };
    */
  }, [replayAsset]);

  useEffect(() => {
    if (replayPlaying && subView === "replay") {
      replayTimerRef.current = setInterval(() => {
        setReplayFrame(prev => {
          if (prev >= totalFrames - 1) { setReplayPlaying(false); return prev; }
          return prev + 1;
        });
      }, 200 / replaySpeed);
    }
    return () => { if (replayTimerRef.current) clearInterval(replayTimerRef.current); };
  }, [replayPlaying, replaySpeed, totalFrames, subView]);

  // ── Fetch replay asset list (dynamic tabs) ──
  // Rule C1: replay-list endpoint is PRO-only — disabled on consumer.
  useEffect(() => {
    /*
    fetch(`${API}/replay-list`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.assets?.length > 0) {
          setReplayAssetList(data.assets);
        }
      })
      .catch(() => {});
    */
  }, []);

  // ── Fetch state ──
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(FUNDAMENTAL_STATE_URL);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setState(data);
      setError(null);
      // Auto-select first asset for scorecard if none selected
      if (!selectedAsset && data.asset_scores) {
        const first = Object.keys(data.asset_scores)[0];
        if (first) setSelectedAsset(first);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedAsset]);

  useEffect(() => { fetchState(); }, []);
  // Refresh every 5 minutes
  useEffect(() => {
    const iv = setInterval(fetchState, 300_000);
    return () => clearInterval(iv);
  }, [fetchState]);

  // Countdown timer tick — re-renders every 60s when on events tab
  useEffect(() => {
    if (subView !== "events") return;
    const iv = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(iv);
  }, [subView]);

  // Countdown text from date string → "in 2d 5h" / "TODAY" / "LIVE" / "3d ago"
  const countdownText = useCallback((dateStr) => {
    if (!dateStr) return "";
    const evDate = new Date(dateStr + "T08:30:00"); // assume morning release
    const now = new Date();
    const diffMs = evDate - now;
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < -1440) { const d = Math.round(-diffMin / 1440); return `${d}d ago`; }
    if (diffMin < -60) { const h = Math.round(-diffMin / 60); return `${h}h ago`; }
    if (diffMin < 0) return "JUST NOW";
    if (diffMin < 60) return `in ${diffMin}m`;
    if (diffMin < 1440) { const h = Math.floor(diffMin / 60); const m = diffMin % 60; return `in ${h}h ${m > 0 ? m + "m" : ""}`; }
    const d = Math.floor(diffMin / 1440); const h = Math.floor((diffMin % 1440) / 60);
    return `in ${d}d ${h > 0 ? h + "h" : ""}`;
  }, []);

  // ── Recompute handler ──
  // Rule C1: HIDDEN on consumer — calculations are producer-side only.
  // Body preserved (commented) for traceability per Rule C9.
  const handleRecompute = async () => {
    /*
    setRecomputing(true);
    try {
      await fetch(`${API}/recompute`, { method: "POST" });
      // Poll status
      const poll = setInterval(async () => {
        const res = await fetch(`${API}/recompute/status`);
        const st = await res.json();
        if (!st.running) {
          clearInterval(poll);
          setRecomputing(false);
          if (st.success) fetchState();
        }
      }, 3000);
    } catch (e) {
      setRecomputing(false);
    }
    */
  };

  // ── Derived data ──
  const regime = state?.regime;
  const liquidity = state?.liquidity;
  const yields = state?.yields;
  const cot = state?.cot || {};
  const scores = state?.asset_scores || {};
  const calendar = state?.calendar || {};
  const meta = state?._meta || {};
  const sortedScores = useMemo(() =>
    Object.entries(scores).sort(([, a], [, b]) => b.score - a.score),
    [scores]
  );

  // ── Loading / Error ──
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 300, color: C.gray, fontSize: 10, fontFamily: mono, letterSpacing: "2px" }}>
        LOADING FUNDAMENTAL DATA...
      </div>
    );
  }
  if (error || !state) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: 300, gap: 10 }}>
        <div style={{ color: C.red, fontSize: 10, fontFamily: mono, letterSpacing: "1px" }}>
          {error || "No fundamental data available"}
        </div>
        <div style={{ color: C.muted, fontSize: 9, fontFamily: mono }}>
          Run: python Fundementals/fundamental_calculator.py
        </div>
        <button onClick={fetchState} style={{
          background: C.bg3, border: `1px solid ${C.orange}40`, color: C.orange,
          padding: "4px 14px", fontSize: 9, fontFamily: mono, cursor: "pointer",
          letterSpacing: "1px",
        }}>RETRY</button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: mono, fontSize: 10, color: C.white, padding: "0 8px 12px" }}>

      {/* ── Sub-view Tabs ── */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`,
        marginBottom: 12, padding: "0 4px",
        justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 0 }}>
          {[
            ["dashboard", "Dashboard"],
            ["regime", "Macro Regime"],
            ["scorecard", "Asset Scorecard"],
            // ["probability", "Fundamental Quants"], // HIDDEN: ProbabilityView not delivered to consumer
            ["events", "Event Intelligence"],
            ["cot", "COT Positioning"],
            // ["replay", "⟳ Replay"], // HIDDEN: replay endpoints are PRO-only (Rule C1)
          ].map(([key, label]) => {
            const isSpecial = key === "replay" || key === "probability";
            const active = subView === key;
            const accent = key === "replay" ? C.cyan : key === "probability" ? C.purple : C.orange;
            return (
              <button key={key} onClick={() => setSubView(key)} style={{
                ...S.subTab(active),
                color: active ? accent : C.gray,
                borderBottomColor: active ? accent : "transparent",
              }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {meta.age_hours != null && (
            <span style={{ fontSize: 8, color: meta.stale ? C.amber : C.muted, letterSpacing: "0.5px" }}>
              {meta.stale ? "⚠ STALE " : ""}
              {meta.age_hours < 1 ? `${Math.round(meta.age_hours * 60)}m ago` : `${meta.age_hours.toFixed(1)}h ago`}
            </span>
          )}
          {/* Rule C1: REFRESH/recompute button HIDDEN on consumer — calculations are producer-side only.
          <button onClick={handleRecompute} disabled={recomputing} style={{
            background: "transparent", border: `1px solid ${C.orange}40`, color: C.orange,
            padding: "3px 10px", fontSize: 8, fontFamily: mono, cursor: recomputing ? "not-allowed" : "pointer",
            letterSpacing: "0.5px", opacity: recomputing ? 0.5 : 1,
          }}>
            {recomputing ? "↻ COMPUTING..." : "↻ REFRESH"}
          </button>
          */}
        </div>
      </div>

      {/* ═══ PROBABILITY VIEW ═══ HIDDEN: ProbabilityView not delivered to consumer */}
      {/* {subView === "probability" && <ProbabilityView />} */}

      {/* ═══ DASHBOARD VIEW ═══ */}
      {subView === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* KPI Tiles */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={S.kpiTile(REGIME_COLORS[regime?.label] || C.gray)}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", marginBottom: 3 }}>MACRO REGIME</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: REGIME_COLORS[regime?.label] || C.gray }}>{regime?.label}</div>
              <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{regime?.sub}</div>
              {regime?.prev_label && regime.prev_label !== regime.label && (
                <div style={{ fontSize: 8, color: C.amber, marginTop: 3 }}>← was {regime.prev_label} (30d ago)</div>
              )}
              {regime?.prev_label && regime.prev_label === regime.label && (
                <div style={{ fontSize: 8, color: C.muted, marginTop: 3 }}>Stable for 30+ days</div>
              )}
              <div style={{ fontSize: 10, color: C.gray, marginTop: 5, lineHeight: "1.5" }}>
                {regime?.label === "GOLDILOCKS" && "Best for equities & risk assets. Growth supports earnings, low inflation keeps rates stable."}
                {regime?.label === "REFLATION" && "Favors commodities & cyclicals. Growth is strong but rising inflation may force rate hikes."}
                {regime?.label === "STAGFLATION" && "Worst for most assets. Weak growth + high inflation squeezes margins & raises rates."}
                {regime?.label === "DEFLATION" && "Favors bonds & USD. Weak growth + falling prices signal risk-off — equities underperform."}
              </div>
            </div>
            <div style={S.kpiTile(liquidity?.trend === "EXPANDING" ? C.green : C.red)}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", marginBottom: 3 }}>NET LIQUIDITY</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: liquidity?.trend === "EXPANDING" ? C.green : C.red }}>
                {liquidity?.value_label || "—"}
              </div>
              <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                {liquidity?.delta_4w_label} · {liquidity?.trend}
              </div>
              {liquidity?.prev_value_label && (
                <div style={{ fontSize: 8, color: liquidity.delta_4w > 0 ? C.green : C.red, marginTop: 3 }}>
                  ← was {liquidity.prev_value_label} (4w ago)
                </div>
              )}
              <div style={{ fontSize: 10, color: C.gray, marginTop: 5, lineHeight: "1.5" }}>
                Fed balance sheet minus TGA & reverse repo = cash in the system. {liquidity?.trend === "EXPANDING"
                  ? `+${Math.abs(liquidity?.delta_4w || 0).toFixed(0)}B more cash entered the system in 4 weeks — bullish tailwind for stocks & crypto.`
                  : `$${Math.abs(liquidity?.delta_4w || 0).toFixed(0)}B drained from the system in 4 weeks — less cash chasing assets, headwind for risk.`
                }
              </div>
            </div>
            <div style={S.kpiTile(yields?.inverted ? C.red : C.cyan)}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", marginBottom: 3 }}>2s10s SPREAD</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: yields?.inverted ? C.red : C.cyan }}>
                {yields?.spread_2s10s_bp != null ? `${yields.spread_2s10s_bp > 0 ? "+" : ""}${yields.spread_2s10s_bp.toFixed(0)}bp` : "—"}
              </div>
              <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                {yields?.inverted ? "⚠ INVERTED" : "Normal"} · Real {yields?.real_yield_10y?.toFixed(2)}%
              </div>
              {yields?.prev_spread_2s10s_bp != null && (
                <div style={{ fontSize: 8, color: (yields.spread_2s10s_bp - yields.prev_spread_2s10s_bp) > 0 ? C.cyan : C.amber, marginTop: 3 }}>
                  ← was {yields.prev_spread_2s10s_bp > 0 ? "+" : ""}{yields.prev_spread_2s10s_bp.toFixed(0)}bp (3m ago)
                </div>
              )}
              <div style={{ fontSize: 10, color: C.gray, marginTop: 5, lineHeight: "1.5" }}>
                10Y minus 2Y yield. {yields?.inverted ? "Inversion historically precedes recession by 6–18 months." : "Normal curve means the bond market sees no near-term recession."}
              </div>
            </div>
            <div style={S.kpiTile(C.orange)}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", marginBottom: 3 }}>VIX</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: yields?.vix > 25 ? C.red : yields?.vix > 18 ? C.amber : C.green }}>
                {yields?.vix?.toFixed(1) || "—"}
              </div>
              <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                Fed Funds: {yields?.fed_funds_rate?.toFixed(2)}%
              </div>
              {yields?.prev_vix > 0 && (
                <div style={{ fontSize: 8, color: yields.vix < yields.prev_vix ? C.green : C.red, marginTop: 3 }}>
                  ← was {yields.prev_vix.toFixed(1)} (30d ago) {yields.vix < yields.prev_vix ? "↓ calming" : "↑ rising fear"}
                </div>
              )}
              <div style={{ fontSize: 10, color: C.gray, marginTop: 5, lineHeight: "1.5" }}>
                {yields?.vix > 25 ? "Elevated fear — markets pricing risk. Expect wider ranges and trend exhaustion." : yields?.vix > 18 ? "Moderate caution — markets uncertain. Signals may fire with lower confidence." : "Low fear — risk-on environment. Trend-following signals are most reliable here."}
              </div>
            </div>
          </div>

          {/* Market Insight — actionable summary */}
          {regime && (
            <div style={{ ...S.card, borderLeft: `3px solid ${REGIME_COLORS[regime.label] || C.gray}` }}>
              <div style={{ padding: "8px 14px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: C.orange, marginBottom: 5 }}>
                  MARKET INSIGHT
                </div>
                <div style={{ fontSize: 9, color: C.white, lineHeight: "1.6" }}>
                  {(() => {
                    const impl = regime.implications || {};
                    const parts = [];
                    if (impl.equities) parts.push(`Equities outlook: ${impl.equities}`);
                    if (impl.commodities) parts.push(`Commodities: ${impl.commodities}`);
                    if (impl.fixed_income) parts.push(`Bonds: ${impl.fixed_income}`);
                    if (impl.usd) parts.push(`USD: ${impl.usd}`);

                    const liqNote = liquidity?.trend === "EXPANDING"
                      ? "Fed liquidity is expanding — a tailwind for asset prices."
                      : "Fed liquidity is draining — watch for risk-off pressure.";

                    const vixNote = yields?.vix > 25
                      ? "Elevated VIX means markets are pricing fear — expect volatility."
                      : yields?.vix > 18
                      ? "VIX is moderate — mixed signals, stay selective."
                      : "Low VIX — calm markets favor trend-following.";

                    return (
                      <>
                        <span style={{ color: REGIME_COLORS[regime.label] || C.gray, fontWeight: 600 }}>{regime.label}</span> regime: {parts.join(" · ")}
                        <br />{liqNote} {vixNote}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 2×2 Grid: Regime + Liquidity (row 1), Playbook + Yield (row 2) */}
          <div style={{ display: "grid", gridTemplateColumns: "3fr 5fr", gridTemplateRows: "auto auto", gap: 12 }}>

            {/* ═ ROW 1 LEFT: Regime Quadrant ═ */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Macro Regime</span>
                <Badge color={REGIME_COLORS[regime?.label]}>12-MONTH TRAIL</Badge>
              </div>
              <div style={{ ...S.cardBody, textAlign: "center", padding: "8px 12px 10px", display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
                <RegimeQuadrant regime={regime} size="small" />
                <div style={{ fontSize: 16, fontWeight: 700, color: REGIME_COLORS[regime?.label], marginTop: 6, letterSpacing: "3px" }}>
                  {regime?.label}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {regime?.confidence}% confidence · G: {regime?.growth_z > 0 ? "+" : ""}{regime?.growth_z?.toFixed(2)}σ · I: {regime?.inflation_z > 0 ? "+" : ""}{regime?.inflation_z?.toFixed(2)}σ
                </div>
                {regime?.implications && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    {Object.entries(regime.implications).map(([cls, stance]) => (
                      <div key={cls} style={{ fontSize: 9, fontFamily: mono, display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ color: C.muted, textTransform: "uppercase" }}>{cls.replace("_", " ")}:</span>
                        <span style={{ fontWeight: 700, color: IMPL_COLORS[stance] || C.gray }}>{stance}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ═ ROW 1 RIGHT: Fed Net Liquidity ═ */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Fed Net Liquidity</span>
                <Badge color={liquidity?.trend === "EXPANDING" ? C.green : C.red}>
                  {liquidity?.trend} {liquidity?.delta_4w_label}
                </Badge>
              </div>
              <div style={S.cardBody}>
                <LiquiditySparkline chart={liquidity?.chart} events={liquidity?.fed_events} />
                <div style={S.hint}>
                  WALCL ${(liquidity?.components?.walcl / 1000)?.toFixed(2)}T — TGA ${(liquidity?.components?.tga / 1000)?.toFixed(2)}T — RRP ${liquidity?.components?.rrp?.toFixed(0)}B
                </div>
                <div style={{ fontSize: 10, color: C.gray, marginTop: 5, lineHeight: "1.5" }}>
                  When this line rises → more cash in markets → bullish. When it falls → cash draining → bearish headwind. Dots = FOMC meetings. Hover for details.
                  {liquidity?.fed_events?.length > 0 ? ` · ${liquidity.fed_events.length} FOMC meetings in window.` : ""}
                </div>
              </div>
            </div>

            {/* ═ ROW 2 LEFT: Regime Playbook ═ */}
            <div style={{ ...S.card, borderLeft: `3px solid ${C.orange}` }}>
              <div style={S.cardHeader}>
                <span style={{ ...S.cardTitle, color: C.orange }}>REGIME PLAYBOOK</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {regime?.computed_at && (
                    <span style={{ fontSize: 8, color: C.muted }}>{regime.computed_at.slice(0, 16).replace("T", " ")}</span>
                  )}
                  <Badge color={C.orange}>{regime?.label}</Badge>
                </div>
              </div>
              <div style={{ ...S.cardBody, padding: "8px 14px" }}>
                <div style={{ fontSize: 10, color: C.gray, letterSpacing: "1px", marginBottom: 8, fontWeight: 700 }}>REGIME EDGE</div>
                {(() => {
                  const playbooks = {
                    GOLDILOCKS: [
                      { dir: "LONG", assets: "US500 · USTEC · US30", reason: "Earnings growth + stable rates = equities outperform" },
                      { dir: "LONG", assets: "EURUSD · GBPUSD", reason: "Risk-on weakens USD, supports EUR/GBP" },
                      { dir: "SHORT", assets: "XAUUSD", reason: "Gold underperforms when growth is strong & rates stable" },
                      { dir: "AVOID", assets: "USDCHF · USDJPY", reason: "Low vol regime — range-bound, poor R:R" },
                    ],
                    REFLATION: [
                      { dir: "LONG", assets: "XAUUSD · XAGUSD", reason: "Inflation hedge demand surges, real yields fall" },
                      { dir: "LONG", assets: "XTIUSD · XBRUSD", reason: "Strong demand + supply constraints = oil bid" },
                      { dir: "SHORT", assets: "USTEC", reason: "Rising rates compress growth stock multiples" },
                      { dir: "CAUTION", assets: "US500", reason: "Mixed — value sectors lead, tech lags" },
                    ],
                    STAGFLATION: [
                      { dir: "LONG", assets: "XAUUSD · USDCHF", reason: "Safe havens bid on growth fears + inflation" },
                      { dir: "SHORT", assets: "US500 · USTEC", reason: "Earnings decline + rate pressure = double hit" },
                      { dir: "SHORT", assets: "AUDUSD", reason: "Risk-off + commodity demand slowing" },
                      { dir: "LONG", assets: "XTIUSD", reason: "Supply-side inflation keeps oil elevated" },
                    ],
                    DEFLATION: [
                      { dir: "LONG", assets: "USDJPY · USDCHF", reason: "USD strengthens as global growth stalls" },
                      { dir: "SHORT", assets: "XTIUSD · XBRUSD", reason: "Demand destruction crushes oil" },
                      { dir: "SHORT", assets: "AUDUSD · USDCAD", reason: "Commodity currencies weaken sharply" },
                      { dir: "CAUTION", assets: "XAUUSD", reason: "Mixed — deflation fear vs USD strength" },
                    ],
                  };
                  const plays = playbooks[regime?.label] || playbooks.GOLDILOCKS;
                  const dirColors = { LONG: C.green, SHORT: C.red, AVOID: C.muted, CAUTION: C.amber };
                  return plays.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: i < plays.length - 1 ? `1px solid ${C.border}08` : "none" }}>
                      <span style={{ width: 50, fontSize: 11, fontWeight: 700, color: dirColors[p.dir] || C.gray, flexShrink: 0 }}>
                        {p.dir}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{p.assets}</div>
                        <div style={{ fontSize: 10, color: C.gray, marginTop: 2, lineHeight: "1.3" }}>{p.reason}</div>
                      </div>
                    </div>
                  ));
                })()}
                {sortedScores.length > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 0 0", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.gray, letterSpacing: "1px", marginBottom: 6, fontWeight: 700 }}>MACRO SCORE LEADERS</div>
                    <div style={{ display: "flex", gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 8, color: C.green, letterSpacing: "1px", marginBottom: 3 }}>STRONGEST</div>
                        {sortedScores.slice(0, 3).map(([t, d]) => (
                          <div key={t} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                            <span style={{ color: C.white, fontWeight: 600 }}>{t}</span>
                            <span style={{ color: C.green, fontWeight: 700 }}>{d.score > 0 ? "+" : ""}{d.score.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ width: 1, background: C.border }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 8, color: C.red, letterSpacing: "1px", marginBottom: 3 }}>WEAKEST</div>
                        {sortedScores.slice(-3).reverse().map(([t, d]) => (
                          <div key={t} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                            <span style={{ color: C.white, fontWeight: 600 }}>{t}</span>
                            <span style={{ color: C.red, fontWeight: 700 }}>{d.score > 0 ? "+" : ""}{d.score.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═ ROW 2 RIGHT: Yield Curve ═ */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Yield Curve</span>
                <Badge color={yields?.inverted ? C.red : C.cyan}>
                  {yields?.inverted ? "INVERTED" : "NORMAL"} {yields?.spread_2s10s_bp?.toFixed(0)}bp
                </Badge>
              </div>
              <div style={S.cardBody}>
                <YieldCurveChart curve={yields?.curve} curvePrev={yields?.curve_prev} prevDate={yields?.curve_prev_date} />
                <div style={{ fontSize: 10, color: C.gray, marginTop: 5, lineHeight: "1.5" }}>
                  Solid = current curve. Dashed = 3 months ago. Arrows show rate changes in basis points.{" "}
                  {yields?.inverted
                    ? "Inverted curve signals recession risk — historically reliable 6–18 month lead."
                    : "Normal upward slope — bond market sees no imminent recession."
                  }
                  {(() => {
                    const prevSpread = (yields?.curve_prev?.["10Y"] || 0) - (yields?.curve_prev?.["2Y"] || 0);
                    const nowSpread = yields?.spread_2s10s || 0;
                    const delta = nowSpread - prevSpread;
                    if (Math.abs(delta) < 0.05) return " Curve shape largely unchanged over 3 months.";
                    return delta > 0 ? " Curve has steepened — market expects more growth or inflation ahead." : " Curve has flattened — market pricing slower growth or rate cuts.";
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Asset Macro Scores Table */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Asset Macro Scores</span>
              <Badge>{sortedScores.length} ASSETS</Badge>
            </div>
            <div style={{ ...S.cardBody, padding: "6px 12px" }}>
              {sortedScores.map(([ticker, data]) => (
                <div key={ticker} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                  borderBottom: `1px solid ${C.border}08`, cursor: "pointer",
                }} onClick={() => { setSelectedAsset(ticker); setSubView("scorecard"); }}>
                  <div style={{ width: 70, fontSize: 10, fontWeight: 700, color: C.white }}>{ticker}</div>
                  <ScoreBar score={data.score} label={data.label} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MACRO REGIME VIEW ═══ */}
      {subView === "regime" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Large regime quadrant */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Regime Quadrant — Full View</span>
                <Badge color={REGIME_COLORS[regime?.label]}>{regime?.label}</Badge>
              </div>
              <div style={{ ...S.cardBody, textAlign: "center" }}>
                <RegimeQuadrant regime={regime} size="large" />
                <div style={{ fontSize: 12, fontWeight: 700, color: REGIME_COLORS[regime?.label], marginTop: 8, letterSpacing: "2px" }}>
                  {regime?.label}
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                  Confidence: {regime?.confidence}%
                </div>
              </div>
            </div>

            {/* Growth + Inflation factor tables */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Growth Factors */}
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>Growth Factor (Nowcast)</span>
                  <Badge color={regime?.growth_z > 0 ? C.green : C.red}>
                    {regime?.growth_z > 0 ? "+" : ""}{regime?.growth_z?.toFixed(2)}σ {regime?.growth_z > 0 ? "ABOVE" : "BELOW"} TREND
                  </Badge>
                </div>
                <div style={S.cardBody}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Series", "Value", "Z-Score"].map(h => (
                        <th key={h} style={{ fontSize: 8, color: C.muted, textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${C.border}`, letterSpacing: "1px" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {(regime?.growth_factors || []).map(f => (
                        <tr key={f.series}>
                          <td style={{ fontSize: 9, padding: "3px 6px", color: C.gray, borderBottom: `1px solid ${C.border}08` }}>
                            {f.name || f.series}
                          </td>
                          <td style={{ fontSize: 9, padding: "3px 6px", color: C.white, fontWeight: 600, borderBottom: `1px solid ${C.border}08` }}>
                            {typeof f.value === "number" ? f.value.toFixed(2) : f.value}
                          </td>
                          <td style={{ fontSize: 9, padding: "3px 6px", fontWeight: 700, borderBottom: `1px solid ${C.border}08`,
                            color: f.z_score > 0.5 ? C.green : f.z_score < -0.5 ? C.red : C.gray }}>
                            {f.z_score > 0 ? "+" : ""}{f.z_score?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Inflation Factors */}
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>Inflation Factor (Nowcast)</span>
                  <Badge color={regime?.inflation_z > 0.5 ? C.red : regime?.inflation_z < -0.5 ? C.blue : C.gray}>
                    {regime?.inflation_z > 0 ? "+" : ""}{regime?.inflation_z?.toFixed(2)}σ {regime?.inflation_z > 0.5 ? "ELEVATED" : "CONTAINED"}
                  </Badge>
                </div>
                <div style={S.cardBody}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Series", "Value", "Z-Score"].map(h => (
                        <th key={h} style={{ fontSize: 8, color: C.muted, textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${C.border}`, letterSpacing: "1px" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {(regime?.inflation_factors || []).map(f => (
                        <tr key={f.series}>
                          <td style={{ fontSize: 9, padding: "3px 6px", color: C.gray, borderBottom: `1px solid ${C.border}08` }}>
                            {f.name || f.series}
                          </td>
                          <td style={{ fontSize: 9, padding: "3px 6px", color: C.white, fontWeight: 600, borderBottom: `1px solid ${C.border}08` }}>
                            {typeof f.value === "number" ? f.value.toFixed(2) : f.value}
                          </td>
                          <td style={{ fontSize: 9, padding: "3px 6px", fontWeight: 700, borderBottom: `1px solid ${C.border}08`,
                            color: f.z_score > 0.5 ? C.red : f.z_score < -0.5 ? C.blue : C.gray }}>
                            {f.z_score > 0 ? "+" : ""}{f.z_score?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Regime Implications */}
          {regime?.implications && (
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Regime Implications — {regime?.label}</span>
              </div>
              <div style={{ ...S.cardBody, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {Object.entries(regime.implications).map(([cls, stance]) => (
                  <div key={cls} style={S.kpiTile(IMPL_COLORS[stance] || C.gray)}>
                    <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>{cls.replace("_", " ")}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: IMPL_COLORS[stance] || C.gray }}>{stance}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ASSET SCORECARD VIEW ═══ */}
      {subView === "scorecard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Asset selector */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {Object.keys(scores).map(ticker => (
              <button key={ticker} onClick={() => setSelectedAsset(ticker)} style={{
                background: selectedAsset === ticker ? `${C.orange}20` : C.bg3,
                border: `1px solid ${selectedAsset === ticker ? C.orange : C.border}`,
                color: selectedAsset === ticker ? C.orange : C.gray,
                padding: "4px 10px", fontSize: 9, fontFamily: mono, cursor: "pointer",
                fontWeight: selectedAsset === ticker ? 700 : 400, letterSpacing: "0.5px",
              }}>{ticker}</button>
            ))}
          </div>

          {selectedAsset && scores[selectedAsset] && (() => {
            const asset = scores[selectedAsset];
            const cotData = cot[selectedAsset];
            return (
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>{selectedAsset} — Macro Confluence</span>
                  <Badge color={scoreColor(asset.score)}>
                    {asset.score > 0 ? "+" : ""}{asset.score.toFixed(1)} · {asset.label}
                  </Badge>
                </div>

                {/* Confluence bar */}
                <div style={{ padding: "12px 14px 6px" }}>
                  <div style={{ position: "relative", height: 10, background: C.bg4, borderRadius: 5 }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0, height: "100%", width: "50%",
                      background: `linear-gradient(to right, ${C.red}40, transparent)`, borderRadius: "5px 0 0 5px",
                    }} />
                    <div style={{
                      position: "absolute", right: 0, top: 0, height: "100%", width: "50%",
                      background: `linear-gradient(to left, ${C.green}40, transparent)`, borderRadius: "0 5px 5px 0",
                    }} />
                    <div style={{
                      position: "absolute", left: `${(asset.score + 100) / 2}%`, top: -3,
                      width: 4, height: 16, background: scoreColor(asset.score), borderRadius: 2,
                      transform: "translateX(-50%)", transition: "left 0.4s",
                    }} />
                    <div style={{ position: "absolute", left: "50%", top: -1, width: 1, height: 12, background: C.muted }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 7, color: C.red, letterSpacing: "1px" }}>◄ BEARISH</span>
                    <span style={{ fontSize: 7, color: C.muted, letterSpacing: "1px" }}>NEUTRAL</span>
                    <span style={{ fontSize: 7, color: C.green, letterSpacing: "1px" }}>BULLISH ►</span>
                  </div>
                </div>

                {/* Factor table */}
                <div style={{ padding: "0 14px 14px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Factor", "Value", "Weight", "Contribution", "Signal"].map(h => (
                        <th key={h} style={{
                          fontSize: 8, color: C.muted, textAlign: "left", padding: "4px 8px",
                          borderBottom: `1px solid ${C.border2}`, letterSpacing: "1px",
                        }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {(asset.factors || []).map(f => (
                        <tr key={f.name} style={{ borderBottom: `1px solid ${C.border}08` }}>
                          <td style={{ fontSize: 9, padding: "5px 8px", color: C.gray }}>{f.name}</td>
                          <td style={{ fontSize: 9, padding: "5px 8px", color: C.white, fontWeight: 600 }}>
                            {f.value > 0 ? "+" : ""}{f.value.toFixed(2)}
                          </td>
                          <td style={{ fontSize: 9, padding: "5px 8px", color: C.muted }}>{f.weight}</td>
                          <td style={{ fontSize: 9, padding: "5px 8px", fontWeight: 700,
                            color: f.contribution > 0.5 ? C.green : f.contribution < -0.5 ? C.red : C.gray }}>
                            {f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(2)}
                          </td>
                          <td style={{ fontSize: 9, padding: "5px 8px" }}>
                            <span style={{
                              padding: "1px 6px", borderRadius: 2, fontSize: 8, fontWeight: 700,
                              background: f.signal === "bull" ? `${C.green}20` : f.signal === "bear" ? `${C.red}20` : `${C.gray}20`,
                              color: f.signal === "bull" ? C.green : f.signal === "bear" ? C.red : C.gray,
                            }}>
                              {f.signal === "bull" ? "▲ BULL" : f.signal === "bear" ? "▼ BEAR" : "— NEUT"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* COT data for this asset */}
                {cotData && (
                  <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 4px" }}>
                      <span style={{ fontSize: 9, color: C.gray, letterSpacing: "1px" }}>COT POSITIONING</span>
                      <Badge color={cotData.squeeze_risk ? C.amber : Math.abs(cotData.z_score) > 1 ? C.blue : C.muted}>
                        {cotData.label} {cotData.squeeze_risk ? "⚠ SQUEEZE" : ""}
                      </Badge>
                    </div>
                    <CotGauge ticker={selectedAsset} data={cotData} />
                    <div style={S.hint}>
                      Net Position: {cotData.net_position?.toLocaleString()} · OI: {cotData.open_interest?.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ EVENT INTELLIGENCE VIEW (v2 redesign) ═══ */}
      {subView === "events" && <EventIntelligence calendar={calendar} />}

      {/* ═══ COT POSITIONING VIEW ═══ */}
      {subView === "cot" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* COT Gauge Panel */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Speculative Positioning Z-Score</span>
                <Badge>WEEKLY · ROLLING</Badge>
              </div>
              <div style={S.cardBody}>
                {/* Scale labels */}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0 68px 4px 68px" }}>
                  <span style={{ fontSize: 7, color: C.red, letterSpacing: "0.5px" }}>SHORT</span>
                  <span style={{ fontSize: 7, color: C.muted }}>0</span>
                  <span style={{ fontSize: 7, color: C.green, letterSpacing: "0.5px" }}>LONG</span>
                </div>
                {Object.entries(cot).map(([ticker, data]) => (
                  <CotGauge key={ticker} ticker={ticker} data={data} />
                ))}
              </div>
            </div>

            {/* COT z-score chart for selected asset */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>{selectedAsset || "—"} — Z-Score History</span>
                <Badge color={cot[selectedAsset]?.squeeze_risk ? C.amber : C.muted}>
                  {cot[selectedAsset]?.label || "—"}
                </Badge>
              </div>
              <div style={S.cardBody}>
                {/* Asset selector strip */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
                  {Object.keys(cot).map(ticker => (
                    <button key={ticker} onClick={() => setSelectedAsset(ticker)} style={{
                      background: selectedAsset === ticker ? `${C.orange}20` : "transparent",
                      border: `1px solid ${selectedAsset === ticker ? C.orange : C.border}`,
                      color: selectedAsset === ticker ? C.orange : C.muted,
                      padding: "2px 6px", fontSize: 8, fontFamily: mono, cursor: "pointer",
                    }}>{ticker}</button>
                  ))}
                </div>
                {/* Z-score chart */}
                {selectedAsset && cot[selectedAsset]?.chart && (() => {
                  const chart = cot[selectedAsset].chart;
                  if (chart.length < 3) return <div style={{ color: C.muted, fontSize: 9, textAlign: "center" }}>Insufficient data</div>;
                  const w = 320, h = 120, pad = { t: 8, r: 4, b: 16, l: 4 };
                  const vals = chart.map(d => d.z);
                  const maxAbs = Math.max(3, Math.max(...vals.map(Math.abs)));
                  const xStep = (w - pad.l - pad.r) / (vals.length - 1);
                  const yScale = v => pad.t + (h - pad.t - pad.b) * (1 - (v + maxAbs) / (2 * maxAbs));
                  const zeroY = yScale(0);
                  return (
                    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
                      {/* +2 / -2 threshold lines */}
                      <line x1={pad.l} y1={yScale(2)} x2={w - pad.r} y2={yScale(2)}
                        stroke={C.green} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
                      <line x1={pad.l} y1={yScale(-2)} x2={w - pad.r} y2={yScale(-2)}
                        stroke={C.red} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
                      {/* Zero line */}
                      <line x1={pad.l} y1={zeroY} x2={w - pad.r} y2={zeroY}
                        stroke={C.muted} strokeWidth={0.5} />
                      {/* Bars */}
                      {vals.map((v, i) => {
                        const x = pad.l + i * xStep;
                        const barW = Math.max(1, xStep * 0.7);
                        const top = v >= 0 ? yScale(v) : zeroY;
                        const barH = Math.abs(yScale(v) - zeroY);
                        return (
                          <rect key={i} x={x - barW / 2} y={top}
                            width={barW} height={barH}
                            fill={v >= 0 ? C.green : C.red} opacity={0.5} />
                        );
                      })}
                      {/* Labels */}
                      <text x={pad.l} y={h - 2} fontSize={7} fill={C.muted} fontFamily={mono}>
                        {chart[0].date}
                      </text>
                      <text x={w - pad.r} y={h - 2} fontSize={7} fill={C.muted} fontFamily={mono} textAnchor="end">
                        {chart[chart.length - 1].date}
                      </text>
                      <text x={1} y={yScale(2) + 3} fontSize={6} fill={C.green} fontFamily={mono}>+2σ</text>
                      <text x={1} y={yScale(-2) + 3} fontSize={6} fill={C.red} fontFamily={mono}>−2σ</text>
                    </svg>
                  );
                })()}
                {selectedAsset && cot[selectedAsset] && (
                  <div style={S.hint}>
                    Net: {cot[selectedAsset].net_position?.toLocaleString()} ·
                    OI: {cot[selectedAsset].open_interest?.toLocaleString()} ·
                    Spec %: {cot[selectedAsset].pct_spec_net?.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ═══ REPLAY VIEW ═══ */}
      {subView === "replay" && (() => {
        const frame = replayData.data[replayFrame] || replayData.data[0];
        const visiblePrices = replayData.data.slice(0, replayFrame + 1);
        const cfg = replayData.cfg;
        const pctDone = totalFrames > 1 ? replayFrame / (totalFrames - 1) : 0;

        // Chart dims
        const cW = 700, cH = 250, cP = { t: 10, r: 8, b: 20, l: 55 };
        const allH = replayData.data.map(d => d.high), allL = replayData.data.map(d => d.low);
        const pMin = Math.min(...allL) * 0.998, pMax = Math.max(...allH) * 1.002;
        const pR = pMax - pMin || 1;
        const xS = totalFrames > 1 ? (cW - cP.l - cP.r) / (totalFrames - 1) : 0;
        const yS = v => cP.t + (cH - cP.t - cP.b) * (1 - (v - pMin) / pR);

        // Signals up to current frame
        const visibleSignals = (replayData.signals || []).filter(s => s.bar <= replayFrame);
        const activeSignal = visibleSignals.length > 0 ? visibleSignals[visibleSignals.length - 1] : null;

        // Active signal P&L
        let signalPnl = null, signalPnlPct = null;
        if (activeSignal) {
          const diff = frame.close - activeSignal.price;
          signalPnl = activeSignal.dir === "BUY" ? diff : -diff;
          signalPnlPct = (signalPnl / activeSignal.price * 100);
        }

        // Signal stats
        const closedSignals = visibleSignals.slice(0, -1);
        let wins = 0, totalPnlPct = 0;
        closedSignals.forEach((sig, idx) => {
          const nextSig = visibleSignals[idx + 1];
          if (nextSig) {
            const d = sig.dir === "BUY" ? nextSig.price - sig.price : sig.price - nextSig.price;
            const pct = d / sig.price * 100;
            totalPnlPct += pct;
            if (d > 0) wins++;
          }
        });
        const winRate = closedSignals.length > 0 ? (wins / closedSignals.length * 100).toFixed(0) : "—";

        // Macro score bar
        const msNorm = (frame.macroScore + 100) / 200;
        const msCol = frame.macroScore > 10 ? C.green : frame.macroScore < -10 ? C.red : C.gray;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 220px)", minHeight: 480 }}>
            {/* Asset selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0 6px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginRight: 4 }}>ASSET</span>
              {(replayAssetList.length > 0
                ? replayAssetList.map(a => a.ticker)
                : Object.keys(REPLAY_ASSETS)
              ).map(a => {
                const ral = replayAssetList.find(r => r.ticker === a);
                const isCalibrated = ral?.calibrated;
                const acfg = REPLAY_ASSETS[a];
                const btnColor = replayAsset === a ? (acfg?.color || C.cyan) : C.gray;
                return (
                  <button key={a} onClick={() => { setReplayAsset(a); setReplayFrame(0); setReplayPlaying(false); setAdvancedOpen(false); }}
                    style={{ padding: "3px 10px", fontSize: 9, fontWeight: replayAsset === a ? 700 : 400,
                      background: replayAsset === a ? `${acfg?.color || C.cyan}15` : C.bg3,
                      border: `1px solid ${replayAsset === a ? (acfg?.color || C.cyan) : C.border}`,
                      color: btnColor, fontFamily: mono, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    {a}
                    {ral && (
                      <span style={{ fontSize: 7, fontWeight: 600, color: isCalibrated ? C.green : C.muted,
                        letterSpacing: "0.5px" }}>
                        {isCalibrated ? "✓" : "○"}
                      </span>
                    )}
                  </button>
                );
              })}
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {(() => {
                  const ral = replayAssetList.find(r => r.ticker === replayAsset);
                  if (ral) {
                    return (
                      <span style={{ fontSize: 8, fontWeight: 600, padding: "1px 6px", borderRadius: 2,
                        background: ral.calibrated ? `${C.green}15` : `${C.muted}10`,
                        border: `1px solid ${ral.calibrated ? C.green : C.muted}40`,
                        color: ral.calibrated ? C.green : C.muted, letterSpacing: "0.5px" }}>
                        {ral.calibrated ? "✓ CALIBRATED" : "○ DEFAULT"}
                      </span>
                    );
                  }
                  return null;
                })()}
                <span style={{ fontSize: 8, color: replaySource === "live" ? C.green : replaySource === "loading" ? C.amber : replaySource === "synthetic" ? C.muted : C.cyan }}>
                  {replaySource === "live" ? "● REAL DATA" : replaySource === "loading" ? "● LOADING..." : replaySource === "macro-only" ? "● MACRO ONLY" : replaySource === "prices-only" ? "● PRICES ONLY" : "● SYNTHETIC"} · DAILY
                </span>
              </span>
            </div>

            {/* Main: Chart + Right Panel */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 290px", gap: 0, overflow: "hidden", minHeight: 0 }}>

              {/* CHART */}
              <div ref={chartColRef} style={{ display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, overflow: "hidden", cursor: "crosshair" }}
                onMouseMove={e => {
                  if (!chartColRef.current) return;
                  // Find the first SVG child to compute viewBox-relative position
                  const svgs = chartColRef.current.querySelectorAll("svg");
                  if (svgs.length === 0) return;
                  const svgRect = svgs[0].getBoundingClientRect();
                  const xRatio = (e.clientX - svgRect.left) / svgRect.width;
                  const barIdx = Math.round((xRatio * 700 - 55) / ((700 - 55 - 8) / Math.max(1, totalFrames - 1)));
                  const clamped = Math.max(0, Math.min(totalFrames - 1, barIdx));
                  setHoverBar(clamped);
                }}
                onMouseLeave={() => setHoverBar(null)}
                onClick={() => { if (hoverBar != null) { setReplayFrame(hoverBar); setReplayPlaying(false); } }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 12px", borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: cfg.color, letterSpacing: "2px" }}>{replayAsset}</div>
                    <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px" }}>{cfg.label} · D1</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.white }}>{frame.close.toLocaleString(undefined, { minimumFractionDigits: cfg.dec, maximumFractionDigits: cfg.dec })}</div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        {visiblePrices.length > 1 && (() => {
                          const pc = ((frame.close - visiblePrices[0].close) / visiblePrices[0].close * 100);
                          return <span style={{ fontSize: 10, fontWeight: 600, color: pc >= 0 ? C.green : C.red }}>{pc >= 0 ? "+" : ""}{pc.toFixed(2)}%</span>;
                        })()}
                        <span style={{ fontSize: 7, color: C.muted }}>O {frame.open.toFixed(cfg.dec)} H {frame.high.toFixed(cfg.dec)} L {frame.low.toFixed(cfg.dec)}</span>
                      </div>
                    </div>
                    <div style={{ padding: "2px 8px", background: `${C.cyan}15`, border: `1px solid ${C.cyan}40`, color: C.cyan, fontSize: 9, letterSpacing: "1px", borderRadius: 2 }}>
                      {frame.date}
                    </div>
                  </div>
                </div>
                {/* SVG Chart */}
                <div style={{ flex: 1, padding: "4px 8px", position: "relative", minHeight: 0 }}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${cW} ${cH}`} preserveAspectRatio="none" style={{ display: "block" }}>
                    {[0.25, 0.5, 0.75].map(f => (
                      <line key={f} x1={cP.l} y1={cP.t + (cH - cP.t - cP.b) * f} x2={cW - cP.r} y2={cP.t + (cH - cP.t - cP.b) * f} stroke={C.border} strokeWidth={0.5} />
                    ))}
                    {[0, 0.5, 1].map(f => {
                      const v = pMax - f * pR;
                      return <text key={f} x={cP.l - 4} y={cP.t + (cH - cP.t - cP.b) * f + 3} fontSize={7} fill={C.muted} fontFamily={mono} textAnchor="end">{v.toFixed(cfg.dec > 2 ? 3 : 0)}</text>;
                    })}
                    {/* Candlesticks */}
                    {visiblePrices.map((d, i) => {
                      const x = cP.l + i * xS;
                      const bull = d.close >= d.open;
                      const bTop = yS(Math.max(d.open, d.close)), bBot = yS(Math.min(d.open, d.close));
                      const bH = Math.max(1, bBot - bTop);
                      const cW2 = Math.max(1, Math.min(5, xS * 0.6));
                      const fc = bull ? C.green : C.red;
                      return (
                        <g key={i}>
                          <line x1={x} y1={yS(d.high)} x2={x} y2={yS(d.low)} stroke={fc} strokeWidth={0.6} opacity={0.7} />
                          <rect x={x - cW2 / 2} y={bTop} width={cW2} height={bH} fill={fc} stroke={fc} strokeWidth={0.3} opacity={0.8} rx={0.3} />
                        </g>
                      );
                    })}
                    {/* Playhead line at current frame */}
                    {(() => {
                      const px = cP.l + replayFrame * xS;
                      return <line x1={px} y1={cP.t} x2={px} y2={cH - cP.b} stroke={C.cyan} strokeWidth={0.5} opacity={0.4} />;
                    })()}
                    {/* Hover crosshair */}
                    {hoverBar != null && hoverBar < visiblePrices.length && (() => {
                      const hx = cP.l + hoverBar * xS;
                      const hd = visiblePrices[hoverBar];
                      if (!hd) return null;
                      const hClose = hd.close || 0;
                      return (
                        <g>
                          <line x1={hx} y1={0} x2={hx} y2={cH} stroke={C.white} strokeWidth={0.5} opacity={0.5} strokeDasharray="3,2" />
                          <rect x={hx - 30} y={1} width={60} height={11} rx={2} fill={C.bg} stroke={C.white} strokeWidth={0.3} opacity={0.9} />
                          <text x={hx} y={9} fontSize={7} fill={C.white} fontFamily={mono} textAnchor="middle">{hd.date}</text>
                          <rect x={hx + 4} y={yS(hClose) - 7} width={45} height={11} rx={2} fill={C.bg} stroke={C.white} strokeWidth={0.3} opacity={0.9} />
                          <text x={hx + 6} y={yS(hClose) + 1} fontSize={7} fill={C.white} fontFamily={mono}>{hClose.toFixed(cfg.dec)}</text>
                          <circle cx={hx} cy={yS(hClose)} r={2.5} fill={C.white} stroke={C.bg} strokeWidth={1} />
                        </g>
                      );
                    })()}
                    {/* Event markers */}
                    {replayData.events.filter(e => e.frame <= replayFrame).map((e, i) => (
                      <g key={`ev-${i}`}>
                        <line x1={cP.l + e.frame * xS} y1={cP.t} x2={cP.l + e.frame * xS} y2={cH - cP.b} stroke={C.amber} strokeWidth={0.4} strokeDasharray="2,2" opacity={0.3} />
                        <circle cx={cP.l + e.frame * xS} cy={cP.t + 5} r={2.5} fill={C.amber} opacity={0.6} />
                      </g>
                    ))}
                    <text x={cP.l} y={cH - 4} fontSize={7} fill={C.muted} fontFamily={mono}>{replayData.data[0]?.date}</text>
                    <text x={cW - cP.r} y={cH - 4} fontSize={7} fill={C.muted} fontFamily={mono} textAnchor="end">{replayData.data[totalFrames - 1]?.date}</text>
                  </svg>
                </div>
                {/* QUANT OUTLOOK — Model Validation Histogram */}
                <div style={{ height: 95, padding: "0 8px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                  {(() => {
                    const FWD = fqHorizon;
                    const THRESH = 10;
                    let correct = 0, wrong = 0, total = 0;
                    const barData = visiblePrices.map((d, i) => {
                      const ouVal = d.ouOutlook || 0;
                      const hasFuture = i + FWD < visiblePrices.length;
                      const futurePrice = hasFuture ? visiblePrices[i + FWD].close : null;
                      const currentPrice = d.close || 0;
                      const fwdReturn = hasFuture && currentPrice > 0
                        ? (futurePrice - currentPrice) / currentPrice
                        : null;

                      let status = "neutral";
                      if (Math.abs(ouVal) > THRESH && fwdReturn !== null) {
                        const predictedUp = ouVal > 0;
                        const actuallyUp = fwdReturn > 0;
                        if (predictedUp === actuallyUp) {
                          status = "correct";
                          correct++;
                        } else {
                          status = "wrong";
                          wrong++;
                        }
                        total++;
                      } else if (Math.abs(ouVal) > THRESH && fwdReturn === null) {
                        status = "pending";
                      }
                      return { ouVal, status, fwdReturn };
                    });

                    const correctPct = total > 0 ? (correct / total * 100).toFixed(0) : "—";
                    const wrongPct = total > 0 ? (wrong / total * 100).toFixed(0) : "—";
                    const hitColor = total > 0 ? (correct / total > 0.55 ? C.green : correct / total > 0.45 ? C.amber : C.red) : C.muted;

                    const ouH = 66, ouTop = 2, ouMax = 100;
                    const ouYS = v => ouTop + ouH * (1 - (v + ouMax) / (2 * ouMax));
                    const zeroY = ouYS(0);

                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", flexWrap: "wrap", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 7, color: C.muted, letterSpacing: "1px" }}>QUANT OUTLOOK</span>
                            {/* Horizon selector */}
                            {[5, 10, 21, 42].map(h => (
                              <button key={h} onClick={() => setFqHorizon(h)} style={{
                                padding: "1px 5px", fontSize: 7, fontWeight: fqHorizon === h ? 700 : 400,
                                background: fqHorizon === h ? `${C.cyan}20` : "transparent",
                                border: `1px solid ${fqHorizon === h ? C.cyan : C.border}`,
                                color: fqHorizon === h ? C.cyan : C.muted, fontFamily: mono,
                                cursor: "pointer", borderRadius: 2,
                              }}>{h}d</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 8, fontWeight: 700, color: hitColor, fontFamily: mono }}>
                              CORRECT: {correctPct}%
                              <span style={{ fontWeight: 400, color: C.muted }}> ({correct})</span>
                            </span>
                            <span style={{ fontSize: 8, fontWeight: 700, color: total > 0 && wrong/total > 0.55 ? C.red : C.muted, fontFamily: mono }}>
                              WRONG: {wrongPct}%
                              <span style={{ fontWeight: 400, color: C.muted }}> ({wrong})</span>
                            </span>
                            <span style={{ fontSize: 7, display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ width: 6, height: 6, background: C.green, borderRadius: 1, display: "inline-block" }} />
                              <span style={{ width: 6, height: 6, background: `${C.muted}60`, borderRadius: 1, display: "inline-block" }} />
                              <span style={{ width: 6, height: 6, background: C.cyan, borderRadius: 1, display: "inline-block" }} />
                            </span>
                          </div>
                        </div>

                        <svg width="100%" height="68" viewBox={`0 0 ${cW} 68`} preserveAspectRatio="none" style={{ display: "block" }}>
                          <line x1={cP.l} y1={zeroY} x2={cW - cP.r} y2={zeroY} stroke={C.muted} strokeWidth={0.5} />
                          <text x={cP.l - 4} y={ouYS(50) + 3} fontSize={6} fill={C.muted} fontFamily={mono} textAnchor="end" opacity={0.4}>BULL</text>
                          <text x={cP.l - 4} y={ouYS(-50) + 3} fontSize={6} fill={C.muted} fontFamily={mono} textAnchor="end" opacity={0.4}>BEAR</text>

                          {barData.map((bd, i) => {
                            const x = cP.l + i * xS;
                            const ouVal = Math.max(-ouMax, Math.min(ouMax, bd.ouVal));
                            const barTop = ouVal >= 0 ? ouYS(ouVal) : zeroY;
                            const barH = Math.abs(ouYS(ouVal) - zeroY);
                            const bw = Math.max(1, Math.min(5, xS * 0.7));
                            let barColor, barOpacity;
                            if (bd.status === "correct") { barColor = C.green; barOpacity = 0.85; }
                            else if (bd.status === "wrong") { barColor = C.muted; barOpacity = 0.35; }
                            else if (bd.status === "pending") { barColor = C.cyan; barOpacity = 0.7; }
                            else { barColor = C.muted; barOpacity = 0.15; }
                            return <rect key={i} x={x - bw / 2} y={barTop} width={bw} height={Math.max(0.5, barH)} fill={barColor} opacity={barOpacity} />;
                          })}

                          {(() => {
                            const px = cP.l + replayFrame * xS;
                            return <line x1={px} y1={ouTop} x2={px} y2={ouTop + ouH} stroke={C.cyan} strokeWidth={0.5} opacity={0.4} />;
                          })()}
                          {hoverBar != null && (() => {
                            const hx = cP.l + hoverBar * xS;
                            const bd = barData[hoverBar];
                            return (
                              <>
                                <line x1={hx} y1={0} x2={hx} y2={ouTop + ouH + 4} stroke={C.white} strokeWidth={0.5} opacity={0.5} strokeDasharray="3,2" />
                                <circle cx={hx} cy={ouYS(Math.max(-ouMax, Math.min(ouMax, bd?.ouVal || 0)))} r={2}
                                  fill={bd?.status === "correct" ? C.green : bd?.status === "pending" ? C.cyan : C.gray}
                                  stroke={C.bg} strokeWidth={0.5} />
                              </>
                            );
                          })()}
                        </svg>
                      </>
                    );
                  })()}
                </div>
                {/* COT Z-Score Bar Chart */}
                <div style={{ height: 70, padding: "0 8px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                    <span style={{ fontSize: 7, color: C.muted, letterSpacing: "1px" }}>COT Z-SCORE</span>
                    <span style={{ fontSize: 7, color: frame.cotZ > 1 ? C.green : frame.cotZ < -1 ? C.red : C.muted }}>
                      {frame.cotZ > 0 ? "+" : ""}{frame.cotZ}
                    </span>
                  </div>
                  <svg width="100%" height="52" viewBox={`0 0 ${cW} 52`} preserveAspectRatio="none" style={{ display: "block" }}>
                    {/* ±2σ dashed lines */}
                    {(() => {
                      const cotH = 48, cotTop = 2, cotMaxZ = 3;
                      const cotYS = v => cotTop + cotH * (1 - (v + cotMaxZ) / (2 * cotMaxZ));
                      const zeroY = cotYS(0);
                      return (
                        <>
                          <line x1={cP.l} y1={cotYS(2)} x2={cW - cP.r} y2={cotYS(2)} stroke={C.green} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.3} />
                          <line x1={cP.l} y1={cotYS(-2)} x2={cW - cP.r} y2={cotYS(-2)} stroke={C.red} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.3} />
                          <line x1={cP.l} y1={zeroY} x2={cW - cP.r} y2={zeroY} stroke={C.muted} strokeWidth={0.4} />
                          <text x={cP.l - 4} y={cotYS(2) + 3} fontSize={6} fill={C.green} fontFamily={mono} textAnchor="end">+2</text>
                          <text x={cP.l - 4} y={cotYS(-2) + 3} fontSize={6} fill={C.red} fontFamily={mono} textAnchor="end">-2</text>
                          {/* COT bars */}
                          {visiblePrices.map((d, i) => {
                            const x = cP.l + i * xS;
                            const cotVal = Math.max(-cotMaxZ, Math.min(cotMaxZ, d.cotZ || 0));
                            const barTop = cotVal >= 0 ? cotYS(cotVal) : zeroY;
                            const barH = Math.abs(cotYS(cotVal) - zeroY);
                            const bw = Math.max(1, Math.min(4, xS * 0.6));
                            return (
                              <rect key={i} x={x - bw / 2} y={barTop} width={bw} height={Math.max(0.5, barH)}
                                fill={cotVal >= 0 ? C.green : C.red} opacity={0.5} />
                            );
                          })}
                          {/* Hover crosshair */}
                          {hoverBar != null && (() => {
                            const hx = cP.l + hoverBar * xS;
                            return <line x1={hx} y1={0} x2={hx} y2={cotTop + cotH + 4} stroke={C.white} strokeWidth={0.5} opacity={0.5} strokeDasharray="3,2" />;
                          })()}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div style={{ overflowY: "auto", background: C.bg1, fontSize: 9 }}>

                {/* ══ ANALYSIS BOX ══ */}
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${activeSignal ? (activeSignal.dir === "BUY" ? C.green : C.red) : C.border}`, background: activeSignal ? (activeSignal.dir === "BUY" ? `${C.green}08` : `${C.red}08`) : C.bg1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "2px", color: C.orange, marginBottom: 6 }}>⚡ ANALYSIS</div>
                  {activeSignal ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{
                          padding: "4px 14px", fontSize: 14, fontWeight: 700, letterSpacing: "2px",
                          background: activeSignal.dir === "BUY" ? `${C.green}20` : `${C.red}20`,
                          border: `1px solid ${activeSignal.dir === "BUY" ? C.green : C.red}`,
                          color: activeSignal.dir === "BUY" ? C.green : C.red, borderRadius: 2,
                        }}>
                          {activeSignal.dir === "BUY" ? "▲ BUY" : "▼ SELL"}
                        </div>
                        <div style={{ fontSize: 8, color: C.muted }}>
                          @ {activeSignal.price.toFixed(cfg.dec)} · {activeSignal.date}
                          {activeSignal.score_ma != null && (
                            <span style={{ display: "block", marginTop: 1, fontSize: 7, color: C.gray }}>
                              Score {activeSignal.score > 0 ? "+" : ""}{activeSignal.score} vs MA {activeSignal.score_ma > 0 ? "+" : ""}{activeSignal.score_ma}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* P&L */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                        <span style={{ fontSize: 8, color: C.gray }}>Unrealized P&L</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: signalPnl >= 0 ? C.green : C.red }}>
                          {signalPnl >= 0 ? "+" : ""}{signalPnlPct.toFixed(2)}%
                        </span>
                      </div>
                      {/* Reasons */}
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 7, color: C.muted, letterSpacing: "1px", marginBottom: 3 }}>REASONS</div>
                        {activeSignal.reasons.map((r, i) => (
                          <div key={i} style={{ fontSize: 8, color: C.gray, padding: "1px 0", borderLeft: `2px solid ${activeSignal.dir === "BUY" ? C.green : C.red}40`, paddingLeft: 6, marginBottom: 2 }}>
                            {r}
                          </div>
                        ))}
                      </div>
                      {/* Stats */}
                      <div style={{ display: "flex", gap: 12, marginTop: 6, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
                        <div><div style={{ fontSize: 7, color: C.muted }}>SIGNALS</div><div style={{ fontSize: 11, fontWeight: 700, color: C.white }}>{visibleSignals.length}</div></div>
                        <div><div style={{ fontSize: 7, color: C.muted }}>WIN RATE</div><div style={{ fontSize: 11, fontWeight: 700, color: C.green }}>{winRate}%</div></div>
                        <div><div style={{ fontSize: 7, color: C.muted }}>TOTAL P&L</div><div style={{ fontSize: 11, fontWeight: 700, color: totalPnlPct >= 0 ? C.green : C.red }}>{totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%</div></div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: C.muted, fontSize: 9, padding: "8px 0", textAlign: "center", letterSpacing: "0.5px" }}>
                      WAITING FOR SIGNAL...
                      <div style={{ fontSize: 8, marginTop: 4, color: C.gray }}>Macro Score: {frame.macroScore > 0 ? "+" : ""}{frame.macroScore}</div>
                    </div>
                  )}
                </div>

                {/* Regime Quadrant */}
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.gray, letterSpacing: "2px", marginBottom: 5, fontWeight: 600 }}>MACRO REGIME</div>
                  <div style={{ position: "relative", width: "100%", paddingTop: "70%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0 }}>
                      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: C.border2 }} />
                      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.border2 }} />
                      <div style={{ position: "absolute", top: 3, left: 4, fontSize: 7, color: `${C.red}40` }}>STAGFLATION</div>
                      <div style={{ position: "absolute", top: 3, right: 4, fontSize: 7, color: `${C.amber}40`, textAlign: "right" }}>REFLATION</div>
                      <div style={{ position: "absolute", bottom: 3, left: 4, fontSize: 7, color: `${C.blue}40` }}>DEFLATION</div>
                      <div style={{ position: "absolute", bottom: 3, right: 4, fontSize: 7, color: `${C.green}40`, textAlign: "right" }}>GOLDILOCKS</div>
                      {/* Trail — last 30 frames, wider coordinate scaling */}
                      {visiblePrices.slice(-30).map((d, i, arr) => {
                        const gx = 50 + d.growthZ * 16; const gy = 50 - d.inflZ * 16;
                        return <div key={i} style={{
                          position: "absolute", left: `${Math.max(2, Math.min(98, gx))}%`, top: `${Math.max(2, Math.min(98, gy))}%`,
                          width: 3, height: 3, borderRadius: "50%", background: d.regimeColor,
                          opacity: 0.1 + (i / arr.length) * 0.7, transform: "translate(-50%,-50%)",
                        }} />;
                      })}
                      {/* Current dot — wider scaling for visibility */}
                      <div style={{
                        position: "absolute",
                        left: `${Math.max(5, Math.min(95, 50 + frame.growthZ * 16))}%`,
                        top: `${Math.max(5, Math.min(95, 50 - frame.inflZ * 16))}%`,
                        width: 11, height: 11, borderRadius: "50%", background: frame.regimeColor,
                        border: `2px solid ${C.white}`, boxShadow: `0 0 10px ${frame.regimeColor}`,
                        transform: "translate(-50%,-50%)", zIndex: 2, transition: "left 0.3s, top 0.3s",
                      }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: frame.regimeColor, letterSpacing: "1.5px", marginTop: 3 }}>{frame.regime}</div>
                  <div style={{ textAlign: "center", fontSize: 7, color: C.muted }}>G: {frame.growthZ > 0 ? "+" : ""}{frame.growthZ} · I: {frame.inflZ > 0 ? "+" : ""}{frame.inflZ}</div>
                </div>

                {/* Stats */}
                <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}` }}>
                  {[
                    { label: "Net Liquidity", value: `$${(frame.liq / 1000).toFixed(2)}T`, color: frame.liq > 5500 ? C.green : C.red },
                    { label: "2s10s Spread", value: `${(frame.spread * 100).toFixed(0)}bp`, color: frame.spread < 0 ? C.red : C.cyan },
                    { label: "10Y Real Rate", value: `${frame.realYield > 0 ? "+" : ""}${frame.realYield}%`, color: C.amber },
                    { label: "VIX", value: frame.vix, color: frame.vix > 25 ? C.red : frame.vix > 18 ? C.amber : C.green },
                    { label: "COT Z", value: `${frame.cotZ > 0 ? "+" : ""}${frame.cotZ}`, color: frame.cotZ > 1 ? C.green : frame.cotZ < -1 ? C.red : C.gray },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: `1px solid ${C.border}08` }}>
                      <span style={{ fontSize: 8, color: C.gray }}>{s.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>

                {/* Advanced Factors (expandable) */}
                <div style={{ borderBottom: `1px solid ${C.border}` }}>
                  <button onClick={() => setAdvancedOpen(!advancedOpen)} style={{
                    width: "100%", padding: "5px 12px", display: "flex", justifyContent: "space-between",
                    alignItems: "center", background: "transparent", border: "none", cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", fontFamily: mono }}>
                      {advancedOpen ? "▾" : "▸"} ADVANCED FACTORS
                    </span>
                    <span style={{ fontSize: 7, color: C.muted, fontFamily: mono }}>v2.0 · 7 CHANNELS</span>
                  </button>
                  {advancedOpen && (
                    <div style={{ padding: "0 12px 6px" }}>
                      {[
                        { label: "HY Spread", value: frame.hySpreadZ, tip: "Credit health (inverted)" },
                        { label: "Cu/Au Ratio", value: frame.copperGoldZ, tip: "Growth signal" },
                        { label: "Sentiment", value: frame.sentimentZ, tip: "UMich consumer" },
                        { label: "Wage Growth", value: frame.wageZ, tip: "AHE y/y" },
                        { label: "Rate Diff", value: frame.rateDiffZ, tip: "Yield advantage" },
                        { label: "Cal Surprise", value: frame.surpriseZ, tip: "Data vs forecast" },
                        { label: "M2 Growth", value: frame.m2GrowthZ, tip: "Money supply" },
                      ].map(f => {
                        const v = (f.value || 0);
                        const col = v > 0.5 ? C.green : v < -0.5 ? C.red : C.gray;
                        const pct = Math.min(100, Math.max(0, (v + 3) / 6 * 100));
                        return (
                          <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
                            <span style={{ width: 62, fontSize: 7, color: C.muted }} title={f.tip}>{f.label}</span>
                            <div style={{ flex: 1, height: 4, background: C.bg4, borderRadius: 2, position: "relative" }}>
                              <div style={{ position: "absolute", left: "50%", top: -1, width: 1, height: 6, background: C.border2 }} />
                              <div style={{
                                position: "absolute", left: `${pct}%`, top: -1, width: 6, height: 6,
                                borderRadius: "50%", background: col, transform: "translateX(-50%)",
                                transition: "left 0.3s",
                              }} />
                            </div>
                            <span style={{ width: 30, fontSize: 8, fontWeight: 600, color: col, textAlign: "right", fontFamily: mono }}>
                              {v > 0 ? "+" : ""}{v.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Macro Score */}
                <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", marginBottom: 3 }}>MACRO SCORE</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: C.bg4, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.border2 }} />
                      <div style={{
                        position: "absolute",
                        left: frame.macroScore >= 0 ? "50%" : `${msNorm * 100}%`,
                        width: frame.macroScore >= 0 ? `${(msNorm - 0.5) * 100}%` : `${(0.5 - msNorm) * 100}%`,
                        top: 0, bottom: 0, background: msCol, borderRadius: 3, transition: "all 0.3s",
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: msCol, minWidth: 32, textAlign: "right" }}>{frame.macroScore > 0 ? "+" : ""}{frame.macroScore}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                    <span style={{ fontSize: 6, color: C.red }}>◄ BEARISH</span><span style={{ fontSize: 6, color: C.muted }}>0</span><span style={{ fontSize: 6, color: C.green }}>BULLISH ►</span>
                  </div>
                </div>

                {/* Recent Events */}
                <div style={{ padding: "6px 12px" }}>
                  <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", marginBottom: 4 }}>EVENTS</div>
                  {replayData.events.filter(e => e.frame <= replayFrame).slice(-3).reverse().map((e, i) => (
                    <div key={i} style={{ background: `${C.amber}08`, borderLeft: `2px solid ${C.amber}`, padding: "3px 6px", borderRadius: 2, marginBottom: 3, fontSize: 8 }}>
                      <span style={{ color: C.white, fontWeight: 600 }}>{e.name}</span>
                      <span style={{ color: C.muted, marginLeft: 6 }}>{replayData.data[e.frame]?.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* TIMELINE */}
            <div style={{ padding: "6px 12px 8px", borderTop: `1px solid ${C.border2}`, background: C.bg2, flexShrink: 0, position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: 2, width: `${pctDone * 100}%`, background: C.cyan, boxShadow: `0 0 6px ${C.cyan}`, transition: "width 0.1s" }} />
              {/* Event pins */}
              <div style={{ position: "relative", height: 14, marginBottom: 3 }}>
                {replayData.events.map((e, i) => {
                  const ep = e.frame / (totalFrames - 1) * 100;
                  return <div key={i} style={{ position: "absolute", left: `${ep}%`, top: 0, transform: "translateX(-50%)", textAlign: "center" }} title={e.name}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: e.frame <= replayFrame ? C.amber : C.muted, margin: "0 auto" }} />
                    <div style={{ fontSize: 5, color: C.muted, marginTop: 1, whiteSpace: "nowrap" }}>{e.name.slice(0, 6)}</div>
                  </div>;
                })}
              </div>
              <input type="range" min={0} max={totalFrames - 1} value={replayFrame} onChange={e => setReplayFrame(+e.target.value)}
                style={{ width: "100%", height: 4, appearance: "none", WebkitAppearance: "none",
                  background: `linear-gradient(to right, ${C.cyan} ${pctDone * 100}%, ${C.bg4} ${pctDone * 100}%)`,
                  borderRadius: 2, outline: "none", cursor: "pointer", marginBottom: 6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 8, color: C.muted, minWidth: 60 }}>{replayData.data[0]?.date?.slice(0, 7)}</span>
                <button onClick={() => setReplayFrame(Math.max(0, replayFrame - 5))} style={{ width: 26, height: 26, background: C.bg3, border: `1px solid ${C.border2}`, color: C.gray, cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>◀◀</button>
                <button onClick={() => setReplayPlaying(!replayPlaying)} style={{ width: 32, height: 32, background: replayPlaying ? `${C.cyan}15` : C.bg3, border: `1px solid ${replayPlaying ? C.cyan : C.border2}`, color: C.cyan, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: replayPlaying ? `0 0 10px ${C.cyan}30` : "none" }}>{replayPlaying ? "⏸" : "▶"}</button>
                <button onClick={() => setReplayFrame(Math.min(totalFrames - 1, replayFrame + 5))} style={{ width: 26, height: 26, background: C.bg3, border: `1px solid ${C.border2}`, color: C.gray, cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>▶▶</button>
                <div style={{ width: 1, height: 20, background: C.border2 }} />
                {[1, 2, 5].map(s => (
                  <button key={s} onClick={() => setReplaySpeed(s)} style={{ padding: "2px 7px", fontSize: 9, fontWeight: 600, fontFamily: mono, background: replaySpeed === s ? `${C.cyan}15` : C.bg3, border: `1px solid ${replaySpeed === s ? C.cyan : C.border2}`, color: replaySpeed === s ? C.cyan : C.gray, cursor: "pointer" }}>{s}×</button>
                ))}
                <span style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: C.cyan, letterSpacing: "2px" }}>{frame.date}</span>
                <button onClick={() => { setReplayFrame(0); setReplayPlaying(false); }} style={{ width: 26, height: 26, background: C.bg3, border: `1px solid ${C.border2}`, color: C.gray, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>↺</button>
                <span style={{ fontSize: 8, color: C.muted, minWidth: 60, textAlign: "right" }}>{replayData.data[totalFrames - 1]?.date?.slice(0, 7)}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}