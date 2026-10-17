// version: v3
// MeanReversionDiagram — GBM cone. History on the left ending at the
// anchor, forward cone fans out via sqrt(t)-like quadratic curves. After
// the anchor, price drops into the cone's −2σ tail; entry is the BUY at
// that touch, target is a return to the cone's median.
//
// Same cone geometry as TailFadeDiagram so the whole Trade Setups
// category reads as one coherent visual story.

import React from "react";

export default function MeanReversionDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  // Cone anchored at (220, 110). Quadratic beziers approximate sqrt(t).
  const median  = "M 220 110 L 430 110";
  const sd1High = "M 220 110 Q 320 94  430 85";
  const sd1Low  = "M 220 110 Q 320 126 430 135";
  const sd2High = "M 220 110 Q 320 74  430 55";
  const sd2Low  = "M 220 110 Q 320 146 430 165";

  // Past price drifts mildly, ends exactly at the anchor.
  const history = "M 30,115 L 55,113 L 80,117 L 105,114 L 130,112 L 155,110 L 180,113 L 200,111 L 220,110";
  // After anchor: dives into −2σ tail around x≈320, then reverts up to
  // the cone's median by end of the horizon.
  const future  = "M 220,110 L 240,115 L 265,125 L 290,135 L 320,140 L 350,130 L 380,118 L 410,112 L 430,110";

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

      {/* Anchor marker */}
      <line x1="220" y1="5" x2="220" y2="215" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 2" opacity="0.8"/>
      <text x="220" y="16" fill="#22d3ee" fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        {L("ANCHOR · NOW", "الآن · ANCHOR")}
      </text>

      {/* History + future price */}
      <path d={history} fill="none" stroke="#8b96a3" strokeWidth="1.5"/>
      <path d={future}  fill="none" stroke="#e8ecf1" strokeWidth="1.8"/>
      <circle cx="220" cy="110" r="3" fill="#22d3ee"/>

      {/* BUY at −2σ touch */}
      <circle cx="320" cy="140" r="6" fill="#2ebd59"/>
      <line x1="320" y1="140" x2="320" y2="202" stroke="#2ebd59" strokeWidth="1"/>
      <text x="320" y="210" fill="#2ebd59" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        BUY · {L("ENTRY −2σ", "دخول عند −2σ")}
      </text>

      {/* TP at median */}
      <circle cx="380" cy="118" r="6" fill="#ff6d00"/>
      <line x1="380" y1="118" x2="380" y2="30" stroke="#ff6d00" strokeWidth="1"/>
      <text x="380" y="24" fill="#ff6d00" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        TP · {L("MEDIAN p50", "الوسط p50")}
      </text>

      {/* Cone labels on right edge */}
      <text x="435" y="58" fill="#e8383b" fontSize="9" fontFamily="monospace">+2σ</text>
      <text x="435" y="88" fill="#ff6d00" fontSize="9" fontFamily="monospace">+1σ</text>
      <text x="435" y="113" fill="#ffc107" fontSize="9" fontFamily="monospace">p50</text>
      <text x="435" y="138" fill="#ff6d00" fontSize="9" fontFamily="monospace">−1σ</text>
      <text x="435" y="168" fill="#e8383b" fontSize="9" fontFamily="monospace">−2σ</text>

      <text x="125" y="210" fill="#8b96a3" fontSize="9" fontFamily="monospace" textAnchor="middle" opacity="0.8">
        {L("HISTORY", "تاريخ")}
      </text>
    </svg>
  );
}
