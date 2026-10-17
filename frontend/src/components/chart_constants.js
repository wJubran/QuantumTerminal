// version: v12
// v12 — DAILY cones (2026-05-12). DC now ships 3 anchored daily cones
//       (gbm/mjd/bates × curr/prev/prev_2). Replaced the old single-cone
//       NOW group with a 3-cone DAILY group, mirroring the existing
//       MONTHLY pattern: CONE_GROUPS/BATES_GROUPS now have `daily` (was
//       `now`); DEFAULT_SLOT_VIS has daily_curr/prev/prev_2; slotLabel
//       strips the daily_ prefix; DEFAULT_CONE_VIS gets 9 new styling
//       entries (green/orange/magenta × curr-solid-bright → prev-dashed-
//       mid → prev_2-sparse-dotted-dim). makeDefaultSettings cg.now →
//       cg.daily. The legacy gbm_now/mjd_now/bates_now keys remain in
//       DEFAULT_CONE_VIS as the getConeVis fallback palette — harmless.
//       Spec: docs/specs/2026-05-12-daily-cones-and-per-model-hide-design.md.
// v11 — TF_GROUPS export added for the new TimeframeDropdown component
//       (chart toolbar redesign, 2026-05-10). Three-row visual grouping:
//       minutes (M1/M5/M15/M30), hours (H1/H4), daily (D1). Sourced from
//       the existing TIMEFRAMES constant — does not change the canonical
//       TF list.
// v10 — MONTHLY cones group expanded to include "prev_2" (the projection
//       that started ~60 days ago, two anchors back) (2026-05-08). Cache
//       has shipped gbm_month_prev_2 / mjd_month_prev_2 for all real
//       tickers and bates_month_prev_2 for the subset where producer ran
//       it (~17 of 67). The slot system was already set up: DEFAULT_SLOT_VIS
//       had month_prev_2:true, slotLabel returned "PREV-2" — all that was
//       missing was wiring the keys into CONE_GROUPS / BATES_GROUPS and
//       adding DEFAULT_CONE_VIS styling entries (otherwise the new cones
//       would render with the gbm_now fallback palette). The MONTHLY
//       toolbar dropdown now shows three sub-toggles: CURR / PREV / PREV-2.
//       Bates equivalent under the BATES dropdown.
// v9 — Volume bar default flipped to OFF (2026-05-07). Operator decision:
//      cleaner first-load on a new ticker. Existing tickers' saved
//      indicator settings keep their explicit values (volume_bar:true is
//      preserved if the user previously had it on for that ticker).
/**
 * chart_constants.js — Shared constants, config, and utilities for the chart system.
 * Quantum Terminal
 *
 * v2 — interpolateOnGrid: future-zone densification step now matches the
 *      chart's candle timeframe (derived from the last two candleTimes)
 *      instead of a hardcoded 1-hour step. Fixes the "time warp" feel on
 *      H4 / D1 charts where future cone/band points were rendered at 1-bar
 *      per-hour spacing, stretching the future zone 4× (H4) or 24× (D1)
 *      relative to historical bars. Count capped at 800 future points as
 *      a safety against runaway densification on short TFs.
 *
 * Extracted from MainChart.jsx during Phase 3D modularization.
 * Consumed by: MainChart.jsx, ChartToolbar.jsx, SignalMarkersPrimitive.js
 */
import * as LWC from "lightweight-charts";

// ════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════
export const C = {
  bg: "#000", bgPanel: "#0a0a0a", bgCard: "#111", bgHover: "#1a1a1a",
  border: "#222", borderLt: "#333", white: "#fff", gray: "#999", muted: "#444",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", cyan: "#00d2d3", purple: "#9b59b6",
};
export const mono = "'Courier New', Consolas, monospace";

// ════════════════════════════════════════════════════════
// TIMEFRAME CONFIG
// ════════════════════════════════════════════════════════
// v3: M30 added.
export const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
// v4: default bar count is 1000 across all timeframes (was per-TF 120–500)
export const BAR_COUNTS = { M1: 1000, M5: 1000, M15: 1000, M30: 1000, H1: 1000, H4: 1000, D1: 1000 };
// v4: FIT button collapses the visible logical range to the last N bars
export const FIT_CANDLES = 600;
export const TF_SECONDS = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };

// ════════════════════════════════════════════════════════
// TF_GROUPS — visual row layout for the timeframe dropdown.
// Each row renders as a horizontal group of TF buttons. Order and
// grouping are UI-only; the canonical TF list stays `TIMEFRAMES`.
// ════════════════════════════════════════════════════════
export const TF_GROUPS = [
  { label: "minutes", keys: ["M1", "M5", "M15", "M30"] },
  { label: "hours",   keys: ["H1", "H4"] },
  { label: "daily",   keys: ["D1"] },
];

