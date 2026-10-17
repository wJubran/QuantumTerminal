// version: v2
// originColors.js — single source of truth for cone-origin and band colors,
// plus display labels for each origin.
//
// Aligned with the producer's canonical schema (NOW + current/prev/-2 week +
// current/prev/-2 month + extreme high/low + bands).

export const ORIGIN_COLORS = {
  now:            "#FFFFFF",
  current_week:   "#80B8E0",
  prev_week:      "#5C8CB0",
  week_prev_2:    "#3A6080",
  current_month:  "#80E0A0",
  prev_month:     "#5CA070",
  prev_month_2:   "#4A7E58",
  extreme_high:   "#FF80B0",
  extreme_low:    "#FFA060",
  bands:          "#E8B84B",
};

export const ORIGIN_LABELS = {
  now:            "now",
  current_week:   "current week",
  prev_week:      "previous week",
  week_prev_2:    "week -2",
  current_month:  "current month",
  prev_month:     "previous month",
  prev_month_2:   "month -2",
  extreme_high:   "extreme high",
  extreme_low:    "extreme low",
  bands:          "bands",
};

// CSS class name for the origin (used for the swatch styling lookup)
export const ORIGIN_CLASS = {
  now:            "originNow",
  current_week:   "originCurrentWeek",
  prev_week:      "originPrevWeek",
  week_prev_2:    "originWeekPrev2",
  current_month:  "originCurrentMonth",
  prev_month:     "originPrevMonth",
  prev_month_2:   "originPrevMonth2",
  extreme_high:   "originExtremeHigh",
  extreme_low:    "originExtremeLow",
  bands:          "originBands",
};

export function colorFor(origin) {
  return ORIGIN_COLORS[origin] || "#888888";
}

export function labelFor(origin) {
  return ORIGIN_LABELS[origin] || origin;
}
