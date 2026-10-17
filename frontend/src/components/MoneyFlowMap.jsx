/**
 * MoneyFlowMap.jsx — Animated Inter-Sector Capital Flow Map
 * ==========================================================
 * Quantum Terminal visualization showing real-time money
 * movement between major asset sectors.
 *
 * Displays: EQUITIES, COMMODITIES, FX, BONDS, CASH, CRYPTO
 * with animated arcs showing dollar flows between them.
 *
 * Data: /api/fundamental/money-flow (synced from producer)
 */
import { useState, useEffect, useMemo, useCallback } from "react";

const API = "";  // relative — same origin in production, proxied in dev

const C = {
  bg: "#000000", bg1: "#080808", bg2: "#0e0e0e", bg3: "#141414",
  border: "#1e1e1e", border2: "#2a2a2a",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", amber: "#ffa500", cyan: "#00d2d3",
  white: "#f0f0f0", gray: "#888", muted: "#444",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const REGIME_COLORS = {
  REFLATION: C.amber, GOLDILOCKS: C.green, STAGFLATION: C.red, DEFLATION: C.blue,
};

// ── Node positions (circular layout, 0-1 normalized) ──
const NODE_POSITIONS = {
  BONDS:       { x: 0.38, y: 0.06 },
  FX:          { x: 0.06, y: 0.35 },
  EQUITIES:    { x: 0.94, y: 0.28 },
  OPTIONS:     { x: 0.50, y: 0.42 },
  CASH:        { x: 0.06, y: 0.72 },
  CRYPTO:      { x: 0.94, y: 0.72 },
  COMMODITIES: { x: 0.50, y: 0.92 },
};

// ── Compute curved arc path between two points ──
function arcPath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Control point perpendicular to midpoint, arc height proportional to distance
  const bulge = dist * 0.35;
  const nx = -dy / dist * bulge;
  const ny = dx / dist * bulge;
  const cx = mx + nx;
  const cy = my + ny;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// ── CSS keyframes for flowing particles ──
const flowKeyframes = `
@keyframes flowDash {
  0% { stroke-dashoffset: 20; }
  100% { stroke-dashoffset: 0; }
}
@keyframes pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes glowPulse {
  0%, 100% { filter: drop-shadow(0 0 4px currentColor); }
  50% { filter: drop-shadow(0 0 12px currentColor); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export default function MoneyFlowMap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null); // hovered flow or sector
  const [hoveredSector, setHoveredSector] = useState(null);
  const [timeframe, setTimeframe] = useState("macro"); // "macro" (4w) or "weekly" (7d)

  // Fetch flow data
  const fetchFlows = useCallback((tf) => {
    fetch(`${API}/api/fundamental/money-flow?period=${tf}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFlows(timeframe);
    const iv = setInterval(() => fetchFlows(timeframe), 300_000);
    return () => clearInterval(iv);
  }, [timeframe, fetchFlows]);

  const W = 560, H = 340;
  const pad = { l: 44, r: 44, t: 20, b: 26 };

  // Map node positions to pixel coords
  const nodeCoords = useMemo(() => {
    const coords = {};
    for (const [id, pos] of Object.entries(NODE_POSITIONS)) {
      coords[id] = {
        x: pad.l + pos.x * (W - pad.l - pad.r),
        y: pad.t + pos.y * (H - pad.t - pad.b),
      };
    }
    return coords;
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 400, color: C.gray, fontSize: 10, fontFamily: mono, letterSpacing: "2px" }}>
        COMPUTING CAPITAL FLOWS...
      </div>
    );
  }

  if (!data || !data.sectors) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: 400, gap: 10 }}>
        <div style={{ color: C.red, fontSize: 10, fontFamily: mono }}>
          No flow data available
        </div>
        <div style={{ color: C.muted, fontSize: 9, fontFamily: mono }}>
          Capital flow data has not been synced yet
        </div>
      </div>
    );
  }

  const sectors = data.sectors || {};
  const flows = data.flows || [];

  return (
    <div style={{ fontFamily: mono, color: C.white, padding: "0 8px 12px" }}>
      <style>{flowKeyframes}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: C.orange }}>
            CAPITAL FLOW MAP
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: REGIME_COLORS[data.regime] || C.gray,
            padding: "1px 8px", marginLeft: 10, border: `1px solid ${REGIME_COLORS[data.regime] || C.gray}40`,
            borderRadius: 2, background: `${REGIME_COLORS[data.regime] || C.gray}10` }}>
            {data.regime}
          </span>
          <span style={{ fontSize: 9, color: C.muted, marginLeft: 10 }}>
            {data.net_liquidity_t} · {data.liq_trend}
          </span>
          <span style={{ fontSize: 8, color: C.gray, marginLeft: 10, padding: "1px 6px",
            border: `1px solid ${C.border2}`, borderRadius: 2 }}>
            REF: 4-WEEK Δ
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, color: C.muted }}>
            {data.computed_at?.slice(0, 16).replace("T", " ")}
          </span>
          <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border2}`, borderRadius: 3, overflow: "hidden" }}>
            {[
              { id: "macro", label: "MACRO", sub: "4W" },
              { id: "weekly", label: "MICRO", sub: "7D" },
            ].map(tf => (
              <button key={tf.id} onClick={() => setTimeframe(tf.id)} style={{
                padding: "3px 12px", fontSize: 9, fontWeight: 700, fontFamily: mono,
                background: timeframe === tf.id ? `${C.orange}20` : "transparent",
                color: timeframe === tf.id ? C.orange : C.gray,
                border: "none", borderRight: tf.id === "macro" ? `1px solid ${C.border2}` : "none",
                cursor: "pointer", letterSpacing: "1px",
              }}>
                {tf.label} <span style={{ fontSize: 7, opacity: 0.6 }}>{tf.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ position: "relative", marginTop: 8 }}>

        {/* Total Liquidity Summary — top-right overlay */}
        <div style={{
          position: "absolute", top: 6, right: 6, zIndex: 5,
          background: `${C.bg2}e8`, border: `1px solid ${C.border2}`, borderRadius: 4,
          padding: "12px 18px", backdropFilter: "blur(6px)", minWidth: 160,
        }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "1.5px", marginBottom: 4, fontWeight: 700 }}>SYSTEM LIQUIDITY</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: data.liq_trend === "EXPANDING" ? C.green : C.red }}>
            {data.net_liquidity_t}
          </div>
          <div style={{ fontSize: 12, color: data.liq_trend === "EXPANDING" ? C.green : C.red, marginTop: 3, fontWeight: 600 }}>
            {data.liq_trend === "EXPANDING" ? "▲" : "▼"} {data.liq_delta_label || data.liq_trend}
          </div>
          <div style={{ fontSize: 9, color: C.gray, marginTop: 4 }}>
            {data.net_liquidity_prev_t && data.net_liquidity_prev_t !== "?"
              ? `was ${data.net_liquidity_prev_t}`
              : ""
            } · {timeframe === "macro" ? "4-week Δ" : "7-day Δ"}
          </div>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>

          {/* Background grid */}
          <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={C.orange} stopOpacity="0.06" />
              <stop offset="100%" stopColor={C.orange} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={W / 2} cy={H / 2} r={90} fill="url(#centerGlow)" />

          {/* Flow arcs */}
          {flows.map((flow, i) => {
            const from = nodeCoords[flow.from];
            const to = nodeCoords[flow.to];
            if (!from || !to) return null;

            const path = arcPath(from.x, from.y, to.x, to.y);
            const isActive = hovered === i;
            const flowColor = flow.type === "rotation" ? C.orange
              : flow.type === "liquidity" ? C.cyan
              : flow.type === "yield_driven" ? C.blue
              : flow.type === "positioning" ? C.amber
              : flow.type === "hedging" ? "#9b59b6"
              : flow.type === "regime" ? C.gray
              : C.gray;
            const width = Math.max(1, Math.min(4, flow.strength * 4));

            // Midpoint for label
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const dx = to.x - from.x, dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / dist * dist * 0.18;
            const ny = dx / dist * dist * 0.18;

            return (
              <g key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}>
                {/* Shadow arc */}
                <path d={path} fill="none" stroke={flowColor} strokeWidth={width + 4}
                  opacity={0.08} />
                {/* Base arc */}
                <path d={path} fill="none" stroke={flowColor} strokeWidth={width}
                  opacity={isActive ? 0.7 : 0.3} />
                {/* Animated flowing particles */}
                <path d={path} fill="none" stroke={flowColor} strokeWidth={width}
                  strokeDasharray="4,16" opacity={isActive ? 0.9 : 0.6}
                  style={{ animation: `flowDash ${1.5 / Math.max(0.3, flow.strength)}s linear infinite` }} />
                {/* Arrow at midpoint */}
                <circle cx={mx + nx} cy={my + ny} r={isActive ? 4 : 3}
                  fill={flowColor} opacity={0.8} />
                {/* Amount label */}
                <text x={mx + nx} y={my + ny - 8} fontSize={isActive ? 10 : 8}
                  fill={flowColor} textAnchor="middle" fontFamily={mono} fontWeight={700}
                  opacity={isActive ? 1 : 0.7}>
                  ${flow.amount_b}B
                </text>
                {/* Invisible fat hit area */}
                <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
              </g>
            );
          })}

          {/* Sector nodes */}
          {Object.entries(sectors).map(([id, sector]) => {
            const pos = nodeCoords[id];
            if (!pos) return null;

            const isInflow = sector.net_flow_b > 0;
            const isOutflow = sector.net_flow_b < 0;
            const nodeColor = sector.color || C.gray;
            const isHov = hoveredSector === id;
            const radius = isHov ? 32 : 28;

            return (
              <g key={id}
                onMouseEnter={() => setHoveredSector(id)}
                onMouseLeave={() => setHoveredSector(null)}
                style={{ cursor: "pointer" }}>
                {/* Glow ring */}
                <circle cx={pos.x} cy={pos.y} r={radius + 6} fill="none"
                  stroke={nodeColor} strokeWidth={1} opacity={0.15}
                  style={isInflow || isOutflow ? { animation: "glowPulse 2s ease-in-out infinite" } : {}} />
                {/* Outer ring */}
                <circle cx={pos.x} cy={pos.y} r={radius} fill={C.bg2}
                  stroke={nodeColor} strokeWidth={isHov ? 2.5 : 1.5} opacity={0.9} />
                {/* Fill gradient based on flow direction */}
                <circle cx={pos.x} cy={pos.y} r={radius - 2}
                  fill={isInflow ? `${C.green}15` : isOutflow ? `${C.red}10` : `${C.gray}08`} />
                {/* Icon — white SVG symbol instead of emoji */}
                {(() => {
                  const iconMap = { EQUITIES: "◆", COMMODITIES: "⬡", FX: "$¥", BONDS: "≡", CASH: "$", CRYPTO: "₿", OPTIONS: "⚡" };
                  return (
                    <text x={pos.x} y={pos.y - 5} fontSize={14} textAnchor="middle"
                      dominantBaseline="middle" fill={C.white} fontFamily={mono} fontWeight={700}>
                      {iconMap[id] || "●"}
                    </text>
                  );
                })()}
                {/* Label */}
                <text x={pos.x} y={pos.y + 7} fontSize={7} fill={nodeColor}
                  textAnchor="middle" fontFamily={mono} fontWeight={700}
                  letterSpacing="0.5">
                  {sector.label.toUpperCase()}
                </text>
                {/* Flow amount */}
                <text x={pos.x} y={pos.y + 17} fontSize={8} fontFamily={mono}
                  textAnchor="middle" fontWeight={700}
                  fill={isInflow ? C.green : isOutflow ? C.red : C.muted}>
                  {isInflow ? "▲" : isOutflow ? "▼" : "—"} ${Math.abs(sector.net_flow_b) < 1 && sector.net_flow_b !== 0 ? Math.abs(sector.net_flow_b).toFixed(1) : Math.abs(sector.net_flow_b).toFixed(0)}B
                </text>
              </g>
            );
          })}

          {/* Center glow behind OPTIONS node */}
        </svg>

        {/* Hover tooltip */}
        {hovered !== null && flows[hovered] && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 4,
            padding: "10px 14px", maxWidth: 260, zIndex: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            animation: "fadeInUp 0.2s ease-out",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 4 }}>
              ${flows[hovered].amount_b}B FLOW
            </div>
            <div style={{ fontSize: 10, color: C.white, marginBottom: 4 }}>
              {sectors[flows[hovered].from]?.label || flows[hovered].from}
              <span style={{ color: C.orange, margin: "0 6px" }}>→</span>
              {sectors[flows[hovered].to]?.label || flows[hovered].to}
            </div>
            <div style={{ fontSize: 9, color: C.gray, lineHeight: "1.5" }}>
              {flows[hovered].reason}
            </div>
            <div style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>
              Type: {flows[hovered].type} · Strength: {(flows[hovered].strength * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {/* Sector hover tooltip */}
        {hoveredSector && sectors[hoveredSector] && (
          <div style={{
            position: "absolute", top: 10, left: 10,
            background: C.bg3, border: `1px solid ${sectors[hoveredSector].color}40`, borderRadius: 4,
            padding: "10px 14px", maxWidth: 240, zIndex: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            animation: "fadeInUp 0.2s ease-out",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: sectors[hoveredSector].color }}>
              {sectors[hoveredSector].icon} {sectors[hoveredSector].label}
            </div>
            <div style={{ fontSize: 10, color: C.white, marginTop: 4 }}>
              Sentiment: <span style={{ fontWeight: 700, color: sectors[hoveredSector].net_flow_b > 0 ? C.green : sectors[hoveredSector].net_flow_b < 0 ? C.red : C.gray }}>
                {sectors[hoveredSector].sentiment}
              </span>
            </div>
            <div style={{ fontSize: 9, color: C.gray, marginTop: 2 }}>
              Macro Score: {sectors[hoveredSector].macro_score > 0 ? "+" : ""}{sectors[hoveredSector].macro_score}
              {sectors[hoveredSector].cot_z ? ` · COT z: ${sectors[hoveredSector].cot_z > 0 ? "+" : ""}${sectors[hoveredSector].cot_z}` : ""}
            </div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
              Net Flow: <span style={{ color: sectors[hoveredSector].net_flow_b > 0 ? C.green : C.red, fontWeight: 700 }}>
                {sectors[hoveredSector].net_flow_b > 0 ? "+" : ""}{sectors[hoveredSector].net_flow_b}B
              </span>
              <span style={{ color: C.gray }}> vs 4 weeks ago</span>
            </div>
          </div>
        )}
      </div>

      {/* Flow legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "8px 0",
        borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
        {[
          { color: C.orange, label: "Rotation" },
          { color: C.cyan, label: "Liquidity" },
          { color: C.blue, label: "Yield-driven" },
          { color: C.amber, label: "Positioning" },
          { color: "#9b59b6", label: "Hedging" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 16, height: 2, background: l.color, borderRadius: 1 }} />
            <span style={{ fontSize: 8, color: C.gray }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Flow table summary */}
      <div style={{ marginTop: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 12px" }}>
        <div style={{ fontSize: 9, color: C.gray, letterSpacing: "1.5px", marginBottom: 6, fontWeight: 700 }}>ACTIVE FLOWS</div>
        {flows.map((f, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
            borderBottom: i < flows.length - 1 ? `1px solid ${C.border}08` : "none",
            opacity: hovered === i ? 1 : 0.8,
          }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}>
            <span style={{ width: 50, fontSize: 11, fontWeight: 700, color: C.orange, fontFamily: mono }}>
              ${f.amount_b}B
            </span>
            <span style={{ width: 90, fontSize: 9, color: C.white }}>
              {sectors[f.from]?.label || f.from}
            </span>
            <span style={{ fontSize: 9, color: C.orange }}>→</span>
            <span style={{ width: 90, fontSize: 9, color: C.white }}>
              {sectors[f.to]?.label || f.to}
            </span>
            <span style={{ flex: 1, fontSize: 8, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.reason}
            </span>
            <div style={{ width: 40, height: 3, background: C.bg3, borderRadius: 2 }}>
              <div style={{ width: `${f.strength * 100}%`, height: "100%",
                background: f.type === "rotation" ? C.orange : f.type === "liquidity" ? C.cyan : C.blue,
                borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}