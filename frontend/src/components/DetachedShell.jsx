// version: v3
// v3 — Pass a stable `tabId` to MainChart (2026-05-11). MainChart v106
//      keys all per-chart persistence by `tabId` instead of `selectedTicker`;
//      without one, the detached window's chart would no-op all persistence.
//      A detached window shows one ticker at a time, so `"detached_" + ticker`
//      gives it stable per-ticker persistence (its own key namespace, distinct
//      from the main window's per-tab keys).
// v2 — Pass onChangeTicker prop to MainChart inside DetachedQuantPanel so
//      the chart's right-click "Change Ticker" submenu actually works in
//      detached windows. Was previously a no-op because the prop was
//      undefined, and MainChart's context menu callback short-circuits
//      via `onChangeTicker && onChangeTicker(t)` (line 6067 of MainChart).
//      The fix wires it to setSelectedTicker, mirroring the dropdown.
//      (2026-05-07)
/**
 * DetachedShell — renders a single page in a detached Electron window.
 *
 * Mount path:
 *   1. Electron main spawns a BrowserWindow with URL ?detached=<pageId>.
 *   2. The same React app loads.
 *   3. AnalyticalTerminal calls useDetachedMode(), gets pageId, and early-
 *      returns this component instead of the full app.
 *   4. This component renders only that page's content, wrapped in a 3px
 *      orange outline (the child-window mark).
 *   5. Right-click on the outline-only region opens SwapPageMenu, which
 *      hot-swaps the page without reload (URL updated to match).
 *
 * Each detached window has its OWN useTerminalData() instance — independent
 * data fetching, independent state from the main window.
 *
 * QUANT in v1 uses a simplified single-chart view (DetachedQuantPanel
 * below) rather than the full multi-chart QUANT block from main, to avoid
 * a heavy refactor of analytical_terminal.jsx. Future iteration can extract
 * the full multi-chart QUANT into a shared <QuantAnalysisPanel> component.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import useTerminalData from "../hooks/useTerminalData";
import FundamentalsPanel from "./FundamentalsPanel";
import MoneyFlowPanel from "./MoneyFlowPanel";
import OptionsPanel from "./OptionsPanel";
import StressLab from "./stress_lab/StressLab";
import LearningCenter from "./learning/LearningCenter";
import RegimeBar from "./RegimeBar";
import MainChart from "./MainChart";
import SwapPageMenu from "./SwapPageMenu";
import { THEMES, DARK } from "./theme";

const BORDER_COLOR = "#ff6d00";
const BORDER_WIDTH = 3;
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const PAGE_LABEL = {
  quant: "Quant Analysis",
  fundamental: "Fundamental",
  flow: "Money Flow",
  options: "Options Quant",
  stress: "Stress Lab",
  learn: "Learning Center",
};

export default function DetachedShell({ pageId, swapPage }) {
  const terminal = useTerminalData();
  const {
    assets: assetsMap,
    assetsArray,
    signals,
    lifecycle,
    weeklyState,
    fetchBars,
    config,
    serverStatus,
  } = terminal;

  const themeMode = config?._raw?.display?.theme || "dark";
  const C = THEMES[themeMode] || DARK;

  // MoneyFlowPanel (and similar) takes the array shape we used in main.
  const assetsData = assetsArray;

  // Set the document title to identify the window in the OS taskbar.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `Quantum Terminal — ${PAGE_LABEL[pageId] || pageId}`;
    }
  }, [pageId]);

  // ── Right-click on the outline region opens the swap menu ──
  const [swapMenu, setSwapMenu] = useState(null); // { x, y } | null
  const frameRef = useRef(null);

  const handleFrameContextMenu = useCallback((e) => {
    // Only fire when the click target IS the frame element itself, not
    // any of the inner page content. This way charts / panels keep their
    // own right-click semantics; only the orange outline opens the menu.
    if (e.target !== frameRef.current) return;
    e.preventDefault();
    setSwapMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSwapSelect = useCallback((newId) => {
    setSwapMenu(null);
    if (newId !== pageId) swapPage(newId);
  }, [pageId, swapPage]);

  // ── Page content ──
  let content;
  if (pageId === "fundamental") {
    content = <FundamentalsPanel />;
  } else if (pageId === "flow") {
    content = <MoneyFlowPanel assetsData={assetsData} />;
  } else if (pageId === "options") {
    content = <OptionsPanel />;
  } else if (pageId === "stress") {
    content = <StressLab />;
  } else if (pageId === "learn") {
    content = <LearningCenter />;
  } else if (pageId === "quant") {
    content = (
      <DetachedQuantPanel
        assetsMap={assetsMap}
        assetsArray={assetsArray}
        fetchBars={fetchBars}
        signals={signals}
        lifecycle={lifecycle}
        weeklyState={weeklyState}
        serverStatus={serverStatus}
        config={config}
        C={C}
      />
    );
  } else {
    content = (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: C.muted, fontSize: "10px",
        letterSpacing: "2px",
      }}>
        UNKNOWN PAGE: {String(pageId)}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      onContextMenu={handleFrameContextMenu}
      title={`Detached: ${PAGE_LABEL[pageId] || pageId} — right-click the orange border to switch pages`}
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        color: C.white,
        fontFamily: mono,
        // Orange "frame" rendered as an inset outline; this is the only
        // region that the SwapPageMenu can open from.
        outline: `${BORDER_WIDTH}px solid ${BORDER_COLOR}`,
        outlineOffset: -BORDER_WIDTH,
        padding: BORDER_WIDTH,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {content}
      </div>

      {swapMenu && (
        <SwapPageMenu
          x={swapMenu.x}
          y={swapMenu.y}
          currentPageId={pageId}
          onSelect={handleSwapSelect}
          onClose={() => setSwapMenu(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DetachedQuantPanel — simplified single-chart QUANT view for v1 detached
// windows. Has a ticker dropdown + RegimeBar + MainChart. The full multi-
// chart QUANT block remains exclusive to the main window.
// ─────────────────────────────────────────────────────────────────────────
function DetachedQuantPanel({
  assetsMap, assetsArray, fetchBars, signals, lifecycle, weeklyState,
  serverStatus, config, C,
}) {
  const tickers = useMemo(
    () => (assetsArray || []).map(a => a.ticker).filter(Boolean),
    [assetsArray]
  );
  const [selectedTicker, setSelectedTicker] = useState("");

  // Auto-select first ticker once data arrives
  useEffect(() => {
    if (!selectedTicker && tickers.length > 0) {
      setSelectedTicker(tickers[0]);
    }
  }, [selectedTicker, tickers]);

  const assetData = selectedTicker ? assetsMap?.get(selectedTicker) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Compact ticker selector */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        background: C.bgPanel,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <span style={{
          color: C.muted,
          letterSpacing: "1.5px",
          fontWeight: 700,
          fontSize: "9px",
        }}>
          TICKER:
        </span>
        <select
          value={selectedTicker}
          onChange={e => setSelectedTicker(e.target.value)}
          style={{
            background: C.bg,
            color: C.orange,
            border: `1px solid ${C.border}`,
            padding: "2px 8px",
            fontFamily: mono,
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "1px",
            cursor: "pointer",
          }}
        >
          {tickers.length === 0 && <option value="">— loading —</option>}
          {tickers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Regime bar */}
      {selectedTicker && (
        <div style={{ flexShrink: 0 }}>
          <RegimeBar
            selectedTicker={selectedTicker}
            weeklyState={weeklyState}
            assetData={assetData}
            onRegimeHistory={() => {}}
          />
        </div>
      )}

      {/* Single chart */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", display: "flex" }}>
        {selectedTicker ? (
          <MainChart
            isActive
            selectedTicker={selectedTicker}
            tabId={"detached_" + selectedTicker}
            assets={assetsMap}
            fetchBars={fetchBars}
            signals={signals}
            lifecycle={lifecycle}
            weeklyState={weeklyState}
            regimeHistory={null}
            onLog={() => {}}
            onChangeTicker={setSelectedTicker}
            executionStatus={{
              live_trading: config?._raw?.execution?.live_trading || false,
              provider_connected: serverStatus?.mt5Connected || false,
            }}
          />
        ) : (
          <div style={{
            margin: "auto",
            color: C.muted,
            fontSize: "10px",
            letterSpacing: "2px",
          }}>
            NO TICKERS LOADED YET
          </div>
        )}
      </div>
    </div>
  );
}
