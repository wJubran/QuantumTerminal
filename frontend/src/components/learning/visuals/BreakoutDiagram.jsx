// version: v3
// BreakoutDiagram — GBM cone. Same cone geometry as MeanReversion /
// TailFade. Price leaves the cone's upper boundary (crosses +1σ and heads
// toward +2σ) — that's the directional breakout entry. Target rides along
// the cone's +2σ edge.

import React from "react";

export default function BreakoutDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  const median  = "M 220 110 L 430 110";
  const sd1High = "M 220 110 Q 320 94  430 85";
  const sd1Low  = "M 220 110 Q 320 126 430 135";
  const sd2High = "M 220 110 Q 320 74  430 55";
  const sd2Low  = "M 220 110 Q 320 146 430 165";

  // Compressed (tight) history leading into the anchor.
  const history = "M 30,112 L 55,114 L 80,110 L 105,113 L 130,111 L 155,113 L 180,110 L 200,111 L 220,110";
  // After anchor: consolidates near the median, then punches through +1σ
  // at ~x=310 and rides higher toward +2σ.
  const future  = "M 220,110 L 245,108 L 270,112 L 290,106 L 310,96 L 335,82 L 360,70 L 390,60 L 420,55 L 430,53";

  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width="460" height="220" fill="#0a0a0a"/>

      {/* Cone fills */}
      <path d="M 220 110 Q 320 74 430 55 L 430 165 Q 320 146 220 110 Z"
        fill="#ff6d00" fillOpacity="0.06"/>
      <path d="M 220 110 Q 320 94 430 85 L 430 135 Q 320 126 220 110 Z"
        fill="#ff6d00" fillOpacity="0.08"/>

      {/* Cone lines */}
      <path d={sd2High} fill="none" stroke="#e8383b" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 3"/>
      <path d={sd2Low}  fill="none" stroke="#e8383b" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 3"/>
      <path d={sd1High} fill="none" stroke="#ff6d00" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="2 3"/>
      <path d={sd1Low}  fill="none" stroke="#ff6d00" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="2 3"/>
      <path d={median}  fill="none" stroke="#ffc107" strokeWidth="1.2" strokeDasharray="5 3"/>

      {/* Anchor */}
      <line x1="220" y1="5" x2="220" y2="215" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 2" opacity="0.8"/>
      <text x="220" y="16" fill="#22d3ee" fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        {L("ANCHOR · NOW", "الآن · ANCHOR")}
      </text>

      {/* Price */}
      <path d={history} fill="none" stroke="#8b96a3" strokeWidth="1.5"/>
      <path d={future}  fill="none" stroke="#e8ecf1" strokeWidth="1.8"/>
      <circle cx="220" cy="110" r="3" fill="#22d3ee"/>

      {/* BUY at the +1σ breakout */}
      <circle cx="310" cy="96" r="6" fill="#2ebd59"/>
      <line x1="310" y1="96" x2="310" y2="202" stroke="#2ebd59" strokeWidth="1" strokeDasharray="2 3"/>
      <text x="310" y="210" fill="#2ebd59" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        BUY · {L("BREAKOUT +1σ", "اختراق +1σ")}
      </text>

      {/* TP riding +2σ */}
      <circle cx="390" cy="60" r="6" fill="#ff6d00"/>
      <line x1="390" y1="60" x2="390" y2="30" stroke="#ff6d00" strokeWidth="1"/>
      <text x="390" y="24" fill="#ff6d00" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        TP · {L("RIDE TO +2σ", "ركوب حتى +2σ")}
      </text>

      {/* Cone labels */}
      <text x="435" y="58" fill="#e8383b" fontSize="9" fontFamily="monospace">+2σ</text>
      <text x="435" y="88" fill="#ff6d00" fontSize="9" fontFamily="monospace">+1σ</text>
      <text x="435" y="113" fill="#ffc107" fontSize="9" fontFamily="monospace">p50</text>
      <text x="435" y="138" fill="#ff6d00" fontSize="9" fontFamily="monospace">−1σ</text>
      <text x="435" y="168" fill="#e8383b" fontSize="9" fontFamily="monospace">−2σ</text>

      <text x="125" y="210" fill="#8b96a3" fontSize="9" fontFamily="monospace" textAnchor="middle" opacity="0.8">
        {L("COMPRESSION · HISTORY", "compression · تاريخ")}
      </text>
    </svg>
  );
}
