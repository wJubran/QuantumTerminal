// version: v2
/**
 * useConfig — Terminal configuration hook.
 *
 * Single source of truth for all terminal configuration.
 * Replaces the hardcoded ASSET_META dict in useTerminalData.js.
 *
 * Data flow:
 *   Mount → GET /api/config → configRef
 *   User changes setting → PATCH /api/config → server writes user_config.json
 *   WS event "config_update" → re-fetch config
 *
 * What it provides:
 *   config.universe          — active tickers list (display order)
 *   config.assetMeta         — { ticker: { class, decimals, aliases } }
 *   config.display           — { theme, chart_height, visible_panels, chart_layers }
 *   config.providers         — { active_data, active_execution, accounts, status }
 *   config.modules           — { enabled: [...] }
 *   config.profiles          — saved profile list
 *   config.timeframes        — available timeframe strings
 *   config.providerTypes     — available provider type names
 *
 * Mutation helpers:
 *   updateConfig(patch)      — PATCH /api/config with partial update
 *   addTicker(ticker, meta)  — POST /api/config/tickers
 *   removeTicker(ticker)     — DELETE /api/config/tickers/{ticker}
 *   toggleTicker(ticker)     — POST /api/config/tickers/{ticker}/toggle
 *   reorderTickers(order)    — PUT /api/config/tickers/order
 *   saveProfile(name)        — POST /api/config/profiles
 *   loadProfile(name)        — POST /api/config/profiles/{name}/load
 *   deleteProfile(name)      — DELETE /api/config/profiles/{name}
 *
 * Usage:
 *   const { config, loading, updateConfig, addTicker } = useConfig();
 *   const decimals = config.assetMeta["XAUUSD"]?.decimals ?? 2;
 */

import { useState, useEffect, useCallback, useRef } from "react";

// REST calls use relative paths — CRA proxy forwards to data server
const API_BASE = "";

async function apiFetch(path, options = {}) {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error(`[useConfig] API error: ${path}`, e);
    return null;
  }
}

/**
 * Transform raw server config into the shape components expect.
 * Keeps the wire format decoupled from component consumption.
 */
function transformConfig(raw) {
  if (!raw) return null;

  const uni = raw.universe || {};
  const display = raw.display || {};
  const providers = raw.providers || {};

  // Build display-ordered universe (active minus hidden)
  const active = uni.active_tickers || [];
  const hidden = new Set(uni.hidden_tickers || []);
  const order = uni.display_order || [];

  let displayUniverse;
  if (order.length > 0) {
    const activeSet = new Set(active.filter((t) => !hidden.has(t)));
    displayUniverse = order.filter((t) => activeSet.has(t));
    // Append any active tickers not in custom order
    active.forEach((t) => {
      if (!hidden.has(t) && !displayUniverse.includes(t)) {
        displayUniverse.push(t);
      }
    });
  } else {
    displayUniverse = active.filter((t) => !hidden.has(t));
  }

  return {
    // Universe
    universe: displayUniverse,
    allTickers: active,
    hiddenTickers: Array.from(hidden),
    assetMeta: raw.asset_metadata || {},
    customTickers: uni.custom_tickers || {},
    quantSupported: raw.quant_supported_tickers || [],
    // v2: per-ticker data-type map for dot-color classification in Settings
    quantDataTypes: raw.quant_data_types || {},

    // Display
    display: {
      theme: display.theme || "dark",
      defaultTimeframe: display.default_timeframe || "M15",
      defaultLookbackBars: display.default_lookback_bars || 200,
      chartHeight: display.chart_height || 420,
      visiblePanels: display.visible_panels || {},
      chartLayers: display.chart_layers || {},
    },

    // Providers
    providers: {
      activeData: providers.active_data || "mt5_default",
      activeExecution: providers.active_execution || "mt5_default",
      accounts: providers.accounts || {},
      status: raw.provider_status || {},
    },

    // Modules
    modules: raw.modules || { enabled: [] },

    // Profiles
    profiles: raw.profiles || {},

    // Available options
    timeframes: raw.available_timeframes || [
      "M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1",
    ],
    providerTypes: raw.available_provider_types || ["mt5"],

    // Raw (escape hatch for edge cases)
    _raw: raw,
  };
}

