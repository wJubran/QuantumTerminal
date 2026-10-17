// version: v2
// v2 — gridLines default flipped true → false (operator preference,
//      2026-05-15). Existing tickers with a saved `gridLines: true`
//      preference keep showing grid; this only affects fresh ticker
//      settings (where `partial.gridLines` is undefined and the
//      `?? d.gridLines` fallback in withDefaults() picks up the new
//      default).
// version: v1
// chartStyleDefaults.js — single source of truth for the chartStyle shape
// and its default values. Used by ChartSettingsModal, MainChart, and the
// preset save/load flow.

export const DEFAULT_CHART_STYLE = Object.freeze({
  chartType:    "candles",   // "candles" | "line" | "area" | "bars"
  background:   "#0a0a0a",
  bullishColor: "#2ebd59",
  bearishColor: "#e8383b",
  gridLines:    false,                            // v2: default OFF
  marketCloseSeparator: Object.freeze({
    show:  true,
    color: "#444444",
    style: "dashed",   // "solid" | "dashed" | "dotted"
    width: 1,
  }),
  rthSeparator: Object.freeze({
    show:  true,
    color: "#666666",
    style: "dashed",
    width: 1,
  }),
});

// Background presets shown as quick-select swatches in the modal.
export const BACKGROUND_PRESETS = [
  { name: "Default Dark", color: "#0a0a0a" },
  { name: "Pure Black",   color: "#000000" },
  { name: "Midnight Blue",color: "#0a1628" },
  { name: "Charcoal",     color: "#1a1a1a" },
  { name: "Forest",       color: "#0a1a14" },
  { name: "Burgundy",     color: "#1a0a0e" },
];

// Chart type options rendered as a segmented control.
export const CHART_TYPES = [
  { id: "candles", label: "Candles" },
  { id: "line",    label: "Line"    },
  { id: "area",    label: "Area"    },
  { id: "bars",    label: "Bars"    },
];

// Line-style options for separator overlays.
export const LINE_STYLES = [
  { id: "solid",  label: "Solid"  },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
];

// Width options 1..4 px.
export const LINE_WIDTHS = [1, 2, 3, 4];

/**
 * Merge a partial style fragment into the defaults so that consumers always
 * have every field present. Use when loading from disk / a preset / a legacy
 * tickerSettings snapshot.
 */
export function withDefaults(partial) {
  if (!partial || typeof partial !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_CHART_STYLE));
  }
  const d = DEFAULT_CHART_STYLE;
  return {
    chartType:    partial.chartType    ?? d.chartType,
    background:   partial.background   ?? d.background,
    bullishColor: partial.bullishColor ?? d.bullishColor,
    bearishColor: partial.bearishColor ?? d.bearishColor,
    gridLines:    partial.gridLines    ?? d.gridLines,
    marketCloseSeparator: { ...d.marketCloseSeparator, ...(partial.marketCloseSeparator || {}) },
    rthSeparator:         { ...d.rthSeparator,         ...(partial.rthSeparator         || {}) },
  };
}

/**
 * Validate a hex color string. Accepts 3- or 6-digit, optional leading #.
 * Returns a normalized "#RRGGBB" string or null if invalid.
 */
export function normalizeHex(input) {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return "#" + s.split("").map((c) => c + c).join("").toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return "#" + s.toLowerCase();
  }
  return null;
}
