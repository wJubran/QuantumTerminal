// version: v7
/**
 * RegimeBar.jsx — Macro + Micro HMM Regime Status Strip
 * Quantum Terminal | Display-Only (Rule C1)
 *
 * v7 — `forceMacroOn` / `forceMicroOn` props. When true, override the
 *      internal showMacro/showMicro toggles so the macro/micro payload
 *      flows to onRegimeHistory regardless of the in-bar button state.
 *      Used by ReplayView v31 — the popup hides RegimeBar's UI when only
 *      bg_shading or candle_color is chosen, so the user can't click the
 *      MACRO button manually. Forcing the toggle on lets the data still
 *      reach the chart's downstream regime renderers. Default false
 *      preserves existing MainChart / live behavior.
 *
 * v6 — Always-on liveMacroRegime / liveMicroRegime in the parent payload.
 *      Previously the payload was nulled out when neither MACRO nor
 *      MICRO was toggled on, which meant downstream consumers (the
 *      FOREST regime filter) couldn't read the asset's current micro
 *      regime unless the operator had clicked MICRO. Now the live
 *      regime is emitted regardless of the display toggles, and the
 *      per-layer macro/micro fields stay null when the layer is off
 *      (so the histogram + paint-candles paths see no change).
 *
 * v5 — Popover gains a SHOW ON CANDLES checkbox per layer. When ticked,
 *      the layer's payload to the parent carries `paintCandles: true`
 *      so MainChart drops the background histogram and repaints each
 *      candle body+wick with the regime color for that day. Toggling
 *      off restores the background-shading mode. Selection persists
 *      across sessions via localStorage.
 *
 * v4 — Accepts an optional `playTime` (unix seconds). When provided (e.g.
 *      replay mode), the pills display the regime that was active AT that
 *      time by looking it up in history.slow_d1, instead of the live
 *      slow.regime. Bars past the history tail show "no data". The fast
 *      IMMINENT/QUIET chip is hidden in playTime mode since fast.imminent
 *      is a now-only signal. In LIVE (no playTime passed) behavior is
 *      unchanged.
 *
 * v3 — Hooks into the `mk:data-sync-complete` DOM event so macro + micro
 *      refetch the instant a new cache file lands (cache watcher / periodic
 *      sync / refresh button), instead of waiting up to 60s for the next
 *      poll tick. Polling is kept as a safety net. Matches the pattern used
 *      by bars / cones / bands elsewhere in the terminal.
 *
 * v2 — Rebuilt against the DC HMM regime spec (terminal_regime_schema.md).
 *      Consumes two new endpoints:
 *        GET /api/regime/macro      → GLOBAL_macro_regime.json  (4-state daily)
 *        GET /api/regime/{ticker}   → GLOBAL_<lower>_regime.json (palette-adaptive
 *                                      slow D1 + fast M15 hazard)
 *      Replaces v1's legacy 3-state weekly_state + /api/regime_history path.
 *
 * Layout (single 24px row above the chart area):
 *   [REGIMES] CURRENT MACRO: [pill] · [TICKER] MICRO: [pill + fast chip] ·
 *   [◉ MACRO ▾] [◉ MICRO ▾]
 *
 * Each of MACRO / MICRO has:
 *   - A toggle button (click to show/hide on-chart shading; lit cyan when on)
 *   - A ▾ that opens a popover with:
 *       · Opacity slider (0.02 – 0.25)
 *       · One checkbox per state (palette-adaptive for MICRO based on
 *         slow.n_states_selected)
 *
 * Parent callback `onRegimeHistory` fires with a new shape:
 *   { macro: { data, enabled, opacity, hidden }, micro: { … } } or null.
 * MainChart consumes this to render the D1 background shading and the M15
 * hazard stripe.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

const C = {
  bg: "#000", bgPanel: "#0a0a0a", bgCard: "#111", bgHover: "#1a1a1a",
  border: "#222", borderLt: "#333",
  white: "#fff", gray: "#999", muted: "#444",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", cyan: "#00d2d3", teal: "#14b8a6", amber: "#ffa500",
};
const mono = "'Courier New', Consolas, monospace";

// ── Color maps (per DC spec, terminal_regime_schema.md §3 and §4) ──
const MACRO_STATES = ["GOLDILOCKS", "REFLATION", "STAGFLATION", "DEFLATION"];
const MACRO_COLORS = {
  GOLDILOCKS:  C.green,
  REFLATION:   C.blue,
  STAGFLATION: C.orange,
  DEFLATION:   C.red,
};

// Micro states by n_states_selected (always stress-ascending).
const MICRO_PALETTES = {
  2: ["calm", "stressed"],
  3: ["calm", "normal", "stressed"],
  4: ["calm", "normal_low", "normal_high", "stressed"],
  5: ["calm", "normal_low", "normal", "normal_high", "stressed"],
};
const MICRO_COLORS = {
  calm:        C.green,
  normal_low:  C.teal,
  normal:      C.blue,
  normal_high: C.orange,
  stressed:    C.red,
};
const MICRO_LABEL = {
  calm: "calm", normal_low: "normal-low", normal: "normal",
  normal_high: "normal-high", stressed: "stressed",
};

// ── Popover (used for both MACRO and MICRO) ──────────────────────────────
function RegimePopover({ title, titleColor, states, stateColors, stateLabels,
                        opacity, onOpacityChange, hidden, onToggleState,
                        paintCandles, onTogglePaintCandles, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
        background: C.bgCard, border: `1px solid ${C.borderLt}`, padding: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.7)", minWidth: 180,
        fontFamily: mono,
      }}>
      <div style={{ fontSize: 9, color: titleColor, fontWeight: 800, letterSpacing: "1.5px", marginBottom: 8 }}>
        {title}
      </div>

      {/* Opacity slider — disabled when "show on candles" is on, since the
          background layer is hidden in that mode. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, opacity: paintCandles ? 0.4 : 1 }}>
        <span style={{ fontSize: 8, color: C.gray, letterSpacing: "1px", minWidth: 48 }}>OPACITY</span>
        <input type="range" min={0.02} max={0.25} step={0.01}
          value={opacity} disabled={paintCandles}
          onChange={e => onOpacityChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: titleColor }} />
        <span style={{ fontSize: 9, color: C.white, minWidth: 28, textAlign: "right" }}>
          {(opacity * 100).toFixed(0)}%
        </span>
      </div>

      {/* v5: SHOW ON CANDLES — replaces background histogram with per-bar
          candle color override. */}
      <label style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
        cursor: "pointer", userSelect: "none",
        padding: "4px 6px",
        background: paintCandles ? `${titleColor}15` : "transparent",
        border: `1px solid ${paintCandles ? titleColor + "60" : C.border}`,
      }}>
        <input type="checkbox" checked={!!paintCandles}
          onChange={() => onTogglePaintCandles && onTogglePaintCandles(!paintCandles)}
          style={{ accentColor: titleColor, margin: 0 }} />
        <span style={{
          fontSize: 8, color: paintCandles ? titleColor : C.gray,
          letterSpacing: "1px", fontWeight: 800,
        }}>
          SHOW ON CANDLES
        </span>
      </label>

      {/* Per-state checkboxes */}
      <div style={{ fontSize: 8, color: C.muted, letterSpacing: "1px", marginBottom: 4 }}>
        STATES
      </div>
      {states.map(s => {
        const on = !hidden.has(s);
        const col = stateColors[s] || C.gray;
        return (
          <label key={s} style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 3,
            cursor: "pointer", userSelect: "none",
          }}>
            <input type="checkbox" checked={on}
              onChange={() => onToggleState(s)}
              style={{ accentColor: col, margin: 0 }} />
            <span style={{
              width: 8, height: 8, background: col, borderRadius: 1,
              display: "inline-block", opacity: on ? 1 : 0.25,
            }} />
            <span style={{
              fontSize: 9, color: on ? C.white : C.muted, letterSpacing: "1px",
              fontWeight: 700,
            }}>
              {(stateLabels[s] || s).toUpperCase()}
            </span>
          </label>
        );
      })}

      <button onClick={onClose}
        style={{
          width: "100%", marginTop: 6, background: "transparent",
          border: `1px solid ${C.border}`, color: C.gray,
          padding: "4px 8px", cursor: "pointer",
          fontSize: 8, fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
        }}>CLOSE</button>
    </div>
  );
}

