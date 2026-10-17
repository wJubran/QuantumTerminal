// version: v2
// TailFadeDiagram — uses the actual GBM CONE shape. Past candles on the
// left, an anchor line marking "now", then a forward-fanning cone
// (median + ±sd1 + ±sd2 diverging as time progresses). Price spikes into
// the +sd2 tail after the anchor — that's where we fade (sell) to target
// a return to the cone's median.

import React from "react";

export default function TailFadeDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  // Anchor at (220, 110). Cone extends from x=220 to x=430.
  // Quadratic curves approximate sqrt(t) divergence.
  const median    = "M 220 110 L 430 110";
  const sd1High   = "M 220 110 Q 320 94  430 85";
  const sd1Low    = "M 220 110 Q 320 126 430 135";
  const sd2High   = "M 220 110 Q 320 74  430 55";
  const sd2Low    = "M 220 110 Q 320 146 430 165";

  // Past price (historical candles-ish) — drifts sideways, ends exactly
  // at the anchor point (220, 110).
  const history  = "M 30,115 L 55,112 L 80,117 L 105,114 L 130,110 L 155,112 L 180,109 L 200,111 L 220,110";

  // Future price after anchor — spikes up, pierces +sd2, fades back to median.
  const future   = "M 220,110 L 240,100 L 260,85 L 285,68 L 310,55 L 320,50 L 335,65 L 360,85 L 395,102 L 430,108";

  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width="460" height="220" fill="#0a0a0a"/>

      {/* Shaded cone fill (sd2 envelope) */}
      <path
        d="M 220 110 Q 320 74 430 55 L 430 165 Q 320 146 220 110 Z"
        fill="#ff6d00" fillOpacity="0.06"
      />
      {/* Inner (sd1) subtle fill to give depth */}
      <path
        d="M 220 110 Q 320 94 430 85 L 430 135 Q 320 126 220 110 Z"
        fill="#ff6d00" fillOpacity="0.08"
      />

      {/* Cone lines */}
      <path d={sd2High} fill="none" stroke="#e8383b" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 3"/>
      <path d={sd2Low}  fill="none" stroke="#e8383b" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 3"/>
      <path d={sd1High} fill="none" stroke="#ff6d00" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="2 3"/>
      <path d={sd1Low}  fill="none" stroke="#ff6d00" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="2 3"/>
      <path d={median}  fill="none" stroke="#ffc107" strokeWidth="1.2" strokeDasharray="5 3"/>

      {/* Anchor / "NOW" vertical line */}
      <line x1="220" y1="5" x2="220" y2="215" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 2" opacity="0.8"/>
      <text x="220" y="16" fill="#22d3ee" fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        {L("ANCHOR · NOW", "الآن · ANCHOR")}
      </text>

      {/* Historical + future price */}
      <path d={history} fill="none" stroke="#8b96a3" strokeWidth="1.5"/>
      <path d={future}  fill="none" stroke="#e8ecf1" strokeWidth="1.8"/>

      {/* Anchor dot */}
      <circle cx="220" cy="110" r="3" fill="#22d3ee"/>

      {/* Entry — where price pierces +sd2 (around x=310) */}
      <circle cx="320" cy="50" r="6" fill="#e8383b"/>
      <line x1="320" y1="50" x2="320" y2="20" stroke="#e8383b" strokeWidth="1"/>
      <text x="320" y="13" fill="#e8383b" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        SELL · {L("FADE TAIL", "بيع القمة")}
      </text>

      {/* Target — back at the cone's median */}
      <circle cx="395" cy="108" r="6" fill="#ff6d00"/>
      <line x1="395" y1="108" x2="395" y2="200" stroke="#ff6d00" strokeWidth="1"/>
      <text x="395" y="210" fill="#ff6d00" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        TP · {L("MEDIAN", "p50")}
      </text>

      {/* Cone labels on right edge */}
      <text x="435" y="58" fill="#e8383b" fontSize="9" fontFamily="monospace">+2σ</text>
      <text x="435" y="88" fill="#ff6d00" fontSize="9" fontFamily="monospace">+1σ</text>
      <text x="435" y="113" fill="#ffc107" fontSize="9" fontFamily="monospace">p50</text>
      <text x="435" y="138" fill="#ff6d00" fontSize="9" fontFamily="monospace">−1σ</text>
      <text x="435" y="168" fill="#e8383b" fontSize="9" fontFamily="monospace">−2σ</text>

      {/* Past / future section labels */}
      <text x="125" y="210" fill="#8b96a3" fontSize="9" fontFamily="monospace" textAnchor="middle" opacity="0.8">
        {L("HISTORY", "تاريخ")}
      </text>
      <text x="325" y="210" fill="#ffc107" fontSize="9" fontFamily="monospace" textAnchor="middle" opacity="0.9">
        {L("GBM CONE · FORECAST", "توقع · GBM cone")}
      </text>
    </svg>
  );
}
