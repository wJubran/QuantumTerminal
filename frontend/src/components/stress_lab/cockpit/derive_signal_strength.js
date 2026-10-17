// version: v2
// v2: corrected misleading "+50 offset" comment — formula is |sum|*2 clipped to [0,100] (issue 3).
// version: v1
// derive_signal_strength.js — pure function. Phase-1 hand-rule that turns
// a {TICKER}_options.json (format_version 2.3) payload into a 0..100
// "setup strength" score for the universe-scan strip ranking.
//
// REPLACED IN PHASE 2: once DC ships composite_verdict.universe_rank,
// the strip reads that directly and this helper is deleted (or kept as
// a fallback when DC's field is missing — TBD).
//
// Components of the score (each scaled to ~[-20, +20] and summed; the
// final score is |sum| * 2, clipped to [0, 100]; sum === 0 → 0):
//   1. Vanna verdict + sign of combined_pressure (the closest thing to
//      a directional verdict we have without composite_verdict shipped).
//   2. Entropy ORDERED bonus (small, asymmetric — ORDERED is rare and
//      good; MODERATE/CHAOTIC contribute 0).
//   3. Retail-trap penalty when TRAP_ACTIVE OPPOSES the vanna direction
//      (vanna says BUY but crowd is long → contrarian fade signal that
//      dampens the strength score). When TRAP_ACTIVE ALIGNS (vanna SELL
//      + crowd long), it actually reinforces — no penalty.
//   4. IV signal alignment with the vanna direction (small).
//
// All weights are deliberate guesses for Phase 1 — easy to tune.

const VANNA_STRENGTH = {
  STRONG_VANNA_BUY:  +20,
  VANNA_BUY:         +10,
  VANNA_BALANCED:      0,
  VANNA_SELL:        -10,
  STRONG_VANNA_SELL: -20,
};

// returns ±1 (vanna direction) given the verdict string.
function vannaSign(verdict) {
  if (verdict === "STRONG_VANNA_BUY"  || verdict === "VANNA_BUY")  return +1;
  if (verdict === "STRONG_VANNA_SELL" || verdict === "VANNA_SELL") return -1;
  return 0;
}

export function deriveSignalStrength(payload) {
  if (!payload || typeof payload !== "object") return null;

  const vc  = payload.vanna_charm   || {};
  const ent = payload.sauce?.market_entropy?.state;
  const rt  = payload.sauce?.retail_trap || {};
  const ivs = payload.iv_divergence?.signal;

  // 1. Vanna verdict component, ±20.
  const v = VANNA_STRENGTH[vc.verdict] ?? 0;

  // 2. Entropy bonus — ORDERED is the rare, interesting state.
  const e = ent === "ORDERED" ? +6 : 0;

  // 3. Retail-trap penalty when TRAP opposes the vanna direction.
  //    Vanna BUY (vannaSign>0) + crowd CROWDED_LONG = fade-the-rally setup → penalty.
  //    Vanna SELL + crowd CROWDED_SHORT = squeeze-risk-up → penalty.
  let r = 0;
  if (rt.status === "TRAP_ACTIVE") {
    const vSign = vannaSign(vc.verdict);
    const longCrowd  = rt.retail_positioning === "CROWDED_LONG";
    const shortCrowd = rt.retail_positioning === "CROWDED_SHORT";
    if (vSign > 0 && longCrowd)  r = -8;
    if (vSign < 0 && shortCrowd) r = -8;
    // When TRAP_ACTIVE aligns with the vanna direction, no penalty.
  }

  // 4. IV signal alignment (small).
  //    BREAKOUT_FAVORED + vanna BUY → +3; FADE_FAVORED + vanna SELL → +3.
  let iv = 0;
  const vSign = vannaSign(vc.verdict);
  if (vSign > 0 && (ivs === "BREAKOUT_FAVORED" || ivs === "SLIGHTLY_CHEAP")) iv = +3;
  if (vSign < 0 && (ivs === "FADE_FAVORED"     || ivs === "SLIGHTLY_RICH" )) iv = +3;

  // Combine. The neutral case (sum === 0) shortcircuits to 0; otherwise
  // the score is |sum| * 2, clipped to [0, 100]. So a single +20 vanna
  // verdict alone scores 40; STRONG_VANNA_BUY + ORDERED + breakout-aligned
  // IV (sum=29) scores 58; max possible bullish-or-bearish stack maxes at 100.
  const sum = v + e + r + iv;
  if (sum === 0) return 0;
  return Math.max(0, Math.min(100, Math.abs(sum) * 2));
}
