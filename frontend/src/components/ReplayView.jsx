// version: v31
//
// v29 — Wrap renderer in 3-state machine: "empty" / "loading" / "running".
//       Empty state: single Configuration button (resume-last subtitle if
//       localStorage["mk_replay_config"] exists). Apply opens existing
//       renderer (no build-gating yet — that lands in v30). Adds a
//       Configuration button top-right of running state to reopen popup.
//       New deps: ReplayConfigPopup, replay/replayConfigStore.
//
// v30 — appliedConfig becomes source of truth: ticker/tf/period/visibility
//       state vars seed from appliedConfig on Apply via a new useEffect.
//       Cone-builder loop (~line 985) short-circuits per family when
//       appliedConfig.layers.{weekly,monthly,quarterly} is false. Quarterly
//       per-Q gating respects appliedConfig.layers.quarterly.{q_curr,
//       q_prev1..q_prev7} — anchors not picked are skipped before any
//       per-model build work happens (the heaviness fix).
//
// v31 — Final redesign step (with v29/v30):
//       (a) Regime layer master + 3 stackable sub-modes (top_bar, bg_shading,
//           candle_color). top_bar gates the RegimeBar mount; bg_shading
//           gates the macro/micro histogram series build; candle_color is
//           NEW — paints each candle's color by the regime classification
//           of its bar.
//       (b) Bands layer build-gated — series only built when on.
//       (c) Old toolbar (lines ~1605-1687) replaced by <ReplayInlineStrip>.
//       (d) Loading bar (mode === "loading") with phase labels:
//           "Loading bars…" → "Loading cones…" → "Loading regime…" →
//           "Loading bands…" → "Building chart…" → "Done.".
//       (e) Re-Apply from running state = bump chartKey + setMode("loading")
//           + re-enter load orchestrator. The chartKey prop on the chart
//           container forces full LWC remount on every Apply.
//
/**
 * ReplayView.jsx — Historical cone replay (REPLAY sub-tab of QUANT ANALYSIS)
 * Quantum Terminal | Display-Only (Rule C1)
 *
 * v28 — Regime bar + background shading on the replay chart. Reuses the
 *       RegimeBar component (v3) at the top of the view. Payload flows into
 *       local state and drives two HistogramSeries (macro below, micro above)
 *       painting the full-height background at each bar's regime color.
 *       Unlike MainChart v55, there is no "live bar" fallback — replay's
 *       playhead isn't "today", so strictly use history.slow_d1 and skip
 *       bars with no matching history entry (expected past the 60-day micro
 *       cap; macro's 365-day tail covers most replay windows).
 *
 * v27 — Bars fetch routed through utils/barsCache.js (session-only in-memory
 *       cache keyed by ticker+tf). First load per (ticker, tf) still hits
 *       the network; every subsequent switch in the session is instant.
 *       Kills the "TF-switch wait" that grew painful as the universe did.
 *
 * v26 — Three targeted fixes for the EURUSD cone-not-rendering investigation:
 *       (a) Date-collision orphan: coneSeriesMapRef keyed by `${bucket}:${dateStr}`
 *           so weekly/monthly/quarterly anchors sharing a date stop overwriting
 *           one another (40-anchor data was leaking 6 entries silently).
 *       (b) defaultIdx: when the earliest anchor predates bars[0] (common
 *           with 8-quarterly + long timeframes), fall back to earliest-in-range
 *           instead of getting stuck at bars[0].
 *       (c) On-chart debug overlay (top-left) surfacing live state —
 *           playTime, counter, mapEntries, seriesVisible, model/bucket/quarter
 *           toggles, top-3 shown anchors. Screenshot-friendly replacement for
 *           the v22 console logs. TEMPORARY — remove once resolved.
 *
 * v25 — TICKER selector becomes a searchable combobox (custom popover with
 *       autofocused search input + substring filter + scrollable list).
 *       Replaces the native <select> which got unwieldy as the universe
 *       grew. Esc / click-outside closes; Enter commits first match.
 *
 * v24 — QUARTERLY toolbar control gains a ⚙ popover with 8 individual
 *       per-quarter checkboxes (Q-CURR + Q-1..Q-7). The QUARTERLY button
 *       remains the master on/off; the popover refines which of the 8
 *       quarters are shown when the master is on. Plumbed via a new
 *       _quarterlyLabels map on anchorsObj and a quarterLabel field on
 *       each cone-series-map entry.
 *
 * v23 — Quarterly cones extended from 4 → 8 anchors (curr + prev1..prev7).
 *       The producer JSON now ships all 8; MainChart's mapper still only
 *       reads curr..prev3, so the extras stay replay-only by design.
 *
 * v22 — TEMPORARY DIAGNOSTICS for the EURUSD-not-rendering bug. Unsilences
 *       the empty catch blocks in the cone-builder + visibility effect so
 *       thrown errors surface to the console; adds post-loop receipts for
 *       (a) how many anchors / slot series the builder produced per bucket
 *       and (b) how many anchors the visibility effect flipped visible.
 *       REMOVE ONCE RESOLVED (roll back to v21 behavior minus the fix).
 *
 * v14 — Defaults reshuffled. Periods: 12M / 6M / 3M (was 0.5y/1y/1.5y/2y);
 *       default 3M. Timeframes: M5 added, M15 is default (was D1).
 *
 * v13 — gear icon now opens a small popover (color picker + width slider +
 *       opacity slider) instead of chained window.prompt() dialogs. Added
 *       MAX CONES numeric input — caps the number of simultaneously-visible
 *       cones to the N most-recent triggered anchors so the chart doesn't
 *       get crowded (default 8; 0 = unlimited).
 *
 * v12 — architecture change. v1..v11 torn down and rebuilt every cone line
 *       series on every playback tick (visibleAnchors memo recomputed per
 *       tick → cones effect re-fired → ~20-400 removeSeries+addSeries calls
 *       per tick → constant chart reflow). v12 pre-builds every cone line
 *       series ONCE per ticker/period load with visible:false, then toggles
 *       visibility via applyOptions on playback/filter changes. No more
 *       add/remove churn. Also removed fixLeftEdge/fixRightEdge (they were
 *       making the chart drag-locked), kept pre-seeded timeAxis so LWC has
 *       no reason to extend the time scale.
 *
 * v11 — root cause was price auto-scale, not time. When cone line series
 *       were added, their sd3_high / sd3_low values (often 5-10% away from
 *       spot) got pulled into the right price-scale's auto-fit calc,
 *       squeezing candles into a thin visual band → looks like the chart
 *       is "jumping out of scope." Fix: set autoscaleInfoProvider → null
 *       on every cone line series. LWC then excludes them from price
 *       auto-scale; the scale fits only the candles, cones overlay cleanly.
 *
 * v10 — lock LWC's time scale hard. Even with the v9 pre-seeded time axis,
 *       addSeries with line data could still nudge the visible range on
 *       some assets. Added timeScale options: fixLeftEdge, fixRightEdge,
 *       lockVisibleTimeRangeOnResize — tells LWC "the axis ends are pinned,
 *       don't move them." Also added double-click handler on the chart
 *       container → re-centers on the current playback bar and refits the
 *       price scale (matches the behavior of most trading charts).
 *
 * v9 — chart now truly stays put. v8 froze the candle time axis but cone
 *      line series kept extending it past the last bar, so LWC re-fit on
 *      every anchor toggle. Fix: at data load, collect every cone forecast
 *      timestamp across all anchors/models, merge with bar times, and seed
 *      the candle series with whitespace for all future points. The time
 *      axis is then wide enough to cover everything any cone could add → no
 *      auto-fit trigger ever.
 *
 * v8 — root-cause fix for chart snapping on every time change.
 *      Stopped trimming the bar array. The candle series is now loaded
 *      ONCE with the full time span; advancing playback just flips
 *      future bars into whitespace (`{ time }` with no OHLC). Time scale
 *      never changes → LWC has no trigger to auto-fit. Save/restore and
 *      the subscribe-based userViewRef were removed; they were fighting
 *      LWC's auto-fit instead of preventing it. Now the chart only moves
 *      when the user drags/scrolls it, period.
 *
 * v7 — fixes:
 *      - User view now rock-solid during playback. subscribe() to LWC's
 *        visible-time-range change → store user-driven views in userViewRef.
 *        After every setData / addSeries burst, re-apply userViewRef. Also
 *        re-apply on a short rAF after the effect so LWC's internal auto-fit
 *        can't beat our restore.
 *      - Slider sensitivity reduced via new ± step buttons (±1 bar each)
 *        and scroll-wheel support over the slider (wheel up = +1 bar,
 *        wheel down = -1 bar). Drag the slider for coarse scrubbing; use
 *        ± or wheel for single-bar stepping.
 *
 * v6 — fixes:
 *      - Chart still moved right when scrubbing backward. Logical-range
 *        save/restore is invalid when the bar array shrinks (logical index
 *        N means a different time when data has fewer bars). Switched to
 *        TIME-range save/restore (getVisibleRange / setVisibleRange) which
 *        is data-length agnostic.
 *      - Monthly toggle sometimes left 1-2 recent cones on screen. Added
 *        a parallel Set of every series ref we add; teardown iterates both
 *        the keyed dict and the untracked Set so no series can orphan.
 *
 * v5 — fixes:
 *      - Weekly cones were silently dropping out because the producer writes
 *        forecast dates as "YYYY-MM-DD HH:MM" (space, no Z) while anchor
 *        keys are "YYYY-MM-DD". toUTCSec treated the former as local time
 *        and the latter as UTC, so anchor ts and forecast ts lived in
 *        different epochs — the visible-anchor filter still matched but
 *        the line series got rendered at the wrong x positions. Rewrote
 *        toUTCSec to normalize every known producer format to UTC seconds.
 *      - Clicking any model/anchor/TF/period button no longer jumps the
 *        chart right. The cones effect now saves/restores the visible
 *        range around its addSeries/setData burst, matching the candle
 *        effect's v4 save-restore.
 *
 * v4 — fixes:
 *      - Reverted v3's t ≤ playTime clip. Weekly cones weren't rendering
 *        because at the exact anchor time only 1 point survived the clip
 *        and line series need ≥2 points. Triggered cones now show the full
 *        forward forecast (anchor → anchor + N forecast points) — the
 *        "effectiveness test" visual the operator wanted.
 *      - Slider/playback no longer jumps the chart right. Save visible
 *        logical range before every setData, restore after — matches the
 *        MainChart v9 pattern. Prevents LWC from auto-adjusting when the
 *        sliced bar array changes its last-bar index.
 *
 * v3 — fixes:
 *      - Zoom/scroll preserved during playback. Only center the view on
 *        ticker/period/TF change, not on every playIdx tick.
 *      - Cone series key now includes the slot name (median, sd1_high, …)
 *        so each of the 7 polylines per model has a unique entry in the
 *        refs map. Previously sd1_high and sd1_low both used the same
 *        color-derived key, collided, and only one got removed on teardown
 *        → upper devs piled up as series.
 *      - Cone polylines clipped to points with timestamp ≤ playTime so the
 *        cone appears progressively (anchor date → current playback) rather
 *        than showing the full 55-day forecast the moment the anchor fires.
 *        (reverted in v4)
 *      - Weekly / Monthly anchor-type toggles added (both on by default).
 *
 * v2 — UX fixes:
 *      - Default playIdx lands just before the earliest anchor so user sees
 *        an empty chart on load and immediately gets cones when pressing
 *        play (previously defaulted to bar 0 with no anchors visible).
 *      - Visible logical range recenters on playIdx after every candle
 *        update (40 bars back + 40 forward), so current candle sits in the
 *        middle instead of slammed to the right edge.
 *
 * Flow:
 *   1. User picks ticker + period (0.5y/1y/1.5y/2y) + timeframe (D1/H4/H1/M15).
 *   2. Bars + historical cones load in parallel; replay scrubber sits at bar 0.
 *   3. As playback time advances past each weekly/monthly anchor, the anchor's
 *      cone polylines (median + sd1/2/3 for each enabled model) appear.
 *   4. Scrubbing backward unwinds anchors.
 *
 * Models: GBM + MJD on by default, BATES optional. Per-model on/off +
 * gear for color/width/opacity (simple prompt-based for v1, can upgrade to a
 * popover editor later).
 *
 * This component performs ZERO calculations. All rendering is of pre-computed
 * data fetched from /api/historical_cones/{ticker} and /api/bars/{ticker}.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as LWC from "lightweight-charts";
import { fetchBarsCached } from "../utils/barsCache";   // v27
import RegimeBar from "./RegimeBar";                     // v28
import ReplayConfigPopup from "./ReplayConfigPopup";
import { loadStoredConfig, validateAgainstAssets } from "./replay/replayConfigStore";
import ReplayInlineStrip from "./ReplayInlineStrip";
import ReplayLoadingBar  from "./ReplayLoadingBar";

const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";
const C = {
  bg: "#000000", bgPanel: "#0a0a0a", bgCard: "#111111", bgHover: "#1a1a1a",
  border: "#222222", borderLt: "#333333",
  white: "#ffffff", gray: "#999999", muted: "#444444",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", amber: "#ffa500", cyan: "#00d2d3", purple: "#8b5cf6",
};

// v14: 3M / 6M / 12M; 3M default.
// v16: 18M added for longer historical replay windows.
const PERIODS = [
  { label: "3M",  days: 91  },
  { label: "6M",  days: 182 },
  { label: "12M", days: 365 },
  { label: "18M", days: 548 },
];

// v16: D1 removed — cones step at 2h cadence and collapsed to daily
//      resolution produced a visually staircased cone and left the
//      candle axis unnecessarily sparse. H1 is now the coarsest TF.
const TIMEFRAMES = [
  { label: "H4",  code: "H4",  barsPerDay: 6    },
  { label: "H1",  code: "H1",  barsPerDay: 24   },
  { label: "M15", code: "M15", barsPerDay: 96   },
  { label: "M5",  code: "M5",  barsPerDay: 288  },
];

const SPEEDS = [1, 2, 5, 10, 20];

const MODEL_DEFAULTS = {
  gbm:   { on: true,  color: "#3796ff", width: 1.5, opacity: 0.9, label: "GBM" },
  mjd:   { on: true,  color: "#ffa500", width: 1.5, opacity: 0.9, label: "MJD" },
  bates: { on: false, color: "#8b5cf6", width: 1.5, opacity: 0.9, label: "BATES" },
};

// ── Utilities ─────────────────────────────────────────────────────────────

async function apiFetch(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Parse any producer-format date string → UTC unix seconds. LWC expects seconds.
// Handles:
//   "YYYY-MM-DD"                  → UTC midnight of that day
//   "YYYY-MM-DD HH:MM"            → UTC (producer writes forecast dates this way)
//   "YYYY-MM-DD HH:MM:SS"         → UTC
//   "YYYY-MM-DDTHH:MM(:SS)"       → UTC (assume, since no tz given)
//   "YYYY-MM-DDTHH:MM:SSZ"        → UTC (native)
//   "YYYY-MM-DDTHH:MM:SS±HH:MM"   → specified tz (native)
function toUTCSec(dateStr) {
  if (!dateStr) return 0;
  let s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2} /.test(s))            s = s.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))            s += "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))             s += ":00Z";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s))       s += "Z";
  const t = Date.parse(s);
  return isFinite(t) ? Math.floor(t / 1000) : 0;
}

function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Gear popover (v13) ────────────────────────────────────────────────────
function ModelGearPopover({ model, modelKey, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const row = { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 };
  const lbl = { fontSize: 8, color: "#999", letterSpacing: "1px", minWidth: 48 };
  const inp = {
    background: "#111", border: "1px solid #222", color: "#fff",
    padding: "2px 4px", fontSize: 10, fontFamily: mono,
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
        background: "#0a0a0a", border: `1px solid #333`, padding: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)", minWidth: 180,
        fontFamily: mono,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 9, color: model.color, fontWeight: 800, letterSpacing: "1.5px", marginBottom: 8 }}>
        {model.label} SETTINGS
      </div>
      <div style={row}>
        <span style={lbl}>COLOR</span>
        <input type="color" value={model.color}
          onChange={e => onChange({ color: e.target.value })}
          style={{ ...inp, width: 32, padding: 0, height: 18 }}
        />
        <input type="text" value={model.color}
          onChange={e => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange({ color: v });
            else onChange({ color: v });  // accept intermediate typing
          }}
          style={{ ...inp, width: 72 }}
        />
      </div>
      <div style={row}>
        <span style={lbl}>WIDTH</span>
        <input type="range" min={0.5} max={4} step={0.25}
          value={model.width}
          onChange={e => onChange({ width: Number(e.target.value) })}
          style={{ flex: 1, accentColor: model.color }}
        />
        <span style={{ fontSize: 10, color: "#fff", minWidth: 28, textAlign: "right" }}>
          {Number(model.width).toFixed(2)}
        </span>
      </div>
      <div style={row}>
        <span style={lbl}>OPACITY</span>
        <input type="range" min={0.1} max={1} step={0.05}
          value={model.opacity}
          onChange={e => onChange({ opacity: Number(e.target.value) })}
          style={{ flex: 1, accentColor: model.color }}
        />
        <span style={{ fontSize: 10, color: "#fff", minWidth: 28, textAlign: "right" }}>
          {Number(model.opacity).toFixed(2)}
        </span>
      </div>
      <button
        onClick={onClose}
        style={{
          width: "100%", marginTop: 4, background: "transparent",
          border: "1px solid #333", color: "#999",
          padding: "4px 8px", cursor: "pointer",
          fontSize: 9, fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
        }}
      >CLOSE</button>
    </div>
  );
}

// ── Quarterly visibility popover (v24) ────────────────────────────────────
function QuarterlyVisibilityPopover({ visible, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const rows = [
    { key: "curr",  label: "Q-CURR" },
    { key: "prev1", label: "Q-1" },
    { key: "prev2", label: "Q-2" },
    { key: "prev3", label: "Q-3" },
    { key: "prev4", label: "Q-4" },
    { key: "prev5", label: "Q-5" },
    { key: "prev6", label: "Q-6" },
    { key: "prev7", label: "Q-7" },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
        background: "#0a0a0a", border: "1px solid #333", padding: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)", minWidth: 140,
        fontFamily: mono,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 9, color: "#00d2d3", fontWeight: 800, letterSpacing: "1.5px", marginBottom: 8 }}>
        QUARTERLY VISIBILITY
      </div>
      {rows.map(r => {
        const on = visible[r.key] !== false;
        return (
          <label key={r.key} style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
            cursor: "pointer", userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange({ [r.key]: !on })}
              style={{ accentColor: "#00d2d3", margin: 0 }}
            />
            <span style={{ fontSize: 10, color: on ? "#fff" : "#666", fontWeight: 700, letterSpacing: "1px" }}>
              {r.label}
            </span>
          </label>
        );
      })}
      <button
        onClick={onClose}
        style={{
          width: "100%", marginTop: 4, background: "transparent",
          border: "1px solid #333", color: "#999",
          padding: "4px 8px", cursor: "pointer",
          fontSize: 9, fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
        }}
      >CLOSE</button>
    </div>
  );
}

// ── Ticker search combobox (v25) ──────────────────────────────────────────
function TickerSearchSelect({ value, assetList, onChange }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const rootRef  = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false); setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assetList;
    return assetList.filter(t => t.toLowerCase().includes(q));
  }, [assetList, query]);

  const commit = (t) => { onChange(t); setOpen(false); setQuery(""); };

  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    else if (e.key === "Enter" && filtered.length) { commit(filtered[0]); }
  };

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "#111", border: "1px solid #222", color: value ? "#fff" : "#666",
          padding: "3px 8px", fontSize: 10, fontFamily: mono, cursor: "pointer",
          minWidth: 80, textAlign: "left", letterSpacing: "0.5px",
        }}
      >
        {value || "+ select"} <span style={{ color: "#666", marginLeft: 4 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
            background: "#0a0a0a", border: "1px solid #333", padding: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)", minWidth: 140,
            fontFamily: mono,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="search ticker…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#111", border: "1px solid #222", color: "#fff",
              padding: "3px 6px", fontSize: 10, fontFamily: mono,
              marginBottom: 4,
            }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ fontSize: 10, color: "#666", padding: "4px 6px", fontStyle: "italic" }}>
                no match
              </div>
            )}
            {filtered.map(t => (
              <div
                key={t}
                onClick={() => commit(t)}
                style={{
                  fontSize: 10, color: t === value ? "#00d2d3" : "#fff",
                  padding: "3px 6px", cursor: "pointer", letterSpacing: "0.5px",
                  background: t === value ? "#00d2d322" : "transparent",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#1a1a1a"; }}
                onMouseLeave={e => { e.currentTarget.style.background = t === value ? "#00d2d322" : "transparent"; }}
              >{t}</div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ReplayView({ assets }) {
  // v29: 3-state machine
  const [mode, setMode]               = useState("empty");          // "empty" | "loading" | "running"
  const [appliedConfig, setApplied]   = useState(null);
  const [popupOpen, setPopupOpen]     = useState(false);

  // Resume-last subtitle for the empty-state button
  const [resumeHint, setResumeHint]   = useState(() => {
    const c = validateAgainstAssets(loadStoredConfig(), assets);
    return c?.ticker ? `${c.ticker} · ${c.tf} · ${c.period}` : null;
  });

  const handleApply = async (cfg) => {
    setApplied(cfg);
    setPopupOpen(false);
    setResumeHint(`${cfg.ticker} · ${cfg.tf} · ${cfg.period}`);
    setShowRegime(true);                                              // v31: chosen layers default visible
    // v31-fix: only bump chartKey when ticker/tf/period changes — that's
    //   when the chart actually needs new data. Layer-only changes
    //   (toggling weekly/monthly/regime sub-modes etc.) keep the chart
    //   alive; the dependent series-creating effects re-fire on
    //   appliedConfig dep change instead and do their own teardowns.
    //   Avoids the chart destroy + recreate GC churn on every Re-Apply.
    const needsFreshChart = !appliedConfig
      || appliedConfig.ticker !== cfg.ticker
      || appliedConfig.tf     !== cfg.tf
      || appliedConfig.period !== cfg.period;
    if (needsFreshChart) setChartKey(k => k + 1);
    setLoadError(null);
    setMode("loading");

    try {
      setLoadPhase("Loading bars…");
      await new Promise(r => setTimeout(r, 200));

      if (cfg.layers.weekly || cfg.layers.monthly || cfg.layers.quarterly?.enabled) {
        setLoadPhase("Loading cones…");
        await new Promise(r => setTimeout(r, 200));
      }
      if (cfg.layers.regime?.enabled) {
        setLoadPhase("Loading regime…");
        await new Promise(r => setTimeout(r, 200));
      }
      if (cfg.layers.bands) {
        setLoadPhase("Loading bands…");
        await new Promise(r => setTimeout(r, 200));
      }
      setLoadPhase("Building chart…");
      await new Promise(r => setTimeout(r, 200));
      setLoadPhase("Done.");
      setMode("running");
    } catch (err) {
      console.error("[ReplayView v31] load failed:", err);
      setLoadError(String(err?.message || err));
    }
  };

  const assetList = useMemo(() => {
    if (!assets) return [];
    if (assets instanceof Map) return Array.from(assets.keys()).sort();
    if (Array.isArray(assets)) return assets.map(a => a.ticker).sort();
    return Object.keys(assets).sort();
  }, [assets]);

  const [asset, setAsset]       = useState(null);
  // v14: 3M default; M15 default (index 3 in TIMEFRAMES list).
  const [period, setPeriod]     = useState(PERIODS[0]);
  const [tf, setTf]             = useState(TIMEFRAMES.find(t => t.code === "M15") || TIMEFRAMES[0]);
  const [bars, setBars]         = useState([]);
  // v9: timeAxis = bars[].time + whitespace times spanning every cone forecast.
  //     Set at load; candle series always paints this array (real-or-whitespace
  //     per slot). Time axis width then fixed, so adding cone line series can
  //     never extend it and trigger LWC auto-fit.
  const [timeAxis, setTimeAxis] = useState([]);
  const [anchors, setAnchors]   = useState(null);
  const [playIdx, setPlayIdx]   = useState(0);
  const [playing, setPlaying]   = useState(false);
  const [speed, setSpeed]       = useState(1);
  const [models, setModels]     = useState(MODEL_DEFAULTS);
  const [showWeekly, setShowWeekly]     = useState(true);   // v3: anchor-type toggles
  const [showMonthly, setShowMonthly]   = useState(true);
  const [showQuarterly, setShowQuarterly] = useState(true); // v15: quarterly bucket
  // v24: per-quarter sub-visibility (refines QUARTERLY when master is on).
  const [quarterlyVisible, setQuarterlyVisible] = useState({
    curr: true, prev1: true, prev2: true, prev3: true,
    prev4: true, prev5: true, prev6: true, prev7: true,
  });
  const [quarterlyDdOpen, setQuarterlyDdOpen] = useState(false);
  const [showBands,     setShowBands]     = useState(true); // v18: bands-replay fused overlay
  // v13: cap the number of simultaneously-visible anchors (most-recent-first).
  //      0 = unlimited.
  const [maxCones, setMaxCones] = useState(8);
  // v13: which model key is currently showing its gear popover (null = none)
  const [gearOpen, setGearOpen] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState("");
  // v26 TEMP DIAG — populated at end of visibility effect for the on-chart overlay.
  const [debugStats, setDebugStats] = useState({
    mapEntries: 0, seriesVisible: 0, seriesHidden: 0, applyErrors: 0,
    shownSample: [], totalAnchorsInData: 0,
  });

  // v28: regime overlay (payload from RegimeBar; same shape as MainChart consumes)
  const [regimeHistory, setRegimeHistory] = useState(null);
  const regimeMacroRef = useRef(null);
  const regimeMicroRef = useRef(null);

  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  // v12: pre-built cone series. Structure:
  //   coneSeriesMapRef.current = {
  //     [anchorDate]: { bucket, ts, models: { [modelKey]: { [slot]: series } } }
  //   }
  // Each slot's series is created once with visible:false and stays for the
  // lifetime of the current ticker/period load.
  const coneSeriesMapRef = useRef({});
  const didInitialCenterRef = useRef(false);  // v3: center once per data load
  const snapToBarRef = useRef((t) => t);      // v16: forecast-time snapper (bar-aligned)
  // v18: bands-replay fusion renderer — 3 models × 7 channels = up to 21
  //     LWC line series, pre-built once and setData'd on every playTime.
  const bandsSeriesRef = useRef({});          // { [model]: { [channel]: LineSeries } }
  const bandsDataRef   = useRef({ anchors: [], sortedAnchorDates: [], head: null });

  // v31: chart-remount key. Bumped on every Apply so the chart container
  //   gets a fresh DOM node + fresh LWC instance, killing any orphan refs.
  const [chartKey, setChartKey] = useState(0);

  // v31: load-orchestrator state — drives <ReplayLoadingBar/>.
  const [loadPhase, setLoadPhase] = useState("");
  const [loadError, setLoadError] = useState(null);

  // v31: REGIME master visibility for the inline strip. Independent of
  //   appliedConfig.layers.regime.* (those are the sub-modes built at Apply
  //   time). When false, all three regime visualizations are hidden even
  //   though the data may have been fetched.
  const [showRegime, setShowRegime] = useState(true);

  // v30: when appliedConfig changes (Apply pressed), push values into the
  //   existing state vars so the existing fetch + cone-builder + visibility
  //   effects pick them up. Maps the popup's string format (tf:"M15",
  //   period:"3M") to the existing object shape, and maps q_curr/q_prev*
  //   keys to the existing curr/prev* keys.
  useEffect(() => {
    if (!appliedConfig) return;
    const cfg = appliedConfig;

    setAsset(cfg.ticker);

    const newPeriod = PERIODS.find(p => p.label === cfg.period);
    if (newPeriod) setPeriod(newPeriod);

    const newTf = TIMEFRAMES.find(t => t.code === cfg.tf);
    if (newTf) setTf(newTf);

    // Layer master visibility: existing show* flags drive the visibility
    // effect that hides built series. Build-gating below in the cone loop
    // also uses appliedConfig.layers directly, so we don't double-build.
    setShowWeekly(!!cfg.layers.weekly);
    setShowMonthly(!!cfg.layers.monthly);
    setShowQuarterly(!!cfg.layers.quarterly?.enabled);
    setShowBands(!!cfg.layers.bands);

    // Per-quarter visibility — popup uses q_curr/q_prev*, internal state uses curr/prev*.
    const Q = cfg.layers.quarterly || {};
    setQuarterlyVisible({
      curr:  !!Q.q_curr,
      prev1: !!Q.q_prev1, prev2: !!Q.q_prev2, prev3: !!Q.q_prev3,
      prev4: !!Q.q_prev4, prev5: !!Q.q_prev5, prev6: !!Q.q_prev6, prev7: !!Q.q_prev7,
    });
  }, [appliedConfig]);

  // ── Init LWC chart ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !LWC.createChart) return;
    const ch = LWC.createChart(el, {
      width: el.clientWidth, height: el.clientHeight,
      layout: { background: { color: C.bg }, textColor: C.gray, fontSize: 10, fontFamily: mono, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: LWC.CrosshairMode?.Normal || 0 },
      rightPriceScale: { borderColor: C.borderLt, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: C.borderLt, timeVisible: true, secondsVisible: false, rightOffset: 5,
                   autoScrollToRealTime: false, shiftVisibleRangeOnNewBar: false },
      handleScroll: { vertTouchDrag: true }, handleScale: { axisPressedMouseMove: { time: true, price: true } },
    });
    chartRef.current = ch;
    candleRef.current = ch.addSeries(LWC.CandlestickSeries, {
      upColor: C.green, downColor: C.red,
      borderUpColor: C.green, borderDownColor: C.red,
      wickUpColor: C.green, wickDownColor: C.red,
    });

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 20 && height > 20) { try { ch.resize(width, height); } catch {} }
    });
    ro.observe(el);

    // v10: dbl-click on chart container → re-center on current playback bar
    //      + re-enable price auto-scale. Fires for clicks anywhere on the
    //      chart (price axis, time axis, plot area).
    const onDbl = () => {
      const chart = chartRef.current;
      if (!chart) return;
      try {
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {}
      // The React effect that handles centering reads the latest timeAxis +
      // playIdx via state. We dispatch a custom event the component listens
      // to so we don't capture stale closures here.
      el.dispatchEvent(new CustomEvent("replay:recenter"));
    };
    el.addEventListener("dblclick", onDbl);

    return () => {
      ro.disconnect();
      el.removeEventListener("dblclick", onDbl);
      try { ch.remove(); } catch {}
      chartRef.current = null;
    };
  // v31: chartKey in deps so Re-Apply (which bumps chartKey) triggers a
  //   full chart teardown + recreate on the freshly-keyed container.
  }, [chartKey]);

  // v10: re-center handler — listens to the dblclick event from chart init.
  //      Uses latest state via the useEffect closure capture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onRecenter = () => {
      const ch = chartRef.current;
      if (!ch || timeAxis.length === 0) return;
      const currentTime = bars[playIdx]?.time ?? timeAxis[0].time;
      let axisIdx = 0;
      for (let i = 0; i < timeAxis.length; i++) {
        if (timeAxis[i].time <= currentTime) axisIdx = i; else break;
      }
      const windowHalf = 40;
      try {
        ch.timeScale().setVisibleLogicalRange({
          from: Math.max(0, axisIdx - windowHalf),
          to:   axisIdx + windowHalf,
        });
      } catch {}
    };
    el.addEventListener("replay:recenter", onRecenter);
    return () => el.removeEventListener("replay:recenter", onRecenter);
  }, [timeAxis, bars, playIdx]);

  // ── Load bars + anchors when asset / period / tf changes ──
  useEffect(() => {
    if (!asset) { setBars([]); setAnchors(null); setStatus(""); return; }
    let cancelled = false;
    setLoading(true); setStatus("loading bars…");

    const count = Math.max(50, Math.round(period.days * tf.barsPerDay));

    Promise.all([
      fetchBarsCached(asset, tf.code, count),      // v27: session cache
      apiFetch(`/api/historical_cones/${asset}`),
      apiFetch(`/api/quarterly_cones/${asset}`),  // v15: quarterly cones
      apiFetch(`/api/bands_replay/${asset}`),     // v17: daily bands-replay prototype
    ]).then(([barsResp, anchorsResp, quarterlyResp, bandsReplayResp]) => {
      if (cancelled) return;
      const rawBars = (barsResp?.bars || []).map(b => ({
        time: typeof b.time === "string" ? toUTCSec(b.time) : Math.floor(b.time),
        open: b.open, high: b.high, low: b.low, close: b.close,
      })).filter(b => b.time > 0).sort((a, b) => a.time - b.time);
      setBars(rawBars);

      // v15: convert quarterly flat schema → bucketed shape keyed by anchor date.
      //   Producer keys: gbm_quarter_{curr|prev1|prev2|prev3}, same for mjd.
      //   Anchor dates come from meta.anchors[].
      //   Result merges into anchors as anchorsObj.quarterly = { dateStr: { gbm, mjd } }
      const anchorsObj = { ...(anchorsResp || {}) };
      const quarterly = {};
      const qAnchors = quarterlyResp?.meta?.anchors || [];
      // v23: extended to 8 anchors. Producer JSON now ships curr + prev1..prev7;
      //   MainChart's mapper only reads curr..prev3, so prev4..prev7 are
      //   replay-only by design.
      const Q_LABEL_TO_SUFFIX = {
        quarter_curr:  "curr",
        quarter_prev1: "prev1",
        quarter_prev2: "prev2",
        quarter_prev3: "prev3",
        quarter_prev4: "prev4",
        quarter_prev5: "prev5",
        quarter_prev6: "prev6",
        quarter_prev7: "prev7",
      };
      // v24: parallel map { anchor_date: suffix } so the visibility effect
      //   can identify which of the 8 quarters each anchor belongs to.
      const quarterlyLabels = {};
      for (const a of qAnchors) {
        const sfx = Q_LABEL_TO_SUFFIX[a.label];
        if (!sfx || !a.anchor_date) continue;
        const slot = {};
        for (const m of ["gbm", "mjd"]) {
          const k = `${m}_quarter_${sfx}`;
          if (quarterlyResp[k]) slot[m] = quarterlyResp[k];
        }
        if (Object.keys(slot).length) {
          quarterly[a.anchor_date] = slot;
          quarterlyLabels[a.anchor_date] = sfx;
        }
      }
      if (Object.keys(quarterly).length) {
        anchorsObj.quarterly = quarterly;
        anchorsObj._quarterlyLabels = quarterlyLabels;
      }

      // v18: bands-replay — rendered via the dedicated fusion renderer
      //   below (NOT as per-anchor cones). Merge the producer's 'daily'
      //   bucket under the key 'bands' so the rest of the component can
      //   distinguish cone buckets (weekly/monthly/quarterly) from the
      //   bands renderer without code churn. Also stash 'head' and the
      //   fusion_instructions metadata for warm-start + styling.
      if (bandsReplayResp?.daily && typeof bandsReplayResp.daily === "object") {
        anchorsObj.bands = bandsReplayResp.daily;
        anchorsObj._bandsHead   = bandsReplayResp.head || null;
        anchorsObj._bandsMeta   = bandsReplayResp.fusion_instructions || null;
        anchorsObj._bandsSchema = bandsReplayResp.meta?.schema_version || null;
        // v19: verify schema so we know whether to use select (v2) or fall
        //     back to forward[0] for trailing (v1 — visually ~√2 wider).
        if (anchorsObj._bandsSchema && anchorsObj._bandsSchema !== "bands_replay_v2") {
          console.warn("[ReplayView] Expected bands_replay_v2; got", anchorsObj._bandsSchema,
                       "— trailing will fall back to forward[0] (~41% wider than live).");
        }
      }
      setAnchors(anchorsObj);

      // v2: default playIdx lands just before the earliest anchor so user
      // sees an empty chart on load and the first cone appears within a
      // couple of bars of pressing Play.
      let defaultIdx = 0;
      const anchorTimes = [];

      // v16: snap-to-bar. Cone producers emit forecast times on a 2h grid.
      //   At TFs coarser than 2h (H4) the 2h grid interleaves between bars,
      //   inflating LWC's global time scale with whitespace and visually
      //   spacing real candles apart. Fix: for any forecast time that falls
      //   within the bar range, snap to the nearest bar time; times past
      //   the last bar stay as-is so cones still project into the future.
      const barTimesArrSorted = rawBars.map(b => b.time).sort((a, b) => a - b);
      const lastBarTime = barTimesArrSorted.length
        ? barTimesArrSorted[barTimesArrSorted.length - 1]
        : 0;
      const snapToBar = (t) => {
        if (!barTimesArrSorted.length) return t;
        if (t > lastBarTime) return t; // future extension — leave alone
        let lo = 0, hi = barTimesArrSorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (barTimesArrSorted[mid] < t) lo = mid + 1; else hi = mid;
        }
        const lower = barTimesArrSorted[Math.max(0, lo - 1)];
        const upper = barTimesArrSorted[Math.min(barTimesArrSorted.length - 1, lo)];
        return (t - lower) <= (upper - t) ? lower : upper;
      };

      // v9: while walking anchors, also collect every forecast timestamp
      //     so we can extend the candle time axis to include them all.
      // v15: include quarterly bucket so the time axis covers the long horizon.
      // v18: "bands" joins the axis union so LWC's time scale covers the
      //     forward-projection range. Cone-builder loop intentionally does
      //     NOT include it — bands have their own fusion renderer below.
      const allForecastTimes = new Set();
      for (const bucket of ["weekly", "monthly", "quarterly", "bands"]) {
        for (const [d, payload] of Object.entries(anchorsObj?.[bucket] || {})) {
          const ts = toUTCSec(d);
          if (ts > 0) anchorTimes.push(ts);
          for (const modelKey of Object.keys(MODEL_DEFAULTS)) {
            const mdata = payload?.[modelKey];
            if (!mdata?.dates) continue;
            for (const date of mdata.dates) {
              const t = snapToBar(toUTCSec(date));  // v16: snap
              if (t > 0) allForecastTimes.add(t);
            }
          }
        }
      }
      // v16: stash the snapper on state so the cone-series builder effect
      //     can reuse it without recomputing the bar array.
      snapToBarRef.current = snapToBar;
      // Build timeAxis = union(bar times, forecast times), sorted ascending.
      const barTimes = new Set(rawBars.map(b => b.time));
      for (const t of allForecastTimes) barTimes.add(t);
      const sortedTimes = Array.from(barTimes).sort((a, b) => a - b);
      // Map bar info by time for quick lookup; entries without a bar are whitespace.
      const barByTime = new Map(rawBars.map(b => [b.time, b]));
      const axis = sortedTimes.map(t => {
        const b = barByTime.get(t);
        return b ? b : { time: t };
      });
      setTimeAxis(axis);
      // v26: only consider anchors that fall within the loaded bar range.
      //   Previously Math.min(...anchorTimes) could return a quarterly
      //   anchor (e.g., 2024-07-01) that predates bars[0], making the
      //   walk-back loop find no bar and defaultIdx stay at 0 — which
      //   parked the playhead at the oldest bar (in the distant past)
      //   with no anchors visible and nothing to scrub toward.
      if (anchorTimes.length && rawBars.length) {
        const barsStart = rawBars[0].time;
        const inRange = anchorTimes.filter(t => t >= barsStart);
        if (inRange.length) {
          const earliest = Math.min(...inRange);
          for (let i = rawBars.length - 1; i >= 0; i--) {
            if (rawBars[i].time < earliest) { defaultIdx = i; break; }
          }
        }
      }
      setPlayIdx(defaultIdx);
      didInitialCenterRef.current = false;  // v3: arm a one-shot center

      const days = rawBars.length > 1
        ? Math.round((rawBars[rawBars.length-1].time - rawBars[0].time) / 86400)
        : 0;
      setStatus(`${rawBars.length} bars ≈ ${days}d loaded · ${anchorTimes.length} anchors`);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [asset, period, tf]);

  // v31: candle_color day-map + palette memoized — rebuilt only when
  //   regimeHistory shifts, not on every paint tick. (Painted-candles
  //   effect runs on every playIdx advance during playback; rebuilding
  //   the dayMap then was wasteful.) Uses MICRO regime — switches
  //   often enough to actually colour the candle stream visibly; macro
  //   stays one colour for too long to be useful here.
  const candleColorDayMap = useMemo(() => {
    const microLayer = regimeHistory?.micro;
    const slowD1 = microLayer?.data?.history?.slow_d1;
    if (!slowD1?.length || !microLayer?.colors) return null;
    const dayMap = new Map();
    for (const row of slowD1) {
      if (!row?.date || !row?.regime) continue;
      const utc = Math.floor(new Date(row.date + "T00:00:00Z").getTime() / 1000);
      if (Number.isFinite(utc) && utc > 0) dayMap.set(utc, row.regime);
    }
    return { dayMap, palette: microLayer.colors };
  }, [regimeHistory]);

  // ── Paint candles onto the fixed timeAxis ──
  // v9: timeAxis is full width (bar times + all cone forecast times, as
  //     whitespace). Scrubbing just flips which slots have real OHLC.
  useEffect(() => {
    const ch = chartRef.current;
    if (!candleRef.current || !ch || timeAxis.length === 0) {
      try { candleRef.current?.setData([]); } catch {}
      return;
    }
    const currentTime = bars[playIdx]?.time ?? 0;

    // v31: read memoized day-map; gate is the same.
    const cc = (appliedConfig?.layers?.regime?.candle_color && showRegime) ? candleColorDayMap : null;

    const painted = timeAxis.map(slot => {
      if (slot.open !== undefined && slot.time <= currentTime) {
        if (cc) {
          const dayStart = Math.floor(slot.time / 86400) * 86400;
          const regime = cc.dayMap.get(dayStart);
          const color = regime ? cc.palette[regime] : null;
          if (color) {
            return {
              ...slot,
              color, borderColor: color, wickColor: color,
            };
          }
        }
        return slot;
      }
      return { time: slot.time };
    });
    try { candleRef.current.setData(painted); } catch {}
  }, [timeAxis, bars, playIdx, candleColorDayMap, appliedConfig, showRegime]);

  // ── One-shot center after data load (v3) ──
  // v9: compute the logical index of the default playback time within the
  //     extended timeAxis (which may be wider than bars[]).
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch || timeAxis.length === 0 || didInitialCenterRef.current) return;
    const currentTime = bars[playIdx]?.time ?? timeAxis[0].time;
    let axisIdx = 0;
    for (let i = 0; i < timeAxis.length; i++) {
      if (timeAxis[i].time <= currentTime) axisIdx = i; else break;
    }
    const windowHalf = 40;
    try {
      ch.timeScale().setVisibleLogicalRange({
        from: Math.max(0, axisIdx - windowHalf),
        to:   axisIdx + windowHalf,
      });
      didInitialCenterRef.current = true;
    } catch {}
  }, [timeAxis, bars, playIdx]);

  const playTime = bars[playIdx]?.time ?? 0;

  // Count of currently-visible anchors — informational, for status bar.
  const visibleAnchorCount = useMemo(() => {
    if (!anchors) return 0;
    let n = 0;
    // v18: "bands" not counted here — fusion renderer is independent of
    //     the per-anchor cone pipeline.
    const qLabels = anchors._quarterlyLabels || {};
    for (const bucket of ["weekly", "monthly", "quarterly"]) {
      const on = bucket === "weekly" ? showWeekly
              : bucket === "monthly" ? showMonthly
              : bucket === "quarterly" ? showQuarterly
              : true;
      if (!on) continue;
      for (const d of Object.keys(anchors[bucket] || {})) {
        const ts = toUTCSec(d);
        if (!(ts > 0 && ts <= playTime)) continue;
        // v24: per-quarter sub-filter
        if (bucket === "quarterly") {
          const lbl = qLabels[d];
          if (lbl && quarterlyVisible[lbl] === false) continue;
        }
        n++;
      }
    }
    return n;
  }, [anchors, playTime, showWeekly, showMonthly, showQuarterly, quarterlyVisible]);

  // ── v12: BUILD all cone series once when anchors + timeAxis arrive ──
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;

    // Teardown previous build (ticker/period change).
    for (const anchorDate of Object.keys(coneSeriesMapRef.current)) {
      const entry = coneSeriesMapRef.current[anchorDate];
      for (const modelKey of Object.keys(entry.models)) {
        for (const slot of Object.keys(entry.models[modelKey])) {
          try { ch.removeSeries(entry.models[modelKey][slot]); } catch {}
        }
      }
    }
    coneSeriesMapRef.current = {};

    if (!anchors || timeAxis.length === 0) return;

    // v21 TEMP DIAG — report what the builder sees per ticker/bucket so
    // we can pinpoint why cones don't render on specific tickers. Remove
    // once the investigation is done.
    try {
      const bucketCounts = {
        weekly:    Object.keys(anchors.weekly    || {}).length,
        monthly:   Object.keys(anchors.monthly   || {}).length,
        quarterly: Object.keys(anchors.quarterly || {}).length,
      };
      const sampleWk = Object.keys(anchors.weekly || {})[0];
      const sampleGbm = sampleWk ? (anchors.weekly?.[sampleWk]?.gbm) : null;
      // eslint-disable-next-line no-console
      console.log(
        "[ReplayView v21] cone-builder fired:",
        "asset=", asset,
        "timeAxis.len=", timeAxis.length,
        "bars.len=", bars.length,
        "buckets=", bucketCounts,
        "sample weekly anchor=", sampleWk,
        "sample gbm dates[0:2]=", sampleGbm?.dates?.slice(0, 2),
        "sample gbm median[0:2]=", sampleGbm?.median?.slice(0, 2),
      );
    } catch {}

    const SLOT_OPACITY = {
      median:   1.00,
      sd1_high: 0.60, sd1_low: 0.60,
      sd2_high: 0.35, sd2_low: 0.35,
      sd3_high: 0.18, sd3_low: 0.18,
    };

    // v22 TEMP DIAG — per-bucket built/skipped counters
    const v22Stats = {
      weekly:    { seen: 0, built: 0, slots: 0, skippedTs: 0, skippedNoData: 0 },
      monthly:   { seen: 0, built: 0, slots: 0, skippedTs: 0, skippedNoData: 0 },
      quarterly: { seen: 0, built: 0, slots: 0, skippedTs: 0, skippedNoData: 0 },
    };

    // v18: "bands" intentionally excluded — it has its own fusion renderer.
    for (const bucket of ["weekly", "monthly", "quarterly"]) {
      // v30: skip whole bucket if not chosen at config time. Eliminates
      //   per-model build() work for unwanted families — the heaviness fix.
      if (!appliedConfig) continue;
      const L = appliedConfig.layers;
      if (bucket === "weekly"    && !L.weekly)               continue;
      if (bucket === "monthly"   && !L.monthly)              continue;
      if (bucket === "quarterly" && !L.quarterly?.enabled)   continue;
      const entries = anchors[bucket] || {};
      for (const [dateStr, payload] of Object.entries(entries)) {
        // v30: per-quarter gate — skip anchors not picked in the popup's
        //   8-checkbox sub-list. _quarterlyLabels stores short suffixes
        //   ("curr"/"prev1".."prev7") which map to popup keys by simple
        //   "q_" prefix. Unknown / missing labels are skipped (default-deny)
        //   so a future producer-side schema addition doesn't silently leak
        //   unfiltered cones into the chart.
        if (bucket === "quarterly") {
          const Q = appliedConfig.layers.quarterly;
          const qLabel = anchors._quarterlyLabels?.[dateStr] || null;
          const qKey = qLabel ? `q_${qLabel}` : null;
          if (!qKey || !Q[qKey]) continue;
        }
        v22Stats[bucket].seen++;
        const ts = toUTCSec(dateStr);
        if (ts <= 0) { v22Stats[bucket].skippedTs++; continue; }

        const modelSeries = {};
        for (const modelKey of Object.keys(MODEL_DEFAULTS)) {
          const mdata = payload?.[modelKey];
          if (!mdata?.dates || !mdata.median) { v22Stats[bucket].skippedNoData++; continue; }
          const tsArr = mdata.dates.map(toUTCSec);

          const slotSeries = {};
          const build = (slot, arr) => {
            if (!arr?.length) return;
            // v16: snap each forecast time to the nearest bar time (only
            //   for in-range points). Multiple snaps to the same bar collapse
            //   via last-writes-wins so the cone line still terminates on the
            //   correct end value even after downsampling.
            const snap = snapToBarRef.current || ((t) => t);
            const byTime = new Map();
            for (let i = 0; i < Math.min(arr.length, tsArr.length); i++) {
              const t = snap(tsArr[i]);
              if (t > 0) byTime.set(t, arr[i]);
            }
            if (byTime.size < 2) return;
            const pts = Array.from(byTime.entries())
              .map(([t, v]) => ({ time: t, value: v }))
              .sort((a, b) => a.time - b.time);
            // v31-fix: track the series locally so a setData throw after
            //   addSeries succeeds doesn't leave an orphan series on the
            //   chart (untracked by coneSeriesMapRef → never cleaned up).
            let s = null;
            try {
              s = ch.addSeries(LWC.LineSeries, {
                color: "rgba(0,0,0,0)",   // initial color; set by visibility effect
                lineWidth: 1,
                lineStyle: LWC.LineStyle?.Solid ?? 0,
                priceLineVisible: false,
                lastValueVisible: false,
                visible: false,            // pre-built, hidden by default
                autoscaleInfoProvider: () => null,  // don't pull price scale
              });
              s.setData(pts);
              slotSeries[slot] = s;
            } catch (e) {
              if (s) { try { ch.removeSeries(s); } catch {} }
              // v22 TEMP DIAG — surface addSeries/setData failures
              // eslint-disable-next-line no-console
              console.error("[ReplayView v22] build() threw:", { slot, ptsLen: pts.length, asset, error: e });
            }
          };

          build("median",   mdata.median);
          build("sd1_high", mdata.sd1_high);
          build("sd1_low",  mdata.sd1_low);
          build("sd2_high", mdata.sd2_high);
          build("sd2_low",  mdata.sd2_low);
          build("sd3_high", mdata.sd3_high);
          build("sd3_low",  mdata.sd3_low);

          if (Object.keys(slotSeries).length) {
            modelSeries[modelKey] = slotSeries;
            v22Stats[bucket].slots += Object.keys(slotSeries).length;
          }
        }

        if (Object.keys(modelSeries).length) {
          // v24: stash quarterLabel so the visibility effect can apply the
          //   per-quarter sub-filter (only meaningful for bucket==="quarterly").
          const quarterLabel = bucket === "quarterly"
            ? (anchors._quarterlyLabels?.[dateStr] || null)
            : null;
          // v26: key by `${bucket}:${dateStr}` so same-date anchors across
          //   buckets (e.g., monthly 2026-04-01 and quarterly 2026-04-01) no
          //   longer overwrite each other. Previously the second-iterated
          //   bucket won and the first's line-series leaked with no toggle.
          const key = `${bucket}:${dateStr}`;
          coneSeriesMapRef.current[key] = { bucket, ts, models: modelSeries, quarterLabel, dateStr };
          v22Stats[bucket].built++;
        }
      }
    }

    // v22 TEMP DIAG — builder receipt
    try {
      // eslint-disable-next-line no-console
      console.log("[ReplayView v22] builder done:",
        "asset=", asset,
        "totalMapEntries=", Object.keys(coneSeriesMapRef.current).length,
        "stats=", v22Stats);
    } catch {}
  // v31: chartKey added so ticker/tf/period Re-Apply (which bumps
  //   chartKey) re-runs the cone-builder against the freshly-mounted
  //   chart. v31-fix: appliedConfig added so layer-only Re-Apply (which
  //   no longer bumps chartKey, to avoid GC churn) still re-fires the
  //   builder — its internal teardown clears coneSeriesMapRef + removes
  //   the old series from the (still-alive) chart, then the build-gating
  //   per layer determines what gets built fresh.
  }, [anchors, timeAxis, chartKey, appliedConfig]);

  // ══════════════════════════════════════════════════════════════════════
  // v18: BANDS-REPLAY FUSION RENDERER (per DC producer spec)
  // ──────────────────────────────────────────────────────────────────────
  // At playhead T, produce ONE continuous line per (model × channel):
  //   trailing  = for every anchor A_i <= T, plot (A_i.dates[0], A_i.channel[0])
  //   forward   = for the most recent A_T, plot its full 20-step array
  //   series.setData(concat(trailing, forward))  — 21 setData calls/tick max.
  //
  // Before the first anchor date, render the 'head' warm-start block
  // (identical shape to the live bands JSON) instead of the fused lines.
  // ══════════════════════════════════════════════════════════════════════

  const BAND_CHANNELS = ["median", "sd1_high", "sd1_low", "sd2_high", "sd2_low", "sd3_high", "sd3_low"];
  const BAND_OPACITY  = { median: 1.0, sd1_high: 0.6, sd1_low: 0.6, sd2_high: 0.35, sd2_low: 0.35, sd3_high: 0.18, sd3_low: 0.18 };

  // ── Pre-build the 21 line series once per anchors/ticker load ──
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch || !LWC.LineSeries) return;

    // Tear down any previously-built bands series
    for (const m of Object.keys(bandsSeriesRef.current)) {
      for (const c of Object.keys(bandsSeriesRef.current[m] || {})) {
        try { ch.removeSeries(bandsSeriesRef.current[m][c]); } catch {}
      }
    }
    bandsSeriesRef.current = {};
    bandsDataRef.current   = { anchors: [], sortedAnchorDates: [], head: null };

    const bands = anchors?.bands;
    if (!bands || typeof bands !== "object") return;

    const sortedAnchorDates = Object.keys(bands)
      .filter(d => toUTCSec(d) > 0)
      .sort();
    if (sortedAnchorDates.length === 0) return;

    bandsDataRef.current = {
      anchors: bands,
      sortedAnchorDates,
      head: anchors._bandsHead || null,
      schema: anchors._bandsSchema || null,  // v19: drives trailing source
    };

    for (const modelKey of Object.keys(MODEL_DEFAULTS)) {
      const mdef = MODEL_DEFAULTS[modelKey];
      bandsSeriesRef.current[modelKey] = {};
      for (const ch_ of BAND_CHANNELS) {
        try {
          const s = ch.addSeries(LWC.LineSeries, {
            color: rgba(mdef.color, (mdef.opacity ?? 0.9) * (BAND_OPACITY[ch_] ?? 1)),
            lineWidth: ch_ === "median" ? (mdef.width ?? 1.5) : Math.max(1, (mdef.width ?? 1.5) - 0.5),
            lineStyle: LWC.LineStyle?.Solid ?? 0,
            priceLineVisible: false,
            lastValueVisible: false,
            visible: false,
            autoscaleInfoProvider: () => null,
          });
          bandsSeriesRef.current[modelKey][ch_] = s;
        } catch {}
      }
    }

    return () => {
      const chart = chartRef.current;
      if (!chart) return;
      for (const m of Object.keys(bandsSeriesRef.current)) {
        for (const c of Object.keys(bandsSeriesRef.current[m] || {})) {
          try { chart.removeSeries(bandsSeriesRef.current[m][c]); } catch {}
        }
      }
      bandsSeriesRef.current = {};
    };
  // v31: chartKey added — see cone-builder note. Same reasoning.
  // v31-fix: appliedConfig added — see cone-builder note. Layer-only
  //   Re-Apply doesn't bump chartKey, so this dep makes bands rebuild.
  }, [anchors, chartKey, appliedConfig]);

  // ── Playhead effect: compute fused data per series and setData ──
  useEffect(() => {
    const seriesMap = bandsSeriesRef.current;
    if (!seriesMap || Object.keys(seriesMap).length === 0) return;
    const { anchors: bandsAnch, sortedAnchorDates, head, schema } = bandsDataRef.current;
    if (!bandsAnch || sortedAnchorDates.length === 0) return;
    // v19: v2 ships per-anchor `select` (σ @ 0.5 biz days) — matches live
    //     Phase 1 widths. Older v1 files have no `select`; we fall back to
    //     forward[0] (σ @ 1d, ~41% wider) only if absent.
    const useSelect = schema === "bands_replay_v2";

    const T = playTime;
    const snap = snapToBarRef.current || ((t) => t);

    // Resolve firstAnchorTs + the latest anchor <= T
    const firstAnchorTs = toUTCSec(sortedAnchorDates[0]);
    let A_T_date = null;
    for (const d of sortedAnchorDates) {
      if (toUTCSec(d) <= T) A_T_date = d; else break;
    }

    // Opacity/visibility governed by showBands toggle + model toggles
    const applyVisibility = (modelKey) => {
      const m = models[modelKey];
      return !!(m?.on) && showBands;
    };

    // BRANCH A — warm start: T < first anchor → render 'head' block directly.
    // head uses 'bat_*' for bates, and gbm_*/mjd_* for the other two.
    if (T < firstAnchorTs && head && Array.isArray(head.timestamps)) {
      const headTimes = head.timestamps.map(toUTCSec).map(snap);
      // Map head key prefixes → our model keys
      const prefixFor = (modelKey) =>
        modelKey === "gbm"   ? "gbm"
      : modelKey === "mjd"   ? "mjd"
      : modelKey === "bates" ? "bat"
      : modelKey;
      // Channel suffix table for head (e.g. median is 'mean' in head;
      // sd1_high is 'gbm_1sd_high')
      const headKey = (modelKey, channel) => {
        if (channel === "median") return "mean";
        const m = channel.match(/^sd([123])_(high|low)$/);
        if (!m) return null;
        return `${prefixFor(modelKey)}_${m[1]}sd_${m[2]}`;
      };
      for (const modelKey of Object.keys(seriesMap)) {
        const visible = applyVisibility(modelKey);
        for (const ch_ of BAND_CHANNELS) {
          const s = seriesMap[modelKey][ch_];
          if (!s) continue;
          const key = headKey(modelKey, ch_);
          const arr = key ? head[key] : null;
          if (!Array.isArray(arr) || arr.length === 0) {
            try { s.applyOptions({ visible: false }); s.setData([]); } catch {}
            continue;
          }
          const pts = [];
          const seen = new Set();
          for (let i = 0; i < Math.min(arr.length, headTimes.length); i++) {
            const t = headTimes[i];
            if (t > 0 && !seen.has(t)) { seen.add(t); pts.push({ time: t, value: arr[i] }); }
          }
          try {
            s.applyOptions({ visible });
            s.setData(pts);
          } catch {}
        }
      }
      return;
    }

    // BRANCH B — T >= first anchor → per-spec fusion.
    if (!A_T_date) {
      // Shouldn't happen given the guard above, but just in case:
      for (const modelKey of Object.keys(seriesMap)) {
        for (const ch_ of BAND_CHANNELS) {
          try { seriesMap[modelKey][ch_].applyOptions({ visible: false }); } catch {}
        }
      }
      return;
    }
    const trailingDates = sortedAnchorDates.filter(d => toUTCSec(d) <= T);

    for (const modelKey of Object.keys(seriesMap)) {
      const visible = applyVisibility(modelKey);
      for (const ch_ of BAND_CHANNELS) {
        const s = seriesMap[modelKey][ch_];
        if (!s) continue;
        try {
          // ── Trailing: one point per past anchor.
          //   v2  → A.model.select.{date, channel}   (σ @ 0.5d, matches live)
          //   v1  → A.model.dates[0] + channel[0]     (σ @ 1d, ~41% wider fallback)
          const trailing = [];
          const seen = new Set();
          for (const d of trailingDates) {
            const pay = bandsAnch[d]?.[modelKey];
            if (!pay) continue;
            let tRaw = null, v = null;
            const sel = pay.select;
            if (useSelect && sel && sel.date && Number.isFinite(sel[ch_])) {
              tRaw = toUTCSec(sel.date);
              v    = sel[ch_];
            } else if (pay.dates?.length && Array.isArray(pay[ch_])) {
              tRaw = toUTCSec(pay.dates[0]);
              v    = pay[ch_][0];
            } else {
              continue;
            }
            const t = snap(tRaw);
            if (t > 0 && !seen.has(t) && Number.isFinite(v)) {
              seen.add(t);
              trailing.push({ time: t, value: v });
            }
          }

          // ── Forward: full 20-step array from the most recent anchor ──
          const forward = [];
          const payAT = bandsAnch[A_T_date]?.[modelKey];
          if (payAT?.dates?.length && Array.isArray(payAT[ch_])) {
            const fwdSeen = new Set();
            for (let i = 0; i < Math.min(payAT.dates.length, payAT[ch_].length); i++) {
              const t = snap(toUTCSec(payAT.dates[i]));
              const v = payAT[ch_][i];
              if (t > 0 && !fwdSeen.has(t) && Number.isFinite(v)) {
                fwdSeen.add(t);
                forward.push({ time: t, value: v });
              }
            }
          }

          // Drop trailing points overlapping the forward head (newer anchor wins)
          const firstFwdTs = forward.length ? forward[0].time : Infinity;
          const trimmedTrailing = trailing.filter(p => p.time < firstFwdTs);
          const merged = [...trimmedTrailing, ...forward].sort((a, b) => a.time - b.time);

          s.applyOptions({ visible: visible && merged.length >= 2 });
          s.setData(merged);
        } catch {}
      }
    }
  // v31: chartKey added — see cone-builder note. v31-fix: appliedConfig
  //   added so layer-only Re-Apply re-fires bands fusion.
  }, [anchors, playTime, showBands, models, chartKey, appliedConfig]);

  // ── v12: TOGGLE cone visibility + style on state changes ──
  // v13: also honors the MAX CONES cap — only the most-recent N triggered
  //      anchors (per bucket-enabled filter) show.
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;

    const SLOT_OPACITY = {
      median:   1.00,
      sd1_high: 0.60, sd1_low: 0.60,
      sd2_high: 0.35, sd2_low: 0.35,
      sd3_high: 0.18, sd3_low: 0.18,
    };

    // v13: decide which anchors make the "show" list under the max-cones cap.
    const allAnchors = Object.entries(coneSeriesMapRef.current)
      .map(([date, entry]) => ({ date, ...entry }))
      .filter(a => a.ts <= playTime)
      .filter(a => {
        if (a.bucket === "weekly")  return showWeekly;
        if (a.bucket === "monthly") return showMonthly;
        // v24: quarterly = master toggle AND per-quarter sub-toggle
        if (a.bucket === "quarterly") {
          if (!showQuarterly) return false;
          if (a.quarterLabel && quarterlyVisible[a.quarterLabel] === false) return false;
          return true;
        }
        return true;
      })
      .sort((a, b) => b.ts - a.ts);  // newest first
    const cap = maxCones > 0 ? maxCones : Infinity;
    const shownSet = new Set(allAnchors.slice(0, cap).map(a => a.date));

    // v22 TEMP DIAG — track what the visibility effect actually does
    const v22Vis = { mapEntries: 0, inCap: 0, seriesVisible: 0, seriesHidden: 0, applyErrors: 0 };

    for (const anchorDate of Object.keys(coneSeriesMapRef.current)) {
      v22Vis.mapEntries++;
      const entry = coneSeriesMapRef.current[anchorDate];
      const inCap = shownSet.has(anchorDate);
      if (inCap) v22Vis.inCap++;

      for (const modelKey of Object.keys(entry.models)) {
        const m = models[modelKey];
        const modelVisible = !!m?.on;
        const baseOp = m?.opacity ?? 0.9;
        const color = m?.color ?? "#888888";
        const width = m?.width ?? 1.5;

        for (const slot of Object.keys(entry.models[modelKey])) {
          const s = entry.models[modelKey][slot];
          if (!s) continue;
          const op = (SLOT_OPACITY[slot] ?? 1) * baseOp;
          const visible = inCap && modelVisible;
          try {
            s.applyOptions({
              visible,
              color: rgba(color, op),
              lineWidth: slot === "median" ? width : Math.max(1, width - 0.5),
            });
            if (visible) v22Vis.seriesVisible++; else v22Vis.seriesHidden++;
          } catch (e) {
            v22Vis.applyErrors++;
            // eslint-disable-next-line no-console
            console.error("[ReplayView v22] applyOptions threw:", { anchorDate, modelKey, slot, error: e });
          }
        }
      }
    }

    // v22 TEMP DIAG — visibility receipt
    try {
      // eslint-disable-next-line no-console
      console.log("[ReplayView v22] visibility done:",
        "playTime=", playTime, "allAnchorsFiltered=", allAnchors.length,
        "maxCones=", maxCones, "shownSetSize=", shownSet.size,
        "stats=", v22Vis);
    } catch {}

    // v26 TEMP DIAG — feed the on-chart overlay.
    const shownSample = allAnchors.slice(0, 3).map(a => ({
      bucket: a.bucket,
      dateStr: a.dateStr || a.date,
      quarterLabel: a.quarterLabel || null,
    }));
    const totalAnchorsInData =
      Object.keys(anchors?.weekly    || {}).length +
      Object.keys(anchors?.monthly   || {}).length +
      Object.keys(anchors?.quarterly || {}).length;
    setDebugStats({
      mapEntries: v22Vis.mapEntries,
      seriesVisible: v22Vis.seriesVisible,
      seriesHidden: v22Vis.seriesHidden,
      applyErrors: v22Vis.applyErrors,
      shownSample,
      totalAnchorsInData,
    });
  // v20: `anchors` added as a dependency. Without it, when the user
  //   switches tickers the builder rebuilds cone series with visible:false
  //   but this effect doesn't re-fire (its other deps may not change at
  //   the exact moment), so the cones stay hidden — the counter reports
  //   them as present but the chart shows nothing. Observed on EURUSD in
  //   particular.
  // v24: `quarterlyVisible` added so per-quarter checkbox toggles re-evaluate.
  }, [anchors, playTime, showWeekly, showMonthly, showQuarterly, quarterlyVisible, models, maxCones]);

  // ── v28: REGIME RENDERING ──
  // Mirrors MainChart v55. For each enabled layer, map every bar's UTC day
  // to a regime label via history.slow_d1, look up the color, and paint a
  // full-height HistogramSeries at that opacity. Replay has no "live bar"
  // fallback (playhead isn't "today"), so bars past the last history entry
  // paint nothing. Hidden states are skipped.
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;

    if (regimeMacroRef.current) { try { ch.removeSeries(regimeMacroRef.current); } catch {} regimeMacroRef.current = null; }
    if (regimeMicroRef.current) { try { ch.removeSeries(regimeMicroRef.current); } catch {} regimeMicroRef.current = null; }

    const rh = regimeHistory;
    if (!rh || bars.length === 0) return;

    const buildLayer = (layer) => {
      if (!layer || !layer.enabled || !layer.data) return null;
      const slowD1 = layer.data?.history?.slow_d1 || [];
      if (!slowD1.length) return null;
      const dayMap = new Map();
      for (const row of slowD1) {
        if (!row?.date || !row?.regime) continue;
        const utc = Math.floor(new Date(row.date + "T00:00:00Z").getTime() / 1000);
        if (!Number.isFinite(utc) || utc <= 0) continue;
        dayMap.set(utc, row.regime);
      }
      const opacity = layer.opacity ?? 0.08;
      const hidden  = layer.hidden || new Set();
      const colors  = layer.colors || {};
      const out = [];
      for (const b of bars) {
        const dayStart = Math.floor(b.time / 86400) * 86400;
        const regime = dayMap.get(dayStart);
        if (!regime || hidden.has(regime)) continue;
        const hex = colors[regime];
        if (!hex || hex[0] !== "#") continue;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const bl = parseInt(hex.slice(5, 7), 16);
        out.push({ time: b.time, value: 1e10, color: `rgba(${r},${g},${bl},${opacity})` });
      }
      return out;
    };

    const macro = buildLayer(rh.macro);
    const micro = buildLayer(rh.micro);

    // v31: gate on regime.bg_shading sub-mode AND showRegime master
    if (appliedConfig?.layers?.regime?.bg_shading && showRegime) {
      if (macro && macro.length > 0) {
        try {
          const s = ch.addSeries(LWC.HistogramSeries, {
            priceScaleId: "regime_macro_bg", priceFormat: { type: "volume" },
            lastValueVisible: false, priceLineVisible: false,
          });
          ch.priceScale("regime_macro_bg").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
          s.setData(macro);
          regimeMacroRef.current = s;
        } catch (e) { console.error("[Replay] regime macro:", e); }
      }
      if (micro && micro.length > 0) {
        try {
          const s = ch.addSeries(LWC.HistogramSeries, {
            priceScaleId: "regime_micro_bg", priceFormat: { type: "volume" },
            lastValueVisible: false, priceLineVisible: false,
          });
          ch.priceScale("regime_micro_bg").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
          s.setData(micro);
          regimeMicroRef.current = s;
        } catch (e) { console.error("[Replay] regime micro:", e); }
      }
    }
  // v31: chartKey added — defensively. Effect already re-fires on
  //   appliedConfig changes; chartKey covers the unlikely path where
  //   the chart is rebuilt without appliedConfig also changing.
  }, [regimeHistory, bars, appliedConfig, showRegime, chartKey]);

  // ── Playback loop ──
  useEffect(() => {
    if (!playing || bars.length === 0) return;
    // Advance `speed` bars per second.
    const interval = 1000 / speed;
    const id = setInterval(() => {
      setPlayIdx(i => {
        if (i + 1 >= bars.length) { setPlaying(false); return i; }
        return i + 1;
      });
    }, interval);
    return () => clearInterval(id);
  }, [playing, speed, bars.length]);

  // ── UI helpers ──
  const toggleModel = (k) => setModels(m => ({ ...m, [k]: { ...m[k], on: !m[k].on } }));
  const updateModel = (k, patch) => setModels(m => ({ ...m, [k]: { ...m[k], ...patch } }));

  const currentDate = bars[playIdx] ? new Date(bars[playIdx].time * 1000).toISOString().slice(0, 10) : "—";

  // ── Render ──
  const btnStyle = (active, color = C.orange) => ({
    background: active ? `${color}25` : "transparent",
    color: active ? color : C.muted,
    border: `1px solid ${active ? color + "55" : C.border}`,
    padding: "3px 8px", cursor: "pointer",
    fontSize: 9, fontWeight: 700, fontFamily: mono,
    letterSpacing: "0.5px",
  });

  return (
    <>
      {mode === "empty" && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 14,
          background: "#0a0a0a", fontFamily: "'Courier New', Consolas, monospace",
        }}>
          <button type="button" onClick={() => setPopupOpen(true)}
            style={{
              padding: "12px 32px", background: "#ff6d00", color: "#000",
              border: "1px solid #ff6d00", fontFamily: "inherit", fontSize: 12,
              letterSpacing: "2px", fontWeight: 800, cursor: "pointer",
            }}>CONFIGURATION</button>
          {resumeHint && (
            <div style={{ fontSize: 9, color: "#666", letterSpacing: "1.5px" }}>
              resume last: {resumeHint}
            </div>
          )}
        </div>
      )}

      {(mode === "running" || mode === "loading") && (
        <div style={{
          position: "relative", height: "100%",
          display: "flex", flexDirection: "column",   // v31-fix: flex column so inner `flex: 1` resolves; without this the chart container collapses to 0 height
        }}>
          {/* v31-fix: keep chart container mounted during loading too. Going
              running→loading→running unmounts the container, which makes
              chartRef.current=null when the chart-init effect re-fires from
              the chartKey bump — init bails, then no further re-fire happens
              when running mounts again. Loading bar overlays this block via
              {mode === "loading" && ...} below.                            */}
          {/* Configuration button — top-right corner */}
          <button type="button" onClick={() => setPopupOpen(true)}
            style={{
              position: "absolute", top: 8, right: 8, zIndex: 50,
              padding: "5px 10px", background: "#0a0a0a", color: "#999",
              border: "1px solid #333", fontFamily: "'Courier New', Consolas, monospace",
              fontSize: 9, letterSpacing: "1.5px", fontWeight: 700, cursor: "pointer",
            }}>⚙ CONFIGURATION</button>

    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, minHeight: 0 }}>
      {/* v28: REGIME BAR (macro + micro). v28 also passes playTime so the
          pills follow the playhead instead of showing "now". */}
      {asset && appliedConfig?.layers?.regime?.enabled && (
        <div style={{
          display: (appliedConfig.layers.regime.top_bar && showRegime) ? "block" : "none"
        }}>
          <RegimeBar
            selectedTicker={asset}
            onRegimeHistory={setRegimeHistory}
            playTime={playTime || null}
            forceMacroOn={true}
            forceMicroOn={true}
          />
        </div>
      )}

      {/* v31: inline strip — show/hide chips for chosen layers + GBM/MJD/BATES + MAX CONES */}
      <ReplayInlineStrip
        appliedConfig={appliedConfig}
        visibility={{
          weekly:    showWeekly,
          monthly:   showMonthly,
          quarterly: showQuarterly,
          bands:     showBands,
          regime:    showRegime,
          gbm:       models.gbm?.on,
          mjd:       models.mjd?.on,
          bates:     models.bates?.on,
        }}
        onVisibility={(key, val) => {
          switch (key) {
            case "weekly":    setShowWeekly(val); break;
            case "monthly":   setShowMonthly(val); break;
            case "quarterly": setShowQuarterly(val); break;
            case "bands":     setShowBands(val); break;
            case "regime":    setShowRegime(val); break;
            case "gbm":       setModels(m => ({ ...m, gbm:   { ...m.gbm,   on: val } })); break;
            case "mjd":       setModels(m => ({ ...m, mjd:   { ...m.mjd,   on: val } })); break;
            case "bates":     setModels(m => ({ ...m, bates: { ...m.bates, on: val } })); break;
            default: /* no-op */ break;
          }
        }}
        maxCones={maxCones}
        onMaxCones={setMaxCones}
      />

      {/* Chart */}
      <div ref={containerRef} key={chartKey} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {!asset && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.muted, fontSize: 11, fontFamily: mono, letterSpacing: "1.5px",
          }}>
            + SELECT TICKER TO BEGIN REPLAY
          </div>
        )}
        {asset && (() => {
          // v26 TEMP DIAG — on-chart overlay. Screenshot-friendly state dump.
          //     Remove once the EURUSD cone-render investigation is resolved.
          const playDate = playTime > 0 ? new Date(playTime * 1000).toISOString().replace("T", " ").slice(0, 16) : "—";
          const on = (b) => b ? "on" : "off";
          const q = quarterlyVisible;
          return (
            <div style={{
              position: "absolute", top: 8, left: 8, zIndex: 50,
              background: "rgba(0,0,0,0.78)", border: "1px solid #333",
              padding: "6px 8px", fontSize: 9.5, fontFamily: mono,
              color: "#ddd", letterSpacing: "0.3px", lineHeight: 1.45,
              pointerEvents: "none", maxWidth: 360,
            }}>
              <div style={{ color: "#ff6d00", fontWeight: 800, letterSpacing: "1px", marginBottom: 3 }}>
                v26 DIAG · {asset || "—"}
              </div>
              <div>playTime: <span style={{ color: "#fff" }}>{playDate}</span> ({playTime})</div>
              <div>bars={bars.length} timeAxis={timeAxis.length} counter={visibleAnchorCount} totalAnchors={debugStats.totalAnchorsInData}</div>
              <div>mapEntries={debugStats.mapEntries} visible=<span style={{ color: debugStats.seriesVisible > 0 ? "#2ebd59" : "#e8383b" }}>{debugStats.seriesVisible}</span> hidden={debugStats.seriesHidden} errors={debugStats.applyErrors}</div>
              <div>models: G:{on(models.gbm.on)} M:{on(models.mjd.on)} B:{on(models.bates.on)}</div>
              <div>buckets: W:{on(showWeekly)} M:{on(showMonthly)} Q:{on(showQuarterly)} B:{on(showBands)} maxCones={maxCones}</div>
              <div>
                Qsub: curr:{on(q.curr)} p1:{on(q.prev1)} p2:{on(q.prev2)} p3:{on(q.prev3)} p4:{on(q.prev4)} p5:{on(q.prev5)} p6:{on(q.prev6)} p7:{on(q.prev7)}
              </div>
              <div style={{ marginTop: 2, color: "#999" }}>top shown:</div>
              {debugStats.shownSample.length === 0 && (
                <div style={{ color: "#e8383b", paddingLeft: 6 }}>— none —</div>
              )}
              {debugStats.shownSample.map((a, i) => (
                <div key={i} style={{ paddingLeft: 6, color: "#fff" }}>
                  [{a.bucket}{a.quarterLabel ? "/" + a.quarterLabel : ""}] {a.dateStr}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Playback controls */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 10px", borderTop: `1px solid ${C.border}`,
        flexShrink: 0, background: C.bgPanel,
      }}>
        <button
          onClick={() => { if (bars.length) setPlaying(p => !p); }}
          disabled={bars.length === 0}
          style={{ ...btnStyle(playing, C.green), padding: "5px 14px", fontSize: 11 }}
        >
          {playing ? "❚❚ PAUSE" : "▶ PLAY"}
        </button>

        <span style={{ fontSize: 9, color: C.muted }}>SPEED</span>
        {SPEEDS.map(s => (
          <button key={s} onClick={() => setSpeed(s)} style={btnStyle(speed === s, C.cyan)}>{s}×</button>
        ))}

        {/* v7: ± step buttons + scroll-wheel over slider for fine control */}
        <button
          onClick={() => { setPlaying(false); setPlayIdx(i => Math.max(0, i - 1)); }}
          disabled={bars.length === 0 || playIdx === 0}
          title="Step -1 bar"
          style={{ ...btnStyle(false), padding: "3px 8px", fontSize: 11 }}
        >−</button>
        <input
          type="range"
          min={0} max={Math.max(0, bars.length - 1)}
          value={playIdx}
          onChange={e => { setPlaying(false); setPlayIdx(Number(e.target.value)); }}
          onWheel={e => {
            if (bars.length === 0) return;
            e.preventDefault();
            setPlaying(false);
            const delta = e.deltaY < 0 ? 1 : -1;
            setPlayIdx(i => Math.max(0, Math.min(bars.length - 1, i + delta)));
          }}
          style={{ flex: 1, accentColor: C.orange, cursor: bars.length ? "pointer" : "default" }}
          disabled={bars.length === 0}
        />
        <button
          onClick={() => { setPlaying(false); setPlayIdx(i => Math.min(bars.length - 1, i + 1)); }}
          disabled={bars.length === 0 || playIdx >= bars.length - 1}
          title="Step +1 bar"
          style={{ ...btnStyle(false), padding: "3px 8px", fontSize: 11 }}
        >+</button>

        <span style={{ fontSize: 10, color: C.white, fontFamily: mono, minWidth: 100, textAlign: "right" }}>
          {currentDate}
        </span>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: mono, minWidth: 80, textAlign: "right" }}>
          {bars.length ? `${playIdx + 1}/${bars.length}` : "—"}
        </span>
        <span style={{ fontSize: 9, color: C.amber, fontFamily: mono, minWidth: 70, textAlign: "right" }}>
          {visibleAnchorCount} anchors
        </span>
      </div>
    </div>
        </div>
      )}

      {mode === "loading" && (
        // v31-fix: overlay the loading bar on top of the running content so
        //   the chart container stays mounted underneath.
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(10,10,10,0.92)",
        }}>
          <ReplayLoadingBar
            phase={loadPhase}
            error={loadError}
            onRetry={() => handleApply(appliedConfig)}
            onBack={() => { setMode("empty"); setLoadError(null); }}
          />
        </div>
      )}

      {popupOpen && (
        <ReplayConfigPopup
          assets={assets}
          onApply={handleApply}
          onCancel={() => setPopupOpen(false)}
        />
      )}
    </>
  );
}
