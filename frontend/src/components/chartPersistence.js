// version: v2
//
// Pure helpers for the chart-state persistence layer.
// Side-effect free, no React imports, no localStorage access — easy to
// unit-test with node --test. The actual localStorage read/write happens
// in analytical_terminal.jsx; this just owns the merge rule.
//
// See docs/specs/2026-05-11-per-tab-chart-state-and-templates-design.md.
//
// v2 — Re-keyed by `tabId` (was `ticker`). Two chart tabs of the same
//      ticker now have independent persisted state.

/**
 * Merge a workspace's `_chart_states` map into an existing per-tab
 * chart-settings bundle.
 *
 * Rules:
 *   - The chart-state wins on disagreement (it's the persisted snapshot).
 *   - tabIds present in `bundle` but absent from `chartStates` are kept
 *     as-is (closing one tab must not wipe another tab's remembered state;
 *     and a stale bundle entry for a no-longer-open tab is harmless).
 *   - Entries with no `tabId` or no `settings` are skipped.
 *   - If two chart-state entries reference the same `tabId`, the later one
 *     (in Object.entries iteration order) wins.
 *   - Inputs are never mutated; a fresh object is returned.
 *
 * @param {Record<string, object>|null|undefined} bundle  current per-tab bundle, e.g. JSON.parse(localStorage["mk_chart_tab_settings_v1"])
 * @param {Record<string, {tabId?: string, ticker?: string, settings?: object}>|null|undefined} chartStates  workspace _chart_states map
 * @returns {Record<string, object>} new merged bundle, keyed by tabId
 */
export function seedBundleFromChartStates(bundle, chartStates) {
  const out = (bundle && typeof bundle === "object") ? { ...bundle } : {};
  if (!chartStates || typeof chartStates !== "object") return out;
  for (const entry of Object.values(chartStates)) {
    if (!entry || typeof entry !== "object") continue;
    const { tabId, settings } = entry;
    if (!tabId || typeof tabId !== "string") continue;
    if (!settings || typeof settings !== "object") continue;
    out[tabId] = settings;   // chart-state wins
  }
  return out;
}
