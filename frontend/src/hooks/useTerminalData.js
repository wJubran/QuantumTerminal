// version: v4
/**
 * useTerminalData — Consumer Terminal Data Store
 * ═══════════════════════════════════════════════
 * Quantum Terminal | Display-Only
 *
 * v4 — Added inert window.__mkDebugHandle publish for the disposable
 *      debug-telemetry harness. No effect when the harness isn't loaded.
 *      See docs/specs/2026-05-05-debug-telemetry-harness-design.md.
 *
 * v2 — refreshSync() now dispatches mk:data-sync-complete so per-ticker
 *      panels (MainChart cones/bands/anchors, OptionsPanel heatmap cones)
 *      refetch on the "Refresh data" button, watcher trigger, or periodic
 *      sync without requiring a browser reload.
 *
 * Connects to the LOCAL data server via WebSocket (prices) and REST,
 * merges everything into a single state object consumed by the terminal.
 *
 * CONSUMER DIFFERENCES FROM PRO:
 *   - No orchestrator (runOrchestrator removed — Rule C1)
 *   - No CALC ALL, no calculation triggers
 *   - Adds data sync status polling (data_sync_client integration)
 *   - orchStatus removed from return value
 *
 * Data flow:
 *   useConfig()    → asset metadata, universe, display prefs (from /api/config)
 *   WS /ws/prices  → live tick updates → assetsData[].price, bid, ask
 *   WS /ws/events  → triggers selective REST fetches
 *   REST /api/payload        → quant data (cones, OU, GARCH, HMM) — from sync cache
 *   REST /api/signals        → signal engine decisions
 *   REST /api/lifecycle      → signal lifecycle state (active signals)
 *   REST /api/bars/{ticker}  → historical bars for chart
 *   REST /api/state          → weekly state (regime, anchors)
 *   REST /api/sync/status    → data sync freshness (Rule C4)
 *
 * This module does NOT introduce any calculation triggers.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useWebSocket from "./useWebSocket";
import useConfig from "./useConfig";

// ── Server connection ──
const API_BASE = "";  // relative — same origin in production, proxied in dev

// WebSocket: same-origin in production (PyInstaller .exe serves React + FastAPI from :8502),
// direct backend in dev mode (webpack-dev-server v4 swallows /ws upgrades for HMR even when
// HMR is moved off /ws — see setupProxy.log diagnostic, 2026-04-07).
// Backend host in dev is read from REACT_APP_DEV_BACKEND if set, defaults to 127.0.0.1:8502.
const _isDev = process.env.NODE_ENV === "development";
const _wsProto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
const _devBackend = process.env.REACT_APP_DEV_BACKEND || "127.0.0.1:8502";
const _wsHost = _isDev
  ? _devBackend
  : (typeof window !== "undefined" ? window.location.host : "127.0.0.1:8502");
const WS_PRICES = `${_wsProto}//${_wsHost}/ws/prices`;
const WS_EVENTS = `${_wsProto}//${_wsHost}/ws/events`;

// ── Safe JSON fetch ──
async function apiFetch(path, isPost = false) {
  try {
    const opts = isPost ? { method: "POST" } : {};
    const r = await fetch(`${API_BASE}${path}`, opts);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * Map orchestrator weekly_state fields → asset display fields.
 */