// ── Pill (status badge) ─────────────────────────────────────────────────
function Pill({ color, children }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, letterSpacing: "1px",
      color, background: `${color}18`, border: `1px solid ${color}50`,
      padding: "2px 7px", borderRadius: 2, whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────
// v4: `playTime` (unix seconds) — when set, pills show the regime at that
//     moment instead of the live one. Used in REPLAY so the status pills
//     track the playhead.
export default function RegimeBar({ selectedTicker, onRegimeHistory, playTime = null, forceMacroOn = false, forceMicroOn = false }) {
  // ── Data ──
  const [macroData, setMacroData] = useState(null);
  const [microData, setMicroData] = useState(null);
  const [microMissing, setMicroMissing] = useState(false);  // true on 404

  // ── UI state ──
  const [showMacro,   setShowMacro]   = useState(false);
  const [showMicro,   setShowMicro]   = useState(false);
  const [macroOpacity, setMacroOpacity] = useState(0.08);
  const [microOpacity, setMicroOpacity] = useState(0.08);
  const [macroHidden, setMacroHidden] = useState(() => new Set());
  const [microHidden, setMicroHidden] = useState(() => new Set());
  const [macroPop,    setMacroPop]    = useState(false);
  const [microPop,    setMicroPop]    = useState(false);
  // v5: per-layer "paint on candles" mode (replaces bg histogram).
  const [paintMacroCandles, setPaintMacroCandlesRaw] = useState(() => {
    try { return localStorage.getItem("mk_regime_paint_macro_candles") === "1"; }
    catch { return false; }
  });
  const [paintMicroCandles, setPaintMicroCandlesRaw] = useState(() => {
    try { return localStorage.getItem("mk_regime_paint_micro_candles") === "1"; }
    catch { return false; }
  });
  const setPaintMacroCandles = useCallback((v) => {
    setPaintMacroCandlesRaw(v);
    try { localStorage.setItem("mk_regime_paint_macro_candles", v ? "1" : "0"); } catch {}
  }, []);
  const setPaintMicroCandles = useCallback((v) => {
    setPaintMicroCandlesRaw(v);
    try { localStorage.setItem("mk_regime_paint_micro_candles", v ? "1" : "0"); } catch {}
  }, []);

  // v3: sync-event tick — bumped on mk:data-sync-complete so both fetch
  //     effects re-run immediately when the cache watcher sees a new file.
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setSyncTick(t => t + 1);
    window.addEventListener("mk:data-sync-complete", onSync);
    return () => window.removeEventListener("mk:data-sync-complete", onSync);
  }, []);

  // ── Fetch MACRO (poll every 5 min; data is daily) ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/regime/macro");
        if (!r.ok) { if (!cancelled) setMacroData(null); return; }
        const d = await r.json();
        if (!cancelled) setMacroData(d);
      } catch { if (!cancelled) setMacroData(null); }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [syncTick]);  // v3: also refetch on mk:data-sync-complete

  // ── Fetch MICRO on ticker change + 60s poll ──
  useEffect(() => {
    if (!selectedTicker) { setMicroData(null); setMicroMissing(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/regime/${selectedTicker}`);
        if (r.status === 404) {
          if (!cancelled) { setMicroData(null); setMicroMissing(true); }
          return;
        }
        if (!r.ok) { if (!cancelled) setMicroData(null); return; }
        const d = await r.json();
        if (!cancelled) { setMicroData(d); setMicroMissing(false); }
      } catch { if (!cancelled) setMicroData(null); }
    };
    load();
    const id = setInterval(load, 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedTicker, syncTick]);  // v3: also refetch on mk:data-sync-complete

  // ── Emit parent payload whenever relevant state changes ──
  useEffect(() => {
    if (!onRegimeHistory) return;
    // v7: parent can force macro/micro on without the in-bar button click,
    //   for callers that hide RegimeBar's UI but still want the payload.
    const effectiveShowMacro = showMacro || forceMacroOn;
    const effectiveShowMicro = showMicro || forceMicroOn;
    // v6: emit even when neither layer is shown, as long as data is loaded,
    //   so the FOREST regime filter (and any future consumer that needs the
    //   asset's current regime without rendering it) can read the live
    //   regime without depending on the MICRO/MACRO toggle state.
    const anyOn   = (effectiveShowMacro && macroData) || (effectiveShowMicro && microData);
    const anyData = !!macroData || !!microData;
    if (!anyOn && !anyData) { onRegimeHistory(null); return; }
    onRegimeHistory({
      macro: effectiveShowMacro && macroData ? {
        data: macroData,
        enabled: true,
        opacity: macroOpacity,
        hidden: macroHidden,
        colors: MACRO_COLORS,
        paintCandles: paintMacroCandles,  // v5
      } : null,
      micro: effectiveShowMicro && microData ? {
        data: microData,
        enabled: true,
        opacity: microOpacity,
        hidden: microHidden,
        colors: MICRO_COLORS,
        paintCandles: paintMicroCandles,  // v5
      } : null,
      // v6: live regimes always exposed for downstream consumers.
      liveMacroRegime: macroData?.slow?.regime || null,
      liveMicroRegime: microData?.slow?.regime || null,
    });
  }, [showMacro, showMicro, forceMacroOn, forceMicroOn, macroData, microData, macroOpacity, microOpacity,
      macroHidden, microHidden, paintMacroCandles, paintMicroCandles, onRegimeHistory]);

  // ── Derived ──
  // v4: if `playTime` is set, walk the history tail and return the record
  //   whose date is the most recent entry on or before playTime. Otherwise
  //   fall back to the live `slow` block.
  const lookupAt = (layerData, playT) => {
    if (!layerData) return { regime: null, confidence: 0, outOfRange: false };
    if (playT == null) {
      return {
        regime: layerData.slow?.regime || null,
        confidence: layerData.slow?.confidence || 0,
        outOfRange: false,
      };
    }
    const hist = layerData.history?.slow_d1 || [];
    if (!hist.length) return { regime: null, confidence: 0, outOfRange: true };
    const playDay = Math.floor(playT / 86400) * 86400;
    let best = null;
    for (const row of hist) {
      if (!row?.date || !row?.regime) continue;
      const utc = Math.floor(new Date(row.date + "T00:00:00Z").getTime() / 1000);
      if (!Number.isFinite(utc) || utc <= 0) continue;
      if (utc <= playDay && (!best || utc > best.ts)) best = { ts: utc, ...row };
    }
    if (!best) return { regime: null, confidence: 0, outOfRange: true };
    return { regime: best.regime, confidence: best.confidence || 0, outOfRange: false };
  };

  const macroEff = lookupAt(macroData, playTime);
  const macroRegime = macroEff.regime;
  const macroConf   = macroEff.confidence;
  const macroOutOfRange = macroEff.outOfRange;

  const microEff = lookupAt(microData, playTime);
  const microRegime = microEff.regime;
  const microConf   = microEff.confidence;
  const microOutOfRange = microEff.outOfRange;
  const microN      = microData?.slow?.n_states_selected || 0;
  // v4: fast block is now-only; hide the IMMINENT/QUIET chip in playTime mode.
  const isLiveMode = playTime == null;
  const microImminent = isLiveMode && !!microData?.fast?.imminent;
  const microMinSinceAlarm = isLiveMode ? microData?.fast?.minutes_since_alarm : null;

  const microStates = microN && MICRO_PALETTES[microN] ? MICRO_PALETTES[microN] : [];

  const toggleMacroState = useCallback((s) => {
    setMacroHidden(h => { const n = new Set(h); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }, []);
  const toggleMicroState = useCallback((s) => {
    setMicroHidden(h => { const n = new Set(h); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }, []);

  // ── Styles ──
  const btnStyle = (on, color) => ({
    background: on ? `${color}20` : "transparent",
    color: on ? color : C.muted,
    border: `1px solid ${on ? color + "60" : C.border}`,
    padding: "2px 7px", cursor: "pointer",
    fontSize: 8, fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
    flexShrink: 0,
  });
  const chevStyle = (on, color) => ({
    ...btnStyle(on, color),
    padding: "2px 5px",
  });

  if (!selectedTicker) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, height: 24,
      background: C.bgPanel, borderBottom: `1px solid ${C.border}`,
      padding: "0 10px", fontFamily: mono, flexShrink: 0,
    }}>
      {/* Label */}
      <span style={{ fontSize: 8, color: C.muted, letterSpacing: "2px", fontWeight: 800, flexShrink: 0 }}>
        REGIMES
      </span>

      {/* CURRENT MACRO pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 7.5, color: C.gray, letterSpacing: "1.5px", fontWeight: 700 }}>
          {isLiveMode ? "CURRENT MACRO" : "MACRO @ PLAYHEAD"}
        </span>
        {macroRegime ? (
          <Pill color={MACRO_COLORS[macroRegime] || C.gray}>
            {macroRegime} · {(macroConf * 100).toFixed(0)}%
          </Pill>
        ) : macroOutOfRange ? (
          <span style={{ fontSize: 8, color: C.muted, fontStyle: "italic" }}>before history</span>
        ) : (
          <span style={{ fontSize: 8, color: C.muted, fontStyle: "italic" }}>loading…</span>
        )}
      </div>

      {/* [TICKER] MICRO pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 7.5, color: C.gray, letterSpacing: "1.5px", fontWeight: 700 }}>
          {selectedTicker} MICRO{!isLiveMode ? " @ PLAYHEAD" : ""}
        </span>
        {microMissing ? (
          <span style={{ fontSize: 8, color: C.muted, fontStyle: "italic" }}>— not enabled</span>
        ) : microRegime ? (
          <>
            <Pill color={MICRO_COLORS[microRegime] || C.gray}>
              {(MICRO_LABEL[microRegime] || microRegime).toUpperCase()} · {(microConf * 100).toFixed(0)}%
            </Pill>
            {isLiveMode && (microImminent ? (
              <span title="regime shift imminent"
                style={{
                  fontSize: 7.5, color: C.red, background: `${C.red}18`,
                  border: `1px solid ${C.red}60`, padding: "2px 6px", borderRadius: 2,
                  fontWeight: 800, letterSpacing: "1px",
                }}>
                ⚠ IMMINENT
              </span>
            ) : (
              <span title={microMinSinceAlarm != null ? `${microMinSinceAlarm} min since last alarm` : ""}
                style={{
                  fontSize: 7.5, color: C.gray, background: "transparent",
                  border: `1px solid ${C.border}`, padding: "2px 6px", borderRadius: 2,
                  fontWeight: 700, letterSpacing: "1px",
                }}>
                QUIET{microMinSinceAlarm != null ? ` · ${microMinSinceAlarm}m` : ""}
              </span>
            ))}
          </>
        ) : microOutOfRange ? (
          <span style={{ fontSize: 8, color: C.muted, fontStyle: "italic" }}>before history</span>
        ) : (
          <span style={{ fontSize: 8, color: C.muted, fontStyle: "italic" }}>loading…</span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* MACRO button + chevron */}
      <div style={{ position: "relative", display: "inline-flex", gap: 2, flexShrink: 0 }}>
        <button onClick={() => setShowMacro(p => !p)}
          title="Toggle macro regime background shading"
          style={btnStyle(showMacro, C.cyan)}>
          ◉ MACRO
        </button>
        <button onClick={() => setMacroPop(p => !p)}
          title="Macro opacity + state visibility"
          style={chevStyle(macroPop, C.cyan)}>▾</button>
        {macroPop && (
          <RegimePopover
            title="MACRO REGIME"
            titleColor={C.cyan}
            states={MACRO_STATES}
            stateColors={MACRO_COLORS}
            stateLabels={{}}
            opacity={macroOpacity}
            onOpacityChange={setMacroOpacity}
            hidden={macroHidden}
            onToggleState={(s) => { setMacroHidden(h => { const n = new Set(h); n.has(s) ? n.delete(s) : n.add(s); return n; }); }}
            paintCandles={paintMacroCandles}
            onTogglePaintCandles={setPaintMacroCandles}
            onClose={() => setMacroPop(false)}
          />
        )}
      </div>

      {/* MICRO button + chevron */}
      <div style={{ position: "relative", display: "inline-flex", gap: 2, flexShrink: 0 }}>
        <button onClick={() => setShowMicro(p => !p)}
          disabled={microMissing}
          title={microMissing ? "Micro regime not enabled for this ticker" : "Toggle micro regime background shading + hazard"}
          style={{ ...btnStyle(showMicro, C.cyan), opacity: microMissing ? 0.35 : 1, cursor: microMissing ? "not-allowed" : "pointer" }}>
          ◉ MICRO
        </button>
        <button onClick={() => setMicroPop(p => !p)}
          disabled={microMissing}
          title="Micro opacity + state visibility"
          style={{ ...chevStyle(microPop, C.cyan), opacity: microMissing ? 0.35 : 1, cursor: microMissing ? "not-allowed" : "pointer" }}>▾</button>
        {microPop && !microMissing && (
          <RegimePopover
            title={`MICRO · ${microStates.length}-STATE`}
            titleColor={C.cyan}
            states={microStates}
            stateColors={MICRO_COLORS}
            stateLabels={MICRO_LABEL}
            opacity={microOpacity}
            onOpacityChange={setMicroOpacity}
            hidden={microHidden}
            onToggleState={(s) => { setMicroHidden(h => { const n = new Set(h); n.has(s) ? n.delete(s) : n.add(s); return n; }); }}
            paintCandles={paintMicroCandles}
            onTogglePaintCandles={setPaintMicroCandles}
            onClose={() => setMicroPop(false)}
          />
        )}
      </div>
    </div>
  );
}
