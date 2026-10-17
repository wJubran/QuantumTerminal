// version: v112
/*
 * v112 — Pass cfd_ratio_used to the 0-DTE derivation functions for the
 *        chain → broker space conversion (visible bug was 0-DTE
 *        structural lines on US500 ~0.7% off, would have been 10× off
 *        on XAUUSD/XAG/XTI). See options_0dte_derivations.js v2.
 */
/*
 * v111 — Synthesize 0-DTE structural_integrity + volatility_gravity for
 *        drawSauceChain, per DC msg #119 (sauce-revision-2026-05-13
 *        thread, format_version 2.4.1). DC ships sauce_0dte with
 *        dealer_scenarios + market_entropy only; the structural and
 *        volatility composites are derived consumer-side from raw
 *        gex_0dte + dealer_heatmap_0dte using the cookbook DC pinned.
 *        Same derivation utility as the Levels-tab L02/L03 wire-up
 *        (OptionsPanel.jsx v45) — see src/lib/options_0dte_derivations.js.
 *        Effect: 🧲 · 0DTE / 🚀 · 0DTE / ■ · 0DTE / ░ · 0DTE chart
 *        strands now draw on assets with a 0-DTE expiry today (US500,
 *        USTEC); commodity-backed assets without 0-DTE keep returning
 *        from drawSauceChain early as before.
 */
/*
 * v110 — DAILY cones + per-model hide (2026-05-12). The `cg` and `bg` state's
 *        `now` key is renamed to `daily` (in the useState initializers and
 *        all 3 defaults-merge hydration sites, plus bg's fresh-ticker reset);
 *        FILL_GROUPS.now → daily using gbm_daily_curr / mjd_daily_curr.
 *        The cone-key filter loop now also honours per-group
 *        coneStyles[g].hide_gbm / hide_mjd flags (skips `gbm_*` / `mjd_*`
 *        keys when set). FILL_GROUPS loop suppresses the fill polygon if
 *        either model is hidden (fill needs both medians). Spec:
 *        docs/specs/2026-05-12-daily-cones-and-per-model-hide-design.md.
 */
/*
 * v109 — Active-template indicator + save-back (2026-05-11). New per-tab
 *        `loadedTemplate` ({name, sourceTicker} | null): set by a same-ticker
 *        template load (onLoadTemplate), cleared on a ticker change, persisted
 *        in the per-tab bundle (but stripped from getCurrentConfig). The TPL
 *        button shows its name (via the loadedTemplateName prop). Right-click
 *        → "Save State" now also writes the chart's current state back to the
 *        loaded template (saveTemplate) and returns its name so the menu's
 *        flash reads "Saved ✓ · <name>". Spec: docs/specs/2026-05-11-active-template-indicator-design.md.
 */
/*
 * v108 — Chart Templates (2026-05-11). Renders <TemplateDropdown> in the
 *        toolbar after <TimeframeDropdown>; exposes getCurrentConfig()
 *        (the current tab's config bundle minus scrollPos/toolbarCollapsed)
 *        and onLoadTemplate(template) (applies template.config via the same
 *        defaults-merge as the tab-restore effect, plus the drawings only
 *        if template.sourceTicker === the chart's current ticker; the
 *        applied state flows through auto-save so it persists per-tab).
 *        Spec: docs/specs/2026-05-11-per-tab-chart-state-and-templates-design.md §4.
 */
/*
 * v107 — Fix: saveCurrentSettings gated on prevTabIdRef.current, not tabId
 *        (2026-05-11). On remount the auto-save useEffect runs BEFORE the
 *        tab-restore effect (declaration order); with the v106 `if (!tabId)
 *        return` guard, `tabId` (a prop) is always truthy, so that first
 *        auto-save wrote the default state into localStorage before the
 *        restore effect could read it back — wiping the saved layout
 *        (symptom: "all indicators turn off when I go to Options and
 *        back"). Reverting to the v105-and-earlier behaviour: gate on
 *        prevTabIdRef.current, which the tab-restore effect sets — null
 *        until the restore has run, so the first-render auto-save no-ops.
 */
/*
 * v106 — Per-tab chart state (2026-05-11). New `tabId` prop. All per-chart
 *        persistence keyed by `tabId` instead of `selectedTicker`:
 *        the bundle moved to "mk_chart_tab_settings_v1"; the v95/v96
 *        per-ticker localStorage keys became "mk_chart_style_${tabId}" /
 *        "mk_chart_drawings_${tabId}". The ticker-restore effect is now a
 *        tab-restore effect (deps [tabId]). applySettings/getSettings key
 *        by tabId. Drawings are cleared when the tab's ticker changes
 *        (they're price-coordinate-bound to one instrument).
 *        Spec: docs/specs/2026-05-11-per-tab-chart-state-and-templates-design.md.
 */
// v105 — Removed the temporary [CHARTPERSIST] debug instrumentation (2026-05-11).
/*
 * v103 — Saved-state bundle expanded so no chart element is forgotten
 *        (2026-05-11). Added 15 PERSIST-class toggles that were
 *        persisted nowhere: heat overlay (show/proHeat/opacity/contrast/
 *        threshold/palette), forest overlay (show/paths/cone/histogram/
 *        historical/connections/regimeFilter), MICRO scalp-bands
 *        (microOn), and cone-deviation style (solidDev). Grouped in the
 *        bundle under `heat:{}` / `forest:{}` sub-objects + two flat
 *        flags. Hydrated in both sites (applySettings + per-ticker
 *        restore effect) with the v101 defaults-merge pattern. The
 *        standalone `mk_heat_palette` / `mk_forest_regime_filter`
 *        localStorage keys are kept as redundant write-throughs (the
 *        useState lazy initialisers still read them); the bundle is
 *        authoritative on hydration. Spec:
 *        docs/specs/2026-05-11-chart-state-persistence-architecture-design.md.
 */
/*
 * v102 — Tradovate POC fully removed from the chart (2026-05-11). The
 *        feature was disqualified. Dropped: TRADOVATE_ENABLED flag,
 *        tradovateActive/tradovateDelayed state, the dual-path in
 *        fetchBars (now a straight pass-through to fetchBarsRaw, i.e.
 *        the MT5 feed), and the TRADOVATE toolbar pill + DELAYED chip.
 *        Backend tradovate_routes / tradovate_provider left in place
 *        (already inactive). SettingsPanel.jsx loses its Tradovate
 *        section in the same pass (its v3).
 */
/*
 * v101 — Hydration defaults-merge fix (2026-05-11).
 *        On per-ticker restore, `setX(saved.X)` was replacing state with
 *        the saved snapshot directly. If the snapshot was sparse (e.g.
 *        written by an older build that didn't have key K yet), the
 *        hydrated state was missing K — and downstream code that uses
 *        `state.K !== false` style guards (volume bar visibility at
 *        line 3588 is the canonical case) treated `undefined` as ON.
 *        Symptom: volume bar reappears + cones revert after save/return.
 *        Fix: both hydration sites (applySettings + per-ticker restore
 *        effect) now spread defaults FIRST then overlay saved values,
 *        matching the pattern slotVis already used at line ~1917.
 *        States patched: layers, cg, ag, bg, gg, indicators.
 *        applySettings's stale `bands: true` and incomplete `cg` fallback
 *        also fixed in passing.
 */
/*
 * v100 — Right-click → "Save State" menu item wired (2026-05-11).
 *        Manual force-trigger of saveCurrentSettings() so the operator
 *        has an explicit save action in addition to the auto-save
 *        effect. Adds one prop to <ChartContextMenu>. UI work is in
 *        ChartContextMenu.jsx v7. Spec:
 *        docs/specs/2026-05-11-chart-save-state-context-menu-design.md.
 */
/*
 * v99 — Toolbar TF block replaced by the new <TimeframeDropdown>
 *       component (chart toolbar redesign, 2026-05-10). Removes:
 *       inline 8 TF buttons (TIMEFRAMES.map), bar-timer pill (now
 *       rendered inside the dropdown component), and the +MORE button.
 *       onLoad callback wires staged values to MainChart state and
 *       fires fetchBars with a count derived from days x bars/session.
 */
/*
 * v98 — Persistence schema extended for the new TimeframeDropdown
 *       (chart toolbar redesign, 2026-05-10). New per-ticker fields:
 *       daysPerTf (map keyed by M1/M5/.../D1), historicalOn (bool),
 *       historicalFrom / historicalTo (ISO YYYY-MM-DD strings or null).
 *       saveCurrentSettings() and both hydration sites (applySettings +
 *       per-ticker restore effect) wire the new fields. UI consumer
 *       wired in v99 (toolbar block replacement).
 */
/*
 * v97 — Three operator-requested chart UX changes (2026-05-08):
 *
 *  (1) F-key fit-chart shortcut. Imperative handle exposes fitChart()
 *      which forwards to the existing fitChartRef.current() handler that
 *      the FIT toolbar button uses. analytical_terminal v23 wires the
 *      keyboard hook to call this.
 *
 *  (2) Bands stale indicator. The BANDS toolbar button paints red when
 *      bandsD._last_modified (added by data_server v26) is older than the
 *      most recent ~22:00 UTC daily close. Helps operators spot when the
 *      band JSON predates the daily recompute that runs in the close-to-
 *      open window. Falls back to "fresh" (no red) when the field is
 *      missing — better than false alarms on legacy / fallback paths.
 *
 *  (3) Auto bands rebuild on TF change. Bands interpolate band-data dates
 *      onto the candle grid (lc.map(c => c.time)). When the user switches
 *      timeframes, lc rebuilds against new bars but the bands effect's
 *      deps don't include lc (intentional — would rebuild every 15 s).
 *      Fix: a new useEffect that, on tf change, sets layers.bands false
 *      then re-enables it after raw refreshes. Imperceptible flicker;
 *      bands re-render against the new grid.
 */
/*
 * v96 — Per-ticker direct-save drawings (2026-05-07). Same architecture as
 *       v95's chartStyle fix, applied to chart drawings (trendlines, fibs,
 *       text annotations, etc.). Operator reported drawings disappeared on
 *       tab switch / remount — the v92-era tickerSettingsRef path was
 *       unreliable for drawings the same way it was for chartStyle.
 *
 *         (a) Hydrate `mk_chart_drawings_<ticker>` from localStorage on
 *             mount and on every selectedTicker change. Calls
 *             drawingMgrRef.current.deserialize() with the parsed array.
 *             If no entry exists, deserialize([]) clears any in-memory
 *             drawings from a previous ticker (drawings ARE per-ticker;
 *             switching tickers should not bleed shapes across).
 *         (b) Save on every drawing change — drawingMgrRef.current.onChange
 *             callback now serializes + writes localStorage in addition
 *             to bumping drawVersion. Reads selectedTicker via a ref so
 *             the registered callback always sees the latest ticker.
 *         (c) selectedTickerRef pattern (matches v95's setChartStyle
 *             closure-currency strategy).
 */
/*
 * v95 — Per-ticker direct-save chartStyle (2026-05-07). Operator reported
 *       that v93/v94's settings persistence (auto-save useEffect +
 *       unmount-save + beforeunload) wasn't reliably restoring chart
 *       settings after tab-switch unmount/remount. v95 takes a different
 *       architecture for chartStyle specifically (the most visible failure
 *       case from the operator's POV — Chart Settings modal):
 *
 *         (a) useState lazy initializer reads `mk_chart_style_${ticker}`
 *             from localStorage so the FIRST render already has the
 *             saved style — no flash of defaults.
 *         (b) setChartStyleAndSave wrapper writes localStorage IMMEDIATELY
 *             on every modal change. No reliance on a useEffect to fire
 *             later, no reliance on the bigger tickerSettingsRef bundle.
 *         (c) useEffect on selectedTicker change reloads chartStyle from
 *             the new ticker's localStorage key. Restores when user
 *             changes ticker in-place via right-click → Change Ticker.
 *         (d) "storage" event listener so a detached window picks up
 *             chartStyle changes made in the main window live.
 *
 *       Existing tickerSettingsRef-based persistence (for layers, cg,
 *       indicators, etc.) is unchanged. Only chartStyle gets the new
 *       direct-save treatment in v95. If this works for chartStyle, the
 *       same pattern can be extended to the other settings in v96.
 */
/*
 * v94 — Save settings on unmount + window close (2026-05-07). v93's
 *       auto-save useEffect catches every state change in the 14 tracked
 *       fields, but can miss any settings path that doesn't go through
 *       those state setters (e.g. modals that batch multiple writes, or
 *       imperative-only flows). Added two defensive saves:
 *         (a) cleanup function on a [] -deps useEffect → fires on
 *             component unmount (tab switch off Quant→Live).
 *         (b) window "beforeunload" listener → fires when the operator
 *             closes the Electron window or quits the app.
 *       Both use a saveCurrentSettingsRef pattern so the cleanup always
 *       reads the LATEST closure (not the closure from first mount).
 */
/*
 * v93 — Per-ticker settings persistence via localStorage (2026-05-07).
 *       Companion to analytical_terminal v20's conditional-render tab fix.
 *       Before v20, MainChart stayed mounted across tab switches and
 *       tickerSettingsRef survived. With v20, MainChart unmounts on tab
 *       switch and the useRef dies — so on remount, settings reverted to
 *       defaults. Now the ref hydrates from localStorage on first render
 *       (lazy init pattern) and writes through on every saveCurrentSettings
 *       call, plus auto-saves on any settings-value change so transient
 *       edits aren't lost. localStorage key: "mk_chart_ticker_settings_v1".
 *       Same Electron-renderer localStorage already used in this file for
 *       mk_heat_palette / mk_forest_regime_filter — known-safe pattern.
 */
/**
 * MainChart.jsx — Full LWC Chart with All Overlays
 * Quantum Terminal | Phase 3C-3 + 3C-6 + 3D
 *
 * v92 — Chart Settings post-review fix. The v90 session-separator effect
 *       had `lc` in its deps array, so on every poll/tick the bars memo
 *       refreshed and the effect re-ran — meaning subscribeVisibleTimeRangeChange
 *       + ResizeObserver were torn down and rebuilt 5x/sec under tick-mode.
 *       Split into two effects: one mounts the subscribe/observe pair once
 *       (deps = [ready]) and reads from a `drawSeparatorsRef` ref; the other
 *       refreshes that ref's closure on (chartStyle, selectedTicker, lc)
 *       changes and triggers a one-shot redraw. Behavior identical, no
 *       resubscribe churn.
 *
 * v91 — Chart Settings Phase D Task 12. Modal trigger + render.
 *       New `chartSettingsOpen` state. Imperative handle gains
 *       `openChartSettings()` and `closeChartSettings()`. Right-click
 *       context-menu's `onSettings` (previously a placeholder no-op)
 *       now flips chartSettingsOpen=true. <ChartSettingsModal/> rendered
 *       at the chart-container level; receives initialStyle=chartStyle and
 *       onChange=setChartStyle so every modal interaction live-updates the
 *       chart via the v89 effect, and round-trips through tickerSettings
 *       via the v88 saveCurrentSettings dep.
 *
 * v90 — Chart Settings Phase D Task 11. Session-separator overlay.
 *       New <canvas ref={separatorOverlayRef}> child of the chart container,
 *       absolutely-positioned, pointer-events: none, zIndex 2 so it sits
 *       above the chart but below interactive UI. New useEffect:
 *         - resolves session times from sessionTimesFor(selectedTicker)
 *         - reads bar array `lc` (closure capture — `lc` is the canonical
 *           bars memo at component scope; Phase D plan called this
 *           `fetchedBarsRef` but v2 uses the `lc` useMemo directly)
 *         - on visible-time-range change OR resize, redraws by walking
 *           findBoundaryBars(lc, sessions) and stroking each with
 *           drawVerticalLine(ctx, x, h, separatorStyle)
 *       Reacts to chartStyle.marketCloseSeparator and rthSeparator. Does
 *       nothing for crypto / unsupported assets (sessionTimes returns
 *       null for both).
 *
 * v89 — Chart Settings Phase D Task 10. New useEffect that watches
 *       `chartStyle` and live-applies the cosmetic options:
 *         - layout.background.color    ← chartStyle.background
 *         - grid.vertLines/horzLines.visible ← chartStyle.gridLines
 *         - candle up/down/border/wick colors ← bullish/bearish
 *       Chart-type swap (candles ↔ line/area/bars) is intentionally
 *       parked for Phase 2 — TODO comment in the effect. The modal still
 *       writes chartStyle.chartType, but the visible series stays as
 *       candles for now. Avoids the deep rewire of cone/band/signal
 *       overlay attachment that a real series-type swap would require.
 *
 * v88 — Chart Settings Phase D Task 9. Added per-ticker `chartStyle`
 *       round-trip. New useState `chartStyle` (default = DEFAULT_CHART_STYLE
 *       from chart_settings/chartStyleDefaults). Wired into
 *       saveCurrentSettings (now an extra field on the per-ticker object)
 *       and applySettings (restores via withDefaults() so legacy snapshots
 *       missing the field land on defaults). Deps array of saveCurrentSettings
 *       extended to include chartStyle so toggles flow into the profile snapshot.
 *
 * v83 — v81/v82 fixed the candle series's own priceFormat (correctly:
 *       precision=5/minMove=0.00001 for forex), but EURUSD/GBPUSD axis
 *       labels still rendered "1.99996" garbage. Read LWC v5.1.0 source
 *       (`_internal_updateFormatter` in lightweight-charts.development.mjs):
 *       the right-axis tick formatter is chosen from the series with the
 *       LOWEST z-order (first-added wins) on that scale, regardless of
 *       visibility. In our chart, the candle is z-0 — should win. But
 *       cones/bands/scalp/anchor LineSeries are added via `mkLine` which
 *       OMITS priceFormat, so they inherit LWC's default precision=2/
 *       minMove=0.01. As series get removed and re-added across cone/band
 *       refreshes, the formatter selection is fragile — and at runtime
 *       the precision=2 default ends up driving EURUSD's axis: with a
 *       0.0007 visible range and minMove 0.01, LWC's tick generator
 *       degenerates to "1.99996" repeated.
 *
 *       Fix: chart-level `localization.priceFormatter` callback. Per the
 *       v5.1.0 source, this overrides series-level priceFormat for axis
 *       labels entirely — bypasses the z-order roulette. Wired to `dec`
 *       (computed elsewhere) so re-fires on ticker switch. The existing
 *       v82 series-level applyOptions stays in place — it still drives
 *       the candle's own price-line label + crosshair label.
 *
 *       No change to `mkLine` or to any other series's API surface.
 *
 * v82 — v81's addSeries-bound priceFormat default of precision=5 was
 *       getting clobbered on the very first render of the precision-
 *       sync useEffect, when `ad` was still undefined and the dec-IIFE
 *       fell to 2 → applyOptions(precision=2, minMove=0.01). Console
 *       logs from the operator confirmed: useEffect fired 3 times for
 *       EURUSD — first with ad=undefined dec=2, then dec=5 twice as
 *       data loaded. LWC v5 doesn't re-propagate priceFormat to the
 *       axis-label cache after the first applyOptions, so the chart
 *       stayed at precision=2 even though subsequent calls passed 5.
 *
 *       Fix: gate the precision-sync useEffect on `ad` having real
 *       data (declared decimals OR a non-zero price probe). Until
 *       then, the chart keeps the addSeries-time precision=5 default
 *       — correct for forex from frame 1.
 *
 * v81 — Forex price-axis labels show "1.99996" garbage instead of real
 *       prices on EURUSD (and other 5-decimal forex pairs). Root cause:
 *       `assetMeta` from `/api/config` isn't reaching the asset record
 *       in `useTerminalData` (race / null / refetch order — separate
 *       bug we're not touching here). `ad?.decimals` ends up undefined
 *       → `dec` falls back to 2 → priceFormat gets `minMove: 0.01`.
 *       For EURUSD at ~1.17 with a 70-pip intraday range (0.0007),
 *       LWC's axis-label generator can't place labels at multiples of
 *       0.01 within a 0.0007 window and degenerates to nonsense
 *       ("1.99996" repeated).
 *
 *       Defensive fix in this file only: when `dec < 4` AND price
 *       magnitude indicates a forex major (`price < 10`), bump `dec`
 *       to 5. Affected only by what would otherwise be the broken
 *       case — any non-forex asset (gold, indices, JPY pairs) keeps
 *       its declared/fallback decimals untouched.
 *
 * v80 — HEAT weekend-gap + broker-TZ fix. Two causes were compounding:
 *       (1) `xRangeForDay`'s xEnd looked up the next chart bar
 *           (`lc.find(b => b.time >= dayEndSec)`). On a calendar-time
 *           chart axis, weekend epochs (Sat/Sun) sit between Fri's bar
 *           and Mon's bar, so the column did try to bridge — but on a
 *           business-day-uniform axis (LWC default for daily TF) the
 *           bridge is a no-op width and weekends show as blank gaps.
 *           Now uses the NEXT entry in `axes.days` (next weekday in
 *           probfield) and finds its first chart bar — explicit bridge
 *           regardless of chart's spacing mode.
 *       (2) MT5 ships `bar.time` in broker-time-as-UTC; probfield's
 *           `axes.days` are real UTC date strings. For any non-UTC
 *           broker the day-epoch lookup `lc.find(b.time >= dayEpoch)`
 *           was matching against a different scale → heat columns
 *           landed N hours off from the actual day's candles. Now
 *           applies the same broker-offset detection used by FOREST
 *           (v73): infer offset from `latestBar.time - realNow`,
 *           snap to whole hours, shift `dayEpoch` onto the bar scale.
 *
 * v79 — CONE color fill (test, "now" group only). When the operator
 *       toggles COLOR FILL inside the cone style editor for the NOW
 *       group, an SVG overlay paints a semi-transparent band between
 *       the GBM and MJD lines at each SD level (sd1_high↔sd1_high,
 *       sd1_low↔sd1_low, sd2/sd3 high+low). Visualizes the
 *       between-models disagreement per deviation. Same rendering
 *       pattern as heatOverlay — polygons via priceToCoordinate +
 *       timeToCoordinate, re-rendered on heatTick (resize / time-range
 *       change). Scoped to "now" for this test; broaden by removing
 *       the group-key gate in coneFillOverlay once verified.
 *
 * v78 — Tighter cross-asset bleed guard for live-tick. v77 tolerated
 *       50% deviation between `lp` and bar open; that left US500 (~5900)
 *       within the window when gold was the new ticker (~4700, ratio
 *       1.25 → only 25% off). Now we (a) compare against bar `close`
 *       (more current than open, since open is fixed at bar start),
 *       (b) tighten the band to ±15% which still passes normal intra-
 *       asset volatility (crypto 5-10% swings, FX gaps) but blocks any
 *       cross-asset ratio. (c) Clear the live-tracking refs on ticker
 *       change so a stale running high/low can't survive the switch.
 *
 * v77 — Two ticker-switch / right-click fixes:
 *       (a) Live-tick effect was applying `Math.min(liveLow, lp)` and
 *           `Math.max(liveHigh, lp)` even when `lp` was the previous
 *           ticker's stale price still flowing through during the swap
 *           render. Result: switching EURUSD→XAUUSD made gold's last
 *           candle wick shoot down to ~1.18 (EUR/USD low) until the
 *           next gold tick repaired it. Now we sanity-check `lp`
 *           against the new bar's open and skip the update if `lp`
 *           is more than 50% off (clearly cross-asset bleed).
 *       (b) Right-click → Change Ticker → click an asset closed the
 *           menu without selecting because React's stopPropagation on
 *           the submenu wrapper doesn't stop the native document-level
 *           mousedown listener (React 18 mounts at root, document
 *           listener fires natively below it). Fixed in
 *           ChartContextMenu v4.
 *
 * v76 — Two operator quality-of-life fixes:
 *       (1) Mouse-wheel over the right price-axis gutter now zooms the
 *           Y range (TradingView-style). Implementation rebalances the
 *           priceScale's scaleMargins on each tick, since LWC v5 doesn't
 *           expose a programmatic price-range setter. The wheel handler
 *           is gated on cursor X being within ~price-axis-width of the
 *           right edge so it doesn't override LWC's time-axis wheel zoom.
 *       (2) Right-click context menu has a new "Reset Chart" item below
 *           Refresh. It calls the same handler as the F button (last-N
 *           bars, time-based fit, re-enable Y autoscale).
 *
 * v75 — TEXT drawing tool fixed under Electron. v44 used `window.prompt`
 *       to capture the text content; Electron's BrowserWindow silently
 *       disables prompt() (returns null without showing any UI), so the
 *       text tool quietly aborted on every click. Replaced with an
 *       inline input overlay anchored to the click position. Enter
 *       commits, Esc / outside-click cancels.
 *
 * v74 — F button (fit-last-N-candles) is now time-based, not logical-
 *       index-based. The previous logic computed `{ from: n-FIT_CANDLES,
 *       to: n-1 }` from `lc.length`. Right after a TF switch, the chart's
 *       internal logical indexing hadn't caught up to the new `lc` array
 *       yet, so `to: n-1` could point at an index past the chart's known
 *       data — LWC clamped to the nearest valid bar, sometimes landing
 *       in the future-buffer "gap" past the live candle. Now we set
 *       visibleRange in seconds keyed on the actual `lc[n-1].time`, so
 *       it lands precisely on the latest bar regardless of the chart's
 *       internal sync state.
 *
 * v73 — FOREST anchor TZ-shift fix. The producer ships anchor_ts in real
 *       UTC ("2026-04-29T12:00:00+00:00"), but the chart's bar timestamps
 *       come through toUTC() which appends "Z" to MT5's naive broker
 *       timestamps — turning broker-local time into "broker time treated
 *       as UTC". For brokers in GMT+N, the bar epochs are N hours larger
 *       than the real UTC epochs they actually represent. The anchor
 *       (real UTC) was therefore landing N hours to the LEFT of the
 *       bars on the chart. Now we detect the broker offset from the
 *       most recent bar (rounded to whole hours) and shift the anchor
 *       onto the same scale as the bars.
 *
 * v72 — FOREST overlay now auto-refreshes when DC ships a new forecast.
 *       Previously the fetch was a one-shot keyed on
 *       [selectedTicker, showForest] — once loaded, never refreshed,
 *       so a new GLOBAL_<ticker>_path_forest.json landing in cache
 *       wasn't picked up until the operator reloaded the terminal.
 *       Now hooks into the existing syncTick (bumped on
 *       mk:data-sync-complete) plus a 60s safety-net poll, matching
 *       the cones/bands/regime pattern.
 *
 * v71 — REGIME FILTER refinements. Two fixes:
 *       (1) The filter now reads `liveMicroRegime` from the always-on
 *           regimeHistory payload (RegimeBar v6), so it works without
 *           the operator first turning on the MICRO display layer.
 *       (2) Probability bars stay visible when filter is active and
 *           are recomputed from each cluster's `regime_mix` so the
 *           magenta widths reflect the conditional cluster
 *           probabilities given the filtered regime, not the
 *           unconditional posterior.
 *
 * v70 — FOREST dropdown: dev fixtures (mixed/trend/range/stress/miscal)
 *       removed and replaced with two-button toggle ALL / REGIME FILTER.
 *       REGIME FILTER hides paths whose dominant_regime doesn't match
 *       the asset's current micro regime (mapped via MICRO_TO_FOREST
 *       table). The probability bars are recomputed from the filtered
 *       path set so the magenta widths reflect the conditional outlook,
 *       not the raw posterior.
 *
 *       REGIME · "show on candles" mode. The macro/micro popover gains
 *       a SHOW ON CANDLES checkbox. When ticked, the regime layer's
 *       background histogram is suppressed and each candle body+wick
 *       is repainted with the regime color for its day. Toggling off
 *       restores the default green/red candles via setData(lc).
 *       Micro takes precedence when both are set.
 *
 * v69 — HEAT palette renamed BOOKMAP → DEPTH (avoid trademark).
 *       Turning off the main HEAT button also forces PRO HEAT off so
 *       the 2-month overlay state can't linger silently when the
 *       master switch is off — operator's mental model is "HEAT off =
 *       all heat off."
 *
 * v68 — HEAT palette presets + legend bar + clip fix. The hand-coded
 *       5-stop fire gradient in heatColor() is now one of six selectable
 *       palettes (FIRE / BOOKMAP / PLASMA / VIRIDIS / THERMAL / MONO),
 *       each defined as a stops table and interpolated by a single
 *       helper. The HEAT settings dropdown gains a palette <select>
 *       and a horizontal gradient bar so the operator can see how cell
 *       color maps from low → high. Selection persists to localStorage.
 *       Also: heat overlay SVG now uses overflow: hidden so cells whose
 *       price-row extends above/below the chart no longer paint over
 *       the timeframe toolbar above the chart pane.
 *
 * v67 — HEAT gap fix in front of price. xRangeForDay's "no next bar"
 *       branch (today is the last day with bars) ended xEnd at
 *       xLastBar + 1 bar. Tomorrow's column then started at
 *       coordFor(tomorrow_midnight), leaving a black band through the
 *       chart's future-day pixels. Now xEnd extrapolates straight to
 *       end-of-day (= next day's xStart), so today's column meets
 *       tomorrow's column edge-to-edge.
 *
 * v66 — Audio alerts for the OTHER chart-driven order paths. Operators
 *       place LIMIT/STOP orders by arming a direction and clicking the
 *       chart (placePendingOrder), and adjust SL/TP by dragging the price
 *       lines (beginPendingDrag PATCH on /api/orders, beginPosDrag PATCH
 *       on /api/positions). v65 only wired the 1-click MARKET button, so
 *       LIMIT placement and SL/TP drags were silent. Per operator spec:
 *       "limit order placed" + "tp or sl placed or adjusted" both → the
 *       order_placed sound.
 *
 * v65 — Quick BUY/SELL on the chart now plays the order_filled sound on
 *       success. Same audio utility as the OrderTicket modal. The chart's
 *       1-click trade is MARKET-only, so it's always order_filled.
 *
 * v64 — Pen still snapped to left edge after the v63 bounds-check fix.
 *       Even inside the chart rect, LWC's coordinateToTime(x) for x in
 *       pre-bar whitespace returns the leftmost visible bar's time
 *       (rather than null per the docs). That bad time was getting
 *       recorded and rendering as a long line back to the chart's left
 *       edge. Now we round-trip-check every captured time: if
 *       timeToCoordinate(time) doesn't map back within ~60px of the
 *       input x, it's a snap-to-edge fallback and we reject the sample.
 *
 * v63 — Freehand pen "snap to left" fix. The pen's mousemove is bound to
 *       the window (so fast strokes don't lose tracking when the mouse
 *       briefly exits the chart container). When the mouse goes outside
 *       the chart bounds, LWC's coordinateToTime(x) for a negative x
 *       returns the leftmost visible bar's time — not null — which got
 *       recorded as a valid path point and rendered as a line all the
 *       way to the chart's left edge. Now we explicitly drop captures
 *       outside the chart's bounding rect.
 *
 * v62 — Right-click context menu on the chart. Items: Settings (placeholder),
 *       Draw (submenu of drawing tools — same TOOLS list as DrawingToolbar),
 *       Change Ticker (searchable ticker picker, calls onChangeTicker prop),
 *       Refresh (re-fetches bars via fetchBars without going through auth).
 *       The chart container intercepts contextmenu so the browser default is
 *       suppressed.
 *
 * v61 — FOREST overlay redesigned per operator's reference image:
 *       - Anchor: bright yellow filled dot at (now, anchor.price).
 *       - Paths:  all 60 simulation polylines (regime-colored, alpha 0.5),
 *                 each one a polyline from anchor through 16 forward bars.
 *       - Bars:   5 horizontal magenta probability bars on the right edge
 *                 of the forecast window. Bar y = cluster.price_median;
 *                 bar width ∝ probability (wider = more likely).
 *       - Labels: minimal — "UP" above the top bar, "FLAT" beside the
 *                 middle bar, "DN" below the bottom bar.
 *       Removed v60's filled bands + dashed medians + per-band number
 *       labels — too busy, redundant with the bars.
 *
 * v60 — Path Outcome Forest overlay (FOREST button). Pulls the per-ticker
 *       forecast from /api/forest/{ticker} and paints 5 cluster price bands
 *       between the anchor (now) and 4h forward, each spanning that
 *       cluster's price_p10..price_p90, filled in cluster.color (~15% alpha)
 *       with a subtle stroke and a dashed median line. Probability and
 *       median price labels sit at the right end of each band. A faint
 *       dashed vertical line marks the anchor (now). Dev: scenario picker
 *       (trend / range / stress / mixed / miscal) defaults to mixed; live
 *       producer drops the scenario suffix and we serve the no-suffix
 *       file when present.
 *       Pro-gating intentionally NOT enforced yet so the operator can
 *       evaluate the visual; flip the gate once design is approved.
 *
 * v59 — HEAT week-anchor fix. Previously the Mon-Fri columns of the weekly
 *       heatmap were anchored to `currDays[todayIdx]` — the producer's
 *       latest computed day. When the producer ran on Friday and uploaded,
 *       on Monday morning the algorithm rendered the PRIOR calendar week
 *       (because Friday's today_index resolved to Mon-Fri of last week).
 *       Operator reported on 2026-04-27 (Monday) that the heatmap was still
 *       showing last week.
 *       Now anchored to the USER's wall-clock today. Days the producer
 *       hasn't computed yet render with no heat cells (the column is
 *       still drawn but findDay() returns null and the inner loop skips).
 *       When the daily sync pulls fresh data, those cells fill in.
 *       Note: this only fixes the WEEK ALIGNMENT. If the consumer's local
 *       probfield cache itself is stale (data_sync_client hasn't pulled
 *       this morning's file yet), the data is still last week's — no
 *       heatmap algorithm can fix that. Restart the app or wait for the
 *       periodic sync to refresh the cache.
 *
 * v58 — Cone style override now applies per-model colors. ChartToolbar v5
 *       added GBM COLOR + MJD COLOR pickers; this consumer reads
 *       `color_gbm` for keys starting with `gbm_` and `color_mjd` for
 *       keys starting with `mjd_`. Legacy single `color` is honored as
 *       a fallback so older saved settings continue to work for both
 *       models. Width and opacity remain shared.
 *
 * v57 — Heat refinements:
 *       (a) HEAT button hidden when the asset has no options/probfield data
 *           (`optionsAvailable === false`) — same gating signal that already
 *           disables the GEX dropdown. Mirrors the existing pattern with
 *           full hide instead of a greyed-out button so toolbars stay tidy
 *           for non-options assets.
 *       (b) New PRO HEAT toggle inside the HEAT settings popover. When on
 *           (and the user is on the PRO plan), the overlay paints the full
 *           `month_prev` + `month_curr` ranges (~44 trading days) instead
 *           of the single-week mode. Non-pro users see the button greyed
 *           out with a tooltip. PRO HEAT supersedes the weekly HEAT view
 *           when both are on.
 *
 * v56 — TEMP / experimental: heat strips on the chart right edge from the
 *       probability-field payload (/api/probability-field/{ticker}). Two
 *       toolbar toggles `HEAT·TODAY` and `HEAT·YESTERDAY`; each paints a
 *       narrow vertical strip inside the chart container, colored by the
 *       corresponding column of `modes.month_curr.options_weight`. Uses
 *       `priceScale("right").priceToCoordinate(price)` so cells align with
 *       the visible candle price range and fall off-chart where they don't.
 *       Pure SVG overlay, no LWC series — trivial to remove by deleting
 *       the effect/memo + two buttons (or rolling back to v55). Default
 *       off on both toggles.
 *
 * v55 — Regime rendering rewritten against the DC HMM spec
 *       (terminal_regime_schema.md). The `regimeHistory` prop now arrives as
 *         { macro: {data, enabled, opacity, hidden, colors} | null,
 *           micro: {data, enabled, opacity, hidden, colors} | null } | null
 *       from RegimeBar v2. Each layer paints a full-height histogram below
 *       the candles at the regime-color, indexed by candle time against the
 *       layer's `history.slow_d1` (current bar uses the live `slow.regime`).
 *       Hidden states are rendered transparent. Legacy `/api/regime_live`
 *       fetch and the old Viterbi/forward dual-layer pane are removed.
 *
 * v2 — Listens for the mk:data-sync-complete DOM event and refetches
 *      /api/bands, /api/anchors, /api/cones for the current ticker so
 *      cache changes (periodic sync, cache watcher, refresh button) are
 *      reflected live without a browser reload.
 *
 * v3 — Fetch handlers now always apply the response (null included), so a
 *      deleted cache file (→ 404 → api() null) clears the overlay live.
 *      Previously the falsy branch just logged and left stale state.
 *
 * v4 — Options/sauce data is now also wired to syncTick (refetches on
 *      mk:data-sync-complete) and null-safe (deleted options file clears
 *      price lines live). ETF → CFD ratio for sauce price lines is now
 *      derived from (livePrice / options.spot) instead of the absent
 *      optionsD.cfd_to_etf_ratio field — fixes options levels rendering at
 *      ETF prices (e.g. SPY ~$679) on index CFD charts (US500 ~$6794).
 *
 * v5 — Hide chart grid lines (visual cleanup).
 *
 * v6 — Temporarily hide the SIGNALS button and the ANCHORS dropdown in the
 *      chart toolbar until the data feeds are updated. Buttons restored by
 *      removing the {false && ...} guards on the two lines.
 *
 * v7 — Also drop "signals" and "anchors" from the footer status-dot list so
 *      no stale indicators remain. Restore by re-adding them to the arrays.
 *
 * v8 — Cone deviation lines (sd1 / sd2 / sd3 highs and lows) render as SOLID
 *      by default instead of Dashed/Dotted/SparseDotted. Added a toolbar
 *      toggle ("SOLID DEV") so the legacy dashed styling can be restored
 *      per-session. The median line and dashed-style cone groups (e.g. MJD
 *      in CONE_STYLES) still respect their own dash settings.
 *
 * v9 — Fix chart drifting right every 15s when bands are visible. The bands
 *      effect was only saving/restoring the visible logical range when the
 *      user had manually scrolled; on initial load (and on each 15s candle
 *      refresh, since the effect depends on lc) the gate was false, no
 *      restore ran, and LWC auto-fit the time scale to include band data
 *      that extends beyond the candles — shifting the chart right. Now
 *      saves unconditionally, matching the cones effect.
 *
 * v10 — The real fix: disable LWC's `shiftVisibleRangeOnNewBar` (default
 *       true). `autoScrollToRealTime:false` only blocks scrollToRealTime();
 *       it does NOT prevent the time scale from auto-shifting by one bar
 *       every time `candleRef.current.update()` runs on a new tick or
 *       setData adds a later bar. That's the "every few moments" drift.
 *
 * v23 — Fix remaining "chart jumps right by itself" intermittent issue.
 *       Every 5 minutes, data_sync_complete broadcast refetches bands/cones/
 *       anchors/scalp → setState runs with a fresh object reference → React
 *       fires each render effect (bands/cones) → teardown + rebuild, even
 *       when the payload is byte-identical to what's already loaded. That's
 *       the periodic jump.
 *       Fix: JSON-equality guard on each setState. Only update state if the
 *       incoming payload is different from what's stored. No downstream
 *       effect fires for unchanged data → no teardown-rebuild flicker.
 *       50-150 KB JSON.stringify round-trip is ~1ms; trivial vs the reflow
 *       we're preventing.
 *
 * v22 — Fix "whole screen = one candle" zoom after switching to the chart
 *       tab from another tab. While the chart container is display:none the
 *       ResizeObserver reports 0x0; when the tab returns LWC resizes but
 *       keeps whatever weird visible-range state it settled into and the
 *       chart looks like it's zoomed to a single bar. Fix: track the user's
 *       last valid time range via subscribeVisibleTimeRangeChange (already
 *       existed for logical-range, now also captures time range). On a
 *       hidden→visible width transition in the ResizeObserver, re-apply
 *       that saved range on the next frame.
 *       Narrowly scoped — doesn't touch save/restore, deps, or fixed-edge
 *       settings elsewhere, so the old classes of bugs don't regress.
 *
 * v21 — MICRO render hardened against the chart-jumping class of bug (see
 *       memory feedback_lwc_jumping):
 *         - lc removed from deps (was rebuilding every 15s).
 *         - Save/restore TIME range around the addSeries burst, with rAF
 *           second pass to beat LWC's async auto-fit.
 *       Also coloring matched to the regular bands palette:
 *         - GBM family in orange (DEFAULT_BAND_STYLES.gbm color).
 *         - MJD family in amber.
 *         - BATES family in magenta.
 *         - Mean line grey.
 *       All three model families are drawn even though the producer emits
 *       identical values — per operator request to match the regular-bands
 *       look.
 *
 * v20 — MICRO render rewritten. Producer changed scalp_bands JSON to the
 *       same time-series shape as regular bands (timestamps + 6 sd levels
 *       per model + mean). Render now mirrors the bands effect: interpolate
 *       onto candle grid, gaussian-smooth, draw with mkLine. Cyan accent
 *       to differentiate from the regular bands. The legacy per-horizon
 *       fan code is removed.
 *
 * v19 — MICRO toggle in BANDS submenu. New scalp_bands payload (per-horizon
 *       point projections from a recent 5-min anchor) fetched from
 *       /api/scalp_bands/{ticker} and rendered as a 5-horizon fan: each of
 *       the 5 horizons (15/30/60/120/240 min) draws upper_2sd, upper_1sd,
 *       mean, lower_1sd, lower_2sd polylines from the anchor timestamp out
 *       to anchor + horizon. Cyan accent. Uses autoscaleInfoProvider:null
 *       so the band fan doesn't pull the price axis wide.
 *
 * v18 — Toolbar readability pass:
 *       - Timeframe buttons (M1/M5/M15/M30/H1/H4/D1) enlarged 1.5x and
 *         brightened: fontSize 9→13px, padding 2px 8px → 3px 12px,
 *         inactive color muted → white.
 *       - + MORE button bumped from 7px to 11px.
 *       - SOLID DEV button bumped to match the new size.
 *       - M30 inherited automatically from chart_constants v3.
 *
 * v17 — Removed the monthly-cone leftward shift (was v2 workaround for an
 *       old producer bug where monthly anchors landed on "first Monday
 *       after month boundary"). Producer now anchors correctly, so the
 *       client shift was pulling cones 1-2 days earlier than their actual
 *       anchor date.
 *
 * v16 — On TF switch the candle save/restore was applying the OLD TF's
 *       visible time range to NEW TF data → ended in a bad view position
 *       and candles looked broken until cones were toggled off/on (which
 *       re-ran the cone effect and recomputed interpolation against fresh
 *       lc). Fix: key firstSetDataDoneRef and prevLcRef by "ticker:tf"
 *       instead of ticker alone. A TF switch now qualifies as a first-call
 *       for that (ticker, tf) pair → full setData with no save/restore →
 *       LWC fits naturally → cones rebuild cleanly on top.
 *
 * v15 — Tighten v14's update() path. v14 caused a visual glitch on some
 *       transitions (two candle zones with mixed bar spacing) because the
 *       append-only detection accepted too-broad cases. v15 restricts the
 *       incremental path to:
 *         - exactly 0-2 new bars appended (routine live-tick / 15s refresh),
 *         - AND strict monotonic time (every new bar > previous last), AND
 *         - full first/mid/last-1 time match on prev_lc prefix.
 *       Any other evolution → full setData with save/restore (safe path).
 *
 * v14 — Live-chart stability pass:
 *       (a) Candle paint now detects an append-only evolution of `lc` and
 *           calls series.update(bar) for the tail instead of setData(all).
 *           LWC treats update() as incremental — no layout pass, no snap.
 *           setData is still used on first paint per ticker, ticker-change,
 *           tf-change, or non-append diffs (rare).
 *       (b) Removed `lc` from the cones and bands effect deps. They were
 *           re-firing every 15 seconds just because a new bar appeared;
 *           nothing they render actually depends on the new bar. Cones and
 *           bands now rebuild only on real cause: their data arrived,
 *           style changed, visibility toggled.
 *       (c) Added `lockVisibleTimeRangeOnResize: true` to chart init so
 *           layout resizes (window, responsive, debug panel open/close)
 *           don't nudge the view.
 *
 * v13 — Chart still jumped when user toggled bands / cones / gex. LWC
 *       applies its auto-fit asynchronously (next animation frame) after
 *       addSeries, which landed after our synchronous time-range restore.
 *       Added a requestAnimationFrame second restore inside each save/restore
 *       pair — snaps the view back on the very next paint, catching LWC's
 *       async adjustment.
 *
 * v12 — Chart was drifting right every 15s when fetchBars refreshed the
 *       candle series. Save/restore used logical-range (bar indices), which
 *       shift when the bar array grows by a new bar → restore applied to
 *       wrong time window → visible content scrolled left-to-right. Switched
 *       candle, bands, and cones save/restore to TIME range
 *       (getVisibleRange / setVisibleRange) — data-length agnostic.
 *
 * v11 — Restore band/cone curviness after chart_constants v2. That change
 *       densifies future points to the candle TF step, producing 4× more
 *       vertices on M15 (and similar on lower TFs) — the fixed 7-point
 *       smoothing window then covers less real time, making lines look
 *       jaggy. v11 scales the smoothing window inversely with step, so the
 *       effective time-domain smoothing matches the old H1 behavior on any
 *       TF. Cones also smoothed (previously no smoothing at all).
 * Canvas-based, 60fps. Overlays: cones, bands, anchors, signals (v5 primitive).
 * Per-ticker settings persistence. Indicators + cone style editing.
 *
 * Modularized: constants in chart_constants.js, toolbar UI in ChartToolbar.jsx,
 * signal rendering in SignalMarkersPrimitive.js.
 */
import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, Fragment } from "react";
import * as LWC from "lightweight-charts";

// ── Modular imports ──
import {
  C, mono, TIMEFRAMES, BAR_COUNTS, FIT_CANDLES, TF_SECONDS,
  CONE_GROUPS, ANCHOR_GROUPS, BATES_GROUPS, GEX_GROUPS,
  DEFAULT_CONE_VIS, getConeVis, anchorVis,
  SIGNAL_COLORS, STATE_OPACITY, CLOSED_SIGNAL_STATES,
  DEFAULT_INDICATORS,
  makeDefaultSettings, DEFAULT_SLOT_VIS, coneKeyToSlot,
  API, api, toUTC, mkLine, interpolateOnGrid, smoothBandData, DEFAULT_BAND_STYLES,
} from "./chart_constants";
import { Dropdown, ConeStyleEditor, IndicatorsDropdown, BandsDropdown } from "./ChartToolbar";
import TimeframeDropdown from "./TimeframeDropdown";
import TemplateDropdown from "./TemplateDropdown";   // v108: chart-template TPL dropdown
import { saveTemplate } from "./chartTemplatesApi";  // v109: save-back to the loaded template
import { defaultDaysPerTf, estimateBarCount } from "./timeframeMath";
import ChartContextMenu from "./ChartContextMenu";    // v62: right-click chart menu
import { playSound } from "../utils/sounds";          // v65: audio on quick trade success
import {                                              // v111: 0-DTE structural/volatility derived consumer-side
  deriveStructuralIntegrity0dte,
  deriveVolatilityGravity0dte,
} from "../lib/options_0dte_derivations";
import { SignalMarkersPrimitive } from "./SignalMarkersPrimitive";
import { TradeHistoryPrimitive } from "./TradeHistoryPrimitive";
import DrawingManager, { DEFAULT_DRAW_STYLE, DRAWING_TYPES, DEFAULT_FIB_LEVELS, DEFAULT_FIB_EXT_LEVELS } from "./DrawingManager";
import { DrawingPrimitive } from "./DrawingPrimitive";
import DrawingToolbar from "./DrawingToolbar";
import DrawingStyleEditor from "./DrawingStyleEditor"; // v43: popover for selected-drawing style edits
// v88 — chart settings (Phase D)
import { withDefaults as withChartStyleDefaults } from "./chart_settings/chartStyleDefaults";
// v90 — session-separator overlay (Phase D Task 11)
import { sessionTimesFor } from "./chart_settings/sessionTimes";
import { findBoundaryBars, drawVerticalLine } from "./chart_settings/chartSeparators";
// v91 — chart settings modal (Phase D Task 12)
import ChartSettingsModal from "./chart_settings/ChartSettingsModal";

const createChart = LWC.createChart;

// v68: HEAT palette presets. Each palette is an ordered list of
// [t, [r,g,b]] stops — t in [0,1]. interpolateHeatPalette() does a
// linear walk between adjacent stops so any normalized value maps to
// a color on the active gradient.
const HEAT_PALETTES = {
  fire: { label: "FIRE", stops: [
    [0.00, [  6,   8,  12]],
    [0.18, [ 30,  27,  75]],
    [0.42, [ 76,  29, 149]],
    [0.68, [175,  28, 110]],
    [0.85, [228,  90,  38]],
    [1.00, [255, 200,  30]],
  ]},
  depth: { label: "DEPTH", stops: [
    [0.00, [  4,   8,  60]],
    [0.25, [  0, 120, 200]],
    [0.50, [  0, 200, 100]],
    [0.75, [255, 230,   0]],
    [1.00, [255,  50,  20]],
  ]},
  plasma: { label: "PLASMA", stops: [
    [0.00, [ 13,   8, 135]],
    [0.25, [126,   3, 168]],
    [0.50, [204,  71, 120]],
    [0.75, [248, 149,  64]],
    [1.00, [240, 249,  33]],
  ]},
  viridis: { label: "VIRIDIS", stops: [
    [0.00, [ 68,   1,  84]],
    [0.25, [ 59,  82, 139]],
    [0.50, [ 33, 144, 141]],
    [0.75, [ 94, 201,  98]],
    [1.00, [253, 231,  37]],
  ]},
  thermal: { label: "THERMAL", stops: [
    [0.00, [  0,   0,   0]],
    [0.30, [180,   0,   0]],
    [0.60, [255, 130,   0]],
    [0.85, [255, 230, 100]],
    [1.00, [255, 255, 255]],
  ]},
  mono: { label: "MONO", stops: [
    [0.00, [ 10,  10,  10]],
    [0.50, [128, 128, 128]],
    [1.00, [255, 255, 255]],
  ]},
};

function interpolateHeatPalette(palette, t) {
  const stops = palette.stops;
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i - 1];
    const [t2, c2] = stops[i];
    if (t <= t2) {
      const f = (t - t1) / Math.max(1e-9, t2 - t1);
      return [
        c1[0] + f * (c2[0] - c1[0]),
        c1[1] + f * (c2[1] - c1[1]),
        c1[2] + f * (c2[2] - c1[2]),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function paletteToCssGradient(palette) {
  const parts = palette.stops.map(([t, [r, g, b]]) =>
    `rgb(${r},${g},${b}) ${(t * 100).toFixed(1)}%`
  );
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

// ════════════════════════════════════════════════════════
// MAIN CHART COMPONENT
// ════════════════════════════════════════════════════════
const MainChart = forwardRef(function MainChart({ selectedTicker, tabId, assets, fetchBars: fetchBarsRaw, signals, lifecycle, weeklyState, regimeHistory, onLog, onTimeframeChange, compact, onOrderClick, executionStatus, isActive = true, onChangeTicker }, ref) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  // v90: canvas overlay for session separators (drawn on top of chart canvas)
  const separatorOverlayRef = useRef(null);
  const volRef = useRef(null);
  const timeAnchorRef = useRef(null); // v34: invisible 1-month future whitespace anchor
  const coneRefs = useRef({});
  const bandRefs = useRef(null);
  const anchorRefs = useRef([]);
  // v55: macro + micro regime background series (HistogramSeries, full-height)
  const regimeMacroRef = useRef(null);
  const regimeMicroRef = useRef(null);
  const restoringScrollRef = useRef(false);
  const firstSetDataDoneRef = useRef({});
  // v14: previous lc per ticker, for append-only diff detection in setData effect.
  const prevLcRef = useRef({});
  // v22: last valid user time range — captured via subscribe, re-applied on
  //      hidden→visible resize transition to prevent the "zoomed to one candle"
  //      glitch when the tab is revisited.
  const lastTimeRangeRef = useRef(null);
  const userScrolledRef = useRef(false); // set true once user manually pans/zooms
  const liveHighRef = useRef(0);  // running high of current live bar
  const lastLpRef   = useRef(null); // v25: skip LWC update() on identical tick price
  const isInteractingRef = useRef(false); // v28: pause live update() while user drags
  const liveLowRef  = useRef(Infinity); // running low of current live bar
  const liveBarTimeRef = useRef(0); // timestamp of bar being tracked
  // v55: legacy forward-algo `/api/regime_live` state removed — the new DC
  //      HMM regime (RegimeBar v2) arrives via the regimeHistory prop and
  //      already contains non-repainting history + live slow/fast blocks.
  const signalPrimitiveRef = useRef(null);
  const signalLinesRef = useRef([]);
  // v56 (experimental): probability-field heat overlay state.
  //   Single HEAT button paints the current trading week (Mon-Fri) behind
  //   the candles, including future days (chart's timeAnchorRef extends the
  //   time scale ~30d forward, so timeToCoordinate resolves for them).
  const [probfieldData, setProbfieldData] = useState(null);
  const [showHeat, setShowHeat]           = useState(false);
  const [showProHeat, setShowProHeat]     = useState(false);  // v57: 2-month pro mode
  const [heatTick, setHeatTick]           = useState(0);  // bumps on resize / time-range change to force redraw
  // Heat level controls (dropdown menu next to HEAT button)
  const [heatMenuOpen, setHeatMenuOpen]   = useState(false);
  const [heatOpacity, setHeatOpacity]     = useState(0.38);   // 0.1 .. 1.0
  const [heatContrast, setHeatContrast]   = useState(0.75);   // gamma; smaller = brighter lows
  const [heatThreshold, setHeatThreshold] = useState(0.05);   // fraction of max below which cells are skipped
  // v68: palette presets. Each palette = [t, [r,g,b]] stop list,
  //   interpolated linearly. Persisted to localStorage so the operator's
  //   choice survives reload.
  const [heatPalette, setHeatPaletteRaw] = useState(() => {
    try {
      const saved = localStorage.getItem("mk_heat_palette") || "fire";
      // v69: migrate the renamed "bookmap" key → "depth" for any operator
      //   who already picked it under the old name.
      return saved === "bookmap" ? "depth" : saved;
    } catch { return "fire"; }
  });
  const setHeatPalette = useCallback((p) => {
    setHeatPaletteRaw(p);
    try { localStorage.setItem("mk_heat_palette", p); } catch { /* private mode */ }
  }, []);

  // v60: PATH OUTCOME FOREST overlay state. Fetched from /api/forest/{ticker}.
  // v70: dev fixture picker removed. forestRegimeFilter (boolean) gates the
  //      paths to those whose dominant_regime matches the asset's current
  //      micro regime (mapped via MICRO_TO_FOREST_REGIME).
  //      ignored by backend once a no-suffix live forecast file exists in cache.
  const [forestData, setForestData]         = useState(null);
  const [showForest, setShowForest]         = useState(false);
  const [forestMenuOpen, setForestMenuOpen] = useState(false);
  // v70: regime-filtered forest. Persists so operators don't re-tick on reload.
  const [forestRegimeFilter, setForestRegimeFilterRaw] = useState(() => {
    try { return localStorage.getItem("mk_forest_regime_filter") === "1"; }
    catch { return false; }
  });
  const setForestRegimeFilter = useCallback((v) => {
    setForestRegimeFilterRaw(v);
    try { localStorage.setItem("mk_forest_regime_filter", v ? "1" : "0"); } catch { /* private mode */ }
  }, []);

  // v85: 4 sub-toggles inside FOREST dropdown — each gates one layer.
  const [showForestPaths,      setShowForestPaths]      = useState(true);
  const [showForestCone,       setShowForestCone]       = useState(true);
  const [showForestHistogram,  setShowForestHistogram]  = useState(true);
  const [showForestHistorical, setShowForestHistorical] = useState(true);
  // v86: connections — dots at every intersection between any two cone lines
  // (live + historical). Independent of the other 4 toggles so user can hide
  // everything else and inspect the cross-points alone.
  const [showForestConnections, setShowForestConnections] = useState(false);

  // v62: Right-click context menu on the chart. Holds {x, y} when open, null when closed.
  const [chartCtxMenu, setChartCtxMenu]     = useState(null);
  // v91: chart settings modal open/close
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  // v75: Inline text-input overlay for the TEXT drawing tool. Replaces
  //   window.prompt() which Electron silently disables. Holds the chart-
  //   relative {x, y} of the click + the {time, price} to anchor the
  //   drawing once the operator hits Enter.
  const [pendingTextDraw, setPendingTextDraw] = useState(null);
  const logRef = useRef(null);
  logRef.current = onLog;
  const log = (level, msg) => { logRef.current?.(level, "CHART", msg); };
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bc, setBc] = useState(null);
  const [editingConeGroup, setEditingConeGroup] = useState(null);
  const [editingBatesGroup, setEditingBatesGroup] = useState(null);
  const [editingGexGroup, setEditingGexGroup] = useState(null);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Drawing tools state (Phase 4C) ──
  const [activeTool, setActiveTool] = useState(null);
  const [drawStyle, setDrawStyle] = useState({ ...DEFAULT_DRAW_STYLE });
  const [drawVersion, setDrawVersion] = useState(0); // increment to trigger re-render

  // ── Bar timer state ──
  const [barTimer, setBarTimer] = useState("");

  // ── Position overlay state ──
  const positionLinesRef = useRef([]);
  const [positionsOnChart, setPositionsOnChart] = useState([]);
  const tradeHistPrimRef = useRef(null);
  const drawingMgrRef = useRef(new DrawingManager());
  const drawPrimRef = useRef(null);
  const drawPointRef = useRef(null);       // first point of in-progress 2-point drawing
  const penPointsRef = useRef(null);       // array of points during freehand pen draw
  const pathPointsRef = useRef(null);      // v42: array of clicked vertices during path drawing (dblclick to finish)
  const fibExtPointsRef = useRef(null);    // v51: [A] after click 1, [A,B] after click 2 for 3-click fib extension
  // v51: clear the fib_ext state the moment the user switches away from the tool
  useEffect(() => {
    if (activeTool !== "fib_ext" && fibExtPointsRef.current) {
      fibExtPointsRef.current = null;
      drawPrimRef.current?.setPreview(null);
    }
  }, [activeTool]);
  const [hoveredDrawingId, setHoveredDrawingId] = useState(null); // v43: id of drawing under cursor → cursor flips to "pointer"
  const crosshairPosRef = useRef({ time: null, price: null });

  // v8: solid cone deviations (sd1/sd2/sd3) by default; toggle in toolbar.
  const [solidDev, setSolidDev] = useState(true);
  // v19: MICRO scalp-bands visibility toggle. Declared up here (rather than
  //      next to scalpD below) because saveCurrentSettings's deps array
  //      references it — a `const` can't be in the temporal dead zone when
  //      that useCallback evaluates its deps on render. (v103.)
  const [microOn, setMicroOn] = useState(false);
  // v109: which template is "active" on this tab ({name, sourceTicker} | null).
  //       Declared up here (with solidDev/microOn) because saveCurrentSettings's
  //       deps array references it — a `const` can't be in the temporal dead
  //       zone when that useCallback evaluates its deps on render.
  const [loadedTemplate, setLoadedTemplate] = useState(null);

  // v37: Quick trade bar — MT5-style 1-click BUY/SELL next to ticker label.
  //      Always OFF by default on chart open / ticker change (no persistence)
  //      to prevent accidental clicks. Lot size auto-fills to symbol min_lot.
  const [tradeBarOpen, setTradeBarOpen] = useState(false);
  const [quickLots, setQuickLots] = useState("");
  const [quickMinLot, setQuickMinLot] = useState(null);

  // Chart bars come from the parent's MT5 feed. (v102: Tradovate POC
  // removed — it used to provide a second source toggled via a toolbar
  // pill; the feature was disqualified.)
  const fetchBars = useCallback(
    async (ticker, tf, count) => (fetchBarsRaw ? fetchBarsRaw(ticker, tf, count) : []),
    [fetchBarsRaw]
  );
  const [quickLotStep, setQuickLotStep] = useState(null);
  const [quickToast, setQuickToast] = useState(null); // { kind:"ok"|"err", msg }
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // v38: Drag-to-modify SL/TP state. Ghost-drag: the static SL/TP priceLines
  //      never move during interaction; a dashed ghost follows the cursor and
  //      commits via PATCH on release. This keeps LWC's canvas untouched by
  //      pointer events and cannot glitch the cones/bands/drag-guard pipeline.
  //
  //      Hit zones live in a sibling overlay div (pointer-events:none overall,
  //      pointer-events:auto only on the 10px-tall strips at each SL/TP Y).
  const [posYCoords, setPosYCoords] = useState([]);      // [{ticket, direction, entry_y, sl_y, tp_y, ...}]
  const [posDragState, setPosDragState] = useState(null); // {ticket, kind, startY, currentY, currentPrice, ...}
  const posDragRef = useRef(null);
  const posYCoordsRef = useRef([]);
  // v38: dec is declared later in the render — ref-box it so beginPosDrag
  //      (declared above `dec`) can read the current decimals at call time
  //      without a TDZ ReferenceError on first render.
  const decRef = useRef(2);
  // v40: same pattern for `lp` (last price) — placePendingOrder lives above
  //      lp's declaration and reads live market price at call time.
  const lpRef = useRef(0);

  // v39: Per-ticker symbol metadata cache for live risk/reward display during
  //      ghost SL/TP drag. Keyed by broker symbol / ticker; populated on
  //      demand when a position for that ticker appears on the chart.
  //      Shape: { tick_size, tick_value, contract_size, currency_profit }.
  const symbolMetaRef = useRef(new Map());
  const [symbolMetaTick, setSymbolMetaTick] = useState(0); // bump to re-render ghost when meta lands

  // v40: Pending-order workflow.
  //   pendingMode:
  //     null               → off (BUY/SELL fire market orders as in v37)
  //     "armed"            → PENDING on, no direction picked yet
  //     "buy_armed"        → PENDING on, BUY armed → chart-click places BUY pending
  //     "sell_armed"       → PENDING on, SELL armed → chart-click places SELL pending
  //   pendingHover  = { y, price, kind:"LIMIT"|"STOP" } while cursor hovers the
  //                   chart in a *_armed mode. kind is resolved vs live price lp.
  //   pendingOrders = resting orders for selectedTicker (polled every 1s).
  //   pendingYCoords = per-order pixel Y-coords for hit strips + ✕ button placement.
  const [pendingMode,   setPendingMode]   = useState(null);
  const [pendingHover,  setPendingHover]  = useState(null);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingYCoords, setPendingYCoords] = useState([]);
  const pendingYCoordsRef = useRef([]);
  const pendingDragRef    = useRef(null);
  const [pendingDragState, setPendingDragState] = useState(null);

  // Auto-collapse toolbar when entering tile/compact mode
  useEffect(() => { if (compact) setToolbarCollapsed(true); }, [compact]);

  // v96: ref pinning latest tabId so the mount-time onChange callback
  //      (registered once on mount) reads the current tab on every fire —
  //      avoids re-registering the callback on every tab change
  //      (DrawingManager.onChange may replace or accumulate handlers,
  //      depending on impl). v106: keyed by tabId, not selectedTicker.
  const tabIdForDrawingsRef = useRef(tabId);
  useEffect(() => { tabIdForDrawingsRef.current = tabId; }, [tabId]);

  // Wire DrawingManager change → React re-render + per-tab localStorage
  // write-through. Mount-only effect.
  useEffect(() => {
    drawingMgrRef.current.onChange(() => {
      setDrawVersion(v => v + 1);
      // v96/v106: write-through to per-tab localStorage. Synchronous, in
      //           same call as the change. Mirrors v95's chartStyle pattern.
      try {
        const tid = tabIdForDrawingsRef.current;
        if (tid) {
          const data = drawingMgrRef.current.serialize();
          localStorage.setItem(`mk_chart_drawings_${tid}`, JSON.stringify(data));
        }
      } catch { /* private mode / quota */ }
    });
  }, []);

  // v96/v106: hydrate drawings on mount + reload on every tabId change.
  //           drawingMgrRef.deserialize([]) on missing key clears the
  //           previous tab's drawings — don't bleed shapes across tabs.
  useEffect(() => {
    if (!tabId) return;
    try {
      const stored = localStorage.getItem(`mk_chart_drawings_${tabId}`);
      drawingMgrRef.current.deserialize(stored ? JSON.parse(stored) : []);
    } catch {
      drawingMgrRef.current.deserialize([]);
    }
  }, [tabId]);

  // v106: drawings are price-coordinate-bound to one instrument. When the
  //       tab's ticker changes (right-click → Change Ticker), drop them.
  const prevSelectedTickerRef = useRef(selectedTicker);
  useEffect(() => {
    if (prevSelectedTickerRef.current && prevSelectedTickerRef.current !== selectedTicker) {
      try {
        if (typeof drawingMgrRef.current.clearAll === "function") drawingMgrRef.current.clearAll();
        else if (typeof drawingMgrRef.current.clear === "function") drawingMgrRef.current.clear();
        else if (typeof drawingMgrRef.current.reset === "function") drawingMgrRef.current.reset();
        else drawingMgrRef.current.deserialize([]);
      } catch {}
      try { localStorage.removeItem(`mk_chart_drawings_${tabId}`); } catch {}
      setDrawVersion(v => v + 1);
      // v109: a ticker change breaks the link to the loaded template.
      setLoadedTemplate(null);
    }
    prevSelectedTickerRef.current = selectedTicker;
  }, [selectedTicker, tabId]);

  // v37: Reset TRADE bar on ticker change — prevents accidental 1-click fills
  //      on a freshly-switched symbol.
  useEffect(() => {
    setTradeBarOpen(false);
    setQuickToast(null);
  }, [selectedTicker]);

  // v37: Fetch symbol min_lot / lot_step when TRADE bar opens, seed lot input.
  useEffect(() => {
    if (!tradeBarOpen || !selectedTicker) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/symbol-info/${selectedTicker}`);
        if (cancelled) return;
        if (res.ok) {
          const info = await res.json();
          if (cancelled) return;
          const minLot = Number(info.min_lot) > 0 ? Number(info.min_lot) : 0.01;
          const step   = Number(info.lot_step) > 0 ? Number(info.lot_step) : 0.01;
          setQuickMinLot(minLot);
          setQuickLotStep(step);
          setQuickLots(String(minLot));
        } else {
          setQuickMinLot(0.01); setQuickLotStep(0.01); setQuickLots("0.01");
        }
      } catch {
        if (!cancelled) { setQuickMinLot(0.01); setQuickLotStep(0.01); setQuickLots("0.01"); }
      }
    })();
    return () => { cancelled = true; };
  }, [tradeBarOpen, selectedTicker]);

  // v37: Auto-dismiss quick-trade toast after 2s.
  useEffect(() => {
    if (!quickToast) return;
    const id = setTimeout(() => setQuickToast(null), 2000);
    return () => clearTimeout(id);
  }, [quickToast]);

  // ── Per-tab settings persistence ──
  // v93/v106: lazy hydrate from localStorage on first render so settings
  //           survive tab-switch unmount/remount. Falls back to {} on parse
  //           error or private-mode storage failure. v106: the bundle is
  //           keyed by tabId (was selectedTicker) — two tabs of the same
  //           ticker no longer collapse into one entry.
  const tickerSettingsRef = useRef();   // name kept; now keyed by tabId
  if (tickerSettingsRef.current === undefined) {
    try {
      const stored = localStorage.getItem("mk_chart_tab_settings_v1");
      tickerSettingsRef.current = stored ? JSON.parse(stored) : {};
    } catch { tickerSettingsRef.current = {}; }
  }
  const prevTabIdRef = useRef(null);

  // ── Chart state (initialized from defaults, overridden on ticker switch) ──
  const [tf, setTf] = useState("M15");
  // v98: New for TimeframeDropdown — see docs/specs/2026-05-10-chart-toolbar-timeframe-dropdown-design.md
  const [daysPerTf,      setDaysPerTf]      = useState(() => defaultDaysPerTf());
  const [historicalOn,   setHistoricalOn]   = useState(false);
  const [historicalFrom, setHistoricalFrom] = useState(null);
  const [historicalTo,   setHistoricalTo]   = useState(null);
  const [layers, setLayers] = useState({ bands:false, signals:true });  // v41: bands off by default — opt-in via toolbar
  const [cg, setCg] = useState({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, manual:false });
  const [ag, setAg] = useState({ weekly:false, monthly:false, extremes:false });
  const [bg, setBg] = useState({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false });
  const [gg, setGg] = useState({ flip: false, expected_move: false, magnets: false, springs: false, reinforced: false, thin_ice: false });  // v46: flip + expected_move replace NOW/WEEKLY
  const [slotVis, setSlotVis] = useState({ ...DEFAULT_SLOT_VIS });
  const [indicators, setIndicators] = useState({ ...DEFAULT_INDICATORS });
  const [indicatorStyles, setIndicatorStyles] = useState({});
  const [coneStyles, setConeStyles] = useState({});
  const [bandStyles, setBandStyles] = useState({});
  // v88: per-ticker chart cosmetics (background / candle colors / grid /
  //      session-separator overlays / chart type).
  // v95/v106: lazy useState initializer reads from per-tab localStorage so
  //           the very first render already shows saved settings. No flash of
  //           defaults, no race with the tab-restore effect.
  const [chartStyle, _setChartStyleRaw] = useState(() => {
    try {
      if (tabId) {
        const stored = localStorage.getItem(`mk_chart_style_${tabId}`);
        if (stored) return withChartStyleDefaults(JSON.parse(stored));
      }
    } catch {}
    return withChartStyleDefaults(null);
  });

  // v95/v106: setter wrapper that writes localStorage IMMEDIATELY on every
  //           change. ChartSettingsModal calls this via the `onChange` prop,
  //           so every swatch click / hex edit / chart-type pick is persisted
  //           synchronously — no waiting for a useEffect to fire later.
  const setChartStyle = useCallback((updater) => {
    _setChartStyleRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        // tabId is a prop (stable for this instance) read from closure; the
        // useCallback deps below keep this wrapper current across tab changes.
        if (tabId) {
          localStorage.setItem(`mk_chart_style_${tabId}`, JSON.stringify(next));
        }
      } catch { /* private mode / quota */ }
      return next;
    });
  }, [tabId]);

  // v95/v106: reload chartStyle from localStorage when tabId changes.
  useEffect(() => {
    if (!tabId) return;
    try {
      const stored = localStorage.getItem(`mk_chart_style_${tabId}`);
      if (stored) {
        _setChartStyleRaw(withChartStyleDefaults(JSON.parse(stored)));
      } else {
        _setChartStyleRaw(withChartStyleDefaults(null));
      }
    } catch {
      _setChartStyleRaw(withChartStyleDefaults(null));
    }
  }, [tabId]);

  // v95/v106: cross-window sync. localStorage's "storage" event fires in
  //           OTHER windows of the same origin when one window writes. Used
  //           so a detached chart window picks up changes made in the main
  //           window (and vice versa) without requiring tab/page refresh.
  useEffect(() => {
    const onStorage = (e) => {
      if (!tabId) return;
      if (e.key !== `mk_chart_style_${tabId}`) return;
      if (e.newValue == null) return;
      try {
        _setChartStyleRaw(withChartStyleDefaults(JSON.parse(e.newValue)));
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tabId]);

  // ── Manual cone — repurposed as QUARTERLY-CONE preview slot (v24, temp) ──
  //    The producer writes gbm_quarter_curr / mjd_quarter_curr / bates_quarter_curr
  //    into {TICKER}_quarterly_cones.json. Until a dedicated QUARTERLY toggle
  //    ships, we remap those three payloads into the existing "gbm/mjd/bates_manual"
  //    cone slots so the CONES → MANUAL checkbox controls visibility. No model
  //    running here — display only (Rule C1).
  const [manualConeData, setManualConeData] = useState(null);
  const isSelectingAnchor = false;
  const manualConeVisible = true; // visibility gated by cg.manual in the CONES dropdown
  const selectingAnchorRef = useRef(false);
  const handleManualConeClickRef = useRef(null);
  const deleteManualCone = useCallback(() => {}, []);

  const cnt = bc || BAR_COUNTS[tf] || 200;

  // ── Bar timer: countdown to next candle close ──
  useEffect(() => {
    const tfSec = TF_SECONDS[tf] || 900;
    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = tfSec - (nowSec % tfSec);
      if (remaining <= 0 || remaining > tfSec) { setBarTimer(""); return; }
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      if (h > 0) setBarTimer(`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
      else setBarTimer(`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tf]);

  // ── Position overlay: fetch + draw price lines for open positions ──
  useEffect(() => {
    if (!indicators.show_positions || !candleRef.current || !selectedTicker) {
      // Clear existing lines
      positionLinesRef.current.forEach(pl => { try { candleRef.current?.removePriceLine(pl); } catch {} });
      positionLinesRef.current = [];
      setPositionsOnChart([]);
      return;
    }
    let cancelled = false;
    const fetchAndDraw = async () => {
      try {
        const res = await fetch("/api/positions");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const positions = (data.positions || []).filter(p => p.ticker === selectedTicker);
        if (cancelled) return;
        setPositionsOnChart(positions);
        // Clear old lines
        positionLinesRef.current.forEach(pl => { try { candleRef.current?.removePriceLine(pl); } catch {} });
        positionLinesRef.current = [];
        // Draw new lines
        const series = candleRef.current;
        if (!series) return;
        positions.forEach(pos => {
          const isBuy = pos.direction === "BUY";
          // Entry line
          const pnlColor = (pos.profit || 0) >= 0 ? "#2ebd59" : "#e8383b";
          positionLinesRef.current.push(series.createPriceLine({
            price: pos.open_price,
            color: pnlColor,
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: `${(pos.profit || 0) >= 0 ? "+" : ""}${(pos.profit || 0).toFixed(2)}  ${isBuy ? "▲" : "▼"} ${pos.lots}`,
          }));
          // Stop loss
          if (pos.stop_loss) {
            positionLinesRef.current.push(series.createPriceLine({
              price: pos.stop_loss,
              color: "#e8383b",
              lineWidth: 1,
              lineStyle: 3, // Dotted
              axisLabelVisible: true,
              title: "SL",
            }));
          }
          // Take profit
          if (pos.take_profit) {
            positionLinesRef.current.push(series.createPriceLine({
              price: pos.take_profit,
              color: "#2ebd59",
              lineWidth: 1,
              lineStyle: 3, // Dotted
              axisLabelVisible: true,
              title: "TP",
            }));
          }
        });
      } catch (e) { log("error", `Position overlay: ${e.message}`); }
    };
    fetchAndDraw();
    const id = setInterval(fetchAndDraw, 1000); // refresh every 1s for near-realtime P&L
    return () => { cancelled = true; clearInterval(id); positionLinesRef.current.forEach(pl => { try { candleRef.current?.removePriceLine(pl); } catch {} }); positionLinesRef.current = []; };
  }, [indicators.show_positions, selectedTicker, ready]);

  // v38: Sync overlay Y-coords to live price-scale via rAF. Cheap (3 calls/pos
  //      per frame) and only setState when values actually change, so React
  //      never re-renders when the chart is idle. Runs only while positions
  //      exist on chart — otherwise the loop is never scheduled.
  useEffect(() => {
    if (!positionsOnChart.length || !candleRef.current) {
      if (posYCoordsRef.current.length) {
        posYCoordsRef.current = [];
        setPosYCoords([]);
      }
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const series = candleRef.current;
      if (series) {
        const next = positionsOnChart.map(p => ({
          ticket: p.ticket,
          direction: p.direction,
          open_price: p.open_price,
          stop_loss: p.stop_loss,
          take_profit: p.take_profit,
          entry_y: series.priceToCoordinate(p.open_price),
          sl_y:    p.stop_loss   ? series.priceToCoordinate(p.stop_loss)   : null,
          tp_y:    p.take_profit ? series.priceToCoordinate(p.take_profit) : null,
        }));
        const prev = posYCoordsRef.current;
        let changed = prev.length !== next.length;
        if (!changed) {
          for (let i = 0; i < next.length; i++) {
            const a = next[i], b = prev[i];
            if (!b || a.ticket !== b.ticket
              || a.entry_y !== b.entry_y
              || a.sl_y    !== b.sl_y
              || a.tp_y    !== b.tp_y) { changed = true; break; }
          }
        }
        if (changed) {
          posYCoordsRef.current = next;
          setPosYCoords(next);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
  }, [positionsOnChart]);

  // v39: Fetch symbol metadata (tick_size / tick_value) once per ticker that
  //      has an open position on this chart. Used to render live $-risk on
  //      the drag ghost label. Fire-and-forget; no blocking on failures.
  useEffect(() => {
    if (!positionsOnChart.length) return;
    const tickers = Array.from(new Set(positionsOnChart.map(p => p.ticker).filter(Boolean)));
    let cancelled = false;
    (async () => {
      for (const t of tickers) {
        if (symbolMetaRef.current.has(t)) continue;
        try {
          const res = await fetch(`/api/symbol-info/${t}`);
          if (cancelled || !res.ok) continue;
          const info = await res.json();
          if (cancelled) return;
          symbolMetaRef.current.set(t, {
            tick_size: Number(info.tick_size) || 0,
            tick_value: Number(info.tick_value) || 0,
            contract_size: Number(info.contract_size) || 0,
            currency_profit: info.currency_profit || "USD",
          });
          setSymbolMetaTick(n => n + 1);
        } catch { /* silent — risk label just won't render */ }
      }
    })();
    return () => { cancelled = true; };
  }, [positionsOnChart]);

  // v40: Poll /api/orders/pending every 1s and filter to selectedTicker.
  //      Independent from the positions poll so ExposureStrip's own poll and
  //      this chart's poll don't stomp each other.
  useEffect(() => {
    if (!selectedTicker || !ready) {
      setPendingOrders([]);
      return;
    }
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const res = await fetch("/api/orders/pending");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setPendingOrders((data.orders || []).filter(o => o.ticker === selectedTicker));
      } catch {}
    };
    fetchPending();
    const id = setInterval(fetchPending, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedTicker, ready]);

  // v40: rAF sync for pending-order Y coords — mirrors v38's loop for positions.
  useEffect(() => {
    if (!pendingOrders.length || !candleRef.current) {
      if (pendingYCoordsRef.current.length) {
        pendingYCoordsRef.current = [];
        setPendingYCoords([]);
      }
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const series = candleRef.current;
      if (series) {
        const next = pendingOrders.map(o => ({
          ticket: o.ticket,
          direction: o.direction,
          order_type: o.order_type,
          price: o.price,
          stop_loss: o.stop_loss || 0,
          take_profit: o.take_profit || 0,
          lots: o.lots,
          price_y: series.priceToCoordinate(o.price),
          sl_y: o.stop_loss   ? series.priceToCoordinate(o.stop_loss)   : null,
          tp_y: o.take_profit ? series.priceToCoordinate(o.take_profit) : null,
        }));
        const prev = pendingYCoordsRef.current;
        let changed = prev.length !== next.length;
        if (!changed) for (let i = 0; i < next.length; i++) {
          const a = next[i], b = prev[i];
          if (!b || a.ticket !== b.ticket || a.price_y !== b.price_y
            || a.sl_y !== b.sl_y || a.tp_y !== b.tp_y) { changed = true; break; }
        }
        if (changed) {
          pendingYCoordsRef.current = next;
          setPendingYCoords(next);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
  }, [pendingOrders]);

  // v40: Exit pending mode when ticker changes (the mode is chart-local).
  useEffect(() => {
    setPendingMode(null);
    setPendingHover(null);
  }, [selectedTicker]);

  // v40: Place a pending order by clicking inside the chart while a direction
  //      is armed. LIMIT vs STOP resolved from click price vs live price lp.
  const placePendingOrder = useCallback(async (price) => {
    const mkt = lpRef.current;
    if (!selectedTicker || !Number.isFinite(price) || mkt <= 0) return;
    const direction = pendingMode === "buy_armed" ? "BUY" : pendingMode === "sell_armed" ? "SELL" : null;
    if (!direction) return;
    // BUY:  price<market → LIMIT   (buy cheaper)     price>market → STOP (buy breakout)
    // SELL: price>market → LIMIT   (sell higher)     price<market → STOP (sell breakdown)
    const kind = direction === "BUY"
      ? (price < mkt ? "LIMIT" : "STOP")
      : (price > mkt ? "LIMIT" : "STOP");
    const lotsNum = parseFloat(quickLots);
    if (!Number.isFinite(lotsNum) || lotsNum <= 0) {
      setQuickToast({ kind: "err", msg: "Invalid lot size" });
      return;
    }
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: selectedTicker.toUpperCase(),
          direction,
          order_type: kind,
          lots: lotsNum,
          price,
          comment: "Quantum Terminal PENDING",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setQuickToast({
          kind: "ok",
          msg: `${direction} ${kind} ${lotsNum} @ ${Number(price).toFixed(decRef.current)}`,
        });
        // v66: chart-click pending order (LIMIT/STOP) → order_placed
        try { playSound("order_placed"); } catch { /* never fatal */ }
        if (window.__mk_execution_refresh) window.__mk_execution_refresh();
      } else {
        const errMsg = data.error
          || (typeof data.detail === "string" ? data.detail : data.detail?.error || data.detail?.message)
          || `HTTP ${res.status}`;
        setQuickToast({ kind: "err", msg: `${direction} ${kind} failed: ${errMsg}` });
      }
    } catch (e) {
      setQuickToast({ kind: "err", msg: `Pending order failed: ${e.message}` });
    }
  }, [selectedTicker, pendingMode, quickLots]);

  // v40: Cancel a pending order (✕ button on chart or ExposureStrip table).
  const cancelPendingOrder = useCallback(async (ticket) => {
    try {
      const res = await fetch(`/api/orders/${ticket}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setQuickToast({ kind: "ok", msg: `Cancelled #${ticket}` });
        if (window.__mk_execution_refresh) window.__mk_execution_refresh();
      } else {
        const errMsg = data.error
          || (typeof data.detail === "string" ? data.detail : data.detail?.error || data.detail?.message)
          || `HTTP ${res.status}`;
        setQuickToast({ kind: "err", msg: `Cancel failed: ${errMsg}` });
      }
    } catch (e) {
      setQuickToast({ kind: "err", msg: `Cancel failed: ${e.message}` });
    }
  }, []);

  // v40: Drag a pending-order line (price / SL / TP). Plain drag = modify
  //      whichever line was grabbed. Shift+drag on the price line = set SL or
  //      TP by drag direction (same pattern as v38 entry-strip). Ghost shows
  //      live price; release commits PATCH /api/orders/{ticket}.
  const beginPendingDrag = useCallback((ev, ticket, kind, order) => {
    if (!executionStatus?.live_trading || !executionStatus?.provider_connected) {
      setQuickToast({ kind: "err", msg: "Enable live trading in Settings" });
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    const startY = rect ? (ev.clientY - rect.top) : ev.clientY;
    const startPrice = kind === "sl" ? (order.stop_loss || order.price)
                       : kind === "tp" ? (order.take_profit || order.price)
                       : order.price;
    const shiftDrag = !!ev.shiftKey && kind === "price"; // shift+drag only meaningful on price line
    const initial = {
      ticket, kind, order, direction: order.direction,
      startY, currentY: startY, currentPrice: startPrice, shift: shiftDrag,
    };
    pendingDragRef.current = initial;
    setPendingDragState(initial);

    let pendingClientY = ev.clientY;
    let rafPending = false;
    const move = (e) => {
      pendingClientY = e.clientY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const st = pendingDragRef.current;
        if (!st) return;
        const r = containerRef.current?.getBoundingClientRect();
        const series = candleRef.current;
        if (!r || !series) return;
        let y = pendingClientY - r.top;
        y = Math.max(0, Math.min(y, r.height));
        const p = series.coordinateToPrice(y);
        if (p == null) return;
        const next = { ...st, currentY: y, currentPrice: p };
        pendingDragRef.current = next;
        setPendingDragState(next);
      });
    };

    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const st = pendingDragRef.current;
      pendingDragRef.current = null;
      setPendingDragState(null);
      if (!st) return;
      const { ticket: tk, kind: k, order: o, direction, startY: sY, currentY: cY, currentPrice: cP, shift } = st;
      if (Math.abs(cY - sY) < 4) return; // click without drag = no-op
      let target = k;
      let body = {};
      if (k === "price" && shift) {
        // Shift+drag on price line — direction decides SL or TP (v38 pattern).
        const movedDown = cY > sY;
        const isLong = direction === "BUY";
        target = (isLong ? movedDown : !movedDown) ? "sl" : "tp";
        if (target === "sl") body.stop_loss   = Number(cP);
        else                 body.take_profit = Number(cP);
      } else if (k === "price") {
        body.price = Number(cP);
      } else if (k === "sl") {
        body.stop_loss = Number(cP);
      } else if (k === "tp") {
        body.take_profit = Number(cP);
      } else {
        return;
      }
      try {
        const res = await fetch(`/api/orders/${tk}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          const label = target === "sl" ? "SL" : target === "tp" ? "TP" : "PRICE";
          setQuickToast({ kind: "ok", msg: `#${tk} ${label} → ${Number(cP).toFixed(decRef.current)}` });
          // v66: drag-to-modify pending order (price/SL/TP) → order_placed
          try { playSound("order_placed"); } catch { /* never fatal */ }
          if (window.__mk_execution_refresh) window.__mk_execution_refresh();
        } else {
          const errMsg = data.error
            || (typeof data.detail === "string" ? data.detail : data.detail?.error || data.detail?.message)
            || `HTTP ${res.status}`;
          setQuickToast({ kind: "err", msg: `#${tk} modify failed: ${errMsg}` });
        }
      } catch (e2) {
        setQuickToast({ kind: "err", msg: `#${tk} modify failed: ${e2.message}` });
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [executionStatus]);

  // v38: Begin a ghost-drag on a SL/TP/entry hit strip. Installs transient
  //      window pointermove/up listeners (closed over local state so there's
  //      no stale-ref trap). rAF-coalesced move handler → smooth 60fps ghost
  //      without flooding React with setState on every mouse event.
  const beginPosDrag = useCallback((ev, ticket, kind, pos) => {
    if (!executionStatus?.live_trading || !executionStatus?.provider_connected) {
      setQuickToast({ kind: "err", msg: "Enable live trading in Settings" });
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    const startY = rect ? (ev.clientY - rect.top) : ev.clientY;
    const startPrice = kind === "sl" ? pos.stop_loss
                      : kind === "tp" ? pos.take_profit
                      : pos.open_price;
    const initial = {
      ticket, kind, pos, direction: pos.direction,
      startY, currentY: startY, currentPrice: startPrice,
    };
    posDragRef.current = initial;
    setPosDragState(initial);

    let pendingClientY = ev.clientY;
    let rafPending = false;
    const move = (e) => {
      pendingClientY = e.clientY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const st = posDragRef.current;
        if (!st) return;
        const r = containerRef.current?.getBoundingClientRect();
        const series = candleRef.current;
        if (!r || !series) return;
        let y = pendingClientY - r.top;
        y = Math.max(0, Math.min(y, r.height));
        const price = series.coordinateToPrice(y);
        if (price == null) return;
        const next = { ...st, currentY: y, currentPrice: price };
        posDragRef.current = next;
        setPosDragState(next);
      });
    };

    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const st = posDragRef.current;
      posDragRef.current = null;
      setPosDragState(null);
      if (!st) return;
      const { ticket: tk, kind: k, pos: p, direction, startY: sY, currentY: cY, currentPrice: cP } = st;
      // Resolve target side (SL vs TP). For entry hit strip, drag direction decides.
      let target = k;
      if (k === "entry") {
        const movedDown = cY > sY;
        const isLong   = direction === "BUY";
        target = (isLong ? movedDown : !movedDown) ? "sl" : "tp";
        if ((target === "sl" && p.stop_loss) || (target === "tp" && p.take_profit)) {
          setQuickToast({ kind: "err", msg: `${target.toUpperCase()} already set — drag its line` });
          return;
        }
        if (Math.abs(cY - sY) < 10) return; // require intent on entry (taller threshold)
      } else if (Math.abs(cY - sY) < 4) {
        return; // tiny drag = treat as click, no-op
      }
      const body = {};
      if (target === "sl") body.stop_loss   = Number(cP);
      else if (target === "tp") body.take_profit = Number(cP);
      else return;
      try {
        const res = await fetch(`/api/positions/${tk}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        const ok = res.ok && data.success;
        if (ok) {
          setQuickToast({ kind: "ok", msg: `${target.toUpperCase()} → ${Number(cP).toFixed(decRef.current)}` });
          // v66: drag-to-modify position SL/TP → order_placed
          try { playSound("order_placed"); } catch { /* never fatal */ }
          if (window.__mk_execution_refresh) window.__mk_execution_refresh();
        } else {
          const errMsg = data.error
            || (typeof data.detail === "string" ? data.detail : data.detail?.error || data.detail?.message)
            || `HTTP ${res.status}`;
          setQuickToast({ kind: "err", msg: `${target.toUpperCase()} failed: ${errMsg}` });
        }
      } catch (e2) {
        setQuickToast({ kind: "err", msg: `${target.toUpperCase()} failed: ${e2.message}` });
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [executionStatus]);

  // ── Trade history overlay: fetch closed trades + render via primitive ──
  useEffect(() => {
    const candle = candleRef.current;
    if (!ready || !candle) return;

    // Attach primitive once
    if (!tradeHistPrimRef.current) {
      const prim = new TradeHistoryPrimitive();
      candle.attachPrimitive(prim);
      tradeHistPrimRef.current = prim;
    }

    // Sync user styles (buy color, sell color, opacity)
    const histStyles = indicatorStyles.show_trade_history || {};
    tradeHistPrimRef.current.setStyles(histStyles);

    if (!indicators.show_trade_history || !selectedTicker) {
      tradeHistPrimRef.current.setTrades([]);
      return;
    }

    // Snap trade timestamps to nearest TF bar boundary (same grid chart uses)
    const tfSec = TF_SECONDS[tf] || 900;
    const snapToBar = (ts) => Math.floor(ts / tfSec) * tfSec;

    let cancelled = false;
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/positions/history?days=30");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data.enabled) { tradeHistPrimRef.current?.setTrades([]); return; }
        const trades = (data.trades || [])
          .filter(t => t.ticker === selectedTicker)
          .map(t => ({
            openTime: snapToBar(toUTC(t.open_time)),
            closeTime: snapToBar(toUTC(t.close_time)),
            openPrice: t.open_price,
            closePrice: t.close_price,
            direction: t.direction,
            profit: t.profit,
            lots: t.lots,
          }));
        if (!cancelled) tradeHistPrimRef.current?.setTrades(trades);
      } catch (e) { log("error", `Trade history overlay: ${e.message}`); }
    };
    fetchHistory();
    // Refresh every 30s — closed trades don't change often
    const id = setInterval(fetchHistory, 30000);
    return () => { cancelled = true; clearInterval(id); tradeHistPrimRef.current?.setTrades([]); };
  }, [indicators.show_trade_history, selectedTicker, ready, indicatorStyles, tf]);

  // ── Save settings when leaving a tab ──
  const saveCurrentSettings = useCallback(() => {
    // v107: gate on prevTabIdRef (set by the tab-restore effect), NOT on
    //       the `tabId` prop — otherwise the first-render auto-save (which
    //       runs before the restore effect) writes default state over the
    //       just-hydrated localStorage entry. prevTabIdRef is null until
    //       the restore runs, so this no-ops on first render and writes
    //       the correct (restored) state on every subsequent change.
    const key = prevTabIdRef.current;
    if (!key) return;
    let scrollPos = null;
    try { scrollPos = chartRef.current?.timeScale()?.scrollPosition(); } catch {}
    tickerSettingsRef.current[key] = {
      // v106: record which ticker this tab's bundle entry belongs to.
      ticker: selectedTicker,
      layers: { ...layers }, cg: { ...cg }, ag: { ...ag }, bg: { ...bg }, gg: { ...gg },
      slotVis: { ...slotVis },
      indicators: { ...indicators }, indicatorStyles: { ...indicatorStyles },
      coneStyles: { ...coneStyles }, bandStyles: { ...bandStyles }, tf, bc, scrollPos,
      toolbarCollapsed,
      // v88: chart cosmetic style (background / candle colors / grid / separators / chartType)
      chartStyle: chartStyle ? JSON.parse(JSON.stringify(chartStyle)) : null,
      drawings: drawingMgrRef.current.serialize(),
      // v98: NEW for TimeframeDropdown
      daysPerTf:      { ...daysPerTf },
      historicalOn:   !!historicalOn,
      historicalFrom: historicalFrom || null,
      historicalTo:   historicalTo   || null,
      // v103: previously-forgotten overlay toggles
      heat: {
        show:      !!showHeat,
        proHeat:   !!showProHeat,
        opacity:   heatOpacity,
        contrast:  heatContrast,
        threshold: heatThreshold,
        palette:   heatPalette,
      },
      forest: {
        show:         !!showForest,
        paths:        !!showForestPaths,
        cone:         !!showForestCone,
        histogram:    !!showForestHistogram,
        historical:   !!showForestHistorical,
        connections:  !!showForestConnections,
        regimeFilter: !!forestRegimeFilter,
      },
      microOn:  !!microOn,
      solidDev: !!solidDev,
      // v109: which template (if any) this tab is currently "being".
      loadedTemplate: loadedTemplate ? { name: loadedTemplate.name, sourceTicker: loadedTemplate.sourceTicker } : null,
    };
    // v93/v106: write-through to localStorage so the ref survives unmount.
    try {
      localStorage.setItem("mk_chart_tab_settings_v1", JSON.stringify(tickerSettingsRef.current));
    } catch { /* private mode / quota */ }
  }, [tabId, selectedTicker, layers, cg, ag, bg, gg, slotVis, indicators, indicatorStyles, coneStyles, bandStyles, tf, bc, toolbarCollapsed, chartStyle, daysPerTf, historicalOn, historicalFrom, historicalTo, showHeat, showProHeat, heatOpacity, heatContrast, heatThreshold, heatPalette, showForest, showForestPaths, showForestCone, showForestHistogram, showForestHistorical, showForestConnections, forestRegimeFilter, microOn, solidDev, loadedTemplate]);

  // v93/v106: auto-save on any settings change so transient edits (between
  //           tab switches) also persist. saveCurrentSettings is a no-op
  //           when tabId isn't set yet (initial mount before tab-restore
  //           effect fires).
  useEffect(() => {
    saveCurrentSettings();
  }, [tabId, selectedTicker, layers, cg, ag, bg, gg, slotVis, indicators, indicatorStyles, coneStyles, bandStyles, tf, bc, toolbarCollapsed, chartStyle, daysPerTf, historicalOn, historicalFrom, historicalTo, showHeat, showProHeat, heatOpacity, heatContrast, heatThreshold, heatPalette, showForest, showForestPaths, showForestCone, showForestHistogram, showForestHistorical, showForestConnections, forestRegimeFilter, microOn, solidDev, loadedTemplate, saveCurrentSettings]);

  // v108: chart-template support — exposed to <TemplateDropdown>.
  // getCurrentConfig: flush current state into the per-tab bundle, then
  // return a copy of THIS tab's entry minus viewport-only fields.
  const getCurrentConfig = useCallback(() => {
    try { saveCurrentSettings(); } catch {}
    const tid = prevTabIdRef.current;
    if (!tid) return {};
    const entry = tickerSettingsRef.current[tid];
    if (!entry || typeof entry !== "object") return {};
    const copy = JSON.parse(JSON.stringify(entry));
    delete copy.scrollPos;
    delete copy.toolbarCollapsed;
    delete copy.loadedTemplate;   // v109: not part of a template's own config
    return copy;
  }, [saveCurrentSettings]);

  // v108: apply a saved template's config to THIS tab. Same defaults-merge
  // as the tab-restore effect's `if (saved)` branch (read from `c.` instead
  // of `saved.`). Drawings: only if the template was captured on the ticker
  // this tab currently shows. The state changes flow through the auto-save
  // effect, so the result persists per-tab.
  const onLoadTemplate = useCallback((template, templateName) => {
    if (!template || typeof template !== "object" || !template.config || typeof template.config !== "object") return;
    const c = template.config;
    setLayers({ bands: false, signals: true, ...(c.layers || {}) });
    setCg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, manual:false, ...(c.cg || {}) });
    setAg({ weekly:false, monthly:false, extremes:false, ...(c.ag || {}) });
    setBg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, ...(c.bg || {}) });
    setGg({ flip:false, expected_move:false, magnets:false, springs:false, reinforced:false, thin_ice:false, ...(c.gg || {}) });
    setSlotVis({ ...DEFAULT_SLOT_VIS, ...(c.slotVis || {}) });
    setIndicators({ ...DEFAULT_INDICATORS, ...(c.indicators || {}) });
    setIndicatorStyles(c.indicatorStyles || {});
    setConeStyles(c.coneStyles || {});
    setBandStyles(c.bandStyles || {});
    if (c.tf) { setTf(c.tf); onTimeframeChange?.(c.tf); }
    if (c.bc) setBc(c.bc);
    if (c.daysPerTf && typeof c.daysPerTf === "object") {
      setDaysPerTf({ ...defaultDaysPerTf(), ...c.daysPerTf });
    }
    if (c.historicalOn !== undefined) setHistoricalOn(!!c.historicalOn);
    if (c.historicalFrom !== undefined) setHistoricalFrom(c.historicalFrom || null);
    if (c.historicalTo   !== undefined) setHistoricalTo(c.historicalTo   || null);
    if (c.heat && typeof c.heat === "object") {
      const h = c.heat;
      if (h.show      !== undefined) setShowHeat(!!h.show);
      if (h.proHeat   !== undefined) setShowProHeat(!!h.proHeat);
      if (h.opacity   !== undefined) setHeatOpacity(h.opacity);
      if (h.contrast  !== undefined) setHeatContrast(h.contrast);
      if (h.threshold !== undefined) setHeatThreshold(h.threshold);
      if (h.palette) setHeatPalette(h.palette);
    }
    if (c.forest && typeof c.forest === "object") {
      const f = c.forest;
      if (f.show         !== undefined) setShowForest(!!f.show);
      if (f.paths        !== undefined) setShowForestPaths(!!f.paths);
      if (f.cone         !== undefined) setShowForestCone(!!f.cone);
      if (f.histogram    !== undefined) setShowForestHistogram(!!f.histogram);
      if (f.historical   !== undefined) setShowForestHistorical(!!f.historical);
      if (f.connections  !== undefined) setShowForestConnections(!!f.connections);
      if (f.regimeFilter !== undefined) setForestRegimeFilter(!!f.regimeFilter);
    }
    if (c.microOn  !== undefined) setMicroOn(!!c.microOn);
    if (c.solidDev !== undefined) setSolidDev(!!c.solidDev);
    setChartStyle(withChartStyleDefaults(c.chartStyle));
    // Drawings: only if the template was captured on this tab's current ticker.
    if (template.sourceTicker && template.sourceTicker === selectedTicker) {
      try { drawingMgrRef.current.deserialize(Array.isArray(c.drawings) ? c.drawings : []); } catch {}
      try { setDrawVersion(v => v + 1); } catch {}
    }
    // v109: a same-ticker load makes this chart "be" the template.
    if (template.sourceTicker && template.sourceTicker === selectedTicker && templateName) {
      setLoadedTemplate({ name: templateName, sourceTicker: selectedTicker });
    }
  }, [selectedTicker, onTimeframeChange]);

  // v94: ref-pinned latest saveCurrentSettings closure for the unmount-time
  //      and beforeunload-time saves. Without this, the cleanup below would
  //      capture the closure of saveCurrentSettings from FIRST mount, which
  //      reads stale state.
  const saveCurrentSettingsRef = useRef(saveCurrentSettings);
  useEffect(() => { saveCurrentSettingsRef.current = saveCurrentSettings; });

  // v94: save on unmount (tab switch off Quant→Live unmounts MainChart now).
  //      Empty deps → cleanup fires only on unmount.
  useEffect(() => {
    return () => {
      try { saveCurrentSettingsRef.current(); } catch {}
    };
  }, []);

  // v94: save on window close (Electron quit or window close button).
  useEffect(() => {
    const handler = () => { try { saveCurrentSettingsRef.current(); } catch {} };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Expose chart settings for profile save/load ──
  useImperativeHandle(ref, () => ({
    getSettings() {
      saveCurrentSettings();
      return JSON.parse(JSON.stringify(tickerSettingsRef.current));
    },
    applySettings(allSettings) {
      if (!allSettings || typeof allSettings !== "object") return;
      tickerSettingsRef.current = JSON.parse(JSON.stringify(allSettings));
      const current = tickerSettingsRef.current[tabId];   // v106: keyed by tabId
      if (current) {
        // v101: defaults-merge so sparse saved snapshots can't leave keys undefined.
        setLayers({ bands: false, signals: true, ...(current.layers || {}) });
        setCg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, manual:false, ...(current.cg || {}) });
        setAg({ weekly:false, monthly:false, extremes:false, ...(current.ag || {}) });
        setBg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, ...(current.bg || {}) });
        setGg({ flip:false, expected_move:false, magnets:false, springs:false, reinforced:false, thin_ice:false, ...(current.gg || {}) });
        setSlotVis({ ...DEFAULT_SLOT_VIS, ...(current.slotVis || {}) });
        setIndicators({ ...DEFAULT_INDICATORS, ...(current.indicators || {}) });
        setIndicatorStyles(current.indicatorStyles || {});
        setConeStyles(current.coneStyles || {});
        setBandStyles(current.bandStyles || {});
        if (current.tf) setTf(current.tf);
        if (current.bc) setBc(current.bc);
        if (current.toolbarCollapsed !== undefined) setToolbarCollapsed(current.toolbarCollapsed);
        // v98: NEW for TimeframeDropdown
        if (current.daysPerTf && typeof current.daysPerTf === "object") {
          setDaysPerTf({ ...defaultDaysPerTf(), ...current.daysPerTf });
        } else {
          setDaysPerTf(defaultDaysPerTf());
        }
        if (current.historicalOn !== undefined) setHistoricalOn(!!current.historicalOn);
        if (current.historicalFrom !== undefined) setHistoricalFrom(current.historicalFrom || null);
        if (current.historicalTo   !== undefined) setHistoricalTo(current.historicalTo   || null);
        // v103: previously-forgotten overlay toggles (defaults-merge)
        if (current.heat && typeof current.heat === "object") {
          const h = current.heat;
          if (h.show      !== undefined) setShowHeat(!!h.show);
          if (h.proHeat   !== undefined) setShowProHeat(!!h.proHeat);
          if (h.opacity   !== undefined) setHeatOpacity(h.opacity);
          if (h.contrast  !== undefined) setHeatContrast(h.contrast);
          if (h.threshold !== undefined) setHeatThreshold(h.threshold);
          if (h.palette) setHeatPalette(h.palette);
        }
        if (current.forest && typeof current.forest === "object") {
          const f = current.forest;
          if (f.show         !== undefined) setShowForest(!!f.show);
          if (f.paths        !== undefined) setShowForestPaths(!!f.paths);
          if (f.cone         !== undefined) setShowForestCone(!!f.cone);
          if (f.histogram    !== undefined) setShowForestHistogram(!!f.histogram);
          if (f.historical   !== undefined) setShowForestHistorical(!!f.historical);
          if (f.connections  !== undefined) setShowForestConnections(!!f.connections);
          if (f.regimeFilter !== undefined) setForestRegimeFilter(!!f.regimeFilter);
        }
        if (current.microOn  !== undefined) setMicroOn(!!current.microOn);
        if (current.solidDev !== undefined) setSolidDev(!!current.solidDev);
        // v88: chartStyle restore — withChartStyleDefaults() fills any missing
        //      fields (legacy snapshots saved before this feature shipped).
        setChartStyle(withChartStyleDefaults(current.chartStyle));
        if (current.drawings) drawingMgrRef.current.deserialize(current.drawings);
        if (current.scrollPos != null) {
          restoringScrollRef.current = true;
          setTimeout(() => {
            try { chartRef.current?.timeScale()?.scrollToPosition(current.scrollPos, false); } catch {}
            restoringScrollRef.current = false;
          userScrolledRef.current = false; // reset for new ticker
          }, 600);
        }
      }
    },
    // ── Keyboard shortcut control methods (Phase 4A) ──
    getTimeframe() { return tf; },
    setTimeframe(newTf) { if (TIMEFRAMES.includes(newTf)) { setTf(newTf); onTimeframeChange?.(newTf); } },
    toggleBands() { setLayers(p => ({ ...p, bands: !p.bands })); },
    toggleSignals() { setLayers(p => ({ ...p, signals: !p.signals })); },
    toggleAllCones() { setCg(p => { const on = Object.values(p).some(v => v); const n = {}; for (const k of Object.keys(p)) n[k] = !on; return n; }); },
    toggleAllAnchors() { setAg(p => { const on = Object.values(p).some(v => v); const n = {}; for (const k of Object.keys(p)) n[k] = !on; return n; }); },
    // runCalculate — REMOVED (Rule C1: no calculation triggers in consumer)
    /** LWC chart screenshot → returns data URL (PNG) or null */
    takeScreenshot() {
      try {
        const canvas = chartRef.current?.takeScreenshot();
        return canvas?.toDataURL("image/png") || null;
      } catch { return null; }
    },
    // v97: F-key keyboard shortcut → fit chart.
    fitChart() { try { fitChartRef.current?.(); } catch {} },
    // ── Drawing tools (Phase 4C) ──
    setActiveTool(tool) { setActiveTool(tool); },
    cancelDrawing() { setActiveTool(null); drawPointRef.current = null; pathPointsRef.current = null; fibExtPointsRef.current = null; drawPrimRef.current?.setPreview(null); drawingMgrRef.current.deselect(); },
    // ── Chart settings modal (v91, Phase D Task 12) ──
    openChartSettings() { setChartSettingsOpen(true); },
    closeChartSettings() { setChartSettingsOpen(false); },
  }), [saveCurrentSettings, selectedTicker, tabId, tf, onTimeframeChange]);

  // ── Restore settings when entering a tab (v106: keyed by tabId) ──
  useEffect(() => {
    if (prevTabIdRef.current && prevTabIdRef.current !== tabId) {
      saveCurrentSettings();
    }
    prevTabIdRef.current = tabId;
    if (!tabId) return;
    // Clear any in-progress drawing on tab switch
    setActiveTool(null); drawPointRef.current = null; fibExtPointsRef.current = null;

    const saved = tickerSettingsRef.current[tabId];
    if (saved) {
      // v101: defaults-merge so sparse saved snapshots can't leave keys undefined.
      setLayers({ bands: false, signals: true, ...(saved.layers || {}) });
      setCg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, manual:false, ...(saved.cg || {}) });
      setAg({ weekly:false, monthly:false, extremes:false, ...(saved.ag || {}) });
      setBg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false, ...(saved.bg || {}) });
      setGg({ flip:false, expected_move:false, magnets:false, springs:false, reinforced:false, thin_ice:false, ...(saved.gg || {}) });
      setSlotVis({ ...DEFAULT_SLOT_VIS, ...(saved.slotVis || {}) });
      setIndicators({ ...DEFAULT_INDICATORS, ...(saved.indicators || {}) });
      setIndicatorStyles(saved.indicatorStyles || {});
      setConeStyles(saved.coneStyles || {});
      setBandStyles(saved.bandStyles || {});
      setTf(saved.tf);
      if (saved.bc) setBc(saved.bc);
      if (saved.toolbarCollapsed !== undefined) setToolbarCollapsed(saved.toolbarCollapsed);
      // v98: NEW for TimeframeDropdown
      if (saved.daysPerTf && typeof saved.daysPerTf === "object") {
        setDaysPerTf({ ...defaultDaysPerTf(), ...saved.daysPerTf });
      } else {
        setDaysPerTf(defaultDaysPerTf());
      }
      if (saved.historicalOn !== undefined) setHistoricalOn(!!saved.historicalOn);
      if (saved.historicalFrom !== undefined) setHistoricalFrom(saved.historicalFrom || null);
      if (saved.historicalTo   !== undefined) setHistoricalTo(saved.historicalTo   || null);
      // v103: previously-forgotten overlay toggles (defaults-merge)
      if (saved.heat && typeof saved.heat === "object") {
        const h = saved.heat;
        if (h.show      !== undefined) setShowHeat(!!h.show);
        if (h.proHeat   !== undefined) setShowProHeat(!!h.proHeat);
        if (h.opacity   !== undefined) setHeatOpacity(h.opacity);
        if (h.contrast  !== undefined) setHeatContrast(h.contrast);
        if (h.threshold !== undefined) setHeatThreshold(h.threshold);
        if (h.palette) setHeatPalette(h.palette);
      }
      if (saved.forest && typeof saved.forest === "object") {
        const f = saved.forest;
        if (f.show         !== undefined) setShowForest(!!f.show);
        if (f.paths        !== undefined) setShowForestPaths(!!f.paths);
        if (f.cone         !== undefined) setShowForestCone(!!f.cone);
        if (f.histogram    !== undefined) setShowForestHistogram(!!f.histogram);
        if (f.historical   !== undefined) setShowForestHistorical(!!f.historical);
        if (f.connections  !== undefined) setShowForestConnections(!!f.connections);
        if (f.regimeFilter !== undefined) setForestRegimeFilter(!!f.regimeFilter);
      }
      if (saved.microOn  !== undefined) setMicroOn(!!saved.microOn);
      if (saved.solidDev !== undefined) setSolidDev(!!saved.solidDev);
      // v109: which template is "active" on this tab
      setLoadedTemplate(saved.loadedTemplate && typeof saved.loadedTemplate === "object" ? saved.loadedTemplate : null);
      // v88: restore chartStyle for this ticker (or fall back to defaults
      //      via withChartStyleDefaults if the snapshot predates this feature)
      setChartStyle(withChartStyleDefaults(saved.chartStyle));
      if (saved.scrollPos != null) {
        restoringScrollRef.current = true;
        setTimeout(() => {
          try { chartRef.current?.timeScale()?.scrollToPosition(saved.scrollPos, false); } catch {}
          restoringScrollRef.current = false;
        }, 600);
      }
    } else {
      const d = makeDefaultSettings();
      setLayers(d.layers);
      setCg(d.cg);
      setAg(d.ag);
      setBg({ daily:false, weekly:false, monthly:false, ext_high:false, ext_low:false });
      setSlotVis({ ...DEFAULT_SLOT_VIS });
      setIndicators(d.indicators);
      setIndicatorStyles({});
      setConeStyles(d.coneStyles);
      setBandStyles(d.bandStyles || {});
      setTf(d.tf);
      // v98: brand-new ticker → fresh defaults for TimeframeDropdown state
      setDaysPerTf(defaultDaysPerTf());
      setHistoricalOn(false);
      setHistoricalFrom(null);
      setHistoricalTo(null);
      // v103: brand-new ticker → reset all overlay toggles to their hard defaults
      setShowHeat(false); setShowProHeat(false);
      setHeatOpacity(0.38); setHeatContrast(0.75); setHeatThreshold(0.05); setHeatPalette("fire");
      setShowForest(false); setShowForestPaths(true); setShowForestCone(true);
      setShowForestHistogram(true); setShowForestHistorical(true); setShowForestConnections(false);
      setForestRegimeFilter(false);
      setMicroOn(false); setSolidDev(true);
      // v109: brand-new ticker → no active template
      setLoadedTemplate(null);
      // v88: brand-new ticker → fresh chart style from defaults
      setChartStyle(withChartStyleDefaults(null));
    }
  }, [tabId]);

  // ── Toggle helpers ──
  const tL = useCallback(k=>setLayers(p=>({...p,[k]:!p[k]})),[]);

  // v36: track the last cone group the user actually turned ON (excluding
  //      "manual" = quarterly, which is heavy and must be opted-in via the
  //      dropdown). The CONES button uses this to restore just one group on
  //      show-all, instead of enabling every cone and overloading the system.
  const lastUsedConeRef = useRef("weekly"); // sensible default

  const tC = useCallback(k=>setCg(p=>{
    const next = { ...p, [k]: !p[k] };
    if (next[k] && k !== "manual") lastUsedConeRef.current = k;
    return next;
  }),[]);

  // v36: CONES button behavior changed.
  //   - If any group is ON → hide all (unchanged).
  //   - If all OFF → turn ON only the last-used group (never "manual"). This
  //     prevents the old "enable every cone at once" spike that was choking
  //     the system on naked-chart re-enable.
  //   - "manual" (quarterly) stays OFF regardless; it's opted in from the
  //     CONES dropdown's sub-toggle only.
  const tCA = useCallback(()=>setCg(p=>{
    const on = Object.values(p).some(v => v);
    const n = {};
    for (const k of Object.keys(p)) n[k] = false;
    if (on) return n;                                        // hide all
    const lu = lastUsedConeRef.current;
    const pick = (lu && lu !== "manual" && (lu in p)) ? lu
               : ("weekly" in p ? "weekly" : Object.keys(p).find(k => k !== "manual"));
    if (pick) n[pick] = true;
    return n;
  }),[]);

  // v36: keep lastUsedConeRef in sync when cg is restored from profiles /
  //      ticker-switches. Without this, restoring a saved state with e.g.
  //      monthly:true leaves the ref stale at "weekly".
  useEffect(() => {
    const activeNonManual = Object.entries(cg)
      .filter(([k, v]) => v && k !== "manual")
      .map(([k]) => k);
    if (activeNonManual.length > 0) {
      lastUsedConeRef.current = activeNonManual[activeNonManual.length - 1];
    }
  }, [cg]);
  const tA = useCallback(k=>setAg(p=>({...p,[k]:!p[k]})),[]);
  const tAA = useCallback(()=>setAg(p=>{const on=Object.values(p).some(v=>v);const n={};for(const k of Object.keys(p))n[k]=!on;return n;}),[]);
  const tB = useCallback(k=>setBg(p=>({...p,[k]:!p[k]})),[]);
  const tBA = useCallback(()=>setBg(p=>{const on=Object.values(p).some(v=>v);const n={};for(const k of Object.keys(p))n[k]=!on;return n;}),[]);
  const tG = useCallback(k=>setGg(p=>({...p,[k]:!p[k]})),[]);
  const tGA = useCallback(()=>setGg(p=>{const on=Object.values(p).some(v=>v);const n={};for(const k of Object.keys(p))n[k]=!on;return n;}),[]);
  // Per-slot sub-toggle: defaults to true if missing, flips to false / back
  const tSV = useCallback(slot=>setSlotVis(p=>({...p,[slot]: p[slot] === false ? true : false})),[]);
  const tI = useCallback(k=>setIndicators(p=>({...p,[k]:!p[k]})),[]);

  const updateIndicatorStyle = useCallback((key, style) => {
    setIndicatorStyles(p => {
      const next = { ...p };
      if (style === null) { delete next[key]; } else { next[key] = style; }
      return next;
    });
  }, []);

  const updateConeStyle = useCallback((group, style) => {
    setConeStyles(p => {
      const next = { ...p };
      if (Object.keys(style).length === 0) { delete next[group]; } else { next[group] = style; }
      return next;
    });
  }, []);

  const updateBandStyle = useCallback((model, style) => {
    setBandStyles(p => {
      const next = { ...p };
      if (!style || Object.keys(style).length === 0) { delete next[model]; } else { next[model] = style; }
      return next;
    });
  }, []);

  const toggleBandModel = useCallback((model) => {
    setBandStyles(p => {
      const s = p[model] || {};
      return { ...p, [model]: { ...s, visible: !(s.visible ?? true) } };
    });
  }, []);

  const toggleAllBands = useCallback(() => {
    setLayers(p => ({ ...p, bands: !p.bands }));
  }, []);

  const handleImport = useCallback(() => {
    alert("Indicator import is coming in a future update.\n\nYou will be able to load custom .js indicator files here.");
  }, []);

  // ── Data fetching ──
  const [bandsD, setBandsD] = useState(null);
  const [anchD, setAnchD] = useState(null);
  const [coneD, setConeD] = useState(null);

  // v97: bands staleness — true when bandsD._last_modified (from backend
  //      v26) is older than the most recent ~22:00 UTC daily close
  //      (forex daily roll, ~17:00 NY EDT / ~17:00 NY EST). Producer
  //      recomputes bands during the 1-hour close-to-open gap; if the
  //      stamp predates the most recent close, the bands JSON missed
  //      that window. Falls through to false (fresh) when the field is
  //      missing — better than false alarms on legacy paths.
  const bandsStale = useMemo(() => {
    const ts = bandsD && typeof bandsD._last_modified === "number" ? bandsD._last_modified : null;
    if (ts == null) return false;
    const now = new Date();
    const close = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0,
    ));
    if (close.getTime() > now.getTime()) {
      close.setUTCDate(close.getUTCDate() - 1);
    }
    return (ts * 1000) < close.getTime();
  }, [bandsD]);

  // v97: auto-rebuild bands on timeframe change. Bands interpolate band-
  //      data dates onto the candle grid; if bands stay drawn while lc
  //      refreshes against new TF bars, the lines visually deform. The
  //      bands effect's deps intentionally exclude lc (rule #2 — don't
  //      rebuild every 15s on candle refresh), so we toggle bands off and
  //      back on with a short delay long enough for fetchBars to refresh
  //      raw + lc on the new TF (~350 ms is plenty on local backend).
  //      Imperceptible flicker; bands re-render against the new grid.
  const prevTfForBandsRef = useRef(tf);
  useEffect(() => {
    if (prevTfForBandsRef.current === tf) return;
    prevTfForBandsRef.current = tf;
    if (!layers.bands) return;
    setLayers(p => ({ ...p, bands: false }));
    const id = setTimeout(() => {
      setLayers(p => ({ ...p, bands: true }));
    }, 350);
    return () => clearTimeout(id);
  }, [tf]); // layers.bands read for the gate but intentionally not in deps
            // (avoids re-firing when the user manually toggles bands)

  // v19: MICRO scalp bands (microOn moved up near solidDev — v103, see note there)
  const [scalpD, setScalpD] = useState(null);
  const microRefs = useRef([]);  // line series refs for cleanup
  // REMOVED: calcSt, calcing, doCalc, pollR (Rule C1 — no calculation triggers)

  useEffect(()=>{ if(!selectedTicker||!fetchBars)return; setLoading(true); fetchBars(selectedTicker,tf,cnt).finally(()=>setLoading(false)); },[selectedTicker,tf,fetchBars,cnt]);

  // ── Periodic bar refresh — keeps candles flowing when WS misses bars ──
  useEffect(() => {
    if (!selectedTicker || !fetchBars) return;
    const id = setInterval(() => { fetchBars(selectedTicker, tf, cnt); }, 15000);
    return () => clearInterval(id);
  }, [selectedTicker, tf, fetchBars, cnt]);
  useEffect(()=>{ setBc(null); },[tf]);
  const initialRangeSetRef = useRef({});
  // Bump this to force a re-fetch of bands/anchors/cones without changing ticker.
  const [syncTick, setSyncTick] = useState(0);
  useEffect(()=>{ if(!selectedTicker)return;
    // Only clear on ticker change (syncTick==0 branch), not on every sync — avoids chart flicker.
    if (syncTick === 0) { setBandsD(null); setAnchD(null); setConeD(null);
      initialRangeSetRef.current = {};
      firstSetDataDoneRef.current = {};
    }
    // v23: JSON-equality guard — only update state when payload actually
    //      differs. Prevents periodic sync from triggering cone/band
    //      teardown-rebuild (and the "chart jumps right" reflow) when the
    //      server returned the same data as last fetch.
    const setIfChanged = (setter, next) => {
      setter(prev => {
        try {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        } catch {}
        return next;
      });
    };
    api(`/api/bands/${selectedTicker}`).then(d=>{ setIfChanged(setBandsD, d || null); if(!d) log("debug",`${selectedTicker} — no bands data`); });
    api(`/api/anchors/${selectedTicker}`).then(d=>{ setIfChanged(setAnchD, d || null); if(!d) log("debug",`${selectedTicker} — no anchors data`); });
    api(`/api/cones/${selectedTicker}`).then(d=>{ setIfChanged(setConeD, d || null); if(!d) log("debug",`${selectedTicker} — no cones data`); });
    // v19: scalp bands (MICRO toggle); v23: equality-guarded.
    api(`/api/scalp_bands/${selectedTicker}`).then(d=>{ setIfChanged(setScalpD, d || null); });
    // v25: quarterly cones (schema quarterly_cones_v2) → MANUAL slots.
    //   Producer writes 4 anchors × 2 models = 8 keys: gbm|mjd_quarter_{curr|prev1|prev2|prev3}
    //   Consumer maps to: gbm|mjd_manual (curr) + gbm|mjd_manual_p{1,2,3}.
    //   Each of the 4 anchors is an independent sub-toggle in CONES → MANUAL.
    api(`/api/quarterly_cones/${selectedTicker}`).then(d => {
      if (!d || typeof d !== "object") { setIfChanged(setManualConeData, null); return; }
      const mapped = {};
      if (d.gbm_quarter_curr)  mapped.gbm_manual    = d.gbm_quarter_curr;
      if (d.mjd_quarter_curr)  mapped.mjd_manual    = d.mjd_quarter_curr;
      if (d.gbm_quarter_prev1) mapped.gbm_manual_p1 = d.gbm_quarter_prev1;
      if (d.mjd_quarter_prev1) mapped.mjd_manual_p1 = d.mjd_quarter_prev1;
      if (d.gbm_quarter_prev2) mapped.gbm_manual_p2 = d.gbm_quarter_prev2;
      if (d.mjd_quarter_prev2) mapped.mjd_manual_p2 = d.mjd_quarter_prev2;
      if (d.gbm_quarter_prev3) mapped.gbm_manual_p3 = d.gbm_quarter_prev3;
      if (d.mjd_quarter_prev3) mapped.mjd_manual_p3 = d.mjd_quarter_prev3;
      setIfChanged(setManualConeData, Object.keys(mapped).length ? mapped : null);
    }).catch(() => setIfChanged(setManualConeData, null));
  },[selectedTicker, syncTick]);

  // Reset syncTick to 0 when ticker changes so next ticker-change branch clears state.
  useEffect(() => { setSyncTick(0); }, [selectedTicker]);

  // v26: notify backend which symbol is in focus so the focus_tick_loop polls
  //      it at FOCUS_TICK_INTERVAL when USE TICK DATA is on.
  // v27: only the *visible* chart claims focus (multiple MainCharts are
  //      mounted in tabs mode — last-mounted-wins was wrong). Inactive tabs
  //      stay quiet; switching tabs immediately re-points the backend.
  useEffect(() => {
    if (!isActive || !selectedTicker) return;
    const url = `/api/focus/${encodeURIComponent(selectedTicker)}`;
    fetch(url, { method: "POST" }).catch(() => {});
    return () => {
      fetch("/api/focus", { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [isActive, selectedTicker]);

  // Listen for cache/sync events → refetch bands/anchors/cones for current ticker.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setSyncTick(t => t + 1);
    window.addEventListener("mk:data-sync-complete", onSync);
    return () => window.removeEventListener("mk:data-sync-complete", onSync);
  }, []);

  // ── Sauce/options data fetch (for magnet/spring/reinforced/thin-ice overlays) ──
  // v4: syncTick added to deps so cache watcher / periodic sync / refresh-button
  //     events trigger a refetch. Handler always applies result (null clears).
  // v47: always probe on ticker change so the GEX button can reliably know
  //      whether options data exists for the asset — drives the greyed-out
  //      disabled state when there's none. Result is memoized per ticker
  //      via optionsAvailRef so we only hit the network once per asset.
  const [optionsD, setOptionsD] = useState(null);
  const optionsAvailRef = useRef({}); // ticker -> true | false
  const [optionsAvailable, setOptionsAvailable] = useState(null); // for current ticker
  useEffect(() => {
    if (!selectedTicker) { setOptionsD(null); setOptionsAvailable(null); return; }
    // Apply cached availability immediately if we've already probed.
    const cached = optionsAvailRef.current[selectedTicker];
    if (cached !== undefined) setOptionsAvailable(cached);

    let cancelled = false;
    api(`/api/options/${selectedTicker}/full?n=8`).then(d => {
      if (cancelled) return;
      const ok = !!d;
      optionsAvailRef.current[selectedTicker] = ok;
      setOptionsAvailable(ok);
      setOptionsD(d || null);
      if (!d) log("debug", `${selectedTicker} — no options/sauce data`);
    });
    return () => { cancelled = true; };
  }, [selectedTicker, syncTick]);

  // Manual cone load — disabled in consumer (Rule C1)

  useEffect(()=>()=>{},[selectedTicker]);

  // ── Derived data ──
  const ad = selectedTicker ? assets?.get(selectedTicker) : null;
  const raw = ad?.candles||[];
  // v81: magnitude-based safety net for `dec`. When `assetMeta` isn't
  //   propagating from useConfig → useTerminalData → here (separate
  //   handoff bug), `ad.decimals` is undefined and the `|| 2` fallback
  //   makes EURUSD render priceFormat with minMove=0.01 — broken for
  //   forex majors at ~1.17 with 70-pip intraday range. Use price
  //   magnitude to detect a forex major and bump dec to 5 in that
  //   case. Other assets fall through to declared/fallback unchanged.
  const dec = (() => {
    const declared = ad?.decimals;
    const haveDeclared = Number.isFinite(declared) && declared >= 0 && declared <= 8;
    let d = haveDeclared ? declared : 2;
    // Probe price: prefer live tick; fall back to last bar close so the
    // override still works on a fresh ticker before the first tick lands.
    const probe = (ad?.price && ad.price > 0)
      ? ad.price
      : (raw.length > 0 ? Number(raw[raw.length - 1].c) : 0);
    if (probe > 0 && probe < 10 && d < 4) d = 5;        // forex majors
    return d;
  })();
  // v38: keep decRef in sync so beginPosDrag (declared above) reads the
  //      current decimals when formatting the success toast.
  decRef.current = dec;
  const lp = ad?.price||0;
  // v40: mirror lp into lpRef so placePendingOrder (defined above) can resolve
  //      LIMIT/STOP using the freshest market price without a TDZ.
  lpRef.current = lp;
  const proj = useMemo(() => {
    const base = (coneD && Object.keys(coneD).length > 0) ? coneD : (ad?.projections || {});
    // Merge manual cone data (if visible and available).
    // v25: carries eight keys — 4 anchors × 2 models (gbm, mjd).
    if (manualConeData && manualConeVisible) {
      const merged = { ...base };
      [
        "gbm_manual", "mjd_manual",
        "gbm_manual_p1", "mjd_manual_p1",
        "gbm_manual_p2", "mjd_manual_p2",
        "gbm_manual_p3", "mjd_manual_p3",
      ].forEach(k => { if (manualConeData[k]) merged[k] = manualConeData[k]; });
      return merged;
    }
    return base;
  }, [coneD, ad, manualConeData, manualConeVisible]);

  const lc = useMemo(()=>{ const s=new Set(); return raw.map(c=>({time:toUTC(c.t),open:c.o,high:c.h,low:c.l,close:c.c})).filter(c=>c.time>0&&!s.has(c.time)&&s.add(c.time)).sort((a,b)=>a.time-b.time); },[raw]);
  const lv = useMemo(()=>{
    const s=new Set();
    const vs = indicatorStyles?.volume_bar || {};
    const upCol = vs.color_up || "#2ebd59";
    const dnCol = vs.color_down || "#e8383b";
    const op = vs.opacity ?? 0.08;
    const toRgba = (hex, a) => {
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a})`;
    };
    return raw.map(c=>({time:toUTC(c.t),value:c.v||0,color:c.c>=c.o?toRgba(upCol,op):toRgba(dnCol,op)})).filter(c=>c.time>0&&!s.has(c.time)&&s.add(c.time)).sort((a,b)=>a.time-b.time);
  },[raw, indicatorStyles]);
  const aCK = useMemo(()=>{
    const k=new Set();
    const sv = slotVis || {};
    // A slot is ON unless explicitly set to false. Unknown slots = on.
    const allow = (key) => sv[coneKeyToSlot(key)] !== false;
    Object.entries(cg).forEach(([g,on])=>{
      if (!on || !CONE_GROUPS[g]) return;
      const gs = coneStyles[g] || {};
      CONE_GROUPS[g].keys.forEach(x => {
        if (gs.hide_gbm && x.startsWith("gbm_")) return;   // v110: per-group model hide
        if (gs.hide_mjd && x.startsWith("mjd_")) return;
        if (allow(x)) k.add(x);
      });
    });
    Object.entries(bg).forEach(([g,on])=>{if(on&&BATES_GROUPS[g])BATES_GROUPS[g].keys.forEach(x=>{ if(allow(x)) k.add(x); });});
    Object.entries(gg).forEach(([g,on])=>{if(on&&GEX_GROUPS[g])GEX_GROUPS[g].keys.forEach(x=>{ if(allow(x)) k.add(x); });});
    return k;
  },[cg,bg,gg,slotVis,coneStyles]);

  // ── Initial-load visible range lock ──
  // On first candle load for each ticker, explicitly set the visible range
  // to the last `cnt` bars. Without this, LWC auto-fits to include future
  // cone dates (especially gex_weekly_1/2) and the candles get squashed to
  // the leftmost ~10% of the chart.
  useEffect(() => {
    const ch = chartRef.current;
    if (!ready || !ch || !lc || lc.length === 0) return;
    if (initialRangeSetRef.current[selectedTicker]) return;

    // Wait one tick so cones/bands have a chance to attach first
    const id = setTimeout(() => {
      try {
        const total = lc.length;
        if (total < 2) return;
        // Show the most recent `cnt` bars (or all if fewer)
        const visibleBars = Math.min(cnt, total);
        const from = Math.max(0, total - visibleBars);
        // v33: include the full rightOffset future buffer in the initial visible
        //      range so the user SEES future timestamps on the x-axis (1 day
        //      worth). Without this, the axis ended at last_bar + 5 and LWC
        //      re-anchored on every tick to keep the latest bar hugging the
        //      right edge — the root cause of the per-tick snap.
        const futureBuffer = Math.max(24, Math.round(86400 / (TF_SECONDS[tf] || 900)));
        const to = total - 1 + futureBuffer;
        restoringScrollRef.current = true;
        try { ch.timeScale().setVisibleLogicalRange({ from, to }); } catch {}
        // v33: reverted v32's lock-after-fit. autoScale:false locked the Y to
        //      a possibly-wrong range and made the chart feel glued. Leaving
        //      autoScale on (LWC default); the real drag bug was handleScroll.
        requestAnimationFrame(() => {
          restoringScrollRef.current = false;
        });
        initialRangeSetRef.current[selectedTicker] = true;
      } catch {}
    }, 100);

    return () => clearTimeout(id);
  }, [ready, selectedTicker, lc, cnt]);

  const allAnch = useMemo(()=>{
    const l=[]; const s=anchD?.anchors; if(!s)return l;
    const m={vwap_weekly:s.vwap_weekly,vwap_monthly:s.vwap_monthly,high_weekly:s.prev_week_high,low_weekly:s.prev_week_low,high_monthly:s.prev_month_high,low_monthly:s.prev_month_low};
    for(const[k,p]of Object.entries(m))if(typeof p==="number"&&p>0)l.push({key:k,price:p,group:k.includes("monthly")?"monthly":"weekly"});
    const e7=anchD?.extremes?.["7d"],e30=anchD?.extremes?.["30d"];
    if(e7?.high_extreme>0)l.push({key:"ext_high_7d",price:e7.high_extreme,group:"extremes"});
    if(e7?.low_extreme>0)l.push({key:"ext_low_7d",price:e7.low_extreme,group:"extremes"});
    if(e30?.high_extreme>0)l.push({key:"ext_high_30d",price:e30.high_extreme,group:"extremes"});
    if(e30?.low_extreme>0)l.push({key:"ext_low_30d",price:e30.low_extreme,group:"extremes"});
    return l;
  },[anchD]);
  const actAnch = useMemo(()=>{ const on=new Set(Object.entries(ag).filter(([,v])=>v).map(([k])=>k)); return allAnch.filter(a=>on.has(a.group)); },[allAnch,ag]);

  // ── Signal data: merge lifecycle + daily signals ──
  const signalData = useMemo(() => {
    const result = [];
    const seenIds = new Set();

    if (lifecycle?.active) {
      for (const [sid, sig] of Object.entries(lifecycle.active)) {
        if (sig.ticker !== selectedTicker) continue;
        seenIds.add(sid);
        const sigType = sig.signal_type || "";
        const sc = SIGNAL_COLORS[sigType] || { color: C.gray, abbr: sigType.slice(0, 5).toUpperCase() };
        const state = (sig.state || "active").toLowerCase();
        const timestamp = sig.history?.[0]?.time || sig.generated_at || "";
        result.push({
          time: toUTC(timestamp),
          direction: (sig.direction || "long").toLowerCase(),
          signal_type: sigType,
          label: sc.abbr,
          color: sc.color,
          opacity: STATE_OPACITY[state] ?? 0.5,
          state,
          confidence: sig.confidence ?? 0,
          entry_price: sig.entry ?? sig.entry_price ?? 0,
          stop_loss: sig.stop ?? sig.stop_loss ?? 0,
          target_price: sig.target ?? sig.target_price ?? 0,
          high: 0, low: 0,
        });
      }
    }

    if (signals && selectedTicker) {
      const r = signals[selectedTicker] || signals?.signals?.[selectedTicker];
      if (Array.isArray(r)) {
        for (const item of r) {
          const s = item.signal || item;
          if (seenIds.has(s.signal_id)) continue;
          const sigType = s.signal_type || s.type || "";
          const sc = SIGNAL_COLORS[sigType] || { color: C.gray, abbr: sigType.slice(0, 5).toUpperCase() };
          const state = (s.state || "pending").toLowerCase();
          result.push({
            time: toUTC(s.generated_at || s.time || s.timestamp || s.entry_time),
            direction: (s.direction || s.side || "long").toLowerCase(),
            signal_type: sigType,
            label: sc.abbr,
            color: sc.color,
            opacity: STATE_OPACITY[state] ?? 0.5,
            state,
            confidence: s.confidence ?? 0,
            entry_price: s.entry_price ?? s.entry ?? 0,
            stop_loss: s.stop_loss ?? s.stop ?? 0,
            target_price: s.target_price ?? s.target ?? 0,
            high: 0, low: 0,
          });
        }
      }
    }

    return result.filter(s => s.time > 0);
  }, [signals, lifecycle, selectedTicker]);

  // ══════════════════════════════════════════════════════
  // CHART CREATION
  // ══════════════════════════════════════════════════════
  useEffect(()=>{
    const el=containerRef.current; if(!el||!createChart)return;
    let timer=null;
    const init=()=>{
      const w=el.clientWidth,h=el.clientHeight;
      if(w<50||h<30){timer=setTimeout(init,200);return;}
      try{
        if(chartRef.current)try{chartRef.current.remove();}catch{}
        const CM=LWC.CrosshairMode||{};const LS=LWC.LineStyle||{};
        // v33: EXPLICIT handleScroll / handleScale options. The previous
        //      objects only specified one field each, which in some LWC
        //      versions REPLACES the defaults rather than merging — that
        //      silently disabled `pressedMouseMove` (mouse-drag pan). Result:
        //      users couldn't drag the chart at all. Explicit true on every
        //      sub-option restores normal behavior.
        const ch=createChart(el,{
          width:w,height:h,
          layout:{background:{color:C.bg},textColor:C.gray,fontSize:10,fontFamily:mono,attributionLogo:false},
          grid:{vertLines:{visible:false},horzLines:{visible:false}},
          crosshair:{mode:CM.Normal,vertLine:{color:"#555",width:1,style:LS.Dashed,labelBackgroundColor:C.bgCard},horzLine:{color:"#555",width:1,style:LS.Dashed,labelBackgroundColor:C.orange}},
          rightPriceScale:{borderColor:C.borderLt,scaleMargins:{top:0.10,bottom:0.15}},
          // v33: rightOffset = 1 full day of bars for the current TF. Without
          //      future buffer, the x-axis ends exactly at the live candle →
          //      LWC re-anchors on every tick to keep the latest bar pinned
          //      to the right edge, which the user perceives as the candle
          //      snapping to the price axis. A day of buffer gives LWC enough
          //      headroom so tick updates don't trigger that re-anchor. Same
          //      trick cones/bands already supply when they extend to future.
          timeScale:{borderColor:C.borderLt,timeVisible:true,secondsVisible:false,rightOffset:Math.max(24,Math.round(86400 / (TF_SECONDS[tf] || 900))),autoScrollToRealTime:false,shiftVisibleRangeOnNewBar:false,lockVisibleTimeRangeOnResize:true},
          handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},
          handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:{time:true,price:true}},
        });
        chartRef.current=ch;
        // v35: re-enable priceLineVisible + lastValueVisible on the candle
        //      series. These were disabled in v32 as a misdiagnosis — the
        //      real snap was the missing time-axis future buffer (fixed in
        //      v34 via the invisible 1-month anchor). With the snap gone, the
        //      horizontal price line + label are standard-platform behavior
        //      and the user wants them back. Volume keeps its label hidden.
        // v81: bake priceFormat into addSeries so the axis-label generator
        //   has the right precision BEFORE the first setData. v80's
        //   applyOptions-after-setData path didn't reliably propagate to
        //   axis tick labels in LWC v5 — hence EURUSD showing "1.99996"
        //   garbage even with applyOptions firing correctly afterwards.
        //   Default precision=5 is safe: forex majors render correctly,
        //   indices/gold/JPY just show extra trailing zeros (visually
        //   verbose but functionally correct), and the dec-driven
        //   applyOptions effect below still fires to retune precision
        //   downward for non-forex once the asset metadata is known.
        candleRef.current=ch.addSeries(LWC.CandlestickSeries,{
          upColor:C.green,downColor:C.red,borderUpColor:C.green,borderDownColor:C.red,wickUpColor:C.green,wickDownColor:C.red,
          priceLineVisible:true,lastValueVisible:true,
          priceFormat:{type:"price",precision:5,minMove:0.00001},
        });
        volRef.current=ch.addSeries(LWC.HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"vol",priceLineVisible:false,lastValueVisible:false});
        // v34: invisible line series that carries 1 month of whitespace data
        //      past the last candle. Extends the time axis so LWC has future
        //      space to display — kills the per-tick "candle snaps to price
        //      axis" re-anchor on naked charts, same effect cones/bands had.
        timeAnchorRef.current=ch.addSeries(LWC.LineSeries,{color:"rgba(0,0,0,0)",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null});
        ch.priceScale("vol").applyOptions({scaleMargins:{top:0.88,bottom:0}});
        let roTimer=null;
        let isChartDestroyed=false;
        let prevRoWidth = 0;  // v22: track last-seen container width
        const ro=new ResizeObserver(e=>{
          if(isChartDestroyed)return;
          const{width:rw,height:rh}=e[0].contentRect;
          if(rw>50&&rh>30){
            // v22: detect transition from hidden (≤50px, e.g. display:none)
            // back to visible — we need to re-apply the saved time range
            // because LWC can end up locked at a single-bar zoom.
            const wasHidden = prevRoWidth <= 50;
            prevRoWidth = rw;
            if(roTimer)cancelAnimationFrame(roTimer);
            roTimer=requestAnimationFrame(()=>{
              if(isChartDestroyed)return;
              try{ch.resize(rw,rh);}catch{}
              if(wasHidden && lastTimeRangeRef.current){
                const r = lastTimeRangeRef.current;
                restoringScrollRef.current = true;
                try { ch.timeScale().setVisibleRange(r); } catch {}
                requestAnimationFrame(() => {
                  try { ch.timeScale().setVisibleRange(r); } catch {}
                  restoringScrollRef.current = false;
                });
              }
            });
          } else {
            prevRoWidth = rw;
          }
        });
        ro.observe(el); el._cleanup=()=>{isChartDestroyed=true;ro.disconnect();if(roTimer)cancelAnimationFrame(roTimer);setTimeout(()=>{try{ch.remove();}catch{}},50);};
        // Attach drawing primitive (Phase 4C)
        const dp = new DrawingPrimitive();
        candleRef.current.attachPrimitive(dp);
        drawPrimRef.current = dp;
        // Detect user scroll/zoom — suppress auto-scroll-to-position after manual interaction
        ch.timeScale().subscribeVisibleLogicalRangeChange(() => {
          if (!restoringScrollRef.current) userScrolledRef.current = true;
        });
        // v22: also capture the current TIME range so we can re-apply it on
        //      hide→show transitions (guards against LWC locking to a single
        //      bar while the tab is not displayed).
        ch.timeScale().subscribeVisibleTimeRangeChange((range) => {
          if (restoringScrollRef.current) return;
          if (range && range.from && range.to) {
            lastTimeRangeRef.current = range;
          }
        });
        setReady(true);
      }catch(e){console.error("[MC] init crash:",e);log("error",`Chart init crash: ${e.message}`);}
    };
    init();
    return()=>{if(timer)clearTimeout(timer);if(el?._cleanup)el._cleanup();try{if(signalPrimitiveRef.current){candleRef.current?.detachPrimitive?.(signalPrimitiveRef.current);signalPrimitiveRef.current=null;}}catch{}try{if(drawPrimRef.current){candleRef.current?.detachPrimitive?.(drawPrimRef.current);drawPrimRef.current=null;}}catch{}try{if(tradeHistPrimRef.current){candleRef.current?.detachPrimitive?.(tradeHistPrimRef.current);tradeHistPrimRef.current=null;}}catch{}signalLinesRef.current=[];chartRef.current=null;candleRef.current=null;volRef.current=null;regimeMacroRef.current=null;regimeMicroRef.current=null;try{if(regimeTooltipRef.current){regimeTooltipRef.current.remove();regimeTooltipRef.current=null;}}catch{}setReady(false);};
  },[]);

  // ── CANDLES + VOLUME ──
  // ── CANDLES + VOLUME ──
  // Save visible range BEFORE setData because LWC re-anchors its bar coordinate
  // system on setData, causing visible drift when new lc has shifted bar indices
  // (which happens every 15s when fetchBars runs). Initial positioning is handled
  // by the dedicated initial-range-lock useEffect, so no scrollToPosition here.
  useEffect(() => {
    if (!ready || !candleRef.current || lc.length < 2) return;
    const ch = chartRef.current;

    // v16: key by ticker+tf so TF switches reset the "first call" state.
    const key = `${selectedTicker}:${tf}`;
    const isFirstCall = !firstSetDataDoneRef.current[key];
    const prevLc = prevLcRef.current[key] || [];

    // v14: detect append-only evolution of lc. If detected, use update() for
    //      the new bars (and updated last bar) — no layout pass, no snap.
    //      Full setData remains for first-load, ticker switch, TF switch,
    //      and the rare case where historical bars change.
    // v15: conservative append-only detection. Only qualifies if:
    //   - prev_lc has ≥ 10 bars (meaningful baseline),
    //   - lc has at most 2 more bars than prev_lc (routine append),
    //   - first / middle / last-1 / last-prev bar times all align,
    //   - any new bar has strictly greater time than previous last.
    // Anything else → full setData (safe path, save/restore handles view).
    let isAppendOnly = false;
    let lastBarChanged = false;
    let newBars = [];
    const delta = lc.length - prevLc.length;
    if (!isFirstCall && prevLc.length >= 10 && delta >= 0 && delta <= 2) {
      const checkIdxs = [0, Math.floor(prevLc.length / 2), prevLc.length - 2, prevLc.length - 1];
      let prefixMatches = true;
      for (const i of checkIdxs) {
        if (i < 0 || i >= prevLc.length || i >= lc.length) { prefixMatches = false; break; }
        if (prevLc[i].time !== lc[i].time) { prefixMatches = false; break; }
      }
      if (prefixMatches) {
        const lastPrev = prevLc[prevLc.length - 1];
        const sameIdx  = lc[prevLc.length - 1];
        const candidateNew = lc.slice(prevLc.length);
        // Every new bar must be strictly after lastPrev.time and monotonic.
        let monotonic = true;
        let prevT = lastPrev.time;
        for (const b of candidateNew) {
          if (!(b.time > prevT)) { monotonic = false; break; }
          prevT = b.time;
        }
        if (monotonic) {
          isAppendOnly = true;
          newBars = candidateNew;
          if (sameIdx.open !== lastPrev.open || sameIdx.close !== lastPrev.close
            || sameIdx.high !== lastPrev.high || sameIdx.low !== lastPrev.low) {
            lastBarChanged = true;
          }
        }
      }
    }

    if (isAppendOnly && (newBars.length > 0 || lastBarChanged)) {
      // Incremental path — no layout pass. View stays pinned where user left it.
      try {
        if (lastBarChanged) {
          candleRef.current.update(lc[prevLc.length - 1]);
          if (volRef.current && lv[prevLc.length - 1]) volRef.current.update(lv[prevLc.length - 1]);
        }
        for (let i = 0; i < newBars.length; i++) {
          candleRef.current.update(newBars[i]);
          const vi = prevLc.length + i;
          if (volRef.current && lv[vi]) volRef.current.update(lv[vi]);
        }
      } catch (e) {
        console.warn("[MC] update() path failed, falling back to setData:", e);
        try {
          candleRef.current.setData(lc);
          if (volRef.current) volRef.current.setData(lv);
        } catch {}
      }
    } else {
      // Full setData path — save/restore view (time-range, sync + rAF).
      // v31: wrap restoringScrollRef BEFORE setData, not after. setData itself
      //      fires subscribeVisibleLogicalRangeChange; without the guard, LWC
      //      briefly shifts to its default anchor (latest bar) before the
      //      restore catches up — that's the "snap" on bar close.
      let savedTimeRange = null;
      if (!isFirstCall) {
        try { savedTimeRange = ch?.timeScale().getVisibleRange(); } catch {}
      }
      restoringScrollRef.current = true;
      try {
        candleRef.current.setData(lc);
        if (volRef.current) volRef.current.setData(lv);
      } catch (e) {
        console.error("[MC] setData:", e);
        log("error", `setData failed: ${e.message}`);
        restoringScrollRef.current = false;
        return;
      }
      if (savedTimeRange) {
        const r = savedTimeRange;
        try { ch?.timeScale().setVisibleRange(r); } catch {}
        requestAnimationFrame(() => {
          try { ch?.timeScale().setVisibleRange(r); } catch {}
          restoringScrollRef.current = false;
        });
      } else {
        restoringScrollRef.current = false;
      }
    }

    prevLcRef.current[key] = lc;

    firstSetDataDoneRef.current[key] = true;
  }, [ready, lc, lv, selectedTicker, tf]);

  // ── PRICE FORMAT — set decimal precision per asset (forex=5, indices=1, etc.) ──
  // v82: gate on `ad` having real data so we don't fire a precision=2
  //   fallback applyOptions during the load-race window. LWC v5 caches the
  //   first format set on the axis labels and doesn't re-propagate cleanly
  //   when subsequent applyOptions calls bring precision back up; if the
  //   first call is dec=2 (because `ad` was still undefined), the labels
  //   stay broken even after dec corrects to 5.
  useEffect(()=>{
    if(!ready||!candleRef.current)return;
    if(!ad)return;
    // Wait until we have either declared decimals OR a real price probe.
    // The chart was created with precision=5 baked in (addSeries above), so
    // EURUSD renders correctly until this effect supplies a better value.
    const haveDeclared = Number.isFinite(ad?.decimals) && ad.decimals >= 0;
    const havePrice    = Number.isFinite(ad?.price) && ad.price > 0;
    if (!haveDeclared && !havePrice) return;
    const _mm = Math.pow(10, -dec);
    console.log(`[priceFormat] ticker=${selectedTicker} ad.decimals=${ad?.decimals} ad.price=${ad?.price} dec=${dec} minMove=${_mm}`);
    try{candleRef.current.applyOptions({priceFormat:{type:"price",precision:dec,minMove:_mm}});}catch(e){console.warn("[priceFormat] applyOptions threw:", e);}
  },[ready,dec,selectedTicker,ad,ad?.decimals,ad?.price]);

  // v83: chart-level priceFormatter for the right-axis tick labels. Overrides
  //   any series-level priceFormat that LWC's z-order-based picker would
  //   otherwise use. Mandatory because cones/bands/scalp/anchor LineSeries
  //   added via `mkLine` omit priceFormat and inherit precision=2 default —
  //   for forex (~1.17 with 0.0007 visible range) that produces "1.99996"
  //   garbage labels. This callback formats every axis tick with the active
  //   asset's `dec`, immune to which series happens to be selected by
  //   `_internal_updateFormatter`.
  useEffect(() => {
    if (!ready || !chartRef.current) return;
    if (!Number.isFinite(dec) || dec < 0) return;
    try {
      chartRef.current.applyOptions({
        localization: {
          priceFormatter: (p) => Number.isFinite(p) ? p.toFixed(dec) : "",
        },
      });
    } catch (e) {
      console.warn("[priceFormatter] applyOptions threw:", e);
    }
  }, [ready, dec, selectedTicker]);

  // v89: apply chartStyle (background, grid, candle colors) live whenever
  //      the operator changes a swatch in ChartSettingsModal or a per-ticker
  //      restore lands a different chartStyle. Reads chartStyle from state,
  //      pushes via applyOptions on the chart + the candle series. Cheap;
  //      runs only when chartStyle changes.
  //
  // TODO Phase 2: chart type swap (candles/line/area/bars) requires removing
  //      the candlestick series and adding a different series type, plus
  //      re-wiring all overlays (cones, bands, signals, drawing primitive,
  //      trade history, position lines). For Phase 1, the chartType field in
  //      chartStyle is parked — the modal still sets it and it round-trips
  //      through tickerSettings, but the visible chart stays as candles.
  useEffect(() => {
    if (!ready) return;
    const c = chartRef.current;
    const s = candleRef.current;
    if (!c || !chartStyle) return;
    try {
      c.applyOptions({
        layout: { background: { type: "solid", color: chartStyle.background } },
        grid: {
          vertLines: { visible: !!chartStyle.gridLines, color: C.borderLt },
          horzLines: { visible: !!chartStyle.gridLines, color: C.borderLt },
        },
      });
    } catch (e) {
      console.warn("[chartStyle] chart applyOptions threw:", e);
    }
    if (s) {
      try {
        s.applyOptions({
          upColor:         chartStyle.bullishColor,
          downColor:       chartStyle.bearishColor,
          borderUpColor:   chartStyle.bullishColor,
          borderDownColor: chartStyle.bearishColor,
          wickUpColor:     chartStyle.bullishColor,
          wickDownColor:   chartStyle.bearishColor,
        });
      } catch (e) {
        console.warn("[chartStyle] candle applyOptions threw:", e);
      }
    }
  }, [ready, chartStyle]);

  // v33: keep the 1-day future buffer on the x-axis in sync with the current TF.
  //      Prevents per-tick re-anchor on naked charts (see init comment).
  useEffect(() => {
    if (!ready || !chartRef.current) return;
    const offset = Math.max(24, Math.round(86400 / (TF_SECONDS[tf] || 900)));
    try { chartRef.current.timeScale().applyOptions({ rightOffset: offset }); } catch {}
  }, [ready, tf]);

  // v90: session-separator overlay paint loop. Subscribes to visible-range
  //      changes + ResizeObserver on the chart container, redraws the canvas
  //      with vertical lines at market-close and RTH boundaries. Bars come
  //      from `lc` (canonical bars useMemo at component scope — the same
  //      array fed into candleRef.current.setData). Skips entirely when
  //      both separators are toggled off in chartStyle, when the asset is
  //      crypto / unsupported (sessionTimesFor returns null for both bounds),
  //      or before the chart is `ready`.
  //
  // v92: split into two effects to dodge a resubscribe-per-tick perf hazard.
  //      `lc` is a useMemo that rebuilds on every poll/tick that mutates the
  //      candle array, so a single effect with `lc` in deps was tearing down
  //      and re-creating the LWC subscription + ResizeObserver up to 5x/sec
  //      under tick-mode. The split:
  //        - drawSeparatorsRef holds the current closure
  //        - effect 1 (deps: ready, chartStyle, selectedTicker, lc) refreshes
  //          the closure and triggers a single redraw
  //        - effect 2 (deps: ready) wires the subscription / observer ONCE
  //          and routes both events to drawSeparatorsRef.current()
  const drawSeparatorsRef = useRef(() => {});

  // Effect 1 — refresh the draw closure whenever inputs change, then redraw.
  useEffect(() => {
    if (!ready) return;
    const cnv = separatorOverlayRef.current;
    const c = chartRef.current;
    if (!cnv || !c) return;

    const sessions = sessionTimesFor(selectedTicker);
    const mc = chartStyle?.marketCloseSeparator;
    const rt = chartStyle?.rthSeparator;
    const showClose = !!(mc?.show && sessions?.marketClose);
    const showRth   = !!(rt?.show && sessions?.rthOpen);

    drawSeparatorsRef.current = () => {
      const parent = cnv.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      // Sync canvas pixel size to CSS size (DPR-aware)
      cnv.width  = Math.floor(rect.width * dpr);
      cnv.height = Math.floor(rect.height * dpr);
      cnv.style.width  = rect.width  + "px";
      cnv.style.height = rect.height + "px";
      const ctx = cnv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (!showClose && !showRth) return;
      if (!Array.isArray(lc) || lc.length === 0) return;

      let boundaries;
      try {
        boundaries = findBoundaryBars(lc, sessions);
      } catch (e) {
        console.warn("[separators] findBoundaryBars threw:", e);
        return;
      }
      const ts = c.timeScale();
      if (showClose) {
        for (const t of boundaries.close) {
          let x;
          try { x = ts.timeToCoordinate(t); } catch { x = null; }
          if (x != null) drawVerticalLine(ctx, x, rect.height, mc);
        }
      }
      if (showRth) {
        for (const t of boundaries.rth) {
          let x;
          try { x = ts.timeToCoordinate(t); } catch { x = null; }
          if (x != null) drawVerticalLine(ctx, x, rect.height, rt);
        }
      }
    };

    // Trigger an immediate redraw whenever the closure refreshes.
    drawSeparatorsRef.current();
  }, [ready, chartStyle, selectedTicker, lc]);

  // Effect 2 — subscribe / observe ONCE per chart instance. Both events
  //            forward to drawSeparatorsRef.current() so they always see
  //            the latest closure (refreshed by effect 1 above).
  useEffect(() => {
    if (!ready) return;
    const cnv = separatorOverlayRef.current;
    const c = chartRef.current;
    if (!cnv || !c) return;

    const ts = c.timeScale();
    const onRange = () => { try { drawSeparatorsRef.current(); } catch {} };
    try { ts.subscribeVisibleTimeRangeChange(onRange); } catch {}

    let ro = null;
    try {
      ro = new ResizeObserver(() => { try { drawSeparatorsRef.current(); } catch {} });
      if (cnv.parentElement) ro.observe(cnv.parentElement);
    } catch {}

    return () => {
      try { ts.unsubscribeVisibleTimeRangeChange(onRange); } catch {}
      try { ro?.disconnect(); } catch {}
    };
  }, [ready]);

  // v34: Populate the invisible 1-month future anchor. Runs on:
  //   - ticker/tf change (lc, tf) — rebuilds the anchor against the new latest bar
  //   - syncTick (new closed bar) — extends the anchor forward from the new bar
  //   Data is whitespace ({time}) so it doesn't paint but forces LWC to keep
  //   the time axis extended — no more per-tick snap on naked charts.
  useEffect(() => {
    if (!ready || !timeAnchorRef.current || lc.length === 0) return;
    const lastTime = lc[lc.length - 1].time;
    const barSec = TF_SECONDS[tf] || 900;
    const MONTH_SEC = 30 * 86400;
    const nBars = Math.min(4000, Math.ceil(MONTH_SEC / barSec)); // cap at 4k for sanity
    const data = new Array(nBars);
    for (let i = 0; i < nBars; i++) {
      data[i] = { time: lastTime + (i + 1) * barSec };
    }
    // Suppress the visible-range listener trip during this setData
    restoringScrollRef.current = true;
    try { timeAnchorRef.current.setData(data); } catch {}
    requestAnimationFrame(() => { restoringScrollRef.current = false; });
  }, [ready, lc, tf]);

  // ── LIVE PRICE ──
  // Tracks running intrabar high/low so wicks form correctly without waiting for bar close.
  // v25: skip the LWC update() when the tick price is identical to the previous one —
  //      avoids redundant draws on quiet markets, especially with USE TICK DATA on.
  // v28: also skip while the user is actively dragging/scrolling the chart. The
  //      live update() was racing the drag handler — every tick triggered a price-
  //      axis autoscale, which yanked the visible window back to the live candle.
  //      The pending tick is captured in lastLpRef so when the user releases the
  //      mouse, the next tick paints the latest price (no missed candle).
  // v78: clear live-tracking refs on ticker change so a stale running
  //   high/low from the previous asset can't survive the swap (defense
  //   in depth — the ±15% bleed guard below is the primary line).
  useEffect(() => {
    liveBarTimeRef.current = 0;
    liveHighRef.current = -Infinity;
    liveLowRef.current  = Infinity;
    lastLpRef.current   = null;
  }, [selectedTicker]);

  useEffect(()=>{
    if(!ready||!candleRef.current||lc.length===0||lp<=0)return;
    if (isInteractingRef.current) return;  // v28 — pause while user drags
    // v31: v30's userScrolledRef gate removed. It was tripping on programmatic
    //      rebuilds (cone/band teardown fires subscribeVisibleLogicalRangeChange
    //      before restoringScrollRef is set), causing the chart to freeze
    //      without user input. Live ticks now always repaint the last candle
    //      unless the user is actively holding the mouse. Drag-stay-put is
    //      still enforced by the pointerdown/pointerup guard above.
    const l=lc[lc.length-1];
    // v78: cross-asset bleed guard. Compare `lp` to the bar's CLOSE
    //   (more current than open) with a ±15% band. Blocks all cross-
    //   asset ratios (e.g. US500 ~5900 vs gold ~4700 = 25% off → fail)
    //   while passing normal intra-asset volatility (crypto 5-10% swings,
    //   FX session gaps). Falls back to `open` if close is missing.
    const ref = l.close || l.open;
    if (ref > 0 && (lp < ref * 0.85 || lp > ref * 1.15)) return;
    // Reset tracking refs when a new bar starts
    if(l.time !== liveBarTimeRef.current){
      liveBarTimeRef.current = l.time;
      liveHighRef.current = l.high;
      liveLowRef.current  = l.low;
      lastLpRef.current   = null;  // force first paint of the new bar
    }
    // Cheap identical-price guard
    if (lastLpRef.current === lp) return;
    // Extend running high/low with current tick
    liveHighRef.current = Math.max(liveHighRef.current, lp);
    liveLowRef.current  = Math.min(liveLowRef.current,  lp);
    try{
      candleRef.current.update({
        time:  l.time,
        open:  l.open,
        high:  liveHighRef.current,
        low:   liveLowRef.current,
        close: lp,
      });
      lastLpRef.current = lp;
    }catch{}
  },[ready,lp,lc]);

  // v28/v29: drag guard. Pointer events fire BEFORE LWC's canvas captures them,
  //      and `capture: true` ensures we hear the press even if a child stops
  //      propagation. While held down: (a) the live tick effect no-ops so the
  //      chart isn't yanked by ticks, (b) the right price scale's autoScale
  //      is frozen so panning doesn't "zoom" as the visible candles change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onDown = () => {
      isInteractingRef.current = true;
      try { chartRef.current?.priceScale("right").applyOptions({ autoScale: false }); } catch {}
    };
    const onUp = () => {
      if (!isInteractingRef.current) return;
      isInteractingRef.current = false;
      // v29: do NOT re-enable price autoScale on release. Once the user has
      //      moved the chart, the price axis stays exactly where they left it.
      //      Only the F button restores autoScale (see FIT button handler).
    };
    // v30: bubble-phase (capture:true was suspected of racing LWC's internal
    //      pointer handlers). LWC dispatches its own listeners on bubble too,
    //      so both fire — ours just decides to freeze price autoscale.
    // v31: pointerleave removed — it force-released the drag mid-pan when the
    //      cursor briefly left the chart edge, which caused autoScale to pop
    //      back on and yank the Y axis. window.pointerup + pointercancel are
    //      enough to catch every legitimate release.
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ── CONES ──
  useEffect(()=>{
    const ch=chartRef.current;if(!ready||!ch||lc.length===0)return;
    // v31: save-then-suppress BEFORE removeSeries/addSeries. These operations
    //      fire subscribeVisibleLogicalRangeChange; without restoringScrollRef
    //      set, the listener trips userScrolledRef on every cone rebuild.
    const _savedRange = (() => {
      try { return ch.timeScale().getVisibleRange(); } catch { return null; }  // v12: time-based
    })();
    restoringScrollRef.current = true;
    Object.values(coneRefs.current).forEach(g=>Object.values(g).forEach(s=>{try{ch.removeSeries(s);}catch{}}));coneRefs.current={};
    const LS=LWC.LineStyle||{};
    const allConeKeys = [
      ...Object.keys(CONE_GROUPS).flatMap(g=>CONE_GROUPS[g].keys),
      ...Object.keys(BATES_GROUPS).flatMap(g=>BATES_GROUPS[g].keys),
      ...Object.keys(GEX_GROUPS).flatMap(g=>GEX_GROUPS[g].keys),
    ];
    allConeKeys.forEach(key=>{
      if(!aCK.has(key))return; const p=proj[key]; if(!p?.median||p.median.length<2)return;

      let groupKey = null;
      let isBates = false;
      for (const [gk, gv] of Object.entries(CONE_GROUPS)) {
        if (gv.keys.includes(key)) { groupKey = gk; break; }
      }
      let isGex = false;
      if (!groupKey) {
        for (const [gk, gv] of Object.entries(BATES_GROUPS)) {
          if (gv.keys.includes(key)) { groupKey = gk; isBates = true; break; }
        }
      }
      if (!groupKey) {
        for (const [gk, gv] of Object.entries(GEX_GROUPS)) {
          if (gv.keys.includes(key)) { groupKey = gk; isGex = true; break; }
        }
      }
      const styleKey = isBates && groupKey ? "bates_" + groupKey
                     : isGex  && groupKey ? "gex_"   + groupKey
                     : groupKey;
      const styleOverride = styleKey ? coneStyles[styleKey] : null;
      const v = getConeVis(key, null);

      let medColor = v.med, sd1Color = v.sd1, sd2Color = v.sd2, sd3Color = v.sd3 || "", lineW = v.w || 2;
      if (styleOverride) {
        // v58: per-model color override. Pick `color_gbm` for gbm_* keys,
        //   `color_mjd` for mjd_* keys; legacy single `color` falls through
        //   for either when the model-specific override isn't set.
        const isMjd = typeof key === "string" && key.toLowerCase().startsWith("mjd_");
        const modelColor = isMjd
          ? (styleOverride.color_mjd || styleOverride.color)
          : (styleOverride.color_gbm || styleOverride.color);
        if (modelColor) {
          const hex = modelColor;
          const op = styleOverride.opacity ?? 1.0;
          // v49: deviations use the same alpha as the median — at opacity=100%
          // every line is fully opaque. Visual hierarchy comes from line style
          // (solid/dashed/dotted) and width (lineW-1 on deviations).
          const alpha = Math.round(op * 255).toString(16).padStart(2,"0");
          medColor = hex + alpha;
          sd1Color = hex + alpha;
          sd2Color = hex + alpha;
          sd3Color = hex + alpha;
        }
        if (styleOverride.width) lineW = styleOverride.width;
      }
      // Fallback SD3 color if not set by override or vis config
      if (!sd3Color) {
        sd3Color = sd2Color.replace(/[\d.]+\)$/, m => (parseFloat(m)*0.6).toFixed(2) + ")");
      }

      const seen=new Set();
      const ts=p.dates?p.dates.map(d=>toUTC(d)):[];
      // v17: removed the monthly cone leftward shift — producer now anchors
      //      on day 1 of the month directly (or first trading day), and the
      //      client shift was dragging cones earlier than their actual anchor.
      if(ts.length<2)return;
      const mk=arr=>{
        const pts=[]; seen.clear();
        for(let i=0;i<Math.min(arr.length,ts.length);i++){
          if(ts[i]>0&&!seen.has(ts[i])){seen.add(ts[i]);pts.push({time:ts[i],value:arr[i]});}
        }
        const sorted = pts.sort((a,b)=>a.time-b.time);
        const candleTimes = lc.map(c => c.time);
        if (sorted.length < 2) return sorted;
        const interp = interpolateOnGrid(sorted, candleTimes);
        // v11: match the band-smoothing window to the TF so cone polylines
        // read curvy on any TF. Window scales inversely with step (7pt at H1).
        const tfSec = candleTimes.length >= 2
          ? Math.max(60, candleTimes[candleTimes.length-1] - candleTimes[candleTimes.length-2])
          : 900;
        const win = Math.max(5, Math.min(41, Math.round(7 * 3600 / tfSec)));
        return smoothBandData(interp, win);
      };
      // v8: solid deviations when solidDev is on (default); legacy styles otherwise.
      const devSolid = LS.Solid ?? 0;
      const dev1Style = solidDev ? devSolid : LS.Dashed;
      const dev2Style = solidDev ? devSolid : LS.Dotted;
      const dev3Style = solidDev ? devSolid : (LS.SparseDotted || LS.Dotted);

      const g={};
      g.med=mkLine(ch,medColor,lineW,v.d);g.med.setData(mk(p.median));
      if(p.sd1_high){g.s1h=mkLine(ch,sd1Color,Math.max(1,lineW-1),dev1Style);g.s1h.setData(mk(p.sd1_high));}
      if(p.sd1_low){g.s1l=mkLine(ch,sd1Color,Math.max(1,lineW-1),dev1Style);g.s1l.setData(mk(p.sd1_low));}
      if(p.sd2_high){g.s2h=mkLine(ch,sd2Color,Math.max(1,lineW-1),dev2Style);g.s2h.setData(mk(p.sd2_high));}
      if(p.sd2_low){g.s2l=mkLine(ch,sd2Color,Math.max(1,lineW-1),dev2Style);g.s2l.setData(mk(p.sd2_low));}
      // SD3 (3rd deviation — only present on manual cones and future cone types)
      if(p.sd3_high){g.s3h=mkLine(ch,sd3Color,Math.max(1,lineW-1),dev3Style);g.s3h.setData(mk(p.sd3_high));}
      if(p.sd3_low){g.s3l=mkLine(ch,sd3Color,Math.max(1,lineW-1),dev3Style);g.s3l.setData(mk(p.sd3_low));}
      coneRefs.current[key]=g;
    });
    // v31: release the guard INSIDE the rAF callback, not synchronously. The
    //      rAF-scheduled restore fires after the current microtask, so the
    //      old pattern (restoringScrollRef=false set synchronously) left the
    //      second restore's setVisibleRange trip userScrolledRef. Now the
    //      guard stays true through both restores.
    if (_savedRange) {
      try { ch.timeScale().setVisibleRange(_savedRange); } catch {}  // v12: time-based
      requestAnimationFrame(() => {
        try { ch.timeScale().setVisibleRange(_savedRange); } catch {}
        restoringScrollRef.current = false;
      });
    } else {
      restoringScrollRef.current = false;
    }
  // v14: lc removed — cones don't change when a single new bar arrives.
  },[ready,proj,aCK,tf,coneStyles,solidDev]);

  // ── SAUCE LEVELS — magnet/spring/reinforced/thin-ice horizontal price lines ──
  const sauceLineRefs = useRef([]);
  useEffect(() => {
    const candle = candleRef.current;
    if (!ready || !candle) return;
    // Clear previous price lines
    sauceLineRefs.current.forEach(pl => { try { candle.removePriceLine(pl); } catch {} });
    sauceLineRefs.current = [];

    if (!optionsD) return;
    // v41: ETF→CFD conversion moved to backend (data_server.py v12). Strikes
    //      arriving in optionsD are already in MT5 CFD price space.
    // v45: each GEX level now visualizes its strength three ways:
    //        · lineWidth scales 1→3 with normalized strength
    //        · an ASCII mini-bar (▇▇▇──) appears in the price-axis label
    //        · strong levels (s>=0.7) get a faint "halo" — a second wider
    //          translucent price line stacked behind the main one
    //      Together these make a 5-magnet cluster read visually distinct
    //      from a lone 1-magnet, without needing extra UI controls.
    // v47: dual-horizon sauce — SWING (nearest expiry, existing field) +
    //      0DTE (today-only, new field). Either may be null; we iterate
    //      whichever is available and the user has toggled ON.
    const sauceSwing = optionsD.sauce;
    // v111: synthesize sauce_0dte.{structural_integrity, volatility_gravity}
    // from raw gex_0dte + dealer_heatmap_0dte (DC msg #119 cookbook). DC
    // ships sauce_0dte with dealer_scenarios + market_entropy only; we
    // derive the chart-relevant composites here so drawSauceChain has
    // 0-DTE magnets/springs/reinforced/thin-ice strands to draw.
    const baseSauce0dte = optionsD.sauce_0dte;
    let sauce0dte = baseSauce0dte;
    if (optionsD.gex_0dte && optionsD.spot != null) {
      // v112: pass cfd_ratio_used so derivation converts chain → broker.
      const ratio = optionsD.cfd_ratio_used ?? 1.0;
      const si0 = deriveStructuralIntegrity0dte(optionsD.gex_0dte, optionsD.spot, ratio);
      const vg0 = deriveVolatilityGravity0dte(optionsD.gex_0dte, optionsD.dealer_heatmap_0dte, optionsD.spot, ratio);
      sauce0dte = {
        ...(baseSauce0dte || {}),
        structural_integrity: si0,
        volatility_gravity:   vg0,
      };
    }
    if (!sauceSwing && !sauce0dte) return;

    const LS = LWC.LineStyle || {};

    // Decimal precision for labels scales with magnitude.
    const fmtStrike = (p) => Number(p).toFixed(Math.abs(p) >= 100 ? 2 : 4);

    // Normalize helpers — produce [0..1] for any of the raw strength fields.
    const normByMax5   = (n) => Math.max(0, Math.min(1, (Number(n) || 0) / 5));
    const normByMag    = (n, max) => Math.max(0, Math.min(1, Math.abs(Number(n) || 0) / max));

    // 5-block strength bar. Filled blocks = strength, dashes = empty.
    const strengthBar  = (s01) => {
      const n = Math.round(Math.max(0, Math.min(1, s01)) * 5);
      return "▇".repeat(n) + "─".repeat(5 - n);
    };
    const widthFor     = (s01) => 1 + Math.round(Math.max(0, Math.min(1, s01)) * 2);  // 1..3

    // Convert a "#rrggbb" to a semi-transparent rgba for the halo layer.
    const toHalo = (hex) => {
      const h = (hex || "").replace("#", "");
      if (h.length !== 6) return hex;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},0.28)`;
    };

    const addLine = (price, color, title,
                       { lineWidth = 1, halo = false, lineStyle = LS.Dashed } = {}) => {
      if (price == null || !isFinite(price)) return;
      try {
        // Halo first so it renders behind the main line.
        if (halo) {
          const plGlow = candle.createPriceLine({
            price, color: toHalo(color),
            lineWidth: Math.min(4, lineWidth + 2),
            lineStyle: LS.Solid,
            axisLabelVisible: false,
            title: "",
          });
          sauceLineRefs.current.push(plGlow);
        }
        const pl = candle.createPriceLine({
          price, color,
          lineWidth,
          lineStyle,
          axisLabelVisible: true,
          title,
        });
        sauceLineRefs.current.push(pl);
      } catch {}
    };

    // v47: dual-horizon sauce levels. One helper drives both chains — caller
    // picks the source (`sauceSwing` vs `sauce0dte`), the horizon tag appended
    // to each label, and a style object that controls line thickness + halo
    // sensitivity + dash-vs-solid.
    //
    //   SWING: dashed, strength-scaled width (1..3), halo only on s>=0.7
    //          → quieter, "this week" context
    //   0DTE : solid,  width bumped +1,            halo on s>=0.5
    //          → louder, "this close" strength — visually dominates SWING
    //            when both horizons are toggled ON simultaneously.
    // v54: swing tag uses the actual expiry ("22APR") when DC ships
    //   swing_expiry; falls back to generic "SWING" for pre-v2.0 payloads.
    //   Same enrichment FLIP / EM already apply below.
    const swingExpLabelForSauce = (() => {
      const raw = optionsD?.swing_expiry;
      if (!raw) return "SWING";
      const [, mm, dd] = raw.split("-");
      const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const mon = MONTHS[parseInt(mm, 10) - 1] || mm;
      return `${dd}${mon}`;
    })();
    const SWING_STYLE = {
      horizonTag: swingExpLabelForSauce,  // display (e.g. "22APR")
      slotSuffix: "swing",                 // slotVis key (e.g. magnets_swing)
      lineStyle:  LS.Dashed,
      widthBump:  0,
      haloThresh: 0.7,
    };
    const DTE_STYLE = {
      horizonTag: "0DTE",
      slotSuffix: "0dte",
      lineStyle:  LS.Solid,
      widthBump:  1,
      haloThresh: 0.5,
    };

    const drawSauceChain = (sauceSrc, style) => {
      if (!sauceSrc) return;
      const hTag = style.horizonTag;
      const slotSfx = style.slotSuffix;
      const suffix = ` · ${hTag}`;
      const toWidth = (s01) => widthFor(s01) + style.widthBump;

      // volatility_gravity → magnets + springs
      const vg = sauceSrc.volatility_gravity?.levels || [];
      if (gg.magnets && slotVis[`magnets_${slotSfx}`] !== false) {
        vg.filter(l => l.type === "magnet").forEach(l => {
          const s = l.strength != null ? normByMax5(l.strength) : normByMag(l.gex_norm, 0.5);
          addLine(
            l.strike,
            GEX_GROUPS.magnets.color,
            `🧲 ${fmtStrike(l.strike)}${suffix}  ${strengthBar(s)}`,
            { lineWidth: toWidth(s), halo: s >= style.haloThresh, lineStyle: style.lineStyle },
          );
        });
      }
      if (gg.springs && slotVis[`springs_${slotSfx}`] !== false) {
        vg.filter(l => l.type === "spring").forEach(l => {
          const s = l.strength != null ? normByMax5(l.strength) : normByMag(l.gex_norm, 0.5);
          addLine(
            l.strike,
            GEX_GROUPS.springs.color,
            `🚀 ${fmtStrike(l.strike)}${suffix}  ${strengthBar(s)}`,
            { lineWidth: toWidth(s), halo: s >= style.haloThresh, lineStyle: style.lineStyle },
          );
        });
      }

      // structural_integrity → reinforced + thin_ice
      const si = sauceSrc.structural_integrity?.levels || [];
      if (gg.reinforced && slotVis[`reinforced_${slotSfx}`] !== false) {
        si.filter(l => (l.gex_norm ?? 0) > 0.1).forEach(l => {
          const s = normByMag(l.gex_norm, 0.5);
          const hardness = l.hardness ? ` ${String(l.hardness).toUpperCase()}` : "";
          addLine(
            l.strike,
            GEX_GROUPS.reinforced.color,
            `■ ${fmtStrike(l.strike)}${suffix}${hardness}  ${strengthBar(s)}`,
            { lineWidth: toWidth(s), halo: s >= style.haloThresh, lineStyle: style.lineStyle },
          );
        });
      }
      if (gg.thin_ice && slotVis[`thin_ice_${slotSfx}`] !== false) {
        si.filter(l => (l.gex_norm ?? 0) < -0.15).forEach(l => {
          const s = normByMag(l.gex_norm, 0.5);
          const hardness = l.hardness ? ` ${String(l.hardness).toUpperCase()}` : "";
          addLine(
            l.strike,
            GEX_GROUPS.thin_ice.color,
            `░ ${fmtStrike(l.strike)}${suffix}${hardness}  ${strengthBar(s)}`,
            { lineWidth: toWidth(s), halo: s >= style.haloThresh, lineStyle: style.lineStyle },
          );
        });
      }
    };

    // Draw order: SWING first (dashed/dim, behind), then 0DTE (solid/bright,
    // in front). LW-Charts renders price lines in insertion order, so 0DTE
    // visually dominates when both horizons are on at the same strike.
    drawSauceChain(sauceSwing, SWING_STYLE);
    drawSauceChain(sauce0dte,  DTE_STYLE);

    // v46: FLIP and EXPECTED MOVE groups.  Each has 0DTE and SWING sub-
    //      toggles driven by slotVis (flip_0dte / flip_swing / em_0dte /
    //      em_swing).  SWING uses the top-level aggregate fields DC ships
    //      today.  0DTE reads from gex_0dte / expected_move_0dte when
    //      present; if DC hasn't shipped them, the toggle stays visible
    //      but silently draws nothing until the data arrives.
    const flipSwingOn = gg.flip && slotVis.flip_swing !== false;
    const flipDteOn   = gg.flip && slotVis.flip_0dte  !== false;
    const emSwingOn   = gg.expected_move && slotVis.em_swing !== false;
    const emDteOn     = gg.expected_move && slotVis.em_0dte  !== false;

    // v48: swing label enrichment. DC v2.0 emits `swing_expiry` = the actual
    // date the swing EM reads from (the nearest NON-today expiry). We show
    // that date in the label ("· 22APR") instead of the generic "· SWING"
    // so the trader immediately sees which week's gamma the level reflects.
    // Fallback: if swing_expiry is absent (pre-v2.0 payload), keep "SWING".
    const swingExpLabel = (() => {
      const raw = optionsD?.swing_expiry;
      if (!raw) return "SWING";
      // raw is "YYYY-MM-DD" — format as "DDmmm" e.g. "22APR" for readability
      const [, mm, dd] = raw.split("-");
      const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const mon = MONTHS[parseInt(mm, 10) - 1] || mm;
      return `${dd}${mon}`;
    })();

    if (flipSwingOn) {
      const price = Number(optionsD?.gex_flip);
      if (Number.isFinite(price) && price > 0) {
        addLine(
          price, GEX_GROUPS.flip.color,
          `⚑ FLIP ${fmtStrike(price)} · ${swingExpLabel}`,
          { lineWidth: 2, halo: true },
        );
      }
    }
    if (flipDteOn) {
      const raw = optionsD?.gex_flip_0dte
              ?? optionsD?.gex_0dte?.flip
              ?? optionsD?.gex_0dte?.aggregate?.flip;
      const price = Number(raw);
      if (Number.isFinite(price) && price > 0) {
        addLine(
          price, GEX_GROUPS.flip.color,
          `⚑ FLIP ${fmtStrike(price)} · 0DTE`,
          { lineWidth: 2, halo: true },
        );
      }
    }

    if (emSwingOn) {
      const em = optionsD?.expected_move;
      if (em) {
        if (Number.isFinite(em.move_up))   addLine(em.move_up,   GEX_GROUPS.expected_move.color, `◆ EM+ ${fmtStrike(em.move_up)} · ${swingExpLabel}`,   { lineWidth: 1 });
        if (Number.isFinite(em.move_down)) addLine(em.move_down, GEX_GROUPS.expected_move.color, `◆ EM− ${fmtStrike(em.move_down)} · ${swingExpLabel}`, { lineWidth: 1 });
      }
    }
    if (emDteOn) {
      const em = optionsD?.expected_move_0dte ?? optionsD?.gex_0dte?.expected_move;
      if (em) {
        if (Number.isFinite(em.move_up))   addLine(em.move_up,   GEX_GROUPS.expected_move.color, `◆ EM+ ${fmtStrike(em.move_up)} · 0DTE`,   { lineWidth: 1 });
        if (Number.isFinite(em.move_down)) addLine(em.move_down, GEX_GROUPS.expected_move.color, `◆ EM− ${fmtStrike(em.move_down)} · 0DTE`, { lineWidth: 1 });
      }
    }

    // No cleanup return — the top-of-effect loop handles removal on each
    // re-run. A return cleanup would fire on every dep change and race
    // with the candle series' tick-update path, freezing live rendering.
  }, [ready, optionsD, gg.flip, gg.expected_move, gg.magnets, gg.springs, gg.reinforced, gg.thin_ice,
      slotVis.flip_0dte, slotVis.flip_swing, slotVis.em_0dte, slotVis.em_swing,
      // v47: sauce-level horizon sub-toggles
      slotVis.magnets_0dte,    slotVis.magnets_swing,
      slotVis.springs_0dte,    slotVis.springs_swing,
      slotVis.reinforced_0dte, slotVis.reinforced_swing,
      slotVis.thin_ice_0dte,   slotVis.thin_ice_swing]);

  // ── BANDS ──
  useEffect(()=>{
    const ch=chartRef.current;if(!ready||!ch)return;
    // Save visible range before rebuilding bands.
    // v9: always save (previously gated on userScrolledRef). Bands extend past
    //     candle data, so without the save-restore LWC auto-fits every rebuild
    //     — visible as a chart shift-right every 15s when lc refreshes.
    const _savedBandRange = (() => {
      try { return ch.timeScale().getVisibleRange(); } catch { return null; }  // v12: time-based
    })();
    // v31: suppress subscribeVisibleLogicalRangeChange throughout rebuild
    restoringScrollRef.current = true;
    if(bandRefs.current){Object.values(bandRefs.current).forEach(s=>{try{ch.removeSeries(s);}catch{}});bandRefs.current=null;}
    if(!layers.bands||!bandsD){
      // v31: early return still needs to release the guard (+ restore if we have a range)
      if (_savedBandRange) {
        try { ch.timeScale().setVisibleRange(_savedBandRange); } catch {}
        requestAnimationFrame(() => {
          try { ch.timeScale().setVisibleRange(_savedBandRange); } catch {}
          restoringScrollRef.current = false;
        });
      } else {
        restoringScrollRef.current = false;
      }
      return;
    }
    const ts=bandsD.timestamps||bandsD.dates||[];if(ts.length===0)return;
    const r={};
    const candleTimes=lc.map(c=>c.time);

    // Parse → interpolate onto candle grid → Gaussian-smooth.
    // Null/non-finite values (NaN sanitized by data_server) are stripped before
    // interpolation so a single bad point cannot crash the entire effect.
    const prep=(k)=>{
      const a=bandsD[k];if(!a?.length)return null;
      const raw=a.map((v,i)=>({time:toUTC(ts[i]),value:v}))
                 .filter(d=>d.time>0&&d.value!=null&&isFinite(d.value))
                 .sort((a,b)=>a.time-b.time);
      if(raw.length<2)return null;
      const interp=interpolateOnGrid(raw,candleTimes);
      if(!interp?.length)return null;
      // v11: scale smoothing window with TF so bands read curvy on every TF.
      const tfSec = candleTimes.length >= 2
        ? Math.max(60, candleTimes[candleTimes.length-1] - candleTimes[candleTimes.length-2])
        : 900;
      const win = Math.max(5, Math.min(41, Math.round(7 * 3600 / tfSec)));
      return smoothBandData(interp, win);
    };

    // Build rgba from a hex color + opacity
    const toRgba=(hex,op)=>{
      const r=parseInt(hex.slice(1,3),16);
      const g=parseInt(hex.slice(3,5),16);
      const b=parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${op})`;
    };

    // Resolve effective style for a model, merging defaults + user overrides
    const ms=(model)=>({...DEFAULT_BAND_STYLES[model],...(bandStyles[model]||{})});

    const set=(k,col,w)=>{
      const data=prep(k);if(!data)return;
      try{const s=mkLine(ch,col,w||1);s.setData(data);r[k]=s;}
      catch(e){console.warn("[bands] setData failed for "+k+":",e);}
    };

    // ── GBM bands ── (skip all if model hidden)
    const g=ms("gbm");
    if(g.visible!==false){
      const w=g.width||1;
      set("gbm_3sd_high",toRgba(g.color,g.op3),w);
      set("gbm_3sd_low", toRgba(g.color,g.op3),w);
      set("gbm_2sd_high",toRgba(g.color,g.op2),w);
      set("gbm_2sd_low", toRgba(g.color,g.op2),w);
      set("gbm_1sd_high",toRgba(g.color,g.op1),w+1);
      set("gbm_1sd_low", toRgba(g.color,g.op1),w+1);
    }

    // ── MJD bands ──
    const mj=ms("mjd");
    if(mj.visible!==false){
      const w=mj.width||1;
      set("mjd_3sd_high",toRgba(mj.color,mj.op3),w);
      set("mjd_3sd_low", toRgba(mj.color,mj.op3),w);
      set("mjd_2sd_high",toRgba(mj.color,mj.op2),w);
      set("mjd_2sd_low", toRgba(mj.color,mj.op2),w);
      set("mjd_1sd_high",toRgba(mj.color,mj.op1),w+1);
      set("mjd_1sd_low", toRgba(mj.color,mj.op1),w+1);
    }

    // ── Bates bands (magenta) ──
    const bt=ms("bates");
    if(bt.visible!==false){
      const w=bt.width||1;
      set("bat_3sd_high",toRgba(bt.color,bt.op3),w);
      set("bat_3sd_low", toRgba(bt.color,bt.op3),w);
      set("bat_2sd_high",toRgba(bt.color,bt.op2),w);
      set("bat_2sd_low", toRgba(bt.color,bt.op2),w);
      set("bat_1sd_high",toRgba(bt.color,bt.op1),w+1);
      set("bat_1sd_low", toRgba(bt.color,bt.op1),w+1);
    }

    // ── Mean line: shared probabilistic centre ──
    const me=ms("mean");
    set("mean",toRgba(me.color,0.8),1);

    bandRefs.current=r;
    // v31: release inside rAF so the second restore is also suppressed.
    if (_savedBandRange) {
      try { ch.timeScale().setVisibleRange(_savedBandRange); } catch {}  // v12: time-based
      requestAnimationFrame(() => {
        try { ch.timeScale().setVisibleRange(_savedBandRange); } catch {}
        restoringScrollRef.current = false;
      });
    } else {
      restoringScrollRef.current = false;
    }
  // v14: lc removed — bands don't change when a single new bar arrives.
  },[ready,bandsD,layers.bands,bandStyles]);

  // ── v21: MICRO scalp bands — same shape as regular bands JSON.
  //         Rendered with DEFAULT_BAND_STYLES palette (orange/amber/magenta
  //         + grey mean) to match the regular bands look. ──
  useEffect(() => {
    const ch = chartRef.current;
    if (!ready || !ch) return;
    // v21: save view before any add/remove (rule #3 of the jumping checklist)
    let savedTimeRange = null;
    try { savedTimeRange = ch.timeScale().getVisibleRange(); } catch {}

    // v31: suppress subscribeVisibleLogicalRangeChange through teardown + rebuild.
    restoringScrollRef.current = true;

    // Teardown previous render.
    for (const s of microRefs.current) {
      try { ch.removeSeries(s); } catch {}
    }
    microRefs.current = [];

    if (!microOn || !scalpD) {
      if (savedTimeRange) {
        try { ch.timeScale().setVisibleRange(savedTimeRange); } catch {}
        requestAnimationFrame(() => {
          try { ch.timeScale().setVisibleRange(savedTimeRange); } catch {}
          restoringScrollRef.current = false;
        });
      } else {
        restoringScrollRef.current = false;
      }
      return;
    }

    const ts = scalpD.timestamps || scalpD.dates || [];
    if (!ts.length) {
      // v31: ts-empty path was missing the guard release
      restoringScrollRef.current = false;
      return;
    }
    // NOTE: lc read from closure, NOT included in deps (rule #2 — avoid
    //       rebuilding every 15s when a new candle appears).
    const candleTimes = lc.map(c => c.time);

    const prep = (k) => {
      const a = scalpD[k];
      if (!a?.length) return null;
      const raw = a.map((v, i) => ({ time: toUTC(ts[i]), value: v }))
                   .filter(d => d.time > 0 && d.value != null && isFinite(d.value))
                   .sort((a, b) => a.time - b.time);
      if (raw.length < 2) return null;
      const interp = interpolateOnGrid(raw, candleTimes);
      if (!interp?.length) return null;
      const tfSec = candleTimes.length >= 2
        ? Math.max(60, candleTimes[candleTimes.length - 1] - candleTimes[candleTimes.length - 2])
        : 900;
      const win = Math.max(5, Math.min(41, Math.round(7 * 3600 / tfSec)));
      return smoothBandData(interp, win);
    };

    const toRgba = (hex, op) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${op})`;
    };

    const set = (k, color, w) => {
      const data = prep(k);
      if (!data) return;
      try {
        const s = mkLine(ch, color, w || 1);  // mkLine already sets autoscaleInfoProvider → null
        s.setData(data);
        microRefs.current.push(s);
      } catch {}
    };

    // Three model families + mean. Palette matches DEFAULT_BAND_STYLES.
    const g = DEFAULT_BAND_STYLES.gbm;
    set("gbm_3sd_high", toRgba(g.color, g.op3), g.width);
    set("gbm_3sd_low",  toRgba(g.color, g.op3), g.width);
    set("gbm_2sd_high", toRgba(g.color, g.op2), g.width);
    set("gbm_2sd_low",  toRgba(g.color, g.op2), g.width);
    set("gbm_1sd_high", toRgba(g.color, g.op1), g.width + 1);
    set("gbm_1sd_low",  toRgba(g.color, g.op1), g.width + 1);

    const mj = DEFAULT_BAND_STYLES.mjd;
    set("mjd_3sd_high", toRgba(mj.color, mj.op3), mj.width);
    set("mjd_3sd_low",  toRgba(mj.color, mj.op3), mj.width);
    set("mjd_2sd_high", toRgba(mj.color, mj.op2), mj.width);
    set("mjd_2sd_low",  toRgba(mj.color, mj.op2), mj.width);
    set("mjd_1sd_high", toRgba(mj.color, mj.op1), mj.width + 1);
    set("mjd_1sd_low",  toRgba(mj.color, mj.op1), mj.width + 1);

    const bt = DEFAULT_BAND_STYLES.bates;
    set("bat_3sd_high", toRgba(bt.color, bt.op3), bt.width);
    set("bat_3sd_low",  toRgba(bt.color, bt.op3), bt.width);
    set("bat_2sd_high", toRgba(bt.color, bt.op2), bt.width);
    set("bat_2sd_low",  toRgba(bt.color, bt.op2), bt.width);
    set("bat_1sd_high", toRgba(bt.color, bt.op1), bt.width + 1);
    set("bat_1sd_low",  toRgba(bt.color, bt.op1), bt.width + 1);

    // Mean: grey, slightly stronger than regular bands' mean so it pops as
    // the central anchor of the scalp layer.
    set("mean", "rgba(153,153,153,0.6)", 1);

    // v21/v31: restore with sync + rAF second pass; release guard inside rAF.
    if (savedTimeRange) {
      const r = savedTimeRange;
      try { ch.timeScale().setVisibleRange(r); } catch {}
      requestAnimationFrame(() => {
        try { ch.timeScale().setVisibleRange(r); } catch {}
        restoringScrollRef.current = false;
      });
    } else {
      restoringScrollRef.current = false;
    }
    // lc intentionally omitted from deps — rule #2
  }, [ready, microOn, scalpD]);

  // ── ANCHORS ──
  useEffect(()=>{
    const cs=candleRef.current;if(!ready||!cs)return;
    anchorRefs.current.forEach(p=>{try{cs.removePriceLine(p);}catch{}});anchorRefs.current=[];
    actAnch.forEach(a=>{const s=anchorVis(a.key);anchorRefs.current.push(cs.createPriceLine({price:a.price,color:s.color,lineWidth:1,lineStyle:s.style,axisLabelVisible:true,title:s.title}));});
  },[ready,actAnch]);

  // ── VOLUME visibility ──
  useEffect(()=>{
    if(!volRef.current)return;
    try{ volRef.current.applyOptions({ visible: indicators.volume_bar !== false }); }catch{}
  },[indicators.volume_bar, ready]);

  // ── SIGNAL MARKERS (LWC v5 Series Primitive) ──
  useEffect(() => {
    const ch = chartRef.current;
    const candle = candleRef.current;
    if (!ready || !ch || !candle) return;

    if (!signalPrimitiveRef.current) {
      const prim = new SignalMarkersPrimitive();
      candle.attachPrimitive(prim);
      signalPrimitiveRef.current = prim;
    }

    if (!layers.signals || signalData.length === 0) {
      signalPrimitiveRef.current.setMarkers([]);
      return;
    }

    const candleHL = new Map();
    for (const c of lc) {
      candleHL.set(c.time, { high: c.high, low: c.low });
    }

    const tfSec = TF_SECONDS[tf] || 900;
    const markers = signalData.map(sig => {
      let hl = candleHL.get(sig.time);
      if (!hl) {
        for (let i = 1; i <= 2; i++) {
          for (const offset of [-tfSec * i, tfSec * i]) {
            const nearby = candleHL.get(sig.time + offset);
            if (nearby) { hl = nearby; break; }
          }
          if (hl) break;
        }
      }
      if (!hl) {
        if (lc.length > 0) {
          const last = lc[lc.length - 1];
          hl = { high: last.high, low: last.low };
          return { ...sig, time: last.time, high: hl.high, low: hl.low };
        }
        return null;
      }
      return { ...sig, high: hl.high, low: hl.low };
    }).filter(Boolean);

    signalPrimitiveRef.current.setMarkers(markers);
  }, [ready, layers.signals, signalData, lc, tf]);

  // ── SIGNAL PRICE LINES (entry / SL / TP) ──
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;

    signalLinesRef.current.forEach(line => {
      try { candle.removePriceLine(line); } catch {}
    });
    signalLinesRef.current = [];

    if (!ready || !layers.signals || signalData.length === 0) return;

    const LS = LWC.LineStyle || {};
    const liveSignals = signalData.filter(s => !CLOSED_SIGNAL_STATES.has(s.state));

    for (const sig of liveSignals) {
      if (sig.entry_price > 0) {
        signalLinesRef.current.push(
          candle.createPriceLine({
            price: sig.entry_price, color: C.orange, lineWidth: 1,
            lineStyle: LS.Dashed, axisLabelVisible: true,
            title: `▸ ENTRY ${sig.label}`,
          })
        );
      }
      if (sig.stop_loss > 0) {
        signalLinesRef.current.push(
          candle.createPriceLine({
            price: sig.stop_loss, color: C.red, lineWidth: 1,
            lineStyle: LS.SparseDotted, axisLabelVisible: true,
            title: `✗ SL ${sig.label}`,
          })
        );
      }
      if (sig.target_price > 0) {
        signalLinesRef.current.push(
          candle.createPriceLine({
            price: sig.target_price, color: C.green, lineWidth: 1,
            lineStyle: LS.SparseDotted, axisLabelVisible: true,
            title: `✓ TP ${sig.label}`,
          })
        );
      }
    }
  }, [ready, layers.signals, signalData]);

  // ── REGIME RENDERING (v55 — new DC HMM spec) ──
  // The regimeHistory prop shape (from RegimeBar v2):
  //   { macro: { data, enabled, opacity, hidden, colors } | null,
  //     micro: { data, enabled, opacity, hidden, colors } | null } | null
  //
  // Each enabled layer paints a full-height HistogramSeries whose cell color
  // at each candle time is looked up from the layer's history.slow_d1 (day
  // → regime label) with the layer's color map + opacity applied. The current
  // (live) bar falls back to slow.regime for days past the last history entry.
  // Hidden states are simply skipped (no shade painted for that candle).
  const regimeTooltipRef = useRef(null);
  const regimeLookupRef  = useRef(new Map());  // candle.time → { macro, micro }
  // v70: tracks whether the last regime render painted candles, so we only
  //   restore default colors when the operator actually toggled paint OFF
  //   (not on every popover tweak).
  const prevPaintCandlesRef = useRef(false);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ready || !ch) return;

    // Teardown previous series on every dep change (ticker swap, toggle flip,
    // opacity change, state-visibility change, data refresh).
    if (regimeMacroRef.current) { try { ch.removeSeries(regimeMacroRef.current); } catch {} regimeMacroRef.current = null; }
    if (regimeMicroRef.current) { try { ch.removeSeries(regimeMicroRef.current); } catch {} regimeMicroRef.current = null; }
    regimeLookupRef.current.clear();

    const rh = regimeHistory;
    if (!rh || lc.length === 0) {
      // v70: restore default candle colors only if the previous render
      //   tinted them — otherwise we'd needlessly setData() and induce a
      //   brief view-snap on every popover tweak.
      if (prevPaintCandlesRef.current && lc.length > 0) {
        try { candleRef.current?.setData(lc); } catch {}
        prevPaintCandlesRef.current = false;
      }
      return;
    }

    // For each candle, find the regime label for its UTC day. `dayMap` is
    // built from history.slow_d1; past `lastHistDay` we fall back to the
    // current live `slow.regime`.
    const buildLayer = (layer) => {
      if (!layer || !layer.enabled || !layer.data) return null;
      const slowD1 = layer.data?.history?.slow_d1 || [];
      const liveRegime = layer.data?.slow?.regime || null;
      if (!slowD1.length && !liveRegime) return null;

      const dayMap = new Map();
      let lastHistDay = 0;
      for (const row of slowD1) {
        if (!row?.date || !row?.regime) continue;
        const utc = Math.floor(new Date(row.date + "T00:00:00Z").getTime() / 1000);
        if (!Number.isFinite(utc) || utc <= 0) continue;
        dayMap.set(utc, row.regime);
        if (utc > lastHistDay) lastHistDay = utc;
      }

      const opacity = layer.opacity ?? 0.08;
      const hidden  = layer.hidden || new Set();
      const colors  = layer.colors || {};
      const data = [];
      const labelByTime = new Map();

      for (const candle of lc) {
        const dayStart = Math.floor(candle.time / 86400) * 86400;
        let regime = dayMap.get(dayStart);
        // Past the last history day → use the current live slow.regime.
        if (!regime && dayStart >= lastHistDay && liveRegime) regime = liveRegime;
        if (!regime) continue;
        labelByTime.set(candle.time, regime);
        if (hidden.has(regime)) continue;  // transparent slot for hidden states
        const hex = colors[regime];
        if (!hex || hex[0] !== "#") continue;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        data.push({ time: candle.time, value: 1e10, color: `rgba(${r},${g},${b},${opacity})` });
      }
      return { data, labelByTime, colors };
    };

    const macro = buildLayer(rh.macro);
    const micro = buildLayer(rh.micro);

    // Build hover lookup keyed by candle time — both layer labels if present.
    const lookup = new Map();
    const addLabels = (layerBuilt, key) => {
      if (!layerBuilt) return;
      for (const [t, regime] of layerBuilt.labelByTime) {
        const cur = lookup.get(t) || {};
        cur[key] = { regime, color: layerBuilt.colors[regime] || "#888" };
        lookup.set(t, cur);
      }
    };
    addLabels(macro, "macro");
    addLabels(micro, "micro");
    regimeLookupRef.current = lookup;

    // v70: SHOW ON CANDLES — when either layer has paintCandles set, the
    //   bg histogram for THAT layer is suppressed and instead each candle
    //   gets its color/borderColor/wickColor overridden via setData().
    //   Micro precedence over macro when both have paintCandles set.
    const microPaints = !!rh.micro?.paintCandles && micro && micro.labelByTime.size > 0;
    const macroPaints = !!rh.macro?.paintCandles && macro && macro.labelByTime.size > 0;

    if (microPaints || macroPaints) {
      // Build colorByTime: micro wins per-bar when both have a label.
      const colorByTime = new Map();
      if (macroPaints) {
        for (const [t, regime] of macro.labelByTime) {
          if (macro.colors[regime]) colorByTime.set(t, macro.colors[regime]);
        }
      }
      if (microPaints) {
        for (const [t, regime] of micro.labelByTime) {
          if (micro.colors[regime]) colorByTime.set(t, micro.colors[regime]);
        }
      }
      try {
        const colored = lc.map(c => {
          const col = colorByTime.get(c.time);
          if (!col) return c;
          return { ...c, color: col, borderColor: col, wickColor: col };
        });
        candleRef.current?.setData(colored);
        prevPaintCandlesRef.current = true;
      } catch (e) {
        console.warn("[MC] regime paint-candles setData failed:", e);
      }
    } else if (prevPaintCandlesRef.current) {
      // Operator just toggled paint OFF — restore defaults exactly once.
      try { candleRef.current?.setData(lc); } catch {}
      prevPaintCandlesRef.current = false;
    }

    // Paint MACRO first (below) so MICRO sits on top visually.
    // Skip the layer's background histogram when paintCandles is set for it.
    if (macro && macro.data.length > 0 && !macroPaints) {
      try {
        const s = ch.addSeries(LWC.HistogramSeries, {
          priceScaleId: "regime_macro_bg", priceFormat: { type: "volume" },
          lastValueVisible: false, priceLineVisible: false,
        });
        ch.priceScale("regime_macro_bg").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
        s.setData(macro.data);
        regimeMacroRef.current = s;
      } catch (e) { console.error("[MC] Regime macro bg:", e); log("error", `Regime macro bg: ${e.message}`); }
    }
    if (micro && micro.data.length > 0 && !microPaints) {
      try {
        const s = ch.addSeries(LWC.HistogramSeries, {
          priceScaleId: "regime_micro_bg", priceFormat: { type: "volume" },
          lastValueVisible: false, priceLineVisible: false,
        });
        ch.priceScale("regime_micro_bg").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
        s.setData(micro.data);
        regimeMicroRef.current = s;
      } catch (e) { console.error("[MC] Regime micro bg:", e); log("error", `Regime micro bg: ${e.message}`); }
    }
  }, [ready, regimeHistory, lc]);

  // ── Regime hover tooltip (v55: shows both layers if present) ──
  useEffect(() => {
    const ch = chartRef.current;
    const el = containerRef.current;
    if (!ready || !ch || !el) return;

    let tip = regimeTooltipRef.current;
    if (!tip) {
      tip = document.createElement("div");
      tip.style.cssText = `position:absolute;display:none;padding:3px 8px;background:#111;border:1px solid #333;color:#fff;font-size:9px;font-family:${mono};pointer-events:none;z-index:50;white-space:nowrap;border-radius:2px;line-height:1.45;`;
      el.appendChild(tip);
      regimeTooltipRef.current = tip;
    }

    const handler = (param) => {
      if (!param.time || regimeLookupRef.current.size === 0) {
        tip.style.display = "none";
        return;
      }
      const entry = regimeLookupRef.current.get(param.time);
      if (!entry || (!entry.macro && !entry.micro)) { tip.style.display = "none"; return; }

      const parts = [];
      if (entry.macro) parts.push(`<span style="color:${entry.macro.color}">M· ${entry.macro.regime}</span>`);
      if (entry.micro) parts.push(`<span style="color:${entry.micro.color}">μ· ${entry.micro.regime}</span>`);
      tip.innerHTML = parts.join("<br/>");
      tip.style.borderColor = "#333";
      tip.style.display = "block";
      tip.style.left = "10px";
      tip.style.bottom = "24px";
    };

    ch.subscribeCrosshairMove(handler);
    return () => {
      try { ch.unsubscribeCrosshairMove(handler); } catch {}
    };
  }, [ready]);

  // v56: inject the burning-accent keyframes once.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("mk-heat-keyframes")) return;
    const s = document.createElement("style");
    s.id = "mk-heat-keyframes";
    s.textContent = `
@keyframes mkHeatPulse {
  0%, 100% {
    box-shadow: 0 0 6px rgba(255,109,0,0.45), 0 0 14px rgba(232,56,59,0.25), inset 0 0 6px rgba(255,109,0,0.25);
    filter: brightness(1.0);
  }
  50% {
    box-shadow: 0 0 14px rgba(255,109,0,0.95), 0 0 28px rgba(255,69,0,0.55), inset 0 0 12px rgba(255,109,0,0.55);
    filter: brightness(1.15);
  }
}`;
    document.head.appendChild(s);
  }, []);

  // ── v56: probability-field fetch (for heat overlay) ──
  useEffect(() => {
    if (!selectedTicker) { setProbfieldData(null); return; }
    if (!showHeat && !showProHeat) return;  // v57: also lazy-fetch for pro mode
    let cancelled = false;
    const ac = new AbortController();
    const load = async () => {
      try {
        const r = await fetch(`/api/probability-field/${selectedTicker}`, { signal: ac.signal });
        if (!r.ok || cancelled) { if (!cancelled) setProbfieldData(null); return; }
        const d = await r.json();
        if (!cancelled) setProbfieldData(d);
      } catch { /* non-critical */ }
    };
    load();
    return () => { cancelled = true; try { ac.abort(); } catch {} };
  }, [selectedTicker, showHeat, showProHeat]);

  // ── v60: path-forest fetch (for FOREST overlay) ──
  // v72: refetches on syncTick (mk:data-sync-complete) + 60s safety-net poll
  //   so a new forecast file landing in cache is picked up automatically
  //   without forcing the operator to reload.
  useEffect(() => {
    if (!selectedTicker || !showForest) { setForestData(null); return; }
    let cancelled = false;
    const ac = new AbortController();
    const load = async () => {
      try {
        // v70: scenario param dropped — backend always serves the live
        //   no-suffix file when present.
        const r = await fetch(`/api/forest/${selectedTicker}`, { signal: ac.signal });
        if (!r.ok || cancelled) { if (!cancelled) setForestData(null); return; }
        const d = await r.json();
        if (!cancelled) setForestData(d);
      } catch { /* non-critical */ }
    };
    load();
    const id = setInterval(load, 60 * 1000);
    return () => { cancelled = true; clearInterval(id); try { ac.abort(); } catch {} };
  }, [selectedTicker, showForest, syncTick]);

  // v56: bump heatTick on chart resize + time/price range changes so the
  //     SVG overlay re-renders against current priceToCoordinate() outputs.
  useEffect(() => {
    const ch = chartRef.current;
    const el = containerRef.current;
    if (!ready || !ch || !el) return;
    const bump = () => setHeatTick(t => t + 1);
    let ts = null, ps = null;
    try { ts = ch.timeScale(); ts.subscribeVisibleTimeRangeChange(bump); } catch {}
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(bump);
      ro.observe(el);
    }
    return () => {
      try { ts?.unsubscribeVisibleTimeRangeChange(bump); } catch {}
      if (ro) ro.disconnect();
    };
  }, [ready]);

  // v56: compute heat-strip SVG overlay. Reads probfieldData's today/yesterday
  //     columns and maps price rows to pixel-Y via LWC's priceToCoordinate.
  //     Cells outside the visible price range naturally fall outside the SVG
  //     and get clipped.
  const heatOverlay = useMemo(() => {
    // v57: render when either toggle is on. proActive (2-MONTH HEAT, showProHeat)
    //   overrides the weekly view and paints all days from month_prev + month_curr.
    const proActive = showProHeat;
    if (!probfieldData || (!showHeat && !proActive)) return null;
    const ch = chartRef.current;
    const el = containerRef.current;
    if (!ch || !el || !ready) return null;

    // Helper: look up a date across month_curr + month_prev. Returns the
    // (modeData, idx) pair if found — lets the week straddle month boundaries.
    const findDay = (dateStr) => {
      for (const modeKey of ["month_curr", "month_prev"]) {
        const md = probfieldData?.modes?.[modeKey];
        const idx = md?.axes?.days?.indexOf(dateStr);
        if (idx != null && idx >= 0) return { modeData: md, idx };
      }
      return null;
    };

    const currMode = probfieldData?.modes?.month_curr;
    const currDays = currMode?.axes?.days;
    const todayIdx = currMode?.axes?.today_index;
    const prices   = currMode?.axes?.prices;  // shared grid shape for the month
    if (!currDays?.length || todayIdx == null || todayIdx < 0 || !prices?.length) return null;

    // v56 fix: LWC v5 puts priceToCoordinate on the series, not the priceScale.
    const priceSeries = candleRef.current;
    if (!priceSeries || typeof priceSeries.priceToCoordinate !== "function") return null;

    // Global max across BOTH months so colors stay consistent if the week
    // straddles (no bright→dim discontinuity at the month seam).
    let gmax = 0;
    for (const modeKey of ["month_curr", "month_prev"]) {
      const ow = probfieldData?.modes?.[modeKey]?.options_weight;
      if (!ow) continue;
      for (const row of ow) for (const v of row) if (v > gmax) gmax = v;
    }
    if (gmax <= 0) return null;

    // v57: pick the day list based on mode.
    //   PRO mode  → all days from month_prev + month_curr (~44 days)
    //   Week mode → Mon..Fri of the current trading week (5 days)
    let weekDays;
    if (proActive) {
      const dedupe = new Map();
      for (const modeKey of ["month_prev", "month_curr"]) {
        const md = probfieldData?.modes?.[modeKey];
        const days = md?.axes?.days || [];
        for (const dStr of days) {
          if (!dStr || dedupe.has(dStr)) continue;
          const epoch = Math.floor(new Date(dStr + "T00:00:00Z").getTime() / 1000);
          if (!Number.isFinite(epoch) || epoch <= 0) continue;
          dedupe.set(dStr, { dStr, epoch });
        }
      }
      weekDays = Array.from(dedupe.values()).sort((a, b) => a.epoch - b.epoch);
    } else {
      // v59: anchor on the USER's wall-clock today, not the producer's
      //   currDays[todayIdx]. The producer's today_index points to its
      //   last computed day — typically Friday afternoon. On Monday
      //   morning that pulls the heatmap window back onto last week's
      //   calendar. Use the local date so "Monday" reads as Monday for
      //   any user, regardless of timezone, then coerce through a UTC
      //   epoch so the date strings line up with the file's UTC days.
      const now = new Date();
      const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const todayUtc = Math.floor(new Date(localTodayStr + "T00:00:00Z").getTime() / 1000);
      const dow      = new Date(localTodayStr + "T00:00:00Z").getUTCDay();  // 0=Sun..6=Sat
      const daysFromMon = dow === 0 ? 6 : dow - 1;
      const mondayUtc = todayUtc - daysFromMon * 86400;
      weekDays = [];
      for (let i = 0; i < 5; i++) {
        const epoch = mondayUtc + i * 86400;
        const dStr  = new Date(epoch * 1000).toISOString().slice(0, 10);
        weekDays.push({ dStr, epoch });
      }
    }

    // v68: palette-driven. The hand-coded fire ramp moved to the
    //   HEAT_PALETTES table at module top; same colors as v67 when
    //   the operator picks "fire".
    const activePalette = HEAT_PALETTES[heatPalette] || HEAT_PALETTES.fire;
    const heatColor = (val) => {
      const norm = Math.min(1, val / gmax);
      const t = Math.pow(norm, heatContrast);
      if (t < heatThreshold) return null;
      const [r, g, b] = interpolateHeatPalette(activePalette, t);
      return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${heatOpacity})`;
    };

    const rect = el.getBoundingClientRect();
    const ts = ch.timeScale();

    // Pre-compute pixels-per-second from the last two real bars. Used to
    // extrapolate X for times LWC can't resolve (future days / weekend gaps
    // / anything past the visible range).
    const lastBar = lc.length > 0 ? lc[lc.length - 1] : null;
    const prevBar = lc.length > 1 ? lc[lc.length - 2] : null;
    const xLast   = lastBar ? ts.timeToCoordinate(lastBar.time) : null;
    const xPrev   = prevBar ? ts.timeToCoordinate(prevBar.time) : null;
    let pxPerSec = null;
    if (xLast != null && xPrev != null && lastBar.time !== prevBar.time) {
      pxPerSec = (xLast - xPrev) / (lastBar.time - prevBar.time);
    }

    const coordFor = (timeSec) => {
      const c = ts.timeToCoordinate(timeSec);
      if (c != null) return c;
      if (xLast != null && pxPerSec != null) {
        return xLast + (timeSec - lastBar.time) * pxPerSec;
      }
      return null;
    };

    // v80: detect broker offset baked into bar timestamps (same idiom as
    //   FOREST v73). probfield's `axes.days` are real-UTC date strings;
    //   chart bar epochs are broker-time-as-UTC. Without this shift the
    //   day-epoch lookup compares against a wrong-scale value and heat
    //   columns land N hours off the actual day's candles.
    let _heatBrokerOffsetSec = 0;
    if (lc.length > 0 && executionStatus?.provider_connected) {
      const _realNow = Math.floor(Date.now() / 1000);
      const _rawDiff = lc[lc.length - 1].time - _realNow;
      const _offHours = Math.round(_rawDiff / 3600);
      const _tfSec = TF_SECONDS[tf] || 900;
      const _remainder = _rawDiff - _offHours * 3600;
      if (Math.abs(_offHours) <= 14 && Math.abs(_remainder) <= 2 * _tfSec) {
        _heatBrokerOffsetSec = _offHours * 3600;
      }
    }

    // v80: column ends at the next WEEKDAY in probfield's axes.days, not
    //   the next chart bar. This bridges weekend gaps regardless of
    //   whether the chart axis is calendar-time or business-day-uniform —
    //   Friday's column extends straight to Monday's first bar without
    //   relying on chart-bar lookup quirks. Same idea for holiday gaps
    //   (when probfield's days array skips a non-trading day).
    const xRangeForDay = (dayEpoch, nextDayEpoch) => {
      const dayStartShifted = dayEpoch + _heatBrokerOffsetSec;
      const dayEndShifted   = dayStartShifted + 86400;

      // First chart bar within this day (defines xStart precisely).
      const dayFirstBar = lc.find(b => b.time >= dayStartShifted && b.time < dayEndShifted);

      let xStart;
      if (dayFirstBar) {
        xStart = ts.timeToCoordinate(dayFirstBar.time);
      } else {
        xStart = coordFor(dayStartShifted);
      }
      if (xStart == null) return null;

      let xEnd;
      if (nextDayEpoch != null) {
        // Bridge to the next weekday's first chart bar. Skips weekends +
        // holidays in one shot. If the next day is in the future / no
        // bars yet, fall back to extrapolated coord at that day's start.
        const nextDayShifted = nextDayEpoch + _heatBrokerOffsetSec;
        const nextDayFirstBar = lc.find(b => b.time >= nextDayShifted && b.time < nextDayShifted + 86400);
        if (nextDayFirstBar) {
          xEnd = ts.timeToCoordinate(nextDayFirstBar.time);
        } else {
          xEnd = coordFor(nextDayShifted);
        }
      } else {
        // Last day in axes.days — extrapolate to end-of-day so the column
        // doesn't truncate at the live bar (v67's fix preserved).
        xEnd = coordFor(dayEndShifted);
      }
      if (xEnd == null || xEnd <= xStart) return null;
      return { xStart, width: xEnd - xStart };
    };

    const elems = [];
    for (let _i = 0; _i < weekDays.length; _i++) {
      const { dStr, epoch } = weekDays[_i];
      const nextEpoch = (_i + 1 < weekDays.length) ? weekDays[_i + 1].epoch : null;
      const found = findDay(dStr);
      if (!found) continue;
      const { modeData, idx } = found;
      const ow = modeData?.options_weight;
      const modePrices = modeData?.axes?.prices;
      if (!ow || !modePrices || !ow[idx]) continue;

      const xr = xRangeForDay(epoch, nextEpoch);
      if (!xr) continue;

      const col = ow[idx];
      for (let i = 0; i < modePrices.length - 1; i++) {
        const pHi = modePrices[i];
        const pLo = modePrices[i + 1];
        const v = col[i] || 0;
        const c = heatColor(v);
        if (!c) continue;
        const y1 = priceSeries.priceToCoordinate(pHi);
        const y2 = priceSeries.priceToCoordinate(pLo);
        if (y1 == null || y2 == null) continue;
        const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
        if (yMax < 0 || yMin > rect.height) continue;
        elems.push(
          <rect key={`${dStr}-${i}`} x={xr.xStart} y={yMin}
            width={xr.width} height={Math.max(1, yMax - yMin)} fill={c} />
        );
      }
    }

    if (elems.length === 0) return null;
    return (
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, overflow: "hidden" }}>
        {elems}
      </svg>
    );
  }, [probfieldData, showHeat, showProHeat, heatTick, ready, lc, tf, heatOpacity, heatContrast, heatThreshold, heatPalette, executionStatus]);

  // v79: CONE color-fill overlay — fills the band between GBM and MJD
  //      lines at each SD level for groups that have COLOR FILL on. Test
  //      scope: only the "now" group is currently honored; broaden by
  //      changing the FILL_GROUPS allowlist below. Polygons are built
  //      from proj["gbm_*"] / proj["mjd_*"] arrays, mapped through
  //      timeToCoordinate + priceToCoordinate (same approach as the heat
  //      overlay), so the fill follows chart pan/zoom. Reuses heatTick
  //      so it re-renders on resize / time-range change.
  const coneFillOverlay = useMemo(() => {
    if (!ready) return null;
    const ch = chartRef.current;
    const el = containerRef.current;
    const series = candleRef.current;
    if (!ch || !el || !series) return null;
    if (typeof series.priceToCoordinate !== "function") return null;

    // v79 test scope: only the "now" group fills for this iteration.
    // Each entry maps a CONE_GROUPS key → the [gbm_key, mjd_key] pair to
    // pull from `proj`. To enable more groups, add entries here.
    const FILL_GROUPS = {
      daily: { gbm: "gbm_daily_curr", mjd: "mjd_daily_curr" },   // v110: use the prominent curr cone
    };

    const ts = ch.timeScale();
    const elems = [];

    for (const [groupKey, pair] of Object.entries(FILL_GROUPS)) {
      const gs = coneStyles[groupKey] || {};
      if (gs.hide_gbm || gs.hide_mjd) continue;   // v110: fill needs both medians
      // Group must be on AND its style must have colorFill enabled.
      if (!cg[groupKey]) continue;
      const styleOverride = coneStyles[groupKey];
      if (!styleOverride?.colorFill) continue;

      const gbm = proj[pair.gbm];
      const mjd = proj[pair.mjd];
      if (!gbm || !mjd) continue;
      if (!Array.isArray(gbm.dates) || !Array.isArray(mjd.dates)) continue;

      const groupCfg = CONE_GROUPS[groupKey];
      const baseColor =
        styleOverride.color_gbm || styleOverride.color || groupCfg?.color || "#ffffff";

      // [{x, y}] points from a values-array + dates-array. Drops missing
      // values, drops points the chart can't resolve (off-scale / future).
      const buildPath = (arr, dates) => {
        if (!Array.isArray(arr)) return [];
        const pts = [];
        const N = Math.min(arr.length, dates.length);
        for (let i = 0; i < N; i++) {
          const t = toUTC(dates[i]);
          const v = arr[i];
          if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(v)) continue;
          const x = ts.timeToCoordinate(t);
          const y = series.priceToCoordinate(v);
          if (x == null || y == null) continue;
          pts.push({ x, y });
        }
        return pts;
      };

      // One polygon per SD level: forward-walk the GBM points, then
      // reverse-walk the MJD points, closing the shape.
      const buildBand = (gbmArr, mjdArr, alpha, key) => {
        if (!gbmArr || !mjdArr) return;
        const gp = buildPath(gbmArr, gbm.dates);
        const mp = buildPath(mjdArr, mjd.dates);
        if (gp.length < 2 || mp.length < 2) return;
        const fwd = gp.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const rev = mp.slice().reverse().map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        elems.push(
          <polygon key={key}
            points={`${fwd} ${rev}`}
            fill={baseColor}
            fillOpacity={alpha}
            stroke="none" />
        );
      };

      // Outer SDs are wider/lighter so the layered fills don't clip each
      // other into a flat slab.
      buildBand(gbm.sd1_high, mjd.sd1_high, 0.20, `${groupKey}-sd1h`);
      buildBand(gbm.sd1_low,  mjd.sd1_low,  0.20, `${groupKey}-sd1l`);
      buildBand(gbm.sd2_high, mjd.sd2_high, 0.13, `${groupKey}-sd2h`);
      buildBand(gbm.sd2_low,  mjd.sd2_low,  0.13, `${groupKey}-sd2l`);
      buildBand(gbm.sd3_high, mjd.sd3_high, 0.08, `${groupKey}-sd3h`);
      buildBand(gbm.sd3_low,  mjd.sd3_low,  0.08, `${groupKey}-sd3l`);
    }

    if (elems.length === 0) return null;
    return (
      <svg style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 1, overflow: "hidden",
      }}>
        {elems}
      </svg>
    );
  }, [proj, cg, coneStyles, ready, lc, heatTick]);

  // v61: PATH OUTCOME FOREST overlay — paths + anchor + probability bars.
  //      Renders the 60 path polylines fanning out from the anchor, colored
  //      by each path's dominant regime (TREND green / RANGE amber /
  //      STRESS red, alpha 0.5). At the right end of the forecast window:
  //      5 horizontal magenta bars whose width is proportional to the
  //      cluster probability (wider = more likely). Anchor itself is a
  //      bright yellow filled dot. Minimal "UP / FLAT / DN" labels at the
  //      far right call out the directional buckets.
  //      Reuses heatTick (which bumps on chart resize / time-range change)
  //      so coordinates re-resolve when the chart geometry changes.
  const forestOverlay = useMemo(() => {
    if (!forestData || !showForest) return null;
    const ch = chartRef.current;
    const el = containerRef.current;
    if (!ch || !el || !ready) return null;
    const priceSeries = candleRef.current;
    if (!priceSeries || typeof priceSeries.priceToCoordinate !== "function") return null;

    const rect = el.getBoundingClientRect();
    const ts = ch.timeScale();

    let anchorTs = Math.floor(new Date(forestData.meta?.anchor_ts || 0).getTime() / 1000);
    if (!Number.isFinite(anchorTs) || anchorTs <= 0) return null;

    // v73: detect the broker-TZ offset baked into the chart's bar epochs
    //   (toUTC appends "Z" to naive broker timestamps, so a GMT+3 broker's
    //   15:00 bar lands at the 15:00-UTC slot on the chart instead of the
    //   real 12:00-UTC slot). The producer's anchor_ts is in real UTC and
    //   would otherwise land N hours left of the corresponding bar.
    //   Skip the shift on weekends / extended disconnects (where the
    //   latest bar is stale and the modulo-hour math would drift). Snap
    //   the offset to whole hours since broker TZs are integer-hour.
    const _latestBar = lc.length > 0 ? lc[lc.length - 1] : null;
    // Only trust the offset detection while MT5 is actively feeding bars —
    // a stale latest-bar (weekend, disconnect) can fool the modulo-hour
    // math into picking a wrong offset.
    if (_latestBar && executionStatus?.provider_connected) {
      const realNowSec = Math.floor(Date.now() / 1000);
      const tfSec      = TF_SECONDS[tf] || 900;
      const rawDiff    = _latestBar.time - realNowSec;
      const offsetHours = Math.round(rawDiff / 3600);
      const remainder   = rawDiff - offsetHours * 3600;
      // (a) offset within ±14h (no real broker is outside that), and
      // (b) latest bar's age modulo whole hours ≤ 2 timeframes (= fresh).
      if (Math.abs(offsetHours) <= 14 && Math.abs(remainder) <= 2 * tfSec) {
        if (offsetHours !== 0) anchorTs += offsetHours * 3600;
      }
    }

    let xAnchor = ts.timeToCoordinate(anchorTs);
    if (xAnchor == null) {
      const lastBar = lc.length > 0 ? lc[lc.length - 1] : null;
      if (!lastBar) return null;
      xAnchor = ts.timeToCoordinate(lastBar.time);
      if (xAnchor == null) return null;
    }

    // Forward extrapolation helpers for x-coords beyond the visible bar range.
    const lastBar = lc.length > 0 ? lc[lc.length - 1] : null;
    const prevBar = lc.length > 1 ? lc[lc.length - 2] : null;
    let pxPerSec = null;
    if (lastBar && prevBar) {
      const xLast = ts.timeToCoordinate(lastBar.time);
      const xPrev = ts.timeToCoordinate(prevBar.time);
      if (xLast != null && xPrev != null && lastBar.time !== prevBar.time) {
        pxPerSec = (xLast - xPrev) / (lastBar.time - prevBar.time);
      }
    }
    const horizonBars = forestData.meta?.horizon_bars || 16;
    const horizonSec  = (forestData.meta?.horizon_minutes || 240) * 60;
    const barSec      = horizonSec / horizonBars;
    const xEndCoord = ts.timeToCoordinate(anchorTs + horizonSec);
    const xEnd = xEndCoord != null
      ? xEndCoord
      : (pxPerSec ? xAnchor + horizonSec * pxPerSec : (rect.width - 120));

    if (xEnd <= xAnchor) return null;

    // Map a forward-bar index (0..horizonBars) to chart pixel x.
    const xForIdx = (i) => {
      const t = anchorTs + i * barSec;
      const c = ts.timeToCoordinate(t);
      if (c != null) return c;
      if (pxPerSec != null) return xAnchor + (i * barSec) * pxPerSec;
      return xAnchor + (i / horizonBars) * (xEnd - xAnchor);
    };

    // ── REGIME path colors ─────────────────────────────────────────────
    // Match the producer's REGIMES color spec (TREND / RANGE / STRESS).
    const REGIME_COLOR = {
      0: "#10b981", // TREND  — green
      1: "#fbbf24", // RANGE  — amber
      2: "#f43f5e", // STRESS — rose/red
    };

    const elems = [];

    // ── v70/v71: regime filter ─────────────────────────────────────────
    // Map the asset's current micro regime (calm / normal* / stressed)
    // to a forest regime ID (0=TREND, 1=RANGE, 2=STRESS). Used only when
    // the operator turns on REGIME FILTER in the FOREST popover.
    // v71: read `liveMicroRegime` (always present in regimeHistory after
    //   RegimeBar v6) so the filter works without the MICRO toggle.
    const MICRO_TO_FOREST_REGIME = {
      calm:        0,  // TREND  — directional moves expected
      normal_low:  0,  // TREND
      normal:      1,  // RANGE  — choppy/oscillating expected
      normal_high: 1,  // RANGE
      stressed:    2,  // STRESS — high vol / large moves expected
    };
    const FOREST_REGIME_KEY = ["trend", "range", "stress"];  // id → regime_mix key
    const liveMicroRegime = regimeHistory?.liveMicroRegime || null;
    const filterTargetId = forestRegimeFilter
      ? MICRO_TO_FOREST_REGIME[liveMicroRegime] ?? null
      : null;
    const passesRegime = (p) => filterTargetId == null || p?.dominant_regime === filterTargetId;

    // ── 1. Forest paths — dominant cluster only (gated on showForestPaths) ──
    // v85: filter to dominant cluster (highest probability) per operator's "dominant" spec.
    const allPaths = Array.isArray(forestData.paths) ? forestData.paths : [];
    const allClusters = Array.isArray(forestData.clusters) ? forestData.clusters : [];
    const dominantCluster = allClusters.reduce((max, c) => (c?.probability ?? 0) > (max?.probability ?? -1) ? c : max, null);
    const dominantClusterId = dominantCluster?.id;
    if (showForestPaths && dominantClusterId != null) {
      const paths = allPaths.filter(p => passesRegime(p) && p?.cluster_id === dominantClusterId);
      for (const p of paths) {
        if (!p || !Array.isArray(p.prices) || p.prices.length < 2) continue;
        const pts = [];
        for (let i = 0; i < p.prices.length; i++) {
          const x = xForIdx(i);
          const y = priceSeries.priceToCoordinate(p.prices[i]);
          if (x == null || y == null) continue;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        if (pts.length < 2) continue;
        const color = dominantCluster?.color || REGIME_COLOR[p.dominant_regime] || "#94a3b8";
        elems.push(
          <polyline key={`forest-path-${p.id}`}
            points={pts.join(" ")}
            fill="none"
            stroke={color} strokeOpacity={0.55} strokeWidth={0.9}
            strokeLinecap="round" strokeLinejoin="round" />
        );
      }
    }

    // ── 2. Probability bars at xEnd (gated on showForestHistogram) ─────
    // Bar width ∝ probability. Largest cluster gets the maximum width.
    // v71: when regime filter is active, recompute each cluster's
    //   probability conditional on the filtered regime using
    //   `cluster.regime_mix`. Each cluster's path_count × regime_mix[r]
    //   gives the count of paths in that cluster with regime r; divide
    //   by the total to get P(cluster | regime).
    if (showForestHistogram) {
    let clusters = (forestData.clusters || []).filter(c => c && Number.isFinite(c.probability));
    if (forestRegimeFilter && filterTargetId != null) {
      const key = FOREST_REGIME_KEY[filterTargetId];
      const counts = clusters.map(c => (c.path_count || 0) * (c.regime_mix?.[key] || 0));
      const total = counts.reduce((s, n) => s + n, 0);
      if (total > 0) {
        clusters = clusters.map((c, i) => ({ ...c, probability: counts[i] / total }));
      } else {
        // No paths for this regime in any cluster — empty filter.
        clusters = [];
      }
    }
    const maxProb = clusters.reduce((m, c) => Math.max(m, c.probability), 0);
    const MAX_BAR_W = 70;
    const BAR_H = 12;
    const BAR_GAP = 4; // x-gap between forecast end and bar start
    const BAR_COLOR = "#d946ef"; // magenta accent matching reference image

    for (const c of clusters) {
      if (c.probability < 0.005) continue;
      const yMed = priceSeries.priceToCoordinate(c.price_median);
      if (yMed == null) continue;
      const w = maxProb > 0 ? (c.probability / maxProb) * MAX_BAR_W : 0;
      if (w < 1) continue;
      // Soft drop shadow with stroke for legibility against any candles
      elems.push(
        <rect key={`forest-bar-${c.id}`}
          x={xEnd + BAR_GAP} y={yMed - BAR_H / 2}
          width={w} height={BAR_H}
          fill={BAR_COLOR} fillOpacity={0.78}
          stroke={BAR_COLOR} strokeOpacity={1} strokeWidth={0.8} />
      );
      // Tiny prob % at the right tip of the bar
      elems.push(
        <text key={`forest-bar-pct-${c.id}`}
          x={xEnd + BAR_GAP + w + 4}
          y={yMed + 3}
          fill="#cbd5e1" fontSize={9} fontWeight={700}
          fontFamily={mono}
          stroke="#000" strokeWidth={2.4} paintOrder="stroke">
          {(c.probability * 100).toFixed(0)}%
        </text>
      );
    }

    // ── 3. Minimal directional labels (UP / FLAT / DN) ─────────────────
    const LABEL_COLOR = "#cbd5e1";
    const labelTargets = [
      { id: 4, text: "UP",   yShift: -10 }, // STRONG_UP — above its bar
      { id: 2, text: "FLAT", yShift:  +4 }, // FLAT      — beside its bar
      { id: 0, text: "DN",   yShift: +14 }, // STRONG_DOWN — below its bar
    ];
    for (const tgt of labelTargets) {
      const c = clusters.find(x => x.id === tgt.id);
      if (!c) continue;
      const yMed = priceSeries.priceToCoordinate(c.price_median);
      if (yMed == null) continue;
      elems.push(
        <text key={`forest-dirlab-${tgt.id}`}
          x={xEnd + BAR_GAP + MAX_BAR_W + 36}
          y={yMed + tgt.yShift}
          fill={LABEL_COLOR} fontSize={11} fontWeight={800}
          fontFamily={mono} letterSpacing="2px"
          stroke="#000" strokeWidth={2.5} paintOrder="stroke">
          {tgt.text}
        </text>
      );
    }
    }  // end showForestHistogram

    // ── v85: CONE renderer (gated on showForestCone) ───────────────────
    // Renders the new `cone` block: median (p50) line + 1SD/2SD/3SD bands.
    if (showForestCone && forestData.cone) {
      const cone = forestData.cone;
      const CONE_COLOR = "#06b6d4"; // cyan — distinct from regime/cluster colors
      const SERIES = [
        { key: "p50",  opacity: 0.95, width: 1.4 },           // median (mean line)
        { key: "p16",  opacity: 0.55, width: 1.0 },           // 1SD lower
        { key: "p84",  opacity: 0.55, width: 1.0 },           // 1SD upper
        { key: "p05",  opacity: 0.32, width: 0.8 },           // 2SD lower
        { key: "p95",  opacity: 0.32, width: 0.8 },           // 2SD upper
        { key: "p015", opacity: 0.18, width: 0.7 },           // 3SD lower
        { key: "p985", opacity: 0.18, width: 0.7 },           // 3SD upper
      ];
      for (const s of SERIES) {
        const arr = cone[s.key];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const pts = [];
        // Bar 0 = anchor (line starts at anchor price). Then bars 1..N from arr.
        const xA = xForIdx(0);
        const yA = priceSeries.priceToCoordinate(forestData.anchor?.price ?? 0);
        if (xA != null && yA != null) pts.push(`${xA.toFixed(1)},${yA.toFixed(1)}`);
        for (let i = 0; i < arr.length; i++) {
          const x = xForIdx(i + 1);
          const y = priceSeries.priceToCoordinate(arr[i]);
          if (x == null || y == null) continue;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        if (pts.length < 2) continue;
        elems.push(
          <polyline key={`forest-cone-${s.key}`}
            points={pts.join(" ")}
            fill="none"
            stroke={CONE_COLOR} strokeOpacity={s.opacity} strokeWidth={s.width}
            strokeLinecap="round" strokeLinejoin="round" />
        );
      }
    }

    // ── v85: HISTORICAL PREDICTIONS (gated on showForestHistorical) ────
    // Each cone_history entry rendered at its own past anchor — fans forward
    // 16 bars from there. Dimmed so the current cone stays the focal point.
    if (showForestHistorical && Array.isArray(forestData.cone_history) && forestData.cone_history.length > 0) {
      const HIST_COLOR = "#ffffff"; // bright white
      for (let h = 0; h < forestData.cone_history.length; h++) {
        const hist = forestData.cone_history[h];
        if (!hist || !Array.isArray(hist.p50)) continue;
        // Resolve this entry's anchor x-coord (its own computed_at).
        let histAnchorTs = Math.floor(new Date(hist.computed_at).getTime() / 1000);
        if (!Number.isFinite(histAnchorTs) || histAnchorTs <= 0) continue;
        // Apply same broker-TZ offset as live anchor (computed earlier in this useMemo).
        const offsetSec = anchorTs - Math.floor(new Date(forestData.meta?.anchor_ts || 0).getTime() / 1000);
        if (Number.isFinite(offsetSec)) histAnchorTs += offsetSec;
        // v85b: extrapolate anchor x-coord leftward when out of visible range so older
        //   cones partially render from chart edge instead of being silently dropped.
        let xHistA = ts.timeToCoordinate(histAnchorTs);
        if (xHistA == null && pxPerSec != null && lastBar) {
          const xLast = ts.timeToCoordinate(lastBar.time);
          if (xLast != null) {
            xHistA = xLast + (histAnchorTs - lastBar.time) * pxPerSec;
          }
        }
        if (xHistA == null) continue;
        const yHistA = priceSeries.priceToCoordinate(hist.anchor_price ?? 0);
        if (yHistA == null) continue;
        const xHistForIdx = (i) => {
          const t = histAnchorTs + i * barSec;
          const c = ts.timeToCoordinate(t);
          if (c != null) return c;
          if (pxPerSec != null) return xHistA + (i * barSec) * pxPerSec;
          return null;
        };
        // v85b: render all 7 percentile lines so historical envelope matches the
        // live cyan cone (mean + 1SD/2SD/3SD). Graduated opacity keeps p50 brightest
        // and 3SD tails faintest while still visible.
        const HIST_SERIES = [
          { key: "p50",  opacity: 0.95, width: 1.4 },
          { key: "p16",  opacity: 0.65, width: 1.0 },
          { key: "p84",  opacity: 0.65, width: 1.0 },
          { key: "p05",  opacity: 0.40, width: 0.8 },
          { key: "p95",  opacity: 0.40, width: 0.8 },
          { key: "p015", opacity: 0.25, width: 0.7 },
          { key: "p985", opacity: 0.25, width: 0.7 },
        ];
        for (const s of HIST_SERIES) {
          const arr = hist[s.key];
          if (!Array.isArray(arr) || arr.length === 0) continue;
          const pts = [`${xHistA.toFixed(1)},${yHistA.toFixed(1)}`];
          for (let i = 0; i < arr.length; i++) {
            const x = xHistForIdx(i + 1);
            const y = priceSeries.priceToCoordinate(arr[i]);
            if (x == null || y == null) continue;
            pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          }
          if (pts.length < 2) continue;
          elems.push(
            <polyline key={`forest-hist-${h}-${s.key}`}
              points={pts.join(" ")}
              fill="none"
              stroke={HIST_COLOR} strokeOpacity={s.opacity} strokeWidth={s.width}
              strokeLinecap="round" strokeLinejoin="round" />
          );
        }
      }
    }

    // ── v86: CONNECTIONS — dots at every cone-vs-cone line crossing ────
    // Independent of the other 4 layer toggles. Builds polylines fresh from
    // forestData (so it works even when paths/cone/histogram/historical are
    // all hidden). Same-cone pairs are skipped (within a cone, percentiles
    // are monotonically ordered at every X — no crossings expected).
    if (showForestConnections) {
      const conePolylines = [];
      const PCT_KEYS = ["p015", "p05", "p16", "p50", "p84", "p95", "p985"];

      // Live cone polylines (anchored at now)
      if (forestData.cone) {
        const xLA = xForIdx(0);
        const yLA = priceSeries.priceToCoordinate(forestData.anchor?.price ?? 0);
        if (xLA != null && yLA != null) {
          for (const k of PCT_KEYS) {
            const arr = forestData.cone[k];
            if (!Array.isArray(arr) || arr.length === 0) continue;
            const pts = [{ x: xLA, y: yLA }];
            for (let i = 0; i < arr.length; i++) {
              const x = xForIdx(i + 1);
              const y = priceSeries.priceToCoordinate(arr[i]);
              if (x == null || y == null) continue;
              pts.push({ x, y });
            }
            if (pts.length >= 2) conePolylines.push({ id: "live", points: pts });
          }
        }
      }

      // Historical cone polylines (anchored at each computed_at)
      if (Array.isArray(forestData.cone_history)) {
        for (let h = 0; h < forestData.cone_history.length; h++) {
          const hist = forestData.cone_history[h];
          if (!hist) continue;
          let histAnchorTs = Math.floor(new Date(hist.computed_at).getTime() / 1000);
          if (!Number.isFinite(histAnchorTs) || histAnchorTs <= 0) continue;
          const offsetSec = anchorTs - Math.floor(new Date(forestData.meta?.anchor_ts || 0).getTime() / 1000);
          if (Number.isFinite(offsetSec)) histAnchorTs += offsetSec;
          let xHistA = ts.timeToCoordinate(histAnchorTs);
          if (xHistA == null && pxPerSec != null && lastBar) {
            const xLast = ts.timeToCoordinate(lastBar.time);
            if (xLast != null) xHistA = xLast + (histAnchorTs - lastBar.time) * pxPerSec;
          }
          if (xHistA == null) continue;
          const yHistA = priceSeries.priceToCoordinate(hist.anchor_price ?? 0);
          if (yHistA == null) continue;
          const xHistForIdx = (i) => {
            const t = histAnchorTs + i * barSec;
            const c = ts.timeToCoordinate(t);
            if (c != null) return c;
            if (pxPerSec != null) return xHistA + (i * barSec) * pxPerSec;
            return null;
          };
          for (const k of PCT_KEYS) {
            const arr = hist[k];
            if (!Array.isArray(arr) || arr.length === 0) continue;
            const pts = [{ x: xHistA, y: yHistA }];
            for (let i = 0; i < arr.length; i++) {
              const x = xHistForIdx(i + 1);
              const y = priceSeries.priceToCoordinate(arr[i]);
              if (x == null || y == null) continue;
              pts.push({ x, y });
            }
            if (pts.length >= 2) conePolylines.push({ id: `hist-${h}`, points: pts });
          }
        }
      }

      // Segment-segment intersection (parametric)
      const segIntersect = (p1, p2, p3, p4) => {
        const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (denom === 0) return null;
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
        const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;
        if (t < 0 || t > 1 || u < 0 || u > 1) return null;
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
      };

      const DOT_COLOR = "#fde047";
      let dotIdx = 0;
      for (let a = 0; a < conePolylines.length; a++) {
        for (let b = a + 1; b < conePolylines.length; b++) {
          if (conePolylines[a].id === conePolylines[b].id) continue; // skip same-cone
          const pa = conePolylines[a].points;
          const pb = conePolylines[b].points;
          for (let i = 0; i < pa.length - 1; i++) {
            for (let j = 0; j < pb.length - 1; j++) {
              const ix = segIntersect(pa[i], pa[i + 1], pb[j], pb[j + 1]);
              if (ix) {
                elems.push(
                  <circle key={`forest-conn-${dotIdx++}`}
                    cx={ix.x} cy={ix.y} r={2}
                    fill={DOT_COLOR} fillOpacity={0.85} />
                );
              }
            }
          }
        }
      }
    }

    // ── 4. Anchor: bright yellow dot at (now, anchor.price) ────────────
    const yAnchor = priceSeries.priceToCoordinate(forestData.anchor?.price ?? 0);
    if (yAnchor != null) {
      elems.push(
        <circle key="forest-anchor-glow"
          cx={xAnchor} cy={yAnchor} r={9}
          fill="#fde68a" fillOpacity={0.18} />
      );
      elems.push(
        <circle key="forest-anchor-dot"
          cx={xAnchor} cy={yAnchor} r={4.5}
          fill="#fde68a" stroke="#fef3c7" strokeWidth={1.2} />
      );
    }

    // Faint "now" hairline (kept very subtle since dot is the focal point)
    elems.push(
      <line key="forest-anchor-line"
        x1={xAnchor} y1={0} x2={xAnchor} y2={rect.height}
        stroke="#fde68a" strokeOpacity={0.20} strokeWidth={0.6}
        strokeDasharray="2,5" />
    );

    if (elems.length === 0) return null;
    return (
      <svg style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 2, overflow: "visible",
      }}>
        {elems}
      </svg>
    );
  }, [forestData, showForest, showForestPaths, showForestCone, showForestHistogram, showForestHistorical, showForestConnections, heatTick, ready, lc, tf, forestRegimeFilter, regimeHistory, executionStatus]);

  // ══════════════════════════════════════════════════════
  // DRAWING TOOLS (Phase 4C)
  // ══════════════════════════════════════════════════════

  // ── Sync drawings to primitive whenever they change ──
  useEffect(() => {
    if (!drawPrimRef.current) return;
    const drawings = drawingMgrRef.current.getForChart(selectedTicker, tf);
    drawPrimRef.current.setDrawings(drawings);
    drawPrimRef.current.setSelectedId(drawingMgrRef.current.selectedId);
  }, [ready, drawVersion, selectedTicker, tf]);

  // ── Crosshair tracking for preview + click-to-place ──
  useEffect(() => {
    const ch = chartRef.current;
    const el = containerRef.current;
    if (!ready || !ch || !el) return;

    // Track crosshair position for drawing preview
    const onCrosshair = (param) => {
      if (!param.time || !param.point) {
        crosshairPosRef.current = { time: null, price: null };
        return;
      }
      const series = candleRef.current;
      if (!series) return;
      try {
        const price = series.coordinateToPrice(param.point.y);
        crosshairPosRef.current = { time: param.time, price };

        // v43: hover detection — when no tool is active, hit-test drawings
        //       and flip cursor to "pointer" if cursor sits over one.
        if (!activeTool) {
          const tfSec = TF_SECONDS[tf] || 900;
          const priceTol = lc.length > 1
            ? Math.abs(lc[lc.length-1].high - lc[lc.length-1].low) * 0.5
            : Math.abs(price) * 0.002;
          const timeTol = tfSec * 3;
          const hit = drawingMgrRef.current.hitTest(
            param.time, price, priceTol, timeTol, selectedTicker, tf
          );
          const newId = hit?.id || null;
          if (newId !== hoveredDrawingId) setHoveredDrawingId(newId);
        } else if (hoveredDrawingId) {
          setHoveredDrawingId(null);
        }

        // v42: Path preview — rubber-band tail from last vertex to cursor.
        if (activeTool === "path" && pathPointsRef.current?.length >= 1 && drawPrimRef.current) {
          drawPrimRef.current.setPreview({
            type: "path",
            points: [...pathPointsRef.current, { time: param.time, price }],
            style: { ...drawStyle },
          });
        }

        // v51: Fib Extension 3-click preview
        //   Stage 1 (A placed): show AB rubber-band line, no levels.
        //   Stage 2 (A + B placed): show AB line + extension levels at cursor C.
        if (activeTool === "fib_ext" && fibExtPointsRef.current && drawPrimRef.current) {
          const ptsStored = fibExtPointsRef.current;
          const prevStyle = { ...drawStyle };
          prevStyle._levels = (drawStyle.fibExtLevels || DEFAULT_FIB_EXT_LEVELS).filter(l => l.enabled !== false);
          drawPrimRef.current.setPreview({
            type: "fib_ext",
            points: [...ptsStored, { time: param.time, price }],
            style: prevStyle,
          });
        }

        // Update preview for in-progress 2-point drawings
        if (drawPointRef.current && drawPrimRef.current) {
          const previewStyle = { ...drawStyle };
          const pType = drawPointRef.current.type;
          if (pType === "fib") {
            previewStyle._levels = drawStyle.fibLevels || DEFAULT_FIB_LEVELS;
          } else if (pType === "fib_ext") {
            previewStyle._levels = drawStyle.fibExtLevels || DEFAULT_FIB_EXT_LEVELS;
          }

          // Position tool preview: show entry + SL + auto TP
          if (pType === "position_long" || pType === "position_short") {
            let entryPrice = drawPointRef.current.price;
            let slPrice = price;
            if (pType === "position_long" && slPrice > entryPrice) {
              [entryPrice, slPrice] = [slPrice, entryPrice];
            } else if (pType === "position_short" && slPrice < entryPrice) {
              [entryPrice, slPrice] = [slPrice, entryPrice];
            }
            const risk = Math.abs(entryPrice - slPrice);
            const tpPrice = pType === "position_long"
              ? entryPrice + risk * 2
              : entryPrice - risk * 2;
            const tfSec = TF_SECONDS[tf] || 3600;
            const leftTime = drawPointRef.current.time;
            const rightTime = leftTime + tfSec * 15;
            drawPrimRef.current.setPreview({
              type: pType,
              points: [
                { time: leftTime, price: entryPrice },
                { time: rightTime, price: slPrice },
                { time: rightTime, price: tpPrice },
              ],
              style: previewStyle,
            });
          } else {
            drawPrimRef.current.setPreview({
              type: pType,
              points: [drawPointRef.current, { time: param.time, price }],
              style: previewStyle,
            });
          }
        }
      } catch {
        crosshairPosRef.current = { time: null, price: null };
      }
    };

    ch.subscribeCrosshairMove(onCrosshair);
    return () => { try { ch.unsubscribeCrosshairMove(onCrosshair); } catch {} };
  }, [ready, drawStyle, tf, activeTool, selectedTicker, lc, hoveredDrawingId]);

  // ── Chart click handler for drawing placement ──
  useEffect(() => {
    const ch = chartRef.current;
    const el = containerRef.current;
    if (!ready || !ch || !el) return;

    const onClick = (param) => {
      // Skip click if we just finished a drag
      if (dragStateRef.current?.justDragged) {
        dragStateRef.current = null;
        return;
      }
      if (!param.time || !param.point) return;
      const series = candleRef.current;
      if (!series) return;

      let price;
      try { price = series.coordinateToPrice(param.point.y); } catch { return; }

      // ── Manual cone anchor selection (intercepts before drawing tools) ──
      if (selectingAnchorRef.current) {
        handleManualConeClickRef.current(param.time, price);
        return;
      }

      // If no tool active, try hit-test for selection
      if (!activeTool) {
        const tfSec = TF_SECONDS[tf] || 900;
        const priceTol = lc.length > 1 ? Math.abs(lc[lc.length-1].high - lc[lc.length-1].low) * 0.5 : price * 0.002;
        const timeTol = tfSec * 3;
        const hit = drawingMgrRef.current.hitTest(param.time, price, priceTol, timeTol, selectedTicker, tf);
        drawingMgrRef.current.select(hit?.id || null);
        return;
      }

      const toolDef = DRAWING_TYPES[activeTool];
      if (!toolDef) return;

      // v42: PATH — click accumulates vertices; dblclick commits. Handled
      //      before the generic points === -1 skip so it doesn't fall into
      //      the pen branch.
      if (activeTool === "path") {
        if (!pathPointsRef.current) pathPointsRef.current = [];
        pathPointsRef.current.push({ time: param.time, price });
        if (drawPrimRef.current) {
          drawPrimRef.current.setPreview({
            type: "path",
            points: [...pathPointsRef.current],
            style: { ...drawStyle },
          });
        }
        return;
      }

      if (toolDef.points === -1) return; // pen handled by separate mousedown/up handler

      // v52: Fib Extension — 4-click flow. A (start), B (extreme),
      //      C (pullback) define the math; D anchors the right edge
      //      of the level lines so the user controls how wide it is.
      if (activeTool === "fib_ext") {
        const pts = fibExtPointsRef.current;
        if (!pts) {
          // Click 1 — store A
          fibExtPointsRef.current = [{ time: param.time, price }];
        } else if (pts.length < 3) {
          // Click 2 or 3 — append B or C
          fibExtPointsRef.current = [...pts, { time: param.time, price }];
        } else {
          // Click 4 — commit with [A, B, C, D]
          const commitStyle = { ...drawStyle };
          commitStyle._levels = (drawStyle.fibExtLevels || DEFAULT_FIB_EXT_LEVELS).filter(l => l.enabled !== false);
          drawingMgrRef.current.add({
            type: "fib_ext",
            points: [...pts, { time: param.time, price }],
            style: commitStyle,
            ticker: selectedTicker,
            timeframe: tf,
          });
          fibExtPointsRef.current = null;
          drawPrimRef.current?.setPreview(null);
          setActiveTool(null);
        }
        return;
      }

      if (toolDef.points === 1) {
        // v75: TEXT — open an inline input overlay anchored to the click.
        //   Electron silently disables window.prompt(), so v44's prompt
        //   call returned null and the click appeared to do nothing.
        //   The actual commit happens when the user submits the input.
        if (activeTool === "text") {
          setPendingTextDraw({
            x: param.point.x,
            y: param.point.y,
            time: param.time,
            price,
          });
          return;
        }
        // v50: hline is the only remaining 1-click tool (price_point moved
        //      to 2-click: anchor + label position).
        drawingMgrRef.current.add({
          type: activeTool,
          points: [{ time: param.time, price }],
          style: { ...drawStyle, _priceLabel: price },
          ticker: selectedTicker,
          timeframe: tf,
        });
        setActiveTool(null);
      } else if (toolDef.points === 2) {
        if (!drawPointRef.current) {
          // First click — set anchor point
          drawPointRef.current = { type: activeTool, time: param.time, price };
        } else {
          // Second click — commit drawing and deactivate
          const commitStyle = { ...drawStyle };
          // Embed fib level config into drawing for fib/fib_ext
          if (activeTool === "fib") {
            commitStyle._levels = (drawStyle.fibLevels || DEFAULT_FIB_LEVELS).filter(l => l.enabled !== false);
          } else if (activeTool === "fib_ext") {
            commitStyle._levels = (drawStyle.fibExtLevels || DEFAULT_FIB_EXT_LEVELS).filter(l => l.enabled !== false);
          } else if (activeTool === "price_point") {
            // v50: capture the anchor's price at commit time so the label
            //      stays correct even if the anchor is later moved.
            commitStyle._priceLabel = drawPointRef.current.price;
          }

          // Position tools: 2 clicks → entry + SL, auto-compute TP at 2:1 R:R
          if (activeTool === "position_long" || activeTool === "position_short") {
            let entryPrice = drawPointRef.current.price;
            let slPrice = price;
            // Auto-swap if SL is on the wrong side
            if (activeTool === "position_long" && slPrice > entryPrice) {
              [entryPrice, slPrice] = [slPrice, entryPrice];
            } else if (activeTool === "position_short" && slPrice < entryPrice) {
              [entryPrice, slPrice] = [slPrice, entryPrice];
            }
            const risk = Math.abs(entryPrice - slPrice);
            const tpPrice = activeTool === "position_long"
              ? entryPrice + risk * 2   // TP above entry for long
              : entryPrice - risk * 2;  // TP below entry for short
            const leftTime = drawPointRef.current.time;
            const tfSec = TF_SECONDS[tf] || 3600;
            const rightTime = leftTime + tfSec * 15; // 15 bars wide
            drawingMgrRef.current.add({
              type: activeTool,
              points: [
                { time: drawPointRef.current.time, price: entryPrice },  // entry
                { time: rightTime, price: slPrice },                      // SL
                { time: rightTime, price: tpPrice },                      // TP
              ],
              style: commitStyle,
              ticker: selectedTicker,
              timeframe: tf,
            });
          } else {
            drawingMgrRef.current.add({
              type: activeTool,
              points: [
                { time: drawPointRef.current.time, price: drawPointRef.current.price },
                { time: param.time, price },
              ],
              style: commitStyle,
              ticker: selectedTicker,
              timeframe: tf,
            });
          }
          drawPointRef.current = null;
          drawPrimRef.current?.setPreview(null);
          setActiveTool(null);
        }
      }
    };

    ch.subscribeClick(onClick);
    return () => { try { ch.unsubscribeClick(onClick); } catch {} };
  }, [ready, activeTool, drawStyle, selectedTicker, tf, lc]);

  // ── v76: shared "fit chart" callback (F button + right-click Reset Chart) ──
  //   Stored on a ref so the JSX can call it without React-key re-binding;
  //   also exposed via the chart ctx menu's onReset.
  const fitChartRef = useRef(null);
  fitChartRef.current = () => {
    try {
      const ch = chartRef.current;
      if (!ch) return;
      const n = lc?.length || 0;
      if (!n) return;
      const lastBarTime = lc[n - 1].time;
      const tfSec = TF_SECONDS[tf] || 900;
      const fromTime = lastBarTime - (FIT_CANDLES - 1) * tfSec;
      restoringScrollRef.current = true;
      ch.timeScale().setVisibleRange({ from: fromTime, to: lastBarTime });
      ch.priceScale("right").applyOptions({ autoScale: true });
      requestAnimationFrame(() => { restoringScrollRef.current = false; });
    } catch (e) { console.error("[MC] FIT:", e); }
  };

  // ── v76: wheel-on-price-axis = TradingView-style vertical zoom ───────
  //   LWC v5 has no public method to set a price-scale visible range, so
  //   we rebalance the priceScale's scaleMargins on each wheel tick. The
  //   handler is gated on cursor X being within the right-axis gutter so
  //   it doesn't compete with LWC's built-in time-axis wheel zoom.
  useEffect(() => {
    const el = containerRef.current;
    const ch = chartRef.current;
    if (!ready || !el || !ch) return;
    const onWheel = (e) => {
      const ps = ch.priceScale("right");
      let axisW = 70;
      try { if (typeof ps.width === "function") axisW = ps.width() || 70; } catch {}
      const rect = el.getBoundingClientRect();
      const xRel = e.clientX - rect.left;
      // Outside the right-axis gutter — let LWC handle it (time-zoom).
      if (xRel < rect.width - axisW) return;
      e.preventDefault();
      e.stopPropagation();
      const opts = ps.options();
      const m = opts.scaleMargins || { top: 0.10, bottom: 0.15 };
      // deltaY > 0 = scroll down = zoom OUT (margins grow → less data height)
      // deltaY < 0 = scroll up   = zoom IN  (margins shrink → more data height)
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const newTop    = Math.max(0.0, Math.min(0.45, m.top * factor));
      const newBottom = Math.max(0.0, Math.min(0.45, m.bottom * factor));
      ps.applyOptions({ scaleMargins: { top: newTop, bottom: newBottom } });
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [ready]);

  // ── v42: PATH — dblclick commits the polyline with an arrow at the end.
  //   Browser fires two `click` events before `dblclick`, so the last click
  //   has already appended a duplicate point at the dblclick coords. We
  //   dedupe it out before committing.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || activeTool !== "path") return;
    const onDblClick = () => {
      const raw = pathPointsRef.current || [];
      if (raw.length < 2) {
        pathPointsRef.current = null;
        drawPrimRef.current?.setPreview(null);
        setActiveTool(null);
        return;
      }
      // Dedupe the last point if it matches the second-to-last (likely the
      // dblclick's second click landing on top of the first).
      const last = raw[raw.length - 1];
      const prev = raw[raw.length - 2];
      const pts = (last.time === prev.time && last.price === prev.price)
        ? raw.slice(0, -1)
        : raw;
      if (pts.length < 2) {
        pathPointsRef.current = null;
        drawPrimRef.current?.setPreview(null);
        setActiveTool(null);
        return;
      }
      drawingMgrRef.current.add({
        type: "path",
        points: pts,
        style: { ...drawStyle },
        ticker: selectedTicker,
        timeframe: tf,
      });
      pathPointsRef.current = null;
      drawPrimRef.current?.setPreview(null);
      setActiveTool(null);
    };
    el.addEventListener("dblclick", onDblClick);
    return () => { el.removeEventListener("dblclick", onDblClick); };
  }, [activeTool, drawStyle, selectedTicker, tf]);

  // ── Freehand pen: mousedown → collect → mouseup → commit ──
  useEffect(() => {
    const el = containerRef.current;
    const ch = chartRef.current;
    const series = candleRef.current;
    if (!ready || !el || !ch || !series) return;
    if (activeTool !== "pen") return;

    // v63 + v64: returns null for `time`/`price` if any of the following:
    //   - mouse cursor outside the chart's bounding rect (price gutter,
    //     toolbar, off-window)
    //   - LWC's coordinateToTime returns null
    //   - the round-trip timeToCoordinate(time) doesn't map back near
    //     the input x (≥ 60px). This catches the pre-bar whitespace
    //     fallback where LWC silently snaps to the leftmost visible bar.
    const getCoords = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
        return { time: null, price: null };
      }
      const ts = ch.timeScale();
      let time = null, price = null;
      try { time = ts.coordinateToTime(x); } catch {}
      try { price = series.coordinateToPrice(y); } catch {}
      // v64: round-trip validate the time. If LWC snapped to an edge bar
      //      because x is in pre-data whitespace, timeToCoordinate(time)
      //      returns a coordinate far from the original x — reject.
      if (time != null) {
        let xBack = null;
        try { xBack = ts.timeToCoordinate(time); } catch {}
        if (xBack == null || Math.abs(xBack - x) > 60) {
          time = null;
        }
      }
      return { time, price };
    };

    const onDown = (e) => {
      if (e.button !== 0) return;
      const { time, price } = getCoords(e);
      if (time == null || price == null) return;
      penPointsRef.current = [{ time, price }];
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      if (!penPointsRef.current) return;
      const { time, price } = getCoords(e);
      // v63: silently drop off-chart samples instead of recording them.
      //      Fast strokes that briefly leave the chart no longer leave
      //      a stray segment to the leftmost-bar coordinate.
      if (time == null || price == null) return;
      penPointsRef.current.push({ time, price });
      // Show preview
      if (drawPrimRef.current && penPointsRef.current.length >= 2) {
        drawPrimRef.current.setPreview({
          type: "pen",
          points: penPointsRef.current,
          style: { ...drawStyle },
        });
      }
      e.preventDefault();
    };

    const onUp = (e) => {
      if (!penPointsRef.current) return;
      const pts = penPointsRef.current;
      penPointsRef.current = null;
      drawPrimRef.current?.setPreview(null);
      // Need at least a few points to be a valid stroke
      if (pts.length >= 3) {
        // Simplify: keep every Nth point to reduce storage
        const simplified = [pts[0]];
        const step = Math.max(1, Math.floor(pts.length / 80));
        for (let i = step; i < pts.length - 1; i += step) {
          simplified.push(pts[i]);
        }
        simplified.push(pts[pts.length - 1]);
        drawingMgrRef.current.add({
          type: "pen",
          points: simplified,
          style: { ...drawStyle },
          ticker: selectedTicker,
          timeframe: tf,
        });
      }
      setActiveTool(null);
    };

    el.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      el.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [ready, activeTool, drawStyle, selectedTicker, tf]);

  // ── Drag-to-adjust selected drawings ──
  const dragStateRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    const ch = chartRef.current;
    const series = candleRef.current;
    if (!ready || !el || !ch || !series) return;

    const getCoords = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let time = null, price = null;
      try { time = ch.timeScale().coordinateToTime(x); } catch {}
      try { price = series.coordinateToPrice(y); } catch {}
      return { time, price, x, y };
    };

    const onMouseDown = (e) => {
      if (activeTool) return; // don't drag while placing
      if (e.button !== 0) return; // left click only
      const selId = drawingMgrRef.current.selectedId;
      if (!selId) return;

      const d = drawingMgrRef.current.getById(selId);
      if (!d) return;

      const { time, price, x } = getCoords(e);
      if (price == null) return;

      // Check if mouse is near the selected drawing
      const tfSec = TF_SECONDS[tf] || 900;
      const priceTol = lc.length > 1 ? Math.abs(lc[lc.length-1].high - lc[lc.length-1].low) * 0.5 : price * 0.002;
      const timeTol = tfSec * 3;

      // For position tools, check proximity by pixel if time is null (future area)
      const isPositionType = d.type === "position_long" || d.type === "position_short";
      let isNearDrawing = false;
      if (time != null) {
        const hit = drawingMgrRef.current.hitTest(time, price, priceTol, timeTol, selectedTicker, tf);
        isNearDrawing = hit && hit.id === selId;
      }
      if (!isNearDrawing && isPositionType) {
        // Fallback: check if price is within the box range and x is within pixel bounds
        const prices = d.points.map(p => p.price);
        const pMin = Math.min(...prices) - priceTol;
        const pMax = Math.max(...prices) + priceTol;
        let entryPx = null, rightPx = null;
        try { entryPx = ch.timeScale().timeToCoordinate(d.points[0].time); } catch {}
        try { rightPx = ch.timeScale().timeToCoordinate(d.points[1].time); } catch {}
        if (rightPx == null && entryPx != null) rightPx = entryPx + 200;
        if (entryPx != null && rightPx != null && price >= pMin && price <= pMax && x >= entryPx - 20 && x <= rightPx + 20) {
          isNearDrawing = true;
        }
      }
      if (!isNearDrawing) return;

      // Determine drag mode: whole-move or endpoint
      let dragMode = "move";
      let dragPointIndex = -1;

      // Position tools: always drag individual lines (entry/SL/TP) or right edge for width
      if (d.type === "position_long" || d.type === "position_short") {
        // Detect right edge using pixel x — rightTime may be off-chart
        let rightPx = null;
        try { rightPx = ch.timeScale().timeToCoordinate(d.points[1].time); } catch {}
        let entryPx = null;
        try { entryPx = ch.timeScale().timeToCoordinate(d.points[0].time); } catch {}
        if (rightPx == null && entryPx != null) rightPx = entryPx + 200;

        if (rightPx != null && Math.abs(x - rightPx) < 15) {
          dragMode = "position_width";
          dragPointIndex = -1;
        } else {
          // Otherwise drag the nearest price line
          dragMode = "endpoint";
          let bestDist = Infinity;
          for (let i = 0; i < d.points.length; i++) {
            const pDist = Math.abs(price - d.points[i].price) / priceTol;
            if (pDist < bestDist) {
              bestDist = pDist;
              dragPointIndex = i;
            }
          }
        }
      } else if (d.type === "fib" || d.type === "fib_ext") {
        // v52: fib tools — anchor-only drag. No whole-move. Click has to be
        //     within tolerance of A/B/C/D; otherwise cancel the drag entirely.
        for (let i = 0; i < d.points.length; i++) {
          const pt = d.points[i];
          const tDist = Math.abs(time - pt.time) / timeTol;
          const pDist = Math.abs(price - pt.price) / priceTol;
          if (tDist < 0.5 && pDist < 0.5) {
            dragMode = "endpoint";
            dragPointIndex = i;
            break;
          }
        }
        if (dragMode !== "endpoint") return; // not near any anchor → abort
      } else if (d.points.length === 2) {
        // Check if near an endpoint (for resize)
        for (let i = 0; i < d.points.length; i++) {
          const pt = d.points[i];
          const tDist = Math.abs(time - pt.time) / timeTol;
          const pDist = Math.abs(price - pt.price) / priceTol;
          if (tDist < 0.5 && pDist < 0.5) {
            dragMode = "endpoint";
            dragPointIndex = i;
            break;
          }
        }
      }
      if (d.type === "hline") dragMode = "endpoint"; // hline always adjusts price

      dragStateRef.current = {
        id: selId,
        mode: dragMode,
        pointIndex: dragPointIndex,
        startTime: time,
        startPrice: price,
        startX: x,
        origPoints: d.points.map(p => ({ ...p })),
        moved: false,
        justDragged: false,
      };

      // Disable LWC scroll/scale while we drag drawings
      try {
        ch.applyOptions({ handleScroll: false, handleScale: false });
      } catch {}

      // Prevent LWC from panning while we drag
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e) => {
      const ds = dragStateRef.current;
      if (!ds || ds.justDragged || !ds.origPoints) return;

      const { time, price } = getCoords(e);
      if (time == null || price == null) return;

      const dt = time - ds.startTime;
      const dp = price - ds.startPrice;

      // Only start moving after a small threshold
      if (!ds.moved && Math.abs(dp) < 0.0001 && Math.abs(dt) < 1) return;
      ds.moved = true;

      if (ds.mode === "endpoint") {
        if (ds.id) {
          const d = drawingMgrRef.current.getById(ds.id);
          if (d?.type === "hline") {
            // Hline: move the single price point
            drawingMgrRef.current.movePoint(ds.id, 0, ds.origPoints[0].time, ds.origPoints[0].price + dp);
          } else if (ds.pointIndex >= 0) {
            const orig = ds.origPoints[ds.pointIndex];
            drawingMgrRef.current.movePoint(ds.id, ds.pointIndex, orig.time + dt, orig.price + dp);
          }
        }
      } else if (ds.mode === "position_width") {
        // Resize position tool width using pixel delta → time delta
        const { x: curX } = getCoords(e);
        const dxPixels = curX - ds.startX;
        // Convert pixel delta to time delta via timeScale
        const tsApi = ch.timeScale();
        let timeDelta = 0;
        try {
          const refTime = ds.origPoints[1].time;
          let refPx = tsApi.timeToCoordinate(refTime);
          if (refPx == null) {
            const entryPx = tsApi.timeToCoordinate(ds.origPoints[0].time);
            refPx = entryPx != null ? entryPx + 200 : null;
          }
          if (refPx != null) {
            const newPx = refPx + dxPixels;
            const newTime = tsApi.coordinateToTime(newPx);
            if (newTime != null) {
              timeDelta = newTime - refTime;
            } else {
              // Fallback: estimate from visible range
              const visRange = tsApi.getVisibleLogicalRange();
              if (visRange) {
                const barsVisible = visRange.to - visRange.from;
                const chartWidth = el.clientWidth;
                const secPerPx = (barsVisible * (TF_SECONDS[tf] || 3600)) / chartWidth;
                timeDelta = dxPixels * secPerPx;
              }
            }
          }
        } catch {}
        const origRightTime = ds.origPoints[1].time;
        drawingMgrRef.current.resizePositionWidth(ds.id, origRightTime + timeDelta);
      } else {
        // Move whole drawing
        const newPoints = ds.origPoints.map(p => ({ time: p.time + dt, price: p.price + dp }));
        drawingMgrRef.current.updatePoints(ds.id, newPoints);
      }

      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseUp = (e) => {
      const ds = dragStateRef.current;
      if (!ds) return;

      // Re-enable LWC scroll/scale
      try {
        ch.applyOptions({ handleScroll: true, handleScale: true });
      } catch {}

      if (ds.moved) {
        // Flag so the next click event is suppressed
        dragStateRef.current = { justDragged: true };
        // Clear fully after a short delay
        setTimeout(() => { if (dragStateRef.current?.justDragged) dragStateRef.current = null; }, 300);
      } else {
        dragStateRef.current = null;
      }
    };

    el.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    return () => {
      el.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
    };
  }, [ready, activeTool, selectedTicker, tf, lc]);

  // ── Keyboard: Escape cancels tool/selection, Delete removes selected ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Escape" && (activeTool || drawingMgrRef.current.selectedId)) {
        e.stopPropagation();
        setActiveTool(null);
        drawPointRef.current = null;
        pathPointsRef.current = null;
        fibExtPointsRef.current = null;
        drawPrimRef.current?.setPreview(null);
        drawingMgrRef.current.deselect();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && drawingMgrRef.current.selectedId) {
        e.preventDefault();
        drawingMgrRef.current.remove(drawingMgrRef.current.selectedId);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [activeTool, isFullscreen]);

  // ── Drawing helpers for toolbar callbacks ──
  const drawingCount = useMemo(() => drawingMgrRef.current.getForChart(selectedTicker, tf).length, [selectedTicker, tf, drawVersion]);
  const hasSelectedDrawing = drawingMgrRef.current.selectedId != null;
  // v43: re-read the selected drawing on every drawVersion bump so the
  //      style editor re-renders when we mutate its style.
  const selectedDrawing = useMemo(
    () => drawingMgrRef.current.getById(drawingMgrRef.current.selectedId),
    // eslint-disable-next-line
    [drawVersion, hasSelectedDrawing]
  );
  const handleDrawStyleChange = useCallback((update) => setDrawStyle(prev => ({ ...prev, ...update })), []);
  const handleDeleteSelected = useCallback(() => {
    if (drawingMgrRef.current.selectedId) drawingMgrRef.current.remove(drawingMgrRef.current.selectedId);
  }, []);
  // v43: patch the selected drawing's style (color / lineWidth / opacity).
  const handleSelectedStyleChange = useCallback((patch) => {
    const id = drawingMgrRef.current.selectedId;
    if (id) drawingMgrRef.current.updateStyle(id, patch);
  }, []);
  const handleDeselectDrawing = useCallback(() => {
    drawingMgrRef.current.deselect();
  }, []);
  const handleClearDrawings = useCallback(() => {
    drawingMgrRef.current.clearForChart(selectedTicker, tf);
  }, [selectedTicker, tf]);

  // v37: 1-click BUY/SELL → POST /api/orders MARKET, no confirm modal.
  //      Shows result as a top-right toast (auto-dismiss 2s).
  const doQuickTrade = useCallback(async (direction) => {
    if (quickSubmitting || !selectedTicker) return;
    const lotsNum = parseFloat(quickLots);
    if (!Number.isFinite(lotsNum) || lotsNum <= 0) {
      setQuickToast({ kind: "err", msg: "Invalid lot size" });
      return;
    }
    setQuickSubmitting(true);
    try {
      const body = {
        ticker: selectedTicker.toUpperCase(),
        direction,
        order_type: "MARKET",
        lots: lotsNum,
        comment: "Quantum Terminal QUICK",
      };
      if (lp > 0) body.price = lp;
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const filled = data.price ?? lp;
        setQuickToast({
          kind: "ok",
          msg: `${direction} ${lotsNum} ${selectedTicker} @ ${Number(filled).toFixed(dec)}`,
        });
        // v65: chart quick BUY/SELL is MARKET-only → always order_filled
        try { playSound("order_filled"); } catch { /* never fatal */ }
        if (window.__mk_execution_refresh) window.__mk_execution_refresh();
      } else {
        const errMsg = data.error || data.detail || `HTTP ${res.status}`;
        setQuickToast({ kind: "err", msg: `${direction} failed: ${errMsg}` });
      }
    } catch (e) {
      setQuickToast({ kind: "err", msg: `${direction} failed: ${e.message}` });
    } finally {
      setQuickSubmitting(false);
    }
  }, [selectedTicker, quickLots, quickSubmitting, lp, dec]);

  // ══════════════════════════════════════════════════════
  // JSX
  // ══════════════════════════════════════════════════════
  const Btn=({id,l,on})=>(<button onClick={()=>tL(id)} style={{background:on?`${C.orange}20`:"transparent",color:on?C.orange:C.muted,border:`1px solid ${on?C.orange+"50":C.border}`,padding:"1px 6px",cursor:"pointer",fontSize:"7px",fontWeight:700,fontFamily:mono}}>{l}</button>);
  const ds={cones:Object.keys(proj).length>0,bands:!!bandsD,signals:signalData.length>0,anchors:allAnch.length>0,drawings:drawingCount>0};

  return (
    <div style={{
      display:"flex", flexDirection:"column", background:C.bg,
      border:`1px solid ${C.border}`, height:"100%", minHeight:0,
      ...(isFullscreen ? {
        position:"fixed", inset:0, zIndex:9999,
        border:"none", height:"100vh", width:"100vw",
      } : {}),
    }}>
      {selectedTicker&&(<>
        {/* ── FULL TOOLBAR (expandable) ── */}
        {!toolbarCollapsed ? (
          <>
            <div onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 10px",borderBottom:`1px solid ${C.border}`,background:C.bgPanel,flexShrink:0,flexWrap:"wrap",gap:4}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:C.orange,fontWeight:800,fontSize:"13px",fontFamily:mono}}>{selectedTicker}</span>
                {/* v37: TRADE toggle — reveals 1-click BUY/SELL next to ticker */}
                <button
                  onClick={() => setTradeBarOpen(v => !v)}
                  title={tradeBarOpen ? "Hide quick BUY/SELL" : "Show quick BUY/SELL"}
                  style={{
                    background: tradeBarOpen ? `${C.orange}25` : "transparent",
                    color: tradeBarOpen ? C.orange : C.muted,
                    border: `1px solid ${tradeBarOpen ? C.orange + "70" : C.border}`,
                    padding: "1px 7px", cursor: "pointer", borderRadius: 2,
                    fontSize: "9px", fontWeight: 800, fontFamily: mono, letterSpacing: "0.5px",
                  }}
                >TRADE</button>
                <span style={{color:C.muted,fontSize:"8px",fontFamily:mono}}>{ad?.asset_class||""}</span>
                {lp>0&&<span style={{color:C.white,fontWeight:700,fontSize:"12px",fontFamily:mono}}>{lp.toFixed(dec)}</span>}
                {loading&&<span style={{color:C.orange,fontSize:"8px",fontFamily:mono}}>LOADING...</span>}
                {/* v37/v40: Quick BUY | lot | SELL + PENDING workflow.
                    v40 adds:
                      · PENDING button (divider then blue toggle) after SELL
                      · In pending mode, BUY/SELL dim blue; clicking either arms
                        the direction (armed side = brighter blue fill)
                      · CANCEL button appears when pendingMode != null and exits mode
                      · While direction armed, the chart container shows a full
                        overlay with hover ghost + click-to-place. */}
                {tradeBarOpen && (() => {
                  const live = executionStatus?.live_trading && executionStatus?.provider_connected;
                  const disabledTitle = !live
                    ? "Enable live trading in Settings"
                    : quickSubmitting ? "Submitting..." : "";
                  const btnBase = {
                    padding: "2px 10px", cursor: live && !quickSubmitting ? "pointer" : "not-allowed",
                    fontSize: "11px", fontWeight: 800, fontFamily: mono, borderRadius: 2,
                    letterSpacing: "0.5px", opacity: live ? 1 : 0.4,
                  };
                  const isPending = !!pendingMode;
                  const buyArmed  = pendingMode === "buy_armed";
                  const sellArmed = pendingMode === "sell_armed";
                  const buyColor  = isPending ? C.blue : C.green;
                  const sellColor = isPending ? C.blue : C.red;
                  const buyBg  = isPending ? (buyArmed  ? `${C.blue}50` : `${C.blue}15`) : (live ? `${C.green}20` : "transparent");
                  const sellBg = isPending ? (sellArmed ? `${C.blue}50` : `${C.blue}15`) : (live ? `${C.red}20`   : "transparent");
                  const buyBorder  = isPending ? `1px solid ${C.blue}${buyArmed  ? "A0" : "50"}` : `1px solid ${C.green}70`;
                  const sellBorder = isPending ? `1px solid ${C.blue}${sellArmed ? "A0" : "50"}` : `1px solid ${C.red}70`;
                  const onBuyClick  = () => isPending ? setPendingMode("buy_armed")  : doQuickTrade("BUY");
                  const onSellClick = () => isPending ? setPendingMode("sell_armed") : doQuickTrade("SELL");
                  const buyTitle  = isPending ? (buyArmed  ? "BUY PENDING armed — click on chart to place" : "Arm BUY direction for pending order")
                                              : (disabledTitle || "Market BUY — 1 click, no confirm");
                  const sellTitle = isPending ? (sellArmed ? "SELL PENDING armed — click on chart to place" : "Arm SELL direction for pending order")
                                              : (disabledTitle || "Market SELL — 1 click, no confirm");
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                      <button
                        disabled={!live || quickSubmitting}
                        onClick={onBuyClick}
                        title={buyTitle}
                        style={{ ...btnBase, background: buyBg, color: buyColor, border: buyBorder }}
                      >BUY</button>
                      <input
                        type="text"
                        value={quickLots}
                        onChange={e => setQuickLots(e.target.value)}
                        placeholder={quickMinLot != null ? String(quickMinLot) : "lots"}
                        title={quickMinLot != null ? `Min ${quickMinLot} · step ${quickLotStep}` : "lot size"}
                        style={{
                          width: 54, textAlign: "center",
                          background: C.bg, color: C.white,
                          border: `1px solid ${C.borderLt}`,
                          padding: "2px 4px", fontSize: "11px", fontWeight: 700,
                          fontFamily: mono, outline: "none", borderRadius: 2,
                        }}
                      />
                      <button
                        disabled={!live || quickSubmitting}
                        onClick={onSellClick}
                        title={sellTitle}
                        style={{ ...btnBase, background: sellBg, color: sellColor, border: sellBorder }}
                      >SELL</button>
                      <div style={{ width: 1, height: 14, background: C.border, margin: "0 2px" }} />
                      <button
                        disabled={!live}
                        onClick={() => setPendingMode("armed")}
                        title={isPending ? "PENDING mode active — pick BUY or SELL, then click on chart" : "Arm PENDING order placement"}
                        style={{
                          padding: "2px 10px", cursor: live ? "pointer" : "not-allowed",
                          fontSize: "11px", fontWeight: 800, fontFamily: mono, borderRadius: 2,
                          letterSpacing: "0.5px", opacity: live ? 1 : 0.4,
                          background: isPending ? `${C.blue}40` : `${C.blue}10`,
                          color: C.blue, border: `1px solid ${C.blue}${isPending ? "A0" : "40"}`,
                        }}
                      >PENDING</button>
                      {isPending && (
                        <button
                          onClick={() => { setPendingMode(null); setPendingHover(null); }}
                          title="Exit pending mode (already-placed orders stay)"
                          style={{
                            padding: "2px 8px", cursor: "pointer",
                            fontSize: "11px", fontWeight: 800, fontFamily: mono, borderRadius: 2,
                            letterSpacing: "0.5px",
                            background: `${C.red}15`, color: C.red,
                            border: `1px solid ${C.red}70`,
                          }}
                        >CANCEL</button>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div style={{display:"flex",gap:2,alignItems:"center"}}>
                <TimeframeDropdown
                  tf={tf}
                  daysPerTf={daysPerTf}
                  historicalOn={historicalOn}
                  historicalFrom={historicalFrom}
                  historicalTo={historicalTo}
                  barTimer={barTimer}
                  loading={loading}
                  onLoad={({ tf: nextTf, days, daysPerTf: nextDaysPerTf, historicalOn: nextHistOn, historicalFrom: nextFrom, historicalTo: nextTo }) => {
                    // 1. Persist staged values into MainChart state — auto-save effect picks them up
                    setDaysPerTf(nextDaysPerTf);
                    setHistoricalOn(nextHistOn);
                    setHistoricalFrom(nextFrom);
                    setHistoricalTo(nextTo);

                    // 2. If TF changed, propagate via the existing setTf + onTimeframeChange path
                    if (nextTf !== tf) {
                      setTf(nextTf);
                      onTimeframeChange?.(nextTf);
                    }

                    // 3. Compute count and fire fetch
                    const count = estimateBarCount(days, nextTf);
                    const safeCount = count > 0 ? count : 200;
                    setBc(safeCount);
                    setLoading(true);
                    fetchBars(selectedTicker, nextTf, safeCount).finally(() => setLoading(false));
                  }}
                />
                <TemplateDropdown
                  currentTicker={selectedTicker}
                  getCurrentConfig={getCurrentConfig}
                  onLoadTemplate={onLoadTemplate}
                  loadedTemplateName={loadedTemplate ? loadedTemplate.name : null}
                />
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,position:"relative"}}>
                <Dropdown label="CONES" anyOn={Object.values(cg).some(v=>v)} groups={CONE_GROUPS} state={cg} onToggle={tC} onAll={tCA}
                  slotVis={slotVis} onToggleSlot={tSV}
                  onGear={(group)=>setEditingConeGroup(editingConeGroup===group?null:group)} />
                {editingConeGroup && CONE_GROUPS[editingConeGroup] && (
                  <ConeStyleEditor
                    group={editingConeGroup}
                    groupData={CONE_GROUPS[editingConeGroup]}
                    coneStyles={coneStyles}
                    onUpdate={updateConeStyle}
                    onClose={()=>setEditingConeGroup(null)}
                  />
                )}
                <BandsDropdown
                  bandStyles={bandStyles}
                  layerOn={layers.bands}
                  onToggleAll={toggleAllBands}
                  onToggleModel={toggleBandModel}
                  onUpdateStyle={updateBandStyle}
                  meanStyle={{ ...DEFAULT_BAND_STYLES.mean, ...(bandStyles.mean || {}) }}
                  onUpdateMeanColor={(color) => updateBandStyle("mean", { color })}
                  stale={bandsStale}
                />
                {/* v6: hidden until data feeds for signals + anchors are updated.
                    Remove the {false && ...} guards below to restore. */}
                {false && <Btn id="signals" l="SIGNALS" on={layers.signals} />}
                {false && <Dropdown label="ANCHORS" anyOn={Object.values(ag).some(v=>v)} groups={ANCHOR_GROUPS} state={ag} onToggle={tA} onAll={tAA} />}
                {/* v8: toggle solid vs dashed cone deviations (sd1/sd2/sd3). */}
                <button
                  onClick={() => setSolidDev(s => !s)}
                  title={solidDev ? "Deviations: SOLID (click for dashed)" : "Deviations: DASHED (click for solid)"}
                  style={{
                    background: solidDev ? `${C.orange}20` : "transparent",
                    color: solidDev ? C.orange : C.white,
                    border: `1px solid ${solidDev ? C.orange + "50" : C.borderLt}`,
                    padding: "2px 9px", cursor: "pointer",
                    fontSize: "11px", fontWeight: 700, fontFamily: mono,
                  }}
                >SOLID DEV</button>
                {/* v56: experimental heatmap — paints Mon–Fri option-weight
                     behind the candles (past + today + future). Burning
                     accent when on. ▾ opens opacity/contrast/threshold settings.
                     v57: hidden entirely on assets that don't have probfield
                     data (`optionsAvailable === false`) — same gating signal
                     used by the GEX dropdown. */}
                {optionsAvailable !== false && (
                <div style={{ position: "relative", display: "inline-flex", gap: 2 }}>
                  <button
                    onClick={() => setShowHeat(s => {
                      const next = !s;
                      // v69: turning HEAT off also forces PRO HEAT off so
                      //   the pro 2-month overlay can't linger silently
                      //   when the master switch is off.
                      if (!next) setShowProHeat(false);
                      return next;
                    })}
                    title="Paint this week's option-weight heatmap (Mon–Fri, incl. future days) behind the chart"
                    style={{
                      background: showHeat
                        ? "linear-gradient(135deg, #ff6d00 0%, #ff4500 48%, #e8383b 100%)"
                        : "transparent",
                      color: showHeat ? "#fff" : C.white,
                      border: `1px solid ${showHeat ? "#ff6d00" : C.borderLt}`,
                      padding: "2px 12px", cursor: "pointer",
                      fontSize: "11px", fontWeight: 800, fontFamily: mono,
                      letterSpacing: "1.5px",
                      textShadow: showHeat ? "0 0 4px rgba(255,200,120,0.8)" : "none",
                      animation: showHeat ? "mkHeatPulse 1.6s ease-in-out infinite" : "none",
                    }}
                  >HEAT</button>
                  <button
                    onClick={() => setHeatMenuOpen(o => !o)}
                    title="Heat level settings"
                    style={{
                      background: heatMenuOpen ? `${C.orange}20` : "transparent",
                      color: heatMenuOpen ? C.orange : C.white,
                      border: `1px solid ${heatMenuOpen ? C.orange + "50" : C.borderLt}`,
                      padding: "2px 6px", cursor: "pointer",
                      fontSize: "11px", fontWeight: 700, fontFamily: mono,
                    }}
                  >▾</button>
                  {heatMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
                        background: "#0a0a0a", border: "1px solid #333", padding: 10,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.7)", minWidth: 220,
                        fontFamily: mono,
                      }}
                    >
                      <div style={{ fontSize: 9, color: "#ff6d00", fontWeight: 800, letterSpacing: "1.5px", marginBottom: 8 }}>
                        HEAT LEVELS
                      </div>
                      {/* v57: 2-MONTH HEAT toggle — paints both month_prev + month_curr
                          (was subscription-gated as "PRO HEAT"; free for everyone now). */}
                      <button
                        onClick={() => setShowProHeat(s => !s)}
                        title={showProHeat ? "Click to disable 2-month view" : "Show both previous and current month on chart"}
                        style={{
                          width: "100%", marginBottom: 8, cursor: "pointer",
                          background: showProHeat
                            ? "linear-gradient(135deg, #ff6d00 0%, #e8383b 100%)"
                            : "transparent",
                          color: showProHeat ? "#fff" : "#ff6d00",
                          border: `1px solid ${showProHeat ? "#ff6d00" : "#ff6d0066"}`,
                          padding: "5px 10px",
                          fontSize: 9, fontWeight: 800, fontFamily: mono, letterSpacing: "1.5px",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <span>2-MONTH HEAT</span>
                        <span style={{
                          fontSize: 7, fontWeight: 900, letterSpacing: "0.5px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#ffd60050", color: "#ffd600", border: "1px solid #ffd600",
                        }}>{showProHeat ? "ON" : "OFF"}</span>
                      </button>
                      {/* v68: palette picker + gradient legend bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 8, color: "#888", letterSpacing: "1px", minWidth: 56 }}>PALETTE</span>
                        <select
                          value={heatPalette}
                          onChange={e => setHeatPalette(e.target.value)}
                          style={{
                            flex: 1, background: "#0a0a0a", color: "#fff",
                            border: "1px solid #333", padding: "2px 4px",
                            fontSize: 9, fontFamily: mono, letterSpacing: "0.5px",
                            cursor: "pointer",
                          }}
                        >
                          {Object.entries(HEAT_PALETTES).map(([key, p]) => (
                            <option key={key} value={key}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{
                          height: 12, width: "100%",
                          background: paletteToCssGradient(HEAT_PALETTES[heatPalette] || HEAT_PALETTES.fire),
                          border: "1px solid #222",
                        }} />
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          fontSize: 7, color: "#666", letterSpacing: "1px", marginTop: 2,
                        }}>
                          <span>LO</span><span>HI</span>
                        </div>
                      </div>
                      {/* Opacity */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 8, color: "#888", letterSpacing: "1px", minWidth: 56 }}>OPACITY</span>
                        <input type="range" min={0.1} max={1.0} step={0.02}
                          value={heatOpacity}
                          onChange={e => setHeatOpacity(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#ff6d00" }} />
                        <span style={{ fontSize: 9, color: "#fff", minWidth: 32, textAlign: "right" }}>
                          {(heatOpacity * 100).toFixed(0)}%
                        </span>
                      </div>
                      {/* Contrast (gamma). Lower = brighter lows, higher contrast in dim regions. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 8, color: "#888", letterSpacing: "1px", minWidth: 56 }}>CONTRAST</span>
                        <input type="range" min={0.3} max={1.5} step={0.05}
                          value={heatContrast}
                          onChange={e => setHeatContrast(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#ff6d00" }} />
                        <span style={{ fontSize: 9, color: "#fff", minWidth: 32, textAlign: "right" }}>
                          {heatContrast.toFixed(2)}
                        </span>
                      </div>
                      {/* Threshold — cells below this fraction of max go invisible.
                          Range extended to 0.95 because probfield data often has
                          a flat plateau of t≈1.0 in the visible candle range, so
                          low-threshold values can't slice into it. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 8, color: "#888", letterSpacing: "1px", minWidth: 56 }}>THRESHOLD</span>
                        <input type="range" min={0} max={0.95} step={0.01}
                          value={heatThreshold}
                          onChange={e => setHeatThreshold(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#ff6d00" }} />
                        <span style={{ fontSize: 9, color: "#fff", minWidth: 32, textAlign: "right" }}>
                          {(heatThreshold * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button
                          onClick={() => { setHeatOpacity(0.38); setHeatContrast(0.75); setHeatThreshold(0.05); }}
                          style={{
                            flex: 1, background: "transparent", border: "1px solid #333",
                            color: "#888", padding: "3px 8px", cursor: "pointer",
                            fontSize: 8, fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
                          }}
                        >RESET</button>
                        <button
                          onClick={() => setHeatMenuOpen(false)}
                          style={{
                            flex: 1, background: "transparent", border: "1px solid #333",
                            color: "#888", padding: "3px 8px", cursor: "pointer",
                            fontSize: 8, fontWeight: 700, fontFamily: mono, letterSpacing: "1px",
                          }}
                        >CLOSE</button>
                      </div>
                    </div>
                  )}
                </div>
                )}
                {/* v60: FOREST — Path Outcome Forest 4h forward outcome bands.
                     Pulls from /api/forest/{ticker}, paints 5 cluster price
                     bands between anchor and +4h. Dev: scenario picker in
                     the ▾ menu lets us test against all 5 fixture files.
                     v87: PARKED — wrap in {false && (...)} to hide button.
                     Render logic in the useMemo stays intact for easy revival;
                     just unwrap when ready. */}
                {false && (
                <div style={{ position: "relative", display: "inline-flex", gap: 2 }}>
                  <button
                    onClick={() => setShowForest(s => !s)}
                    title="Path Outcome Forest — 4h forward outcome distribution (5 cluster bands)"
                    style={{
                      background: showForest
                        ? "linear-gradient(135deg, #10b981 0%, #22d3ee 100%)"
                        : "transparent",
                      color: showForest ? "#fff" : C.white,
                      border: `1px solid ${showForest ? "#10b981" : C.borderLt}`,
                      padding: "2px 12px", cursor: "pointer",
                      fontSize: "11px", fontWeight: 800, fontFamily: mono,
                      letterSpacing: "1.5px",
                      textShadow: showForest ? "0 0 4px rgba(120,255,200,0.7)" : "none",
                    }}
                  >FOREST</button>
                  <button
                    onClick={() => setForestMenuOpen(o => !o)}
                    title="Forest scenario (dev)"
                    style={{
                      background: forestMenuOpen ? `${C.cyan}20` : "transparent",
                      color: forestMenuOpen ? C.cyan : C.white,
                      border: `1px solid ${forestMenuOpen ? C.cyan + "60" : C.borderLt}`,
                      padding: "2px 6px", cursor: "pointer",
                      fontSize: "11px", fontWeight: 700, fontFamily: mono,
                    }}
                  >▾</button>
                  {forestMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
                        background: "#0a0a0a", border: "1px solid #333", padding: 10,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.7)", minWidth: 200,
                        fontFamily: mono,
                      }}
                    >
                      <div style={{
                        fontSize: 9, color: "#22d3ee", fontWeight: 800,
                        letterSpacing: "1.5px", marginBottom: 8,
                      }}>LAYERS</div>
                      {/* v85: 4 sub-toggles for forest layers + v86: connections */}
                      {[
                        { key: "paths",       label: "FOREST (dominant)", val: showForestPaths,       set: setShowForestPaths },
                        { key: "cone",        label: "CONE",              val: showForestCone,        set: setShowForestCone },
                        { key: "histogram",   label: "PROB BARS",         val: showForestHistogram,   set: setShowForestHistogram },
                        { key: "historical",  label: "HISTORICAL",        val: showForestHistorical,  set: setShowForestHistorical },
                        { key: "connections", label: "CONNECTIONS",       val: showForestConnections, set: setShowForestConnections },
                      ].map(t => (
                        <button
                          key={t.key}
                          onClick={() => t.set(v => !v)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                            background: t.val ? `${C.cyan}18` : "transparent",
                            border: `1px solid ${t.val ? C.cyan + "60" : "#333"}`,
                            color: t.val ? C.cyan : "#888",
                            padding: "5px 10px", marginBottom: 4,
                            fontSize: 10, fontWeight: 700, fontFamily: mono,
                            letterSpacing: "1px", cursor: "pointer",
                          }}>
                          <span>{t.val ? "●" : "○"}</span>
                          <span>{t.label}</span>
                        </button>
                      ))}
                      <div style={{
                        borderTop: "1px solid #2a2a2a", marginTop: 8, paddingTop: 8,
                        fontSize: 9, color: "#22d3ee", fontWeight: 800,
                        letterSpacing: "1.5px", marginBottom: 8,
                      }}>FILTER</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setForestRegimeFilter(false)}
                          style={{
                            flex: 1,
                            background: !forestRegimeFilter ? `${C.cyan}25` : "transparent",
                            border: `1px solid ${!forestRegimeFilter ? C.cyan : "#333"}`,
                            color: !forestRegimeFilter ? C.cyan : "#aaa",
                            padding: "6px 10px",
                            fontSize: 10, fontWeight: 700, fontFamily: mono,
                            letterSpacing: "1px", cursor: "pointer",
                          }}
                        >
                          {!forestRegimeFilter ? "● " : "○ "}ALL
                        </button>
                        <button
                          onClick={() => setForestRegimeFilter(true)}
                          style={{
                            flex: 1,
                            background: forestRegimeFilter ? `${C.cyan}25` : "transparent",
                            border: `1px solid ${forestRegimeFilter ? C.cyan : "#333"}`,
                            color: forestRegimeFilter ? C.cyan : "#aaa",
                            padding: "6px 10px",
                            fontSize: 10, fontWeight: 700, fontFamily: mono,
                            letterSpacing: "1px", cursor: "pointer",
                          }}
                        >
                          {forestRegimeFilter ? "● " : "○ "}REGIME FILTER
                        </button>
                      </div>
                      <div style={{
                        fontSize: 8, color: "#666", marginTop: 8,
                        lineHeight: 1.5, letterSpacing: "0.3px",
                      }}>
                        REGIME FILTER hides paths whose dominant regime
                        differs from the asset's current micro regime.
                        Probability bars are recomputed to show the
                        conditional outlook given that regime.
                      </div>
                    </div>
                  )}
                </div>
                )}
                <Dropdown label="BATES" anyOn={Object.values(bg).some(v=>v)} groups={BATES_GROUPS} state={bg} onToggle={tB} onAll={tBA}
                  slotVis={slotVis} onToggleSlot={tSV}
                  onGear={(group)=>setEditingBatesGroup(editingBatesGroup===group?null:group)} />
                {editingBatesGroup && BATES_GROUPS[editingBatesGroup] && (
                  <ConeStyleEditor
                    group={"bates_" + editingBatesGroup}
                    groupData={BATES_GROUPS[editingBatesGroup]}
                    coneStyles={coneStyles}
                    onUpdate={updateConeStyle}
                    onClose={()=>setEditingBatesGroup(null)}
                  />
                )}
                <Dropdown label="GEX" anyOn={Object.values(gg).some(v=>v)} groups={GEX_GROUPS} state={gg} onToggle={tG} onAll={tGA}
                  slotVis={slotVis} onToggleSlot={tSV}
                  onGear={(group)=>setEditingGexGroup(editingGexGroup===group?null:group)}
                  disabled={optionsAvailable === false}
                  disabledTitle="no data" />
                {editingGexGroup && GEX_GROUPS[editingGexGroup] && (
                  <ConeStyleEditor
                    group={"gex_" + editingGexGroup}
                    groupData={GEX_GROUPS[editingGexGroup]}
                    coneStyles={coneStyles}
                    onUpdate={updateConeStyle}
                    onClose={()=>setEditingGexGroup(null)}
                  />
                )}
                <div style={{width:1,height:14,background:C.border,margin:"0 2px"}} />
                <IndicatorsDropdown indicators={indicators} onToggle={tI} onImport={handleImport} indicatorStyles={indicatorStyles} onUpdateStyle={updateIndicatorStyle} />
                <DrawingToolbar
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  drawStyle={drawStyle}
                  onStyleChange={handleDrawStyleChange}
                  drawingCount={drawingCount}
                  onClearAll={handleClearDrawings}
                  onDeleteSelected={handleDeleteSelected}
                  hasSelected={hasSelectedDrawing}
                />
                <div style={{width:1,height:14,background:C.border,margin:"0 2px"}} />
                {/* ORDER button — green when live+connected, red when not */}
                {(() => {
                  const live = executionStatus?.live_trading && executionStatus?.provider_connected;
                  const color = live ? C.green : C.red;
                  return (
                    <button onClick={onOrderClick} title={live ? "New Order — Live Trading ON" : "New Order — Trading OFF"} style={{
                      background: `${color}15`, border: `1px solid ${color}50`,
                      color: color, padding: "1px 6px", cursor: "pointer", fontSize: "7px",
                      fontWeight: 800, fontFamily: mono, borderRadius: 2, letterSpacing: "0.5px",
                    }}>ORDER</button>
                  );
                })()}
                <div style={{width:1,height:14,background:C.border,margin:"0 2px"}} />
                {/* v24: FIT — snap visible range to last 600 bars (avoids long zoom-out) */}
                {/* v76: handler extracted to fitChartRef so the right-click
                         "Reset Chart" item can call the exact same logic. */}
                <button
                  onClick={() => fitChartRef.current?.()}
                  title={`Fit last ${FIT_CANDLES} candles + resume live updates`}
                  style={{
                    background: "transparent", color: C.white,
                    border: `1px solid ${C.white}`, padding: "1px 7px",
                    cursor: "pointer", borderRadius: 2,
                    fontSize: "9px", fontWeight: 800, fontFamily: mono, letterSpacing: "1px",
                  }}
                >F</button>
                <div style={{width:1,height:14,background:C.border,margin:"0 2px"}} />
                {/* REMOVED: CalcSettingsDropdown + ManualConeDropdown (Rule C1) */}
                <button title="Export chart as PNG" style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,padding:"1px 4px",cursor:"pointer",borderRadius:2,display:"flex",alignItems:"center"}}
                onClick={()=>{
                  // Screenshot pipeline:
                  //   (1) composite every <canvas> in the container (LWC series + primitives)
                  //   (2) rasterize every <svg> overlay and composite on top (heatmap, etc)
                  //   (3) save as PNG
                  // Step 2 added v56 so the SVG-based HEAT overlay is captured.
                  requestAnimationFrame(() => {
                    try {
                      if (!containerRef.current) return;
                      const container = containerRef.current;
                      const containerRect = container.getBoundingClientRect();
                      const canvases = Array.from(
                        container.querySelectorAll("canvas")
                      ).filter(c => c.width > 0 && c.height > 0);
                      if (!canvases.length) return;

                      const W = Math.max(...canvases.map(c => c.width));
                      const H = Math.max(...canvases.map(c => c.height));
                      // Scale to map CSS pixels (SVG coords) → canvas pixels (DPR-scaled)
                      const scaleX = W / containerRect.width;
                      const scaleY = H / containerRect.height;

                      const out = document.createElement("canvas");
                      out.width  = W;
                      out.height = H;
                      const ctx = out.getContext("2d");
                      ctx.fillStyle = "#000000";
                      ctx.fillRect(0, 0, W, H);

                      for (const c of canvases) {
                        try { ctx.drawImage(c, 0, 0); } catch {}
                      }

                      // Gather SVG overlays in DOM order (stays above the candles).
                      const svgs = Array.from(container.querySelectorAll("svg"))
                        .filter(s => s.getBoundingClientRect().width > 0 && s.getBoundingClientRect().height > 0);

                      const rasterize = (svg) => new Promise(resolve => {
                        try {
                          const r = svg.getBoundingClientRect();
                          const offX = (r.left - containerRect.left) * scaleX;
                          const offY = (r.top  - containerRect.top ) * scaleY;
                          const dstW = r.width  * scaleX;
                          const dstH = r.height * scaleY;

                          // Clone + set explicit size so the rasterizer has dimensions.
                          const clone = svg.cloneNode(true);
                          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                          clone.setAttribute("width",  String(r.width));
                          clone.setAttribute("height", String(r.height));
                          const xml = new XMLSerializer().serializeToString(clone);
                          // Use data URL (not blob URL) so taint rules stay predictable.
                          const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
                          const img = new Image();
                          img.onload  = () => { try { ctx.drawImage(img, offX, offY, dstW, dstH); } catch {} resolve(); };
                          img.onerror = () => resolve();
                          img.src = url;
                        } catch { resolve(); }
                      });

                      Promise.all(svgs.map(rasterize)).then(() => {
                        const fname = `${selectedTicker}_${tf}_${new Date().toISOString().slice(0,10)}.png`;
                        // v2: prefer native save dialog via Electron IPC.
                        //   toBlob() avoids the slow base64 toDataURL() hop;
                        //   the bytes go straight to fs.writeFile in the
                        //   Electron main process. Anchor-click fallback for
                        //   browser dev mode (no window.mkElectron).
                        const electronSave = (typeof window !== "undefined") && window.mkElectron && window.mkElectron.saveScreenshot;
                        if (electronSave) {
                          out.toBlob(async (blob) => {
                            if (!blob) {
                              log("error", "Screenshot: toBlob returned null");
                              return;
                            }
                            try {
                              const buf = await blob.arrayBuffer();
                              const result = await window.mkElectron.saveScreenshot(fname, new Uint8Array(buf));
                              if (!result?.saved && result?.error) {
                                log("error", `Screenshot save failed: ${result.error}`);
                              }
                            } catch (e) {
                              console.error("[MC] IPC screenshot save:", e);
                              log("error", `Screenshot save failed: ${e.message}`);
                            }
                          }, "image/png");
                        } else {
                          // Browser fallback: blob URL is still faster than
                          // toDataURL because no base64 encoding happens.
                          out.toBlob((blob) => {
                            if (!blob) return;
                            try {
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.download = fname;
                              link.href = url;
                              link.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1500);
                            } catch (e) {
                              console.error("[MC] Screenshot save:", e);
                              log("error", `Screenshot save failed: ${e.message}`);
                            }
                          }, "image/png");
                        }
                      });
                    } catch (e) {
                      console.error("[MC] Screenshot:", e);
                      log("error", `Screenshot failed: ${e.message}`);
                    }
                  });
                }}
                ><svg width="14" height="12" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 2L6.5 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H21C22.1 19 23 18.1 23 17V7C23 5.9 22.1 5 21 5H17.5L15.5 2H8.5Z" stroke="#ff6d00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="4" stroke="#ff6d00" strokeWidth="2"/></svg></button>
                {/* ── Fullscreen toggle ── */}
                <button onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,padding:"1px 4px",cursor:"pointer",borderRadius:2,display:"flex",alignItems:"center"}}>
                  {isFullscreen
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" stroke="#ff6d00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3l5 5M21 3l-5 5M3 21l5-5M21 21l-5-5" stroke="#ff6d00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
                {/* ── Collapse toolbar arrow ── */}
                <button onClick={()=>setToolbarCollapsed(true)} title="Hide toolbar" style={{background:"transparent",color:C.orange,border:`1px solid ${C.border}`,padding:"1px 5px",cursor:"pointer",fontSize:"9px",fontFamily:mono,borderRadius:2}}>▲</button>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"2px 10px",borderBottom:`1px solid ${C.border}`,background:C.bg,flexShrink:0,fontSize:"7px",fontFamily:mono}}>
              {["cones","bands"].map(k=><span key={k} style={{color:ds[k]?C.green:C.muted}}>{ds[k]?"\u25CF":"\u25CB"} {k.toUpperCase()}</span>)}
              {positionsOnChart.length > 0 && <span style={{color:C.green}}>{"\u25CF"} POSITIONS ({positionsOnChart.length})</span>}
              {indicators.show_trade_history && <span style={{color:C.muted}}>{"\u25CF"} HISTORY</span>}
            </div>
          </>
        ) : (
          /* ── COLLAPSED / COMPACT TOOLBAR: minimal strip with expand arrow ── */
          <div onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",padding:"1px 8px",borderBottom:`1px solid ${C.border}`,background:C.bgPanel,flexShrink:0,gap:6}}>
            <button onClick={()=>setToolbarCollapsed(false)} title="Show toolbar" style={{background:"transparent",color:C.orange,border:"none",padding:"0 4px",cursor:"pointer",fontSize:"9px",fontFamily:mono}}>▼</button>
            <span style={{color:C.orange,fontWeight:800,fontSize:"11px",fontFamily:mono}}>{selectedTicker}</span>
            <span style={{color:C.muted,fontSize:"7px",fontFamily:mono}}>{tf}</span>
            {lp>0&&<span style={{color:C.white,fontWeight:700,fontSize:"10px",fontFamily:mono}}>{lp.toFixed(dec)}</span>}
            <div style={{flex:1}} />
            {["cones","bands"].map(k=><span key={k} style={{color:ds[k]?C.green:C.muted,fontSize:"6px",fontFamily:mono}}>{ds[k]?"\u25CF":"\u25CB"}</span>)}
          </div>
        )}
      </>)}
      <div
        ref={containerRef}
        onContextMenu={(e) => {
          // v62: right-click → open chart context menu (Settings/Draw/
          //      Change Ticker/Refresh). Suppress browser default.
          e.preventDefault();
          setChartCtxMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{flex:1,minHeight:0,position:"relative",cursor:activeTool?"crosshair":(hasSelectedDrawing?"grab":(hoveredDrawingId?"pointer":undefined))}}>
        {!selectedTicker&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:C.muted,fontSize:"11px",fontFamily:mono}}>SELECT AN ASSET</span></div>}
        {/* v90: session-separator overlay canvas (market-close + RTH vertical lines).
                 pointer-events:none so chart drag/zoom is unaffected. zIndex chosen
                 to sit above chart canvas but below toolbars / popovers. */}
        <canvas
          ref={separatorOverlayRef}
          style={{
            position: "absolute", left: 0, top: 0,
            width: "100%", height: "100%",
            pointerEvents: "none", zIndex: 2,
          }}
        />

        {/* v79: cone-fill (between-models bands at each SD) — render below
                  heat so heat strips can sit on top if both are on. */}
        {coneFillOverlay}
        {/* v56: experimental heat strips overlay */}
        {heatOverlay}
        {/* v60: path-forest cluster bands overlay */}
        {forestOverlay}
        {/* v75: inline TEXT-tool input — replaces Electron-disabled window.prompt */}
        {pendingTextDraw && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: Math.max(4, Math.min(pendingTextDraw.x, (containerRef.current?.clientWidth || 800) - 220)),
              top:  Math.max(4, Math.min(pendingTextDraw.y, (containerRef.current?.clientHeight || 600) - 40)),
              zIndex: 300,
              background: "#0a0a0a",
              border: `1px solid ${C.orange}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.7)",
              padding: 4,
              display: "flex", gap: 4, alignItems: "center",
              fontFamily: mono,
            }}
          >
            <input
              autoFocus
              type="text"
              placeholder="Type text, Enter to place"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = e.currentTarget.value.trim();
                  if (v) {
                    drawingMgrRef.current.add({
                      type: "text",
                      points: [{ time: pendingTextDraw.time, price: pendingTextDraw.price }],
                      style: { ...drawStyle, _text: v, fontSize: 11 },
                      ticker: selectedTicker,
                      timeframe: tf,
                    });
                  }
                  setPendingTextDraw(null);
                  setActiveTool(null);
                } else if (e.key === "Escape") {
                  setPendingTextDraw(null);
                  setActiveTool(null);
                }
              }}
              style={{
                background: "#000", color: C.white,
                border: `1px solid ${C.borderLt}`,
                padding: "3px 6px", fontFamily: mono, fontSize: 11,
                outline: "none", width: 180,
              }}
            />
            <button
              onClick={() => { setPendingTextDraw(null); setActiveTool(null); }}
              title="Cancel (Esc)"
              style={{
                background: "transparent", color: C.muted,
                border: "none", padding: "0 4px", cursor: "pointer",
                fontSize: 11, fontFamily: mono,
              }}
            >×</button>
          </div>
        )}
        {/* v62: right-click context menu */}
        {chartCtxMenu && (
          <ChartContextMenu
            x={chartCtxMenu.x}
            y={chartCtxMenu.y}
            currentTicker={selectedTicker}
            currentTool={activeTool}
            assets={assets}
            onSelectDrawTool={(tool) => setActiveTool(tool)}
            onChangeTicker={(t) => { onChangeTicker && onChangeTicker(t); }}
            onRefresh={() => {
              if (selectedTicker && fetchBars) {
                fetchBars(selectedTicker, tf, cnt).catch(() => {});
              }
            }}
            onReset={() => fitChartRef.current?.()}
            onSettings={() => { setChartSettingsOpen(true); }}
            onSaveState={() => {
              saveCurrentSettings();
              if (loadedTemplate && loadedTemplate.name) {
                try { saveTemplate(loadedTemplate.name, getCurrentConfig(), selectedTicker); } catch {}
                return loadedTemplate.name;
              }
              return null;
            }}
            onClose={() => setChartCtxMenu(null)}
          />
        )}
        {/* v91: Chart Settings modal (Phase D Task 12). open/close via
                 chartSettingsOpen; live changes pipe straight into chartStyle
                 state, which the v89 effect applies to the chart on each render
                 and the v88 saveCurrentSettings persists into tickerSettings. */}
        <ChartSettingsModal
          open={chartSettingsOpen}
          initialStyle={chartStyle}
          onChange={setChartStyle}
          onClose={() => setChartSettingsOpen(false)}
        />
        {/* v43: Drawing style editor — floating popover when an object is selected */}
        {selectedDrawing && (
          <DrawingStyleEditor
            drawing={selectedDrawing}
            onChange={handleSelectedStyleChange}
            onDelete={handleDeleteSelected}
            onDeselect={handleDeselectDrawing}
          />
        )}
        {activeTool&&<div style={{position:"absolute",top:4,left:"50%",transform:"translateX(-50%)",zIndex:50,background:`${C.orange}20`,border:`1px solid ${C.orange}50`,padding:"2px 10px",fontSize:"8px",fontFamily:mono,color:C.orange,fontWeight:700,pointerEvents:"none",borderRadius:2}}>{DRAWING_TYPES[activeTool]?.label?.toUpperCase()} — {activeTool==="pen"?"PRESS AND DRAG TO DRAW":activeTool==="path"?"CLICK TO ADD POINT · DBL-CLICK TO FINISH":activeTool==="fib_ext"?(fibExtPointsRef.current?.length===3?"CLICK WIDTH EDGE (D)":fibExtPointsRef.current?.length===2?"CLICK PULLBACK (C)":fibExtPointsRef.current?.length===1?"CLICK POINT B":"CLICK POINT A"):(activeTool==="position_long"||activeTool==="position_short")?(drawPointRef.current?"CLICK SL LEVEL":"CLICK ENTRY LEVEL"):activeTool==="price_point"?(drawPointRef.current?"CLICK LABEL POSITION":"CLICK PRICE TO CAPTURE"):drawPointRef.current?"CLICK 2ND POINT":"CLICK TO PLACE"} · ESC TO CANCEL</div>}
        {/* v38: Drag-to-modify SL/TP overlay — invisible hit strips over each
             SL/TP/entry Y-coord, plus a dashed ghost line + price label that
             follows the cursor during drag. Overlay itself is pointer-events
             transparent; only the 10px strips catch events, so cones/bands/
             chart drag are unaffected. */}
        {!activeTool && posYCoords.length > 0 && (
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:55 }}>
            {posYCoords.map(pc => {
              if (pc.entry_y == null) return null;
              const isLong = pc.direction === "BUY";
              const hasSl = pc.stop_loss   != null && pc.sl_y != null;
              const hasTp = pc.take_profit != null && pc.tp_y != null;
              const pos = positionsOnChart.find(p => p.ticket === pc.ticket);
              if (!pos) return null;
              const STRIP_H = 10; // px — wide enough to grab, narrow enough to not block chart drag
              const stripStyle = (top) => ({
                position:"absolute", left:0, right:0,
                top: top - STRIP_H / 2, height: STRIP_H,
                pointerEvents:"auto", cursor:"ns-resize",
                // No background — MT5-style invisible drag zone. Cursor tells the story.
              });
              return (
                <Fragment key={pc.ticket}>
                  {/* Entry hit strip — present only when at least one side (SL or TP)
                      is missing; drag direction creates that side. */}
                  {(!hasSl || !hasTp) && (
                    <div
                      onPointerDown={(e) => beginPosDrag(e, pc.ticket, "entry", pos)}
                      title={
                        !hasSl && !hasTp
                          ? `Drag from entry: ${isLong ? "down=SL, up=TP" : "up=SL, down=TP"}`
                          : !hasSl
                            ? `Drag ${isLong ? "down" : "up"} from entry to set SL`
                            : `Drag ${isLong ? "up" : "down"} from entry to set TP`
                      }
                      style={stripStyle(pc.entry_y)}
                    />
                  )}
                  {/* SL hit strip */}
                  {hasSl && (
                    <div
                      onPointerDown={(e) => beginPosDrag(e, pc.ticket, "sl", pos)}
                      title={`Drag to modify SL · ${Number(pc.stop_loss).toFixed(dec)}`}
                      style={stripStyle(pc.sl_y)}
                    />
                  )}
                  {/* TP hit strip */}
                  {hasTp && (
                    <div
                      onPointerDown={(e) => beginPosDrag(e, pc.ticket, "tp", pos)}
                      title={`Drag to modify TP · ${Number(pc.take_profit).toFixed(dec)}`}
                      style={stripStyle(pc.tp_y)}
                    />
                  )}
                </Fragment>
              );
            })}
            {/* Ghost line + price label while dragging. v39: appends live
                $-risk (SL) / $-reward (TP) computed from cached symbol meta. */}
            {posDragState && posDragState.currentY != null && (() => {
              const { kind, direction, startY, currentY, currentPrice, pos } = posDragState;
              let actualKind = kind;
              if (kind === "entry") {
                const movedDown = currentY > startY;
                const isLong = direction === "BUY";
                actualKind = (isLong ? movedDown : !movedDown) ? "sl" : "tp";
              }
              const color = actualKind === "sl" ? C.red : C.green;
              // v39: compute $ risk/reward if we have symbol meta for this ticker.
              let moneyLabel = "";
              const meta = symbolMetaRef.current.get(pos?.ticker);
              if (meta && meta.tick_size > 0 && meta.tick_value > 0 && pos?.lots > 0) {
                const diff = Math.abs(currentPrice - pos.open_price);
                const amount = (diff / meta.tick_size) * meta.tick_value * pos.lots;
                if (Number.isFinite(amount) && amount > 0) {
                  const sign = actualKind === "sl" ? "\u2212" : "+"; // proper minus sign
                  moneyLabel = `  ${sign}$${amount.toFixed(2)}`;
                }
              }
              return (
                <>
                  <div style={{
                    position:"absolute", left:0, right:0,
                    top: currentY, height: 0,
                    borderTop: `1px dashed ${color}`,
                    pointerEvents:"none",
                  }} />
                  <div style={{
                    position:"absolute", right: 48,
                    top: currentY - 9, padding: "1px 6px",
                    background: `${color}25`, border: `1px solid ${color}80`,
                    color, fontSize: "10px", fontFamily: mono, fontWeight: 800,
                    borderRadius: 2, pointerEvents: "none", letterSpacing: "0.3px",
                    whiteSpace: "nowrap",
                  }}>
                    {actualKind.toUpperCase()} {Number(currentPrice).toFixed(dec)}{moneyLabel}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {/* v40: Pending-order overlay — blue trigger line, optional SL/TP,
             hit strips, ✕ cancel button, and drag/shift-drag support. */}
        {!activeTool && pendingYCoords.length > 0 && (
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:55 }}>
            {pendingYCoords.map(po => {
              if (po.price_y == null) return null;
              const order = pendingOrders.find(o => o.ticket === po.ticket);
              if (!order) return null;
              const STRIP_H = 10;
              const stripStyle = (top) => ({
                position:"absolute", left:0, right:48, // leave room for ✕ button
                top: top - STRIP_H / 2, height: STRIP_H,
                pointerEvents:"auto", cursor:"ns-resize",
              });
              const hasSl = po.stop_loss   && po.sl_y != null;
              const hasTp = po.take_profit && po.tp_y != null;
              return (
                <Fragment key={`pend-${po.ticket}`}>
                  {/* Visible blue trigger line (dashed) */}
                  <div style={{
                    position:"absolute", left:0, right:48,
                    top: po.price_y, height: 0,
                    borderTop: `1px dashed ${C.blue}`,
                    pointerEvents:"none",
                  }} />
                  <div style={{
                    position:"absolute", right: 56,
                    top: po.price_y - 9, padding: "1px 6px",
                    background: `${C.blue}25`, border: `1px solid ${C.blue}80`,
                    color: C.blue, fontSize: "9px", fontFamily: mono, fontWeight: 800,
                    borderRadius: 2, pointerEvents: "none", letterSpacing: "0.3px",
                    whiteSpace: "nowrap",
                  }}>
                    {po.direction} {po.order_type} {po.lots} @ {Number(po.price).toFixed(dec)}
                  </div>
                  {/* Trigger-price hit strip (plain drag = modify price, shift+drag = set SL/TP) */}
                  <div
                    onPointerDown={(e) => beginPendingDrag(e, po.ticket, "price", order)}
                    title="Drag to modify price · Shift+drag to set SL/TP (direction decides)"
                    style={stripStyle(po.price_y)}
                  />
                  {/* ✕ cancel button at right edge of the trigger line */}
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelPendingOrder(po.ticket); }}
                    title={`Cancel order #${po.ticket}`}
                    style={{
                      position:"absolute", right: 6,
                      top: po.price_y - 8, width: 16, height: 16,
                      pointerEvents:"auto", cursor:"pointer",
                      background: `${C.red}25`, color: C.red,
                      border: `1px solid ${C.red}80`, borderRadius: 2,
                      fontSize: 10, fontWeight: 900, fontFamily: mono,
                      padding: 0, lineHeight: "14px",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}
                  >{"\u2715"}</button>
                  {/* SL line + hit strip */}
                  {hasSl && (
                    <>
                      <div style={{
                        position:"absolute", left:0, right:48,
                        top: po.sl_y, height: 0,
                        borderTop: `1px dotted ${C.red}`,
                        pointerEvents:"none", opacity: 0.8,
                      }} />
                      <div
                        onPointerDown={(e) => beginPendingDrag(e, po.ticket, "sl", order)}
                        title={`Drag to modify SL · ${Number(po.stop_loss).toFixed(dec)}`}
                        style={stripStyle(po.sl_y)}
                      />
                    </>
                  )}
                  {/* TP line + hit strip */}
                  {hasTp && (
                    <>
                      <div style={{
                        position:"absolute", left:0, right:48,
                        top: po.tp_y, height: 0,
                        borderTop: `1px dotted ${C.green}`,
                        pointerEvents:"none", opacity: 0.8,
                      }} />
                      <div
                        onPointerDown={(e) => beginPendingDrag(e, po.ticket, "tp", order)}
                        title={`Drag to modify TP · ${Number(po.take_profit).toFixed(dec)}`}
                        style={stripStyle(po.tp_y)}
                      />
                    </>
                  )}
                </Fragment>
              );
            })}
            {/* Ghost for pending-order drag (plain or shift+drag on price) */}
            {pendingDragState && pendingDragState.currentY != null && (() => {
              const { kind, direction, startY, currentY, currentPrice, shift, order } = pendingDragState;
              // Resolve displayed kind: shift+drag on price → direction decides SL/TP
              let displayedKind = kind;
              if (kind === "price" && shift) {
                const movedDown = currentY > startY;
                const isLong = direction === "BUY";
                displayedKind = (isLong ? movedDown : !movedDown) ? "sl" : "tp";
              }
              const color = displayedKind === "sl" ? C.red
                          : displayedKind === "tp" ? C.green
                          : C.blue;
              // $ risk/reward for SL/TP ghosts on pending orders (v40).
              let moneyLabel = "";
              if (displayedKind === "sl" || displayedKind === "tp") {
                const meta = symbolMetaRef.current.get(order?.ticker);
                if (meta && meta.tick_size > 0 && meta.tick_value > 0 && order?.lots > 0) {
                  const diff = Math.abs(currentPrice - order.price);
                  const amount = (diff / meta.tick_size) * meta.tick_value * order.lots;
                  if (Number.isFinite(amount) && amount > 0) {
                    const sign = displayedKind === "sl" ? "\u2212" : "+";
                    moneyLabel = `  ${sign}$${amount.toFixed(2)}`;
                  }
                }
              }
              return (
                <>
                  <div style={{
                    position:"absolute", left:0, right:0,
                    top: currentY, height: 0,
                    borderTop: `1px dashed ${color}`,
                    pointerEvents:"none",
                  }} />
                  <div style={{
                    position:"absolute", right: 48,
                    top: currentY - 9, padding: "1px 6px",
                    background: `${color}25`, border: `1px solid ${color}80`,
                    color, fontSize: "10px", fontFamily: mono, fontWeight: 800,
                    borderRadius: 2, pointerEvents: "none", letterSpacing: "0.3px",
                    whiteSpace: "nowrap",
                  }}>
                    {displayedKind.toUpperCase()} {Number(currentPrice).toFixed(dec)}{moneyLabel}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {/* v40: Click-to-place overlay — only activates when a direction is
             armed. Full-container pointer catch: mousemove updates the hover
             ghost (LIMIT/STOP resolved vs live price), click places the order.
             Positioned below the pending overlay in z so the ✕ buttons remain
             clickable but above the chart so we intercept drags. */}
        {(pendingMode === "buy_armed" || pendingMode === "sell_armed") && lp > 0 && (
          <div
            onMouseMove={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              const series = candleRef.current;
              if (!rect || !series) return;
              const y = e.clientY - rect.top;
              const price = series.coordinateToPrice(y);
              if (price == null) { setPendingHover(null); return; }
              const direction = pendingMode === "buy_armed" ? "BUY" : "SELL";
              const kind = direction === "BUY"
                ? (price < lp ? "LIMIT" : "STOP")
                : (price > lp ? "LIMIT" : "STOP");
              setPendingHover({ y, price, kind });
            }}
            onMouseLeave={() => setPendingHover(null)}
            onClick={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              const series = candleRef.current;
              if (!rect || !series) return;
              const y = e.clientY - rect.top;
              const price = series.coordinateToPrice(y);
              if (price != null) placePendingOrder(price);
            }}
            style={{
              position: "absolute", inset: 0, zIndex: 54,
              cursor: "crosshair",
              // Subtle blue tint so the user knows pending mode is active.
              background: `${C.blue}08`,
            }}
          >
            {/* Hover ghost line + LIMIT/STOP + direction badge */}
            {pendingHover && (() => {
              const direction = pendingMode === "buy_armed" ? "BUY" : "SELL";
              return (
                <>
                  <div style={{
                    position:"absolute", left:0, right:0,
                    top: pendingHover.y, height: 0,
                    borderTop: `1px dashed ${C.blue}`,
                    pointerEvents:"none",
                  }} />
                  <div style={{
                    position:"absolute", right: 48,
                    top: pendingHover.y - 9, padding: "1px 6px",
                    background: `${C.blue}30`, border: `1px solid ${C.blue}A0`,
                    color: C.blue, fontSize: "10px", fontFamily: mono, fontWeight: 800,
                    borderRadius: 2, pointerEvents: "none", letterSpacing: "0.3px",
                    whiteSpace: "nowrap",
                  }}>
                    {direction} {pendingHover.kind} {Number(pendingHover.price).toFixed(dec)}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {/* v37: Quick-trade result toast — top-right, auto-dismiss 2s */}
        {quickToast && (
          <div style={{
            position:"absolute", top:8, right:12, zIndex:60,
            background: quickToast.kind === "ok" ? `${C.green}20` : `${C.red}20`,
            border: `1px solid ${quickToast.kind === "ok" ? C.green : C.red}80`,
            color: quickToast.kind === "ok" ? C.green : C.red,
            padding: "4px 10px", fontSize: "10px", fontFamily: mono,
            fontWeight: 700, borderRadius: 2, pointerEvents: "none",
            letterSpacing: "0.3px", maxWidth: 320,
            boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}>
            {quickToast.kind === "ok" ? "\u2713 " : "\u2717 "}{quickToast.msg}
          </div>
        )}
      </div>
    </div>
  );
});

export default MainChart;