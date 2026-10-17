// version: v4
/**
 * SettingsPanel — Terminal Configuration
 * ════════════════════════════════════════════════
 * Quantum Terminal | Display + Trading Settings
 *
 * Sections:
 *   UNIVERSE    — add/remove/hide tickers, drag-reorder
 *   DISPLAY     — chart layers, visible panels, default timeframe, chart height
 *   TRADING     — execution settings, risk governor, account sync
 *   PROVIDERS   — connection status, account info
 *   PROFILES    — save/load/delete terminal configurations
 *   TIME        — main clock, world clock slots
 *   MAINTENANCE — sync status, force refresh, clear cache (Rule C9 reversible),
 *                 reload browser, restart backend
 *
 * REMOVED FROM PRO (Rule C1 — no calculation triggers):
 *   - AUTO TRADING section (auto-execute signals)
 *   - SCHEDULER section (auto-run calculations)
 *   - DEVELOPER section (subprocess debug mode)
 *
 * This file does NOT introduce any calculation triggers.
 *
 * v4 — Open-source edition: removed the account / sign-out block (there are
 *   no accounts), the broker affiliate button (replaced by a pointer to the
 *   built-in simulated market) and the Telegram link (→ GitHub issues).
 *   Maintenance shows DATA SERVER: NONE when no data server is configured;
 *   on the simulator the trading switch talks about the paper account.
 *
 * v3 (2026-05-11) — Tradovate POC removed. The feature was disqualified.
 *   Dropped: TRADOVATE_ENABLED flag, tv* state (tvConfig/tvStatus/tvBusy/
 *   tvError/tvGuideOpen + tvFetchedRef), the /api/tradovate/* fetch handlers,
 *   and the entire Settings → Providers → TRADOVATE UI block (credential guide,
 *   connect/disconnect row, env toggle, credential fields). Backend routes left
 *   in place (already inactive). MainChart.jsx loses its Tradovate toolbar pill
 *   in the same pass (its v102).
 */
// version: v5
//
// v5 — Quick-save per profile row. The PROFILES section previously only
//      had LOAD and DEL on each row; saving back into an existing profile
//      required re-typing its name in the input. Each row now has a
//      "SAVE" button that overwrites that profile in place with the
//      current workspace state. Useful after tweaking layout/drawings —
//      one click and the profile is up to date.
//
// v4 — added SOUNDS section. Master on/off switch (default ON), persisted
//      to localStorage via utils/sounds.js. Lists each wired event for
//      reference. Per-event volume / muting can be added later.

import React, { useState, useCallback, useEffect, useRef } from "react";
import { TZ_OPTIONS, DEFAULT_TIME_CONFIG } from "./time_utils";
import useAppVersion from "../hooks/useAppVersion";
import { isSoundEnabled, setSoundEnabled, playSound, SOUND_FILES } from "../utils/sounds";

