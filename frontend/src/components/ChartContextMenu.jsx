// version: v8
// v8 — The "Save State" item's onSaveState prop now returns string | null
//      (the name of a template that was also updated, or null). When it
//      returns a name, the green confirmation flash reads "Saved ✓ · <name>"
//      instead of just "Saved ✓". (2026-05-11; companion to MainChart v109.)
//
// v7 — New "Save State" item at the bottom of the menu (below Settings).
//      Manually triggers the parent's saveCurrentSettings() (same path
//      auto-save uses) so the operator has a force-write button when
//      they suspect state isn't sticking. On click, the row turns green
//      with a "Saved ✓" label for ~800 ms; the other 5 items dim and
//      become non-interactive during the flash; menu auto-closes after
//      the flash. New onSaveState prop. Spec:
//      docs/specs/2026-05-11-chart-save-state-context-menu-design.md.
//
// v6 — Reordered: Reset Chart moved to TOP, Settings moved to BOTTOM and
//      enabled. Settings now opens a chart-style modal owned by the
//      parent (MainChart.jsx). The `disabled` flag and `hint="soon"`
//      were dropped from the Settings item. Submenu y-offset math is
//      unchanged because Draw and Change Ticker remained at row indices
//      1 and 2 after the reorder (Reset Chart took row 0).
//
// v5 — The outside-close handler also listens for `scroll` (capture mode)
//      so the menu auto-closes when the page scrolls. But that listener
//      was firing for the ticker list's own internal scrolling, killing
//      the menu mid-scroll. Now we tag both submenu wrappers with
//      `data-mk-ctx-submenu` and the scroll/mousedown handlers ignore
//      events whose target is inside the menu OR a tagged submenu.
//
// v4 — Submenu mousedown now also calls
//      `e.nativeEvent.stopImmediatePropagation()` so the native
//      document-level outside-click listener (which closes the menu)
//      doesn't fire when the operator clicks a submenu item.
//      v2's `e.stopPropagation()` only affected React's synthetic event
//      tree; React 18 mounts on the root container and the native
//      document listener was firing regardless, unmounting the menu
//      before the React click handler ran.
//
// ChartContextMenu — right-click menu on the main chart.
//
// Items (v7 order):
//   1. Reset Chart    (calls onReset — equivalent to clicking the F button:
//                      fits last N candles, re-enables Y autoscale)
//   2. Draw           (submenu — picks a drawing tool from the same TOOLS list
//                      DrawingToolbar uses; F1..F11 shortcuts shown for parity)
//   3. Change Ticker  (submenu — searchable ticker list; calls onChangeTicker)
//   4. Refresh        (calls onRefresh — re-fetches bars without auth roundtrip)
//   5. Settings       (calls onSettings — opens the parent-owned ChartSettingsModal)
//   6. Save State     (v7 — calls onSaveState; menu item flashes green for ~800 ms
//                      before menu auto-closes)
//
// Closes on outside click / Esc / scroll. Submenus open to the right of the
// hovered item; if there's not enough horizontal room, they flip left.

import { useEffect, useMemo, useRef, useState } from "react";
import { TOOLS, FKEY_MAP } from "./DrawingToolbar";

const C = {
  bg:        "#0a0a0a",
  bgHover:   "#171717",
  border:    "#222222",
  borderLt:  "#333333",
  white:     "#ffffff",
  gray:      "#999999",
  muted:     "#666666",
  dim:       "#444444",
  orange:    "#ff6d00",
  green:     "#2ebd59",
  red:       "#e8383b",
  cyan:      "#00d2d3",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

function MenuItem({ icon, label, hint, hasSubmenu, disabled, isHover, onClick, onMouseEnter }) {
  const color = disabled ? C.dim : (isHover ? C.orange : C.white);
  return (
    <div
      onMouseEnter={onMouseEnter}
      onClick={disabled ? undefined : onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: isHover && !disabled ? C.bgHover : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
      }}
    >
      <span style={{
        width: 16, textAlign: "center",
        color: disabled ? C.dim : (isHover ? C.orange : C.gray),
        fontSize: 13,
      }}>{icon}</span>
      <span style={{
        flex: 1, color, fontSize: 11, fontWeight: 700,
        letterSpacing: "1px", fontFamily: mono,
        textTransform: "uppercase",
      }}>{label}</span>
      {hint && (
        <span style={{
          fontSize: 8, color: C.muted, fontFamily: mono,
          letterSpacing: "0.5px",
        }}>{hint}</span>
      )}
      {hasSubmenu && (
        <span style={{
          color: isHover ? C.orange : C.muted, fontSize: 10, lineHeight: 1,
        }}>▶</span>
      )}
    </div>
  );
}

