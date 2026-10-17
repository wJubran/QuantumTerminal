// version: v1
// replayConfigStore.js — localStorage I/O + validation for the Replay
//   Configuration popup. Pure module, no React.
//
// Schema (kept narrow; everything else lives in component state):
//   {
//     ticker: "XAUUSD",
//     tf:     "M15",
//     period: "3M",
//     layers: {
//       weekly:    boolean,
//       monthly:   boolean,
//       quarterly: { enabled: boolean, q_curr, q_prev1..q_prev7: boolean },
//       bands:     boolean,
//       regime:    { enabled: boolean, top_bar, bg_shading, candle_color: boolean },
//     }
//   }

const KEY = "mk_replay_config";

export const EMPTY_CONFIG = {
  ticker: "",
  tf:     "",
  period: "",
  layers: {
    weekly:    false,
    monthly:   false,
    quarterly: {
      enabled: false,
      q_curr: true, q_prev1: true, q_prev2: true, q_prev3: true,
      q_prev4: true, q_prev5: true, q_prev6: true, q_prev7: true,
    },
    bands:  false,
    regime: { enabled: false, top_bar: false, bg_shading: false, candle_color: false },
  },
};

export function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Light shape check; trust the rest. Caller is expected to pass through
    // validateAgainstAssets() before using the ticker.
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.ticker !== "string") return null;
    if (typeof parsed.tf !== "string") return null;
    if (typeof parsed.period !== "string") return null;
    if (!parsed.layers || typeof parsed.layers !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Quota exceeded / disabled — silent. Config will be empty on next reload.
  }
}

// If the stored ticker is no longer in assetsMap, clear it (return a config
// with ticker:"") so the popup forces the user to re-pick.
export function validateAgainstAssets(config, assetsMap) {
  if (!config) return null;
  if (!assetsMap) return config;
  const tickers = assetsMap instanceof Map
    ? Array.from(assetsMap.keys())
    : Array.isArray(assetsMap)
      ? assetsMap.map(a => a.ticker || a).filter(Boolean)
      : Object.keys(assetsMap || {});
  if (config.ticker && !tickers.includes(config.ticker)) {
    return { ...config, ticker: "" };
  }
  return config;
}

// Apply gating: returns true if the config is complete enough to start
// a replay (ticker + tf + period + at least one layer; if regime is on,
// at least one regime sub-mode).
export function isConfigApplyable(config) {
  if (!config) return false;
  if (!config.ticker || !config.tf || !config.period) return false;
  const L = config.layers || {};
  const anyLayer = !!(
    L.weekly || L.monthly || (L.quarterly && L.quarterly.enabled) ||
    L.bands || (L.regime && L.regime.enabled)
  );
  if (!anyLayer) return false;
  if (L.regime?.enabled) {
    const R = L.regime;
    if (!R.top_bar && !R.bg_shading && !R.candle_color) return false;
  }
  return true;
}
