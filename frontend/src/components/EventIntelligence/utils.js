// version: v2
// Pure helpers for the Event Intelligence redesign. No JSX, no state.
//
// v2 — eventDate now reads ev.time when an event object is passed in. The
//      upstream JSON ships per-event "time" strings ("6:00pm", "8:30 AM",
//      etc.) but v1 only took a date string and hardcoded T08:30 for the
//      time-of-day. That broke the "upcoming" filter in the afternoon —
//      today's 6 PM FOMC events were stamped at 8:30 AM and dropped as
//      already-past once the wall clock passed 8:30. Callers can still
//      pass a bare date string (heatmap cells, etc.) and we fall back to
//      the same 8:30 default.

const ASSUMED_TIME = "T08:30:00";

// Parse a "6:00pm" / "8:30 AM" / "14:30" / "9pm" string into a "Thh:mm:ss"
// suffix usable by `new Date(dateStr + suffix)`. Returns null if unparseable.
function parseTimeOfDay(t) {
  if (!t || typeof t !== "string") return null;
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] || "").toLowerCase();
  if (ampm === "pm" && hh < 12) hh += 12;
  if (ampm === "am" && hh === 12) hh = 0;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00`;
}

// Accept either a bare date string ("2026-04-29") or a full event object
// ({ date, time }). Object form uses the per-event time when present.
export function eventDate(evOrDateStr) {
  if (!evOrDateStr) return null;
  let dateStr, timeSuffix;
  if (typeof evOrDateStr === "object") {
    dateStr = evOrDateStr.date;
    timeSuffix = parseTimeOfDay(evOrDateStr.time);
  } else {
    dateStr = evOrDateStr;
  }
  if (!dateStr) return null;
  const d = new Date(dateStr + (timeSuffix || ASSUMED_TIME));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Countdown ────────────────────────────────────────────────────────────
// Returns { primary, sub, kind } where kind ∈ {"past","now","minutes","hours","days"}
// Primary is the headline ("02:14:33", "1d 04h", "JUST NOW", "5h ago").
// v2: accepts either a date string or a full event object so the per-event
// `time` is honored (matters for same-day countdowns, e.g. 6 PM FOMC).
export function countdown(evOrDateStr, now = new Date()) {
  const d = eventDate(evOrDateStr);
  if (!d) return { primary: "—", sub: "", kind: "past" };
  const diffSec = Math.round((d - now) / 1000);
  const past    = diffSec < 0;
  const abs     = Math.abs(diffSec);

  if (abs < 60 && !past) return { primary: "JUST NOW", sub: "", kind: "now" };
  if (past && abs < 60)  return { primary: "JUST NOW", sub: "", kind: "now" };

  if (past) {
    if (abs < 3600)   return { primary: `${Math.round(abs/60)}m ago`,  sub: "", kind: "past" };
    if (abs < 86400)  return { primary: `${Math.round(abs/3600)}h ago`, sub: "", kind: "past" };
    return { primary: `${Math.round(abs/86400)}d ago`, sub: "", kind: "past" };
  }

  // Future
  if (abs < 3600) {
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return { primary: `00:${pad(m)}:${pad(s)}`, sub: "", kind: "minutes" };
  }
  if (abs < 86400) {
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    return { primary: `${pad(h)}:${pad(m)}:${pad(s)}`, sub: "", kind: "hours" };
  }
  const d_  = Math.floor(abs / 86400);
  const h_  = Math.floor((abs % 86400) / 3600);
  return { primary: `${d_}d ${pad(h_)}h`, sub: "", kind: "days" };
}

function pad(n) { return String(n).padStart(2, "0"); }

// ── Date helpers ─────────────────────────────────────────────────────────
export function dayKey(d) {
  // YYYY-MM-DD in user's local timezone (what `date` strings look like).
  const yr = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  return `${yr}-${mo}-${da}`;
}

export function daysFromNow(n, base = new Date()) {
  const out = [];
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

export function isWeekend(d) {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function shortDayLabel(d) {
  const m = d.getMonth() + 1;
  const dy = d.getDate();
  return `${pad(m)}-${pad(dy)}`;
}

export function weekdayShort(d) {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

// ── Filter helpers ───────────────────────────────────────────────────────
export function withinRangeDays(evOrDateStr, days, base = new Date()) {
  const d = eventDate(evOrDateStr);
  if (!d) return false;
  const diffMs = d - base;
  // include past `days` AND future `days`
  return Math.abs(diffMs) <= days * 86400 * 1000;
}

export function passesFilters(ev, { currencies, impacts }) {
  if (currencies && currencies.size > 0) {
    if (!currencies.has((ev.currency || "").toUpperCase())) return false;
  }
  if (impacts && impacts.size > 0) {
    if (!impacts.has((ev.impact || "").toLowerCase())) return false;
  }
  return true;
}

// ── Surprise scoreboard stats ────────────────────────────────────────────
// Returns per-currency aggregates over a given recent_surprises slice.
//   { code, beats, total, avgPct, lean }
// `lean` is a qualitative read for the badge: "bullish" / "bearish" / "neutral" / "dovish-surprise"
export function scoreboardByCurrency(recentSurprises = [], days = 30, base = new Date()) {
  const cutoffMs = base.getTime() - days * 86400 * 1000;
  const acc = new Map();

  for (const ev of recentSurprises) {
    const d = eventDate(ev);
    if (!d || d.getTime() < cutoffMs) continue;
    const ccy = (ev.currency || "").toUpperCase();
    if (!ccy) continue;
    const sp = Number(ev.surprise_pct);
    if (!Number.isFinite(sp)) continue;
    if (!acc.has(ccy)) acc.set(ccy, { code: ccy, beats: 0, total: 0, sum: 0 });
    const a = acc.get(ccy);
    a.total += 1;
    a.sum   += sp;
    if (sp > 0) a.beats += 1;
  }

  const out = [];
  for (const [, a] of acc) {
    const avgPct = a.total > 0 ? a.sum / a.total : 0;
    let lean = "neutral";
    if (avgPct >= 8 && a.beats * 2 >= a.total) lean = "bullish";
    else if (avgPct <= -8 && (a.total - a.beats) * 2 >= a.total) lean = "bearish";
    else if (avgPct <= -15) lean = "dovish-surprise";
    out.push({ code: a.code, beats: a.beats, total: a.total, avgPct, lean });
  }
  // Sort: most prints first, then by absolute avg
  out.sort((x, y) => (y.total - x.total) || Math.abs(y.avgPct) - Math.abs(x.avgPct));
  return out;
}

// ── Per-event history ────────────────────────────────────────────────────
// Returns the last N prints of the same event (matched by lowercased name + currency).
// Used by the sparkline on each event card.
export function eventHistory(allRecent, eventName, currency, n = 6) {
  const key = String(eventName || "").toLowerCase();
  const ccy = (currency || "").toUpperCase();
  const out = [];
  for (const e of allRecent || []) {
    if ((e.currency || "").toUpperCase() !== ccy) continue;
    if (String(e.event || "").toLowerCase() !== key) continue;
    out.push(e);
  }
  // Sort ascending by date so the sparkline reads left→right oldest→newest.
  out.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  return out.slice(-n);
}

// ── Calendar heatmap data ────────────────────────────────────────────────
// Returns { rows: [{ code, byDay: { dayKey: { count, weight } } }], days: [Date] }
// `weight` is impact-weighted (high=3, medium=2, low=1) so the cell intensity
// grades up with severity, not just raw count.
export function heatmapData(upcoming = [], windowDays = 14, base = new Date()) {
  const days = daysFromNow(windowDays, base).filter(d => !isWeekend(d));
  const dayKeys = days.map(dayKey);
  const meta = ["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","CNY"];

  const rows = meta.map(code => ({ code, byDay: {} }));
  for (const dk of dayKeys) for (const r of rows) r.byDay[dk] = { count: 0, weight: 0 };

  const weight = (impact) => {
    const k = (impact || "").toLowerCase();
    if (k === "high") return 3;
    if (k === "medium") return 2;
    return 1;
  };

  for (const ev of upcoming) {
    const ccy = (ev.currency || "").toUpperCase();
    if (!ccy) continue;
    const r = rows.find(x => x.code === ccy);
    if (!r) continue;
    const dk = String(ev.date || "");
    if (!r.byDay[dk]) continue;  // outside window
    r.byDay[dk].count  += 1;
    r.byDay[dk].weight += weight(ev.impact);
  }

  return { days, rows };
}

// ── Surprise color ───────────────────────────────────────────────────────
export function surpriseColor(pct, palette) {
  if (!Number.isFinite(pct)) return palette.muted;
  if (pct >= 0) return palette.green;
  return palette.red;
}

export function impactColor(impact, palette) {
  const k = (impact || "").toLowerCase();
  if (k === "high")   return palette.red;
  if (k === "medium") return palette.amber;
  return palette.gray;
}
