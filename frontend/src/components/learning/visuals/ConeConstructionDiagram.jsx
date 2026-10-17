// ConeConstructionDiagram — visualizes how a forecast cone is built from
// Monte Carlo paths. We render ~14 individual simulated price walks fanning
// forward from the anchor. The sd1 / sd2 lines drawn on top emerge as the
// percentile envelopes of those walks.

import React, { useMemo } from "react";

export default function ConeConstructionDiagram({ lang = "en" }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);

  const paths = useMemo(() => {
    // Seeded PRNG so the render is deterministic (stable across tabs).
    let seed = 42;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const anchorX = 220, anchorY = 110;
    const endX = 430;
    const steps = 14;
    const stepW = (endX - anchorX) / steps;

    const out = [];
    for (let i = 0; i < 14; i++) {
      let y = anchorY;
      let d = `M ${anchorX} ${anchorY}`;
      for (let s = 1; s <= steps; s++) {
        const x = anchorX + s * stepW;
        const vol = 1.9 * Math.sqrt(s);       // sqrt(t) spread
        y += (rand() - 0.5) * vol * 2;
        // clamp so paths stay inside the canvas
        y = Math.max(25, Math.min(195, y));
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      out.push(d);
    }
    return out;
  }, []);

  // Reference cone that the paths statistically produce.
  const median  = "M 220 110 L 430 110";
  const sd1High = "M 220 110 Q 320 94  430 85";
  const sd1Low  = "M 220 110 Q 320 126 430 135";
  const sd2High = "M 220 110 Q 320 74  430 55";
  const sd2Low  = "M 220 110 Q 320 146 430 165";

  // Small calm history ending at the anchor.
  const history = "M 30,115 L 55,113 L 80,117 L 105,114 L 130,112 L 155,110 L 180,113 L 200,111 L 220,110";

  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width="460" height="220" fill="#0a0a0a"/>

      {/* Cone fill (the envelope the paths form) */}
      <path d="M 220 110 Q 320 74 430 55 L 430 165 Q 320 146 220 110 Z"
        fill="#ff6d00" fillOpacity="0.06"/>

      {/* Individual Monte Carlo paths — translucent */}
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none"
          stroke="#ffc107" strokeWidth="1" strokeOpacity="0.28"/>
      ))}

      {/* Cone lines overlaid */}
      <path d={sd2High} fill="none" stroke="#e8383b" strokeOpacity="0.9" strokeWidth="1.2" strokeDasharray="4 3"/>
      <path d={sd2Low}  fill="none" stroke="#e8383b" strokeOpacity="0.9" strokeWidth="1.2" strokeDasharray="4 3"/>
      <path d={sd1High} fill="none" stroke="#ff6d00" strokeWidth="1.2" strokeDasharray="2 3"/>
      <path d={sd1Low}  fill="none" stroke="#ff6d00" strokeWidth="1.2" strokeDasharray="2 3"/>
      <path d={median}  fill="none" stroke="#ffc107" strokeWidth="1.6"/>

      {/* Anchor */}
      <line x1="220" y1="5" x2="220" y2="215" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 2" opacity="0.8"/>
      <text x="220" y="16" fill="#22d3ee" fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="700">
        {L("ANCHOR · NOW", "الآن · ANCHOR")}
      </text>

      {/* History */}
      <path d={history} fill="none" stroke="#8b96a3" strokeWidth="1.5"/>
      <circle cx="220" cy="110" r="3" fill="#22d3ee"/>

      {/* Labels */}
      <text x="435" y="58" fill="#e8383b" fontSize="9" fontFamily="monospace">p95</text>
      <text x="435" y="88" fill="#ff6d00" fontSize="9" fontFamily="monospace">p75</text>
      <text x="435" y="113" fill="#ffc107" fontSize="9" fontFamily="monospace">p50</text>
      <text x="435" y="138" fill="#ff6d00" fontSize="9" fontFamily="monospace">p25</text>
      <text x="435" y="168" fill="#e8383b" fontSize="9" fontFamily="monospace">p05</text>

      <text x="325" y="210" fill="#ffc107" fontSize="9" fontFamily="monospace" textAnchor="middle" opacity="0.9">
        {L("~14 MONTE CARLO PATHS → PERCENTILE CONE", "≈14 Monte Carlo paths → cone الاحتمالات")}
      </text>
    </svg>
  );
}