// ── Draw submenu ─────────────────────────────────────────────────────────
function DrawSubmenu({ x, y, currentTool, onSelect }) {
  return (
    <div
      data-mk-ctx-submenu="draw"   // v5: tagged so outside-close ignores us
      onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
      style={{
        position: "fixed", left: x, top: y,
        background: C.bg, border: `1px solid ${C.borderLt}`,
        boxShadow: "0 6px 20px rgba(0,0,0,0.7)",
        padding: 4, minWidth: 250, zIndex: 1001,
        fontFamily: mono,
      }}>
      <div style={{
        padding: "6px 12px 8px", color: C.orange,
        fontSize: 8, letterSpacing: "1.5px", fontWeight: 800,
        borderBottom: `1px solid ${C.border}`, marginBottom: 4,
      }}>DRAWING TOOLS</div>
      {TOOLS.map(t => {
        if (t.key === "_sep") {
          return <div key="_sep" style={{
            height: 1, background: C.border, margin: "4px 8px",
          }} />;
        }
        const isActive = currentTool === t.key;
        const fkey = FKEY_MAP[t.key];
        const tColor = t.color || (isActive ? C.orange : C.white);
        return (
          <div key={t.key}
            onClick={() => onSelect(isActive ? null : t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 12px",
              background: isActive ? `${C.orange}18` : "transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = C.bgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isActive ? `${C.orange}18` : "transparent";
            }}
          >
            <span style={{
              width: 16, textAlign: "center",
              color: t.color || (isActive ? C.orange : C.gray),
              fontSize: 13,
            }}>{t.icon}</span>
            <span style={{
              flex: 1, color: isActive ? C.orange : tColor,
              fontSize: 9, fontWeight: 600, letterSpacing: "0.8px",
              fontFamily: mono,
            }}>{t.label}</span>
            {fkey && (
              <span style={{
                fontSize: 7, fontWeight: 700, letterSpacing: "0.5px",
                color: isActive ? C.orange : C.muted,
                padding: "1px 5px",
                border: `1px solid ${isActive ? `${C.orange}80` : C.borderLt}`,
                borderRadius: 2,
              }}>{fkey}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Change Ticker submenu ────────────────────────────────────────────────
function TickerSubmenu({ x, y, assets, currentTicker, onSelect }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  // Auto-focus the search box when the submenu opens
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);

  const tickers = useMemo(() => {
    if (!assets) return [];
    if (assets instanceof Map) return Array.from(assets.keys()).sort();
    if (Array.isArray(assets)) return assets.map(a => a.ticker || a).filter(Boolean).sort();
    return Object.keys(assets).sort();
  }, [assets]);

  const filtered = useMemo(() => {
    if (!query) return tickers;
    const q = query.toLowerCase();
    return tickers.filter(t => t.toLowerCase().includes(q));
  }, [tickers, query]);

  return (
    <div
      data-mk-ctx-submenu="ticker"   // v5: tagged so outside-close ignores us
      onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
      style={{
        position: "fixed", left: x, top: y,
        background: C.bg, border: `1px solid ${C.borderLt}`,
        boxShadow: "0 6px 20px rgba(0,0,0,0.7)",
        padding: 4, minWidth: 220, zIndex: 1001,
        fontFamily: mono, display: "flex", flexDirection: "column",
        maxHeight: 360,
      }}>
      <div style={{
        padding: "6px 12px 4px", color: C.orange,
        fontSize: 8, letterSpacing: "1.5px", fontWeight: 800,
      }}>CHANGE TICKER · {tickers.length}</div>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            onSelect(filtered[0]);
          }
        }}
        style={{
          margin: "4px 8px 6px", padding: "5px 8px",
          background: "#000", color: C.white,
          border: `1px solid ${C.border}`,
          fontFamily: mono, fontSize: 10,
          letterSpacing: "1px", outline: "none",
        }}
      />
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "12px 14px", color: C.muted, fontSize: 9,
            textAlign: "center", letterSpacing: "0.5px",
          }}>no match</div>
        ) : filtered.map(t => {
          const isCurrent = t === currentTicker;
          return (
            <div key={t}
              onClick={() => onSelect(t)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 12px",
                background: isCurrent ? `${C.orange}18` : "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) e.currentTarget.style.background = C.bgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isCurrent ? `${C.orange}18` : "transparent";
              }}
            >
              <span style={{
                width: 14, color: isCurrent ? C.orange : C.dim,
                fontSize: 9, textAlign: "center",
              }}>{isCurrent ? "●" : "○"}</span>
              <span style={{
                flex: 1, color: isCurrent ? C.orange : C.white,
                fontSize: 10, fontWeight: 700, letterSpacing: "1px",
                fontFamily: mono,
              }}>{t}</span>
              {isCurrent && (
                <span style={{
                  fontSize: 7, color: C.green, letterSpacing: "1px",
                }}>CURRENT</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main menu ────────────────────────────────────────────────────────────
export default function ChartContextMenu({
  x, y, currentTicker, currentTool, assets,
  onSelectDrawTool, onChangeTicker, onRefresh, onReset, onSettings, onSaveState, onClose,
}) {
  const ref = useRef(null);
  const [submenu, setSubmenu] = useState(null);
  // Hover index for the main menu list — used to highlight + decide submenu anchor.
  const [hoverItem, setHoverItem] = useState(null);
  // v7: brief green flash on "Save State" row before menu closes.
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedTplName, setSavedTplName] = useState(null);

  useEffect(() => {
    // v5: an event is "inside our UI" if its target lives in either the
    //   main menu (ref) or any submenu we've tagged with data-mk-ctx-submenu.
    //   Scrolls inside the ticker list, clicks on the submenu scrollbar,
    //   and submenu mousedowns are all therefore ignored.
    const isInside = (target) => {
      if (!target) return false;
      if (ref.current?.contains(target)) return true;
      try {
        if (typeof target.closest === "function" &&
            target.closest("[data-mk-ctx-submenu]")) return true;
      } catch {}
      return false;
    };
    const onMouseDown = (e) => { if (!isInside(e.target)) onClose(); };
    const onKey      = (e) => { if (e.key === "Escape") onClose(); };
    const onScroll   = (e) => { if (!isInside(e.target)) onClose(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Position clamping — H_EST grows with v3's extra "Reset Chart" item.
  const W = 220;
  const H_EST = 260;  // v7: +40 for the Save State row
  const adjX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1920) - W - 6);
  const adjY = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 1080) - H_EST - 6);

  // Submenu position — try right side of main menu; if no room, flip left.
  const subW = submenu === "ticker" ? 220 : 250;
  let subX = adjX + W + 4;
  if (subX + subW > (typeof window !== "undefined" ? window.innerWidth : 1920)) {
    subX = adjX - subW - 4;
  }
  // Submenu y: align to the row's vertical position (rough).
  const rowHeight = 36;
  const subYBase = adjY + 4;
  const submenuY = submenu === "draw"
    ? subYBase + rowHeight * 1
    : submenu === "ticker"
      ? subYBase + rowHeight * 2
      : subYBase;

  return (
    <>
      <div ref={ref} style={{
        position: "fixed", left: adjX, top: adjY,
        background: C.bg, border: `1px solid ${C.borderLt}`,
        boxShadow: "0 6px 20px rgba(0,0,0,0.7)",
        padding: 4, minWidth: W, zIndex: 1000,
        fontFamily: mono,
      }}>
        {/* v7: dim + freeze the standard items while the Save State row is flashing. */}
        <div style={savedFlash ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
          <MenuItem
            icon="⛶" label="Reset Chart" hint="fit · F"
            isHover={hoverItem === "reset"}
            onMouseEnter={() => { setHoverItem("reset"); setSubmenu(null); }}
            onClick={() => { onReset && onReset(); onClose(); }}
          />
          <MenuItem
            icon="✎" label="Draw" hasSubmenu
            isHover={hoverItem === "draw"}
            onMouseEnter={() => { setHoverItem("draw"); setSubmenu("draw"); }}
          />
          <MenuItem
            icon="◎" label="Change Ticker" hasSubmenu
            isHover={hoverItem === "ticker"}
            onMouseEnter={() => { setHoverItem("ticker"); setSubmenu("ticker"); }}
          />
          <MenuItem
            icon="↻" label="Refresh" hint="reload bars"
            isHover={hoverItem === "refresh"}
            onMouseEnter={() => { setHoverItem("refresh"); setSubmenu(null); }}
            onClick={() => { onRefresh && onRefresh(); onClose(); }}
          />
          <MenuItem
            icon="⚙" label="Settings"
            isHover={hoverItem === "settings"}
            onMouseEnter={() => { setHoverItem("settings"); setSubmenu(null); }}
            onClick={() => { onSettings && onSettings(); onClose(); }}
          />
        </div>
        {/* v7: Save State row — manual trigger for the parent's
            saveCurrentSettings(). On click, flashes green/"Saved ✓" for
            ~800 ms then auto-closes the menu. */}
        <div
          onMouseEnter={() => { setHoverItem("save_state"); setSubmenu(null); }}
          onClick={() => {
            if (savedFlash) return;
            const updatedTpl = (onSaveState && onSaveState()) || null;
            setSavedTplName(updatedTpl);
            setSavedFlash(true);
            setTimeout(() => { setSavedFlash(false); setSavedTplName(null); onClose(); }, 800);
          }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px",
            background: savedFlash
              ? `${C.green}25`
              : (hoverItem === "save_state" ? C.bgHover : "transparent"),
            cursor: savedFlash ? "default" : "pointer",
            userSelect: "none",
            transition: "background 0.12s",
          }}
        >
          <span style={{
            width: 16, textAlign: "center",
            color: savedFlash ? C.green : (hoverItem === "save_state" ? C.orange : C.gray),
            fontSize: 13,
          }}>{savedFlash ? "✓" : "💾"}</span>
          <span style={{
            flex: 1,
            color: savedFlash ? C.green : (hoverItem === "save_state" ? C.orange : C.white),
            fontSize: 11, fontWeight: 700,
            letterSpacing: "1px", fontFamily: mono,
            textTransform: "uppercase",
          }}>{savedFlash ? (savedTplName ? `Saved ✓ · ${savedTplName}` : "Saved ✓") : "Save State"}</span>
          {!savedFlash && (
            <span style={{
              fontSize: 8, color: C.muted, fontFamily: mono,
              letterSpacing: "0.5px",
            }}>force write</span>
          )}
        </div>
      </div>

      {submenu === "draw" && (
        <DrawSubmenu
          x={subX} y={submenuY}
          currentTool={currentTool}
          onSelect={(tool) => { onSelectDrawTool && onSelectDrawTool(tool); onClose(); }}
        />
      )}

      {submenu === "ticker" && (
        <TickerSubmenu
          x={subX} y={submenuY}
          assets={assets}
          currentTicker={currentTicker}
          onSelect={(ticker) => {
            if (onChangeTicker) onChangeTicker(ticker);
            onClose();
          }}
        />
      )}
    </>
  );
}
