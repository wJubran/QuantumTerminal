// version: v3
//
// Pure helpers for the chart's TimeframeDropdown.
// Side-effect free, no React imports, easy to unit-test with node --test.
//
// TF tokens match the codebase's existing MT5-style names — see
// `TIMEFRAMES` in chart_constants.js (M1, M5, M15, M30, H1, H4, D1).
//
// BARS_PER_SESSION[tf] is the bar count produced per ~24h trading session
// at that TF. The terminal serves forex / metals / indices / futures,
// which are 24h (or near-24h) markets — the count = days × bars/session
// translates "I want 25 sessions of M5" to the count parameter the bars
// endpoint wants. Used for:
//   (a) the soft 2000-bar warning in the dropdown,
//   (b) computing the `count` parameter passed to fetchBars.
//
// v3 — Constants recalibrated to 24h sessions after operator caught
//      that 25 days on M5 was loading only ~8 calendar days of data
//      (v2's 8h assumption underestimated by 3×).
// v2 — TF tokens realigned with the existing TIMEFRAMES constant after
//      a spec/codebase mismatch was caught during execution.
// v1 — initial version, used different TF tokens that didn't match
//      the codebase. Replaced.

export const BARS_PER_SESSION = Object.freeze({
  M1:  1440,   // 24h × 60 min
  M5:   288,   // 24h × 12
  M15:   96,   // 24h × 4
  M30:   48,   // 24h × 2
  H1:    24,
  H4:     6,
  D1:     1,
});

const LABEL_BY_TF = Object.freeze({
  M1:  "sessions",
  M5:  "sessions",
  M15: "sessions",
  M30: "sessions",
  H1:  "sessions",
  H4:  "sessions",
  D1:  "days",
});

export function estimateBarCount(days, tf) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const k = BARS_PER_SESSION[tf];
  if (!k) return 0;
  return Math.round(n * k);
}

export function daysInputLabel(tf) {
  return LABEL_BY_TF[tf] || "sessions";
}

export function defaultDaysPerTf() {
  return {
    M1:  2,
    M5:  5,
    M15: 7,
    M30: 10,
    H1:  30,
    H4:  60,
    D1:  200,
  };
}