// ════════════════════════════════════════════════════════
// OVERLAY GROUP DEFINITIONS
// ════════════════════════════════════════════════════════
export const CONE_GROUPS = {
  daily:      { label: "DAILY",      keys: ["gbm_daily_curr", "mjd_daily_curr", "gbm_daily_prev", "mjd_daily_prev", "gbm_daily_prev_2", "mjd_daily_prev_2"], color: C.green },
  weekly:     { label: "WEEKLY",     keys: ["gbm_prev", "mjd_prev", "gbm_curr", "mjd_curr"],         color: C.blue },
  monthly:    { label: "MONTHLY",    keys: ["gbm_month_curr", "mjd_month_curr", "gbm_month_prev", "mjd_month_prev", "gbm_month_prev_2", "mjd_month_prev_2"], color: C.purple },
  ext_high:   { label: "EXT HIGH",   keys: ["gbm_extreme_high", "mjd_extreme_high"],                 color: C.red },
  ext_low:    { label: "EXT LOW",    keys: ["gbm_extreme_low", "mjd_extreme_low"],                   color: C.cyan },
  // v5: "MANUAL" is the quarterly-cones holder (temp wiring).
  //     Producer schema quarterly_cones_v2 = 4 anchors × 2 models = 8 keys.
  //     Slots (after coneKeyToSlot strips gbm_/mjd_) are:
  //       manual         → current quarter
  //       manual_p1/p2/p3 → prev 1 / 2 / 3 quarters
  //     Each slot has its own sub-toggle inside the CONES → MANUAL row.
  manual:     { label: "QUARTERLY", keys: ["gbm_manual", "mjd_manual", "gbm_manual_p1", "mjd_manual_p1", "gbm_manual_p2", "mjd_manual_p2", "gbm_manual_p3", "mjd_manual_p3"], color: "#ff00ff" },
};

export const ANCHOR_GROUPS = {
  weekly:   { label: "WEEKLY",   color: C.green },
  monthly:  { label: "MONTHLY",  color: C.purple },
  extremes: { label: "EXTREMES", color: C.red },
};

export const BATES_GROUPS = {
  daily:      { label: "DAILY",     keys: ["bates_daily_curr", "bates_daily_prev", "bates_daily_prev_2"], color: "#e056fd" },
  weekly:     { label: "WEEKLY",    keys: ["bates_prev", "bates_curr"],                           color: "#e056fd" },
  monthly:    { label: "MONTHLY",   keys: ["bates_month_curr", "bates_month_prev", "bates_month_prev_2"], color: "#e056fd" },
  ext_high:   { label: "EXT HIGH",  keys: ["bates_extreme_high"],                                 color: "#e056fd" },
  ext_low:    { label: "EXT LOW",   keys: ["bates_extreme_low"],                                  color: "#e056fd" },
};

export const GEX_GROUPS = {
  // v7: NOW + WEEKLY retired (producer never shipped the GEX-weighted cones
  // they pointed to). Replaced with FLIP and EXP MOVE — both carry 0DTE
  // and SWING sub-toggles rendered as sub-buttons under each group.
  flip:          { label: "FLIP",     keys: ["gex_flip_0dte", "gex_flip_swing"], color: "#ff6d00", kind: "level", source: "flip"          },
  expected_move: { label: "EXP MOVE", keys: ["gex_em_0dte",   "gex_em_swing"],   color: "#39ff14", kind: "level", source: "expected_move" },
  // v8: sauce groups now carry dual-horizon sub-toggles, mirroring FLIP/EM.
  // Keys drive the toolbar's sub-toggle rendering via groupSlots(). 0DTE
  // reads optionsD.sauce_0dte; SWING reads optionsD.sauce.
  magnets:       { label: "MAGNETS",    keys: ["gex_magnets_0dte", "gex_magnets_swing"],       color: "#00d4ff", kind: "level", source: "volatility_gravity",   filter: "magnet"     },
  springs:       { label: "SPRINGS",    keys: ["gex_springs_0dte", "gex_springs_swing"],       color: "#ff3d3d", kind: "level", source: "volatility_gravity",   filter: "spring"     },
  reinforced:    { label: "REINFORCED", keys: ["gex_reinforced_0dte", "gex_reinforced_swing"], color: "#2ebd59", kind: "level", source: "structural_integrity", filter: "reinforced" },
  thin_ice:      { label: "THIN ICE",   keys: ["gex_thin_ice_0dte", "gex_thin_ice_swing"],     color: "#e8383b", kind: "level", source: "structural_integrity", filter: "thin_ice"   },
};

