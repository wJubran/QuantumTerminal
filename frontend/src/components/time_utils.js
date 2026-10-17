/**
 * time_utils.js — Time & Session Utilities
 * Quantum Terminal | Phase 4D
 *
 * Pure JS — no React dependency.
 * Provides timezone conversion, trading session definitions,
 * and session status detection.
 */

// ════════════════════════════════════════════════════════
// TIMEZONE PRESETS
// ════════════════════════════════════════════════════════
export const TIMEZONE_PRESETS = {
  local:  { label: "LOCAL",  offset: null },       // null = use browser local
  ny:     { label: "NY",  iana: "America/New_York" },
  london: { label: "LONDON",    iana: "Europe/London" },
  tokyo:  { label: "TOKYO",     iana: "Asia/Tokyo" },
  sydney: { label: "SYDNEY",    iana: "Australia/Sydney" },
  dubai:  { label: "DUBAI",     iana: "Asia/Dubai" },
  hk:     { label: "HONG KONG", iana: "Asia/Hong_Kong" },
  manual: { label: "MANUAL",    offset: 0 },       // user sets GMT offset
};

export const TZ_OPTIONS = Object.entries(TIMEZONE_PRESETS).map(([key, val]) => ({
  key,
  label: val.label,
}));

// ════════════════════════════════════════════════════════
// TIME CONVERSION
// ════════════════════════════════════════════════════════

/**
 * Get current time in a given timezone.
 * @param {string} tzKey — key from TIMEZONE_PRESETS
 * @param {number} [manualOffset] — GMT offset in hours (only for "manual")
 * @returns {{ hours: number, minutes: number, seconds: number, dateStr: string, timeStr: string }}
 */
export function getTimeInZone(tzKey, manualOffset = 0) {
  const now = new Date();
  const preset = TIMEZONE_PRESETS[tzKey];

  if (!preset) return formatDate(now);

  // Local — just use browser time
  if (tzKey === "local" || preset.offset === null) {
    return formatDate(now);
  }

  // Manual GMT offset
  if (tzKey === "manual") {
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const adjusted = new Date(utcMs + manualOffset * 3600000);
    return formatDate(adjusted);
  }

  // IANA timezone
  if (preset.iana) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: preset.iana,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).formatToParts(now);

      const get = (type) => parseInt(parts.find(p => p.type === type)?.value || "0");
      const hours = get("hour"), minutes = get("minute"), seconds = get("second");

      const dateParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: preset.iana,
        day: "2-digit", month: "short", year: "numeric",
      }).format(now).toUpperCase();

      return {
        hours, minutes, seconds,
        timeStr: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
        dateStr: dateParts,
      };
    } catch {
      return formatDate(now);
    }
  }

  return formatDate(now);
}

function formatDate(d) {
  return {
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
    timeStr: d.toLocaleTimeString("en-GB", { hour12: false }),
    dateStr: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
  };
}

// ════════════════════════════════════════════════════════
// TRADING SESSIONS
// ════════════════════════════════════════════════════════

/**
 * Session definitions per market center.
 * Times in local hours for that market.
 * Sessions ordered chronologically.
 */
const SESSION_DEFS = {
  ny: [
    { name: "PRE-MARKET",   start: 4,    end: 9.5,  color: "#ffa500" },
    { name: "AM SESSION",   start: 9.5,  end: 12,   color: "#2ebd59" },
    { name: "LUNCH",        start: 12,   end: 13,   color: "#888888" },
    { name: "PM SESSION",   start: 13,   end: 16,   color: "#2ebd59" },
    { name: "AFTER HOURS",  start: 16,   end: 20,   color: "#ffa500" },
    { name: "NIGHT",        start: 20,   end: 4,    color: "#444444" },
  ],
  london: [
    { name: "PRE-MARKET",   start: 7,    end: 8,    color: "#ffa500" },
    { name: "AM SESSION",   start: 8,    end: 12,   color: "#2ebd59" },
    { name: "LUNCH",        start: 12,   end: 13.5, color: "#888888" },
    { name: "PM SESSION",   start: 13.5, end: 16.5, color: "#2ebd59" },
    { name: "AFTER HOURS",  start: 16.5, end: 19,   color: "#ffa500" },
    { name: "NIGHT",        start: 19,   end: 7,    color: "#444444" },
  ],
  tokyo: [
    { name: "PRE-MARKET",   start: 8,    end: 9,    color: "#ffa500" },
    { name: "AM SESSION",   start: 9,    end: 11.5, color: "#2ebd59" },
    { name: "LUNCH",        start: 11.5, end: 12.5, color: "#888888" },
    { name: "PM SESSION",   start: 12.5, end: 15,   color: "#2ebd59" },
    { name: "AFTER HOURS",  start: 15,   end: 17,   color: "#ffa500" },
    { name: "NIGHT",        start: 17,   end: 8,    color: "#444444" },
  ],
  sydney: [
    { name: "PRE-MARKET",   start: 7,    end: 10,   color: "#ffa500" },
    { name: "AM SESSION",   start: 10,   end: 12,   color: "#2ebd59" },
    { name: "LUNCH",        start: 12,   end: 14,   color: "#888888" },
    { name: "PM SESSION",   start: 14,   end: 16,   color: "#2ebd59" },
    { name: "NIGHT",        start: 16,   end: 7,    color: "#444444" },
  ],
};

/**
 * Get the current session status for a given market center.
 * @param {string} center — "ny" | "london" | "tokyo" | "sydney"
 * @returns {{ name: string, color: string, inSession: boolean }}
 */
export function getSessionStatus(center) {
  const defs = SESSION_DEFS[center];
  if (!defs) return { name: "CLOSED", color: "#444444", inSession: false };

  const time = getTimeInZone(center);
  const h = time.hours + time.minutes / 60;

  for (const session of defs) {
    if (session.start < session.end) {
      // Normal range (e.g. 9 → 16)
      if (h >= session.start && h < session.end) {
        const inSession = session.name !== "NIGHT" && session.name !== "LUNCH";
        return { name: session.name, color: session.color, inSession };
      }
    } else {
      // Overnight range (e.g. 20 → 4)
      if (h >= session.start || h < session.end) {
        return { name: session.name, color: session.color, inSession: false };
      }
    }
  }

  return { name: "CLOSED", color: "#444444", inSession: false };
}

// ════════════════════════════════════════════════════════
// DEFAULT TIME CONFIG
// ════════════════════════════════════════════════════════
export const DEFAULT_TIME_CONFIG = {
  mainTime: "local",         // timezone key for header clock
  mainTimeOffset: 0,         // GMT offset if mainTime === "manual"
  worldClocks: [
    { city: "ny",     enabled: true },
    { city: "london", enabled: true },
    { city: "tokyo",  enabled: true },
    { city: "sydney", enabled: false },
  ],
  showWorldClock: true,      // master toggle
};