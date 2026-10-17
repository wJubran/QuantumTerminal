// ConeModelsDiagram — side-by-side comparison of GBM vs MJD vs Bates
// forecast cones. Three mini cones in one SVG:
//   · GBM  — symmetric narrow fan, smooth paths, thin tails
//   · MJD  — GBM + visible jumps in some paths, wider tails (asymmetric)
//   · Bates — MJD + time-varying vol, widest overall, skew visible

import React, { useMemo } from "react";

const PANEL_W = 150;
const PANEL_H = 200;
const GAP = 5;

function MiniCone({ offsetX, title, variant, lang }) {
  const L = (en, ar) => (lang === "ar" ? ar : en);
  // anchor for this mini cone (local coords)
  const ax = 30;
  const ay = 110;
  const endX = offsetX + PANEL_W - 10;
  const ex = endX - offsetX; // local end x

  // Cone boundaries depend on variant:
  //   GBM: tighter, symmetric
  //   MJD: wider, slightly skewed
  //   Bates: widest, asymmetric (more upside risk)
  let sd2HighDy, sd2LowDy, sd1HighDy, sd1LowDy;
  if (variant === "gbm") {
    sd2HighDy = -50; sd2LowDy = 50; sd1HighDy = -25; sd1LowDy = 25;
  } else if (variant === "mjd") {
    sd2HighDy = -66; sd2LowDy = 70; sd1HighDy = -32; sd1LowDy = 34;
  } else {
    sd2HighDy = -75; sd2LowDy = 82; sd1HighDy = -36; sd1LowDy = 40;
  }

  const sd2H = `M ${ax} ${ay} Q ${(ax+ex)/2} ${ay + sd2HighDy*0.55} ${ex} ${ay + sd2HighDy}`;
  const sd2L = `M ${ax} ${ay} Q ${(ax+ex)/2} ${ay + sd2LowDy*0.55}  ${ex} ${ay + sd2LowDy}`;
  const sd1H = `M ${ax} ${ay} Q ${(ax+ex)/2} ${ay + sd1HighDy*0.55} ${ex} ${ay + sd1HighDy}`;
  const sd1L = `M ${ax} ${ay} Q ${(ax+ex)/2} ${ay + sd1LowDy*0.55}  ${ex} ${ay + sd1LowDy}`;
  const fill = `M ${ax} ${ay} Q ${(ax+ex)/2} ${ay + sd2HighDy*0.55} ${ex} ${ay + sd2HighDy} L ${ex} ${ay + sd2LowDy} Q ${(ax+ex)/2} ${ay + sd2LowDy*0.55} ${ax} ${ay} Z`;

  // Simulated paths specific to the variant
  const paths = useMemo(() => {
    let seed = variant === "gbm" ? 7 : variant === "mjd" ? 23 : 91;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const steps = 10;
    const stepW = (ex - ax) / steps;
    const pathCount = 7;
    const out = [];
    for (let i = 0; i < pathCount; i++) {
      let y = ay;
      let d = `M ${ax} ${ay}`;
      let volMult = variant === "gbm" ? 1.2 : variant === "mjd" ? 1.4 : 1.6;
      // Bates has episodic vol — randomize a "high-vol window" index
      const hvStart = 2 + Math.floor(rand() * 5);
      const hvEnd = hvStart + 2;
      for (let s = 1; s <= steps; s++) {
        const x = ax + s * stepW;
        let v = volMult * Math.sqrt(s);
        // MJD — occasional big jump
        if (variant === "mjd" && rand() < 0.08) {
          y += (rand() - 0.5) * v * 10;
        }
        // Bates — vol clustering
        if (variant === "bates" && s >= hvStart && s <= hvEnd) v *= 2.0;
        y += (rand() - 0.5) * v * 2;
        y = Math.max(22, Math.min(195, y));
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      out.push(d);
    }
    return out;
  }, [variant]);

  return (
    <g transform={`translate(${offsetX},0)`}>
      {/* Panel background */}
      <rect x="0" y="0" width={PANEL_W} height={PANEL_H} fill="#0a0a0a" stroke="#222"/>

      {/* Title */}
      <text x={PANEL_W/2} y="14" fill="#ffd89e" fontSize="10" fontFamily="monospace"
        textAnchor="middle" fontWeight="800" letterSpacing="1.5">
        {title}
      </text>

      {/* Cone fill */}
      <path d={fill} fill="#ff6d00" fillOpacity="0.07"/>

      {/* Paths */}
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none"
          stroke="#ffc107" strokeWidth="0.8" strokeOpacity="0.28"/>
      ))}

      {/* Cone boundary lines */}
      <path d={sd2H} fill="none" stroke="#e8383b" strokeOpacity="0.85" strokeWidth="1" strokeDasharray="3 2"/>
      <path d={sd2L} fill="none" stroke="#e8383b" strokeOpacity="0.85" strokeWidth="1" strokeDasharray="3 2"/>
      <path d={sd1H} fill="none" stroke="#ff6d00" strokeWidth="1" strokeDasharray="2 2"/>
      <path d={sd1L} fill="none" stroke="#ff6d00" strokeWidth="1" strokeDasharray="2 2"/>
      <path d={`M ${ax} ${ay} L ${ex} ${ay}`} fill="none" stroke="#ffc107" strokeWidth="1.2"/>

      {/* Anchor dot */}
      <circle cx={ax} cy={ay} r="2.5" fill="#22d3ee"/>

      {/* Variant caption */}
      <text x={PANEL_W/2} y={PANEL_H - 4} fill="#8b96a3" fontSize="8" fontFamily="monospace"
        textAnchor="middle" opacity="0.9">
        {variant === "gbm"
          ? L("normal returns · calm", "عوائد طبيعية · هادئ")
          : variant === "mjd"
            ? L("jumps · fat tails", "قفزات · fat tails")
            : L("vol clusters · skew", "vol clusters · انحياز")}
      </text>
    </g>
  );
}

export default function ConeModelsDiagram({ lang = "en" }) {
  return (
    <svg viewBox={`0 0 ${PANEL_W * 3 + GAP * 2} ${PANEL_H}`}
      style={{ width: "100%", height: "auto", display: "block" }}>
      <MiniCone offsetX={0}                 title="GBM"   variant="gbm"   lang={lang}/>
      <MiniCone offsetX={PANEL_W + GAP}     title="MJD"   variant="mjd"   lang={lang}/>
      <MiniCone offsetX={(PANEL_W + GAP)*2} title="BATES" variant="bates" lang={lang}/>
    </svg>
  );
}
