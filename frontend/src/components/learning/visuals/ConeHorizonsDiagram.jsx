// ConeHorizonsDiagram — one chart with multiple cones nested from the
// same anchor, each reaching a different forward horizon. Shows at a
// glance how near-term (now) cones are tight while longer horizons
// (monthly / quarterly) fan out progressively.

import React from "react";

export default function ConeHorizonsDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  // Shared anchor
  const ax = 160, ay = 110;

  // Each horizon: { endX, spread (sd2 offset), color, label }
  // Wider horizon → more forward distance AND more vertical spread.
  const horizons = [
    { endX: 220, spread: 18, color: "#22d3ee", label: "NOW (3d)" },
    { endX: 265, spread: 30, color: "#3796ff", label: "WEEKLY (7d)" },
    { endX: 340, spread: 55, color: "#ff6d00", label: "MONTHLY (30d)" },
    { endX: 435, spread: 82, color: "#e8383b", label: "QUARTERLY (90d)" },
  ];

  // History
  const history = "M 20,115 L 50,113 L 75,117 L 100,113 L 120,111 L 140,110 L 160,110";

  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width="460" height="220" fill="#0a0a0a"/>

      {/* Draw horizons from widest (back) to narrowest (front) so they nest */}
      {[...horizons].reverse().map((h, i) => {
        const mid = (ax + h.endX) / 2;
        const topY    = ay - h.spread;
        const botY    = ay + h.spread;
        const midTopY = ay - h.spread * 0.55;
        const midBotY = ay + h.spread * 0.55;
        const fill = `M ${ax} ${ay} Q ${mid} ${midTopY} ${h.endX} ${topY}
                      L ${h.endX} ${botY} Q ${mid} ${midBotY} ${ax} ${ay} Z`;
        const up   = `M ${ax} ${ay} Q ${mid} ${midTopY} ${h.endX} ${topY}`;
        const dn   = `M ${ax} ${ay} Q ${mid} ${midBotY} ${h.endX} ${botY}`;
        return (
          <g key={i}>
            <path d={fill} fill={h.color} fillOpacity="0.08"/>
            <path d={up}   fill="none" stroke={h.color} strokeWidth="1" strokeDasharray="4 3"/>
            <path d={dn}   fill="none" stroke={h.color} strokeWidth="1" strokeDasharray="4 3"/>
            {/* Median stub */}
            <path d={`M ${ax} ${ay} L ${h.endX} ${ay}`}
              fill="none" stroke={h.color} strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="2 4"/>
          </g>
        );
      })}

      {/* Labels at each horizon's right edge (top of cone) */}
      {horizons.map((h, i) => {
        const topY = ay - h.spread;
        return (
          <g key={i}>
            <line x1={h.endX} y1={topY} x2={h.endX} y2={topY - 10}
              stroke={h.color} strokeWidth="1"/>
            <text x={h.endX} y={topY - 14} fill={h.color}
              fontSize="8" fontFamily="monospace" fontWeight="800"
              textAnchor="middle">
              {h.label}
            </text>
          </g>
        );
      })}

      {/* Anchor line */}
      <line x1={ax} y1="5" x2={ax} y2="215" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 2" opacity="0.7"/>
      <text x={ax} y="200" fill="#22d3ee" fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        {L("ANCHOR", "anchor / نقطة ارتكاز")}
      </text>

      {/* History */}
      <path d={history} fill="none" stroke="#8b96a3" strokeWidth="1.5"/>
      <circle cx={ax} cy={ay} r="3" fill="#22d3ee"/>

      {/* Caption */}
      <text x="230" y="215" fill="#ffd89e" fontSize="9" fontFamily="monospace" textAnchor="middle" opacity="0.85">
        {L("cones nest — tighter near-term, wider long-term",
           "cones متداخلة — ضيقة في القريب، واسعة في البعيد")}
      </text>
    </svg>
  );
}