const C = {
  bg:      "#000000",
  bgPanel: "#0a0a0a",
  bgCard:  "#111111",
  bgHover: "#1a1a1a",
  border:  "#222222",
  borderLt:"#333333",
  white:   "#ffffff",
  gray:    "#999999",
  muted:   "#444444",
  orange:  "#ff6d00",
  orangeDim:"#cc5500",
  green:   "#2ebd59",
  red:     "#e8383b",
  cyan:    "#00d2d3",
  yellow:  "#ffa500",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const SECTIONS = ["universe", "display", "sounds", "trading", "providers", "profiles", "time", "maintenance"];

export default function SettingsPanel({ open, onClose, configHook, config }) {
  const [expanded, setExpanded] = useState({ universe: true, display: false, sounds: false, trading: false, providers: false, profiles: false, time: false, maintenance: false, about: false });
  // v4: master sound switch — held in localStorage; mirrored in component
  // state so the UI re-renders when toggled.
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const appVer = useAppVersion();
  const [addTickerInput, setAddTickerInput] = useState("");
  const [addTickerClass, setAddTickerClass] = useState("FX");
  const [profileNameInput, setProfileNameInput] = useState("");
  const [busy, setBusy] = useState(null);
  // Per-ticker broker symbol editor — { ticker: "draftValue" } when editing, null when collapsed
  const [brokerEdit, setBrokerEdit] = useState({});

  // Save broker symbol override for a ticker via PATCH /api/config
  // Storage: user_config.json -> universe.custom_tickers[TICKER].broker_symbol
  // Backend flow (wired): PATCH /api/config detects the broker_symbol change,
  // calls provider.reset_symbol(ticker) on every live provider, and broadcasts
  // data_sync_complete so the chart refetches bars using the new symbol. No
  // restart required.
  const handleSaveBrokerSymbol = useCallback(async (ticker) => {
    const value = (brokerEdit[ticker] || "").trim();
    setBusy(`broker_${ticker}`);
    await configHook.updateConfig({
      universe: { custom_tickers: { [ticker]: { broker_symbol: value || null } } },
    });
    setBrokerEdit((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
    setBusy(null);
  }, [brokerEdit, configHook]);

  // ── Account / Risk Governor settings ──
  const [acctSettings, setAcctSettings] = useState(null);

  const fetchAcctSettings = useCallback(async () => {
    try {
      const r = await fetch("/api/account/settings");
      if (r.ok) setAcctSettings(await r.json());
    } catch { /* non-critical */ }
  }, []);

  const updateAcctSetting = useCallback(async (field, value) => {
    try {
      const body = {};
      body[field] = value;
      const r = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        setAcctSettings(d.settings);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    if (expanded.trading && !acctSettings) fetchAcctSettings();
  }, [expanded.trading, acctSettings, fetchAcctSettings]);

  // ── Maintenance: sync status, force refresh, clear cache, restart ──
  const [syncStatus, setSyncStatus] = useState(null);
  const [pollConfig, setPollConfig] = useState(null);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/sync/status");
      if (r.ok) setSyncStatus(await r.json());
    } catch { /* non-critical */ }
  }, []);

  const fetchPollConfig = useCallback(async () => {
    try {
      const r = await fetch("/api/sync/poll-config");
      if (r.ok) setPollConfig(await r.json());
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    if (expanded.maintenance) {
      fetchSyncStatus();
      if (!pollConfig) fetchPollConfig();
    }
  }, [expanded.maintenance, fetchSyncStatus, fetchPollConfig, pollConfig]);

  const handleForceRefresh = useCallback(async () => {
    setBusy("refresh");
    try {
      const r = await fetch("/api/sync/refresh", { method: "POST" });
      if (r.ok) {
        const result = await r.json();
        await fetchSyncStatus();
        window.alert(
          `Sync complete:\n` +
          `${result.synced || 0} files updated\n` +
          `${result.skipped || 0} unchanged\n` +
          `Offline: ${result.offline_mode ? "yes" : "no"}`
        );
      } else {
        window.alert("Sync failed — check server logs");
      }
    } catch (e) {
      window.alert(`Sync error: ${e.message}`);
    }
    setBusy(null);
  }, [fetchSyncStatus]);

  const handleClearCache = useCallback(async () => {
    if (!window.confirm(
      "Move all cached data to _trash and re-download from server?\n\n" +
      "Files are preserved in the app's _trash folder for recovery."
    )) return;
    setBusy("clearCache");
    try {
      const r = await fetch("/api/sync/clear-cache", { method: "POST" });
      if (r.ok) {
        const result = await r.json();
        await fetchSyncStatus();
        window.alert(
          `Cleared ${result.cleared?.moved || 0} files to _trash.\n` +
          `Re-synced ${result.resync?.synced || 0} files from server.`
        );
      } else {
        window.alert("Clear failed — check server logs");
      }
    } catch (e) {
      window.alert(`Clear error: ${e.message}`);
    }
    setBusy(null);
  }, [fetchSyncStatus]);

  const handleReloadBrowser = useCallback(() => {
    try {
      if (window.caches) {
        window.caches.keys().then(keys => keys.forEach(k => window.caches.delete(k)));
      }
      sessionStorage.clear();
    } catch { /* non-critical */ }
    window.location.reload(true);
  }, []);

  const handleRestartTerminal = useCallback(async () => {
    if (!window.confirm(
      "Restart the terminal backend?\n\n" +
      "The window will briefly disconnect and auto-reload."
    )) return;
    setBusy("restart");
    try {
      await fetch("/api/consumer/restart", { method: "POST" });
    } catch { /* expected — process is exiting */ }
    setTimeout(() => window.location.reload(), 4000);
  }, []);

  // ── MT5 Connection Settings ──
  const [mt5Config, setMt5Config] = useState({
    connection_method: "path",
    terminal_path: "",
    server: "",
    login: "",
    password: "",
    use_tick_data: false, // v2: USE TICK DATA toggle (5×/sec MT5 polling)
  });
  const [mt5Status, setMt5Status] = useState(null); // { connected, account }
  const [mt5Busy, setMt5Busy] = useState(false);
  const [mt5Error, setMt5Error] = useState(null);

  const fetchMt5Config = useCallback(async () => {
    try {
      const r = await fetch("/api/mt5/config");
      if (r.ok) {
        const d = await r.json();
        setMt5Config(prev => ({ ...prev, ...d }));
      }
    } catch { /* API may not exist yet — use local defaults */ }
  }, []);

  const fetchMt5Status = useCallback(async () => {
    try {
      // Try dedicated MT5 status endpoint first
      const r = await fetch("/api/mt5/status");
      if (r.ok) {
        const d = await r.json();
        // simulated: the built-in simulator is the execution account (--sim)
        setMt5Status({ connected: d.connected, account: d.account || null, simulated: !!d.simulated });
        return;
      }
    } catch { /* fallback below */ }
    // Fallback to health endpoint
    try {
      const r = await fetch("/api/health");
      if (r.ok) {
        const d = await r.json();
        setMt5Status({ connected: d.mt5_connected, account: null });
      }
    } catch { /* non-critical */ }
  }, []);

  const saveMt5Config = useCallback(async (patch) => {
    // Always update local state immediately (optimistic)
    setMt5Config(prev => ({ ...prev, ...patch }));
    // Try to persist to server (may not exist yet)
    try {
      const r = await fetch("/api/mt5/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.config) setMt5Config(prev => ({ ...prev, ...d.config }));
      }
    } catch { /* API not wired yet — local state still works */ }
  }, []);

  const connectMt5 = useCallback(async () => {
    setMt5Busy(true); setMt5Error(null);
    try {
      const r = await fetch("/api/mt5/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mt5Config),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.connected) {
          setMt5Status({ connected: true, account: d.account || null });
          setMt5Error(null);
        } else {
          setMt5Error(d.error || "Connection failed");
        }
      } else {
        const d = await r.json().catch(() => ({}));
        setMt5Error(d.error || d.detail || `HTTP ${r.status}`);
      }
    } catch (e) {
      setMt5Error("MT5 connection API not available yet — coming in next update");
    }
    setMt5Busy(false);
  }, [mt5Config]);

  const disconnectMt5 = useCallback(async () => {
    setMt5Busy(true);
    try {
      await fetch("/api/mt5/disconnect", { method: "POST" });
    } catch { /* non-critical */ }
    setMt5Status({ connected: false, account: null });
    setMt5Busy(false);
  }, []);

  // Fetch MT5 config + status when Providers section opens
  const mt5FetchedRef = useRef(false);
  useEffect(() => {
    if (expanded.providers && !mt5FetchedRef.current) {
      mt5FetchedRef.current = true;
      fetchMt5Config();
      fetchMt5Status();
    }
  }, [expanded.providers, fetchMt5Config, fetchMt5Status]);
  // The trading switch words itself for the simulator's paper account, so
  // Trading needs the status too.
  useEffect(() => {
    if (expanded.trading && !mt5Status) fetchMt5Status();
  }, [expanded.trading, mt5Status, fetchMt5Status]);

  // REMOVED: debugConfig, toggleSubprocessDebug (developer section — Rule C1)
  // REMOVED: clearResult, restartStatus (maintenance — Rule C1)

  const toggle = useCallback((section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  if (!open) return null;
  if (!config || !configHook) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={headerStyle}>
            <span>SETTINGS</span>
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ padding: 20, color: C.muted, fontSize: 11 }}>Loading config...</div>
        </div>
      </div>
    );
  }

  const {
    addTicker, removeTicker, toggleTicker, reorderTickers,
    updateConfig, saveProfile, loadProfile, deleteProfile,
    togglePanel, toggleChartLayer, setDefaultTimeframe, setChartHeight,
  } = configHook;

  // ── Handlers ──

  const handleAddTicker = async () => {
    const ticker = addTickerInput.trim().toUpperCase();
    if (!ticker) return;
    setBusy("addTicker");
    await addTicker(ticker, { class: addTickerClass, decimals: addTickerClass === "FX" ? 5 : 2 });
    setAddTickerInput("");
    setBusy(null);
  };

  const handleRemoveTicker = async (ticker) => {
    if (!window.confirm(`Remove ${ticker} from universe?`)) return;
    setBusy(`remove_${ticker}`);
    await removeTicker(ticker);
    setBusy(null);
  };

  const handleToggleTicker = async (ticker) => {
    setBusy(`toggle_${ticker}`);
    await toggleTicker(ticker);
    setBusy(null);
  };

  const handleSaveProfile = async () => {
    const name = profileNameInput.trim();
    if (!name) return;
    setBusy("saveProfile");
    await saveProfile(name);
    setProfileNameInput("");
    setBusy(null);
  };

  const handleLoadProfile = async (name) => {
    if (!window.confirm(`Load profile "${name}"? This will replace your current settings.`)) return;
    setBusy(`load_${name}`);
    await loadProfile(name);
    setBusy(null);
  };

  const handleDeleteProfile = async (name) => {
    if (!window.confirm(`Delete profile "${name}"?`)) return;
    setBusy(`del_${name}`);
    await deleteProfile(name);
    setBusy(null);
  };

  // v5: overwrite an existing profile with the current workspace state.
  //     `saveProfile(name)` is upsert — same call the top-row SAVE button
  //     uses; just pre-supplies the name without confirm friction.
  const handleQuickSaveProfile = async (name) => {
    if (!window.confirm(`Overwrite profile "${name}" with the current workspace state?`)) return;
    setBusy(`save_${name}`);
    await saveProfile(name);
    setBusy(null);
  };

  // ── Derived data ──
  const universe = config.allTickers || [];
  const hiddenSet = new Set(config.hiddenTickers || []);
  const quantSet = new Set(config.quantSupported || []);
  const quantDataTypes = config.quantDataTypes || {};  // v3: per-ticker data types
  const assetMeta = config.assetMeta || {};
  const display = config.display || {};
  const visiblePanels = display.visiblePanels || {};
  const chartLayers = display.chartLayers || {};
  const profiles = config.profiles || {};
  const execution = config._raw?.execution || {};
  const timeframes = config.timeframes || ["M1","M5","M15","M30","H1","H4","D1","W1"];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 4, height: 14, background: C.orange }} />
            <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: "2px", color: C.orange }}>SETTINGS</span>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

          {/* ═══════════ UNIVERSE ═══════════ */}
          <SectionHeader title="UNIVERSE" count={universe.length} expanded={expanded.universe} onToggle={() => toggle("universe")} />
          {expanded.universe && (
            <div style={sectionBodyStyle}>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                <input
                  value={addTickerInput}
                  onChange={(e) => setAddTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTicker()}
                  placeholder="BTCUSD"
                  style={inputStyle}
                />
                <select value={addTickerClass} onChange={(e) => setAddTickerClass(e.target.value)} style={{ ...inputStyle, width: 70, cursor: "pointer" }}>
                  <option value="FX">FX</option>
                  <option value="INDEX">INDEX</option>
                  <option value="COMMODITY">CMDTY</option>
                  <option value="CRYPTO">CRYPTO</option>
                  <option value="STOCK">STOCK</option>
                </select>
                <button onClick={handleAddTicker} disabled={busy === "addTicker"} style={actionBtnStyle}>
                  {busy === "addTicker" ? "..." : "+ ADD"}
                </button>
              </div>

              {universe.map((ticker) => {
                const meta = assetMeta[ticker] || {};
                const isHidden = hiddenSet.has(ticker);
                const classColor = meta.class === "FX" ? C.cyan : meta.class === "INDEX" ? C.yellow : meta.class === "COMMODITY" ? C.orange : C.gray;
                const hasQuant = quantSet.has(ticker);
                // v3: dot state — green = full quant, purple = quarterly-only,
                //     grey = nothing. Quarterly-only = cache contains JUST
                //     quarterly_cones and no other per-ticker data types.
                const dataTypes = quantDataTypes[ticker] || [];
                const quarterlyOnly = dataTypes.length === 1 && dataTypes[0] === "quarterly_cones";
                const dotColor = quarterlyOnly ? "#9b59b6"
                                : hasQuant ? C.green
                                : C.muted;
                const dotGlow = quarterlyOnly ? `0 0 6px #9b59b6, 0 0 2px #9b59b6`
                                : hasQuant ? `0 0 6px ${C.green}, 0 0 2px ${C.green}`
                                : "none";
                const dotTitle = quarterlyOnly ? "Quarterly cones only — long-horizon data"
                                : hasQuant ? "Quant data available"
                                : "No quant data — display only";
                const currentBroker = meta.broker_symbol || "";
                const isEditingBroker = ticker in brokerEdit;
                return (
                  <div key={ticker} style={{
                    display: "flex", flexDirection: "column",
                    padding: "4px 6px", marginBottom: 1,
                    background: isHidden ? "transparent" : `${C.bgHover}80`,
                    borderLeft: `2px solid ${isHidden ? C.muted : classColor}`,
                    opacity: isHidden ? 0.4 : 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {/* v3: quant data status dot — green = full quant,
                          purple = quarterly-only, grey = nothing. */}
                      <span
                        title={dotTitle}
                        style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: dotColor,
                          boxShadow: dotGlow,
                          border: (hasQuant || quarterlyOnly) ? "none" : `1px solid ${C.borderLt}`,
                        }}
                      />
                      <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: isHidden ? C.muted : C.white, fontFamily: mono }}>
                        {ticker}
                      </span>
                      <span style={{ fontSize: 7, color: classColor, fontWeight: 700, letterSpacing: "1px", width: 42 }}>
                        {meta.class || "OTHER"}
                      </span>
                      <span style={{ fontSize: 8, color: C.muted, width: 18, textAlign: "center" }}>
                        .{meta.decimals ?? "?"}
                      </span>
                      {/* Saved broker symbol — visible label so the user can confirm persistence */}
                      {currentBroker && !isEditingBroker && (
                        <span
                          title="Saved broker symbol (MT5 wiring pending — restart not yet effective)"
                          style={{
                            fontSize: 8, fontWeight: 700, color: C.cyan,
                            fontFamily: mono, letterSpacing: "0.5px",
                            padding: "1px 4px",
                            border: `1px solid ${C.cyan}40`,
                            background: `${C.cyan}10`,
                          }}
                        >
                          → {currentBroker}
                        </span>
                      )}
                      {/* Broker symbol link icon — opens inline editor */}
                      <button
                        onClick={() => setBrokerEdit((prev) => isEditingBroker
                          ? (() => { const n = { ...prev }; delete n[ticker]; return n; })()
                          : { ...prev, [ticker]: currentBroker })}
                        title={currentBroker ? `Broker symbol saved: ${currentBroker} (click to edit)` : "Map to broker symbol"}
                        style={{ ...tinyBtnStyle, color: currentBroker ? C.cyan : C.muted }}
                      >
                        🔗
                      </button>
                      <button onClick={() => handleToggleTicker(ticker)} title={isHidden ? "Show" : "Hide"} style={{ ...tinyBtnStyle, color: isHidden ? C.muted : C.green }}>
                        {isHidden ? "○" : "●"}
                      </button>
                      <button onClick={() => handleRemoveTicker(ticker)} title="Remove from universe" style={{ ...tinyBtnStyle, color: C.red }}>
                        ✕
                      </button>
                    </div>
                    {isEditingBroker && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, paddingLeft: 14 }}>
                        <span style={{ fontSize: 7, color: C.muted, letterSpacing: "1px" }}>BROKER</span>
                        <input
                          autoFocus
                          value={brokerEdit[ticker]}
                          onChange={(e) => setBrokerEdit((prev) => ({ ...prev, [ticker]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveBrokerSymbol(ticker); }}
                          placeholder={`e.g. ${ticker === "XAUUSD" ? "GOLD.v" : ticker.toLowerCase() + "_s"}`}
                          style={{ ...inputStyle, flex: 1, fontSize: 9 }}
                        />
                        <button
                          onClick={() => handleSaveBrokerSymbol(ticker)}
                          disabled={busy === `broker_${ticker}`}
                          style={{ ...tinyBtnStyle, color: C.green }}
                          title="Save (restart terminal to apply)"
                        >
                          ✓
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ fontSize: 8, color: C.muted, marginTop: 6, padding: "0 4px" }}>
                {universe.length} tickers • {hiddenSet.size} hidden
              </div>
            </div>
          )}

          {/* ═══════════ DISPLAY ═══════════ */}
          <SectionHeader title="DISPLAY" expanded={expanded.display} onToggle={() => toggle("display")} />
          {expanded.display && (
            <div style={sectionBodyStyle}>
              <div style={rowStyle}>
                <span style={labelStyle}>THEME</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {["dark", "light"].map(t => {
                    const currentTheme = config._raw?.display?.theme || "dark";
                    const isActive = currentTheme === t;
                    return (
                      <button key={t} onClick={() => updateConfig({ display: { theme: t } })} style={{
                        ...tinyBtnStyle,
                        background: isActive ? `${C.orange}30` : "transparent",
                        border: `1px solid ${isActive ? C.orange : C.border}`,
                        color: isActive ? C.orange : C.muted,
                        padding: "2px 8px", fontSize: 8, fontWeight: 700,
                      }}>
                        {t === "dark" ? "🌙 DARK" : "☀ LIGHT"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>DEFAULT TIMEFRAME</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {timeframes.map(tf => (
                    <button key={tf} onClick={() => setDefaultTimeframe(tf)} style={{
                      ...tinyBtnStyle,
                      background: display.defaultTimeframe === tf ? `${C.orange}30` : "transparent",
                      border: `1px solid ${display.defaultTimeframe === tf ? C.orange : C.border}`,
                      color: display.defaultTimeframe === tf ? C.orange : C.muted,
                      padding: "2px 4px", fontSize: 7,
                    }}>
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>CHART HEIGHT</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="range" min={150} max={800} step={10} value={display.chartHeight || 420}
                    onChange={(e) => setChartHeight(parseInt(e.target.value))} style={{ width: 100, accentColor: C.orange }} />
                  <span style={{ fontSize: 9, color: C.white, width: 35, textAlign: "right", fontFamily: mono }}>{display.chartHeight || 420}px</span>
                </div>
              </div>
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <span style={{ ...labelStyle, display: "block", marginBottom: 4 }}>CHART LAYERS</span>
                {Object.entries(chartLayers).map(([key, enabled]) => (
                  <ToggleRow key={key} label={key.replace(/_/g, " ").toUpperCase()} enabled={enabled} onToggle={() => toggleChartLayer(key)} />
                ))}
              </div>
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <span style={{ ...labelStyle, display: "block", marginBottom: 4 }}>PANELS</span>
                {Object.entries(visiblePanels).map(([key, enabled]) => (
                  <ToggleRow key={key} label={key.replace(/_/g, " ").toUpperCase()} enabled={enabled} onToggle={() => togglePanel(key)} />
                ))}
              </div>
            </div>
          )}

          {/* ═══════════ SOUNDS ═══════════
              v4: master switch + reference of which event triggers which file. */}
          <SectionHeader title="SOUNDS" expanded={expanded.sounds} onToggle={() => toggle("sounds")} />
          {expanded.sounds && (
            <div style={sectionBodyStyle}>
              {/* Master switch — big, obvious, with status colour */}
              <div style={{
                padding: "8px 10px", marginBottom: 10,
                background: soundOn ? `${C.green}12` : `${C.muted}10`,
                border: `1px solid ${soundOn ? C.green : C.muted}40`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
                    color: soundOn ? C.green : C.muted,
                  }}>
                    {soundOn ? "● SOUND ON" : "○ SOUND OFF"}
                  </div>
                  <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                    Master switch. Off mutes every event below.
                  </div>
                </div>
                <button
                  onClick={() => {
                    const next = !soundOn;
                    setSoundEnabled(next);
                    setSoundOn(next);
                    if (next) {
                      // Audible confirmation when turning ON
                      playSound("connected");
                    }
                  }}
                  style={{
                    background: soundOn ? C.green : "transparent",
                    border: `1px solid ${soundOn ? C.green : C.muted}80`,
                    color: soundOn ? C.bg : C.muted,
                    padding: "5px 14px", fontSize: 10, fontWeight: 800,
                    fontFamily: mono, letterSpacing: "1.5px",
                    cursor: "pointer", minWidth: 56,
                  }}
                >
                  {soundOn ? "ON" : "OFF"}
                </button>
              </div>

              {/* Wired-event reference */}
              <div style={{
                padding: "6px 8px",
                background: C.bgCard, border: `1px solid ${C.border}`,
                fontSize: 9, color: C.gray, lineHeight: 1.6,
              }}>
                <div style={{
                  fontSize: 8, color: C.muted, letterSpacing: "1.5px",
                  fontWeight: 700, marginBottom: 6, textTransform: "uppercase",
                }}>Wired Events</div>
                {[
                  ["MT5 connected",                "connected.wav"],
                  ["MT5 disconnected",             "disconnected.wav"],
                  ["Market order executed",        "order_filled.wav"],
                  ["Limit order placed",           "order_placed.wav"],
                  ["Limit order triggered",        "order_filled.wav"],
                  ["TP / SL placed or adjusted",   "order_placed.wav"],
                  ["TP hit",                       "target_hit.wav"],
                  ["SL hit",                       "stoploss_hit.wav"],
                ].map(([label, file], i) => {
                  const exists = Object.values(SOUND_FILES).some(p => p.endsWith("/" + file));
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "3px 0",
                      borderBottom: i < 7 ? `1px solid ${C.border}40` : "none",
                    }}>
                      <span style={{ flex: 1 }}>{label}</span>
                      <span style={{
                        color: exists ? C.cyan : C.red,
                        fontFamily: mono, fontSize: 8,
                      }}>{file}</span>
                      {/* Test button — plays the event sound */}
                      <button
                        onClick={() => {
                          // Map label to event key
                          const eventMap = {
                            "MT5 connected":              "connected",
                            "MT5 disconnected":           "disconnected",
                            "Market order executed":      "order_filled",
                            "Limit order placed":         "order_placed",
                            "Limit order triggered":      "order_filled",
                            "TP / SL placed or adjusted": "order_placed",
                            "TP hit":                     "target_hit",
                            "SL hit":                     "stoploss_hit",
                          };
                          playSound(eventMap[label]);
                        }}
                        title="Preview"
                        style={{
                          background: "transparent", border: `1px solid ${C.border}`,
                          color: C.gray, padding: "1px 6px", fontSize: 7,
                          fontFamily: mono, cursor: "pointer", fontWeight: 700,
                          letterSpacing: "0.5px",
                        }}
                      >▶ TEST</button>
                    </div>
                  );
                })}
              </div>

              <div style={{
                marginTop: 8, fontSize: 8, color: C.muted, lineHeight: 1.5,
              }}>
                Note: limit-trigger / TP / SL hit events fire from the broker
                side; these will sound once the position-event watcher
                (planned next) detects them in the position diff. Today,
                "TP hit" / "SL hit" / "Limit triggered" are not yet
                triggered automatically — only the placement / adjustment
                sounds play immediately on submit.
              </div>
            </div>
          )}

          {/* ═══════════ TRADING ═══════════ */}
          <SectionHeader title="TRADING" expanded={expanded.trading} onToggle={() => toggle("trading")} />
          {expanded.trading && (
            <div style={sectionBodyStyle}>
              {/* Master kill switch */}
              <div style={{
                padding: "6px 8px", marginBottom: 8,
                background: execution.live_trading ? `${C.red}15` : `${C.muted}08`,
                border: `1px solid ${execution.live_trading ? C.red : C.muted}40`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: execution.live_trading ? C.red : C.muted, fontFamily: mono }}>
                      LIVE TRADING
                    </span>
                    <div style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
                      {!execution.live_trading ? "Orders are blocked — safe mode"
                        : mt5Status?.simulated ? "Orders go to the simulated paper account"
                        : "⚠ ORDERS WILL BE SENT TO BROKER"}
                    </div>
                  </div>
                  <button onClick={() => {
                    if (!execution.live_trading) {
                      const prompt = mt5Status?.simulated
                        ? "Enable trading on the simulated paper account?\n\nOrders fill at simulated prices — no real money is involved."
                        : "Enable LIVE TRADING?\n\nThis allows the terminal to send real orders to your broker. Make sure you understand the risks.";
                      if (!window.confirm(prompt)) return;
                    }
                    updateConfig({ execution: { live_trading: !execution.live_trading } });
                  }} style={{
                    width: 38, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
                    background: execution.live_trading ? C.red : C.muted,
                    position: "relative", transition: "background 0.2s",
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 7,
                      background: C.white, position: "absolute", top: 2,
                      left: execution.live_trading ? 22 : 2, transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>

              <ToggleRow
                label="SHOW CURRENT POSITIONS"
                enabled={execution.show_positions || false}
                onToggle={() => updateConfig({ execution: { show_positions: !execution.show_positions } })}
              />
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 4px", marginTop: -2 }}>
                Display open positions from broker (even if placed on another platform)
              </div>

              <ToggleRow
                label="SHOW TRADE HISTORY"
                enabled={execution.show_trade_history || false}
                onToggle={() => updateConfig({ execution: { show_trade_history: !execution.show_trade_history } })}
              />
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 4px", marginTop: -2 }}>
                Show previous closed trades on chart
              </div>

              <ToggleRow
                label="CONFIRM BEFORE SENDING"
                enabled={execution.confirm_orders !== false}
                onToggle={() => updateConfig({ execution: { confirm_orders: !execution.confirm_orders } })}
              />

              <div style={{ marginTop: 8 }}>
                <div style={rowStyle}>
                  <span style={labelStyle}>DEFAULT RISK %</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" min={0.1} max={5} step={0.1} value={execution.default_risk_pct || 1.0}
                      onChange={(e) => updateConfig({ execution: { default_risk_pct: parseFloat(e.target.value) || 1.0 } })}
                      style={{ ...inputStyle, width: 50, textAlign: "right" }} />
                    <span style={{ fontSize: 8, color: C.muted }}>%</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>MAX LOT SIZE</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" min={0.01} max={100} step={0.1} value={execution.max_lots || 10.0}
                      onChange={(e) => updateConfig({ execution: { max_lots: parseFloat(e.target.value) || 10.0 } })}
                      style={{ ...inputStyle, width: 50, textAlign: "right" }} />
                    <span style={{ fontSize: 8, color: C.muted }}>lots</span>
                  </div>
                </div>
              </div>

              {/* ── Account & Risk Governor ── */}
              {acctSettings ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.orange, letterSpacing: "1.5px", padding: "6px 4px 4px", borderTop: `1px solid ${C.border}` }}>
                    ACCOUNT
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>ACCOUNT SIZE</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 8, color: C.muted }}>$</span>
                      <input type="number" min={100} step={100} value={acctSettings.account_size || 100000}
                        onBlur={(e) => updateAcctSetting("account_size", parseFloat(e.target.value) || 100000)}
                        onChange={(e) => setAcctSettings(prev => ({ ...prev, account_size: parseFloat(e.target.value) }))}
                        style={{ ...inputStyle, width: 80, textAlign: "right" }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 4px", marginTop: -2 }}>
                    Initial funded balance — used for drawdown % calculations
                  </div>

                  <div style={{ fontSize: 8, fontWeight: 700, color: C.orange, letterSpacing: "1.5px", padding: "8px 4px 4px", borderTop: `1px solid ${C.border}` }}>
                    CIRCUIT BREAKERS
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>MAX DAILY LOSS</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" min={0} max={50} step={0.5} value={acctSettings.max_daily_loss_pct ?? 2.0}
                        onBlur={(e) => updateAcctSetting("max_daily_loss_pct", parseFloat(e.target.value) || 0)}
                        onChange={(e) => setAcctSettings(prev => ({ ...prev, max_daily_loss_pct: parseFloat(e.target.value) }))}
                        style={{ ...inputStyle, width: 50, textAlign: "right" }} />
                      <span style={{ fontSize: 8, color: C.muted }}>%</span>
                    </div>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>MAX TOTAL DRAWDOWN</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" min={0} max={50} step={1} value={acctSettings.max_total_drawdown_pct ?? 10}
                        onBlur={(e) => updateAcctSetting("max_total_drawdown_pct", parseFloat(e.target.value) || 0)}
                        onChange={(e) => setAcctSettings(prev => ({ ...prev, max_total_drawdown_pct: parseFloat(e.target.value) }))}
                        style={{ ...inputStyle, width: 50, textAlign: "right" }} />
                      <span style={{ fontSize: 8, color: C.muted }}>%</span>
                    </div>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>MAX TRAILING DRAWDOWN</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" min={0} max={50} step={1} value={acctSettings.max_trailing_drawdown_pct ?? 0}
                        onBlur={(e) => updateAcctSetting("max_trailing_drawdown_pct", parseFloat(e.target.value) || 0)}
                        onChange={(e) => setAcctSettings(prev => ({ ...prev, max_trailing_drawdown_pct: parseFloat(e.target.value) }))}
                        style={{ ...inputStyle, width: 50, textAlign: "right" }} />
                      <span style={{ fontSize: 8, color: C.muted }}>%</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 2px", marginTop: -2 }}>
                    0 = disabled. Halts if equity drops this % from peak.
                  </div>

                  <div style={{ fontSize: 8, fontWeight: 700, color: C.orange, letterSpacing: "1.5px", padding: "8px 4px 4px", borderTop: `1px solid ${C.border}` }}>
                    POSITION LIMITS
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>MAX OPEN POSITIONS</span>
                    <input type="number" min={1} max={20} step={1} value={acctSettings.max_open_positions ?? 4}
                      onBlur={(e) => updateAcctSetting("max_open_positions", parseInt(e.target.value) || 4)}
                      onChange={(e) => setAcctSettings(prev => ({ ...prev, max_open_positions: parseInt(e.target.value) }))}
                      style={{ ...inputStyle, width: 40, textAlign: "right" }} />
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>MAX CORRELATED</span>
                    <input type="number" min={1} max={10} step={1} value={acctSettings.max_correlated_positions ?? 2}
                      onBlur={(e) => updateAcctSetting("max_correlated_positions", parseInt(e.target.value) || 2)}
                      onChange={(e) => setAcctSettings(prev => ({ ...prev, max_correlated_positions: parseInt(e.target.value) }))}
                      style={{ ...inputStyle, width: 40, textAlign: "right" }} />
                  </div>
                  <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 2px", marginTop: -2 }}>
                    Same-direction limit for correlated assets (e.g. gold+silver)
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>RISK PER TRADE</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" min={0.1} max={5} step={0.1} value={acctSettings.risk_per_trade_pct ?? 0.5}
                        onBlur={(e) => updateAcctSetting("risk_per_trade_pct", parseFloat(e.target.value) || 0.5)}
                        onChange={(e) => setAcctSettings(prev => ({ ...prev, risk_per_trade_pct: parseFloat(e.target.value) }))}
                        style={{ ...inputStyle, width: 50, textAlign: "right" }} />
                      <span style={{ fontSize: 8, color: C.muted }}>%</span>
                    </div>
                  </div>

                  {/* MT5 SYNC */}
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                    <button onClick={async () => {
                      try {
                        const r = await fetch("/api/account/sync", { method: "POST" });
                        if (r.ok) fetchAcctSettings();
                      } catch {}
                    }} style={{
                      background: `${C.cyan}15`, border: `1px solid ${C.cyan}40`,
                      color: C.cyan, padding: "4px 10px", cursor: "pointer",
                      fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.5px", width: "100%",
                    }}>
                      ↻ SYNC FROM MT5
                    </button>
                    <div style={{ fontSize: 7, color: C.muted, padding: "2px 4px", textAlign: "center" }}>
                      Pull live equity from broker
                    </div>
                    <button onClick={async () => {
                      if (!window.confirm(
                        "RESET BASELINE?\n\n" +
                        "This will:\n" +
                        `• Set initial balance to $${(acctSettings.account_size || 0).toLocaleString()}\n` +
                        "• Clear ALL circuit breaker halts\n" +
                        "• Reset daily/weekly P&L tracking\n\n" +
                        "Use this after changing account size or starting fresh."
                      )) return;
                      try {
                        const r = await fetch("/api/account/reset-baseline", { method: "POST" });
                        if (r.ok) fetchAcctSettings();
                      } catch {}
                    }} style={{
                      background: `${C.orange}15`, border: `1px solid ${C.orange}40`,
                      color: C.orange, padding: "4px 10px", cursor: "pointer",
                      fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.5px", width: "100%", marginTop: 4,
                    }}>
                      ⟲ RESET BASELINE
                    </button>
                    <div style={{ fontSize: 7, color: C.muted, padding: "2px 4px", textAlign: "center" }}>
                      Reset initial balance + clear circuit breakers
                    </div>
                  </div>

                  {/* REMOVED: AUTO TRADING section (Rule C1 — no auto-execute in consumer) */}
                  {/* REMOVED: SCHEDULER section (Rule C1 — no auto-run calculations in consumer) */}

                </div>
              ) : expanded.trading && (
                <div style={{ padding: "8px 4px", fontSize: 8, color: C.muted }}>
                  Loading account settings...
                </div>
              )}
            </div>
          )}

          {/* ═══════════ PROVIDERS — MT5 CONNECTION ═══════════ */}
          <SectionHeader title="PROVIDERS" expanded={expanded.providers} onToggle={() => toggle("providers")} />
          {expanded.providers && (
            <div style={sectionBodyStyle}>

              {/* ── Connection Status Badge ── */}
              <div style={{
                padding: "8px 10px", marginBottom: 10,
                background: mt5Status?.simulated ? `${C.yellow}10` : mt5Status?.connected ? `${C.green}12` : `${C.red}08`,
                border: `1px solid ${mt5Status?.simulated ? C.yellow : mt5Status?.connected ? C.green : C.red}40`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: mt5Status?.simulated ? C.yellow : mt5Status?.connected ? C.green : C.red, fontFamily: mono }}>
                    {mt5Status?.simulated
                      ? "SIMULATED MARKET ● ACTIVE"
                      : `MT5 ${mt5Status?.connected ? "● CONNECTED" : "○ NOT CONNECTED"}`}
                  </div>
                  {mt5Status?.connected && mt5Status?.account && (
                    <div style={{ fontSize: 8, color: C.muted, marginTop: 2, fontFamily: mono }}>
                      Account: {mt5Status.account.login || "—"} · {mt5Status.account.server || "—"}
                      {mt5Status.account.balance != null && ` · $${mt5Status.account.balance.toLocaleString()}`}
                    </div>
                  )}
                </div>
                {!mt5Status?.simulated && <button
                  onClick={mt5Status?.connected ? disconnectMt5 : connectMt5}
                  disabled={mt5Busy}
                  style={{
                    background: mt5Status?.connected ? `${C.red}20` : `${C.green}20`,
                    border: `1px solid ${mt5Status?.connected ? C.red : C.green}50`,
                    color: mt5Status?.connected ? C.red : C.green,
                    padding: "3px 10px", cursor: mt5Busy ? "default" : "pointer",
                    fontFamily: mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.5px",
                    opacity: mt5Busy ? 0.5 : 1,
                  }}
                >
                  {mt5Busy ? "..." : mt5Status?.connected ? "DISCONNECT" : "CONNECT"}
                </button>}
              </div>

              {/* ── Error display ── */}
              {mt5Error && (
                <div style={{
                  padding: "5px 8px", marginBottom: 8,
                  background: `${C.red}12`, border: `1px solid ${C.red}40`,
                  fontSize: 8, color: C.red, fontFamily: mono,
                }}>
                  {mt5Error}
                </div>
              )}

              {/* ── Connection Method ── */}
              <div style={{ fontSize: 8, fontWeight: 700, color: C.orange, letterSpacing: "1.5px", padding: "4px 4px 6px" }}>
                CONNECTION METHOD
              </div>
              <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                {["path", "credentials"].map(method => {
                  const current = mt5Config?.connection_method || "path";
                  const isActive = current === method;
                  return (
                    <button key={method} onClick={() => saveMt5Config({ connection_method: method })} style={{
                      flex: 1, padding: "4px 8px", cursor: "pointer",
                      background: isActive ? `${C.orange}25` : "transparent",
                      border: `1px solid ${isActive ? C.orange : C.border}`,
                      color: isActive ? C.orange : C.muted,
                      fontSize: 8, fontWeight: 700, fontFamily: mono, letterSpacing: "0.5px",
                    }}>
                      {method === "path" ? "TERMINAL PATH" : "LOGIN CREDENTIALS"}
                    </button>
                  );
                })}
              </div>

              {/* ── PATH mode ── */}
              {(mt5Config?.connection_method || "path") === "path" && (
                <div style={{ marginBottom: 8 }}>
                  <div style={rowStyle}>
                    <span style={labelStyle}>MT5 TERMINAL PATH</span>
                  </div>
                  {/* v2: input + BROWSE button. Browse opens a native file
                      picker via backend so users with multiple MT5 installs
                      can pick the correct terminal64.exe without typing. */}
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      type="text"
                      value={mt5Config?.terminal_path || ""}
                      onChange={(e) => setMt5Config(prev => ({ ...prev, terminal_path: e.target.value }))}
                      onBlur={(e) => saveMt5Config({ terminal_path: e.target.value })}
                      placeholder="C:\Program Files\MetaTrader 5\terminal64.exe"
                      style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "5px 8px" }}
                    />
                    <button
                      onClick={async () => {
                        try {
                          const r = await fetch("/api/mt5/browse-terminal", { method: "POST" });
                          if (!r.ok) { setMt5Error(`Browse failed: HTTP ${r.status}`); return; }
                          const d = await r.json();
                          if (d.cancelled) return; // user hit Cancel
                          if (d.path) {
                            setMt5Config(prev => ({ ...prev, terminal_path: d.path }));
                            saveMt5Config({ terminal_path: d.path });
                            setMt5Error(null);
                          }
                        } catch (e) {
                          setMt5Error(`Browse error: ${e.message}`);
                        }
                      }}
                      title="Open file picker to select terminal64.exe"
                      style={{
                        background: `${C.orange}15`, border: `1px solid ${C.orange}50`,
                        color: C.orange, fontFamily: mono, fontSize: 9,
                        fontWeight: 800, letterSpacing: "1px",
                        padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      📁 BROWSE
                    </button>
                  </div>
                  <div style={{ fontSize: 7, color: C.muted, padding: "3px 4px" }}>
                    Click BROWSE to pick terminal64.exe. Leave blank to auto-detect the default install.
                  </div>
                </div>
              )}

              {/* ── CREDENTIALS mode ── */}
              {mt5Config?.connection_method === "credentials" && (
                <div style={{ marginBottom: 8 }}>
                  <div style={rowStyle}>
                    <span style={labelStyle}>SERVER</span>
                  </div>
                  <input
                    type="text"
                    value={mt5Config?.server || ""}
                    onChange={(e) => setMt5Config(prev => ({ ...prev, server: e.target.value }))}
                    onBlur={(e) => saveMt5Config({ server: e.target.value })}
                    placeholder="YourBroker-Live"
                    style={{ ...inputStyle, width: "100%", fontSize: 9, padding: "5px 8px", marginBottom: 6 }}
                  />

                  <div style={rowStyle}>
                    <span style={labelStyle}>LOGIN</span>
                  </div>
                  <input
                    type="text"
                    value={mt5Config?.login || ""}
                    onChange={(e) => setMt5Config(prev => ({ ...prev, login: e.target.value }))}
                    onBlur={(e) => saveMt5Config({ login: e.target.value })}
                    placeholder="12345678"
                    style={{ ...inputStyle, width: "100%", fontSize: 9, padding: "5px 8px", marginBottom: 6 }}
                  />

                  <div style={rowStyle}>
                    <span style={labelStyle}>PASSWORD</span>
                  </div>
                  <input
                    type="password"
                    value={mt5Config?.password || ""}
                    onChange={(e) => setMt5Config(prev => ({ ...prev, password: e.target.value }))}
                    onBlur={(e) => saveMt5Config({ password: e.target.value })}
                    placeholder="••••••••"
                    style={{ ...inputStyle, width: "100%", fontSize: 9, padding: "5px 8px" }}
                  />
                  <div style={{ fontSize: 7, color: C.muted, padding: "3px 4px" }}>
                    Credentials are stored locally in consumer_config — never sent to our server
                  </div>
                </div>
              )}

              {/* ── Connect button (below settings) ── */}
              <button
                onClick={connectMt5}
                disabled={mt5Busy}
                style={{
                  background: `${C.green}15`, border: `1px solid ${C.green}40`,
                  color: C.green, padding: "5px 10px", cursor: mt5Busy ? "default" : "pointer",
                  fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
                  width: "100%", marginBottom: 4, opacity: mt5Busy ? 0.5 : 1,
                }}>
                {mt5Busy ? "CONNECTING..." : mt5Status?.connected ? "↻ RECONNECT" : "CONNECT TO MT5"}
              </button>

              {/* ── Separator ── */}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />

              {/* ── USE TICK DATA toggle (v2) ── */}
              <div style={{ fontSize: 8, fontWeight: 700, color: C.orange, letterSpacing: "1.5px", padding: "0 4px 6px" }}>
                LIVE FEED
              </div>
              <ToggleRow
                label="USE TICK DATA"
                enabled={!!mt5Config.use_tick_data}
                onToggle={() => saveMt5Config({ use_tick_data: !mt5Config.use_tick_data })}
              />
              <div style={{ fontSize: 7, color: C.muted, padding: "2px 4px 8px" }}>
                Polls MT5 5×/sec instead of 1×/sec — MT5-style live tick movement on the chart's last candle.
                Turn off if you experience CPU/network load.
              </div>

              {/* ── Separator ── */}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />

              {/* ── No broker? Built-in simulated market ── */}
              <div style={{ fontSize: 8, fontWeight: 700, color: C.orange, letterSpacing: "1.5px", padding: "0 4px 6px" }}>
                NO BROKER ACCOUNT?
              </div>
              <div style={{
                padding: "8px 10px", background: `${C.cyan}10`, border: `1px solid ${C.cyan}40`,
                color: C.cyan, fontFamily: mono, fontSize: 8, lineHeight: 1.6,
              }}>
                Start the terminal with <span style={{ color: C.white, fontWeight: 700 }}>python launcher.py --sim</span> to
                trade a simulated market (Bates model) on a paper account — no broker, any OS.
              </div>
            </div>
          )}

          {/* ═══════════ PROFILES ═══════════ */}
          <SectionHeader title="PROFILES" expanded={expanded.profiles} onToggle={() => toggle("profiles")} />
          {expanded.profiles && (
            <div style={sectionBodyStyle}>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                <input value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()} placeholder="Profile name"
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={handleSaveProfile} disabled={busy === "saveProfile"} style={actionBtnStyle}>
                  {busy === "saveProfile" ? "..." : "SAVE"}
                </button>
              </div>
              {Object.keys(profiles).length === 0 ? (
                <div style={{ fontSize: 9, color: C.muted, padding: "4px 0" }}>No saved profiles yet</div>
              ) : (
                Object.entries(profiles).map(([name, data]) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", marginBottom: 2, background: C.bgPanel, border: `1px solid ${C.border}` }}>
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.white, fontFamily: mono }}>{name}</span>
                    {data.saved_at && <span style={{ fontSize: 7, color: C.muted }}>{new Date(data.saved_at).toLocaleDateString()}</span>}
                    <button onClick={() => handleQuickSaveProfile(name)} disabled={busy === `save_${name}`} title="Overwrite this profile with current workspace" style={{ ...tinyBtnStyle, color: C.cyan }}>
                      {busy === `save_${name}` ? "..." : "SAVE"}
                    </button>
                    <button onClick={() => handleLoadProfile(name)} style={{ ...tinyBtnStyle, color: C.green }}>LOAD</button>
                    <button onClick={() => handleDeleteProfile(name)} style={{ ...tinyBtnStyle, color: C.red }}>DEL</button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ═══════════ TIME ═══════════ */}
          <SectionHeader title="TIME" expanded={expanded.time} onToggle={() => toggle("time")} />
          {expanded.time && (() => {
            const timeConfig = config._raw?.time || { ...DEFAULT_TIME_CONFIG };
            const mainTime = timeConfig.mainTime || "local";
            const mainTimeOffset = timeConfig.mainTimeOffset || 0;
            const showWorldClock = timeConfig.showWorldClock !== false;
            const worldClocks = timeConfig.worldClocks || DEFAULT_TIME_CONFIG.worldClocks;

            const updateTime = (patch) => updateConfig({ time: { ...timeConfig, ...patch } });
            const updateWorldSlot = (idx, patch) => {
              const next = worldClocks.map((s, i) => i === idx ? { ...s, ...patch } : s);
              updateTime({ worldClocks: next });
            };

            return (
              <div style={sectionBodyStyle}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.orange, fontFamily: mono, letterSpacing: "1px", marginBottom: 6 }}>
                    MAIN CLOCK (HEADER)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {TZ_OPTIONS.filter(t => t.key !== "manual").map(tz => (
                      <button key={tz.key} onClick={() => updateTime({ mainTime: tz.key })} style={{
                        background: mainTime === tz.key ? `${C.orange}20` : "transparent",
                        color: mainTime === tz.key ? C.orange : C.muted,
                        border: `1px solid ${mainTime === tz.key ? C.orange + "50" : C.border}`,
                        padding: "2px 6px", cursor: "pointer", fontSize: "7px", fontWeight: 700, fontFamily: mono,
                      }}>{tz.label}</button>
                    ))}
                    <button onClick={() => updateTime({ mainTime: "manual" })} style={{
                      background: mainTime === "manual" ? `${C.orange}20` : "transparent",
                      color: mainTime === "manual" ? C.orange : C.muted,
                      border: `1px solid ${mainTime === "manual" ? C.orange + "50" : C.border}`,
                      padding: "2px 6px", cursor: "pointer", fontSize: "7px", fontWeight: 700, fontFamily: mono,
                    }}>MANUAL</button>
                  </div>
                  {mainTime === "manual" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 8, color: C.muted, fontFamily: mono }}>GMT OFFSET</span>
                      <input type="number" min={-12} max={14} step={0.5} value={mainTimeOffset}
                        onChange={(e) => updateTime({ mainTimeOffset: parseFloat(e.target.value) || 0 })}
                        style={{ width: 50, background: C.bgPanel, border: `1px solid ${C.border}`, color: C.white, fontSize: 9, fontFamily: mono, textAlign: "center", padding: "2px 4px" }} />
                      <span style={{ fontSize: 7, color: C.muted, fontFamily: mono }}>hours</span>
                    </div>
                  )}
                </div>
                <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, fontFamily: mono, letterSpacing: "1px" }}>WORLD CLOCK</span>
                    <ToggleRow label="" enabled={showWorldClock} onToggle={() => updateTime({ showWorldClock: !showWorldClock })} />
                  </div>
                  <div style={{ fontSize: 7, color: C.muted, fontFamily: mono, marginBottom: 8 }}>
                    4 slots · orange = in session · gray = out of session
                  </div>
                  {worldClocks.map((slot, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, opacity: slot.enabled ? 1 : 0.4 }}>
                      <button onClick={() => updateWorldSlot(idx, { enabled: !slot.enabled })} style={{
                        width: 14, height: 14, borderRadius: 2,
                        border: `1px solid ${slot.enabled ? C.orange : C.border}`,
                        background: slot.enabled ? `${C.orange}30` : "transparent",
                        cursor: "pointer", padding: 0, flexShrink: 0,
                        color: slot.enabled ? C.orange : C.muted, fontSize: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{slot.enabled ? "✓" : ""}</button>
                      <span style={{ fontSize: 8, color: C.muted, fontFamily: mono, width: 16, textAlign: "center" }}>{idx + 1}</span>
                      <select value={slot.city} onChange={(e) => updateWorldSlot(idx, { city: e.target.value })} style={{
                        flex: 1, background: C.bgPanel, border: `1px solid ${C.border}`,
                        color: C.white, fontSize: 8, fontFamily: mono, padding: "2px 4px", cursor: "pointer",
                      }}>
                        {TZ_OPTIONS.filter(t => t.key !== "local" && t.key !== "manual").map(tz => (
                          <option key={tz.key} value={tz.key}>{tz.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ═══════════ MAINTENANCE — Sync, Cache, Restart ═══════════ */}
          <SectionHeader title="MAINTENANCE" expanded={expanded.maintenance} onToggle={() => toggle("maintenance")} />
          {expanded.maintenance && (
            <div style={sectionBodyStyle}>

              {/* ── Status block ── */}
              <div style={{
                padding: "8px 10px", marginBottom: 10,
                background: C.bgCard, border: `1px solid ${C.border}`,
                fontSize: 8, color: C.muted, fontFamily: mono, lineHeight: 1.7,
              }}>
                <div>LAST SYNC: <span style={{ color: C.white }}>{syncStatus?.last_synced_at || "—"}</span></div>
                <div>ANALYSIS DATE: <span style={{ color: C.white }}>{syncStatus?.analysis_date || "—"}</span></div>
                {syncStatus?.server_configured === false ? (
                  <div>DATA SERVER: <span style={{ color: C.white }}>NONE — LOCAL DATA FILES ONLY</span></div>
                ) : (
                  <div>OFFLINE MODE: <span style={{ color: syncStatus?.offline_mode ? C.red : C.green }}>
                    {syncStatus?.offline_mode ? "YES" : "NO"}
                  </span></div>
                )}
                <div>AUTO-POLL: <span style={{ color: C.white }}>
                  EVERY {pollConfig?.interval_seconds ? Math.round(pollConfig.interval_seconds / 60) : 5} MIN
                </span></div>
                <div>SYNCED TICKERS: <span style={{ color: C.white }}>{syncStatus?.synced_tickers?.length || 0}</span></div>
                {syncStatus?.sync_errors?.length > 0 && (
                  <div style={{ color: C.red, marginTop: 4 }}>
                    ERRORS: {syncStatus.sync_errors.length}
                  </div>
                )}
              </div>

              {/* ── Force refresh ── */}
              <button
                onClick={handleForceRefresh}
                disabled={busy === "refresh"}
                style={{
                  background: `${C.orange}20`, border: `1px solid ${C.orange}60`,
                  color: C.orange, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                  fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                  width: "100%", marginBottom: 2,
                }}
              >
                {busy === "refresh" ? "REFRESHING…" : "↻ FORCE REFRESH NOW"}
              </button>
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                Re-download all data from server immediately
              </div>

              {/* ── Clear cache ── */}
              <button
                onClick={handleClearCache}
                disabled={busy === "clearCache"}
                style={{
                  background: `${C.yellow}15`, border: `1px solid ${C.yellow}40`,
                  color: C.yellow, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                  fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                  width: "100%", marginBottom: 2,
                }}
              >
                {busy === "clearCache" ? "CLEARING…" : "🗑 CLEAR DATA CACHE"}
              </button>
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                Move cache → _trash, then re-sync (recoverable)
              </div>

              {/* ── Reload browser ── */}
              <button
                onClick={handleReloadBrowser}
                style={{
                  background: `${C.cyan}15`, border: `1px solid ${C.cyan}40`,
                  color: C.cyan, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                  fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                  width: "100%", marginBottom: 2,
                }}
              >
                ⟳ RELOAD BROWSER
              </button>
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                Hard-reload UI + clear browser cache
              </div>

              {/* ── Restart terminal ── */}
              <button
                onClick={handleRestartTerminal}
                disabled={busy === "restart"}
                style={{
                  background: `${C.red}15`, border: `1px solid ${C.red}40`,
                  color: C.red, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                  fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                  width: "100%", marginBottom: 2,
                }}
              >
                {busy === "restart" ? "RESTARTING…" : "⏻ RESTART TERMINAL"}
              </button>
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                Restart backend process (auto-reloads UI)
              </div>

            </div>
          )}

          {/* REMOVED: DEVELOPER section (Rule C1 — no subprocess debug mode) */}

          {/* ══════════ ABOUT ══════════ */}
          <SectionHeader title="ABOUT" expanded={expanded.about} onToggle={() => toggle("about")} />
          {expanded.about && (
            <div style={sectionBodyStyle}>
              {/* Version block */}
              <div style={{
                padding: "8px 10px", marginBottom: 10,
                background: C.bgCard, border: `1px solid ${C.border}`,
                fontSize: 8, color: C.muted, fontFamily: mono, lineHeight: 1.7,
              }}>
                <div>INSTALLED: <span style={{ color: C.white }}>v{appVer.current || "—"}</span></div>
                <div>LATEST: <span style={{ color: appVer.updateAvailable ? C.orange : C.green }}>
                  v{appVer.latest || "—"}{appVer.releasedAt ? ` · ${appVer.releasedAt}` : ""}
                </span></div>
                {appVer.updateAvailable && appVer.bannerMessage && (
                  <div style={{ marginTop: 4, color: C.muted, fontSize: 7, lineHeight: 1.5 }}>
                    {appVer.bannerMessage}
                  </div>
                )}
              </div>

              {/* Download button (only if outdated) */}
              {appVer.updateAvailable && (
                <>
                  <button
                    onClick={() => {
                      try {
                        window.dispatchEvent(new CustomEvent("mk:open-updater"));
                      } catch {}
                    }}
                    style={{
                      background: `${C.orange}20`, border: `1px solid ${C.orange}60`,
                      color: C.orange, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                      fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                      width: "100%", marginBottom: 2,
                    }}
                  >
                    ⇩ DOWNLOAD LATEST VERSION
                  </button>
                  <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                    Opens the release page on GitHub
                  </div>
                </>
              )}

              {/* Check for updates button */}
              <button
                onClick={() => appVer.refetch()}
                style={{
                  background: "transparent", border: `1px solid ${C.border}`,
                  color: C.muted, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                  fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                  width: "100%", marginBottom: 2,
                }}
              >
                {appVer.loading ? "CHECKING…" : "↻ CHECK FOR UPDATES"}
              </button>
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                Compares with the latest GitHub release
              </div>

              {/* Project / support */}
              <button
                onClick={() => { try { window.open("https://github.com/wJubran/QuantumTerminal/issues", "_blank", "noopener,noreferrer"); } catch {} }}
                style={{
                  background: `${C.cyan}15`, border: `1px solid ${C.cyan}40`,
                  color: C.cyan, padding: "6px 10px", fontSize: 9, fontWeight: 700,
                  fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
                  width: "100%", marginBottom: 2,
                }}
              >
                ⧉ GITHUB · REPORT AN ISSUE
              </button>
              <div style={{ fontSize: 7, color: C.muted, padding: "0 4px 8px", textAlign: "center" }}>
                Quantum Terminal is free and open source (MIT)
              </div>
            </div>
          )}

          <div style={{ height: 40 }} />
        </div>
      </div>
    </div>
  );
}


// ── Sub-components ──

function SectionHeader({ title, count, expanded, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", width: "100%",
      padding: "8px 12px", background: C.bgPanel, border: "none",
      borderBottom: `1px solid ${C.border}`, cursor: "pointer",
    }}>
      <span style={{ fontSize: 8, color: C.muted, marginRight: 6, fontFamily: mono }}>{expanded ? "▼" : "▶"}</span>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "2px", color: C.orange, fontFamily: mono }}>{title}</span>
      {count !== undefined && <span style={{ fontSize: 8, color: C.muted, marginLeft: 6, fontFamily: mono }}>({count})</span>}
      <div style={{ flex: 1 }} />
    </button>
  );
}

function ToggleRow({ label, enabled, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 4px" }}>
      <span style={{ fontSize: 9, color: enabled ? C.white : C.muted, fontFamily: mono }}>{label}</span>
      <button onClick={onToggle} style={{
        width: 30, height: 14, borderRadius: 7, border: "none", cursor: "pointer",
        background: enabled ? C.orange : C.border, position: "relative", transition: "background 0.2s",
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: 5,
          background: C.white, position: "absolute", top: 2,
          left: enabled ? 18 : 2, transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}


// ── Styles ──

const overlayStyle = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "flex-end",
};

const panelStyle = {
  width: 340, maxWidth: "90vw", height: "100vh",
  background: C.bg, borderLeft: `1px solid ${C.border}`,
  display: "flex", flexDirection: "column",
  fontFamily: mono, fontSize: 11, animation: "slideIn 0.15s ease-out",
};

const headerStyle = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
};

const closeBtnStyle = {
  background: "transparent", border: `1px solid ${C.border}`,
  color: C.muted, cursor: "pointer", padding: "2px 8px", fontSize: 12, fontFamily: mono,
};

const sectionBodyStyle = {
  padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
};

const rowStyle = {
  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0",
};

const labelStyle = {
  fontSize: 8, color: C.muted, fontWeight: 700, letterSpacing: "1.5px", fontFamily: mono,
};

const inputStyle = {
  background: C.bgPanel, border: `1px solid ${C.border}`,
  color: C.white, padding: "4px 8px", fontSize: 10, fontFamily: mono, outline: "none", width: 90,
};

const actionBtnStyle = {
  background: `${C.orange}20`, border: `1px solid ${C.orange}60`,
  color: C.orange, padding: "4px 10px", fontSize: 8,
  fontWeight: 700, fontFamily: mono, letterSpacing: "1px", cursor: "pointer",
};

const tinyBtnStyle = {
  background: "transparent", border: "none",
  cursor: "pointer", fontSize: 9, fontWeight: 700, fontFamily: mono, padding: "1px 4px",
};