// ════════════════════════════════════════════════════════
// CONE VISUAL STYLES (per cone key)
// ════════════════════════════════════════════════════════
export const DEFAULT_CONE_VIS = (() => {
  const LS = LWC.LineStyle || {};
  return {
    gbm_prev:         { med:"rgba(128,128,128,0.8)", sd1:"rgba(128,128,128,0.45)", sd2:"rgba(128,128,128,0.25)", d:LS.Dashed, w:2 },
    mjd_prev:         { med:"rgba(255,193,7,0.55)",  sd1:"rgba(255,193,7,0.35)",  sd2:"rgba(255,193,7,0.20)",  d:LS.LargeDashed, w:2 },
    gbm_curr:         { med:"rgba(52,152,219,0.9)",  sd1:"rgba(52,152,219,0.50)", sd2:"rgba(52,152,219,0.25)", d:LS.Solid, w:2 },
    mjd_curr:         { med:"rgba(255,193,7,0.65)",  sd1:"rgba(255,193,7,0.40)",  sd2:"rgba(255,193,7,0.22)",  d:LS.LargeDashed, w:2 },
    gbm_now:          { med:"rgba(39,174,96,1.0)",   sd1:"rgba(39,174,96,0.55)",  sd2:"rgba(39,174,96,0.30)",  d:LS.Solid, w:2 },
    mjd_now:          { med:"rgba(255,165,0,0.9)",   sd1:"rgba(255,165,0,0.50)",  sd2:"rgba(255,165,0,0.28)",  d:LS.LargeDashed, w:2 },
    gbm_extreme_high: { med:"rgba(231,76,60,0.9)",   sd1:"rgba(231,76,60,0.50)",  sd2:"rgba(231,76,60,0.25)",  d:LS.Solid, w:2 },
    mjd_extreme_high: { med:"rgba(255,193,7,0.7)",   sd1:"rgba(255,193,7,0.40)",  sd2:"rgba(255,193,7,0.22)",  d:LS.LargeDashed, w:2 },
    gbm_extreme_low:  { med:"rgba(46,204,113,0.9)",  sd1:"rgba(46,204,113,0.50)", sd2:"rgba(46,204,113,0.25)", d:LS.Solid, w:2 },
    mjd_extreme_low:  { med:"rgba(255,193,7,0.7)",   sd1:"rgba(255,193,7,0.40)",  sd2:"rgba(255,193,7,0.22)",  d:LS.LargeDashed, w:2 },
    gbm_month_prev:   { med:"rgba(155,89,182,0.7)",  sd1:"rgba(155,89,182,0.40)", sd2:"rgba(155,89,182,0.20)", sd3:"rgba(155,89,182,0.12)", d:LS.Dashed, w:2 },
    mjd_month_prev:   { med:"rgba(255,193,7,0.5)",   sd1:"rgba(255,193,7,0.30)",  sd2:"rgba(255,193,7,0.15)",  sd3:"rgba(255,193,7,0.08)",  d:LS.LargeDashed, w:2 },
    gbm_month_curr:   { med:"rgba(155,89,182,0.9)",  sd1:"rgba(155,89,182,0.50)", sd2:"rgba(155,89,182,0.25)", sd3:"rgba(155,89,182,0.15)", d:LS.Solid, w:2 },
    mjd_month_curr:   { med:"rgba(255,193,7,0.65)",  sd1:"rgba(255,193,7,0.40)",  sd2:"rgba(255,193,7,0.22)",  sd3:"rgba(255,193,7,0.12)",  d:LS.LargeDashed, w:2 },
    // v10: month_prev_2 — two anchors back. Dimmer + more dotted than
    //      month_prev, so the visual hierarchy reads curr (solid bright) →
    //      prev (dashed mid) → prev_2 (sparse-dotted dim).
    gbm_month_prev_2: { med:"rgba(155,89,182,0.45)", sd1:"rgba(155,89,182,0.25)", sd2:"rgba(155,89,182,0.13)", sd3:"rgba(155,89,182,0.07)", d:LS.SparseDotted, w:2 },
    mjd_month_prev_2: { med:"rgba(255,193,7,0.35)",  sd1:"rgba(255,193,7,0.20)",  sd2:"rgba(255,193,7,0.10)",  sd3:"rgba(255,193,7,0.05)",  d:LS.SparseDotted, w:2 },
    // v12: daily cones (3 anchors — curr / prev / prev_2). Green family for
    //      GBM (matches the old NOW colour), orange family for MJD. Visual
    //      hierarchy mirrors monthly: curr solid bright → prev dashed mid →
    //      prev_2 sparse-dotted dim.
    gbm_daily_curr:   { med:"rgba(39,174,96,1.0)",   sd1:"rgba(39,174,96,0.55)",  sd2:"rgba(39,174,96,0.30)",  sd3:"rgba(39,174,96,0.18)",  d:LS.Solid,        w:2 },
    gbm_daily_prev:   { med:"rgba(39,174,96,0.7)",   sd1:"rgba(39,174,96,0.40)",  sd2:"rgba(39,174,96,0.20)",  sd3:"rgba(39,174,96,0.12)",  d:LS.Dashed,       w:2 },
    gbm_daily_prev_2: { med:"rgba(39,174,96,0.45)",  sd1:"rgba(39,174,96,0.25)",  sd2:"rgba(39,174,96,0.13)",  sd3:"rgba(39,174,96,0.07)",  d:LS.SparseDotted, w:2 },
    mjd_daily_curr:   { med:"rgba(255,165,0,0.9)",   sd1:"rgba(255,165,0,0.50)",  sd2:"rgba(255,165,0,0.28)",  sd3:"rgba(255,165,0,0.16)",  d:LS.LargeDashed,  w:2 },
    mjd_daily_prev:   { med:"rgba(255,165,0,0.65)",  sd1:"rgba(255,165,0,0.35)",  sd2:"rgba(255,165,0,0.18)",  sd3:"rgba(255,165,0,0.10)",  d:LS.LargeDashed,  w:2 },
    mjd_daily_prev_2: { med:"rgba(255,165,0,0.40)",  sd1:"rgba(255,165,0,0.22)",  sd2:"rgba(255,165,0,0.12)",  sd3:"rgba(255,165,0,0.06)",  d:LS.SparseDotted, w:2 },
    // Bates (magenta/pink — distinctive from GBM+MJD)
    bates_now:           { med:"rgba(224,86,253,0.9)",  sd1:"rgba(224,86,253,0.50)", sd2:"rgba(224,86,253,0.25)", d:LS.Solid, w:2 },
    bates_prev:          { med:"rgba(224,86,253,0.6)",  sd1:"rgba(224,86,253,0.35)", sd2:"rgba(224,86,253,0.18)", d:LS.Dashed, w:2 },
    bates_curr:          { med:"rgba(224,86,253,0.8)",  sd1:"rgba(224,86,253,0.45)", sd2:"rgba(224,86,253,0.22)", d:LS.Solid, w:2 },
    bates_month_prev:    { med:"rgba(224,86,253,0.5)",  sd1:"rgba(224,86,253,0.30)", sd2:"rgba(224,86,253,0.15)", sd3:"rgba(224,86,253,0.08)", d:LS.Dashed, w:2 },
    bates_month_curr:    { med:"rgba(224,86,253,0.7)",  sd1:"rgba(224,86,253,0.40)", sd2:"rgba(224,86,253,0.20)", sd3:"rgba(224,86,253,0.12)", d:LS.Solid, w:2 },
    // v10: bates two months back. Producer ships this for ~25% of tickers;
    //      missing data renders silently empty.
    bates_month_prev_2:  { med:"rgba(224,86,253,0.32)", sd1:"rgba(224,86,253,0.18)", sd2:"rgba(224,86,253,0.10)", sd3:"rgba(224,86,253,0.05)", d:LS.SparseDotted, w:2 },
    // v12: bates daily cones — magenta family with the same curr → prev → prev_2 hierarchy.
    bates_daily_curr:   { med:"rgba(224,86,253,0.85)", sd1:"rgba(224,86,253,0.48)", sd2:"rgba(224,86,253,0.24)", sd3:"rgba(224,86,253,0.13)", d:LS.Solid,        w:2 },
    bates_daily_prev:   { med:"rgba(224,86,253,0.55)", sd1:"rgba(224,86,253,0.32)", sd2:"rgba(224,86,253,0.16)", sd3:"rgba(224,86,253,0.09)", d:LS.Dashed,       w:2 },
    bates_daily_prev_2: { med:"rgba(224,86,253,0.36)", sd1:"rgba(224,86,253,0.20)", sd2:"rgba(224,86,253,0.10)", sd3:"rgba(224,86,253,0.05)", d:LS.SparseDotted, w:2 },
    bates_extreme_high:  { med:"rgba(224,86,253,0.8)",  sd1:"rgba(224,86,253,0.45)", sd2:"rgba(224,86,253,0.22)", d:LS.Solid, w:2 },
    bates_extreme_low:   { med:"rgba(224,86,253,0.8)",  sd1:"rgba(224,86,253,0.45)", sd2:"rgba(224,86,253,0.22)", d:LS.Solid, w:2 },
    // Manual cones (magenta/hot pink — user-placed, distinctive)
    // v5: quarterly cones — 4 anchors (curr + 3 prev), 2 models (gbm, mjd).
    //     Solid for curr, progressively dashed + dimmer for older anchors so
    //     each of the 4 quarters is visually distinguishable when all on.
    gbm_manual:          { med:"rgba(255,0,255,1.0)",   sd1:"rgba(255,0,255,0.55)", sd2:"rgba(255,0,255,0.35)", sd3:"rgba(255,0,255,0.20)", d:LS.Solid,        w:2 },
    mjd_manual:          { med:"rgba(255,140,0,0.9)",   sd1:"rgba(255,140,0,0.50)", sd2:"rgba(255,140,0,0.35)", sd3:"rgba(255,140,0,0.20)", d:LS.LargeDashed,  w:2 },
    gbm_manual_p1:       { med:"rgba(255,0,255,0.70)",  sd1:"rgba(255,0,255,0.38)", sd2:"rgba(255,0,255,0.22)", sd3:"rgba(255,0,255,0.12)", d:LS.Dashed,       w:2 },
    mjd_manual_p1:       { med:"rgba(255,140,0,0.60)",  sd1:"rgba(255,140,0,0.34)", sd2:"rgba(255,140,0,0.22)", sd3:"rgba(255,140,0,0.12)", d:LS.LargeDashed,  w:2 },
    gbm_manual_p2:       { med:"rgba(255,0,255,0.45)",  sd1:"rgba(255,0,255,0.24)", sd2:"rgba(255,0,255,0.14)", sd3:"rgba(255,0,255,0.08)", d:LS.SparseDotted, w:2 },
    mjd_manual_p2:       { med:"rgba(255,140,0,0.40)",  sd1:"rgba(255,140,0,0.22)", sd2:"rgba(255,140,0,0.14)", sd3:"rgba(255,140,0,0.08)", d:LS.SparseDotted, w:2 },
    gbm_manual_p3:       { med:"rgba(255,0,255,0.28)",  sd1:"rgba(255,0,255,0.15)", sd2:"rgba(255,0,255,0.09)", sd3:"rgba(255,0,255,0.05)", d:LS.Dotted,       w:2 },
    mjd_manual_p3:       { med:"rgba(255,140,0,0.26)",  sd1:"rgba(255,140,0,0.14)", sd2:"rgba(255,140,0,0.09)", sd3:"rgba(255,140,0,0.05)", d:LS.Dotted,       w:2 },
    // GEX (neon lime — distinctive from GBM green, MJD amber, Bates magenta)
    gex_now:             { med:"rgba(57,255,20,0.95)",  sd1:"rgba(57,255,20,0.50)", sd2:"rgba(57,255,20,0.25)", sd3:"rgba(57,255,20,0.12)", d:LS.Solid,       w:2 },
    gex_weekly_1:        { med:"rgba(57,255,20,0.65)",  sd1:"rgba(57,255,20,0.38)", sd2:"rgba(57,255,20,0.18)", sd3:"rgba(57,255,20,0.08)", d:LS.LargeDashed, w:2 },
    gex_weekly_2:        { med:"rgba(57,255,20,0.45)",  sd1:"rgba(57,255,20,0.28)", sd2:"rgba(57,255,20,0.12)", sd3:"rgba(57,255,20,0.06)", d:LS.Dashed,      w:1 },
  };
})();

