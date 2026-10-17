// version: v4
// v4 — Chart tabs are now identified by `tabId` (a stable UUID) instead of
//      `id` (a per-session counter that's been removed). analytical_terminal
//      v27 / MainChart v106 re-keyed per-chart state by tabId; the openCharts
//      entries passed in are { tabId, ticker } now. Using the old `chart.id`
//      meant undefined React keys (black chart on tab switch) and undefined
//      ids passed to onSelectTab/onCloseTab (couldn't switch or close tabs).
//      (2026-05-11)
// v3 — View-mode buttons (TABS · 1x2 · 2x1 · 2x2) removed (2026-05-07).
//      Operator now uses multiple Electron windows for multi-chart viewing
//      instead of in-window tile splitting. The tile-render code path in
//      analytical_terminal.jsx stays intact (viewMode state still exists,
//      defaults to "tabs"), so a future re-enable is just restoring this
//      file's button block. Chart count display kept on the right.
// v2 — single TILE button replaced with three layout-icon buttons:
//      "tile-1x2" (vertical split), "tile-2x1" (horizontal split),
//      "tile-2x2" (4 quadrants). Each button is a small SVG showing
//      how the screen is divided. Legacy "tile" mode is treated as
//      "tile-2x2" by analytical_terminal so old saved profiles still
//      open without surprise.
/**
 * ChartTabBar.jsx — Multi-Chart Tab Strip
 * Quantum Terminal | Phase 4B
 *
 * Displays open chart tabs with:
 *   - Ticker name + current timeframe per tab
 *   - Close (×) button per tab (triggers confirmation dialog)
 *   - Active tab highlight (orange top border)
 *   - View mode toggles: TABS · 1x2 · 2x1 · 2x2
 *   - Chart count indicator (e.g. "3/8")
 *
 * Pure presentational — all state mutations via props/callbacks.
 */
import { useCallback } from "react";

// ── Theme (must match analytical_terminal.jsx) ──
const C = {
  bg:       "#000000",
  bgPanel:  "#0a0a0a",
  bgCard:   "#111111",
  bgHover:  "#1a1a1a",
  border:   "#222222",
  borderLt: "#333333",
  white:    "#ffffff",
  gray:     "#999999",
  muted:    "#444444",
  orange:   "#ff6d00",
  orangeDim:"#cc5500",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

// v2: layout-mode buttons (1x2 / 2x1 / 2x2) — render a small square SVG
//   with the appropriate divider lines so the operator sees how the
//   chart area will be split.
function LayoutIcon({ kind }) {
  // Slightly inset rect (0.5..13.5) so the 1px stroke isn't clipped on
  // the SVG edges.
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" style={{ display: "block" }}>
      <rect x="0.5" y="0.5" width="13" height="13"
        fill="none" stroke="currentColor" strokeWidth="1.2" />
      {(kind === "1x2" || kind === "2x2") && (
        <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" />
      )}
      {(kind === "2x1" || kind === "2x2") && (
        <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  );
}

function LayoutBtn({ mode, current, onClick, title, children }) {
  const active = current === mode;
  return (
    <button
      onClick={() => onClick?.(mode)}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: "3px 6px",
        background: active ? `${C.orange}33` : "transparent",
        border: `1px solid ${active ? `${C.orange}66` : C.border}`,
        color: active ? C.orange : C.muted,
        cursor: "pointer",
        lineHeight: 0,  // strip extra vertical space around the SVG
      }}
    >{children}</button>
  );
}

export default function ChartTabBar({
  openCharts,       // [{ id, ticker, timeframe }]
  activeChartId,    // string — currently active chart id
  viewMode,         // "tabs" | "tile"
  maxCharts,        // number — configurable limit (default 8)
  onSelectTab,      // (chartId) => void
  onCloseTab,       // (chartId) => void — triggers confirmation dialog
  onViewModeChange, // (mode) => void
}) {
  const count = openCharts?.length || 0;
  const max = maxCharts || 8;

  const handleTabClick = useCallback((e, chartId) => {
    // Don't switch tab if clicking close button
    if (e.target.closest("[data-close-btn]")) return;
    onSelectTab?.(chartId);
  }, [onSelectTab]);

  const handleClose = useCallback((e, chartId) => {
    e.stopPropagation();
    onCloseTab?.(chartId);
  }, [onCloseTab]);

  if (!openCharts || count === 0) return null;

  return (
    <div style={{
      background: C.bgPanel,
      borderTop: `1px solid ${C.border}`,
      borderBottom: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "stretch",
      height: 30,
      fontFamily: mono,
      fontSize: "9px",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      {/* ── Chart tabs (scrollable if many) ── */}
      <div style={{
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        flex: 1,
        minWidth: 0,
      }}>
        {openCharts.map(chart => {
          const isActive = chart.tabId === activeChartId;
          return (
            <div
              key={chart.tabId}
              onClick={(e) => handleTabClick(e, chart.tabId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 12px",
                background: isActive ? C.bg : C.bgPanel,
                borderRight: `1px solid ${C.border}`,
                borderTop: isActive ? `2px solid ${C.orange}` : "2px solid transparent",
                cursor: "pointer",
                flexShrink: 0,
                maxWidth: 160,
                minWidth: 80,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.bgHover; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? C.bg : C.bgPanel; }}
            >
              <span style={{
                fontWeight: 700,
                color: isActive ? C.orange : C.gray,
                letterSpacing: "1px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {chart.ticker}
              </span>
              <span style={{
                fontSize: "7px",
                color: C.muted,
                flexShrink: 0,
              }}>
                {chart.timeframe || "M15"}
              </span>
              {/* Close button — only show if more than 1 tab */}
              {count > 1 && (
                <span
                  data-close-btn="true"
                  onClick={(e) => handleClose(e, chart.tabId)}
                  title="Close chart"
                  style={{
                    fontSize: "12px",
                    color: C.muted,
                    marginLeft: 2,
                    cursor: "pointer",
                    lineHeight: 1,
                    flexShrink: 0,
                    padding: "0 2px",
                    borderRadius: 2,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.white; e.currentTarget.style.background = `${C.border}`; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "transparent"; }}
                >
                  ×
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Right side controls ── */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {/* v3: View-mode buttons removed — operator uses multiple windows
            for multi-chart viewing. LayoutBtn / LayoutIcon helpers kept
            in this file for easy re-enable but no longer rendered. */}

        {/* Chart count */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          borderLeft: `1px solid ${C.border}`,
          height: "100%",
        }}>
          <span style={{
            fontSize: "8px",
            color: count >= max ? C.orange : C.muted,
            fontWeight: count >= max ? 700 : 400,
          }}>
            {count}/{max}
          </span>
        </div>
      </div>
    </div>
  );
}