const WEEKLY_STATE_FIELD_MAP = [
  { source: "regime_label",      target: "hmm.regime" },
  { source: "regime_confidence", target: "hmm.confidence" },
  { source: "regime_probs",      target: "hmm.state_probabilities" },
  { source: "mcs_character",     target: "ou.strategy", transform: v => {
    if (v === "mean_reverting") return "FADE";
    if (v === "trending") return "BREAKOUT";
    return "NEUTRAL";
  }},
  { source: "mcs_score",         target: "ou.mcs_score" },
  { source: "hurst",             target: "ou.hurst" },
  { source: "ou_half_life",      target: "ou.half_life" },
  { source: "adf_pvalue",        target: "ou.adf_pvalue" },
  { source: "cone_bias",         target: "cone.bias", transform: v => (v || "neutral").toUpperCase() },
  { source: "cone_upside_prob",  target: "cone.upside_prob" },
  { source: "cone_sd1_low_terminal",  target: "cone.sd1_low" },
  { source: "cone_sd1_high_terminal", target: "cone.sd1_high" },
  { source: "cone_current_price",     target: "cone.median_target" },
  { source: "garch_forecast_vol", target: "garch.vol_forecast" },
  { source: "garch_vol_regime",   target: "garch.vol_regime", transform: v => (v || "NORMAL").toUpperCase() },
  { source: "wf_sd1_coverage",   target: "wf.sd1_coverage" },
  { source: "wf_direction_hit",  target: "wf.direction_hit" },
  { source: "wf_param_window",   target: "wf.source" },
  { source: "cone_model",        target: "wf.model" },
];

function applyWeeklyStateToAsset(asset, weeklyAsset) {
  if (!weeklyAsset) return asset;
  const merged = { ...asset };

  for (const mapping of WEEKLY_STATE_FIELD_MAP) {
    let value = weeklyAsset[mapping.source];
    if (value === undefined || value === null) continue;
    if (mapping.transform) value = mapping.transform(value);

    const parts = mapping.target.split(".");
    if (parts.length === 1) {
      merged[parts[0]] = value;
    } else {
      const [group, field] = parts;
      merged[group] = { ...(merged[group] || {}), [field]: value };
    }
  }

  merged._weeklyStateAt = weeklyAsset.computed_at || null;
  return merged;
}

