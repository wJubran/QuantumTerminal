// version: v30
// v30 — The FEED status names the data source (Settings → DATA SOURCES):
//       MT5 ● LINKED, FEED ● SIMULATED, or FEED ● YAHOO / BINANCE / OANDA /
//       ALPACA / CSV, with its full name on hover.
// v29 — Open-source edition (Quantum Terminal). Header/footer branding is
//       "QUANTUM TERMINAL"; removed the subscription TierBadge, PRO badges
//       and the commercial User Messages inbox (its server does not exist in
//       the open-source build) — the Debug ⊡ button it had replaced is back.
//       With no analysis data server configured (the open-source default)
//       the status reads SERVER ○ NONE / ○ LOCAL DATA instead of an error.
// v28 — User Messages inbox (2026-05-13). Added MessagesButton (envelope ✉
//       chrome button, replacing the Debug ⊡ button visually) + MessagesModal
//       + useUserMessages hook. Unread badge (red dot), shake animation on new
//       arrival, bulk mark-all-read on modal close. DebugPanel infrastructure
//       (showDebug, setShowDebug, debugLogs, <DebugPanel>, DebugPanel import)
//       preserved in full as dormant — only the chrome button was swapped.
// v27 — Per-tab chart state (2026-05-11). Each chart tab gets a stable
//       UUID (tabId) at creation, persisted in _open_charts. The per-chart
//       localStorage bundle moved to "mk_chart_tab_settings_v1" keyed by
//       tabId; _chart_states keyed by tabId; <MainChart> gets a tabId prop.
//       Migration: on first restore, old per-ticker localStorage
//       (mk_chart_ticker_settings_v1, mk_chart_style_${ticker},
//       mk_chart_drawings_${ticker}) is best-effort-copied into the new
//       per-tab keys. Spec: docs/specs/2026-05-11-per-tab-chart-state-and-templates-design.md.
// v26 — Removed the temporary [CHARTPERSIST] debug instrumentation (2026-05-11).
// v24 — Chart-state persistence rework (2026-05-11). Single source of
//       truth = the per-chart localStorage bundle (mk_chart_ticker_settings_v1);
//       the workspace profile seeds it at login and mirrors it back at
//       safe moments. (1) Deleted the setTimeout(500ms) → applySettings
//       race in startup-restore and loadProfile — that was overwriting
//       freshly-hydrated chart state. (2) On login / loadProfile, seed
//       localStorage from _chart_states BEFORE mounting chart tabs
//       (profile wins; unrelated tickers untouched) via
//       seedChartLocalStorage(). (3) handleTabSwitch / saveWorkspaceState /
//       saveProfile now build _chart_states from the localStorage bundle
//       (buildChartStatesFromBundle) instead of getSettings()-on-refs, so
//       it can never be written as {} when charts are unmounted.
//       applySettings survives only for explicit "Load Profile". Spec:
//       docs/specs/2026-05-11-chart-state-persistence-architecture-design.md.
// v23 — Wired F-key shortcut to chart fit-content (2026-05-08). Calls
//       chartRef.current.fitChart() — newly exposed on MainChart's
//       imperative handle (v97). Mirrors v1's browser-mode "press F to
//       fit" muscle memory.
// v22 — Chart-divider drag clamp tightened (2026-05-08). Operator reported
//       that dragging the chart all the way down pushed the resize handle
//       off-screen, requiring an app restart. The v17 clamp used a 60 px
//       buffer (window.innerHeight - 60) which only accounted for the
//       footer + ChartTabBar but missed the top-nav row (~40), the tabs
//       row (~30), and the RegimeBar (~30 when a ticker is selected) —
//       totaling ~100 px ABOVE the chart wrapper. Bumping the buffer to
//       150 px keeps the handle comfortably in view at maximum drag
//       depth. Chart can still be very tall; users just can't drag the
//       handle into oblivion. Single-line change at onResizeStart's
//       clamp expression.
// v21 — AssetPicker no longer blocks already-open tickers (2026-05-07).
//       Operator wants multiple chart windows of the same asset for
//       different perspectives (different timeframes, different layers,
//       etc.). Removed the `isOpen` gate in AssetPicker's option list:
//       click is always enabled, no opacity dimming, no "already-open"
//       cursor lock. openChart() in analytical_terminal already supports
//       multiple charts on the same ticker (separate ids, no dedup).
// v20 — Conditional-render tab pattern (2026-05-07). Replaced 6 display:none
//       tab wrappers with {tab === "X" && <div>...</div>} so hidden tabs
//       truly unmount instead of staying mounted-but-invisible. Fixes the
//       "hidden tabs keep polling/rendering" issue (Hypothesis A) that
//       caused operator's reported per-second freezes — MainChart's
//       bands/cones effects no longer fire while on Stress Lab; StressLab's
//       30s polling no longer fires while on Chart. Single-file mechanical
//       change. State persistence: per-ticker chart settings already round-
//       trip via saveCurrentSettings → backend → ticker-restore effect, so
//       chart settings survive tab switches. Visible time range resets to
//       chart default on remount (acceptable for v20 test). Quant→Replay
//       (line 1372) was already conditional; assets list stub at 1377 left
//       alone (Rule C9).
// v19 — viewMode now supports three explicit grid layouts:
//       "tile-1x2", "tile-2x1", "tile-2x2" (replacing legacy "tile"
//       which auto-picked cols by chart count). Legacy stored value
//       "tile" is migrated to "tile-2x2" on read so old profiles open
//       without surprise. New helper getGridSpec(mode, count) is the
//       single source of truth for "is this a tile mode" + the cols/rows.
/**
 * analytical_terminal.jsx — Quantum Terminal
 * ═════════════════════════════════════════════════════
 *
 * v15 — Detach-tab feature. Right-click any top-nav tab opens a
 *       TabContextMenu with "Open in New Window" → spawns a child
 *       Electron window via window.mkElectron.openInNewWindow(pageId).
 *       The child window loads the same React app with ?detached=<id>;
 *       useDetachedMode reads the URL and the new wrapper above
 *       MainTerminal early-returns DetachedShell instead of the full
 *       app. Right-click the orange child-window border to hot-swap
 *       which page it shows. URL stays in sync via history.replaceState
 *       so Ctrl+R preserves the page.
 *
 * v2 — Replaced the static "GBM+MJD+GARCH+HMM+OU" header blurb with a
 *      tier badge (removed in v29 — everything is free).
 *
 * v3 — Removed the "performance" tab from the nav. Tab content + import of
 *      PerformanceDashboard kept in place for easy restore.
 *
 * v4 — Default chart height now stretches to the existing drag-splitter max
 *      (window.innerHeight - 200) on mount, instead of the fixed 420px.
 *      Same clamp still applies when user drags.
 *
 * v5 — Added LIVE / REPLAY sub-tabs inside the QUANT ANALYSIS tab. LIVE keeps
 *      existing content (RegimeBar + MultiChart + QuantReport); REPLAY hosts
 *      the new ReplayView (historical cone playback).
 *
 * v6 — Top-bar polish: ⚙ settings button now bright white (was muted, hard
 *      to spot). ORDER button hidden (kept in code for easy restore).
 * Display-only terminal. Reads pre-computed data from server via data_sync_client.
 *
 * REMOVED FROM PRO (Rule C1 — no calculation triggers):
 *   - CalibrationDashboard import + tab
 *   - CALC ALL button + batch calculation logic
 *   - Orchestrator controls (WEEKLY/DAILY buttons)
 *   - Server restart button (dev-only)
 *   - AnchorStatusBadge (requires local calibration data)
 *   - onCalculate keyboard shortcut
 *   - GPU/CPU hardware labels (consumer doesn't run compute)
 *
 * ADDED FOR CONSUMER:
 *   - Data freshness status bar in footer (Rule C4)
 *   - Force refresh button (triggers data_sync_client re-sync)
 *   - Sync status indicators (offline mode, staleness)
 *
 * This file does NOT introduce any calculation triggers.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";
import useTerminalData from "./hooks/useTerminalData";
import MainChart from "./components/MainChart";
import { seedBundleFromChartStates } from "./components/chartPersistence";
// SignalPanel — removed in consumer (chart takes full width)
import RegimeBar from "./components/RegimeBar";
import SettingsPanel from "./components/SettingsPanel";
import DebugPanel, { createLogEntry } from "./components/DebugPanel";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";
import ChartTabBar from "./components/ChartTabBar";
import CloseConfirmDialog from "./components/CloseConfirmDialog";
import WorldClock from "./components/WorldClock";
import { getTimeInZone, DEFAULT_TIME_CONFIG } from "./components/time_utils";
import { ThemeProvider, THEMES, DARK } from "./components/theme";
// SystemMonitor — removed (consumer doesn't show local CPU/GPU stats)
import OrderTicket from "./components/OrderTicket";
// CalibrationDashboard — REMOVED (Rule C1: no calibration UI in consumer)
import OptionsPanel from "./components/OptionsPanel";
import PerformanceDashboard from "./components/PerformanceDashboard";
// AnchorStatusBadge — REMOVED (requires local calibration data)
import ExposureStrip from "./components/ExposureStrip";
import MoneyFlowPanel from "./components/MoneyFlowPanel";
import FundamentalsPanel from "./components/FundamentalsPanel";
import ReplayView from "./components/ReplayView";
import StressLab from "./components/stress_lab/StressLab"; // v7: synthesis page
import LearningCenter from "./components/learning/LearningCenter"; // v10: reference docs
import UpdateAvailableModal from "./components/UpdateAvailableModal"; // v12: auto-prompt new release
import useAppVersion from "./hooks/useAppVersion";
import useDetachedMode from "./hooks/useDetachedMode"; // v15: detached-window URL routing
import DetachedShell from "./components/DetachedShell"; // v15: renders a single page when ?detached=<id>
import TabContextMenu from "./components/TabContextMenu"; // v15: right-click on top-nav tab
import { playSound } from "./utils/sounds";              // v18: audio alerts
// v8: Stress Lab hidden while DC is still validating the engine. Flip to
//     true here (and the tab + render block below light up again).
// v9: re-enabled — the StressLab component now gates internally on a
//     client-side beta whitelist (components/stress_lab/whitelist.js).
//     Non-whitelisted users see a "Coming Soon" panel, so it's safe to
//     expose the tab to everyone.
const STRESS_LAB_ENABLED = true;

// v19: derive grid layout from the viewMode string. Returns null for
//   "tabs" (single-chart mode), or { cols, rows } for any tile mode.
//   Legacy "tile" value (auto-cols by count) is treated as 2×2.
function getGridSpec(mode, count) {
  if (mode === "tile-1x2") return { cols: 2, rows: 1 };
  if (mode === "tile-2x1") return { cols: 1, rows: 2 };
  if (mode === "tile-2x2") return { cols: 2, rows: 2 };
  if (mode === "tile") {
    // Legacy auto-pick — kept so existing profiles still tile.
    const c = (count || 0) <= 4 ? 2 : 3;
    return { cols: c, rows: Math.max(1, Math.ceil((count || 1) / c)) };
  }
  return null;
}

// v27: per-tab persistence. The bundle is keyed by tabId, not ticker.
const CHART_BUNDLE_KEY = "mk_chart_tab_settings_v1";          // was "mk_chart_ticker_settings_v1"
const OLD_TICKER_BUNDLE_KEY = "mk_chart_ticker_settings_v1";  // legacy — read once for migration

function newTabId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return "tab_" + crypto.randomUUID();
  } catch {}
  return "tab_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

// v27: best-effort migration of legacy per-ticker localStorage into the
// new per-tab keys, for the tabs being restored. Runs on restore; safe to
// call repeatedly (only fills tabId keys that don't already have data).
function migrateLegacyTickerDataToTabs(restoredTabs) {
  let oldBundle = {};
  try { oldBundle = JSON.parse(localStorage.getItem(OLD_TICKER_BUNDLE_KEY) || "{}"); } catch {}
  let newBundle = {};
  try { newBundle = JSON.parse(localStorage.getItem(CHART_BUNDLE_KEY) || "{}"); } catch {}
  let changed = false;
  for (const { tabId, ticker } of restoredTabs) {
    if (!tabId || !ticker) continue;
    if (newBundle[tabId] != null) continue;
    const old = oldBundle[ticker];
    if (old && typeof old === "object") { newBundle[tabId] = old; changed = true; }
    try {
      if (localStorage.getItem(`mk_chart_style_${tabId}`) == null) {
        const s = localStorage.getItem(`mk_chart_style_${ticker}`);
        if (s != null) localStorage.setItem(`mk_chart_style_${tabId}`, s);
      }
    } catch {}
    try {
      if (localStorage.getItem(`mk_chart_drawings_${tabId}`) == null) {
        const d = localStorage.getItem(`mk_chart_drawings_${ticker}`);
        if (d != null) localStorage.setItem(`mk_chart_drawings_${tabId}`, d);
      }
    } catch {}
  }
  if (changed) { try { localStorage.setItem(CHART_BUNDLE_KEY, JSON.stringify(newBundle)); } catch {} }
}

// v27: write a workspace's `_chart_states` into the per-tab localStorage
// bundle (and per-tab chartStyle/drawings keys) so MainChart hydrates from
// localStorage on mount. Chart-state wins on disagreement.
function seedChartLocalStorage(chartStates) {
  if (!chartStates || typeof chartStates !== "object") return;
  let bundle = {};
  try { bundle = JSON.parse(localStorage.getItem(CHART_BUNDLE_KEY) || "{}"); } catch {}
  const merged = seedBundleFromChartStates(bundle, chartStates);
  try { localStorage.setItem(CHART_BUNDLE_KEY, JSON.stringify(merged)); } catch {}
  for (const entry of Object.values(chartStates)) {
    if (!entry || typeof entry !== "object") continue;
    const { tabId, settings } = entry;
    if (!tabId || !settings || typeof settings !== "object") continue;
    try { if (settings.chartStyle != null) localStorage.setItem(`mk_chart_style_${tabId}`, JSON.stringify(settings.chartStyle)); } catch {}
    try { if (settings.drawings  != null) localStorage.setItem(`mk_chart_drawings_${tabId}`, JSON.stringify(settings.drawings)); } catch {}
  }
}

// v27: build a `_chart_states` map (keyed by tabId) from the per-tab
// localStorage bundle. Flush mounted charts first (getSettings() flushes
// their latest state to localStorage as a side effect), then read once.
function buildChartStatesFromBundle(openCharts, chartRefsMap) {
  for (const chart of openCharts) {
    const ref = chartRefsMap.current.get(chart.tabId);
    if (ref?.getSettings) { try { ref.getSettings(); } catch {} }
  }
  let bundle = {};
  try { bundle = JSON.parse(localStorage.getItem(CHART_BUNDLE_KEY) || "{}"); } catch {}
  const chartStates = {};
  for (const chart of openCharts) {
    chartStates[chart.tabId] = { tabId: chart.tabId, ticker: chart.ticker, settings: bundle[chart.tabId] || null };
  }
  return chartStates;
}


const C = {
  bg: "#000000", bgPanel: "#0a0a0a", bgCard: "#111111", bgHover: "#1a1a1a",
  border: "#222222", borderLt: "#333333",
  white: "#ffffff", gray: "#999999", muted: "#444444",
  orange: "#ff6d00", orangeDim: "#cc5500", orangeBg: "#ff6d0012",
  green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", amber: "#ffa500", cyan: "#00d2d3",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

// ── Cone color palette (matches forcaster Plotly report) ──
const CONE_STYLES = {
  gbm_prev:         { fill: "rgba(128,128,128,0.04)", sd: "rgba(128,128,128,0.35)", med: "rgba(128,128,128,0.8)",  dash: "",    label: "PREV GBM" },
  mjd_prev:         { fill: "rgba(255,193,7,0.03)",   sd: "rgba(255,193,7,0.30)",   med: "rgba(255,193,7,0.55)",   dash: "4,3", label: "PREV MJD" },
  gbm_curr:         { fill: "rgba(52,152,219,0.05)",  sd: "rgba(52,152,219,0.45)",  med: "rgba(52,152,219,0.9)",   dash: "",    label: "CURR GBM" },
  mjd_curr:         { fill: "rgba(255,193,7,0.04)",   sd: "rgba(255,193,7,0.35)",   med: "rgba(255,193,7,0.65)",   dash: "4,3", label: "CURR MJD" },
  gbm_now:          { fill: "rgba(39,174,96,0.06)",   sd: "rgba(39,174,96,0.50)",   med: "rgba(39,174,96,1.0)",    dash: "",    label: "NOW GBM" },
  mjd_now:          { fill: "rgba(255,165,0,0.05)",   sd: "rgba(255,165,0,0.45)",   med: "rgba(255,165,0,0.9)",    dash: "5,3", label: "NOW MJD" },
  gbm_extreme_high: { fill: "rgba(231,76,60,0.05)",   sd: "rgba(231,76,60,0.40)",   med: "rgba(231,76,60,0.9)",    dash: "",    label: "EXT HIGH" },
  mjd_extreme_high: { fill: "rgba(255,193,7,0.04)",   sd: "rgba(255,193,7,0.35)",   med: "rgba(255,193,7,0.7)",    dash: "4,3", label: "EXT HI MJD" },
  gbm_extreme_low:  { fill: "rgba(46,204,113,0.05)",  sd: "rgba(46,204,113,0.40)",  med: "rgba(46,204,113,0.9)",   dash: "",    label: "EXT LOW" },
  mjd_extreme_low:  { fill: "rgba(255,193,7,0.04)",   sd: "rgba(255,193,7,0.35)",   med: "rgba(255,193,7,0.7)",    dash: "4,3", label: "EXT LO MJD" },
};

const CONE_DRAW_ORDER = [
  "gbm_prev", "mjd_prev",
  "gbm_curr", "mjd_curr",
  "gbm_extreme_low", "mjd_extreme_low",
  "gbm_extreme_high", "mjd_extreme_high",
  "gbm_now", "mjd_now",
];

function syntheticCandles(bp, n=120) {
  const c=[]; let p=bp*(0.95+Math.random()*0.05);
  for(let i=0;i<n;i++){const v=bp>100?0.012:0.005;const o=p;const cl=o*(1+(Math.random()-0.48)*v);
  const h=Math.max(o,cl)*(1+Math.random()*v*0.5);const l=Math.min(o,cl)*(1-Math.random()*v*0.5);
  const d=new Date();d.setDate(d.getDate()-(n-i));c.push({t:d.toISOString().slice(0,10),o:+o.toFixed(5),h:+h.toFixed(5),l:+l.toFixed(5),c:+cl.toFixed(5)});p=cl;}return c;
}
function syntheticProj(lp,nP=48){const d=[],m=[],s1h=[],s1l=[],s2h=[],s2l=[];let med=lp;
for(let i=0;i<nP;i++){const sp=lp*0.002*Math.sqrt(i+1);med+=(Math.random()-0.48)*lp*0.001;
const dt=new Date();dt.setHours(dt.getHours()+i*4);d.push(dt.toISOString().slice(0,16).replace("T"," "));
m.push(+med.toFixed(5));s1h.push(+(med+sp).toFixed(5));s1l.push(+(med-sp).toFixed(5));
s2h.push(+(med+sp*1.65).toFixed(5));s2l.push(+(med-sp*1.65).toFixed(5));}
return{dates:d,median:m,sd1_high:s1h,sd1_low:s1l,sd2_high:s2h,sd2_low:s2l};}

function synthQuant(a){const s=Math.random;const strats=["FADE","BREAKOUT","NEUTRAL"];const regs=["calm","normal","stressed"];
const biases=["BULLISH","BEARISH","NEUTRAL"];const bv=a.class==="FX"?0.06+s()*0.08:0.12+s()*0.2;
const ouStrat=strats[~~(s()*3)];const reg=regs[~~(s()*3)];const bias=biases[~~(s()*3)];
const gV=0.08+s()*0.25;const sd1C=0.58+s()*0.2;const oHR=0.4+s()*0.3;const dH=0.45+s()*0.2;
const med=a.price*(1+(s()-0.48)*bv*0.1);
return{ticker:a.ticker,asset_class:a.class,decimals:a.decimals,price:a.price,
pct_change_1d:(s()-0.48)*2,pct_change_1w:(s()-0.45)*5,last_updated:new Date().toISOString(),
candles:syntheticCandles(a.price),
projections:{gbm_prev:syntheticProj(a.price*0.98),mjd_prev:syntheticProj(a.price*0.98),
gbm_curr:syntheticProj(a.price*0.99),mjd_curr:syntheticProj(a.price*0.99),
gbm_now:syntheticProj(a.price),mjd_now:syntheticProj(a.price)},
ou:{strategy:ouStrat,half_life:3+s()*40,hurst:0.25+s()*0.5,dislocation_pct:(s()-0.5)*8,confidence:0.3+s()*0.6,theta:0.01+s()*0.05,adf_stationary:s()<0.5},
garch:{vol_current:gV,vol_forecast:gV*(0.85+s()*0.3),persistence:0.88+s()*0.1,half_life:5+s()*30,vol_regime:gV>0.2?"HIGH":gV>0.12?"ELEVATED":"NORMAL"},
hmm:{regime:reg,confidence:0.5+s()*0.45,vol_window:[21,63,126][~~(s()*3)],jump_multiplier:reg==="stressed"?1.5+s():0.8+s()*0.4},
cone:{bias,median_target:med,sd1_low:a.price*(1-bv*0.04),sd1_high:a.price*(1+bv*0.04)},
risk:{var_95:-bv*0.03*a.price,var_99:-bv*0.05*a.price,cvar_95:-bv*0.039*a.price,upside_prob:40+s()*25,skewness:(s()-0.5)*1.2},
wf:{model:s()>0.5?"GBM":"MJD",source:["w21","w63","adaptive","garch_gjr_blend"][~~(s()*4)],sd1_coverage:sd1C,direction_hit:dH},
ou_wf:{hit_rate:oHR,avg_pnl:(oHR-0.5)*4+(s()-0.5),fade_hit:0.4+s()*0.3,breakout_hit:0.4+s()*0.3,n_signals:20+~~(s()*80)},
kelly:{full_kelly:s()*0.3,half_kelly:s()*0.15,win_rate:0.4+s()*0.25,payoff_ratio:0.8+s()*1.5,confidence:["low","medium","high"][~~(s()*3)]}};}

// ═══ SPARKLINE ═══
function Sparkline({data,width=138,height=24,positive=true}){const ref=useRef(null);
useEffect(()=>{if(!data||data.length<2||!ref.current)return;const svg=d3.select(ref.current);svg.selectAll("*").remove();
const col=positive?C.green:C.red;const x=d3.scaleLinear().domain([0,data.length-1]).range([0,width]);
const y=d3.scaleLinear().domain(d3.extent(data)).range([height-1,1]);
svg.append("path").datum(data).attr("d",d3.area().x((_,i)=>x(i)).y0(height).y1(d=>y(d)).curve(d3.curveBasis)).attr("fill",col).attr("fill-opacity",0.07);
svg.append("path").datum(data).attr("d",d3.line().x((_,i)=>x(i)).y(d=>y(d)).curve(d3.curveBasis)).attr("fill","none").attr("stroke",col).attr("stroke-width",1);
svg.append("circle").attr("cx",x(data.length-1)).attr("cy",y(data[data.length-1])).attr("r",1.5).attr("fill",col);
},[data,width,height,positive]);return <svg ref={ref} width={width} height={height} style={{display:"block"}} />;}

// ═══ CANDLESTICK + ALL CONES CHART ═══
function CandleChart({ assetData, width = 720, height = 280 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!assetData?.candles || assetData.candles.length < 5 || !ref.current) return;
    const svg = d3.select(ref.current); svg.selectAll("*").remove();
    const m = { top: 8, right: 62, bottom: 22, left: 62 };
    const w = width - m.left - m.right, h = height - m.top - m.bottom;
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const candles = assetData.candles.slice(-80);
    const projections = assetData.projections || {};
    const dec = assetData.decimals || 2;

    let maxProjLen = 0;
    Object.values(projections).forEach(p => { if (p?.median) maxProjLen = Math.max(maxProjLen, p.median.length); });

    let allPrices = candles.flatMap(c => [c.h, c.l]);
    Object.values(projections).forEach(p => {
      if (p?.sd1_high) allPrices = allPrices.concat(p.sd1_high);
      if (p?.sd1_low)  allPrices = allPrices.concat(p.sd1_low);
    });
    const ext = d3.extent(allPrices);
    const pad = (ext[1] - ext[0]) * 0.08 || ext[0] * 0.001;

    const totalBars = candles.length + maxProjLen;
    const candleW = Math.max(1, Math.floor(w / totalBars) - 1);
    const x = d3.scaleLinear().domain([0, totalBars - 1]).range([0, w]);
    const y = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).range([h, 0]);

    y.ticks(6).forEach(t => {
      g.append("line").attr("x1",0).attr("x2",w).attr("y1",y(t)).attr("y2",y(t)).attr("stroke",C.border).attr("stroke-width",0.5);
      g.append("text").attr("x",w+5).attr("y",y(t)+3).attr("fill",C.muted).attr("font-size","8px").attr("font-family",mono).text(t.toFixed(dec));
    });

    const step = Math.max(1, Math.floor(candles.length / 6));
    candles.forEach((c, i) => { if (i % step === 0)
      g.append("text").attr("x",x(i)).attr("y",h+14).attr("fill",C.muted).attr("font-size","7px").attr("font-family",mono).attr("text-anchor","middle").text(c.t.slice(5));
    });

    candles.forEach((c, i) => {
      const isUp = c.c >= c.o;
      const col = isUp ? C.green : C.red;
      const bT = y(Math.max(c.o, c.c)), bB = y(Math.min(c.o, c.c));
      g.append("line").attr("x1",x(i)).attr("x2",x(i)).attr("y1",y(c.h)).attr("y2",y(c.l)).attr("stroke",col).attr("stroke-width",0.7);
      g.append("rect").attr("x",x(i)-candleW/2).attr("y",bT).attr("width",candleW).attr("height",Math.max(1,bB-bT))
        .attr("fill",isUp?"transparent":col).attr("stroke",col).attr("stroke-width",0.7);
    });

    if (maxProjLen > 0) {
      const sepX = x(candles.length - 0.5);
      g.append("line").attr("x1",sepX).attr("x2",sepX).attr("y1",0).attr("y2",h)
        .attr("stroke",C.orange).attr("stroke-width",0.8).attr("stroke-dasharray","4,3").attr("opacity",0.5);
      g.append("text").attr("x",sepX+4).attr("y",10).attr("fill",C.orange).attr("font-size","7px").attr("font-family",mono).attr("opacity",0.6).text("FORECAST →");
    }

    const offset = candles.length;
    const legendItems = [];

    CONE_DRAW_ORDER.forEach(key => {
      const proj = projections[key];
      if (!proj?.median || proj.median.length < 2) return;
      const style = CONE_STYLES[key];
      if (!style) return;
      const n = proj.median.length;

      g.append("path")
        .datum(d3.range(n))
        .attr("d", d3.area().x(i => x(offset + i)).y0(i => y(proj.sd1_low[i])).y1(i => y(proj.sd1_high[i])).curve(d3.curveBasis))
        .attr("fill", style.fill);

      [proj.sd1_high, proj.sd1_low].forEach(arr => {
        g.append("path")
          .datum(arr)
          .attr("d", d3.line().x((_, i) => x(offset + i)).y(d => y(d)).curve(d3.curveBasis))
          .attr("fill", "none").attr("stroke", style.sd).attr("stroke-width", 0.6)
          .attr("stroke-dasharray", style.dash || "3,3");
      });

      g.append("path")
        .datum(proj.median)
        .attr("d", d3.line().x((_, i) => x(offset + i)).y(d => y(d)).curve(d3.curveBasis))
        .attr("fill", "none").attr("stroke", style.med).attr("stroke-width", 1.5)
        .attr("stroke-dasharray", style.dash || "0");

      legendItems.push({ label: style.label, color: style.med, dash: style.dash });
    });

    const lastP = candles[candles.length - 1].c;
    g.append("rect").attr("x",-58).attr("y",y(lastP)-7).attr("width",54).attr("height",14).attr("fill",C.orange);
    g.append("text").attr("x",-31).attr("y",y(lastP)+3).attr("text-anchor","middle").attr("fill",C.bg)
      .attr("font-size","9px").attr("font-weight","700").attr("font-family",mono).text(lastP.toFixed(dec));

    legendItems.forEach((item, i) => {
      const lx = 6, ly = 6 + i * 10;
      g.append("line").attr("x1",lx).attr("x2",lx+14).attr("y1",ly).attr("y2",ly)
        .attr("stroke",item.color).attr("stroke-width",1.2).attr("stroke-dasharray",item.dash||"0");
      g.append("text").attr("x",lx+18).attr("y",ly+3).attr("fill",item.color).attr("font-size","6.5px").attr("font-family",mono).text(item.label);
    });

  }, [assetData, width, height]);
  return <svg ref={ref} width={width} height={height} style={{ display: "block", margin: "0 auto" }} />;
}

// ═══ QUANT REPORT PANEL ═══
function QuantReport({ data }) {
  if (!data) return null;
  const { ou, garch, hmm, cone, risk, wf, ou_wf, kelly } = data;
  const dec = data.decimals || 2;
  const V = ({ l, v, c = C.white }) => (
    <div style={{ padding: "1px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: C.muted, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{l}</span>
      <span style={{ color: c, fontSize: "10px", fontWeight: 600, fontFamily: mono }}>{v}</span>
    </div>
  );
  const Box = ({ title, accent = C.orange, children }) => (
    <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderTop: `2px solid ${accent}`, padding: "6px 8px" }}>
      <div style={{ fontSize: "7px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4, paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>{title}</div>
      {children}
    </div>
  );
  const ouC = ou?.strategy === "FADE" ? C.green : ou?.strategy === "BREAKOUT" ? C.red : C.gray;
  const regC = hmm?.regime === "calm" ? C.green : hmm?.regime === "stressed" ? C.red : C.orange;
  const biasC = cone?.bias === "BULLISH" ? C.green : cone?.bias === "BEARISH" ? C.red : C.gray;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 3, padding: "4px 0" }}>
      {ou && <Box title="OU Mean-Reversion" accent={ouC}>
        <V l="Strategy" v={ou.strategy} c={ouC} /><V l="Half-Life" v={`${(ou.half_life||0).toFixed(1)}d`} />
        <V l="Hurst" v={(ou.hurst||0).toFixed(3)} c={ou.hurst<0.45?C.green:ou.hurst>0.55?C.red:C.orange} />
        <V l="Dislocation" v={`${(ou.dislocation_pct||0)>=0?"+":""}${(ou.dislocation_pct||0).toFixed(2)}%`} c={Math.abs(ou.dislocation_pct||0)>2?C.red:C.gray} />
        <V l="Confidence" v={`${((ou.confidence||0)*100).toFixed(0)}%`} /><V l="Theta" v={(ou.theta||0).toFixed(4)} />
        <V l="ADF Stat" v={ou.adf_stationary?"YES":"NO"} c={ou.adf_stationary?C.green:C.red} />
      </Box>}
      {ou_wf && <Box title="OU Walk-Forward" accent={C.orange}>
        <V l="Hit Rate" v={`${((ou_wf.hit_rate||0)*100).toFixed(1)}%`} c={(ou_wf.hit_rate||0)>=0.55?C.green:(ou_wf.hit_rate||0)>=0.5?C.orange:C.red} />
        <V l="Avg PnL" v={`${(ou_wf.avg_pnl||0)>=0?"+":""}${(ou_wf.avg_pnl||0).toFixed(2)}%`} c={(ou_wf.avg_pnl||0)>=0?C.green:C.red} />
        <V l="Fade Hit" v={`${((ou_wf.fade_hit||0)*100).toFixed(1)}%`} />
        <V l="Breakout Hit" v={`${((ou_wf.breakout_hit||0)*100).toFixed(1)}%`} />
        <V l="Signals" v={ou_wf.n_signals||0} />
      </Box>}
      {hmm && <Box title="HMM Regime" accent={regC}>
        <V l="Regime" v={(hmm.regime||"?").toUpperCase()} c={regC} />
        <V l="Confidence" v={`${((hmm.confidence||0)*100).toFixed(0)}%`} c={(hmm.confidence||0)>0.7?C.green:C.orange} />
        <V l="Vol Window" v={hmm.vol_window||"—"} /><V l="Jump" v={`${(hmm.jump_multiplier||0).toFixed(2)}×`} />
      </Box>}
      {garch && <Box title="GARCH Volatility" accent={C.amber}>
        <V l="Current" v={`${((garch.vol_current||0)*100).toFixed(1)}%`} c={C.white} />
        <V l="Forecast" v={`${((garch.vol_forecast||0)*100).toFixed(1)}%`} c={(garch.vol_forecast||0)>(garch.vol_current||0)?C.red:C.green} />
        <V l="Regime" v={(garch.vol_regime||"NORMAL").toUpperCase()} c={garch.vol_regime==="HIGH"?C.red:garch.vol_regime==="ELEVATED"?C.orange:C.green} />
        <V l="Persist" v={`${((garch.persistence||0)*100).toFixed(0)}%`} /><V l="½Life" v={`${(garch.half_life||0).toFixed(1)}d`} />
      </Box>}
      {cone && <Box title="Cone Bias" accent={biasC}>
        <V l="Bias" v={cone.bias||"NEUTRAL"} c={biasC} /><V l="Median" v={(cone.median_target||0).toFixed(dec)} />
        <V l="SD1 Low" v={(cone.sd1_low||0).toFixed(dec)} c={C.green} /><V l="SD1 High" v={(cone.sd1_high||0).toFixed(dec)} c={C.red} />
      </Box>}
      {risk && <Box title="Risk Metrics" accent={C.red}>
        <V l="VaR 95" v={(risk.var_95||0).toFixed(dec)} c={C.red} /><V l="VaR 99" v={(risk.var_99||0).toFixed(dec)} c={C.red} />
        <V l="CVaR 95" v={(risk.cvar_95||0).toFixed(dec)} c={C.red} />
        <V l="Upside" v={`${(risk.upside_prob||50).toFixed(0)}%`} c={(risk.upside_prob||50)>55?C.green:(risk.upside_prob||50)<45?C.red:C.gray} />
        <V l="Skew" v={(risk.skewness||0).toFixed(3)} />
      </Box>}
      {wf && <Box title="WF Calibration" accent={C.gray}>
        <V l="Best" v={`${(wf.model||"GBM").toUpperCase()} / ${wf.source||"—"}`} c={C.orange} />
        <V l="SD1 Cov" v={`${((wf.sd1_coverage||0)*100).toFixed(1)}%`} c={Math.abs((wf.sd1_coverage||0)-0.682)<0.05?C.green:C.orange} />
        <V l="Dir Hit" v={`${((wf.direction_hit||0)*100).toFixed(1)}%`} c={(wf.direction_hit||0)>0.55?C.green:C.gray} />
      </Box>}
      {kelly && <Box title="Kelly Criterion" accent={C.cyan}>
        <V l="Full Kelly" v={`${((kelly.full_kelly||0)*100).toFixed(1)}%`} c={(kelly.full_kelly||0)>0.1?C.green:C.gray} />
        <V l="Half Kelly" v={`${((kelly.half_kelly||0)*100).toFixed(1)}%`} />
        <V l="Win Rate" v={`${((kelly.win_rate||0)*100).toFixed(1)}%`} c={(kelly.win_rate||0)>0.55?C.green:C.gray} />
        <V l="Payoff" v={`${(kelly.payoff_ratio||0).toFixed(2)}:1`} />
        <V l="Confidence" v={(kelly.confidence||"—").toUpperCase?.()||"—"} c={kelly.confidence==="high"?C.green:kelly.confidence==="medium"?C.orange:C.red} />
      </Box>}
    </div>
  );
}

// ═══ MONEY FLOW MAP — REMOVED (now imported as MoneyFlowPanel component) ═══

function Badge({text,color}){return <span style={{display:"inline-block",padding:"1px 5px",fontSize:"9px",fontWeight:700,background:`${color}15`,color,border:`1px solid ${color}35`,fontFamily:mono}}>{text}</span>;}

// ═══════════════════════════════════════════════════════
// MAIN TERMINAL (CONSUMER)
// ── Asset Picker (+) Button with Search Dropdown ──────────────────────────────
function AssetPicker({ assets, openCharts, onSelect, maxCharts }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setSearch("");
  }, [open]);

  // v21: openTickers no longer used to disable already-open rows; operator
  //      wants multiple windows of same ticker. Variable removed.
  const atMax = openCharts.length >= maxCharts;

  const filtered = assets.filter(a => {
    if (!search) return true;
    const q = search.toUpperCase();
    return a.ticker.includes(q) || (a.asset_class || "").includes(q);
  });

  const handleSelect = (ticker) => {
    onSelect(ticker);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Open new chart"
        style={{
          background: open ? `${C.orange}18` : "transparent",
          border: "none", borderLeft: `1px solid ${C.border}`,
          color: atMax ? C.muted : C.orange,
          cursor: atMax ? "default" : "pointer",
          padding: "0 12px", fontSize: 16, fontWeight: 700, fontFamily: mono,
          height: "100%", display: "flex", alignItems: "center",
        }}
        disabled={atMax}
      >+</button>

      {open && !atMax && (
        <div style={{
          position: "absolute", bottom: "100%", right: 0, zIndex: 300,
          background: C.bgPanel, border: `1px solid ${C.border}`,
          width: 220, maxHeight: 320, display: "flex", flexDirection: "column",
          boxShadow: "0 -4px 16px rgba(0,0,0,0.6)",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticker..."
              style={{
                width: "100%", background: C.bgCard, border: `1px solid ${C.border}`,
                color: C.white, padding: "4px 8px", fontSize: 10, fontFamily: mono,
                outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = C.orange}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: "12px 8px", fontSize: 9, color: C.muted, textAlign: "center", fontFamily: mono }}>
                No matches
              </div>
            )}
            {filtered.map(a => {
              return (
                <div
                  key={a.ticker}
                  onClick={() => handleSelect(a.ticker)}
                  style={{
                    padding: "5px 10px", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "transparent",
                    borderBottom: `1px solid ${C.border}05`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgCard; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.white, fontFamily: mono }}>{a.ticker}</span>
                    <span style={{ fontSize: 8, color: C.muted, marginLeft: 6, fontFamily: mono }}>{a.asset_class}</span>
                  </div>
                  <div style={{ fontSize: 9, fontFamily: mono, color: a.price > 0 ? C.white : C.muted }}>
                    {a.price > 0 ? (a.price > 100 ? Math.round(a.price) : a.price.toFixed(a.decimals || 2)) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// v15: Wrapper above MainTerminal — checks the URL for ?detached=<pageId>
//      and renders a clean single-page DetachedShell instead of the full
//      terminal when that param is present. Splitting wrapper / main keeps
//      hooks-call order stable (DetachedShell has its own useTerminalData,
//      MainTerminal has its own — neither runs hooks the other doesn't).
export default function AnalyticalTerminal() {
  const detached = useDetachedMode();
  if (detached.isDetached) {
    return <DetachedShell pageId={detached.pageId} swapPage={detached.swapPage} />;
  }
  return <MainTerminal />;
}

function MainTerminal() {
  // ── Live data from data_server.py ──
  const terminal = useTerminalData();
  const {
    assets: assetsMap, assetsArray, signals, lifecycle, weeklyState,
    syncStatus, serverStatus, fetchBars, getPrevPrice, refreshSync,
    config, configHook,
  } = terminal;
  // MetaTrader 5 keeps its MT5 ● LINKED status; any other source reads FEED ● <SOURCE>.
  const isMt5Feed = !serverStatus.simulated && (!serverStatus.feedType || serverStatus.feedType === "mt5");

  const themeMode = config?._raw?.display?.theme || "dark";
  const C = THEMES[themeMode] || DARK;

  // ── Local UI state ──
  const [expanded, setExpanded] = useState({});
  const [clock, setClock] = useState(new Date());
  const [tab, setTab] = useState("quant");
  // v15: right-click context menu on a top-nav tab — { x, y, pageId, pageLabel }
  const [tabContextMenu, setTabContextMenu] = useState(null);
  // v5: LIVE | REPLAY sub-tab inside the quant tab.
  const [quantSubTab, setQuantSubTab] = useState("live");
  const [filter, setFilter] = useState("ALL");
  const [chartHeight, setChartHeight] = useState(() =>
    typeof window !== "undefined" ? Math.max(150, window.innerHeight - 200) : 420
  );
  const [showSettings, setShowSettings] = useState(false);
  const [regimeHistory, setRegimeHistory] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showOrderTicket, setShowOrderTicket] = useState(false);
  const [tradeSignalData, setTradeSignalData] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const debugLogsRef = useRef([]);

  // ── Consumer: sync refresh state ──
  const [refreshing, setRefreshing] = useState(false);

  // v13: detect sync transition true → false so we can show a one-time
  //   "DOWNLOAD COMPLETE — REFRESH" prompt next to the SERVER status.
  const [showRefreshPrompt, setShowRefreshPrompt] = useState(false);
  const prevSyncInProgressRef = useRef(false);
  useEffect(() => {
    const now = !!syncStatus?.sync_in_progress;
    if (prevSyncInProgressRef.current && !now) {
      // Just finished — but only prompt if there was meaningful work
      // (manifest produced any files). Skips empty / cache-only ticks.
      if ((syncStatus?.sync_total || 0) > 0) {
        setShowRefreshPrompt(true);
      }
    }
    prevSyncInProgressRef.current = now;
  }, [syncStatus?.sync_in_progress, syncStatus?.sync_total]);

  // v14: compute live download speed from the byte-counter delta between
  //   two consecutive /api/sync/status polls. Frontend stays stateless
  //   except for the prev-sample ref. Skips zero/decreasing deltas (sync
  //   reset between polls).
  const [downloadSpeedBps, setDownloadSpeedBps] = useState(0);
  const prevSyncSampleRef = useRef({ bytes: 0, ts: 0 });
  useEffect(() => {
    const inProgress = !!syncStatus?.sync_in_progress;
    if (!inProgress) {
      setDownloadSpeedBps(0);
      prevSyncSampleRef.current = { bytes: 0, ts: 0 };
      return;
    }
    const bytesNow = syncStatus?.sync_bytes_total || 0;
    const tsNow    = Date.now();
    const prev     = prevSyncSampleRef.current;
    if (prev.ts > 0 && tsNow > prev.ts && bytesNow >= prev.bytes) {
      const dB = bytesNow - prev.bytes;
      const dT = (tsNow - prev.ts) / 1000;  // seconds
      if (dT > 0.1) {
        setDownloadSpeedBps(dB / dT);
      }
    }
    prevSyncSampleRef.current = { bytes: bytesNow, ts: tsNow };
  }, [syncStatus?.sync_bytes_total, syncStatus?.sync_in_progress]);

  // v14: human-friendly bytes-per-second formatter (KB/s, MB/s, GB/s).
  const formatSpeed = (bps) => {
    if (!bps || bps < 1) return "—";
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    if (bps < 1024 * 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
    return `${(bps / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  };

  // v12: auto-check for new installer on startup. /api/version is already
  //      served by version_info.py; hook reads it on mount.
  const appVersion = useAppVersion();

  // REMOVED: orchLastRuns, calcAllStatus, restartStatus (PRO-only — Rule C1)

  const addLog = useCallback((level, source, message) => {
    const entry = createLogEntry(level, source, message);
    debugLogsRef.current = [...debugLogsRef.current.slice(-499), entry];
    setDebugLogs(debugLogsRef.current);
  }, []);

  // ── Signal → Order flow ──
  const handleTradeSignal = useCallback((signalData) => {
    setTradeSignalData(signalData);
    setShowOrderTicket(true);
  }, []);

  const dragRef = useRef(null);

  // ════════════════════════════════════════════════════════
  // MULTI-CHART STATE (Phase 4B)
  // ════════════════════════════════════════════════════════
  const chartRefsMap = useRef(new Map());

  const [openCharts, setOpenCharts] = useState([]);
  const [activeChartId, setActiveChartId] = useState(null);   // v27: holds a tabId
  const [viewMode, setViewMode] = useState("tabs");
  const [closingChart, setClosingChart] = useState(null);

  const selectedTicker = useMemo(() => {
    if (!activeChartId || !openCharts.length) return null;
    const active = openCharts.find(c => c.tabId === activeChartId);
    return active?.ticker || null;
  }, [activeChartId, openCharts]);

  const maxCharts = config?.display?.max_charts || 8;

  const getActiveChartRef = useCallback(() => {
    if (!activeChartId) return null;
    return chartRefsMap.current.get(activeChartId) || null;
  }, [activeChartId]);

  const chartRef = useMemo(() => ({
    get current() { return getActiveChartRef(); },
  }), [getActiveChartRef]);

  const openChart = useCallback((ticker) => {
    setOpenCharts(prev => {
      if (prev.length >= maxCharts) {
        addLog("warn", "TABS", `Max charts (${maxCharts}) reached`);
        return prev;
      }
      const tabId = newTabId();
      setActiveChartId(tabId);
      return [...prev, { tabId, ticker }];
    });
  }, [maxCharts, addLog]);

  const closeChart = useCallback((chartId) => {
    setOpenCharts(prev => {
      const idx = prev.findIndex(c => c.tabId === chartId);
      if (idx === -1) return prev;
      const next = prev.filter(c => c.tabId !== chartId);
      chartRefsMap.current.delete(chartId);
      if (chartId === activeChartId && next.length > 0) {
        const newActiveIdx = Math.min(idx, next.length - 1);
        setActiveChartId(next[newActiveIdx].tabId);
      } else if (next.length === 0) {
        setActiveChartId(null);
      }
      return next;
    });
    setClosingChart(null);
  }, [activeChartId]);

  const switchTab = useCallback((chartId) => { setActiveChartId(chartId); }, []);

  const requestCloseChart = useCallback((chartId) => {
    const chart = openCharts.find(c => c.tabId === chartId);
    if (chart) setClosingChart(chart);
  }, [openCharts]);

  const cancelCloseChart = useCallback(() => { setClosingChart(null); }, []);
  const confirmCloseChart = useCallback(() => {
    if (closingChart) closeChart(closingChart.tabId);
  }, [closingChart, closeChart]);

  const updateChartTimeframe = useCallback((chartId, newTf) => {
    setOpenCharts(prev => prev.map(c =>
      c.tabId === chartId ? { ...c, timeframe: newTf } : c
    ));
  }, []);

  // v16: change a chart's ticker in place (right-click → Change Ticker).
  // If the chosen ticker is already open in another tab, switch to that tab
  // instead of duplicating it; otherwise rewrite the active chart's ticker.
  const changeChartTicker = useCallback((chartId, newTicker) => {
    if (!newTicker) return;
    setOpenCharts(prev => {
      const existing = prev.find(c => c.tabId !== chartId && c.ticker === newTicker);
      if (existing) {
        setActiveChartId(existing.tabId);
        return prev;
      }
      return prev.map(c =>
        c.tabId === chartId ? { ...c, ticker: newTicker } : c
      );
    });
  }, []);

  useEffect(() => {
    if (openCharts.length === 0 && assetsArray.length > 0) {
      const defaultTicker = assetsArray[0]?.ticker || "XAUUSD";
      const tabId = newTabId();
      setOpenCharts([{ tabId, ticker: defaultTicker }]);
      setActiveChartId(tabId);
    }
  }, [assetsArray, openCharts.length]);

  const setSelectedTicker = useCallback((ticker) => {
    const existing = openCharts.find(c => c.ticker === ticker);
    if (existing) setActiveChartId(existing.tabId);
  }, [openCharts]);

  // REMOVED: runCalcAll, cancelCalcAll (Rule C1 — no calculation triggers)
  // REMOVED: handleRestartServer (dev-only)

  // ── Consumer: Force data refresh ──
  const handleRefreshData = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    addLog("info", "SYNC", "Requesting data refresh from server...");
    try {
      await refreshSync();
      addLog("success", "SYNC", "Data refresh complete");
    } catch (e) {
      addLog("error", "SYNC", `Data refresh failed: ${e.message}`);
    }
    setRefreshing(false);
  }, [refreshing, refreshSync, addLog]);

  // ── Profile save/load with multi-chart state ──
  const profileHook = useMemo(() => {
    if (!configHook) return null;
    return {
      ...configHook,
      saveProfile: async (name) => {
        const chartStates = buildChartStatesFromBundle(openCharts, chartRefsMap);  // v27
        await configHook.updateConfig({
          _open_charts: openCharts.map(c => ({ tabId: c.tabId, ticker: c.ticker })),
          _active_chart_index: openCharts.findIndex(c => c.tabId === activeChartId),
          _chart_states: chartStates,
          _view_mode: viewMode,
          _last_profile: name,
        });
        return configHook.saveProfile(name);
      },
      loadProfile: async (name) => {
        const result = await configHook.loadProfile(name);
        const newConfig = configHook.configRef?.current;
        const raw = newConfig?._raw;

        if (raw?._open_charts && Array.isArray(raw._open_charts)) {
          const restored = raw._open_charts.map(c => {
            const tabId = c.tabId || newTabId();
            const existing = openChartsRef.current.find(ec => ec.tabId === tabId);
            return existing ?? { tabId, ticker: c.ticker };
          });
          // v27: migrate legacy per-ticker localStorage into per-tab keys
          //      FIRST, then seed from the profile's _chart_states (chart-
          //      state wins). Both happen BEFORE the tabs (re)mount so
          //      MainChart hydrates from localStorage.
          migrateLegacyTickerDataToTabs(restored);
          seedChartLocalStorage(raw._chart_states || {});

          setOpenCharts(restored);
          const activeIdx = raw._active_chart_index ?? 0;
          if (restored[activeIdx]) setActiveChartId(restored[activeIdx].tabId);
          if (raw._view_mode) setViewMode(raw._view_mode);
          // NOTE: no setTimeout → applySettings here anymore (v24). Charts
          //       hydrate from the just-seeded localStorage on mount.
        } else if (raw?._chart_state) {
          // Legacy single-chart snapshot — explicit profile load is the one
          // place applySettings() is still allowed.
          const ref = getActiveChartRef();
          if (ref?.applySettings) ref.applySettings(raw._chart_state);
        }
        return result;
      },
    };
  }, [configHook, openCharts, activeChartId, viewMode, getActiveChartRef]);

  const handleTabSwitch = useCallback((newTab) => {
    if (newTab === tab) return;
    if (configHook) {
      const chartStates = buildChartStatesFromBundle(openCharts, chartRefsMap);  // v27
      configHook.updateConfig({
        _open_charts: openCharts.map(c => ({ tabId: c.tabId, ticker: c.ticker })),
        _chart_states: chartStates,
        _view_mode: viewMode,
      }).catch(() => {});
    }
    setTab(newTab);
  }, [tab, configHook, openCharts, viewMode]);

  // ── Startup workspace restore ──
  const startupLoadDone = useRef(false);
  useEffect(() => {
    if (!config || !configHook || startupLoadDone.current) return;
    startupLoadDone.current = true;

    const lastProfile = config?._last_profile;
    if (lastProfile && profileHook?.loadProfile) {
      profileHook.loadProfile(lastProfile).catch(() => {});
    } else {
      const raw = configHook.configRef?.current?._raw || config;
      if (raw?._open_charts && Array.isArray(raw._open_charts) && raw._open_charts.length > 0) {
        const restored = raw._open_charts.map(c => {
          const tabId = c.tabId || newTabId();
          const existing = openChartsRef.current.find(ec => ec.tabId === tabId);
          return existing ?? { tabId, ticker: c.ticker };
        });
        // v27: migrate legacy per-ticker localStorage into per-tab keys
        //      FIRST, then seed from _chart_states. Both BEFORE mounting tabs.
        migrateLegacyTickerDataToTabs(restored);
        seedChartLocalStorage(raw._chart_states || {});

        setOpenCharts(restored);
        const activeIdx = raw._active_chart_index ?? 0;
        if (restored[activeIdx]) setActiveChartId(restored[activeIdx].tabId);
        if (raw._view_mode) setViewMode(raw._view_mode);
        // NOTE: no setTimeout → applySettings here anymore (v24).
      }
    }
  }, [!!config]);

  // ── Auto-save workspace ──
  const openChartsRef = useRef(openCharts);
  const viewModeRef = useRef(viewMode);
  openChartsRef.current = openCharts;
  viewModeRef.current = viewMode;

  const saveWorkspaceState = useCallback(() => {
    if (!configHook) return;
    const charts = openChartsRef.current;
    const chartStates = buildChartStatesFromBundle(charts, chartRefsMap);  // v27
    configHook.updateConfig({
      _open_charts: charts.map(c => ({ tabId: c.tabId, ticker: c.ticker })),
      _active_chart_index: charts.findIndex(c => c.tabId === activeChartId),
      _chart_states: chartStates,
      _view_mode: viewModeRef.current,
    }).catch(() => {});
  }, [configHook, activeChartId]);

  useEffect(() => {
    const onUnload = () => saveWorkspaceState();
    window.addEventListener("beforeunload", onUnload);
    const interval = setInterval(saveWorkspaceState, 60_000);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      clearInterval(interval);
    };
  }, [saveWorkspaceState]);

  // Clock tick
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  // REMOVED: fetchOrchLastRuns, fetchFreshness (PRO-only — consumer uses syncStatus)

  // ── Debug log emitters ──
  useEffect(() => { addLog("info", "TERM", "Terminal initialized"); }, []);

  const prevServerRef = useRef({});
  useEffect(() => {
    const prev = prevServerRef.current;
    if (prev.mt5Connected !== undefined && prev.mt5Connected !== serverStatus.mt5Connected) {
      addLog(serverStatus.mt5Connected ? "success" : "error", "MT5", serverStatus.mt5Connected ? "Connected" : "Disconnected");
    }
    if (prev.wsPrice !== undefined && prev.wsPrice !== serverStatus.wsPrice) {
      addLog(serverStatus.wsPrice ? "success" : "warn", "WS", serverStatus.wsPrice ? "Price feed connected" : "Price feed disconnected");
    }
    if (!prev.dataReady && serverStatus.dataReady) {
      addLog("success", "DATA", `Data ready — ${assetsArray.length} assets loaded`);
    }
    prevServerRef.current = { ...serverStatus };
  }, [serverStatus, addLog]);

  // REMOVED: orchStatus change tracking (consumer has no orchestrator)

  // ── Chart resize drag handler ──
  // v17: max clamp loosened to (window.innerHeight - 60) so the operator
  //      can drag the divider all the way down. The ExposureStrip is
  //      hidden automatically when the chart grows past the threshold
  //      (see the conditional render below) — drag past the threshold to
  //      hide it, drag back up to bring it back.
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = chartHeight;
    const onMove = (ev) => {
      const delta = ev.clientY - startY;
      // v22: 150 px buffer keeps the resize handle in view (covers top
      //      nav + tabs row + regime bar + own height + footer + safety).
      setChartHeight(Math.max(150, Math.min(window.innerHeight - 150, startH + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [chartHeight]);

  // v17: ExposureStrip auto-hides when the chart has been dragged past
  //      this threshold. ~120px of headroom is enough for the strip to
  //      render cleanly; any tighter and the layout overflows.
  const exposureVisible = (typeof window !== "undefined")
    ? chartHeight < window.innerHeight - 120
    : true;

  // v18: play a sound when MT5 connection state flips. Tracks the previous
  //      value via a ref so the FIRST observed value (typically false on
  //      app start before the first /api/health response) is silent.
  const prevMt5ConnRef = useRef(undefined);
  useEffect(() => {
    const curr = !!serverStatus?.mt5Connected;
    const prev = prevMt5ConnRef.current;
    if (prev === undefined) {
      prevMt5ConnRef.current = curr;
      return;
    }
    if (prev !== curr) {
      playSound(curr ? "connected" : "disconnected");
      prevMt5ConnRef.current = curr;
    }
  }, [serverStatus?.mt5Connected]);

  const assetsData = assetsArray;
  const payloadLoaded = serverStatus.dataReady && serverStatus.connected;

  const assets = filter==="ALL" ? assetsData : assetsData.filter(a => a.asset_class===filter);

  // ── Keyboard shortcuts (no onCalculate — Rule C1) ──
  const tickerList = useMemo(() => assets.map(a => a.ticker), [assets]);
  useKeyboardShortcuts({
    tickers: tickerList,
    selectedTicker,
    onSelectTicker: setSelectedTicker,
    onTimeframe: (tf) => chartRef.current?.setTimeframe?.(tf),
    onToggleBands: () => chartRef.current?.toggleBands?.(),
    onToggleSignals: () => chartRef.current?.toggleSignals?.(),
    onToggleCones: () => chartRef.current?.toggleAllCones?.(),
    onToggleAnchors: () => chartRef.current?.toggleAllAnchors?.(),
    onFitChart: () => chartRef.current?.fitChart?.(),  // v23
    // onCalculate — REMOVED (Rule C1: no calculation triggers in consumer)
    onEscape: () => { if (closingChart) { cancelCloseChart(); } else if (showOrderTicket) setShowOrderTicket(false); else if (showDebug) setShowDebug(false); else if (showSettings) setShowSettings(false); },
    enabled: tab === "quant",
  });

  // ── Staleness display helpers (Rule C4) ──
  // No analysis data server configured (the open-source default): show a
  // neutral status instead of an offline error.
  const noDataServer = syncStatus?.server_configured === false;
  const noDataServerHint = "No analysis data server configured — analysis overlays use local data files only";
  const hasDataDate = !!(syncStatus?.last_synced_at || (syncStatus?.analysis_date && syncStatus.analysis_date !== "N/A"));
  const stalenessColor = syncStatus?.staleness_level === "error" ? C.red
    : syncStatus?.staleness_level === "warning" ? C.amber
    : syncStatus?.staleness_level === "fresh" ? C.green
    : C.muted;

  return (
    <ThemeProvider mode={themeMode}>
    <div style={{ background: C.bg, color: C.white, fontFamily: mono, height: "100vh", fontSize: "12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* v12: auto-prompt when a new installer is available on the server. */}
      {appVersion.updateAvailable && !appVersion.loading && (
        <UpdateAvailableModal
          current={appVersion.current}
          latest={appVersion.latest}
          downloadUrl={appVersion.downloadUrl}
          bannerMessage={appVersion.bannerMessage}
        />
      )}
      {/* HEADER */}
      <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "5px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 6, height: 6, background: C.orange }} /><span style={{ fontWeight: 800, fontSize: "13px", color: C.orange, letterSpacing: "2px" }}>QUANTUM TERMINAL</span></div>
          <span style={{ color: C.muted, fontSize: "9px" }}>ANALYTICAL STATION</span><span style={{ color: C.muted }}>|</span>
          {payloadLoaded ? <span style={{fontSize:"7px",color:C.green,fontWeight:700,letterSpacing:"1px"}}>● LIVE</span>
            : <span style={{fontSize:"7px",color:C.orange,letterSpacing:"1px"}}>CONNECTING</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* ── Server & Data Status ── */}
          <span style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.5px" }}>SERVER</span>
          {noDataServer ? (
            <span title={noDataServerHint} style={{ fontSize: "8px", color: C.gray, fontWeight: 700 }}>○ NONE</span>
          ) : (
            <span style={{ fontSize: "8px", color: syncStatus?.offline_mode ? C.red : C.green, fontWeight: 700 }}>
              {syncStatus?.offline_mode ? "● OFFLINE" : "● ONLINE"}
            </span>
          )}

          {/* v13: download progress bar + post-sync REFRESH prompt */}
          {syncStatus?.sync_in_progress && (() => {
            const done = syncStatus?.sync_done || 0;
            const total = syncStatus?.sync_total || 0;
            const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
            return (
              <span title={total > 0 ? `Downloading ${done} / ${total}` : "Downloading…"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
                <span style={{ fontSize: 7.5, color: C.amber, fontWeight: 700, letterSpacing: "0.5px" }}>
                  ⬇ DOWNLOADING
                </span>
                <span style={{
                  position: "relative", width: 80, height: 6,
                  background: "#1a1a1a", border: `1px solid ${C.border}`, borderRadius: 1, overflow: "hidden",
                }}>
                  <span style={{
                    position: "absolute", inset: 0, width: `${pct}%`,
                    background: `linear-gradient(90deg, ${C.amber} 0%, ${C.orange} 100%)`,
                    transition: "width 0.4s linear",
                  }} />
                </span>
                <span style={{ fontSize: 7.5, color: C.amber, fontVariantNumeric: "tabular-nums", minWidth: 28 }}>
                  {total > 0 ? `${pct}%` : "…"}
                </span>
                {/* v14: live download speed */}
                <span style={{
                  fontSize: 7.5, color: C.muted, fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.5px", minWidth: 50, textAlign: "right",
                }}>
                  {formatSpeed(downloadSpeedBps)}
                </span>
              </span>
            );
          })()}
          {showRefreshPrompt && !syncStatus?.sync_in_progress && (
            <button
              onClick={() => { try { window.location.reload(); } catch {} }}
              title="New data downloaded — click to reload the page so all panels see the fresh data."
              style={{
                marginLeft: 6, background: `${C.green}25`,
                color: C.green, border: `1px solid ${C.green}80`,
                padding: "1px 8px", cursor: "pointer", borderRadius: 2,
                fontSize: "8px", fontWeight: 800, fontFamily: mono, letterSpacing: "1px",
              }}
            >
              ✓ DOWNLOAD COMPLETE · REFRESH
            </button>
          )}
          <span style={{color:C.border}}>|</span>
          <span style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.5px" }}>DATA</span>
          <span style={{ fontSize: "8px", color: hasDataDate ? stalenessColor : C.muted, fontWeight: 700 }}>
            {syncStatus?.last_synced_at || syncStatus?.analysis_date || "N/A"}
          </span>
          {syncStatus?.staleness_level === "warning" && <span style={{ fontSize: "7px", color: C.amber }}>⚠</span>}
          {syncStatus?.staleness_level === "error" && <span style={{ fontSize: "7px", color: C.red }}>⚠ STALE</span>}
          <span style={{color:C.border}}>|</span>
          <span style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.5px" }}>{isMt5Feed ? "MT5" : "FEED"}</span>
          <span title={serverStatus.simulated ? "Built-in simulated market — prices are not real"
                       : !isMt5Feed ? `${serverStatus.feedLabel || serverStatus.feedType} — change it in Settings → DATA SOURCES` : undefined}
            style={{ fontSize: "8px", color: serverStatus.simulated ? C.amber : serverStatus.mt5Connected ? C.green : C.red, fontWeight: 700 }}>
            {serverStatus.simulated ? "● SIMULATED"
              : isMt5Feed ? (serverStatus.mt5Connected ? "● LINKED" : "● NO LINK")
              : `${serverStatus.mt5Connected ? "●" : "○"} ${String(serverStatus.feedType).toUpperCase()}`}
          </span>
          <span style={{color:C.border}}>|</span>
          {(() => {
            const tc = config?._raw?.time || DEFAULT_TIME_CONFIG;
            const t = getTimeInZone(tc.mainTime || "local", tc.mainTimeOffset || 0);
            return (<>
              <span style={{color:C.orange,fontSize:"11px",fontVariantNumeric:"tabular-nums"}}>{t.timeStr}</span>
              <span style={{color:C.muted,fontSize:"9px"}}>{t.dateStr}</span>
            </>);
          })()}
          <WorldClock config={config?._raw?.time || DEFAULT_TIME_CONFIG} />
        </div>
      </div>

      {/* NAV — calibration tab removed (Rule C1) */}
      <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "0 12px", display: "flex", alignItems: "center" }}>
        {["quant","fundamental","flow","options", ...(STRESS_LAB_ENABLED ? ["stress"] : []), "learn"].map(id => {
          // Display label per tab (no PRO badges since v29 — every page is open to all).
          const label = id==="flow"?"money flow"
                     : id==="quant"?"quant analysis"
                     : id==="options"?"options quant"
                     : id==="performance"?"performance"
                     : id==="stress"?"stress lab"
                     : id==="learn"?"learn"
                     : id;
          return (
            <button
              key={id}
              onClick={()=>handleTabSwitch(id)}
              onContextMenu={(e) => { /* v15: right-click → open-in-new-window menu */
                e.preventDefault();
                setTabContextMenu({ x: e.clientX, y: e.clientY, pageId: id, pageLabel: label });
              }}
              style={{background:"transparent",border:"none",borderBottom:tab===id?`2px solid ${C.orange}`:"2px solid transparent",
              color:tab===id?C.orange:C.muted,padding:"8px 16px",cursor:"pointer",fontSize:"9px",fontWeight:700,fontFamily:mono,letterSpacing:"1.5px",textTransform:"uppercase",display:"inline-flex",alignItems:"center"}}>
              {label}
            </button>
          );
        })}

        {/* v5: LIVE / REPLAY sub-tabs — visible only when quant tab is active */}
        {tab === "quant" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 16, paddingLeft: 12, borderLeft: `1px solid ${C.border}` }}>
            {["live", "replay"].map(sid => (
              <button key={sid} onClick={() => setQuantSubTab(sid)} style={{
                background: quantSubTab === sid ? `${C.cyan}20` : "transparent",
                border: `1px solid ${quantSubTab === sid ? C.cyan + "50" : C.border}`,
                color: quantSubTab === sid ? C.cyan : C.muted,
                padding: "3px 10px", cursor: "pointer",
                fontSize: "8px", fontWeight: 700, fontFamily: mono, letterSpacing: "1.5px",
              }}>{sid.toUpperCase()}</button>
            ))}
          </div>
        )}
        <div style={{flex:1}} />
        {["ALL","FX","INDEX","COMMODITY"].map(cls=>(
          <button key={cls} onClick={()=>setFilter(cls)} style={{background:filter===cls?C.bgHover:"transparent",border:filter===cls?`1px solid ${C.orange}40`:"1px solid transparent",
            color:filter===cls?C.orange:C.muted,padding:"3px 8px",margin:"0 1px",cursor:"pointer",fontSize:"8px",fontWeight:700,fontFamily:mono,letterSpacing:"1px"}}>{cls}</button>))}

        {/* REMOVED: Orchestrator controls (Rule C1 — no calculation triggers) */}
        {/* REMOVED: CALC ALL button (Rule C1) */}

        {/* ── Consumer: Data-sync status pill + Refresh button (v9) ──
             The pill reflects background sync (started by the backend at
             launch) — user can tell at a glance when analytical
             data finishes downloading without ever being blocked. */}
        <div style={{width:1,height:16,background:C.border,margin:"0 8px"}} />
        {(() => {
          const syncing = refreshing || !!syncStatus?.sync_in_progress;
          const offline = !!syncStatus?.offline_mode;
          const staleErr = syncStatus?.staleness_level === "error";
          const staleWarn = syncStatus?.staleness_level === "warning";
          let label, color, bg, border;
          if (syncing)        { label = "⟳ SYNCING DATA"; color = C.orange; bg = `${C.orange}20`; border = `${C.orange}60`; }
          else if (noDataServer) { label = "○ LOCAL DATA"; color = C.gray;   bg = "transparent";  border = C.border; }
          else if (offline)   { label = "✕ OFFLINE";      color = C.red;    bg = `${C.red}15`;    border = `${C.red}50`; }
          else if (staleErr)  { label = "⚠ STALE";        color = C.red;    bg = `${C.red}15`;    border = `${C.red}50`; }
          else if (staleWarn) { label = "⚠ STALE";        color = C.amber;  bg = `${C.amber}18`;  border = `${C.amber}55`; }
          else                { label = "● DATA READY";   color = C.green;  bg = `${C.green}15`;  border = `${C.green}50`; }
          return (
            <span title={noDataServer && !syncing ? noDataServerHint : `Last sync: ${syncStatus?.last_synced_at || syncStatus?.analysis_date || "—"}`} style={{
              padding: "2px 8px", background: bg,
              border: `1px solid ${border}`,
              color, fontSize: "7px", fontWeight: 800, letterSpacing: "1.2px",
              fontFamily: mono, borderRadius: 2,
            }}>{label}</span>
          );
        })()}
        <button
          onClick={handleRefreshData}
          disabled={refreshing}
          title="Refresh analysis data from server"
          style={{
            background: refreshing ? `${C.orange}30` : "transparent",
            border: `1px solid ${refreshing ? C.orange : C.border}`,
            color: refreshing ? C.orange : C.muted,
            cursor: refreshing ? "default" : "pointer",
            padding: "2px 8px", marginLeft: 4,
            fontSize: "7px", fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
          }}
        >
          {refreshing ? "↻ SYNCING..." : "↻ REFRESH"}
        </button>

        <div style={{width:1,height:16,background:C.border,margin:"0 8px"}} />
        {/* v6: ORDER button hidden — flip false to true to restore. */}
        {false && <button onClick={() => setShowOrderTicket(true)} style={{
          background: showOrderTicket ? `${C.green}20` : "transparent",
          border: `1px solid ${showOrderTicket ? C.green + "50" : C.border}`,
          color: showOrderTicket ? C.green : C.muted, cursor: "pointer", padding: "2px 8px",
          fontSize: "10px", fontFamily: mono, fontWeight: 700,
        }}>ORDER</button>}
        {/* v6: settings gear in bright white for visibility */}
        <button onClick={() => setShowSettings(true)} title="Settings" style={{
          background: "transparent", border: `1px solid ${C.borderLt}`,
          color: C.white, cursor: "pointer", padding: "2px 8px",
          fontSize: "13px", fontFamily: mono, fontWeight: 700,
        }}>⚙</button>
        {/* Debug ⊡ — session log panel (DebugPanel) */}
        <button onClick={() => setShowDebug(v => !v)} title="Debug log" style={{
          background: "transparent", border: `1px solid ${C.border}`,
          color: showDebug ? C.white : C.muted, cursor: "pointer", padding: "2px 8px",
          fontSize: "13px", fontFamily: mono, fontWeight: 700,
        }}>⊡</button>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

        {/* REGIME BAR — v20: conditional render so RegimeBar unmounts off-tab */}
        {tab === "quant" && quantSubTab === "live" && selectedTicker && (
          <div>
            <RegimeBar
              selectedTicker={selectedTicker}
              weeklyState={weeklyState}
              assetData={selectedTicker ? assetsMap.get(selectedTicker) : null}
              onRegimeHistory={setRegimeHistory}
            />
          </div>
        )}

        {/* ════ MULTI-CHART AREA ════ */}
        {/* v20: conditional render so MainChart unmounts when not on Quant→Live. */}
        {(tab === "quant" && quantSubTab === "live") && (
        <div style={{ flex: `0 0 ${chartHeight}px`, minHeight: 150, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
            <div style={{
              flex: 1, overflow: "hidden", position: "relative",
              ...((() => {
                const spec = getGridSpec(viewMode, openCharts.length);
                if (!spec || openCharts.length <= 1) return {};
                return {
                  display: "grid",
                  gridTemplateColumns: `repeat(${spec.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${spec.rows}, minmax(0, 1fr))`,
                  gap: "1px", background: C.border, height: "100%",
                };
              })()),
            }}>
              {openCharts.map(chart => {
                const isActive = chart.tabId === activeChartId;
                const isTileMode = !!getGridSpec(viewMode, openCharts.length);
                return (
                  <div
                    key={chart.tabId}
                    onClick={() => { if (isTileMode) switchTab(chart.tabId); }}
                    style={{
                      ...(!isTileMode ? {
                        position: isActive ? "relative" : "absolute",
                        inset: 0,
                        display: isActive ? "block" : "none",
                        width: "100%", height: "100%",
                      } : {
                        position: "relative", overflow: "hidden",
                        background: C.bg,
                        border: isActive ? `2px solid ${C.orange}` : "2px solid transparent",
                        cursor: "pointer", minHeight: 0, minWidth: 0,
                      }),
                    }}
                  >
                    <MainChart
                      ref={(el) => {
                        if (el) chartRefsMap.current.set(chart.tabId, el);
                        else chartRefsMap.current.delete(chart.tabId);
                      }}
                      isActive={isActive}
                      tabId={chart.tabId}
                      selectedTicker={chart.ticker}
                      assets={assetsMap}
                      fetchBars={fetchBars}
                      signals={signals}
                      lifecycle={lifecycle}
                      weeklyState={weeklyState}
                      regimeHistory={regimeHistory}
                      onLog={addLog}
                      onTimeframeChange={(tf) => updateChartTimeframe(chart.tabId, tf)}
                      onChangeTicker={(t) => changeChartTicker(chart.tabId, t)}
                      compact={!!getGridSpec(viewMode, openCharts.length)}
                      onOrderClick={() => setShowOrderTicket(true)}
                      executionStatus={{
                        live_trading: config?._raw?.execution?.live_trading || false,
                        provider_connected: serverStatus?.mt5Connected || false,
                      }}
                    />
                  </div>
                );
              })}

              {openCharts.length === 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: "100%", color: C.muted, fontSize: "10px",
                  letterSpacing: "2px",
                }}>
                  SELECT A TICKER FROM THE LIST BELOW
                </div>
              )}
            </div>

            {/* SignalPanel — removed in consumer, chart takes full width */}
          </div>

          {/* Tab bar + Add chart button */}
          <div style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <ChartTabBar
                openCharts={openCharts}
                activeChartId={activeChartId}
                viewMode={viewMode}
                onSelectTab={switchTab}
                onCloseTab={requestCloseChart}
                onViewModeChange={setViewMode}
                maxCharts={maxCharts}
              />
            </div>
            <AssetPicker
              assets={assetsArray}
              openCharts={openCharts}
              onSelect={openChart}
              maxCharts={maxCharts}
            />
          </div>

          {/* Resize handle */}
          <div onMouseDown={onResizeStart} style={{
            height: 4, cursor: "row-resize", background: C.border,
            display: "block",
          }} />

          {/* v7: Exposure strip — account summary below chart, only in Quant
              Analysis → LIVE. Hidden on other tabs to keep focus clean.
              v17: also hidden when the chart has been dragged to (almost)
              full height — operator can reclaim the bottom space by
              pulling the divider down. Drag back up to bring it back. */}
          {exposureVisible && (
            <ExposureStrip priceMap={assetsMap} />
          )}
        </div>
        )}

        {/* v5: REPLAY sub-tab — historical cone playback */}
        {tab === "quant" && quantSubTab === "replay" && (
          <ReplayView assets={assetsMap} />
        )}

        {/* ASSET LIST — HIDDEN: users open charts via the (+) AssetPicker. Stub kept per Rule C9. */}
        <div style={{ flex: 1, overflowY: "auto", display: "none" }}>
          <div style={{ padding: "4px 6px" }}>
            {assets.map(a => {
              const ch = a.pct_change_1d || 0;
              const isExpanded = expanded[a.ticker];
              const hasOpenChart = openCharts.some(c => c.ticker === a.ticker);
              return (
                <div key={a.ticker} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <div
                    onClick={() => setExpanded(prev => ({ ...prev, [a.ticker]: !prev[a.ticker] }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "6px 8px",
                      cursor: "pointer",
                      background: isExpanded ? C.bgHover : "transparent",
                    }}
                  >
                    <span style={{ width: 6, height: 6, background: a.asset_class === "FX" ? C.cyan : a.asset_class === "INDEX" ? C.amber : C.orange, borderRadius: "50%", flexShrink: 0 }} />
                    <span style={{ width: 72, fontWeight: 700, fontSize: "11px", letterSpacing: "0.5px" }}>{a.ticker}</span>
                    <span style={{ width: 80, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{a.price?.toFixed(a.decimals || 2)}</span>
                    <span style={{ width: 60, textAlign: "right", color: ch >= 0 ? C.green : C.red, fontSize: "10px" }}>
                      {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                    </span>
                    <Sparkline data={a.candles?.slice(-30).map(c => c.c)} positive={ch >= 0} />
                    <Badge text={(a.hmm?.regime || "—").toUpperCase()} color={a.hmm?.regime === "calm" ? C.green : a.hmm?.regime === "stressed" ? C.red : C.orange} />
                    <Badge text={a.cone?.bias || "NEUTRAL"} color={a.cone?.bias === "BULLISH" ? C.green : a.cone?.bias === "BEARISH" ? C.red : C.gray} />
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); openChart(a.ticker); }}
                      disabled={openCharts.length >= maxCharts}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "3px 10px", marginLeft: 6,
                        background: hasOpenChart ? "transparent" : `${C.orange}22`,
                        border: `1px solid ${hasOpenChart ? C.border : `${C.orange}55`}`,
                        color: hasOpenChart ? C.muted : C.orange,
                        fontSize: "8px", fontWeight: 700, fontFamily: mono,
                        letterSpacing: "1px", cursor: "pointer",
                        opacity: openCharts.length >= maxCharts ? 0.4 : 1,
                      }}
                      title={hasOpenChart ? `Open another ${a.ticker} chart` : `Open ${a.ticker} in new chart tab`}
                    >
                      <span style={{ fontSize: "12px", lineHeight: 1 }}>+</span>
                      NEW CHART
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "4px 8px 8px" }}>
                      <CandleChart assetData={a} width={720} height={280} />
                      <QuantReport data={a} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {tab === "fundamental" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <FundamentalsPanel />
          </div>
        )}
        {tab === "flow" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}><MoneyFlowPanel assetsData={assetsData} /></div>
        )}
        {/* REMOVED: calibration tab (Rule C1) */}
        {tab === "performance" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <PerformanceDashboard serverUrl="" />
          </div>
        )}
        {tab === "options" && (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            <OptionsPanel />
          </div>
        )}
        {/* v7: Stress Lab — synthesis page. v8: gated by STRESS_LAB_ENABLED
             flag so its polling hooks don't run while the feature is hidden.
             v20: also gated on tab === "stress" via conditional render so
             the 30s polling intervals stop firing while on other tabs. */}
        {STRESS_LAB_ENABLED && tab === "stress" && (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            <StressLab />
          </div>
        )}
        {/* v10: Learning Center — reference docs + EN/AR toggle. No polling, no
             gating, available to every user as a self-serve help surface. */}
        {tab === "learn" && (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            <LearningCenter />
          </div>
        )}
      </div>

      {/* ═══ CONSUMER FOOTER — Server Status + Data Freshness (Rule C4) ═══ */}
      <div style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: "3px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "8px", color: C.muted }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span>QUANTUM TERMINAL{appVersion.current ? ` v${appVersion.current}` : ""}</span>
          <span style={{color:C.border}}>|</span>
          <span>{assetsData.length} ASSETS</span>
          <span style={{color:C.border}}>|</span>
          <span>{openCharts.length} CHART{openCharts.length !== 1 ? "S" : ""}</span>
          <span style={{color:C.border}}>|</span>
          <span>{serverStatus.simulated ? "SIM" : isMt5Feed ? "MT5" : String(serverStatus.feedType).toUpperCase()} {serverStatus.mt5Connected ? <span style={{color:serverStatus.simulated ? C.amber : C.green}}>●</span> : <span style={{color:C.red}}>●</span>}</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* ── Data freshness (Rule C4) ── */}
          {syncStatus?.offline_mode && !noDataServer && (
            <span style={{ color: C.amber, fontWeight: 700, letterSpacing: "1px" }}>
              ⚠ OFFLINE MODE — using cached data
            </span>
          )}
          {syncStatus?.staleness_level === "error" && !syncStatus?.offline_mode && (
            <span style={{ color: C.red, fontWeight: 700, letterSpacing: "0.5px" }}>
              ⚠ DATA STALE
            </span>
          )}
          {syncStatus?.staleness_level === "warning" && !syncStatus?.offline_mode && (
            <span style={{ color: C.amber, letterSpacing: "0.5px" }}>
              DATA MAY BE OUTDATED
            </span>
          )}
          <span style={{color:C.border}}>|</span>
          <span>
            Synced:{" "}
            <span style={{ color: stalenessColor, fontWeight: 700 }}>
              {syncStatus?.last_synced_at || syncStatus?.analysis_date || "N/A"}
            </span>
          </span>
          <span style={{color:C.border}}>|</span>
          <span>
            {syncStatus?.synced_tickers?.length || 0} synced
          </span>
          <span style={{color:C.border}}>|</span>
          <span>{serverStatus.dataReady ? "LIVE" : "CONNECTING..."}</span>
        </div>
      </div>

      {/* v15: right-click context menu on top-nav tab */}
      {tabContextMenu && (
        <TabContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          pageId={tabContextMenu.pageId}
          pageLabel={tabContextMenu.pageLabel}
          onClose={() => setTabContextMenu(null)}
        />
      )}

      {/* SETTINGS PANEL */}
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        configHook={profileHook || configHook}
        config={config}
      />

      {/* DEBUG PANEL */}
      <DebugPanel
        open={showDebug}
        onClose={() => setShowDebug(false)}
        logs={debugLogs}
      />

      {/* CLOSE CONFIRMATION DIALOG */}
      <CloseConfirmDialog
        chart={closingChart}
        onConfirm={confirmCloseChart}
        onCancel={cancelCloseChart}
      />

      {/* ORDER TICKET */}
      <OrderTicket
        isOpen={showOrderTicket}
        onClose={() => { setShowOrderTicket(false); setTradeSignalData(null); }}
        config={config?._raw || config}
        selectedTicker={selectedTicker}
        currentPrice={selectedTicker ? assetsMap.get(selectedTicker)?.price : null}
        priceMap={assetsMap}
        universe={assetsArray.map(a => a.ticker)}
        onLog={(entry) => addLog(entry.level, entry.source, entry.message)}
        signalData={tradeSignalData}
      />
    </div>
    </ThemeProvider>
  );
}