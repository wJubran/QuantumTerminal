// version: v1
// compute_agreement.js — pure function. Reads a 2.3 payload + derives
// the Cross-Signal Agreement matrix: which signals align with the prevailing
// composite direction, which dissent, which are neutral.
//
// PHASE 1: composite direction is the *sign of vanna_charm.combined_pressure*
// (the closest thing we have to a verdict before DC ships composite_verdict).
//   negative combined_pressure → BUY
//   positive                   → SELL
//   |combined_pressure| < 1    → FLAT (every signal lands as 'neutral')
//
// PHASE 2: once composite_verdict ships, swap the composite-direction
// detection to read composite_verdict.primary_direction directly.

const SIGNAL_ORDER = [
  "vanna_charm",
  "iv_skew",
  "iv_skew_0dte",
  "dealer_scenarios",
  "market_entropy",
  "retail_trap",
  "iv_divergence",
  "pc_ratio",
  "charm_0dte",
];

// Tri-state mapper: each signal returns +1 (bullish lean), -1 (bearish), or 0 (neutral).
const SIGNAL_DIRECTION = {
  vanna_charm: (p) => {
    const v = p.vanna_charm?.verdict;
    if (v === "STRONG_VANNA_BUY"  || v === "VANNA_BUY")  return +1;
    if (v === "STRONG_VANNA_SELL" || v === "VANNA_SELL") return -1;
    return 0;
  },
  iv_skew: (p) => {
    // skew = put_25d - call_25d. negative skew = calls richer = bullish tilt.
    const s = p.iv_skew?.skew;
    if (typeof s !== "number") return 0;
    if (s < -0.005) return +1;
    if (s >  0.020) return -1;
    return 0;
  },
  iv_skew_0dte: (p) => {
    const s = p.iv_skew_0dte?.skew;
    if (typeof s !== "number") return 0;
    if (s < -0.003) return +1;
    if (s >  0.010) return -1;
    return 0;
  },
  dealer_scenarios: (p) => {
    const sd = p.sauce?.dealer_scenarios?.spring_direction;
    if (sd === "UPSIDE")   return +1;
    if (sd === "DOWNSIDE") return -1;
    return 0;
  },
  market_entropy: () => 0, // entropy is non-directional (a confidence flag)
  retail_trap: (p) => {
    // Contrarian — TRAP_ACTIVE + CROWDED_LONG → bearish lean; CROWDED_SHORT → bullish.
    const rt = p.sauce?.retail_trap;
    if (!rt || rt.status !== "TRAP_ACTIVE") return 0;
    if (rt.retail_positioning === "CROWDED_LONG")  return -1;
    if (rt.retail_positioning === "CROWDED_SHORT") return +1;
    return 0;
  },
  iv_divergence: (p) => {
    const s = p.iv_divergence?.signal;
    if (s === "BREAKOUT_FAVORED" || s === "SLIGHTLY_CHEAP") return +1;
    if (s === "FADE_FAVORED"     || s === "SLIGHTLY_RICH" ) return -1;
    return 0;
  },
  pc_ratio: () => 0, // overhang / non-directional in the agreement read (cross-check vs retail_trap separately).
  charm_0dte: (p) => {
    const c = p.charm_0dte;
    if (!c) return 0;
    if (c.direction === "BUY")  return +1;
    if (c.direction === "SELL") return -1;
    return 0;
  },
};

export function computeAgreement(payload) {
  if (!payload || typeof payload !== "object") return null;

  const cp = payload.vanna_charm?.combined_pressure ?? 0;
  const composite =
    cp < -1 ? "BUY"  :
    cp >  1 ? "SELL" :
              "FLAT";
  const compositeSign = composite === "BUY" ? +1 : composite === "SELL" ? -1 : 0;

  const signals = SIGNAL_ORDER.map((name) => {
    const fn  = SIGNAL_DIRECTION[name];
    const dir = fn ? fn(payload) : 0;
    let state = "neutral";
    if (compositeSign !== 0 && dir !== 0) {
      state = dir === compositeSign ? "aligned" : "dissenting";
    }
    return { name, direction: dir, state };
  });

  const counts = signals.reduce(
    (acc, s) => { acc[s.state] = (acc[s.state] || 0) + 1; return acc; },
    {}
  );

  return {
    composite,
    aligned:     counts.aligned     || 0,
    dissenting:  counts.dissenting  || 0,
    neutral:     counts.neutral     || 0,
    signals,
  };
}