export default function useTerminalData() {
  // ── Config from server ──
  const configHook = useConfig();
  const { config, refreshConfig } = configHook;

  // ── Core state ──
  const [assets, setAssets] = useState(new Map());
  const [signals, setSignals] = useState({});
  const [lifecycle, setLifecycle] = useState(null);
  const [weeklyState, setWeeklyState] = useState(null);
  const [mt5Connected, setMt5Connected] = useState(false);
  // Active data feed from /api/health — the built-in simulator reports
  // provider.simulated so the UI can say its prices are not real.
  const [feed, setFeed] = useState({ type: "mt5", simulated: false });
  const [dataReady, setDataReady] = useState(false);

  // ── Data sync status (consumer-specific — Rule C4) ──
  const [syncStatus, setSyncStatus] = useState(null);

  // ── Track previous prices for flash coloring ──
  const prevPrices = useRef(new Map());
  const initialLoadDone = useRef(false);

  // ── WebSocket connections ──
  const prices = useWebSocket(WS_PRICES);
  const events = useWebSocket(WS_EVENTS);

  // ── Initial data load ──
  useEffect(() => {
    if (!config || initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      // 1. Health check
      const health = await apiFetch("/api/health");
      if (health) {
        setMt5Connected(health.mt5_connected);
        setFeed({
          type: health.provider?.type || "mt5",
          simulated: !!health.provider?.simulated,
        });

        const initial = new Map();
        const universe = health.universe || config.universe || [];
        const assetMeta = config.assetMeta || {};

        for (const ticker of universe) {
          const meta = assetMeta[ticker] || { class: "OTHER", decimals: 2 };
          initial.set(ticker, {
            ticker,
            asset_class: meta.class || "OTHER",
            decimals: meta.decimals ?? 2,
            price: 0, bid: 0, ask: 0, spread: 0,
            pct_change_1d: 0, pct_change_1w: 0,
            last_tick_time: null,
            candles: [], projections: {},
            ou: null, garch: null, hmm: null, cone: null,
            risk: null, wf: null, ou_wf: null, kelly: null,
          });
        }
        setAssets(initial);

        // 1b. Seed live prices via REST
        const tickData = await apiFetch("/api/ticks");
        if (tickData && tickData.ticks) {
          setAssets(prev => {
            const next = new Map(prev);
            for (const [ticker, tick] of Object.entries(tickData.ticks)) {
              const existing = next.get(ticker);
              if (existing && tick.last) {
                next.set(ticker, {
                  ...existing,
                  price: tick.last, bid: tick.bid, ask: tick.ask,
                  spread: tick.spread, last_tick_time: tick.time,
                });
              }
            }
            return next;
          });
        }
      }

      // 2. Load terminal payload (quant data — from server sync cache)
      const payload = await apiFetch("/api/payload");
      if (payload && payload.assets) {
        setAssets(prev => {
          const next = new Map(prev);
          for (const [ticker, data] of Object.entries(payload.assets)) {
            const existing = next.get(ticker);
            if (!existing) continue;
            next.set(ticker, { ...existing, ...data });
          }
          return next;
        });
      }

      // 3. Load signals
      const sigData = await apiFetch("/api/signals");
      if (sigData && typeof sigData === "object") setSignals(sigData);

      // 3b. Load lifecycle
      const lcData = await apiFetch("/api/lifecycle");
      if (lcData && typeof lcData === "object") setLifecycle(lcData);

      // 4. Load weekly state
      const state = await apiFetch("/api/state");
      if (state) setWeeklyState(state);

      // 5. Load data sync status (consumer — Rule C4)
      const sync = await apiFetch("/api/sync/status");
      if (sync) setSyncStatus(sync);

      setDataReady(true);
    })();
  }, [config]);

  // ── Merge weekly_state into asset rows ──
  useEffect(() => {
    if (!weeklyState?.assets) return;
    setAssets(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const [ticker, wsData] of Object.entries(weeklyState.assets)) {
        const existing = next.get(ticker);
        if (!existing) continue;
        const merged = applyWeeklyStateToAsset(existing, wsData);
        if (merged !== existing) {
          next.set(ticker, merged);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [weeklyState]);

  // ── Process incoming price ticks ──
  useEffect(() => {
    if (!prices.lastMessage) return;
    const msg = prices.lastMessage;

    if (msg.type === "ticks_batch" && msg.ticks) {
      setAssets(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [ticker, tick] of Object.entries(msg.ticks)) {
          const existing = next.get(ticker);
          if (!existing) continue;
          prevPrices.current.set(ticker, existing.price);
          next.set(ticker, {
            ...existing,
            price: tick.last, bid: tick.bid, ask: tick.ask,
            spread: tick.spread, last_tick_time: tick.time,
          });
          changed = true;
        }
        return changed ? next : prev;
      });
    }

    if (msg.type === "tick") {
      setAssets(prev => {
        const next = new Map(prev);
        const existing = next.get(msg.ticker);
        if (!existing) return prev;
        prevPrices.current.set(msg.ticker, existing.price);
        next.set(msg.ticker, {
          ...existing,
          price: msg.last, bid: msg.bid, ask: msg.ask,
          spread: msg.spread, last_tick_time: msg.time,
        });
        return next;
      });
    }

    if (msg.type === "bar") {
      setAssets(prev => {
        const next = new Map(prev);
        const existing = next.get(msg.ticker);
        if (!existing) return prev;
        const candles = [...(existing.candles || [])];
        const newBar = {
          t: msg.bar.time, o: msg.bar.open, h: msg.bar.high,
          l: msg.bar.low, c: msg.bar.close, v: msg.bar.volume,
        };
        if (candles.length > 0 && candles[candles.length - 1].t === newBar.t) {
          // Update current forming bar
          candles[candles.length - 1] = newBar;
        } else {
          // New completed bar
          candles.push(newBar);
          if (candles.length > 300) candles.shift();
        }
        next.set(msg.ticker, { ...existing, candles });
        return next;
      });
    }
  }, [prices.lastMessage]);

  // ── Debounced state refresh ──
  const refreshTimers = useRef({});
  const debouncedRefresh = useCallback((key, fn, delay = 1500) => {
    if (refreshTimers.current[key]) clearTimeout(refreshTimers.current[key]);
    refreshTimers.current[key] = setTimeout(fn, delay);
  }, []);

  // ── Process incoming events ──
  useEffect(() => {
    if (!events.lastMessage) return;
    const msg = events.lastMessage;

    if (msg.type === "payload_update") {
      if (msg.tickers_updated && msg.tickers_updated.length > 0) {
        msg.tickers_updated.forEach(async (ticker) => {
          const data = await apiFetch(`/api/payload/${ticker}`);
          if (data) {
            setAssets(prev => {
              const next = new Map(prev);
              const existing = next.get(ticker);
              if (!existing) return prev;
              next.set(ticker, { ...existing, ...data });
              return next;
            });
          }
        });
      }
    }

    if (msg.type === "state_update") {
      if (msg.source === "daily_signals" || msg.source === "signal_lifecycle") {
        debouncedRefresh("signals", () => {
          apiFetch("/api/signals").then(data => { if (data) setSignals(data); });
          apiFetch("/api/lifecycle").then(data => { if (data) setLifecycle(data); });
        });
      }
      if (msg.source === "weekly_state") {
        debouncedRefresh("weekly", () => {
          apiFetch("/api/state").then(data => { if (data) setWeeklyState(data); });
        });
      }
    }

    if (msg.type === "signal_transition" || msg.type === "new_signals") {
      debouncedRefresh("signals", () => {
        apiFetch("/api/signals").then(data => { if (data) setSignals(data); });
        apiFetch("/api/lifecycle").then(data => { if (data) setLifecycle(data); });
      });
    }

    // ── Consumer: periodic background sync delivered new data ──
    // Fired by periodic_sync.py whenever sync_all() pulls fresh files.
    // Refresh all global panels and notify per-ticker components via DOM event.
    if (msg.type === "data_sync_complete") {
      console.log(`[sync] data_sync_complete: ${msg.synced || 0} new files`);
      debouncedRefresh("sync_all", () => {
        apiFetch("/api/payload").then(payload => {
          if (payload && payload.assets) {
            setAssets(prev => {
              const next = new Map(prev);
              for (const [ticker, data] of Object.entries(payload.assets)) {
                const existing = next.get(ticker);
                if (!existing) continue;
                next.set(ticker, { ...existing, ...data });
              }
              return next;
            });
          }
        });
        apiFetch("/api/signals").then(d => { if (d) setSignals(d); });
        apiFetch("/api/lifecycle").then(d => { if (d) setLifecycle(d); });
        apiFetch("/api/state").then(d => { if (d) setWeeklyState(d); });
        apiFetch("/api/sync/status").then(d => { if (d) setSyncStatus(d); });
      }, 500);
      // Notify per-ticker panels (cones, options, money flow) via DOM event
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("mk:data-sync-complete", { detail: msg }));
        }
      } catch { /* non-critical */ }
    }

    // ── Config changed ──
    if (msg.type === "config_update") {
      refreshConfig();
    }

    // NOTE: orchestrator_complete event is ignored in consumer —
    // data updates come via data_sync_client polling, not local orchestrator.
  }, [events.lastMessage, debouncedRefresh, refreshConfig]);

  // ── Poll data sync status — adaptive cadence (v3) ──
  // While `sync_in_progress` is true, poll every 1.5s so the toolbar's
  //   download progress bar feels live. Once sync settles, drop back to
  //   60s for the standard staleness checks (Rule C4).
  // Self-rescheduling setTimeout instead of setInterval so the cadence
  //   can change between ticks without restarting the chain.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      if (cancelled) return;
      const sync = await apiFetch("/api/sync/status");
      if (cancelled) return;
      if (sync) setSyncStatus(sync);
      const inProgress = !!sync?.sync_in_progress;
      const next = inProgress ? 1500 : 60_000;
      timer = setTimeout(tick, next);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  // ── On-demand bar fetch ──
  const fetchBars = useCallback(async (ticker, timeframe = "M15", count = 200) => {
    const data = await apiFetch(`/api/bars/${ticker}?timeframe=${timeframe}&count=${count}`);
    if (data && data.bars) {
      const candles = data.bars.map(b => ({
        t: b.time, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume,
      }));
      setAssets(prev => {
        const next = new Map(prev);
        const existing = next.get(ticker);
        if (!existing) return prev;
        // Skip update if last bar unchanged — prevents chart flicker on periodic refresh
        const oldCandles = existing.candles || [];
        if (oldCandles.length > 0 && candles.length > 0) {
          const oldLast = oldCandles[oldCandles.length - 1];
          const newLast = candles[candles.length - 1];
          if (oldLast.t === newLast.t && oldCandles.length === candles.length
              && Math.abs(oldLast.c - newLast.c) < 1e-8) {
            return prev; // identical — skip
          }
        }
        next.set(ticker, { ...existing, candles });
        return next;
      });
      return candles;
    }
    return [];
  }, []);

  // ── Force data re-sync (consumer — calls data_sync_client.sync_all) ──
  const refreshSync = useCallback(async () => {
    const result = await apiFetch("/api/sync/refresh", true);

    // Refresh global panels (same endpoints the data_sync_complete WS handler hits).
    apiFetch("/api/payload").then(payload => {
      if (payload && payload.assets) {
        setAssets(prev => {
          const next = new Map(prev);
          for (const [ticker, data] of Object.entries(payload.assets)) {
            const existing = next.get(ticker);
            if (!existing) continue;
            next.set(ticker, { ...existing, ...data });
          }
          return next;
        });
      }
    });
    apiFetch("/api/signals").then(d => { if (d) setSignals(d); });
    apiFetch("/api/lifecycle").then(d => { if (d) setLifecycle(d); });
    apiFetch("/api/state").then(d => { if (d) setWeeklyState(d); });
    const sync = await apiFetch("/api/sync/status");
    if (sync) setSyncStatus(sync);

    // Notify per-ticker panels (cones, bands, anchors, options heatmap) so
    // they refetch their own endpoints. Same DOM event the WS handler fires.
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("mk:data-sync-complete", {
          detail: { source: "refresh_button", synced: result?.synced || 0 },
        }));
      }
    } catch { /* non-critical */ }

    return result;
  }, []);

  // ── Sorted array for rendering ──
  const classOrder = { FX: 0, INDEX: 1, COMMODITY: 2, OTHER: 3 };
  const assetsArray = useMemo(() => {
    return Array.from(assets.values()).sort((a, b) => {
      const ca = classOrder[a.asset_class] ?? 3;
      const cb = classOrder[b.asset_class] ?? 3;
      if (ca !== cb) return ca - cb;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [assets]);

  // ── Previous price lookup ──
  const getPrevPrice = useCallback((ticker) => {
    return prevPrices.current.get(ticker) || 0;
  }, []);

  // ── Server status ──
  const serverStatus = useMemo(() => ({
    connected: prices.isConnected || events.isConnected,
    mt5Connected,
    feedType: feed.type,
    simulated: feed.simulated,
    wsPrice: prices.isConnected,
    wsEvent: events.isConnected,
    dataReady,
  }), [prices.isConnected, events.isConnected, mt5Connected, feed, dataReady]);

  // Disposable debug-telemetry handle. Inert in production — only the
  // mk_debug_telemetry harness reads this. See:
  //   docs/specs/2026-05-05-debug-telemetry-harness-design.md
  // Intentionally no deps array: the effect runs after every render so
  // __mkDebugHandle stays fresh; the harness samples it on a 30s timer.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const signalsLen = Array.isArray(signals)
      ? signals.length
      : (signals && typeof signals === "object" ? Object.keys(signals).length : 0);
    window.__mkDebugHandle = {
      assets,
      barsLen: 0, // populated by MainChart's separate publish if available
      signalsLen,
    };
  });

  return {
    config,
    configHook,
    assets,
    assetsArray,
    signals,
    lifecycle,
    weeklyState,
    syncStatus,       // Consumer: data sync freshness info (Rule C4)
    serverStatus,
    fetchBars,
    getPrevPrice,
    refreshSync,      // Consumer: trigger full re-sync from server
  };
}