export function getConeVis(key, overrides) {
  const base = DEFAULT_CONE_VIS[key] || DEFAULT_CONE_VIS.gbm_now;
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export function anchorVis(key) {
  const LS = LWC.LineStyle || {};
  const m = {
    vwap_weekly:  { color:C.green,  style:LS.LargeDashed, title:"VWAP W" },
    vwap_monthly: { color:C.purple, style:LS.LargeDashed, title:"VWAP M" },
    high_weekly:  { color:C.red,    style:LS.Dashed,      title:"HIGH W" },
    low_weekly:   { color:C.cyan,   style:LS.Dashed,      title:"LOW W" },
    high_monthly: { color:C.red,    style:LS.Dotted,      title:"HIGH M" },
    low_monthly:  { color:C.cyan,   style:LS.Dotted,      title:"LOW M" },
    ext_high_7d:  { color:C.red,    style:LS.SparseDotted, title:"EXT HI 7D" },
    ext_low_7d:   { color:C.cyan,   style:LS.SparseDotted, title:"EXT LO 7D" },
    ext_high_30d: { color:C.red,    style:LS.SparseDotted, title:"EXT HI 30D" },
    ext_low_30d:  { color:C.cyan,   style:LS.SparseDotted, title:"EXT LO 30D" },
  };
  return m[key] || { color:C.gray, style:LS.Dashed, title:key };
}

// ════════════════════════════════════════════════════════
// SIGNAL CONSTANTS
// ════════════════════════════════════════════════════════
export const SIGNAL_COLORS = {
  cone_boundary_fade:   { color: "#2ebd59", abbr: "FADE" },
  cone_breakout:        { color: "#e8383b", abbr: "BKOUT" },
  cone_convergence:     { color: "#00d2d3", abbr: "CONV" },
  drift_momentum:       { color: "#ff6d00", abbr: "DRIFT" },
  institutional_anchor: { color: "#9b59b6", abbr: "ANCHR" },
  regime_transition:    { color: "#f1c40f", abbr: "REGM" },
};
export const STATE_OPACITY = {
  pending: 0.5, active: 1.0,
  hit_target: 0.3, hit_stop: 0.3, expired: 0.2, regime_shift: 0.25, cancelled: 0.15,
};
export const CLOSED_SIGNAL_STATES = new Set(["hit_target", "hit_stop", "expired", "regime_shift", "cancelled"]);

// ════════════════════════════════════════════════════════
// DEFAULT INDICATORS + CALC PARAMS
// ════════════════════════════════════════════════════════
export const DEFAULT_INDICATORS = {
  volume_bar: false,  // v9: off by default for new tickers
  daily_vp: false,
  rsi: false,
  atr: false,
  ema_bands: false,
  vwap: false,
  show_positions: true,   // v6: default ON so open positions are visible on every new chart
  show_trade_history: false,
};

export const DEFAULT_CALC_PARAMS = {
  sims: 100000,
  resolution: 6,
  horizon: 7,
  extreme_lookback: 45,
  weekly_count: 2,
  monthly_count: 3,
  bands_lookback: 60,
  bands_select: 1.0,
  bands_step: 1.0,
};

export const CALC_PARAM_DEFS = [
  { key: "sims", label: "MC SIMULATIONS", min: 1000, max: 500000, step: 1000, type: "int", desc: "Paths per cone" },
  { key: "resolution", label: "STEPS/DAY", min: 1, max: 24, step: 1, type: "int", desc: "MC time steps per day" },
  { key: "horizon", label: "FORECAST DAYS", min: 1, max: 30, step: 1, type: "int", desc: "Cone projection horizon" },
  { key: "extreme_lookback", label: "EXTREME LOOKBACK", min: 7, max: 120, step: 1, type: "int", desc: "N-day high/low window" },
  { key: "weekly_count", label: "WEEKLY CONES", min: 1, max: 6, step: 1, type: "int", desc: "Weeks of cones to generate" },
  { key: "monthly_count", label: "MONTHLY CONES", min: 1, max: 6, step: 1, type: "int", desc: "Months of cones to generate" },
  { key: "bands_lookback", label: "BANDS LOOKBACK", min: 10, max: 180, step: 5, type: "int", desc: "Rolling lookback for bands" },
  { key: "bands_select", label: "BANDS SELECT PT", min: 0.25, max: 5.0, step: 0.25, type: "float", desc: "Select point in days" },
  { key: "bands_step", label: "BANDS STEP", min: 0.25, max: 5.0, step: 0.25, type: "float", desc: "Step between anchors" },
];

export const CALC_MODULES = [
  { key: "anchors",  label: "ANCHORS",  desc: "Weekly/monthly VWAP, H/L levels", color: C.green },
  { key: "extremes", label: "EXTREMES", desc: "N-day lookback high/low", color: C.red },
  { key: "bands",    label: "BANDS",    desc: "Rolling MC probability bands", color: C.orange },
  { key: "cones",    label: "CONES",    desc: "All GBM + MJD + Bates cones", color: C.cyan },
  { key: "gex", label: "GEX CONES", desc: "GEX-weighted dealer gamma cones (options)", color: "#39ff14" },
];

// ════════════════════════════════════════════════════════
// DEFAULT PER-TICKER SETTINGS
// ════════════════════════════════════════════════════════
// Default band style per model — used when no user override is set
export const DEFAULT_BAND_STYLES = {
  gbm:   { color: "#ff6d00", width: 1, op1: 0.75, op2: 0.40, op3: 0.18, visible: true },
  mjd:   { color: "#ffc107", width: 1, op1: 0.65, op2: 0.32, op3: 0.15, visible: true },
  bates: { color: "#e056fd", width: 1, op1: 0.65, op2: 0.32, op3: 0.15, visible: true },
  mean:  { color: "#ff0000" },
};

// Default per-slot visibility — keys are slot names (cone key with model
// prefix stripped). Any slot not present here is treated as visible (true).
// Listed slots default to true; user toggles flip them to false.
export const DEFAULT_SLOT_VIS = {
  // single-slot groups (no sub-toggle UI, but kept for completeness)
  now: true,
  manual: true,
  // v5: quarterly sub-slots (prev 1/2/3 quarters) — default ON but user can
  //     toggle each individually via the MANUAL row sub-buttons.
  manual_p1: true, manual_p2: true, manual_p3: true,
  extreme_high: true,
  extreme_low: true,
  // weekly slots (current + back-history)
  curr: true, prev: true, prev_2: true, prev_3: true, prev_4: true, prev_5: true,
  // daily slots (v12)
  daily_curr: true, daily_prev: true, daily_prev_2: true,
  // monthly slots
  month_curr: true, month_prev: true, month_prev_2: true, month_prev_3: true,
  month_prev_4: true, month_prev_5: true,
  // gex weekly slots (retired; kept for back-compat if an old saved state
  // still ships them)
  weekly_1: true, weekly_2: true, weekly_3: true,
  // v7: GEX flip + expected-move horizon slots (0DTE vs SWING)
  flip_0dte: true,  flip_swing: true,
  em_0dte:   true,  em_swing:   true,
  // v8: sauce horizon slots — magnet / spring / reinforced / thin_ice each
  //     get 0DTE + SWING sub-toggles, mirroring the EM/FLIP pattern.
  //     Runtime `optionsD.sauce_0dte` (null when today ∉ chain) feeds the
  //     0DTE layer; existing `optionsD.sauce` feeds SWING.
  magnets_0dte:    true, magnets_swing:    true,
  springs_0dte:    true, springs_swing:    true,
  reinforced_0dte: true, reinforced_swing: true,
  thin_ice_0dte:   true, thin_ice_swing:   true,
};

export function makeDefaultSettings() {
  // v6: lean default — bands / cones / gex / anchors all OFF on a brand-new
  //     chart so the initial paint stays fast. Users opt into overlays via
  //     the toolbar dropdowns; their choices persist per-ticker.
  return {
    layers: { bands: false, signals: true },
    cg: { daily: false, weekly: false, monthly: false, ext_high: false, ext_low: false, manual: false },
    gg: { now: false, weekly: false, magnets: false, springs: false, reinforced: false, thin_ice: false },
    ag: { weekly: false, monthly: false, extremes: false },
    slotVis: { ...DEFAULT_SLOT_VIS },
    indicators: { ...DEFAULT_INDICATORS },
    coneStyles: {},
    bandStyles: {},   // overrides over DEFAULT_BAND_STYLES per model key
    tf: "M15",
  };
}

// ════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════
export const API = "";

export async function api(path, m) {
  try {
    const r = await fetch(`${API}${path}`, m === "POST" ? { method: "POST" } : {});
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export function toUTC(s) {
  if (!s) return 0;
  try {
    if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
      return Math.floor(new Date(s).getTime() / 1000);
    }
    return Math.floor(new Date(s.replace(" ", "T") + "Z").getTime() / 1000);
  } catch { return 0; }
}

export function mkLine(chart, color, w, style) {
  return chart.addSeries(LWC.LineSeries, {
    color, lineWidth: w,
    lineStyle: style || (LWC.LineStyle || {}).Solid,
    crosshairMarkerVisible: false, lastValueVisible: false,
    priceLineVisible: false, autoscaleInfoProvider: () => null,
  });
}

// ════════════════════════════════════════════════════════
// SLOT HELPERS — per-time-slot show/hide for cone groups
// ════════════════════════════════════════════════════════
/**
 * Strip model prefix from a cone key to get its time slot.
 *   "gbm_curr"           -> "curr"
 *   "mjd_month_prev_2"   -> "month_prev_2"
 *   "bates_now"          -> "now"
 *   "gex_weekly_1"       -> "weekly_1"
 */
export function coneKeyToSlot(key) {
  return key.replace(/^(gbm|mjd|bates|gex)_/, "");
}

/**
 * Return ordered list of unique slot names for a group definition
 * (an entry from CONE_GROUPS / BATES_GROUPS / GEX_GROUPS).
 * Used by the toolbar to render sub-toggles.
 */
export function groupSlots(groupDef) {
  if (!groupDef || !Array.isArray(groupDef.keys)) return [];
  const seen = new Set();
  const out = [];
  for (const k of groupDef.keys) {
    const s = coneKeyToSlot(k);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/**
 * Human label for a slot in toolbar sub-toggles.
 *   "curr"          -> "CURR"
 *   "prev"          -> "PREV"
 *   "prev_2"        -> "PREV-2"
 *   "month_curr"    -> "CURR"     (parent label already says MONTHLY)
 *   "month_prev_2"  -> "PREV-2"
 *   "weekly_1"      -> "W1"
 *   "extreme_high"  -> "HIGH"
 */
export function slotLabel(slot) {
  // v5: quarterly sub-slots → short readable tags
  if (slot === "manual")    return "Q-CURR";
  if (slot === "manual_p1") return "Q-1";
  if (slot === "manual_p2") return "Q-2";
  if (slot === "manual_p3") return "Q-3";
  // v7: GEX flip + EM horizon tags
  if (slot === "flip_0dte" || slot === "em_0dte")   return "0DTE";
  if (slot === "flip_swing" || slot === "em_swing") return "SWING";
  // v8: sauce-level horizon tags (magnets / springs / reinforced / thin_ice)
  if (slot === "magnets_0dte"   || slot === "springs_0dte"  ||
      slot === "reinforced_0dte"|| slot === "thin_ice_0dte")  return "0DTE";
  if (slot === "magnets_swing"  || slot === "springs_swing" ||
      slot === "reinforced_swing"|| slot === "thin_ice_swing") return "SWING";
  let s = slot;
  if (s.startsWith("month_")) s = s.slice(6);
  if (s.startsWith("daily_")) s = s.slice(6);
  if (s.startsWith("weekly_")) return "W" + s.slice(7);
  if (s.startsWith("extreme_")) s = s.slice(8);
  return s.replace(/_/g, "-").toUpperCase();
}

/**
 * Interpolate sparse overlay data onto the chart's actual candle timestamps.
 * Only generates points at times where candles exist — impossible to create gaps.
 * Uses linear interpolation between the original sparse points.
 */
export function interpolateOnGrid(points, candleTimes) {
  if (!points || points.length < 2 || !candleTimes || candleTimes.length === 0) return points || [];

  const result = [];
  let pi = 0;

  for (const ct of candleTimes) {
    while (pi < points.length - 2 && points[pi + 1].time <= ct) pi++;
    const p0 = points[pi], p1 = points[pi + 1] || points[pi];
    if (ct < points[0].time || ct > points[points.length - 1].time) continue;
    if (p0.time === p1.time) {
      result.push({ time: ct, value: p0.value });
    } else {
      const t = (ct - p0.time) / (p1.time - p0.time);
      result.push({ time: ct, value: p0.value + (p1.value - p0.value) * Math.max(0, Math.min(1, t)) });
    }
  }

  // Forward zone: densify sparse future points by interpolating onto the
  // chart's current bar cadence. v2: step is derived from the last two
  // candleTimes (historical TF) instead of a fixed 1-hour value — keeps
  // future-zone visual density identical to history on H4/D1/etc.
  const lastCandleTime = candleTimes[candleTimes.length - 1] || 0;
  const futurePoints = points.filter(p => p.time > lastCandleTime);
  if (futurePoints.length >= 2) {
    // Step = historical candle spacing (fallback to 1h if we can't derive it).
    const step = (candleTimes.length >= 2)
      ? Math.max(60, candleTimes[candleTimes.length - 1] - candleTimes[candleTimes.length - 2])
      : 3600;
    const start = futurePoints[0].time;
    const end   = futurePoints[futurePoints.length - 1].time;
    // Safety cap: avoid runaway densification on very short TFs with long horizons.
    const MAX_FUTURE_POINTS = 800;
    const maxEnd = start + MAX_FUTURE_POINTS * step;
    const effectiveEnd = Math.min(end, maxEnd);
    let t = start;
    let fi = 0;
    while (t <= effectiveEnd) {
      // Advance segment pointer
      while (fi < futurePoints.length - 2 && futurePoints[fi + 1].time <= t) fi++;
      const p0 = futurePoints[fi];
      const p1 = futurePoints[fi + 1] || futurePoints[fi];
      if (p0.time === p1.time) {
        result.push({ time: t, value: p0.value });
      } else {
        const frac = Math.max(0, Math.min(1, (t - p0.time) / (p1.time - p0.time)));
        result.push({ time: t, value: p0.value + (p1.value - p0.value) * frac });
      }
      t += step;
    }
  } else if (futurePoints.length === 1) {
    result.push(futurePoints[0]);
  }

  // Deduplicate and sort
  const seen = new Set();
  return result.filter(p => { if (seen.has(p.time)) return false; seen.add(p.time); return true; }).sort((a, b) => a.time - b.time);
}
/**
 * Apply a Gaussian-weighted moving average to an interpolated band series.
 * Called client-side after interpolateOnGrid to guarantee smooth curves
 * regardless of the source data density (daily anchors on intraday charts).
 *
 * window=7 is enough to smooth daily→H1 transitions; increase for M15/M5.
 */
export function smoothBandData(points, window = 7) {
  if (!points || points.length < 3) return points || [];
  const half = Math.floor(window / 2);
  // Pre-compute Gaussian weights (sigma = half / 2)
  const sigma = half / 2 || 1;
  const weights = [];
  for (let i = -half; i <= half; i++) {
    weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  }
  const wSum = weights.reduce((a, b) => a + b, 0);

  return points.map((p, i) => {
    let val = 0;
    for (let j = -half; j <= half; j++) {
      const idx = Math.max(0, Math.min(points.length - 1, i + j));
      val += points[idx].value * weights[j + half];
    }
    return { time: p.time, value: val / wSum };
  });
}