export default function useConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configRef = useRef(null);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      const raw = await apiFetch("/api/config");
      if (raw) {
        const transformed = transformConfig(raw);
        setConfig(transformed);
        configRef.current = transformed;
        setError(null);
      } else {
        setError("Failed to load config from server");
      }
      setLoading(false);
    })();
  }, []);

  // ── Refresh (called after mutations or WS events) ──
  const refreshConfig = useCallback(async () => {
    const raw = await apiFetch("/api/config");
    if (raw) {
      const transformed = transformConfig(raw);
      setConfig(transformed);
      configRef.current = transformed;
      return transformed;
    }
    return null;
  }, []);

  // ── Generic PATCH ──
  const updateConfig = useCallback(
    async (patch) => {
      const result = await apiFetch("/api/config", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (result) {
        const transformed = transformConfig(result);
        setConfig(transformed);
        configRef.current = transformed;
        return transformed;
      }
      return null;
    },
    []
  );

  // ── Universe Helpers ──

  const addTicker = useCallback(
    async (ticker, metadata = null) => {
      const result = await apiFetch("/api/config/tickers", {
        method: "POST",
        body: JSON.stringify({ ticker, metadata }),
      });
      if (result?.success) {
        await refreshConfig();
        return true;
      }
      return false;
    },
    [refreshConfig]
  );

  const removeTicker = useCallback(
    async (ticker) => {
      const result = await apiFetch(`/api/config/tickers/${ticker}`, {
        method: "DELETE",
      });
      if (result?.success) {
        await refreshConfig();
        return true;
      }
      return false;
    },
    [refreshConfig]
  );

  const toggleTicker = useCallback(
    async (ticker) => {
      const result = await apiFetch(`/api/config/tickers/${ticker}/toggle`, {
        method: "POST",
      });
      if (result) {
        await refreshConfig();
        return result.visible;
      }
      return null;
    },
    [refreshConfig]
  );

  const reorderTickers = useCallback(
    async (order) => {
      const result = await apiFetch("/api/config/tickers/order", {
        method: "PUT",
        body: JSON.stringify({ order }),
      });
      if (result?.success) {
        await refreshConfig();
        return true;
      }
      return false;
    },
    [refreshConfig]
  );

  // ── Profile Helpers ──

  const saveProfile = useCallback(
    async (name) => {
      const result = await apiFetch("/api/config/profiles", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (result?.success) {
        await refreshConfig();
        return true;
      }
      return false;
    },
    [refreshConfig]
  );

  const loadProfile = useCallback(
    async (name) => {
      const result = await apiFetch(`/api/config/profiles/${name}/load`, {
        method: "POST",
      });
      if (result?.success) {
        await refreshConfig();
        return true;
      }
      return false;
    },
    [refreshConfig]
  );

  const deleteProfile = useCallback(
    async (name) => {
      const result = await apiFetch(`/api/config/profiles/${name}`, {
        method: "DELETE",
      });
      if (result?.success) {
        await refreshConfig();
        return true;
      }
      return false;
    },
    [refreshConfig]
  );

  // ── Display Helpers ──

  const togglePanel = useCallback(
    async (panelKey) => {
      if (!config) return null;
      const current = config.display.visiblePanels[panelKey] ?? true;
      return updateConfig({
        display: {
          visible_panels: { [panelKey]: !current },
        },
      });
    },
    [config, updateConfig]
  );

  const toggleChartLayer = useCallback(
    async (layerKey) => {
      if (!config) return null;
      const current = config.display.chartLayers[layerKey] ?? true;
      return updateConfig({
        display: {
          chart_layers: { [layerKey]: !current },
        },
      });
    },
    [config, updateConfig]
  );

  const setChartHeight = useCallback(
    async (height) => {
      return updateConfig({
        display: { chart_height: height },
      });
    },
    [updateConfig]
  );

  const setDefaultTimeframe = useCallback(
    async (tf) => {
      return updateConfig({
        display: { default_timeframe: tf },
      });
    },
    [updateConfig]
  );

  return {
    // State
    config,
    loading,
    error,
    configRef,

    // Core mutation
    updateConfig,
    refreshConfig,

    // Universe
    addTicker,
    removeTicker,
    toggleTicker,
    reorderTickers,

    // Profiles
    saveProfile,
    loadProfile,
    deleteProfile,

    // Display shortcuts
    togglePanel,
    toggleChartLayer,
    setChartHeight,
    setDefaultTimeframe,
  };
}
