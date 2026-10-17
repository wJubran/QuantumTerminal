// version: v48
/**
 * OptionsPanel.jsx — Options Quant Engine UI (v3)
 * Quantum Terminal | Phase 4F
 *
 * v48 — CalibratingBadge wired on Sauce cards 02 (Vanna/Charm) + 05
 *       (Market Entropy). New `calibratingBadge` prop added to
 *       SauceCard for explicit slot in the header (alongside
 *       freshnessBadge). Card 02 reason: vanna_pct cutoffs ±5/±25 +
 *       charm_0dte magnitude bucket thresholds are PROVISIONAL until
 *       DC re-fits against ~30 days of ThetaData history (per msg
 *       #84 sauce-revision thread). Card 05 reason: v1 entropy is
 *       BROKEN and v2 is in canary mode (validated against ~30
 *       hand-labels at 77.8% accuracy — directionally good but live-
 *       validation period). REMOVAL CHECKLIST in memory at
 *       `project_calibrating_badges_to_remove.md` — when DC ships
 *       calibration confirmations, search codebase for
 *       `<CalibratingBadge` and rip the relevant ones.
 *
 * v47 — Card 05 (Market Entropy) header badge wired to entropy v2.
 *       Operator screenshot 2026-05-15: card body correctly showed v2
 *       ORDERED but the top-right SauceCard header badge still showed
 *       v1's CHAOTIC — same card contradicting itself. Root cause: the
 *       SauceCard `badges` prop read `sauce.market_entropy?.state` and
 *       `.color` directly (v1 fields). Now reads v2 intraday state when
 *       present, falls back to v1 only if v2 fields absent. Same
 *       4-state coloring as the hero pillar (ORDERED green / MODERATE
 *       amber / CHAOTIC red / UNKNOWN gray).
 *
 * v46 — Pass cfd_ratio_used to the 0-DTE derivation functions for the
 *       chain → broker space conversion (per options_0dte_derivations
 *       v2 fix; visible bug was XAUUSD 0-DTE strikes rendering 10× off
 *       on the chart). Both deriveStructuralIntegrity0dte and
 *       deriveVolatilityGravity0dte now accept cfd_ratio_used as the
 *       3rd positional arg; we plumb data.cfd_ratio_used in.
 *
 * v45 — Levels-tab L02 (Structural Integrity) + L03 (Volatility Gravity)
 *       wired to the SWING / 0-DTE toggle. Per DC msg #119 (sauce-
 *       revision-2026-05-13 thread, format_version 2.4.1):
 *         - sauce_0dte ships producer-side with dealer_scenarios + market_entropy
 *         - structural_integrity + volatility_gravity 0-DTE versions are
 *           DERIVED CONSUMER-SIDE from raw gex_0dte + dealer_heatmap_0dte
 *           per the cookbook DC pinned (TIERS table + window logic +
 *           magnet/spring classification). Kept in `src/lib/
 *           options_0dte_derivations.js` with `// Source of truth:
 *           options_engine.py:908` tags.
 *       LevelsView now switches each card's data source on `levelsView`:
 *         - L02: sauce.structural_integrity (SWING) ↔ deriveStructural
 *           Integrity0dte(gex_0dte, spot) (0-DTE)
 *         - L03: sauce.volatility_gravity (SWING) ↔ deriveVolatility
 *           Gravity0dte(gex_0dte, dealer_heatmap_0dte, spot) (0-DTE)
 *       Empty/missing data renders the existing "No data" placeholder
 *       in each card (Card components already handle null payloads).
 *       Sanity-check: derivation matches producer's SWING values when
 *       run on gex_stack instead of gex_0dte (DC's verification path).
 *
 * v44 — Two consumer wire-ups for DC fixes shipped over the last 24h
 *       (sauce-revision-2026-05-13 thread):
 *
 *   (1) RetailTrapCard verdict: dropped the client-side `(vN)` schema-
 *       suffix regex strip. DC msg #111 confirmed the producer-side
 *       strip is shipped — the verdict string now arrives clean from
 *       the producer, so the client regex (added in v34) is redundant.
 *       Reverts to plain `{data.verdict}` rendering. Safe even if a
 *       stale producer somehow re-emits `(v2)` later — the regex was
 *       cosmetic only.
 *
 *   (2) MarketEntropyCard wired to entropy v2 canary fields. DC msg
 *       #117 shipped v2 as a side-by-side canary on `market_entropy`:
 *       legacy `entropy/state/color` keep working unchanged (v1 still
 *       reads CHAOTIC on calm tape, the original bug); new fields
 *       `market_entropy.intraday.{score, state, components,
 *       computed_at}` and `.swing.{score, state, components,
 *       computed_at}` plus `methodology: "v2-hybrid-2026-05-15"`. The
 *       card now reads v2 INTRADAY as the primary signal (state +
 *       score in the hero pillar) with v1 shown dimmed in a small
 *       "v1 legacy comparison" line for canary side-by-side. Handles
 *       four v2 states: ORDERED / MODERATE / CHAOTIC / UNKNOWN
 *       (UNKNOWN renders gray when too many input features were null
 *       — e.g. XTIUSD M5 bars currently). Once operator approves the
 *       canary cutover, DC will drop the legacy fields (bump 2.4.1
 *       → 2.5) and we'll remove the v1-comparison line.
 *
 * v43 — Cards 01 + 02 trajectory diagnostic visibility (per operator
 *       screenshot 2026-05-14: "where did the plot go?"). v42 hid the
 *       SESSION TRAJECTORY block entirely when `series.length < 2` —
 *       which gave the operator no indication whether the field was
 *       missing from the payload, present-but-empty (pre-09:30 ET
 *       reset), or building (1 entry, waiting for the 2nd Tier A
 *       tick). Now: always render the trajectory header with a state
 *       label, only render the sparkline when length >= 2.
 *
 *       Three diagnostic states surfaced inline:
 *         - Field absent       → "DATA MISSING — DC field not in this payload" (amber)
 *         - Field empty array  → "0 pts · pre-session (resets at 09:30 ET)" (gray)
 *         - Field length === 1 → "1 pt · building (need 2+)" (gray)
 *         - Field length >= 2  → "{N} pts · 5m" + full sparkline as v42
 *
 * v42 — Three batched fixes:
 *
 *       (1) Levels toolbar dead-toggle removal. Audit showed both
 *           PRICE LINE (`showPrice`) and DEALER Δ (`showHeatmap`)
 *           toolbar toggles flip state nobody reads. `showHeatmap` has
 *           ZERO consumers in the codebase. `showPrice` is forwarded
 *           through `LevelsView` to `GexChart` — but `GexChart` is
 *           never instantiated anywhere on the Levels tab (or anywhere
 *           else; `<GexChart` returns 0 grep matches). Both toggles
 *           are leftovers from a prior architecture where Levels had
 *           a chart panel; the current Levels tab is cards-only.
 *           Removed: the two toggle buttons in the toolbar mapping,
 *           the `useState` declarations, the `showPrice` prop on the
 *           `<LevelsView>` instantiation, and the corresponding
 *           destructuring in the `LevelsView` signature. Left alone:
 *           the `GexChart` component definition + its internal
 *           `showPrice` default (dead-but-harmless; out of scope for
 *           this ship).
 *
 *       (2) Cards 01 + 02 trajectory wired to real `signal_history`
 *           (DC msg #115 shipped Tier-A 5-min `[{t, v}, ...]` arrays).
 *           Card 01 now reads `data.asymmetry_ratio_history`
 *           (where `data = sauce.dealer_scenarios`); Card 02 reads
 *           `vc.vanna_pct_history`. Both extract just `.v` for the
 *           `MiniSparkline` component (which currently takes a flat
 *           series; timestamps are kept on the source object for
 *           future hover-tooltip work). Sparkline only renders when
 *           `history.length >= 2` per DC's contract — empty arrays
 *           pre-09:30 ET each day stay invisible. Dropped both
 *           `DUMMY_ASYMMETRY_HISTORY` and `DUMMY_VANNA_PCT_HISTORY`
 *           file-scope constants entirely. The "preview · awaiting
 *           DC signal_history" subtitles also gone.
 *
 *       (3) Card L02 (Structural Integrity Map) revision:
 *           - Font bump throughout: header cells 6→10, strike cell
 *             8→11, hardness sub-label 6→9, GEX cell 8→11, friction
 *             cell 7→10. Same readability bump pattern from the
 *             Sauce + Levels pass.
 *           - GEX cell formatter: replaced raw
 *             `(l.gex/1e9).toFixed(1)+"B"` with `fmtB(l.gex)` so
 *             sub-billion strikes show "+340M" instead of "+0.3B"
 *             (and zero-magnitude strikes don't render as "+0.0B"
 *             looking like data is missing).
 *           - Spot row: added explicit `← SPOT` label after the
 *             strike value (replacing the easy-to-miss tiny ` ◄`
 *             suffix) so beginners immediately see "this is current
 *             price."
 *           - Synthesis "▶ READ" line at the top of the table card
 *             summarizing the support/resistance balance (e.g.
 *             "3 reinforced floors below spot vs 1 reinforced
 *             ceiling above — support reads structurally stronger").
 *             Same pattern as Card L01 v40 / Sauce 04 v33 / Sauce
 *             06 v36.
 *
 * v41 — Levels-tab top-right toolbar redesign (per operator screenshot
 *       2026-05-14: "0dte and swing price line dealer delta buttons on
 *       the top right that needs review and redesign"). The Levels
 *       controls were using the legacy `Btn` and `Toggle` sub-components
 *       at fontSize 7 — tiny, visually weak, and inconsistent with the
 *       Heat Map tab's already-polished MONTH segmented pill + BLEND
 *       ON/OFF pill controls. Aligning Levels to the same pattern:
 *         (a) SWING 1-8 / 0 DTE pair → unified segmented pill (no
 *             internal gap, single bordered group, active = filled
 *             color background with dark text, inactive = transparent
 *             with gray text). Mirrors the Heat Map MONTH toggle.
 *         (b) PRICE LINE / DEALER Δ → label + ON/OFF pill (with
 *             colored glow when on). Mirrors the Heat Map BLEND
 *             toggle. Replaces the iOS-style mini switches that were
 *             cute but read as smaller-than-the-buttons-they-sit-next-
 *             to. Boolean state is more legible as ON/OFF text than
 *             as a tiny switch position.
 *         (c) All controls now at fontSize 9-10 with consistent gap
 *             rhythm — matches Heat Map toolbar throughout.
 *       Net effect: consistent toolbar visual language across both
 *       Levels and Heat Map tabs. Sauce tab has no controls of its
 *       own, so the alignment work is already complete.
 *
 * v40 — Levels sub-tab pass (Cards L01-L04). Same gap-pattern as the
 *       Sauce-revision pass: missing freshness pills, stale CBOE-era
 *       wording, undersized fonts, and no synthesis line on the
 *       headline card. Batched fixes:
 *         (a) FreshnessBadge added on all 4 Levels cards with the
 *             showCadence prop. Tier B for L01/L02/L03/L04 (gex /
 *             structural_integrity / volatility_gravity / gex_stack
 *             all recompute every 15 min on the producer side).
 *             L01 + L04 also pull `data.gex_flip_computed_at` /
 *             `max_pain_computed_at` / `hvl_computed_at` (the Tier D
 *             daily scalars) into the FreshnessBadge oldest-of so the
 *             stalest-input wins, matching the Sauce-tab pattern.
 *         (b) EX_SI "WHY IT MATTERS" rewritten — dropped the "A 15-
 *             minute delay doesn't matter if the structural floor was
 *             poured this morning. Concrete doesn't dry in 15 minutes."
 *             framing (stale post-ThetaData migration; the feed is
 *             real-time now). Same staleness fix we applied to Sauce
 *             EX_RT in v33.
 *         (c) Card L01 (GEX REGIME & KEY LEVELS) tile-label fonts
 *             bumped 7 → 10 (REGIME / NET GEX / FLIP LEVEL labels);
 *             body explanation fonts bumped 9 → 11. Card L04 expiry-
 *             row table-header fonts bumped 7 → 10 (EXPIRY / DEALER
 *             GEX / TOTAL); per-row label fonts bumped 9 → 11; bar-
 *             value font 8 → 10. Same readability bump pattern from
 *             Sauce Cards 01-05.
 *         (d) Card L01 gets a "what to actually do" synthesis line
 *             below the 3 tiles, crossing GEX regime × above/below-
 *             flip into a one-line trader read with explicit distance-
 *             to-flip ("price is 9.4% below flip"). Same pattern as
 *             Sauce Card 04 v33's actionLine and Card 06 v36's READ.
 *
 * v39 — Card 06 left-column compression fix (per operator screenshot
 *       2026-05-14: "bad design you compressed everything on left").
 *       v38 set the pills column to `flex: 0 0 auto` (size to content)
 *       AND used `repeat(auto-fill, 240px)` inside it — the container
 *       sized down to a single column's worth of pills, then auto-fill
 *       had no extra width to fill, so all pills stacked vertically
 *       in a single 240px column. The left looked stripped, the right
 *       looked empty.
 *       Fix: left column gets `flex: 1, min-width: 0` so it expands to
 *       fill available space (auto-fill then lays out 3-4 pills per row
 *       per section); right column gets `flex: 0 0 380px` (fixed width
 *       large enough for the READ synthesis text on 1-2 lines).
 *
 * v38 — Card 06 READ synthesis promoted to the right-side empty space
 *       (per operator screenshot annotation 2026-05-14). The auto-fill
 *       240px pill grids in v37 left ~half the card empty on the right;
 *       at the bottom the READ synthesis was rendered as a small italic
 *       footer, easy to miss. Operator drew a big "Read IV Rich + xxx →"
 *       in the empty zone — clear ask: make READ the primary read of
 *       the card, not an afterthought. Restructure:
 *         (a) Outer flex: pills column on the left (natural width via
 *             `flex: 0 0 auto`), READ box on the right (`flex: 1`,
 *             stretches to fill remaining space).
 *         (b) READ box: vertically centered, 24px padding, 18px synth
 *             body in solid white (was 11px italic in #ddd), 13px
 *             "▶ READ" label in synthCol (was 10px), 4px solid color-
 *             coded left border (was 3px). Border-on-all-sides at
 *             low-alpha synthCol so the box reads as a distinct card.
 *
 * v37 — Card 06 (IV & Sentiment Snapshot) layout polish (per operator
 *       screenshot 2026-05-14): pills were stretching the full card
 *       width because the v36 grids used `repeat(N, 1fr)` — each pill
 *       got the full available column. Two fixes:
 *         (a) Each section grid switched to `repeat(auto-fill, 240px)`.
 *             Pills are consistent ~240px wide across all sections;
 *             leftover row space stays empty (intentional — operator
 *             picked this layout in the AskUserQuestion preview).
 *         (b) `expected_move_0dte` pill (TODAY ±) now hidden entirely
 *             when DC ships `null` — most non-SPX assets (USTEC, XAU,
 *             XAG, XTI) don't have daily 0-DTE expiries, so the empty
 *             "—" pill was confusing. When em0 is present (SPX-class
 *             chains), the pill renders as before. SWING ± stays
 *             always-on as the swing range anchor.
 *
 * v36 — Sauce Block 6 (IV & Sentiment Snapshot) revision. The card was
 *       a flat 8-pill grid (no hero, no synthesis, no hierarchy) and
 *       had two semantic bugs in its color logic. Fixes:
 *         (a) Render `expected_move_0dte` — DC has been shipping this
 *             field (FreshnessBadge already references it for staleness)
 *             but the card body never showed it, so intraday traders
 *             were getting only the swing range. Now rendered next to
 *             the swing EM for the same asset.
 *         (b) Fix the "FADE is green" color inversion. Header badge had
 *             `signal.includes("FADE") ? C.green : signal.includes(
 *             "BREAKOUT") ? C.amber` — but EX_IV body says "IV Rich +
 *             High P/C = bearish institutional positioning", i.e. FADE
 *             == mean-reversion / stand-aside, NOT bullish. Now: FADE
 *             → amber (mean-reversion), BREAKOUT → cyan (momentum),
 *             else gray. Same fix on the DIVERGENCE pill (positive
 *             divergence = IV rich vs RV = expensive options = amber,
 *             negative = cheap options = cyan).
 *         (c) Section grouping: 8 flat pills → three labeled sections
 *             (IV REGIME · SENTIMENT · RANGE) so the card has visual
 *             hierarchy. IV REGIME = ATM IV / 30D RV / DIVERGENCE;
 *             SENTIMENT = P/C OI / P/C VOL; RANGE = Today's EM /
 *             Swing EM / Put Wall / Call Wall.
 *         (d) Synthesis "what to actually do" line below the pill
 *             groups, crossing IV signal × P/C OI stance into a one-
 *             liner (parallel to Card 04 v33's actionLine).
 *         (e) `showCadence` on the FreshnessBadge — Tier B = "updates
 *             every 15 min". Consistent with Cards 04 + 05.
 *       DC asks queued for the bundle: IV percentile / IV rank vs
 *       trailing 30-90d, term-structure hint (front IV vs next IV),
 *       methodology label so a mouseover can describe how divergence
 *       is computed.
 *
 * v35 — Sauce Block 5 (Market Entropy) mandatory readability + sanity
 *       pass. Card was missed in the Cards 01-04 readability bump and
 *       still had `fontSize:5/6/7` on every label. Four fixes:
 *         (a) Font bump across the card (5→9 for tile labels and
 *             ORDER/CHAOS legend, 6→10 for the ENTROPY pillar label,
 *             7→12 for the state line, 14→15 for the diagnostic tile
 *             values). Value-of-entropy is now 26 (was 30) to fit the
 *             new layout.
 *         (b) Threshold-derived color fallback. Was `data.color || gray`
 *             (server color = ground truth, even if stale). Now uses
 *             value-derived color (green<0.4, amber<0.7, red≥0.7) when
 *             DC's color is absent, matching the same thresholds the
 *             gauge bands already use. DC's color still wins when
 *             present, for back-compat.
 *         (c) Gauge restack: bar height 8→16, needle gets a small
 *             pointer-triangle on top so the position is visible at the
 *             new size, ORDER/CHAOS labels promoted from font-5 to font-9.
 *             Value-of-entropy stays above the bar (primary read) but
 *             is now visually anchored to it via tighter gap.
 *         (d) `showCadence` on the FreshnessBadge — Tier B = "updates
 *             every 15 min". Consistent with Card 04 v33.
 *       Optional add-ons (synthesis line, dummy trajectory, stacked-bar
 *       concentration viz) deferred per operator call. DC asks for this
 *       card (signal_history, scoring methodology, cross-asset entropy
 *       comparison, per-strike OI distribution) queued for the bundle.
 *
 * v34 — Sauce Block 4 (Retail Trap) verdict cleanup (per operator
 *       screenshot 2026-05-14): the DC verdict string was reading
 *       "No retail trap (v2). ..." — both pieces are noise to the user.
 *       The "(v2)" suffix is an internal schema-version stamp DC appends
 *       (presumably to disambiguate v1 vs v2 trap detection); the user
 *       doesn't care which version produced the verdict. The lowercase
 *       "trap" reads weak when the rest of the card uppercases TRAP for
 *       emphasis. Client-side display normalization (kept here, not
 *       pushed to DC) so we don't block on a DC redeploy:
 *         - strip trailing " (vN)" / " (v2)" version-stamp parens
 *         - uppercase any standalone lowercase "trap" → "TRAP"
 *       Already-uppercase "TRAP" tokens are left alone (regex is
 *       case-sensitive). Queued in memory as a DC ask: "drop the
 *       schema-version suffix from user-facing verdict strings".
 *
 * v33 — Sauce Block 4 (Retail Trap) revision (round 1):
 *       (a) EX_RT "WHY IT MATTERS" rewritten — dropped the "Turns your
 *           15-min delay into a confirmation tool" framing (stale
 *           post-ThetaData migration; the feed is real-time now).
 *       (b) `round_number_oi_concentration` tile in the CROWDING INPUTS
 *           grid relabeled NON-DIRECTIONAL (gray border + "diagnostic
 *           only · dropped from crowding sum in v2.3" sub-label) so it's
 *           clear it doesn't contribute to the directional read anymore
 *           (per DC's 1d-C fix — the mapping was biased on high-strike-
 *           count chains and was pushing crowd_score artificially long).
 *       (c) NEW: `round_number_oi_hhi` standalone block — DC's post-1d-C
 *           replacement diagnostic. Shows the value + the built-in
 *           `interpretation` text ("OI clustered at round strikes —
 *           possible retail involvement" / etc), styled as its own row
 *           between the inputs grid and the verdict callout.
 *       (d) NEW: "what to actually do" line below the DC headline,
 *           synthesizing positioning + GEX regime + iv_signal into
 *           trader-actionable advice.
 *       (e) Crowd-intensity radial gauge gets a tick mark at the 0.65
 *           CROWDED_* threshold so pros can see distance-to-trap.
 *       (f) FreshnessBadge gets `showCadence` — Tier B = 15 min.
 *
 * v32 — SkewGauge label clipping fix (per operator screenshot showing "ALL"
 *       / "OUT" instead of "CALL" / "PUT"). Two clips at once:
 *       (1) BOTTOM: SVG height was size*0.62 (≈56px @ size=90). v31 moved
 *           labels to y=cy + size*0.10 = size*0.65 — past the SVG bottom
 *           edge, so descenders/baselines were cropped by the SVG bbox.
 *       (2) SIDES: labels were centered at x=size*0.08 (CALL) / size*0.92
 *           (PUT) with textAnchor="middle". At the v31 font size,
 *           "CALL" is ~22px wide so it extended beyond the left edge of
 *           the SVG (and PUT past the right). First letters got clipped.
 *       Fix: SVG height bumped 0.62 → 0.82; label y moved to cy+size*0.16
 *           (well within the new bbox); CALL switched to textAnchor="start"
 *           anchored at x=size*0.04 (renders left-to-right inside the
 *           bbox); PUT switched to textAnchor="end" at x=size*0.96 (renders
 *           right-to-left). Labels now sit cleanly below the gauge with
 *           padding on all sides.
 *
 * v31 — Sauce Block 3 (IV Skew · cross-asset) revision (round 1):
 *       (a) HL_SKEW + EX_SKEW rewritten — was "Three speedometers across S&P,
 *           NASDAQ, and Gold" (wrong count: 5 assets now post-ThetaData,
 *           XAGUSD/XTIUSD became real). EX_SKEW HOW TO USE referenced
 *           "across all 3" — same stale-3 bug. Also added the sign
 *           convention (positive skew = puts richer = normal equity skew)
 *           and the 0-DTE near-ATM mini-skew context. Dropped one-sided
 *           "fear acceleration" framing — skew works both directions.
 *       (b) Active-asset synthesis line at the top of the card body (orange-
 *           bordered, like Cards 01/02) — translates current asset's skew
 *           level + velocity verdict + expiry_dte + 0-DTE context into one
 *           plain-English sentence.
 *       (c) STALE_PREV_SNAPSHOT verdict now handled explicitly — used to fall
 *           through to C.muted (gray, indistinguishable from STABLE);
 *           now amber with explicit "sanity gate fired" wording.
 *       (d) Per-asset `SkewAssetColumn` readability bumps (verdict badge
 *           6→9, IVBar label 6→9, IVBar value 7→10, "vol pts" subtext
 *           7→9, ticker label 8→11, color C.muted→#aaa). Added an
 *           `expiry_dte` label under the ticker name (e.g., "3DTE") since
 *           the 2.3 contract surfaces `expiry_class`/`expiry_dte` and the
 *           legacy card never displayed them.
 *       (e) Per-asset `iv_skew_0dte` mini-pill — NEW. When the field is
 *           non-null (today's expiry exists for that asset), shows the
 *           ±0.5%-moneyness 0-DTE skew underneath the main 25Δ value.
 *       (f) `SkewGauge` CALL/PUT labels bumped (0.065*size → 0.10*size,
 *           system sans-serif for crispness — same lesson as the trajectory
 *           chart fix).
 *       (g) FreshnessBadge gets `showCadence` — Tier A = 5 min.
 *       (h) Footer note explains the sign convention and the velocity
 *           caveat (soft on thin 1-DTE chains).
 *       Trajectory chart (cross-asset multi-line MiniSparkline) deferred to
 *       round 2 — operator wants to see this round first.
 *
 * v30 — MiniSparkline crispness fix — root cause of the "stretched / pixelated /
 *       not blended" look (per operator screenshot review):
 *
 *       The component was using `<svg viewBox="0 0 320 80" preserveAspectRatio="none"
 *       width="100%">`. Browser scaled the 320×80 viewBox non-uniformly to fill the
 *       parent (e.g. 800×80) → X-axis 2.5× stretch, Y-axis 1× → strokes rendered
 *       5px×2px (oblong), circles became ellipses, text became 22.5px×9px (the "fat /
 *       blurry" look since browser font hinting/anti-aliasing assumes square pixel
 *       geometry). Other SVGs in this file don't have this issue because they either
 *       use a matching aspect ratio or fixed dimensions.
 *
 *       Fix: ResizeObserver measures the actual rendered container width, that value
 *       drives both the viewBox dimension AND all internal coordinate calculations.
 *       SVG renders at native 1:1 pixel ratio — no stretching. Strokes are 2px,
 *       circles are circles, text renders at native sub-pixel-anti-aliased font
 *       quality matching the rest of the page. preserveAspectRatio dropped.
 *
 *       Uses useLayoutEffect for the initial measure (synchronous, pre-paint, no
 *       flash). Falls back to window resize listener if ResizeObserver unavailable
 *       (universal in modern Chromium / Electron — fallback is just defensive).
 *
 * v29 — Sauce Block 2 polish (round 2 per operator screenshot review):
 *       (a) MiniSparkline reworked for cleaner look — defaults flipped:
 *           bands={false}, in-chart zone labels REMOVED, replaced with
 *           a right-margin label column + dashed threshold lines at zone
 *           boundaries. Bigger current dot with subtle halo. Thicker
 *           line (2px, rounded caps). Card 01 inherits the same polish
 *           via the shared component.
 *       (b) EX_VC (the 📖/💡/🎯 education panel for Card 02) rewritten
 *           end-to-end to match post-2.3 reality. Removed: the "$200M
 *           Charm" example (wrong unit + treats charm as actionable
 *           verdict-driver), the "both arrows align = high-conviction /
 *           opposite arrows = mixed signals" advice (the SAME stale
 *           pre-2.3 framing the body just rejected). Now: vanna is the
 *           verdict, charm is supplementary, 0-DTE pin pressure is the
 *           actionable charm signal.
 *       (c) Card 02 footer made CONDITIONAL on charm_0dte presence —
 *           on commodities (no 0-DTE) it no longer references an
 *           invisible "block above".
 *       (d) Charm FlowBox muteReason expanded to "informational ·
 *           Δ/year scale, not comparable to vanna_pct" so a 1638%
 *           magnitude doesn't read as catastrophic.
 *
 * v28 — Sauce Block 2 (Vanna / Charm Pressure) revision:
 *       (a) Removed misleading "COMBINED" footer messaging — verdict is
 *           VANNA-ONLY post-2.3 (charm_in_verdict: false). Old text said
 *           "Both Vanna and Charm align — high-conviction structural bias"
 *           and "Vanna and Charm disagree — reduce position size." Both
 *           imply charm participates in the verdict; it doesn't. Folded
 *           into a new top-of-card "WHAT THIS MEANS RIGHT NOW" synthesis
 *           that translates the vanna verdict + optional 0-DTE charm pin
 *           pressure into one plain-English line.
 *       (b) Charm FlowBox visually de-emphasized (gray accent regardless
 *           of direction, "informational · not in verdict" tag in header)
 *           so the eye doesn't read it as equal-weight to Vanna.
 *       (c) Header badges trimmed: dropped redundant "VANNA: BUY" + "CHARM:
 *           NEUTRAL" badges (both info now lives in the FlowBoxes); kept
 *           the verdict badge.
 *       (d) FreshnessBadge gets showCadence → "updates every 5 min" label.
 *       (e) NEW: charm_0dte mini-block — renders when data.charm_0dte is
 *           non-null (today's expiry exists). Shows magnitude_bucket as
 *           a colored pill + direction. The actually-actionable 0-DTE
 *           pin pressure read, separated from the vanna verdict.
 *       (f) NEW: trajectory chart placeholder for vanna_pct with 5 zone
 *           bands at the verdict cutoffs ±5 / ±25 (STRONG_SELL / SELL /
 *           BALANCED / BUY / STRONG_BUY). DUMMY series; awaiting DC
 *           signal_history (queued in the bundled DC asks).
 *       (g) Readability bumps applied throughout (sub-9 fonts → 9-10,
 *           dim grays → brighter; same Card-01 treatment).
 *       (h) Footer note explaining charm is informational, not part of
 *           the verdict, with a pointer to charm_0dte for the meaningful
 *           intraday charm signal.
 *
 * v27 — Sauce Block 1 trajectory chart polish (round 5 per operator):
 *       (a) Chart height 64 → 80px (operator asked for 1.5× the original
 *           50px = 75; rounded to 80 for breathing room).
 *       (b) In-chart zone labels switched from Courier mono to a sans
 *           system font ("ui-sans-serif, …") — monospace at small sizes
 *           in SVG renders pixelated; sans-serif anti-aliases cleanly.
 *           Size reduced 10 → 9 too. Interpretation line below chart
 *           reduced 11 → 10. Open/now scale labels reduced 9 → 8.
 *
 * v26 — Sauce Block 1 trajectory chart upgrade (round 4 per operator):
 *       (a) MiniSparkline now supports a `zones` prop. Each zone defines an
 *           upper bound + a color + a label. The chart renders: subtle
 *           colored background bands per zone (~10% opacity), in-chart
 *           zone labels at the left edge, the line itself colored
 *           per-segment by the zone its destination point sits in, and the
 *           current-point dot colored by the current zone. Reference-line
 *           rendering is now optional / supplementary to the bands.
 *       (b) Card 01's trajectory uses zones { ≤0.7 green/UPSIDE-SPRING,
 *           0.7-1.3 gray/NEUTRAL, >1.3 red/DOWNSIDE-SPRING } — colors match
 *           the green/red/gray semantic the rest of the card uses.
 *       (c) Added a small interpretation line below the chart that reads
 *           the LAST point of the series and tells the user what zone
 *           they're in, in plain English ("Currently NEUTRAL — symmetric
 *           dealer response.") — answers the "what do I read from this?"
 *           question directly.
 *       (d) Chart bumped 50px → 64px tall to fit the in-chart zone labels.
 *
 * v25 — Sauce Block 1 session-trajectory placeholder (round 3 per operator):
 *       (a) Added a small reusable `MiniSparkline` helper at file scope —
 *           SVG sparkline with optional reference lines + a highlighted
 *           current-point dot. Will be reused for trajectory placeholders
 *           on Cards 02–06 as we revise each.
 *       (b) Card 01 grew a "SESSION TRAJECTORY — ASYMMETRY RATIO" placeholder
 *           graph between the tornado bar and the ±1% scenarios. Rendered
 *           with a DUMMY 40-point series + reference lines at 0.7 / 1.0 /
 *           1.3 (the spring_direction thresholds). Header carries an explicit
 *           "preview · awaiting DC signal_history" italic label so it's
 *           clear it's not real data. Will populate from DC's eventual
 *           /api/options/{ticker}/history?lookback_h=N endpoint (queued in
 *           the bundled DC asks for the sauce-revision pass).
 *
 * v24 — Sauce Block 1 readability + cadence label (round 2 per operator review):
 *       (a) Bumped all sub-9px fonts to 9-12px in DealerHomeworkCard (synthesis
 *           body, tornado-bar labels, ScenarioBox labels + blurbs, ±0.5% box
 *           labels, footer note). Replaced C.muted (#444 — barely visible
 *           against the dark background) with brighter values: #fff for
 *           primary mono, #bbb for secondary labels, #777 for footnote.
 *       (b) Card 01's FreshnessBadge now passes showCadence={true} so the
 *           header reads "<age pill> · updates every 5 min" instead of just
 *           the age. FreshnessBadge.jsx v1→v2 added the showCadence prop +
 *           TIER_CADENCE map (A=5 min, B=15 min, C=30 min, D=daily).
 *
 * v23 — Sauce Block 1 (Dealer's Homework) revision (round 1):
 *       (a) Top "WHAT THIS MEANS RIGHT NOW" synthesis line — combines the
 *           amplify/dampen regime with the spring_direction interpretation
 *           into a single beginner-readable sentence pinned at the top of
 *           the card. Old asymmetry footer block at the bottom removed
 *           (its content is folded into the top synthesis).
 *       (b) Tornado bar — relative-magnitude visualization of forced_flow
 *           at ±1%, side-by-side with a center axis, so the asymmetry is
 *           visible at a glance instead of mentally subtracting two boxes.
 *       (c) `$` prefix dropped from forced_flow value labels — per DC's
 *           methodology #68, forced_flow is share-equivalent dealer-delta
 *           exposure (×100 contract multiplier already applied), NOT
 *           $-notional. Old display "$42M" was misleading. Now: "42M",
 *           with a small footer note explaining the unit.
 *
 * v22 — fmtB now switches to M-suffix display when |v| < 0.5B instead of
 *       collapsing sub-billion values to "+0.00B". Sign prefix preserved
 *       in both branches for visual consistency. Fixes the "shows zero"
 *       glitch for vanna_net / charm_net / forced_flow / gex values that
 *       sit below ~5e8 in absolute magnitude.
 *
 * v21 — Per-card freshness badges on the SauceView reading format_version 2.4's
 *       per-block computed_at fields. Uses new shared/FreshnessBadge component
 *       (color-coded green/amber/red against DC tier thresholds A/B/C/D).
 *       SauceCard grows a `freshnessBadge` prop rendered after the status badges.
 *       Card 06 (IV & Sentiment Snapshot) uses oldestComputedAt() over its four
 *       constituent blocks (iv_divergence, pc_ratio, expected_move, expected_move_0dte).
 *       All reads use the 2.4 top-level-wins / sauce-alias-fallback pattern.
 *
 * v20 — Stability fixes for the "stuck at fetching, must restart browser"
 *       symptom users hit when switching assets/tabs. Three real bugs in the
 *       main options fetch:
 *         (a) No cancellation on asset/tab change — stale fetch's setState
 *             after new fetch started, racing `loading` flag.
 *         (b) No request timeout — a hung backend left the UI loading
 *             forever because finally{setLoading(false)} never ran.
 *         (c) Polling interval could stack overlapping requests when the
 *             backend was slow, thrashing state.
 *       Fix bundle:
 *         - AbortController per fetch, aborted in effect cleanup.
 *         - 15s timeout via setTimeout(abort).
 *         - `cancelled` flag guarding every setState after await.
 *         - `inFlightRef` so the polling interval skips a tick while a
 *           previous fetch is still running.
 *       Other fetchers (heatmap bars, prob field, dealer cones) already used
 *       the `cancelled` pattern — this aligns the main fetch with them.
 *
 * v19 — Heatmap feature pack:
 *       (a) PREVIOUS MONTH candles switched from producer daily (realized_ohlc)
 *           to live H1 bars fetched in HeatMapView. Current month still uses
 *           M30 live; both routed through utils/barsCache for session reuse.
 *       (b) CONTOUR toggle on ProbabilityMatrix — draws thin isolines wherever
 *           adjacent cells fall in different intensity bins (5 bins at 20%
 *           steps of globalMax). Toolbar button next to REFRESH; default off.
 *       (c) Heatmap-only fullscreen — when the HEATMAP tab is fullscreen, the
 *           panel header, asset bar, and tab row hide so only the heatmap +
 *           its floating controls remain. Esc or the floating EXIT button
 *           drops out. Other tabs' fullscreen behavior unchanged.
 *
 * v2 (file-version, unrelated to engine "v3" above): heatmap section now
 *      listens for the mk:data-sync-complete DOM event and calls refreshBars()
 *      so the heatmap cones refetch when the cache updates (periodic sync,
 *      cache watcher, refresh button) without needing a browser reload.
 *
 * v3 (file-version): heatmap cones handler now calls setConesData(null) when
 *      the endpoint returns 404/empty, so overlays clear live when the cache
 *      file is deleted.
 *
 * v6 (file-version): options-quant universe extended to include XTIUSD (WTI
 *      crude, underlying ETF USO) and XAGUSD (silver, underlying ETF SLV),
 *      matching the Data Center's expanded options coverage.
 *
 * v7 (file-version): probability-matrix heatmap polish.
 *      - shapeRendering "optimizeSpeed" → "geometricPrecision" on cells for
 *        anti-aliased, high-res look instead of blocky sharp edges.
 *      - Cell overlap bumped 1.2px → 2.0px to kill the thin black seams that
 *        appeared between columns/rows at high zoom.
 *      - Subtle CSS pulse (opacity 0.88→1.0→0.88, 6s ease-in-out infinite)
 *        on the heatmap group for a living-system feel. GPU-composited, so
 *        no per-cell render cost.
 *
 * v8 (file-version): crank the heatmap liveliness.
 *      - Pulse amplitude: 0.88→1.00 → now 0.72→1.05 (much more visible breath).
 *      - Cycle: 6s → 4.2s (faster heartbeat).
 *      - Added combined brightness+saturation oscillation (0.9→1.18), so
 *        hot cells genuinely glow on each beat instead of just fading.
 *      - Cell overlap 2.0 → 3.0 px, sealing any residual zoom seams.
 *      - Outer CSS animation group wraps the inner SVG-filter group so
 *        gaussian blur + mask + CSS filter can coexist without overriding
 *        each other.
 *
 * v9 (file-version): replace the global heartbeat with localized, randomized
 *      hotspot pulsing.
 *      - Only cells above a heat threshold (top ~30% of globalMax) get the
 *        animation — typically 500-2000 cells instead of 8,800.
 *      - Each hot cell gets a deterministic but pseudo-random
 *        animation-delay (0-5s span) and duration (3.5-6s span) computed
 *        from its (day, price) index, so neighboring hot zones pulse at
 *        different phases — creates a living "spreading embers" feel rather
 *        than a single global breath.
 *      - Baseline very faint global pulse kept (0.95-1.00, 8s) so the rest
 *        of the field isn't completely static.
 *
 * v14 — Options page polish:
 *       - CFD prices ON by default (was OFF).
 *       - Pills enlarged + each now carries a plain-English explainer line
 *         under the value so non-experts know what it means.
 *       - Pill widget grew a larger label/sub font stack.
 *
 * v13 — RetailTrapCard UI polish for end users:
 *       - Removed the "v2" methodology badge (internal-only).
 *       - Replaced CROWDED_LONG / CROWDED_SHORT / NEUTRAL technical labels
 *         with consumer language: RETAIL LONG / RETAIL SHORT / BALANCED.
 *       - Gauge now has an explicit title ("CROWD INTENSITY") so users
 *         know what 0..100 represents.
 *
 * v12 — RetailTrapCard readability pass. Every grey label bumped from
 *       muted(#444) 6px → gray(#999) 8-10px with tighter letter-spacing.
 *       Same visual hierarchy, much easier to read at normal zoom.
 *
 * v11 — RetailTrapCard rebuilt for retail-v2 schema. Surfaces:
 *       - Massive STATUS hero (TRAP_ACTIVE pulses red; CLEAR settles green).
 *       - Three-pillar grid (POSITIONING / DEALERS / VOLATILITY) with the
 *         actual driver values that fire the v2 trap rule.
 *       - Crowding score radial gauge (0..1, color-tiered).
 *       - 8-input diagnostic grid with friendly labels + raw values.
 *       - Confidence pill, price-extreme tag, methodology badge.
 *       - Verdict text below in a thick callout.
 *       Falls back gracefully on v1-only data.
 *
 * v10 — Pulse removed entirely (was making the page heavy and glitchy).
 *       Cells render static. Anti-aliased shapeRendering and cell-overlap
 *       improvements from v7 are kept.
 *
 * v5 (file-version): fix ReferenceError — the probfield effect was depending
 *      on barsRefreshTick which is scoped to the nested HeatMapView component,
 *      not OptionsPanel. Added probSyncTick at OptionsPanel scope with its
 *      own mk:data-sync-complete listener.
 *
 * v4 (file-version): probfield effect is now null-safe and sync-aware.
 *      - 404/empty response clears setProbFieldData(null) instead of leaving
 *        stale state, so deleting the cache file clears the heatmap live.
 *      - Depends on barsRefreshTick, which is bumped by the existing
 *        mk:data-sync-complete listener → cache watcher / periodic sync /
 *        refresh-button all refresh the probfield without waiting 15 min.
 *      - Reset-on-null moved to a dedicated effect so inter-refresh refetches
 *        don't flicker the heatmap.
 *
 * Custom SVG GEX chart — no recharts, no glitches:
 *   · Vertical price axis (strikes on Y) — reads like a trading ladder
 *   · Spot price box on Y axis (labeled, follows price)
 *   · Click-drag to pan the strike range
 *   · Scroll wheel to zoom in/out
 *   · Hide/show each level line independently
 *   · Expiry calendar dropdown (all CBOE expiries)
 *   · Price history line chart (broker bars, 15-min candles)
 *   · Live broker price toggle (fetches from /api/ticks)
 *   · GEX 0DTE / Swing 1-8 toggle
 *   · CFD price conversion
 *   · Full-screen mode
 *   · Probability Field heatmap (unified MC + anchors + OU + GEX + dealer)
 */

import React, {
  useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo,
} from "react";
import { fetchBarsCached } from "../utils/barsCache";   // v19: session bar cache
import FreshnessBadge, { oldestComputedAt } from "./shared/FreshnessBadge"; // v21: per-block computed_at badges (2.4)
import CalibratingBadge from "./shared/CalibratingBadge";                    // v48: ⚠ CALIBRATING tags on provisional blocks
import {                                                                     // v45: 0-DTE composites derived consumer-side
  deriveStructuralIntegrity0dte,
  deriveVolatilityGravity0dte,
} from "../lib/options_0dte_derivations";

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:"#000",bgPanel:"#0a0a0a",bgCard:"#0d0d0d",
  border:"#1e1e1e",borderLt:"#2a2a2a",
  white:"#fff",gray:"#777",muted:"#444",
  orange:"#ff6d00",green:"#00c853",red:"#f44336",
  cyan:"#00d4ff",yellow:"#ffd600",amber:"#ffab00",purple:"#b47aff",
};
const mono = "'Courier New',Consolas,monospace";

// ── Constants ─────────────────────────────────────────────────────────────────
const ASSETS       = ["US500","USTEC","XAUUSD","XAGUSD","XTIUSD"];
const ASSET_LABEL  = {US500:"S&P 500",USTEC:"NASDAQ 100",XAUUSD:"GOLD",XAGUSD:"SILVER",XTIUSD:"WTI CRUDE"};
const CBOE_TICKER  = {US500:"SPY",USTEC:"QQQ",XAUUSD:"GLD",XAGUSD:"SLV",XTIUSD:"USO"};
const GEX_COLORS   = ["#00d4ff","#ff6d00","#00c853","#ffd600",
                       "#b47aff","#f44336","#00bcd4","#ff9800"];
const POLL_MS      = 15 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt2 = v => v != null ? Number(v).toFixed(2) : "—";
const fmtM = v => v != null ? `${(v/1e6).toFixed(1)}M` : "—";
// v22: fall back to M-suffix when |v| < 0.5B so we don't show "+0.00B" for
// sub-billion values (vanna_net / charm_net / forced_flow / small GEX).
const fmtB = v => {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  if (Math.abs(v) < 5e8) return `${sign}${(v/1e6).toFixed(1)}M`;
  return `${sign}${(v/1e9).toFixed(2)}B`;
};
const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi, v));

// ── Sub-components ─────────────────────────────────────────────────────────────

// v14: larger, more readable pill + explainer line under each value.
function Pill({ label, value, color, sub, explain }) {
  return (
    <div style={{padding:"7px 12px",background:C.bgCard,
      border:`1px solid ${C.border}`,flex:1,minWidth:110,flexShrink:0}}>
      <div style={{fontSize:9,color:C.gray,fontFamily:mono,
        letterSpacing:"1px",marginBottom:3,fontWeight:700}}>{label}</div>
      <div style={{fontSize:14,fontWeight:800,color:color||C.white,fontFamily:mono,lineHeight:1.1}}>
        {value}
      </div>
      {sub && <div style={{fontSize:9,color:C.gray,marginTop:3,fontFamily:mono}}>{sub}</div>}
      {explain && <div style={{fontSize:8,color:"#777",marginTop:3,fontStyle:"italic",
        lineHeight:1.35}}>{explain}</div>}
    </div>
  );
}

function Btn({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background:active?`${color||C.cyan}18`:"transparent",
      border:`1px solid ${active?color||C.cyan:C.border}`,
      color:active?color||C.cyan:C.muted,
      padding:"2px 7px",fontSize:7,fontFamily:mono,
      cursor:"pointer",fontWeight:active?700:400,
    }}>{label}</button>
  );
}

function Toggle({ label, on, onChange, color }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}
      onClick={onChange}>
      <div style={{width:26,height:14,borderRadius:7,
        background:on?(color||C.cyan):C.muted,position:"relative",transition:"background .2s"}}>
        <div style={{width:10,height:10,borderRadius:5,background:C.white,
          position:"absolute",top:2,left:on?14:2,transition:"left .2s"}}/>
      </div>
      <span style={{fontSize:7,color:on?(color||C.cyan):C.muted,fontFamily:mono}}>{label}</span>
    </div>
  );
}

// ── Expiry Calendar Dropdown ───────────────────────────────────────────────────
function ExpiryPicker({ expiries, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const today = new Date().toISOString().slice(0,10);
  const dte = selected ? Math.round((new Date(selected)-new Date(today))/(86400000)) : null;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={() => setOpen(o=>!o)} style={{
        background:C.bgCard,border:`1px solid ${open?C.orange:C.border}`,
        color:C.orange,padding:"3px 10px",fontSize:7,fontFamily:mono,
        cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
        <span>📅</span>
        <span>{selected||"NEAREST"}</span>
        {dte!=null && <span style={{color:C.muted,fontSize:6}}>({dte}d)</span>}
        <span style={{color:C.muted,fontSize:8}}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{position:"absolute",top:"100%",left:0,zIndex:200,
          background:C.bgPanel,border:`1px solid ${C.border}`,
          maxHeight:240,overflowY:"auto",minWidth:160,marginTop:2}}>
          <div onClick={() => { onChange(null); setOpen(false); }}
            style={{padding:"6px 10px",fontSize:7,color:C.cyan,fontFamily:mono,
              cursor:"pointer",borderBottom:`1px solid ${C.border}`,
              background:"transparent"}}
            onMouseEnter={e=>e.target.style.background=C.bgCard}
            onMouseLeave={e=>e.target.style.background="transparent"}>
            NEAREST (auto)
          </div>
          {expiries.map(exp => {
            const d = Math.round((new Date(exp)-new Date(today))/86400000);
            const isToday = exp === today;
            return (
              <div key={exp} onClick={() => { onChange(exp); setOpen(false); }}
                style={{padding:"5px 10px",fontSize:7,
                  color:exp===selected?C.orange:isToday?C.yellow:C.white,
                  background:exp===selected?`${C.orange}15`:"transparent",
                  fontFamily:mono,cursor:"pointer",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}
                onMouseEnter={e=>e.target.style.background=C.bgCard}
                onMouseLeave={e=>e.target.style.background=exp===selected?`${C.orange}15`:"transparent"}>
                <span>{exp}{isToday?" (0DTE)":""}</span>
                <span style={{color:C.muted,fontSize:6}}>{d}d</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Custom SVG GEX Chart ──────────────────────────────────────────────────────
function GexChart({
  data, layers, spot, cfdRatio, cfdMode,
  refLines, priceBars=[], livePrice=null, showPrice=true,
  priceNormRatio=null,
  range: externalRange=null,
  onRangeChange=null,
  W=900, H=500,  // overridden by container measurement below
}) {
  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const drag         = useRef(null);
  const [hoverPos, setHoverPos] = useState(null);  // {x, y} in SVG coords
  const [measuredH, setMeasuredH] = useState(H);
  const [measuredW, setMeasuredW] = useState(W);
  const lastSizeGex = useRef({ w: W, h: H });

  // Measure container — threshold prevents resize oscillation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const w = Math.floor(width), h = Math.floor(height);
      if (w > 100 && h > 100 &&
          (Math.abs(w - lastSizeGex.current.w) > 3 ||
           Math.abs(h - lastSizeGex.current.h) > 3)) {
        lastSizeGex.current = { w, h };
        setMeasuredW(w);
        setMeasuredH(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const actualW = measuredW;
  const actualH = measuredH;

  // Strike range — use external if provided, otherwise local
  const initRange = useMemo(() => {
    if (!spot) return [0,1000];
    return [spot * 0.88, spot * 1.12];
  }, [spot]);

  const [localRange, setLocalRange] = useState(initRange);
  useEffect(() => { setLocalRange(initRange); }, [initRange]);
  const prevExternal = useRef(null);
  useEffect(() => {
    if (externalRange &&
        externalRange !== prevExternal.current &&
        (prevExternal.current === null)) {
      setLocalRange(externalRange);
      prevExternal.current = externalRange;
    }
  }, [externalRange]);

  const range = externalRange || localRange;
  const setRange = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(range) : updater;
    setLocalRange(next);
    onRangeChange?.(next);
  }, [range, onRangeChange]);

  // Layout constants
  const PAD = { top:20, right:80, bottom:30, left:72 };
  const chartH = actualH - PAD.top  - PAD.bottom;
  const chartW = actualW - PAD.left - PAD.right;

  const strikeToY = useCallback((s) => {
    const [lo, hi] = range;
    if (hi === lo) return chartH / 2;
    return PAD.top + chartH - ((s - lo) / (hi - lo)) * chartH;
  }, [range, chartH, PAD.top]);

  const allGex = useMemo(() => {
    if (!data?.length) return [-1e6, 1e6];
    let mn = 0, mx = 0;
    data.forEach(row => {
      layers.forEach(l => {
        const v = row[l.label] || 0;
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      });
    });
    const abs = Math.max(Math.abs(mn), Math.abs(mx), 1);
    return [-abs, abs];
  }, [data, layers]);

  const gexToX = useCallback((v) => {
    const [gmin, gmax] = allGex;
    return PAD.left + ((v - gmin) / (gmax - gmin)) * chartW;
  }, [allGex, chartW, PAD.left]);

  const zeroX = gexToX(0);

  const visRows = useMemo(() => {
    if (!data?.length) return [];
    return data.filter(r => r.strike >= range[0] && r.strike <= range[1]);
  }, [data, range]);

  const barH = useMemo(() => {
    if (visRows.length < 2) return 8;
    const strikes = [...new Set(visRows.map(r=>r.strike))].sort((a,b)=>a-b);
    if (strikes.length < 2) return 8;
    return Math.max(2, strikeToY(strikes[0]) - strikeToY(strikes[1]) - 1);
  }, [visRows, strikeToY]);

  const yTicks = useMemo(() => {
    const [lo, hi] = range;
    const span = hi - lo;
    const step = span > 200 ? 50 : span > 50 ? 10 : span > 20 ? 5 : 1;
    const first = Math.ceil(lo / step) * step;
    const ticks = [];
    for (let s = first; s <= hi; s += step) ticks.push(Math.round(s * 100) / 100);
    return ticks;
  }, [range]);

  const xTicks = useMemo(() => {
    const [gmin, gmax] = allGex;
    const abs = Math.max(Math.abs(gmin), Math.abs(gmax), 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(abs)));
    const step = magnitude * (abs / magnitude > 5 ? 2 : 1);
    const ticks = [];
    for (let v = -abs; v <= abs + step*0.01; v += step) ticks.push(Math.round(v));
    return ticks;
  }, [allGex]);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startRange: range };
  }, [range]);

  const onMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const scaleX = actualW / (rect.width || actualW);
      const scaleY = actualH / (rect.height || actualH);
      const sx = (e.clientX - rect.left) * scaleX;
      const sy = (e.clientY - rect.top)  * scaleY;
      if (sx >= PAD.left && sx <= PAD.left + chartW &&
          sy >= PAD.top  && sy <= PAD.top  + chartH) {
        setHoverPos({ x: sx, y: sy });
      } else {
        setHoverPos(null);
      }
    }
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    const [lo, hi] = drag.current.startRange;
    const span = hi - lo;
    const delta = (dy / chartH) * span;
    setRange([lo + delta, hi + delta]);
  }, [chartH, actualW, actualH, PAD.left, PAD.top, chartW]);

  const onMouseUp    = useCallback(() => { drag.current = null; }, []);
  const onMouseLeaveGex = useCallback(() => { drag.current = null; setHoverPos(null); }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.93;
    setRange(([lo, hi]) => {
      const mid = (lo + hi) / 2;
      const half = (hi - lo) / 2 * factor;
      return [mid - half, mid + half];
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const dp = useCallback((v) => {
    if (!cfdMode) return Number(v).toFixed(2);
    const converted = v * cfdRatio;
    return converted > 1000 ? Math.round(converted).toString() : converted.toFixed(1);
  }, [cfdMode, cfdRatio]);

  const spotY = spot ? strikeToY(spot) : null;

  return (
    <div ref={containerRef} style={{flex:1,position:"relative",overflow:"hidden",width:"100%",height:"100%"}}>
    <svg
      ref={svgRef}
      width="100%" height="100%"
      viewBox={`0 0 ${actualW} ${actualH}`}
      preserveAspectRatio="none"
      style={{display:"block",cursor:drag.current?"grabbing":"crosshair",userSelect:"none"}}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeaveGex}
    >
      <rect x={0} y={0} width={actualW} height={actualH} fill={C.bg}/>
      <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
        fill="#030303" stroke={C.border} strokeWidth={1}/>

      {yTicks.map(s => {
        const y = strikeToY(s);
        return (
          <line key={s} x1={PAD.left} y1={y} x2={PAD.left+chartW} y2={y}
            stroke={C.border} strokeWidth={0.5} opacity={0.6}/>
        );
      })}

      {xTicks.map(v => {
        const x = gexToX(v);
        return (
          <line key={v} x1={x} y1={PAD.top} x2={x} y2={PAD.top+chartH}
            stroke={C.border} strokeWidth={0.5} opacity={0.6}/>
        );
      })}

      <line x1={zeroX} y1={PAD.top} x2={zeroX} y2={PAD.top+chartH}
        stroke={C.borderLt} strokeWidth={1.5}/>

      {visRows.map((row, ri) => {
        const y = strikeToY(row.strike) - barH / 2;
        let xOff = zeroX;
        return (
          <g key={row.strike}>
            {layers.map((l, li) => {
              const v = row[l.label] || 0;
              const barX = v >= 0 ? zeroX : gexToX(v);
              const barW = Math.abs(gexToX(v) - zeroX);
              xOff += (gexToX(v) - zeroX);
              return (
                <rect key={li}
                  x={clamp(barX, PAD.left, PAD.left+chartW)}
                  y={clamp(y, PAD.top, PAD.top+chartH)}
                  width={clamp(barW, 0, chartW)}
                  height={Math.max(barH - 1, 1)}
                  fill={GEX_COLORS[li % GEX_COLORS.length]}
                  opacity={0.75}
                />
              );
            })}
          </g>
        );
      })}

      {refLines.map((rl, i) => {
        const y = strikeToY(rl.value);
        if (y < PAD.top - 2 || y > PAD.top + chartH + 2) return null;
        const dashArray = rl.dash || "4 3";
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={PAD.left+chartW} y2={y}
              stroke={rl.color} strokeWidth={1.2}
              strokeDasharray={dashArray} opacity={0.9}/>
            <rect x={PAD.left+chartW+2} y={y-8} width={74} height={16}
              fill={`${rl.color}22`} rx={2}/>
            <text x={PAD.left+chartW+6} y={y+4}
              fill={rl.color} fontSize={7} fontFamily={mono}>{rl.label}</text>
          </g>
        );
      })}

      {spotY != null && spotY >= PAD.top && spotY <= PAD.top+chartH && (
        <g>
          <line x1={PAD.left} y1={spotY} x2={PAD.left+chartW} y2={spotY}
            stroke={C.cyan} strokeWidth={1.5} opacity={1}/>
          <rect x={2} y={spotY-9} width={PAD.left-4} height={18}
            fill={C.cyan} rx={3}/>
          <text x={PAD.left/2} y={spotY+4} textAnchor="middle"
            fill={C.bg} fontSize={8} fontWeight={700} fontFamily={mono}>
            {dp(spot)}
          </text>
        </g>
      )}

      {yTicks.map(s => {
        const y = strikeToY(s);
        const isNearSpot = spot && Math.abs(s - spot) < (range[1]-range[0]) * 0.02;
        if (isNearSpot) return null;
        return (
          <text key={s} x={PAD.left - 4} y={y + 3} textAnchor="end"
            fill={C.muted} fontSize={7} fontFamily={mono}>
            {dp(s)}
          </text>
        );
      })}

      {xTicks.map(v => {
        const x = gexToX(v);
        return (
          <text key={v} x={x} y={PAD.top+chartH+14} textAnchor="middle"
            fill={C.muted} fontSize={7} fontFamily={mono}>
            {fmtM(v)}
          </text>
        );
      })}

      <text x={PAD.left/2} y={PAD.top+chartH/2} textAnchor="middle"
        fill={C.muted} fontSize={8} fontFamily={mono}
        transform={`rotate(-90,${PAD.left/2},${PAD.top+chartH/2})`}>
        {cfdMode ? "CFD PRICE" : "STRIKE"}
      </text>
      <text x={PAD.left + chartW * 0.25} y={actualH-2} textAnchor="middle"
        fill={C.muted} fontSize={7} fontFamily={mono}>
        GAMMA EXPOSURE (GEX)
      </text>
      {showPrice && priceBars.length > 1 && (() => {
        const times = priceBars.map(b => b.time || b.datetime || null).filter(Boolean);
        if (times.length < 2) return null;
        const n = priceBars.length;
        const toX = i => PAD.left + (i / Math.max(n - 1, 1)) * chartW;
        const step = Math.max(1, Math.floor(n / 6));
        const tickIdxs = [];
        for (let i = 0; i < n; i += step) tickIdxs.push(i);
        tickIdxs.push(n - 1);
        return (
          <g>
            <text x={PAD.left + chartW * 0.75} y={actualH-2} textAnchor="middle"
              fill={C.cyan} fontSize={7} fontFamily={mono} opacity={0.6}>
              ← TIME (M15) →
            </text>
            {tickIdxs.map(i => {
              const t = times[Math.min(i, times.length - 1)];
              if (!t) return null;
              try {
                const d = new Date(t);
                const label = `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
                const x = toX(i);
                return (
                  <g key={i}>
                    <line x1={x} y1={PAD.top + chartH} x2={x} y2={PAD.top + chartH + 4}
                      stroke={C.cyan} strokeWidth={1} opacity={0.4}/>
                    <text x={x} y={PAD.top + chartH + 14} textAnchor="middle"
                      fill={C.cyan} fontSize={6} fontFamily={mono} opacity={0.6}>
                      {label}
                    </text>
                  </g>
                );
              } catch(e) { return null; }
            })}
          </g>
        );
      })()}

      {showPrice && priceBars.length > 1 && priceNormRatio && (() => {
        const toEtf  = p => p / priceNormRatio;
        const n      = priceBars.length;
        const toX    = i => PAD.left + (i / Math.max(n - 1, 1)) * chartW;
        const toY    = p => strikeToY(toEtf(p));
        const [lo, hi] = range;
        const spacing = chartW / Math.max(n, 1);
        const cW      = Math.max(1, Math.min(spacing * 0.7, 10));
        const halfW   = cW / 2;

        const sessionMarkers = [];
        priceBars.forEach((b, i) => {
          if (i === 0) return;
          const t = b.time || b.datetime;
          const tp = priceBars[i-1].time || priceBars[i-1].datetime;
          if (!t || !tp) return;
          try {
            const d = new Date(t); const pd = new Date(tp);
            const h = d.getUTCHours(); const ph = pd.getUTCHours();
            const m = d.getUTCMinutes();
            if ((ph < 13 || (ph === 13 && pd.getUTCMinutes() < 30)) && (h > 13 || (h === 13 && m >= 30)))
              sessionMarkers.push({ x: toX(i), label: "RTH", color: C.orange });
            if (ph < 22 && h >= 22)
              sessionMarkers.push({ x: toX(i), label: "ETH", color: C.muted });
          } catch(e) {}
        });

        const candles = priceBars.map((b, i) => {
          const o = b.open  || b.Open  || 0;
          const h = b.high  || b.High  || 0;
          const l = b.low   || b.Low   || 0;
          const c = b.close || b.Close || 0;
          if (!o || !c) return null;
          const oEtf = toEtf(o), hEtf = toEtf(h), lEtf = toEtf(l), cEtf = toEtf(c);
          if (Math.max(oEtf, cEtf) < lo * 0.97 || Math.min(oEtf, cEtf) > hi * 1.03) return null;
          const bullish  = c >= o;
          const cx       = toX(i);
          const bodyTop  = toY(Math.max(o, c));
          const bodyBot  = toY(Math.min(o, c));
          const bodyH    = Math.max(bodyBot - bodyTop, 1);
          const wickTop  = toY(h);
          const wickBot  = toY(l);
          return { cx, bodyTop, bodyBot, bodyH, wickTop, wickBot, bullish, i };
        }).filter(Boolean);

        const livePtEtf = livePrice ? toEtf(livePrice) : null;
        const liveInRange = livePtEtf && livePtEtf >= lo && livePtEtf <= hi;
        const lastC = candles[candles.length - 1];

        return (
          <g>
            {sessionMarkers.map((m, i) => (
              <g key={i}>
                <line x1={m.x} y1={PAD.top} x2={m.x} y2={PAD.top + chartH}
                  stroke={m.color} strokeWidth={0.8} strokeDasharray="2 4" opacity={0.45}/>
                <text x={m.x + 2} y={PAD.top + 22}
                  fill={m.color} fontSize={6} fontFamily={mono} opacity={0.7}>{m.label}</text>
              </g>
            ))}
            {candles.map(cd => (
              <g key={cd.i}>
                <line x1={cd.cx} y1={cd.wickTop} x2={cd.cx} y2={cd.wickBot}
                  stroke={C.white} strokeWidth={0.8} opacity={0.7}/>
                {cd.bullish ? (
                  <rect x={cd.cx - halfW} y={cd.bodyTop} width={cW} height={cd.bodyH}
                    fill={C.white} opacity={0.85}/>
                ) : (
                  <rect x={cd.cx - halfW} y={cd.bodyTop} width={cW} height={cd.bodyH}
                    fill="transparent" stroke={C.white} strokeWidth={0.8} opacity={0.75}/>
                )}
              </g>
            ))}
            {liveInRange && lastC && (
              <circle cx={lastC.cx} cy={toY(livePrice)} r={3.5} fill={C.green} opacity={0.95}/>
            )}
            <text x={PAD.left + 4} y={PAD.top + 12}
              fill={C.white} fontSize={7} fontFamily={mono} opacity={0.45}>M15</text>
            {lastC && (
              <text x={lastC.cx + 6} y={lastC.bodyTop - 2}
                fill={C.white} fontSize={6} fontFamily={mono} opacity={0.7}>
                {dp(priceBars[lastC.i].close || priceBars[lastC.i].Close || 0)}
              </text>
            )}
          </g>
        );
      })()}

      {hoverPos && (() => {
        const hoverPrice = range[0] + (1 - (hoverPos.y - PAD.top) / chartH) * (range[1] - range[0]);
        const [gmin, gmax] = allGex;
        const hoverGex = gmin + ((hoverPos.x - PAD.left) / chartW) * (gmax - gmin);
        return (
          <g pointerEvents="none">
            <line x1={PAD.left} y1={hoverPos.y} x2={PAD.left+chartW} y2={hoverPos.y}
              stroke="#fff" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5}/>
            <line x1={hoverPos.x} y1={PAD.top} x2={hoverPos.x} y2={PAD.top+chartH}
              stroke="#fff" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.4}/>
            <rect x={2} y={hoverPos.y-9} width={PAD.left-4} height={18}
              fill="#333" stroke="#555" strokeWidth={0.5} rx={2}/>
            <text x={PAD.left/2} y={hoverPos.y+4} textAnchor="middle"
              fill="#fff" fontSize={7} fontWeight={700} fontFamily={mono}>
              {dp(hoverPrice)}
            </text>
            <rect x={hoverPos.x - 28} y={PAD.top+chartH+1} width={56} height={14}
              fill="#333" stroke="#555" strokeWidth={0.5} rx={2}/>
            <text x={hoverPos.x} y={PAD.top+chartH+11} textAnchor="middle"
              fill="#fff" fontSize={7} fontWeight={700} fontFamily={mono}>
              {fmtM(hoverGex)}
            </text>
          </g>
        );
      })()}
    </svg>
    </div>
  );
}

// ── Price Line Chart (broker bars) ────────────────────────────────────────────
function PriceChart({ asset, livePrice, W=800, H=120 }) {
  const [bars, setBars]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/bars/${asset}?timeframe=M15&n=50`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        const arr = Array.isArray(d) ? d : (d?.bars || d?.data || []);
        setBars(arr.slice(-50));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asset]);

  const PAD = { top:8, right:10, bottom:20, left:60 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  const prices = useMemo(() => {
    const arr = bars.map(b => b.close || b.Close || 0).filter(v => v > 0);
    if (livePrice) arr.push(livePrice);
    return arr;
  }, [bars, livePrice]);

  const minP = prices.length ? Math.min(...prices) * 0.9995 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.0005 : 1;
  const toX = (i) => PAD.left + (i / Math.max(prices.length - 1, 1)) * cW;
  const toY = (p) => PAD.top + cH - ((p - minP) / (maxP - minP || 1)) * cH;
  const pathD = prices.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p).toFixed(1)}`
  ).join(" ");

  if (loading) return (
    <div style={{height:H,display:"flex",alignItems:"center",
      justifyContent:"center",fontSize:8,color:C.muted}}>Loading price history…</div>
  );

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
      <rect x={0} y={0} width={W} height={H} fill={C.bg}/>
      <rect x={PAD.left} y={PAD.top} width={cW} height={cH}
        fill="#030303" stroke={C.border} strokeWidth={1}/>
      {prices.length > 1 && (
        <path d={pathD} fill="none" stroke={C.cyan} strokeWidth={1.5} opacity={0.9}/>
      )}
      {livePrice && prices.length > 0 && (
        <circle cx={toX(prices.length-1)} cy={toY(livePrice)} r={4} fill={C.green} opacity={0.9}/>
      )}
      {[minP, (minP+maxP)/2, maxP].map((p,i) => (
        <text key={i} x={PAD.left-3} y={toY(p)+3} textAnchor="end"
          fill={C.muted} fontSize={6} fontFamily={mono}>{p.toFixed(2)}</text>
      ))}
      <text x={PAD.left+4} y={14} fill={C.muted} fontSize={6} fontFamily={mono}>
        PRICE (M15 BROKER)
      </text>
    </svg>
  );
}

// ── Dealer Delta Heatmap ──────────────────────────────────────────────────────
function DealerHeatmap({
  heatmap, range, onRangeChange, spot, cfdRatio, cfdMode, W=300, H=500
}) {
  const svgRef  = useRef(null);
  const drag    = useRef(null);
  const [hoverY, setHoverY] = useState(null);
  const containerRef = useRef(null);
  const [mW, setMW] = useState(W);
  const [mH, setMH] = useState(H);
  const lastSizeDlr = useRef({ w: W, h: H });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const w = Math.floor(width), h = Math.floor(height);
      if (w > 50 && h > 50 &&
          (Math.abs(w - lastSizeDlr.current.w) > 3 ||
           Math.abs(h - lastSizeDlr.current.h) > 3)) {
        lastSizeDlr.current = { w, h };
        setMW(w); setMH(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!heatmap?.strikes?.length || !range) return null;

  const [lo, hi] = range;
  const PAD  = { top:20, right:8, bottom:30, left:64 };
  const cH   = mH - PAD.top - PAD.bottom;
  const cW   = mW - PAD.left - PAD.right;
  const mid  = PAD.left + cW / 2;

  const strikes = heatmap.strikes;
  const deltas  = heatmap.dealer_delta;
  const absMax  = Math.max(...deltas.map(Math.abs), 1);
  const halfW   = cW / 2;

  const strikeToY = (s) => {
    if (hi === lo) return cH / 2;
    return PAD.top + cH - ((s - lo) / (hi - lo)) * cH;
  };
  const yToStrike = (y) => lo + (1 - (y - PAD.top) / cH) * (hi - lo);

  const visStrikes = strikes.filter(s => s >= lo && s <= hi);
  const pixelSpacing = visStrikes.length > 1 ? cH / Math.max(visStrikes.length - 1, 1) : 20;
  const barH = Math.max(1, Math.min(pixelSpacing * 0.85, 16));

  const onMouseDown = (e) => {
    if (e.target.closest && e.target.closest("svg")) {
      e.preventDefault();
      drag.current = { startY: e.clientY, startRange: range };
    }
  };
  const onMouseMove = (e) => {
    const svg = svgRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const svgH = rect.height || mH;
      const rawY = ((e.clientY - rect.top) / svgH) * mH;
      if (rawY >= PAD.top && rawY <= PAD.top + cH) setHoverY(rawY);
      else setHoverY(null);
    }
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    const [dlo, dhi] = drag.current.startRange;
    const span = dhi - dlo;
    const delta = (dy / cH) * span;
    onRangeChange?.([dlo + delta, dhi + delta]);
  };
  const onMouseUp   = () => { drag.current = null; };
  const onMouseLeave = () => { drag.current = null; setHoverY(null); };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.93;
    const [zlo, zhi] = range;
    const mid2 = (zlo + zhi) / 2;
    const half = (zhi - zlo) / 2 * factor;
    onRangeChange?.([mid2 - half, mid2 + half]);
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [range]);

  const dp = (v) => {
    if (!v && v !== 0) return "—";
    if (!cfdMode) return Number(v).toFixed(2);
    const c = v * cfdRatio;
    return c > 1000 ? Math.round(c).toString() : c.toFixed(1);
  };

  const span = hi - lo;
  const step = span > 200 ? 50 : span > 50 ? 10 : span > 20 ? 5 : 1;
  const firstTick = Math.ceil(lo / step) * step;
  const yTicks = [];
  for (let s = firstTick; s <= hi; s += step) yTicks.push(Math.round(s * 100) / 100);

  const hoverPrice = hoverY != null ? yToStrike(hoverY) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",
      borderLeft:`1px solid ${C.border}`}}>
      <div style={{padding:"5px 8px",borderBottom:`1px solid ${C.border}`,flexShrink:0,
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:7,fontWeight:700,color:C.white,fontFamily:mono}}>DEALER Δ</div>
        <div style={{fontSize:6,color:C.muted,fontFamily:mono}}>← buy | sell →</div>
      </div>
      <div ref={containerRef} style={{flex:1,overflow:"hidden",minHeight:0}}>
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${mW} ${mH}`}
        preserveAspectRatio="none"
        style={{display:"block",cursor:drag.current?"grabbing":"crosshair",userSelect:"none"}}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>
        <rect x={0} y={0} width={mW} height={mH} fill={C.bg}/>
        <rect x={PAD.left} y={PAD.top} width={cW} height={cH}
          fill="#030303" stroke={C.border} strokeWidth={1}/>
        {yTicks.map(s => {
          const y = strikeToY(s);
          return <line key={s} x1={PAD.left} y1={y} x2={PAD.left+cW} y2={y}
            stroke={C.border} strokeWidth={0.5} opacity={0.6}/>;
        })}
        <line x1={mid} y1={PAD.top} x2={mid} y2={PAD.top+cH}
          stroke={C.borderLt} strokeWidth={1.5}/>
        {strikes.map((s, i) => {
          if (s < lo || s > hi) return null;
          const d     = deltas[i] || 0;
          const cy    = strikeToY(s);
          const pct   = d / absMax;
          const bW    = Math.abs(pct) * halfW;
          const isBuy = d < 0;
          const barX  = isBuy ? mid - bW : mid;
          const barY  = cy - barH / 2;
          return (
            <rect key={i}
              x={clamp(barX, PAD.left, PAD.left+cW)}
              y={clamp(barY, PAD.top, PAD.top+cH - barH)}
              width={clamp(bW, 0.5, halfW)}
              height={barH}
              fill={isBuy ? C.green : C.red}
              opacity={0.65 + 0.3 * Math.abs(pct)}
            />
          );
        })}
        {spot && (() => {
          const sy = strikeToY(spot);
          if (sy < PAD.top || sy > PAD.top + cH) return null;
          return (
            <g>
              <line x1={PAD.left} y1={sy} x2={PAD.left+cW} y2={sy}
                stroke={C.orange} strokeWidth={1.5} strokeDasharray="6 3"/>
              <rect x={2} y={sy-9} width={PAD.left-4} height={18} fill={C.orange} rx={2}/>
              <text x={PAD.left/2} y={sy+4} textAnchor="middle"
                fill={C.bg} fontSize={7} fontWeight={700} fontFamily={mono}>{dp(spot)}</text>
            </g>
          );
        })()}
        {heatmap.max_buy_strike && (() => {
          const y = strikeToY(heatmap.max_buy_strike);
          if (y < PAD.top || y > PAD.top + cH) return null;
          return (
            <g>
              <rect x={PAD.left} y={y-7} width={cW} height={14}
                fill={`${C.green}20`} stroke={`${C.green}50`} strokeWidth={0.5} rx={1}/>
              <text x={PAD.left+4} y={y+4} fill={C.green} fontSize={6} fontFamily={mono}>
                {dp(heatmap.max_buy_strike)} ▶BUY</text>
            </g>
          );
        })()}
        {heatmap.max_sell_strike && (() => {
          const y = strikeToY(heatmap.max_sell_strike);
          if (y < PAD.top || y > PAD.top + cH) return null;
          return (
            <g>
              <rect x={PAD.left} y={y-7} width={cW} height={14}
                fill={`${C.red}20`} stroke={`${C.red}50`} strokeWidth={0.5} rx={1}/>
              <text x={PAD.left+4} y={y+4} fill={C.red} fontSize={6} fontFamily={mono}>
                {dp(heatmap.max_sell_strike)} ◀SELL</text>
            </g>
          );
        })()}
        {yTicks.map(s => {
          const y = strikeToY(s);
          const nearSpot = spot && Math.abs(s - spot) < span * 0.02;
          if (nearSpot) return null;
          return <text key={s} x={PAD.left-4} y={y+3} textAnchor="end"
            fill={C.muted} fontSize={7} fontFamily={mono}>{dp(s)}</text>;
        })}
        <text x={PAD.left+4} y={PAD.top+cH+14} fill={C.green} fontSize={7} fontFamily={mono}>← BUY</text>
        <text x={PAD.left+cW-8} y={PAD.top+cH+14} textAnchor="end" fill={C.red} fontSize={7} fontFamily={mono}>SELL →</text>
        <text x={PAD.left+cW/2} y={mH-2} textAnchor="middle" fill={C.muted} fontSize={7} fontFamily={mono}>DEALER DELTA</text>
        {hoverY != null && (
          <g pointerEvents="none">
            <line x1={PAD.left} y1={hoverY} x2={PAD.left+cW} y2={hoverY}
              stroke="#ffffff" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5}/>
            <line x1={mid} y1={PAD.top} x2={mid} y2={PAD.top+cH}
              stroke="#ffffff" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.3}/>
            <rect x={2} y={hoverY-9} width={PAD.left-4} height={18}
              fill="#333" stroke="#555" strokeWidth={0.5} rx={2}/>
            <text x={PAD.left/2} y={hoverY+4} textAnchor="middle"
              fill={C.white} fontSize={7} fontWeight={700} fontFamily={mono}>
              {hoverPrice != null ? dp(hoverPrice) : ""}</text>
          </g>
        )}
      </svg>
      </div>
    </div>
  );
}

// ── Probability Field Heatmap ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
//  PROBABILITY MATRIX — Bloomberg-style institutional probability surface
// ══════════════════════════════════════════════════════════════════════════════
function ProbabilityMatrix({
  fieldData, spot, cfdRatio, cfdMode, refLines = [],
  blendMode = false, monthMode = "curr",  // "curr" | "prev"
  contrast = 0.5,  // 0 = flat, 0.5 = neutral, 1 = hard
  liveBars = [],   // candles fetched live by parent (replaces producer candles)
  conesData = null, // GBM cones from /api/cones/{ticker}
  coneWeight = 0.5, // 0 = pure options, 1 = pure cone (BLEND mode only)
  showContour = false, // v19: overlay isolines where adjacent cells cross a bin boundary
  contourWidth = 0.6,  // v19: SVG stroke width for contour lines (user slider)
}) {
  // ─────────────────────────────────────────────────────────────────
  // HOOKS — all hooks must run on every render, before any early return.
  // ─────────────────────────────────────────────────────────────────
  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [mW, setMW] = useState(800);
  const [mH, setMH] = useState(500);
  const lastSize = useRef({ w: 800, h: 500 });

  // ── Zoom & pan state ──
  // yZoom = null means "use the field's full price range" (default).
  // When user scrolls or drags, yZoom holds a [lo, hi] override.
  const [yZoom, setYZoom] = useState(null);
  const dragRef = useRef(null);  // { startY, startLo, startHi }
  // Reset zoom whenever the underlying mode/asset changes
  useEffect(() => { setYZoom(null); }, [fieldData, monthMode]);

  // Container measurement (attached to a stable wrapper div below)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const w = Math.floor(width), h = Math.floor(height);
      if (w > 100 && h > 100 &&
          (Math.abs(w - lastSize.current.w) > 3 || Math.abs(h - lastSize.current.h) > 3)) {
        lastSize.current = { w, h };
        setMW(w); setMH(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Layout ──
  const HEADER_H  = 36;
  const FOOTER_H  = 44;
  const PROFILE_W = 220;
  const PAD = { top: HEADER_H + 8, right: 70, bottom: FOOTER_H + 8, left: 60 };
  const chartW = Math.max(1, mW - PAD.left - PAD.right - PROFILE_W);
  const chartH = Math.max(1, mH - PAD.top - PAD.bottom);
  const profileX = PAD.left + chartW + PAD.right;

  // ── Null-safe payload extraction ──
  // v2.0 shape: fieldData.modes[monthMode] = { axes, options_weight, band_density, bands, realized_ohlc, realized_intraday, metadata }
  // ── Smart mode resolution ──
  // Requested mode → fall back to whichever mode is actually present in the payload.
  // This handles the common producer warmup case where only month_prev (or only
  // month_curr) has been computed so far.
  const requestedModeKey = monthMode === "prev" ? "month_prev" : "month_curr";
  const availableModes = fieldData?.modes ? Object.keys(fieldData.modes) : [];
  const modeKey = availableModes.includes(requestedModeKey)
    ? requestedModeKey
    : (availableModes[0] || requestedModeKey);
  const fellBackToOtherMode = modeKey !== requestedModeKey && availableModes.length > 0;
  const modeData = fieldData?.modes?.[modeKey] || null;
  const hasData =
    !!(modeData?.axes?.days?.length && modeData?.axes?.prices?.length &&
       modeData?.options_weight?.length);

  const days           = modeData?.axes?.days  || [];
  const prices         = modeData?.axes?.prices || [];
  const todayIndex     = modeData?.axes?.today_index ?? -1;
  const nDays          = days.length;
  const nPrices        = prices.length;
  const optionsWeight  = modeData?.options_weight || [];
  // v2.0 legacy fields — still supported for backward compat if producer ships them
  const bandDensity    = modeData?.band_density || [];
  const bandsObj       = modeData?.bands || {};
  const hasBandDensity = bandDensity.length > 0 && bandDensity[0]?.length > 0;
  const hasBands       = Object.keys(bandsObj).length > 0;
  const realizedOHLC   = modeData?.realized_ohlc || [];
  const realizedIntraday = modeData?.realized_intraday || [];
  const metadata       = modeData?.metadata || {};
  const provenance     = metadata.snapshot_provenance || null;
  const topSpot        = fieldData?.spot ?? spot ?? null;

  // Price range (Y axis bounds) — yZoom override > metadata > prices array extrema
  const fieldRange = metadata.price_range
    || (nPrices > 0 ? [prices[0], prices[nPrices - 1]] : [0, 1]);
  const [pLo, pHi] = yZoom || fieldRange;
  const pSpan = (pHi - pLo) || 1;

  // ── GBM cone extraction ──
  // The cones file uses "gbm_month_curr" / "gbm_month_prev" keys, each with
  // {median, sd1_high, sd1_low, sd2_high, sd2_low, sd3_high, sd3_low, dates}.
  //
  // The cone shape is mathematically anchored at "day 0" of the forecast,
  // but the producer's date labels are sometimes wrong (anchor mis-placed,
  // first Monday of month instead of first calendar day, etc.). The dates
  // can drift by several days from the heatmap's actual day-0.
  //
  // Fix: IGNORE the producer date labels entirely. Pin the cone's first
  // entry to chart day 0 and step forward by `entriesPerDay` per chart day.
  // The cone is at H4 resolution (6 entries per day) — auto-detected from
  // the date list when possible, falls back to a fixed 6.
  const cone = useMemo(() => {
    if (!conesData || !nDays) return null;
    // Try multiple shapes — older API may return data without a `cones` wrapper.
    // Also try multiple key names since the producer might use slightly different ones.
    const conesRoot = conesData.cones || conesData;
    const tryKeys = monthMode === "prev"
      ? ["gbm_month_prev", "gbm_prev", "month_prev"]
      : ["gbm_month_curr", "gbm_curr", "month_curr", "gbm_now"];
    let raw = null;
    let usedKey = null;
    for (const k of tryKeys) {
      if (conesRoot[k]?.median?.length) {
        raw = conesRoot[k];
        usedKey = k;
        break;
      }
    }
    if (!raw) {
      console.warn(`[cone] no matching key in cones data. Looked for: ${tryKeys.join(',')}. Available: ${Object.keys(conesRoot).slice(0,10).join(',')}`);
      return null;
    }

    // Auto-detect entries per chart day from the producer date arrays.
    let entriesPerDay = 6;
    if (raw.dates?.length >= 2) {
      const firstDay = String(raw.dates[0]).slice(0, 10);
      let count = 0;
      for (const d of raw.dates) {
        if (String(d).slice(0, 10) === firstDay) count++;
        else break;
      }
      if (count >= 1 && count <= 24) entriesPerDay = count;
    }

    // Build a [nDays] array by sampling one cone entry per chart day.
    // Sample point: middle of the day's H4 group.
    const sampleOffset = Math.floor(entriesPerDay / 2);
    const slice = (arr) => {
      if (!arr) return null;
      const out = new Array(nDays).fill(null);
      for (let dIdx = 0; dIdx < nDays; dIdx++) {
        const coneIdx = dIdx * entriesPerDay + sampleOffset;
        if (coneIdx < arr.length) out[dIdx] = arr[coneIdx];
      }
      return out;
    };
    console.log(`[cone] using key=${usedKey}, entriesPerDay=${entriesPerDay}, raw n=${raw.median.length}, covers ${Math.min(nDays, Math.floor(raw.median.length / entriesPerDay))} of ${nDays} chart days`);
    return {
      median:   slice(raw.median),
      sd1_high: slice(raw.sd1_high),
      sd1_low:  slice(raw.sd1_low),
      sd2_high: slice(raw.sd2_high),
      sd2_low:  slice(raw.sd2_low),
      sd3_high: slice(raw.sd3_high),
      sd3_low:  slice(raw.sd3_low),
      _entriesPerDay: entriesPerDay,
      _usedKey: usedKey,
    };
  }, [conesData, monthMode, nDays]);

  // ── Cone density matrix [nDays][nPrices] ──
  // Only computed when BLEND is ON (to avoid wasted CPU when we're just
  // rendering polylines). Each day column is a gaussian centered on the
  // cone median for that day. Sigma is tightened to 50% of the sd1 envelope
  // so the gaussian forms a crisp ridge along the median rather than a wide
  // cloud that covers most of the chart. Normalized to peak=1.0.
  // v18: Cone density built as equally-weighted "magnet" stripes — one per
  //       available percentile line (median, ±sd1, ±sd2, ±sd3). Each stripe
  //       is a narrow gaussian with amplitude 1.0; the density at each cell
  //       is the sum over all stripes. Because sd1 stripes overlap with the
  //       median stripe, the central region naturally brightens (mimicking a
  //       GBM distribution's peak) while outer sd2/sd3 stripes show as
  //       dimmer parallel bands — exactly the "fan of magnets" visual.
  const coneDensity = useMemo(() => {
    if (!blendMode || !cone || !cone.median) return null;
    const matrix = new Array(nDays);
    let globalPeak = 0;
    // Stripe width: fraction of the sd1 envelope. Small enough that
    // adjacent stripes (1σ apart) remain distinguishable, large enough
    // that they overlap softly near the median.
    const STRIPE_FRAC = 0.30;
    for (let d = 0; d < nDays; d++) {
      const row = new Float32Array(nPrices);
      const med = cone.median[d];
      if (med == null) { matrix[d] = row; continue; }

      // Collect all available percentile lines as equal-weight magnets.
      const magnets = [med];
      const pushIf = (v) => { if (v != null && isFinite(v)) magnets.push(v); };
      pushIf(cone.sd1_high?.[d]); pushIf(cone.sd1_low?.[d]);
      pushIf(cone.sd2_high?.[d]); pushIf(cone.sd2_low?.[d]);
      pushIf(cone.sd3_high?.[d]); pushIf(cone.sd3_low?.[d]);

      // Envelope for stripe width — prefer sd1_high - median, fall back
      // through the other bands, finally a small % of median.
      const sd1Hi = cone.sd1_high?.[d];
      const sd1Lo = cone.sd1_low?.[d];
      const sd2Hi = cone.sd2_high?.[d];
      const sd2Lo = cone.sd2_low?.[d];
      let envelope = null;
      if (sd1Hi != null && isFinite(sd1Hi))      envelope = Math.abs(sd1Hi - med);
      else if (sd1Lo != null && isFinite(sd1Lo)) envelope = Math.abs(med - sd1Lo);
      else if (sd2Hi != null && isFinite(sd2Hi)) envelope = Math.abs(sd2Hi - med) / 2;
      else if (sd2Lo != null && isFinite(sd2Lo)) envelope = Math.abs(med - sd2Lo) / 2;
      else envelope = Math.abs(med) * 0.01;

      const sigma = Math.max(envelope * STRIPE_FRAC, Math.abs(med) * 0.0015);
      const inv2sigma2 = 1 / (2 * sigma * sigma);

      // Hard cap so density doesn't bleed far past the outermost band.
      const outerUp = (sd2Hi != null && isFinite(sd2Hi)) ? sd2Hi : med + envelope * 3;
      const outerDn = (sd2Lo != null && isFinite(sd2Lo)) ? sd2Lo : med - envelope * 3;
      const pUpMax = outerUp + sigma * 2;
      const pDnMin = outerDn - sigma * 2;

      for (let p = 0; p < nPrices; p++) {
        const price = prices[p];
        if (price > pUpMax || price < pDnMin) continue;
        let v = 0;
        for (let m = 0; m < magnets.length; m++) {
          const dx = price - magnets[m];
          if (dx * dx * inv2sigma2 > 8) continue; // e^-8 ≈ 3e-4 — negligible
          v += Math.exp(-dx * dx * inv2sigma2);
        }
        if (v > 0) row[p] = v;
        if (v > globalPeak) globalPeak = v;
      }
      matrix[d] = row;
    }
    // Normalize so the brightest cone cell = 1.0
    if (globalPeak > 0 && globalPeak !== 1) {
      const inv = 1 / globalPeak;
      for (let d = 0; d < nDays; d++) {
        const row = matrix[d];
        for (let p = 0; p < nPrices; p++) row[p] *= inv;
      }
    }
    return matrix;
  }, [blendMode, cone, nDays, nPrices, prices]);

  // ── Final heatVmax (post-fusion) for color normalization ──
  // Uses a high-percentile value (not the absolute max) so the palette
  // stretches to make the top ~1% of cells look fully saturated. This
  // avoids the "mostly medium warm" look you get when a gentle gaussian
  // shifts the max upward without changing the relative structure.
  // Works identically for:
  //   - BLEND off: just sample options_weight values
  //   - BLEND on:  sample the fused ow*(1-w) + cd*w values
  const heatVmax = useMemo(() => {
    if (!hasData) return 1;
    const w = Math.max(0, Math.min(1, coneWeight));
    const ow_w = 1 - w;
    const useFusion = blendMode && coneDensity;

    // Collect all non-trivial cell values into a flat array.
    // Sampling every cell is fine — 22 × 400 = 8800 is cheap to sort.
    const vals = [];
    for (let d = 0; d < nDays; d++) {
      const owRow = optionsWeight[d] || [];
      const bdRow = hasBandDensity ? (bandDensity[d] || []) : null;
      const cdRow = useFusion ? coneDensity[d] : null;
      for (let p = 0; p < nPrices; p++) {
        const ow = owRow[p] || 0;
        let v;
        if (useFusion) {
          const cd = cdRow ? cdRow[p] : 0;
          v = ow * ow_w + cd * w;
        } else if (hasBandDensity) {
          const bd = bdRow ? (bdRow[p] || 0) : 0;
          v = Math.max(ow, bd * 0.85);
        } else {
          v = ow;
        }
        if (v > 0.001) vals.push(v);
      }
    }
    if (vals.length === 0) return 1;
    // 99th percentile = top 1% of cells get mapped to white.
    // Sort ascending, pick at 0.99 * length.
    vals.sort((a, b) => a - b);
    const p99 = vals[Math.floor(vals.length * 0.99)];
    return p99 > 0 ? p99 : 1;
  }, [hasData, blendMode, coneDensity, optionsWeight, bandDensity, hasBandDensity,
      nDays, nPrices, coneWeight]);

  // Keep globalMax as an alias for backward compat with any code below
  // (tooltip uses it to compute percentage).
  const globalMax = heatVmax;

  // ── Mouse handlers — crosshair + drag-pan + wheel-zoom ──
  // Convert screen Y → price using current zoom range (closure-stable via fieldRange/yZoom)
  const screenYToPrice = useCallback((sy) => {
    const range = yZoom || fieldRange;
    const span = (range[1] - range[0]) || 1;
    const frac = 1 - (sy - PAD.top) / chartH;
    return range[0] + frac * span;
  }, [yZoom, fieldRange, chartH, PAD.top]);

  const onMouseDown = useCallback((e) => {
    // Only start drag inside the chart area
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / (rect.width || mW) * mW;
    const sy = (e.clientY - rect.top)  / (rect.height || mH) * mH;
    if (sx < PAD.left || sx > PAD.left + chartW ||
        sy < PAD.top  || sy > PAD.top  + chartH) return;
    const range = yZoom || fieldRange;
    dragRef.current = { startY: e.clientY, startLo: range[0], startHi: range[1] };
    e.preventDefault();
  }, [mW, mH, chartW, chartH, PAD.left, PAD.top, yZoom, fieldRange]);

  const onMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / (rect.width || mW) * mW;
    const sy = (e.clientY - rect.top)  / (rect.height || mH) * mH;

    // Drag pan: shift visible price range by mouse delta
    if (dragRef.current) {
      const dyPx = e.clientY - dragRef.current.startY;
      const span = dragRef.current.startHi - dragRef.current.startLo;
      const dyPrice = (dyPx / (rect.height || mH)) * span * (mH / Math.max(chartH, 1));
      // Dragging down moves the view DOWN in price space (prices shift up)
      setYZoom([
        dragRef.current.startLo + dyPrice,
        dragRef.current.startHi + dyPrice,
      ]);
      setHoverPos(null);
      return;
    }

    // Crosshair: only inside the chart
    if (sx >= PAD.left && sx <= PAD.left + chartW &&
        sy >= PAD.top  && sy <= PAD.top  + chartH) {
      setHoverPos({ x: sx, y: sy });
    } else {
      setHoverPos(null);
    }
  }, [mW, mH, chartW, chartH, PAD.left, PAD.top]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);
  const onMouseLeave = useCallback(() => {
    dragRef.current = null;
    setHoverPos(null);
  }, []);

  // Wheel zoom: factor based on deltaY, anchored at cursor Y position
  // Attach via native addEventListener so we can preventDefault (React's wheel is passive)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / (rect.width || mW) * mW;
      const sy = (e.clientY - rect.top)  / (rect.height || mH) * mH;
      // Only zoom inside the chart area
      if (sx < PAD.left || sx > PAD.left + chartW ||
          sy < PAD.top  || sy > PAD.top  + chartH) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const range = yZoom || fieldRange;
      const span = range[1] - range[0];
      // Anchor zoom at the cursor Y so the price under the mouse stays put
      const cursorPrice = range[0] + (1 - (sy - PAD.top) / chartH) * span;
      const newSpan = Math.max(span * factor, 1);
      // Cap zoom-out at the full field range so users can't zoom out indefinitely
      const fullSpan = fieldRange[1] - fieldRange[0];
      if (newSpan >= fullSpan) {
        setYZoom(null);  // back to default
        return;
      }
      const cursorFracFromTop = (sy - PAD.top) / chartH;
      const newHi = cursorPrice + cursorFracFromTop * newSpan;
      const newLo = newHi - newSpan;
      setYZoom([newLo, newHi]);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [mW, mH, chartW, chartH, PAD.left, PAD.top, yZoom, fieldRange]);

  // Double-click anywhere on chart → reset zoom
  const onDoubleClick = useCallback(() => { setYZoom(null); }, []);

  // ─────────────────────────────────────────────────────────────────
  // RENDER — branch AFTER all hooks.
  // ─────────────────────────────────────────────────────────────────

  // Format version warning (soft — still try to render)
  const formatVersion = fieldData?.format_version;
  const versionMismatch = formatVersion && !String(formatVersion).startsWith("2") && !String(formatVersion).startsWith("3");

  if (!hasData) {
    // Diagnose what's wrong so the user knows whether to wait or investigate
    let reason = "Loading probability field…";
    if (!fieldData) {
      reason = "Fetching probability field…";
    } else if (versionMismatch) {
      reason = `Probability field format ${formatVersion} not supported — update required`;
    } else if (!fieldData.modes) {
      reason = "Payload has no 'modes' key — producer output malformed";
    } else if (availableModes.length === 0) {
      reason = "Payload has no modes computed yet — waiting for producer";
    } else if (!modeData) {
      reason = `Mode '${requestedModeKey}' not available. Present: ${availableModes.join(", ")}`;
    } else if (!modeData.axes?.days?.length) {
      reason = `Mode '${modeKey}' has no axes.days — producer output incomplete`;
    }
    return (
      <div ref={containerRef} style={{flex:1,display:"flex",alignItems:"center",
        justifyContent:"center",color:"#9ca3af",fontSize:12,fontFamily:mono,
        background:"#06080c",width:"100%",height:"100%",
        padding:"0 40px",textAlign:"center",lineHeight:1.6}}>
        {reason}
      </div>
    );
  }

  // ── Price formatting helper ──
  const dp = (v) => {
    if (v == null) return "—";
    const n = Number(v);
    return n > 1000 ? Math.round(n).toString() : n.toFixed(2);
  };

  // ── Coordinate mapping ──
  // X: day index → column center
  // Y: prices are ASCENDING in data (p=0 is lowest), but rendered DESCENDING on screen.
  const colW = chartW / Math.max(nDays, 1);
  const dayToX = (d) => PAD.left + (d + 0.5) * colW;
  const priceToY = (p) => PAD.top + chartH - ((p - pLo) / pSpan) * chartH;
  const priceIdxToY = (pIdx) => priceToY(prices[pIdx]);

  // ── Institutional thermal color scale ──
  // Black void → Deep indigo → Violet → Rust → Amber → White
  const heatColor = (val, max) => {
    if (val <= max * 0.02) return null;
    const norm = Math.min(1, val / max);
    const t = Math.pow(norm, 0.75);  // gamma correction lifts mid-tones
    let r, g, b;
    if (t < 0.18) {
      const f = t / 0.18;
      r = Math.round(6  + f * (30  - 6));
      g = Math.round(8  + f * (27  - 8));
      b = Math.round(12 + f * (75  - 12));
    } else if (t < 0.42) {
      const f = (t - 0.18) / 0.24;
      r = Math.round(30 + f * (76  - 30));
      g = Math.round(27 + f * (29  - 27));
      b = Math.round(75 + f * (149 - 75));
    } else if (t < 0.65) {
      const f = (t - 0.42) / 0.23;
      r = Math.round(76  + f * (194 - 76));
      g = Math.round(29  + f * (65  - 29));
      b = Math.round(149 + f * (12  - 149));
    } else if (t < 0.85) {
      const f = (t - 0.65) / 0.20;
      r = Math.round(194 + f * (250 - 194));
      g = Math.round(65  + f * (204 - 65));
      b = Math.round(12  + f * (21  - 12));
    } else {
      const f = (t - 0.85) / 0.15;
      r = Math.round(250 + f * (255 - 250));
      g = Math.round(204 + f * (255 - 204));
      b = Math.round(21  + f * (255 - 21));
    }
    return `rgb(${r},${g},${b})`;
  };

  // ── Combine matrices per cell ──
  // Contrast curve: maps the slider value [0..1] to a gamma exponent.
  //   contrast 0.0 → pow 1.8  (soft, washed out, low contrast)
  //   contrast 0.5 → pow 1.0  (neutral, linear)
  //   contrast 1.0 → pow 0.40 (hard, punchy, highlights pop)
  // BLEND no longer affects contrast — it has its own meaning now (cone fusion).
  const contrastPow = (() => {
    const c = Math.max(0, Math.min(1, contrast));
    // Piecewise linear: [0, 0.5, 1] → [1.8, 1.0, 0.40]
    return c < 0.5 ? 1.8 + (1.0 - 1.8) * (c / 0.5)
                   : 1.0 + (0.40 - 1.0) * ((c - 0.5) / 0.5);
  })();

  // cellValue takes (options_weight, band_density (v2 compat), cone_density)
  // and returns the post-contrast brightness 0..something for heatColor.
  // In BLEND mode: linear combination ow*(1-w) + cd*w where w = coneWeight.
  // Since both ow and cd are normalized to peak=1.0 at different locations,
  // the resulting max is always <= 1.0 and gets re-normalized by globalMax.
  const cellValue = (ow, bd, cd) => {
    let raw;
    if (blendMode && cd != null) {
      // v3.0 BLEND ON: weighted fusion of options weight and GBM cone density
      raw = ow * (1 - coneWeight) + cd * coneWeight;
    } else if (hasBandDensity) {
      // v2.0 back-compat: blend with band_density layer
      raw = blendMode ? (ow + bd * 0.9) : Math.max(ow, bd * 0.85);
    } else {
      // v3.0 BLEND OFF: options_weight only
      raw = ow;
    }
    return Math.pow(raw, contrastPow);
  };

  // ── Cell sizing (overlap removes grid lines; v8: 3px for extra bloom) ──
  const cellW = colW + 3.0;
  const cellH = chartH / Math.max(nPrices - 1, 1) + 3.0;

  // ── Build heatmap cells (v10: static, no per-cell animation) ──
  // v19: also populate `tField[d][p]` — normalized intensity with the same
  //      gamma as heatColor — so the optional contour pass can run marching
  //      squares over it.
  const cells = [];
  const tField = showContour
    ? Array.from({ length: nDays }, () => new Float32Array(nPrices))
    : null;
  for (let d = 0; d < nDays; d++) {
    const x = dayToX(d) - cellW / 2;
    const owRow = optionsWeight[d] || [];
    const bdRow = hasBandDensity ? (bandDensity[d] || []) : null;
    const cdRow = (blendMode && coneDensity) ? coneDensity[d] : null;
    for (let p = 0; p < nPrices; p++) {
      const ow = owRow[p] || 0;
      const bd = bdRow ? (bdRow[p] || 0) : 0;
      const cd = cdRow ? cdRow[p] : null;
      const v = cellValue(ow, bd, cd);
      if (tField) {
        const norm = Math.min(1, v / globalMax);
        tField[d][p] = Math.pow(norm, 0.75);  // match heatColor's gamma
      }
      const col = heatColor(v, globalMax);
      if (!col) continue;
      const y = priceIdxToY(p) - cellH / 2;
      cells.push(
        <rect key={`${d}-${p}`} x={x} y={y} width={cellW} height={cellH}
          fill={col} shapeRendering="geometricPrecision"/>
      );
    }
  }

  // ── Contour isolines via marching squares (v19) ──
  // Smooth isolines at 3 isolevels (0.3, 0.55, 0.8) over a 3×3-box-blurred
  // t-field. Without the blur, tiny row-to-row noise made the contours look
  // like a zebra pattern at high zoom because every micro-crossing of an
  // isolevel produced a horizontal chord. The blur matches the visual look
  // the heat filter produces, so contours now trace what the eye sees.
  //
  // Contrast adaptation: each segment's 4-corner average decides whether it
  // sits over bright heat (→ dark path) or dim/empty (→ light path).
  const contourPaths = (() => {
    if (!tField || nDays < 2 || nPrices < 2) return null;

    // 3×3 box blur on tField (edge-replicated). One pass is plenty given
    // the grid resolution and the visual heat smoothing that already exists.
    const tBlur = Array.from({ length: nDays }, () => new Float32Array(nPrices));
    for (let d = 0; d < nDays; d++) {
      const d0 = Math.max(0, d - 1);
      const d1 = Math.min(nDays - 1, d + 1);
      const dst = tBlur[d];
      for (let p = 0; p < nPrices; p++) {
        const p0 = Math.max(0, p - 1);
        const p1 = Math.min(nPrices - 1, p + 1);
        let sum = 0;
        for (let dd = d0; dd <= d1; dd++) {
          const src = tField[dd];
          for (let pp = p0; pp <= p1; pp++) sum += src[pp];
        }
        dst[p] = sum / ((d1 - d0 + 1) * (p1 - p0 + 1));
      }
    }

    const ISOLEVELS = [0.3, 0.55, 0.8];
    const darkSegs  = [];
    const lightSegs = [];

    for (const iso of ISOLEVELS) {
      for (let d = 0; d < nDays - 1; d++) {
        const colT = tBlur[d];
        const colR = tBlur[d + 1];
        for (let p = 0; p < nPrices - 1; p++) {
          const vTL = colT[p];
          const vTR = colR[p];
          const vBR = colR[p + 1];
          const vBL = colT[p + 1];

          const caseIdx =
            (vTL > iso ? 8 : 0) |
            (vTR > iso ? 4 : 0) |
            (vBR > iso ? 2 : 0) |
            (vBL > iso ? 1 : 0);
          if (caseIdx === 0 || caseIdx === 15) continue;

          // Corner positions
          const xL = dayToX(d),      xR = dayToX(d + 1);
          const yT = priceIdxToY(p), yB = priceIdxToY(p + 1);

          // Linear interp along each edge at `iso`.
          const tX = (v1, v2) => (iso - v1) / ((v2 - v1) || 1e-9);
          const topX    = xL + tX(vTL, vTR) * (xR - xL);
          const rightY  = yT + tX(vTR, vBR) * (yB - yT);
          const bottomX = xL + tX(vBL, vBR) * (xR - xL);
          const leftY   = yT + tX(vTL, vBL) * (yB - yT);

          let segs;
          switch (caseIdx) {
            case 1:  segs = [[xL, leftY,    bottomX, yB]]; break;
            case 2:  segs = [[bottomX, yB,  xR, rightY]]; break;
            case 3:  segs = [[xL, leftY,    xR, rightY]]; break;
            case 4:  segs = [[topX, yT,     xR, rightY]]; break;
            case 5: { // saddle
              const avg = (vTL + vTR + vBR + vBL) * 0.25;
              segs = avg > iso
                ? [[xL, leftY, topX, yT], [bottomX, yB, xR, rightY]]
                : [[xL, leftY, bottomX, yB], [topX, yT, xR, rightY]];
              break;
            }
            case 6:  segs = [[topX, yT,     bottomX, yB]]; break;
            case 7:  segs = [[xL, leftY,    topX, yT]]; break;
            case 8:  segs = [[xL, leftY,    topX, yT]]; break;
            case 9:  segs = [[topX, yT,     bottomX, yB]]; break;
            case 10: { // saddle
              const avg = (vTL + vTR + vBR + vBL) * 0.25;
              segs = avg > iso
                ? [[topX, yT, xR, rightY], [xL, leftY, bottomX, yB]]
                : [[xL, leftY, topX, yT], [bottomX, yB, xR, rightY]];
              break;
            }
            case 11: segs = [[topX, yT,     xR, rightY]]; break;
            case 12: segs = [[xL, leftY,    xR, rightY]]; break;
            case 13: segs = [[bottomX, yB,  xR, rightY]]; break;
            case 14: segs = [[xL, leftY,    bottomX, yB]]; break;
            default: segs = [];
          }

          // Contrast: bright bg → dark line; dim bg → light line.
          const avgT = (vTL + vTR + vBR + vBL) * 0.25;
          const bucket = avgT > 0.5 ? darkSegs : lightSegs;
          for (const s of segs) {
            bucket.push(
              `M${s[0].toFixed(2)} ${s[1].toFixed(2)}L${s[2].toFixed(2)} ${s[3].toFixed(2)}`
            );
          }
        }
      }
    }

    if (darkSegs.length === 0 && lightSegs.length === 0) return null;
    return (
      <g pointerEvents="none">
        {lightSegs.length > 0 && (
          <path d={lightSegs.join("")}
            fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth={contourWidth}
            strokeLinecap="round" strokeLinejoin="round"
            shapeRendering="geometricPrecision"/>
        )}
        {darkSegs.length > 0 && (
          <path d={darkSegs.join("")}
            fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={contourWidth}
            strokeLinecap="round" strokeLinejoin="round"
            shapeRendering="geometricPrecision"/>
        )}
      </g>
    );
  })();

  // ── Band polylines (BLEND OFF only) ──
  // Keys: sd3_high, sd2_high, sd1_high, median, sd1_low, sd2_low, sd3_low
  const bandStyles = {
    sd3_high: { color: "#22d3ee", width: 1.0, dash: "3 3", opacity: 0.55 },
    sd2_high: { color: "#22d3ee", width: 1.2, dash: "4 3", opacity: 0.70 },
    sd1_high: { color: "#22d3ee", width: 1.7, dash: "5 3", opacity: 0.90 },
    median:   { color: "#f59e0b", width: 1.8, dash: "6 2", opacity: 0.95 },
    sd1_low:  { color: "#22d3ee", width: 1.7, dash: "5 3", opacity: 0.90 },
    sd2_low:  { color: "#22d3ee", width: 1.2, dash: "4 3", opacity: 0.70 },
    sd3_low:  { color: "#22d3ee", width: 1.0, dash: "3 3", opacity: 0.55 },
  };
  const bandLines = [];
  if (!blendMode && hasBands) {
    Object.entries(bandStyles).forEach(([key, style]) => {
      const band = bandsObj[key];
      if (!band?.prices?.length) return;
      // Map each band price to the day index it belongs to
      const points = [];
      for (let i = 0; i < band.prices.length; i++) {
        const price = band.prices[i];
        if (price == null) continue;
        if (price < pLo || price > pHi) continue;
        // Band day index → chart X. Match by date if band has own days array, else by index.
        let dIdx = i;
        if (band.days && band.days[i]) {
          const matchIdx = days.indexOf(band.days[i]);
          if (matchIdx >= 0) dIdx = matchIdx;
        }
        points.push(`${dayToX(dIdx)},${priceToY(price)}`);
      }
      if (points.length < 2) return;
      bandLines.push(
        <polyline key={key} points={points.join(" ")}
          fill="none" stroke={style.color}
          strokeWidth={style.width}
          strokeDasharray={style.dash}
          opacity={style.opacity}/>
      );
    });
  }

  // ── GBM cone polylines (BLEND OFF only) ──
  // Pulled from /api/cones/{ticker} via parent. Uses same style table as v2.0 bands.
  const coneLines = [];
  if (!blendMode && cone) {
    Object.entries(bandStyles).forEach(([key, style]) => {
      const arr = cone[key];
      if (!arr) return;
      const points = [];
      for (let dIdx = 0; dIdx < nDays; dIdx++) {
        const price = arr[dIdx];
        if (price == null) continue;
        if (price < pLo || price > pHi) continue;
        points.push(`${dayToX(dIdx)},${priceToY(price)}`);
      }
      if (points.length < 2) return;
      coneLines.push(
        <polyline key={`cone-${key}`} points={points.join(" ")}
          fill="none" stroke={style.color}
          strokeWidth={style.width}
          strokeDasharray={style.dash}
          opacity={style.opacity}/>
      );
    });
  }

  // ── Candles ──
  // Source split:
  //   month_curr → liveBars from /api/bars (intraday M30, fetched fresh on mount + refresh)
  //   month_prev → producer's realized_ohlc from the prob field payload (closed historical month)
  //
  // The producer ships reliable daily candles for closed historical months but
  // its current-month intraday is buggy, so we fetch live for current.
  //
  // For intraday, we filter to US session only (13:30 → 20:00 UTC ≈ 13 M30 bars/day)
  // — but only if filtering keeps a reasonable number of bars. If the filter would
  // strip more than 80% of bars (e.g. for non-US-session assets), we skip it and
  // use clock-hour distribution across the full day instead.
  const SESSION_START_HR = 13.5;
  const SESSION_END_HR   = 20.0;
  const SESSION_SPAN_HR  = SESSION_END_HR - SESSION_START_HR;
  const isPrevMode = monthMode === "prev";

  // Pick the raw source array based on mode.
  // v19: prev month now prefers live H1 bars (fetched by HeatMapView); falls
  //   back to the producer's daily realized_ohlc only when the live fetch
  //   is empty (offline / 404 / unknown symbol).
  const rawBars = isPrevMode
    ? ((liveBars && liveBars.length > 0) ? liveBars : (realizedOHLC || []))
    : (liveBars || []);

  // Detect intraday vs daily by checking for time field on first bar
  const firstBar = rawBars[0];
  const useIntraday = !!(firstBar && (firstBar.time || firstBar.t || firstBar.datetime));

  // CRITICAL: filter live bars to only those whose date falls inside the
  // heatmap's day window. /api/bars returns the LAST N bars regardless of
  // calendar position, so 800 M30 bars can stretch back into the previous
  // month — those would render at wrong X positions or pile up at edges.
  const inWindowBars = useIntraday
    ? rawBars.filter(b => {
        const ts = b.time || b.t || b.datetime;
        if (!ts) return false;
        const dateStr = String(ts).slice(0, 10);
        return days.indexOf(dateStr) >= 0;
      })
    : rawBars.filter(b => {
        const dateStr = b.date || b.Date || (b.time && String(b.time).slice(0, 10));
        if (!dateStr) return false;
        return days.indexOf(dateStr) >= 0;
      });

  // Apply US session filter only when it doesn't kill most of the data
  let bars = inWindowBars;
  if (useIntraday && inWindowBars.length > 0) {
    const sessionFiltered = inWindowBars.filter(b => {
      const ts = b.time || b.t || b.datetime;
      if (!ts) return false;
      const t = new Date(ts);
      const h = t.getUTCHours() + t.getUTCMinutes() / 60;
      return h >= SESSION_START_HR && h < SESSION_END_HR;
    });
    // Use session-filtered bars only if the filter keeps >= 20% of in-window bars.
    // This guards against non-US-session assets (XAUUSD, FX) where US hours
    // strip too much data.
    if (sessionFiltered.length >= inWindowBars.length * 0.20) {
      bars = sessionFiltered;
    }
  }
  // useFullDay is true when we're rendering intraday but didn't filter by session
  const useFullDay = useIntraday && bars.length > 0 && bars === inWindowBars;

  // X position for a bar.
  const barToX = (bar, fallbackIdx) => {
    if (useIntraday) {
      const ts = bar.time || bar.t || bar.timestamp || bar.datetime;
      if (!ts) return dayToX(fallbackIdx);
      const t = new Date(ts);
      const dateStr = String(ts).slice(0, 10);
      const dIdx = days.indexOf(dateStr);
      if (dIdx < 0) return dayToX(fallbackIdx);
      const h = t.getUTCHours() + t.getUTCMinutes() / 60;
      // If we're using session bars, map [13.5..20] → [0..1].
      // If we're using full-day bars (non-US asset), map [0..24] → [0..1].
      const frac = useFullDay
        ? Math.max(0, Math.min(1, h / 24))
        : Math.max(0, Math.min(1, (h - SESSION_START_HR) / SESSION_SPAN_HR));
      const colLeft = PAD.left + dIdx * colW;
      return colLeft + colW * 0.06 + frac * colW * 0.88;
    }
    // Daily: try date field first, fall back to extracting date from time field
    let dateStr = bar.date || bar.Date;
    if (!dateStr) {
      const ts = bar.time || bar.t || bar.timestamp || bar.datetime;
      if (ts) dateStr = String(ts).slice(0, 10);
    }
    if (!dateStr) return dayToX(fallbackIdx);
    const dIdx = days.indexOf(dateStr);
    if (dIdx < 0) return dayToX(fallbackIdx);
    return dayToX(dIdx);
  };

  // Candle width: compute from actual minimum spacing between consecutive bars
  // instead of guessing. Prevents overlap regardless of bar density.
  const cW = (() => {
    if (!useIntraday) return Math.max(2, Math.min(colW * 0.7, 14));
    if (bars.length < 2) return 4;
    // Sample spacings between first ~30 adjacent bar pairs
    let minGap = Infinity;
    const sample = Math.min(30, bars.length - 1);
    for (let i = 0; i < sample; i++) {
      const gap = Math.abs(barToX(bars[i + 1], i + 1) - barToX(bars[i], i));
      if (gap > 0 && gap < minGap) minGap = gap;
    }
    if (!isFinite(minGap)) minGap = colW / 14;
    return Math.max(2, Math.min(minGap * 0.78, 7));
  })();
  const halfCW = cW / 2;

  const candleEls = [];
  bars.forEach((b, i) => {
    const o = b.o ?? b.open ?? b.Open ?? 0;
    const h = b.h ?? b.high ?? b.High ?? 0;
    const l = b.l ?? b.low  ?? b.Low  ?? 0;
    const c = b.c ?? b.close?? b.Close?? 0;
    if (!o || !c) return;
    if (Math.max(o, c) < pLo || Math.min(o, c) > pHi) return;
    const cx = barToX(b, i);
    if (cx < PAD.left - 2 || cx > PAD.left + chartW + 2) return;
    const yO = priceToY(o), yC = priceToY(c);
    const yH = priceToY(h), yL = priceToY(l);
    const bullish = c >= o;
    const bodyTop = Math.min(yO, yC);
    const bodyH = Math.max(Math.abs(yC - yO), 1);
    const fill   = bullish ? "#22c55e" : "#ef4444";
    const stroke = bullish ? "#064e1f" : "#5c0a0a";
    candleEls.push(
      <g key={`c${i}`}>
        {/* Wick — dark halo + bright core */}
        <line x1={cx} y1={yH} x2={cx} y2={yL}
          stroke="#000" strokeWidth={2.2} opacity={0.65}/>
        <line x1={cx} y1={yH} x2={cx} y2={yL}
          stroke={fill} strokeWidth={1.3} opacity={1}/>
        {/* Body */}
        <rect x={cx - halfCW} y={bodyTop} width={cW} height={bodyH}
          fill={fill} stroke={stroke} strokeWidth={0.8} opacity={1}/>
      </g>
    );
  });

  // ── TODAY divider — from axes.today_index ──
  // In month_prev, today_index usually points at the last day; we hide the divider there.
  const isPrev = monthMode === "prev";
  let todayX = null;
  if (!isPrev && todayIndex >= 0 && todayIndex < nDays) {
    todayX = dayToX(todayIndex);
  }

  // ── X-axis date ticks ──
  // Show ~7 ticks: first, last, and evenly spaced middle days.
  const xTicks = (() => {
    if (nDays === 0) return [];
    const out = [];
    const NTICKS = Math.min(7, nDays);
    for (let i = 0; i < NTICKS; i++) {
      const dIdx = Math.round((i / Math.max(NTICKS - 1, 1)) * (nDays - 1));
      const dateStr = days[dIdx];
      if (!dateStr) continue;
      const dt = new Date(dateStr + "T12:00:00Z");
      const label = `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth() + 1).padStart(2,"0")}`;
      out.push({
        x: dayToX(dIdx),
        label,
        dIdx,
        isAnchor: dIdx === 0,
        isToday: dIdx === todayIndex,
      });
    }
    return out;
  })();

  // ── Y-axis price ticks ──
  const yTicks = (() => {
    const rawStep = pSpan / 10;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const yStep = Math.ceil(rawStep / mag) * mag;
    const out = [];
    for (let s = Math.ceil(pLo / yStep) * yStep; s <= pHi; s += yStep)
      out.push(Math.round(s * 100) / 100);
    return out;
  })();

  // ── Terminal distribution = rightmost column of combined values ──
  const terminalCol = nDays - 1;
  const terminalProfile = new Array(nPrices).fill(0);
  let maxProf = 0;
  if (terminalCol >= 0) {
    const owRow = optionsWeight[terminalCol] || [];
    const bdRow = hasBandDensity ? (bandDensity[terminalCol] || []) : null;
    for (let p = 0; p < nPrices; p++) {
      const v = cellValue(owRow[p] || 0, bdRow ? (bdRow[p] || 0) : 0);
      terminalProfile[p] = v;
      if (v > maxProf) maxProf = v;
    }
  }
  if (maxProf === 0) maxProf = 1;
  // Peak price = price index with highest terminal density
  let peakIdx = 0, peakVal = -1;
  for (let p = 0; p < nPrices; p++) {
    if (terminalProfile[p] > peakVal) { peakVal = terminalProfile[p]; peakIdx = p; }
  }
  const peakPrice = prices[peakIdx];

  // ── Header labels ──
  const monthLabel = (() => {
    if (days.length === 0) return "";
    const d = new Date(days[0] + "T12:00:00Z");
    return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
  })();
  const lastClose = (() => {
    const arr = useIntraday ? realizedIntraday : realizedOHLC;
    if (!arr.length) return null;
    const last = arr[arr.length - 1];
    return last.c ?? last.close ?? last.Close ?? null;
  })();
  // Anchor for "from anchor" display: prefer bands.median if present, else price_center, else spot
  const medianBand = bandsObj.median?.prices;
  const anchorPrice = medianBand?.length
    ? medianBand[0]
    : (metadata.price_center ?? topSpot ?? 0);

  // ── Tooltip ──
  let tip = null;
  if (hoverPos) {
    const tFrac = (hoverPos.x - PAD.left) / chartW;
    const pFrac = 1 - (hoverPos.y - PAD.top) / chartH;
    const dIdx = Math.max(0, Math.min(nDays - 1, Math.floor(tFrac * nDays)));
    const pIdx = Math.max(0, Math.min(nPrices - 1, Math.round(pFrac * (nPrices - 1))));
    const hPrice = pLo + pFrac * pSpan;
    const ow = (optionsWeight[dIdx] || [])[pIdx] || 0;
    const bd = hasBandDensity ? ((bandDensity[dIdx] || [])[pIdx] || 0) : 0;
    const combined = cellValue(ow, bd);
    const hPct = (combined / globalMax) * 100;
    const hDateStr = days[dIdx] || "";
    // Provenance badge for this column
    let provSource = "—";
    if (provenance) {
      if (provenance.archived?.includes(dIdx)) provSource = "ARCHIVE";
      else if (provenance.carried_forward?.includes(dIdx)) provSource = "CARRIED";
      else if (provenance.forward_projection?.includes(dIdx)) provSource = "PROJECTED";
    }
    tip = { hPrice, hPct, ow, bd, hDateStr, dIdx, provSource };
  }

  return (
    <div ref={containerRef} style={{flex:1,position:"relative",overflow:"hidden",
      width:"100%",height:"100%",background:"#06080c"}}>
      <svg ref={svgRef} width="100%" height="100%"
        viewBox={`0 0 ${mW} ${mH}`} preserveAspectRatio="none"
        style={{display:"block",
          cursor: dragRef.current ? "grabbing" : "crosshair",
          userSelect:"none"}}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDoubleClick}>

        {/* Background */}
        <rect x={0} y={0} width={mW} height={mH} fill="#06080c"/>

        {/* Header bar */}
        <rect x={0} y={0} width={mW} height={HEADER_H} fill="#0b0f17"/>
        <line x1={0} y1={HEADER_H} x2={mW} y2={HEADER_H} stroke="#1f2937" strokeWidth={1}/>

        <rect x={14} y={12} width={6} height={6} fill="#f59e0b"/>
        <text x={26} y={18} fill="#ffffff" fontSize={10} fontWeight={800}
          letterSpacing="2.5" fontFamily={mono}>PROBABILITY MATRIX</text>
        <text x={26} y={29} fill="#6b7280" fontSize={8} letterSpacing="1.2" fontFamily={mono}>
          OPTIONS WEIGHT + BAND DENSITY · v{formatVersion || "2.0"}
        </text>

        {/* Header badges */}
        {(() => {
          let bx = 270;
          const badge = (text, color) => {
            const w = text.length * 5.4 + 12;
            const el = (
              <g key={`b${bx}`}>
                <rect x={bx} y={9} width={w} height={16} rx={2}
                  fill={`${color}1a`} stroke={`${color}55`} strokeWidth={0.8}/>
                <text x={bx + w/2} y={20} textAnchor="middle"
                  fill={color} fontSize={9} fontWeight={700} fontFamily={mono}>{text}</text>
              </g>
            );
            bx += w + 6;
            return el;
          };
          const badges = [];
          badges.push(badge(`${monthLabel} · ${nDays}D`, "#f59e0b"));
          if (fellBackToOtherMode) {
            badges.push(badge(`⚠ SHOWING ${modeKey.toUpperCase()}`, "#facc15"));
          } else {
            badges.push(badge(`MODE ${monthMode === "prev" ? "PREVIOUS" : "CURRENT"}`,
              monthMode === "prev" ? "#a78bfa" : "#22d3ee"));
          }
          badges.push(badge(blendMode ? "GBM CONE FUSED" : "CONES OVERLAY",
            blendMode ? "#22c55e" : "#a78bfa"));
          if (useIntraday) badges.push(badge(`INTRADAY ${bars.length}`, "#22c55e"));
          if (lastClose) badges.push(badge(`LAST ${dp(lastClose)}`, "#22d3ee"));
          if (!isPrev && topSpot) badges.push(badge(`SPOT ${dp(topSpot)}`, "#22d3ee"));
          if (yZoom) {
            const fullSpan = fieldRange[1] - fieldRange[0];
            const curSpan = yZoom[1] - yZoom[0];
            const zoomPct = Math.round((fullSpan / Math.max(curSpan, 1)) * 100);
            badges.push(badge(`ZOOM ${zoomPct}% · DBL-CLICK RESET`, "#facc15"));
          }
          return badges;
        })()}

        {/* Header legend gradient */}
        {(() => {
          const lgX = mW - 200;
          const lgY = 14;
          const lgW = 140;
          const lgH = 8;
          return (
            <g>
              <text x={lgX - 4} y={lgY + 7} textAnchor="end"
                fill="#6b7280" fontSize={8} fontFamily={mono}>PROB</text>
              <defs>
                <linearGradient id="probLegend" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"  stopColor="#06080c"/>
                  <stop offset="20%" stopColor="#1e1b4b"/>
                  <stop offset="42%" stopColor="#4c1d95"/>
                  <stop offset="65%" stopColor="#c2410c"/>
                  <stop offset="85%" stopColor="#facc15"/>
                  <stop offset="100%" stopColor="#ffffff"/>
                </linearGradient>
              </defs>
              <rect x={lgX} y={lgY} width={lgW} height={lgH}
                fill="url(#probLegend)" stroke="#1f2937" strokeWidth={0.5}/>
              <text x={lgX} y={lgY + 19} fill="#6b7280" fontSize={7} fontFamily={mono}>LOW</text>
              <text x={lgX + lgW} y={lgY + 19} textAnchor="end"
                fill="#6b7280" fontSize={7} fontFamily={mono}>HIGH</text>
            </g>
          );
        })()}

        {/* Main chart background — deep indigo matches the low end of the
             thermal palette, so dim cells blend seamlessly into it instead
             of cutting sharply to black. */}
        <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
          fill="#0a0b1c" stroke="#1f2937" strokeWidth={1}/>

        {/* Heatmap blur filter — much heavier anisotropic smoothing to give
             a fluid, painterly look instead of fused squares.
             Two-stage blur (medium then small) gives a smoother gradient than
             a single large blur. Color matrix bumps brightness to compensate
             for the brightness loss from heavy blurring. */}
        <defs>
          <filter id="heatSmooth" x="-5%" y="-5%" width="110%" height="110%">
            {/* Stage 1: heavy X smoothing to fully blend column seams */}
            <feGaussianBlur stdDeviation="14 3.5" result="b1"/>
            {/* Stage 2: smaller blur on the result for extra fluidity */}
            <feGaussianBlur in="b1" stdDeviation="4 1.5" result="b2"/>
            {/* Compensate for brightness loss with a brightness + saturation boost */}
            <feColorMatrix in="b2" type="matrix" values="
              1.45 0    0    0 0
              0    1.45 0    0 0
              0    0    1.45 0 0
              0    0    0    1 0"/>
          </filter>
          <linearGradient id="heatFadeY" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#fff" stopOpacity="0"/>
            <stop offset="10%"  stopColor="#fff" stopOpacity="0.55"/>
            <stop offset="22%"  stopColor="#fff" stopOpacity="1"/>
            <stop offset="78%"  stopColor="#fff" stopOpacity="1"/>
            <stop offset="90%"  stopColor="#fff" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
          </linearGradient>
          <mask id="heatFadeMask">
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
              fill="url(#heatFadeY)"/>
          </mask>
        </defs>

        {/* v10: pulse removed entirely. Static render only. */}
        <g filter="url(#heatSmooth)" mask="url(#heatFadeMask)">{cells}</g>

        {/* v19: contour isolines overlay (toggle, marching-squares, contrast-adaptive) */}
        {contourPaths}

        {/* Y-axis grid lines */}
        {yTicks.map(s => (
          <line key={`g${s}`} x1={PAD.left} y1={priceToY(s)}
            x2={PAD.left + chartW} y2={priceToY(s)}
            stroke="#ffffff" strokeWidth={0.4} opacity={0.05}/>
        ))}

        {/* Band polylines (BLEND OFF) */}
        {bandLines}
        {coneLines}

        {/* Band labels at right edge of chart (BLEND OFF, v2.0 compat) */}
        {!blendMode && hasBands && Object.entries(bandsObj).map(([key, band]) => {
          if (!band?.prices?.length) return null;
          const style = bandStyles[key];
          if (!style) return null;
          const lastPrice = band.prices[band.prices.length - 1];
          if (lastPrice == null || lastPrice < pLo || lastPrice > pHi) return null;
          const y = priceToY(lastPrice);
          const label = {
            sd3_high: "+3σ", sd2_high: "+2σ", sd1_high: "+1σ",
            median:   "MED",
            sd1_low:  "-1σ", sd2_low:  "-2σ", sd3_low:  "-3σ",
          }[key];
          return (
            <text key={`bl${key}`} x={PAD.left + chartW - 4} y={y - 2}
              textAnchor="end" fill={style.color} opacity={style.opacity}
              fontSize={8} fontWeight={700} fontFamily={mono}>
              {label}
            </text>
          );
        })}

        {/* Candles */}
        <g>{candleEls}</g>

        {/* TODAY vertical divider */}
        {todayX != null && (
          <g>
            <line x1={todayX} y1={PAD.top} x2={todayX} y2={PAD.top + chartH}
              stroke="#22d3ee" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.95}/>
            <rect x={todayX + 4} y={PAD.top + 4} width={86} height={16}
              fill="#22d3ee" rx={2}/>
            <text x={todayX + 47} y={PAD.top + 15} textAnchor="middle"
              fill="#000" fontSize={9} fontWeight={800} fontFamily={mono}>
              TODAY · IDX {todayIndex}
            </text>
          </g>
        )}

        {/* Provenance boundary: where archived data ends and forward projection begins */}
        {(() => {
          if (!provenance) return null;
          const archived = provenance.archived || [];
          const projected = provenance.forward_projection || [];
          if (!archived.length || !projected.length) return null;
          const lastArchivedIdx = Math.max(...archived);
          const firstProjIdx = Math.min(...projected);
          // Boundary sits between the last archived column and the first projected one
          if (firstProjIdx !== lastArchivedIdx + 1 && firstProjIdx !== lastArchivedIdx + 2) return null;
          const boundaryIdx = (lastArchivedIdx + firstProjIdx) / 2;
          const bx = PAD.left + ((boundaryIdx + 0.5) / nDays) * chartW;
          return (
            <g opacity={0.55}>
              <line x1={bx} y1={PAD.top + 26} x2={bx} y2={PAD.top + chartH}
                stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="2 4"/>
              <rect x={bx - 38} y={PAD.top + chartH - 16} width={76} height={14}
                fill="#0b0f17" stroke="#a78bfa" strokeWidth={0.8} rx={2}/>
              <text x={bx} y={PAD.top + chartH - 6} textAnchor="middle"
                fill="#a78bfa" fontSize={8} fontWeight={700} fontFamily={mono}>
                PROJECTION →
              </text>
            </g>
          );
        })()}

        {/* Reference lines (FLIP, MAX PAIN, walls) — v16: labeled pill on the
             left edge of the plot so the user can tell what each line is.
             Hidden in PREVIOUS-month mode: these are current-state levels and
             have no meaning overlaid on a closed historical month. */}
        {!isPrev && refLines.map((rl, i) => {
          const y = priceToY(rl.value);
          if (y < PAD.top - 2 || y > PAD.top + chartH + 2) return null;
          const label = rl.label || "";
          const labelW = 8 + label.length * 5.4;
          return (
            <g key={`rf${i}`}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke={rl.color} strokeWidth={1}
                strokeDasharray={rl.dash || "5 4"} opacity={0.75}/>
              {label && (
                <>
                  <rect x={PAD.left + 2} y={y - 7} width={labelW} height={13}
                    fill="#000" fillOpacity={0.72}
                    stroke={rl.color} strokeOpacity={0.55} strokeWidth={0.6} rx={2}/>
                  <text x={PAD.left + 6} y={y + 2.5}
                    fill={rl.color} fontSize={9} fontFamily={mono} fontWeight={800}
                    letterSpacing={0.3}>
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Spot price marker on Y axis — only in CURRENT mode.
             A live spot price has no meaning on a closed historical month. */}
        {!isPrev && topSpot != null && (() => {
          const sy = priceToY(topSpot);
          if (sy < PAD.top || sy > PAD.top + chartH) return null;
          return (
            <g>
              <line x1={PAD.left} y1={sy} x2={PAD.left + chartW} y2={sy}
                stroke="#22d3ee" strokeWidth={1.2} opacity={0.9}/>
              <rect x={2} y={sy - 9} width={PAD.left - 4} height={18}
                fill="#22d3ee" rx={2}/>
              <text x={PAD.left/2} y={sy + 4} textAnchor="middle"
                fill="#000" fontSize={9} fontWeight={800} fontFamily={mono}>
                {dp(topSpot)}
              </text>
            </g>
          );
        })()}

        {/* Y-axis price labels */}
        {yTicks.map(s => {
          const y = priceToY(s);
          const nearSpot = !isPrev && topSpot && Math.abs(s - topSpot) < pSpan * 0.025;
          if (nearSpot) return null;
          return (
            <text key={`yl${s}`} x={PAD.left - 6} y={y + 3} textAnchor="end"
              fill="#6b7280" fontSize={9} fontFamily={mono}>
              {dp(s)}
            </text>
          );
        })}

        {/* X-axis baseline + date labels */}
        <line x1={PAD.left} y1={PAD.top + chartH}
          x2={PAD.left + chartW} y2={PAD.top + chartH}
          stroke="#1f2937" strokeWidth={1}/>
        {xTicks.map((tk, i) => (
          <g key={`xt${i}`}>
            <line x1={tk.x} y1={PAD.top + chartH}
              x2={tk.x} y2={PAD.top + chartH + 7}
              stroke={tk.isToday ? "#22d3ee" : tk.isAnchor ? "#f59e0b" : "#6b7280"}
              strokeWidth={tk.isToday || tk.isAnchor ? 1.6 : 1.0}/>
            <text x={tk.x} y={PAD.top + chartH + 19} textAnchor="middle"
              fill={tk.isToday ? "#22d3ee" : tk.isAnchor ? "#f59e0b" : "#d1d5db"}
              fontSize={11}
              fontWeight={tk.isToday || tk.isAnchor ? 800 : 600}
              fontFamily={mono}>
              {tk.label}
            </text>
          </g>
        ))}

        {/* X axis title */}
        <text x={PAD.left + chartW / 2} y={mH - 4} textAnchor="middle"
          fill="#9ca3af" fontSize={9} fontWeight={600}
          letterSpacing="1.8" fontFamily={mono}>
          {monthLabel} · {isPrev ? "PREVIOUS MONTH" : "CURRENT MONTH"} · {nDays} TRADING DAYS
        </text>

        {/* ═════ TERMINAL DISTRIBUTION (right panel) ═════ */}
        <rect x={profileX - PAD.right + 8} y={PAD.top}
          width={PROFILE_W} height={chartH}
          fill="#0b0f17" stroke="#1f2937" strokeWidth={1}/>

        <text x={profileX - PAD.right + 18} y={PAD.top + 16}
          fill="#ffffff" fontSize={9} fontWeight={800}
          letterSpacing="1.8" fontFamily={mono}>TERMINAL DISTRIBUTION</text>
        <text x={profileX - PAD.right + PROFILE_W - 8} y={PAD.top + 16}
          textAnchor="end" fill="#6b7280" fontSize={8} fontFamily={mono}>
          {monthLabel} END
        </text>
        <line x1={profileX - PAD.right + 14} y1={PAD.top + 22}
          x2={profileX - PAD.right + PROFILE_W - 8} y2={PAD.top + 22}
          stroke="#1f2937" strokeWidth={0.8}/>

        {/* Histogram bars from terminal profile */}
        {(() => {
          const bars = [];
          const baseX = profileX - PAD.right + 14;
          const maxBarW = PROFILE_W - 70;
          if (maxProf <= 0) return null;
          for (let p = 0; p < nPrices; p++) {
            const v = terminalProfile[p];
            if (v <= maxProf * 0.02) continue;
            const price = prices[p];
            if (price < pLo || price > pHi) continue;
            const w = (v / maxProf) * maxBarW;
            const y = priceToY(price) - cellH / 2;
            const col = heatColor(v, maxProf * 0.7);
            if (!col) continue;
            bars.push(
              <rect key={`pb${p}`} x={baseX} y={y} width={w} height={cellH}
                fill={col} shapeRendering="optimizeSpeed"/>
            );
          }
          return bars;
        })()}

        {/* Peak density line */}
        {peakPrice != null && (() => {
          const py = priceToY(peakPrice);
          if (py < PAD.top || py > PAD.top + chartH) return null;
          const baseX = profileX - PAD.right + 14;
          const endX  = profileX - PAD.right + PROFILE_W - 8;
          return (
            <g>
              <line x1={baseX} y1={py} x2={endX} y2={py}
                stroke="#f59e0b" strokeWidth={1.3} strokeDasharray="3 2" opacity={0.95}/>
              <text x={endX} y={py - 14} textAnchor="end"
                fill="#f59e0b" fontSize={8} fontWeight={800} fontFamily={mono}>
                PEAK
              </text>
              <text x={endX} y={py - 4} textAnchor="end"
                fill="#f59e0b" fontSize={8} fontWeight={800} fontFamily={mono}>
                DENSITY
              </text>
              <text x={endX} y={py + 12} textAnchor="end"
                fill="#ffffff" fontSize={9} fontWeight={800} fontFamily={mono}>
                ${dp(peakPrice)}
              </text>
            </g>
          );
        })()}

        {/* Current spot marker on profile — hide in PREVIOUS mode */}
        {!isPrev && topSpot != null && (() => {
          const sy = priceToY(topSpot);
          if (sy < PAD.top || sy > PAD.top + chartH) return null;
          const baseX = profileX - PAD.right + 14;
          return (
            <g>
              <line x1={baseX} y1={sy} x2={baseX + 14} y2={sy}
                stroke="#22d3ee" strokeWidth={1.5}/>
              <text x={profileX - PAD.right + PROFILE_W - 8} y={sy + 3} textAnchor="end"
                fill="#22d3ee" fontSize={8} fontWeight={700} fontFamily={mono}>
                LAST
              </text>
            </g>
          );
        })()}

        <text x={profileX - PAD.right + 14} y={PAD.top + chartH - 22}
          fill="#6b7280" fontSize={7} fontFamily={mono}>
          Aggregate density at horizon
        </text>
        <text x={profileX - PAD.right + 14} y={PAD.top + chartH - 11}
          fill="#6b7280" fontSize={7} fontFamily={mono}>
          Warm = high probability
        </text>

        {/* ═════ CROSSHAIR + TOOLTIP ═════ */}
        {hoverPos && tip && (() => {
          const ttX = hoverPos.x + 16;
          const ttY = hoverPos.y + 14;
          const ttW = 184;
          const ttH = 116;
          const ttFinalX = ttX + ttW > PAD.left + chartW ? hoverPos.x - ttW - 12 : ttX;
          const ttFinalY = ttY + ttH > PAD.top + chartH ? hoverPos.y - ttH - 12 : ttY;
          return (
            <g pointerEvents="none">
              {/* Crosshair lines */}
              <line x1={PAD.left} y1={hoverPos.y} x2={PAD.left + chartW} y2={hoverPos.y}
                stroke="#ffffff" strokeWidth={0.7} strokeDasharray="3 3" opacity={0.45}/>
              <line x1={hoverPos.x} y1={PAD.top} x2={hoverPos.x} y2={PAD.top + chartH}
                stroke="#ffffff" strokeWidth={0.7} strokeDasharray="3 3" opacity={0.4}/>

              {/* Y-axis price chip */}
              <rect x={2} y={hoverPos.y - 9} width={PAD.left - 4} height={18}
                fill="#1f2937" stroke="#374151" strokeWidth={0.6} rx={2}/>
              <text x={PAD.left/2} y={hoverPos.y + 4} textAnchor="middle"
                fill="#ffffff" fontSize={9} fontWeight={700} fontFamily={mono}>
                {dp(tip.hPrice)}
              </text>

              {/* X-axis day chip */}
              <rect x={hoverPos.x - 32} y={PAD.top + chartH + 1}
                width={64} height={14}
                fill="#1f2937" stroke="#374151" strokeWidth={0.6} rx={2}/>
              <text x={hoverPos.x} y={PAD.top + chartH + 11} textAnchor="middle"
                fill="#ffffff" fontSize={8} fontWeight={700} fontFamily={mono}>
                {tip.hDateStr ? tip.hDateStr.slice(5) : `D${tip.dIdx}`}
              </text>

              {/* Tooltip box */}
              <rect x={ttFinalX} y={ttFinalY} width={ttW} height={ttH}
                fill="#0b0f17" stroke="#374151" strokeWidth={1} rx={3} opacity={0.97}/>

              <text x={ttFinalX + 10} y={ttFinalY + 16}
                fill="#22d3ee" fontSize={8} fontWeight={700} fontFamily={mono}>DATE</text>
              <text x={ttFinalX + ttW - 10} y={ttFinalY + 16} textAnchor="end"
                fill="#ffffff" fontSize={9} fontWeight={700} fontFamily={mono}>
                {tip.hDateStr || "—"}
              </text>
              <line x1={ttFinalX + 8} y1={ttFinalY + 22}
                x2={ttFinalX + ttW - 8} y2={ttFinalY + 22}
                stroke="#374151" strokeWidth={0.5}/>

              <text x={ttFinalX + 10} y={ttFinalY + 36}
                fill="#6b7280" fontSize={8} fontFamily={mono}>PRICE</text>
              <text x={ttFinalX + ttW - 10} y={ttFinalY + 36} textAnchor="end"
                fill="#ffffff" fontSize={9} fontWeight={700} fontFamily={mono}>
                ${dp(tip.hPrice)}
              </text>

              <text x={ttFinalX + 10} y={ttFinalY + 50}
                fill="#6b7280" fontSize={8} fontFamily={mono}>COMBINED</text>
              <text x={ttFinalX + ttW - 10} y={ttFinalY + 50} textAnchor="end"
                fill="#ffffff" fontSize={9} fontWeight={700} fontFamily={mono}>
                {tip.hPct.toFixed(1)}%
              </text>

              <line x1={ttFinalX + 8} y1={ttFinalY + 58}
                x2={ttFinalX + ttW - 8} y2={ttFinalY + 58}
                stroke="#374151" strokeWidth={0.5}/>

              <text x={ttFinalX + 10} y={ttFinalY + 72}
                fill="#6b7280" fontSize={8} fontFamily={mono}>OPTIONS WEIGHT</text>
              <text x={ttFinalX + ttW - 10} y={ttFinalY + 72} textAnchor="end"
                fill="#facc15" fontSize={9} fontWeight={700} fontFamily={mono}>
                {tip.ow.toFixed(3)}
              </text>

              {hasBandDensity ? (
                <>
                  <text x={ttFinalX + 10} y={ttFinalY + 86}
                    fill="#6b7280" fontSize={8} fontFamily={mono}>BAND DENSITY</text>
                  <text x={ttFinalX + ttW - 10} y={ttFinalY + 86} textAnchor="end"
                    fill="#22d3ee" fontSize={9} fontWeight={700} fontFamily={mono}>
                    {tip.bd.toFixed(3)}
                  </text>
                </>
              ) : (
                <>
                  <text x={ttFinalX + 10} y={ttFinalY + 86}
                    fill="#6b7280" fontSize={8} fontFamily={mono}>SOURCE</text>
                  <text x={ttFinalX + ttW - 10} y={ttFinalY + 86} textAnchor="end"
                    fill={tip.provSource === "ARCHIVE" ? "#22c55e"
                      : tip.provSource === "CARRIED" ? "#facc15"
                      : tip.provSource === "PROJECTED" ? "#a78bfa" : "#6b7280"}
                    fontSize={9} fontWeight={700} fontFamily={mono}>
                    {tip.provSource}
                  </text>
                </>
              )}

              <line x1={ttFinalX + 8} y1={ttFinalY + 94}
                x2={ttFinalX + ttW - 8} y2={ttFinalY + 94}
                stroke="#374151" strokeWidth={0.5}/>

              <text x={ttFinalX + 10} y={ttFinalY + 108}
                fill="#6b7280" fontSize={8} fontFamily={mono}>
                FROM {hasBands ? "MEDIAN" : "CENTER"}
              </text>
              <text x={ttFinalX + ttW - 10} y={ttFinalY + 108} textAnchor="end"
                fill="#f59e0b" fontSize={9} fontWeight={700} fontFamily={mono}>
                {anchorPrice > 0
                  ? `${tip.hPrice > anchorPrice ? "+" : ""}${dp(tip.hPrice - anchorPrice)}`
                  : "—"}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  THE SAUCE — Bespoke Structural Analytics Components
// ══════════════════════════════════════════════════════════════════════════════

function SauceCard({ num, title, sub, badges, explain, children, headline, prefix="THE SAUCE", freshnessBadge, calibratingBadge }) {
  return (
    <div style={{background:C.bgPanel,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden",flexShrink:0}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:1,
        background:`linear-gradient(90deg,transparent,${C.orange},transparent)`,opacity:.35}}/>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
        padding:"12px 14px 0",gap:12}}>
        <div>
          <div style={{fontSize:7,color:"#999",letterSpacing:"2px",marginBottom:4,
            display:"flex",alignItems:"center",gap:5,fontWeight:600}}>
            <span style={{display:"inline-block",width:14,height:1,background:C.orange}}/>
            {prefix} · {num}
          </div>
          <div style={{fontSize:17,fontWeight:800,color:C.orange,letterSpacing:"2px",
            fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{title}</div>
          {sub && <div style={{fontSize:8,color:"#888",letterSpacing:"0.5px",marginTop:3,
            fontFamily:"'DM Sans',sans-serif"}}>{sub}</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
          {badges && (
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {badges.map((b,i) => (
                <span key={i} style={{fontSize:8,padding:"3px 7px",border:`1px solid ${b.color}50`,
                  color:b.color,background:`${b.color}15`,fontWeight:700,letterSpacing:"0.5px",
                  whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif"}}>{b.label}</span>
              ))}
            </div>
          )}
          {(freshnessBadge || calibratingBadge) && (
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {calibratingBadge}
              {freshnessBadge}
            </div>
          )}
        </div>
      </div>
      {headline && (
        <div style={{margin:"10px 14px 0",padding:"10px 13px",background:"#101010",
          borderLeft:`3px solid ${C.orange}`,border:`1px solid ${C.border}`,
          borderLeftColor:C.orange,
          fontSize:12,color:"#ececec",lineHeight:1.5,fontWeight:500,
          fontFamily:"'DM Sans',sans-serif"}}>
          {headline}
        </div>
      )}
      {explain && (
        <div style={{margin:"10px 14px 0",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,
          background:C.border,border:`1px solid ${C.border}`}}>
          {explain.map((e,i) => (
            <div key={i} style={{background:C.bgCard,padding:"10px 11px",
              display:"flex",flexDirection:"column",gap:5}}>
              <div style={{fontSize:8,color:C.orange,letterSpacing:"1.8px",fontWeight:700,
                display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:11}}>{e.icon}</span> {e.title}
              </div>
              <div style={{fontSize:11,color:"#c8c8c8",lineHeight:1.55,
                fontFamily:"'DM Sans',sans-serif"}}>
                {e.body}
              </div>
              {e.pills && (
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>
                  {e.pills.map((p,j) => (
                    <span key={j} style={{fontSize:8,padding:"2px 7px",
                      border:`1px solid ${p.ok?C.green:C.red}40`,
                      color:p.ok?C.green:C.red,fontWeight:600,
                      background:p.ok?`${C.green}12`:`${C.red}12`,
                      fontFamily:"'DM Sans',sans-serif"}}>{p.label}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{padding:"10px 14px 14px"}}>{children}</div>
    </div>
  );
}

function SauceVerdict({ color, icon, text }) {
  const bgMap = {"#00c853":"#00140a","#f44336":"#140004","#ffab00":"#0d0a00"};
  return (
    <div style={{background:bgMap[color]||C.bgCard,borderLeft:`3px solid ${color}`,
      padding:"7px 10px",fontSize:9,color:"#888",lineHeight:1.55,
      fontFamily:"'DM Sans',sans-serif"}}>
      {icon} <strong style={{color:C.white,fontWeight:600}}>{text}</strong>
    </div>
  );
}

// ── Structural Integrity ──
// v42: font bumps (header 6→10, strike 8→11, hardness sub-label 6→9, GEX
//      8→11, friction 7→10); GEX cell uses fmtB() so sub-billion strikes
//      show "+340M" instead of "+0.0B"; spot row gets explicit "← SPOT"
//      label; synthesis "▶ READ" line at the top summarizing the
//      support/resistance balance.
function StructuralIntegrityCard({ data, dp = v => v != null ? Number(v).toFixed(2) : "—" }) {
  if (!data?.levels?.length) return <div style={{fontSize:11,color:C.muted}}>No data</div>;
  // Display highest strike at top (ceiling/resistance), lowest at bottom (floor/support)
  const levels = [...data.levels].reverse();
  const hdr = {fontSize:10,color:C.gray,letterSpacing:"1.5px",padding:"6px 8px",
               textAlign:"center",fontWeight:700,fontFamily:mono};

  // Synthesis: count reinforced floors below spot vs reinforced ceilings above.
  // `data.levels` is in ascending strike order (then reversed for render); use
  // the original ascending order for the spot-split logic.
  const ascLevels = data.levels;
  const spotIdx   = ascLevels.findIndex(l => l.is_spot);
  const below     = spotIdx >= 0 ? ascLevels.slice(0, spotIdx)     : [];
  const above     = spotIdx >= 0 ? ascLevels.slice(spotIdx + 1)    : [];
  const supportN  = below.filter(l => l.gex_norm >  0.10).length;
  const resistN   = above.filter(l => l.gex_norm >  0.10).length;
  const synth =
      supportN > resistN
        ? `Support reads structurally stronger than resistance (${supportN} reinforced floor${supportN===1?"":"s"} below spot vs ${resistN} above). Bias longs near floors, fade rallies into thin overhead.`
    : resistN > supportN
        ? `Resistance reads structurally stronger than support (${resistN} reinforced ceiling${resistN===1?"":"s"} above spot vs ${supportN} below). Bias shorts near ceilings, fade dips into thin support.`
    :   `Support and resistance roughly balanced (${supportN} reinforced below vs ${resistN} above). Trade the cleaner level pairs, not directional bias.`;
  const synthCol = supportN > resistN ? C.green
                 : resistN > supportN ? C.red
                 :                      C.gray;

  return (
    <div>
      {/* v42: synthesis "▶ READ" line — same pattern as Card L01 v40. */}
      <div style={{
        marginBottom:10, padding:"8px 12px",
        background:"#0a0a0a", borderLeft:`3px solid ${synthCol}`,
        fontSize:11, color:"#ddd", lineHeight:1.5,
        fontFamily:"'DM Sans',sans-serif",
      }}>
        <span style={{color:synthCol, fontFamily:mono, letterSpacing:"2px",
          fontSize:10, fontWeight:800, marginRight:8}}>▶ READ</span>
        {synth}
      </div>

      <div style={{border:`1px solid ${C.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:"95px 110px 1fr 80px 80px",
          borderBottom:`1px solid ${C.border}`}}>
          <div style={hdr}>LEVEL</div><div style={hdr}>HARDNESS</div>
          <div style={hdr}>GAMMA DENSITY</div><div style={hdr}>GEX</div><div style={hdr}>FRICTION</div>
        </div>
        {levels.map((l,i) => (
          <div key={i} style={{display:"grid",gridTemplateColumns:"95px 110px 1fr 80px 80px",
            alignItems:"center",borderBottom:i<levels.length-1?`1px solid ${C.border}`:"none",
            background:l.is_spot?`${C.orange}08`:"transparent",
            borderTop:l.is_spot?`1px solid ${C.orange}30`:"none",
            transition:"background .15s"}}>
            <div style={{fontSize:11,padding:"7px 8px",textAlign:"center",
              color:l.is_spot?C.orange:l.color,fontWeight:l.is_spot?700:400,fontFamily:mono,
              display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span>{dp(l.strike)}</span>
              {l.is_spot && (
                <span style={{fontSize:9,color:C.orange,letterSpacing:"1px",
                  fontWeight:700,fontFamily:mono}}>
                  ← SPOT
                </span>
              )}
            </div>
            <div style={{padding:"5px 6px",textAlign:"center"}}>
              <div style={{fontSize:13}}>{l.icon}</div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.5px",color:l.color,
                textTransform:"uppercase",marginTop:2}}>{l.hardness}</div>
            </div>
            <div style={{padding:"4px 8px"}}>
              <div style={{height:16,background:"#080808",border:`1px solid ${C.border}`,
                position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:1,
                  background:C.borderLt,zIndex:1}}/>
                <div style={{position:"absolute",top:0,bottom:0,
                  ...(l.gex_norm>=0
                    ? {left:"50%",width:`${Math.abs(l.gex_norm)*50}%`}
                    : {right:"50%",width:`${Math.abs(l.gex_norm)*50}%`}),
                  background:`linear-gradient(${l.gex_norm>=0?"90deg":"270deg"},${l.color}10,${l.color}60)`,
                }}/>
              </div>
            </div>
            <div style={{fontSize:11,textAlign:"center",color:l.color,fontWeight:700,fontFamily:mono}}>
              {l.gex>0?"+":""}{fmtB(l.gex)}
            </div>
            <div style={{fontSize:10,textAlign:"center",color:l.color,
              fontFamily:"'DM Sans',sans-serif"}}>{l.friction}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini sparkline (reusable for per-card session-trajectory placeholders) ──
//
// v25 — Small responsive SVG sparkline.
// v26 — Added optional `zones` prop. Each zone = { upTo, color, label }.
// v27 — Sans font in SVG, smaller in-chart label.
// v29 — Cleaner default visual: filled bands OFF by default; in-chart zone
//       labels REMOVED in favor of a right-margin label column;
//       dashed threshold lines at zone boundaries; bigger current dot
//       with halo; thicker line (2px) with rounded caps. Old props
//       `refLines` and `showZoneLabels` retained for back-compat (former
//       still works; latter ignored). New props: `bands` (default false),
//       `rightMargin` (default 110, width reserved for the zone label
//       column inside the SVG viewBox), `thresholdLines` (default true).
function MiniSparkline({
  series, width = 320, height = 50,
  refLines = [], color = "#888", currentColor,
  zones = null,
  bands = false,            // v29: filled background bands (was always-on, now opt-in)
  thresholdLines = true,    // v29: dashed lines at zone boundaries
  rightMargin = 110,        // v29: SVG units reserved for the right-margin label column
}) {
  // v30: measure the container's actual rendered width so the SVG can render
  // at native 1:1 pixels (no preserveAspectRatio="none" stretching). Default
  // to the `width` prop until the first measurement lands.
  const containerRef = useRef(null);
  const [measuredW, setMeasuredW] = useState(width);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0 && Math.round(w) !== measuredW) setMeasuredW(Math.round(w));
    };
    measure();
    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    } else {
      window.addEventListener("resize", measure);
    }
    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", measure);
    };
  // NB: measuredW intentionally NOT a dep — re-running observer on each
  //     measure-driven re-render would tear-down/re-create it pointlessly.
  }, []);

  if (!Array.isArray(series) || series.length < 2) {
    return <div ref={containerRef} style={{width:"100%", height:`${height}px`}}/>;
  }

  // v30: use measured width for ALL layout — viewBox + plot calculations.
  const W = measuredW;
  const plotWidth = zones ? Math.max(40, W - rightMargin) : W;
  const zoneBoundaries = zones ? zones.map(z => z.upTo).filter(b => isFinite(b)) : [];
  const allValues = [...series, ...(refLines || []), ...zoneBoundaries];
  const minS = Math.min(...allValues);
  const maxS = Math.max(...allValues);
  const pad  = (maxS - minS) * 0.1 || 0.1;
  const min = minS - pad;
  const max = maxS + pad;
  const range = max - min || 1;
  const xStep = plotWidth / (series.length - 1);
  const toY = v => height - ((v - min) / range) * height;

  const zoneFor = v => {
    if (!zones) return null;
    for (const z of zones) if (v <= z.upTo) return z;
    return zones[zones.length - 1];
  };

  // v26/v29: visible zones (band bounds + label position)
  const zoneInfo = [];
  if (zones) {
    let prevTop = -Infinity;
    for (const z of zones) {
      const bandBottomVal = Math.max(prevTop, min);
      const bandTopVal    = Math.min(z.upTo, max);
      if (bandTopVal > bandBottomVal) {
        const yTop = toY(bandTopVal);
        const yBot = toY(bandBottomVal);
        zoneInfo.push({
          y: yTop, h: yBot - yTop,
          ymid: (yTop + yBot) / 2,
          color: z.color, label: z.label, upTo: z.upTo,
        });
      }
      prevTop = z.upTo;
    }
  }

  // Per-segment coloring (when zones provided), otherwise fall back to single polyline
  const segments = [];
  if (zones) {
    for (let i = 1; i < series.length; i++) {
      const z  = zoneFor(series[i]);
      const x1 = (i - 1) * xStep;
      const y1 = toY(series[i - 1]);
      const x2 = i * xStep;
      const y2 = toY(series[i]);
      segments.push({ x1, y1, x2, y2, color: z?.color || color });
    }
  }

  const lastIdx  = series.length - 1;
  const cx       = lastIdx * xStep;
  const cy       = toY(series[lastIdx]);
  const lastZone = zoneFor(series[lastIdx]);
  const dotColor = currentColor || lastZone?.color || color;

  return (
    <div ref={containerRef} style={{width:"100%", height:`${height}px`, lineHeight:0}}>
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`}
           style={{display:"block"}}>
      {/* v29: optional filled bands (default off) */}
      {bands && zoneInfo.map((b, i) => (
        <rect key={`band-${i}`} x={0} y={b.y} width={plotWidth} height={b.h}
              fill={b.color} opacity={0.06}/>
      ))}
      {/* v29: dashed threshold lines at zone boundaries (clamped to plot area) */}
      {thresholdLines && zones && zones.slice(0, -1).map((z, i) => {
        const y = toY(z.upTo);
        if (y < 0 || y > height) return null;
        return (
          <line key={`th-${i}`} x1={0} y1={y} x2={plotWidth} y2={y}
                stroke="#2a2a2a" strokeDasharray="2,3" strokeWidth={1}/>
        );
      })}
      {/* Old refLines support (back-compat — only renders if explicitly passed) */}
      {refLines.map((rv, i) => {
        const y = toY(rv);
        return (
          <line key={`ref-${i}`} x1={0} y1={y} x2={plotWidth} y2={y}
                stroke="#3a3a3a" strokeDasharray="3,3" strokeWidth={1}/>
        );
      })}
      {/* Trajectory: per-segment when zones, otherwise single polyline */}
      {zones && segments.length > 0
        ? segments.map((s, i) => (
            <line key={`seg-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                  stroke={s.color} strokeWidth={2} strokeLinecap="round"/>
          ))
        : <polyline points={series.map((v, i) => `${i*xStep},${toY(v)}`).join(" ")}
                    fill="none" stroke={color} strokeWidth={1.6}/>
      }
      {/* v29: current point — halo + dot */}
      <circle cx={cx} cy={cy} r={7} fill={dotColor} opacity={0.22}/>
      <circle cx={cx} cy={cy} r={3.5} fill={dotColor} stroke="#000" strokeWidth={1.2}/>
      {/* v29: right-margin zone labels (replaces in-chart labels). Vertically
          centered in each zone and clamped to chart bounds so they don't clip. */}
      {zones && zoneInfo.map((b, i) => {
        const y = Math.max(10, Math.min(height - 4, b.ymid));
        return b.label ? (
          <text key={`rlbl-${i}`}
                x={plotWidth + 8}
                y={y + 3}
                fontSize={9}
                fill={b.color}
                opacity={0.9}
                fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
                fontWeight={600}
                letterSpacing={0.3}>
            {b.label}
          </text>
        ) : null;
      })}
      </svg>
    </div>
  );
}

// v42: DUMMY_ASYMMETRY_HISTORY + DUMMY_VANNA_PCT_HISTORY removed —
//      DC shipped real signal_history (msg #115). Cards 01 + 02 now
//      read `data.asymmetry_ratio_history` and `vc.vanna_pct_history`
//      directly. See header v42 entry for shape notes.

// ── Dealer's Homework ──
function DealerHomeworkCard({ data, dp = v => v != null ? Number(v).toFixed(2) : "—" }) {
  if (!data?.scenarios?.length) return <div style={{fontSize:7,color:C.muted}}>No data</div>;
  const up1   = data.scenarios.find(s => s.move_pct === 1.0);
  const down1 = data.scenarios.find(s => s.move_pct === -1.0);
  const up05  = data.scenarios.find(s => s.move_pct === 0.5);
  const down05= data.scenarios.find(s => s.move_pct === -0.5);

  // v23: synthesis — regime (amplify vs dampen) + spring_direction interpretation,
  //      pinned at the top of the card so beginners get the takeaway before reading
  //      the four scenario boxes. Spring text matches the prior bottom-footer wording
  //      (which is now removed — folded in here).
  const synthesisLine = (() => {
    if (!up1 || !down1) return null;
    const upAmp   = up1.direction === "BUY";    // BUY on +1% = dealers must buy = amplify up
    const downAmp = down1.direction === "SELL"; // SELL on -1% = dealers must sell = amplify down
    let regime;
    if (upAmp && downAmp)        regime = "Dealers AMPLIFY moves in both directions";
    else if (!upAmp && !downAmp) regime = "Dealers DAMPEN moves — buy dips, sell rips";
    else if (upAmp)              regime = "Dealers AMPLIFY rallies, SUPPORT dips";
    else                         regime = "Dealers FADE rallies, AMPLIFY breakdowns";
    let springAdd = "";
    if (data.spring_direction === "DOWNSIDE")      springAdd = " — downside mechanically amplified, size shorts larger than longs";
    else if (data.spring_direction === "UPSIDE")   springAdd = " — upside has structural backing, breakouts have mechanical support";
    else if (data.spring_direction === "NEUTRAL")  springAdd = " — roughly symmetric in both directions";
    return regime + springAdd + ".";
  })();

  // v23: tornado-bar magnitudes (relative to the larger of the two ±1% flows).
  const upMag    = up1   ? Math.abs(up1.forced_flow)   : 0;
  const downMag  = down1 ? Math.abs(down1.forced_flow) : 0;
  const maxMag   = Math.max(upMag, downMag, 1);
  const upPct    = (upMag   / maxMag) * 100;
  const downPct  = (downMag / maxMag) * 100;
  const upColor  = up1?.direction   === "BUY" ? C.green : C.red;
  const downColor= down1?.direction === "BUY" ? C.green : C.red;

  const ScenarioBox = ({ scenario, isUp }) => {
    if (!scenario) return null;
    const col = isUp ? C.green : C.red;
    const bg  = isUp ? "#00140a" : "#140004";
    const arrow = isUp ? "▲" : "▼";
    // v24 — fonts bumped (label 6→9, blurb 8→10), labels brighter (#444→#bbb / #888→#ccc)
    return (
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"12px 14px",
        position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:col}}/>
        <div style={{fontSize:9,color:"#bbb",letterSpacing:"2px",marginBottom:5,fontWeight:600}}>IF PRICE MOVES</div>
        <div style={{fontSize:18,fontWeight:800,color:col,letterSpacing:"2px",
          fontFamily:"'Bebas Neue',sans-serif",lineHeight:1,marginBottom:10}}>
          {arrow} {scenario.move_pct>0?"+":""}{scenario.move_pct}% → {dp(scenario.target_price)}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"6px 0",borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:10,color:"#bbb",fontWeight:500}}>Net Forced Flow</span>
          <span style={{fontSize:13,fontWeight:800,color:col,fontFamily:"'Bebas Neue',sans-serif",
            letterSpacing:"0.5px"}}>
            {/* v23: dropped `$` prefix — forced_flow is share-equivalent, not $-notional */}
            {scenario.direction} {(Math.abs(scenario.forced_flow)/1e6).toFixed(0)}M
          </span>
        </div>
        <div style={{background:bg,borderLeft:`3px solid ${col}`,padding:"7px 9px",marginTop:6,
          fontSize:10,color:"#ccc",lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>
          {isUp
            ? `Dealers become ${scenario.direction==="BUY"?"buyers — mechanical tailwind":"sellers — headwind"}.`
            : `Dealers become ${scenario.direction==="SELL"?"aggressive sellers — amplified move":"buyers — structural support"}.`}
        </div>
      </div>
    );
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>

      {/* v23/v24: top synthesis — what this means right now, in one sentence.
          v24 — fonts bumped, mono asymmetry line now bright white instead of #444. */}
      {synthesisLine && (
        <div style={{background:"#0d0500",border:`1px solid ${C.orange}25`,
          borderLeft:`3px solid ${C.orange}`,padding:"10px 12px",
          fontSize:12,color:"#e0a050",lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{color:C.orange,fontSize:10,letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>
            WHAT THIS MEANS RIGHT NOW
          </div>
          {synthesisLine}
          {typeof data.asymmetry_ratio === "number" && (
            <div style={{marginTop:6,fontSize:11,color:C.white,fontFamily:mono,letterSpacing:"0.5px",fontWeight:600}}>
              asymmetry {Number(data.asymmetry_ratio).toFixed(2)}× · spring {data.spring_direction || "NEUTRAL"}
            </div>
          )}
        </div>
      )}

      {/* v23: tornado bar — side-by-side magnitude comparison at ±1%.
          v24 — header + label fonts bumped, percent labels brighter (#bbb). */}
      {up1 && down1 && (
        <div>
          <div style={{fontSize:9,color:"#bbb",letterSpacing:"1.5px",marginBottom:5,textAlign:"center",fontWeight:600}}>
            FORCED FLOW @ ±1% — RELATIVE MAGNITUDE
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",height:18}}>
            {/* Left half: −1% scenario, bar grows from RIGHT (center) leftward */}
            <div style={{position:"relative",borderRight:`1px solid ${C.borderLt}`}}>
              <div style={{position:"absolute",right:0,top:0,bottom:0,
                width:`${downPct}%`,
                background:`linear-gradient(270deg, ${downColor}, ${downColor}30)`}}/>
            </div>
            {/* Right half: +1% scenario, bar grows from LEFT (center) rightward */}
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:0,top:0,bottom:0,
                width:`${upPct}%`,
                background:`linear-gradient(90deg, ${upColor}, ${upColor}30)`}}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",marginTop:4,fontSize:11,fontFamily:mono}}>
            <div style={{paddingLeft:2}}>
              <span style={{color:"#bbb"}}>−1%: </span>
              <span style={{color:downColor,fontWeight:700}}>{down1.direction} {(downMag/1e6).toFixed(0)}M</span>
            </div>
            <div style={{paddingRight:2,textAlign:"right"}}>
              <span style={{color:upColor,fontWeight:700}}>{up1.direction} {(upMag/1e6).toFixed(0)}M</span>
              <span style={{color:"#bbb"}}> :+1%</span>
            </div>
          </div>
        </div>
      )}

      {/* v43: session trajectory wired to real DC signal_history (msg #115).
          `data.asymmetry_ratio_history` is a `[{t, v}, ...]` array, 5-min
          cadence (Tier A), 96-entry FIFO cap, reset at 09:30 ET each day.
          ALWAYS renders the header with a state label so the operator
          can tell at a glance whether the field is missing from the
          payload, empty (pre-session), building (1 pt), or live (>=2). */}
      {(() => {
        const histField = data?.asymmetry_ratio_history;
        const fieldAbsent = histField === undefined;
        const histRaw = histField || [];
        const series  = histRaw.map(p => p?.v).filter(v => v != null && isFinite(v));
        const stateLabel = fieldAbsent
          ? { txt: "DATA MISSING — DC field not in this payload", col: C.amber }
          : series.length === 0
          ? { txt: "0 pts · pre-session (resets 09:30 ET)",       col: "#666" }
          : series.length === 1
          ? { txt: "1 pt · building (need 2+)",                   col: "#666" }
          : { txt: `${series.length} pts · 5m`,                   col: "#666" };
        if (series.length < 2) {
          // Diagnostic-only header
          return (
            <div style={{padding:"4px 0"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:9,color:"#bbb",letterSpacing:"1.5px",fontWeight:600}}>
                  SESSION TRAJECTORY — ASYMMETRY RATIO
                </span>
                <span style={{fontSize:8,color:stateLabel.col,letterSpacing:"0.4px",fontFamily:mono,fontWeight:fieldAbsent?700:400}}>
                  {stateLabel.txt}
                </span>
              </div>
            </div>
          );
        }
        const lastVal = series[series.length - 1];
        const interp =
          lastVal > 1.3  ? { label: "DOWNSIDE-SPRING", color: C.red,
                              meaning: "downside is mechanically amplified — dealers must buy heavily on a drop." }
          : lastVal < 0.7 ? { label: "UPSIDE-SPRING",   color: C.green,
                              meaning: "upside has structural backing — breakouts get mechanical support." }
          :                 { label: "NEUTRAL",         color: "#aaa",
                              meaning: "symmetric dealer response in both directions." };
        return (
          <div style={{padding:"4px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:9,color:"#bbb",letterSpacing:"1.5px",fontWeight:600}}>
                SESSION TRAJECTORY — ASYMMETRY RATIO
              </span>
              <span style={{fontSize:8,color:"#666",letterSpacing:"0.4px",fontFamily:mono}}>
                {series.length} pts · 5m
              </span>
            </div>
            <MiniSparkline
              series={series}
              height={80}
              zones={[
                { upTo: 0.7,      color: C.green, label: "UPSIDE-SPRING (bullish)" },
                { upTo: 1.3,      color: "#888",  label: "NEUTRAL" },
                { upTo: Infinity, color: C.red,   label: "DOWNSIDE-SPRING (bearish)" },
              ]}
            />
            <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:8,
                         color:"#999",fontFamily:mono}}>
              <span>open</span>
              <span>now</span>
            </div>
            {/* v26/v27: plain-English interpretation of the current zone */}
            <div style={{marginTop:6,fontSize:10,color:"#ddd",lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>
              Currently <strong style={{color:interp.color,letterSpacing:"0.5px"}}>{interp.label}</strong> — {interp.meaning}
            </div>
          </div>
        );
      })()}

      {/* existing: ±1% scenario boxes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <ScenarioBox scenario={up1} isUp={true}/>
        <ScenarioBox scenario={down1} isUp={false}/>
      </div>

      {/* existing: ±0.5% scenario boxes — `$` prefix dropped per v23.
          v24 — labels bumped (6→9, #444→#bbb), value bumped 12→14. */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {up05 && (
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"9px 13px",
            borderLeft:`3px solid ${C.green}`}}>
            <div style={{fontSize:9,color:"#bbb",letterSpacing:"2px",fontWeight:600,marginBottom:2}}>IF +0.5%</div>
            <div style={{fontSize:14,fontWeight:800,color:C.green,fontFamily:"'Bebas Neue',sans-serif"}}>
              {up05.direction} {(Math.abs(up05.forced_flow)/1e6).toFixed(0)}M
            </div>
          </div>
        )}
        {down05 && (
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"9px 13px",
            borderLeft:`3px solid ${C.red}`}}>
            <div style={{fontSize:9,color:"#bbb",letterSpacing:"2px",fontWeight:600,marginBottom:2}}>IF −0.5%</div>
            <div style={{fontSize:14,fontWeight:800,color:C.red,fontFamily:"'Bebas Neue',sans-serif"}}>
              {down05.direction} {(Math.abs(down05.forced_flow)/1e6).toFixed(0)}M
            </div>
          </div>
        )}
      </div>

      {/* v23: footer note — explains the unit so "42M" doesn't read as dollars.
          v24 — bumped 7→9 + #444→#999. */}
      <div style={{fontSize:9,color:"#999",fontStyle:"italic",textAlign:"right",
        paddingRight:4,lineHeight:1.4}}>
        Forced-flow values are share-equivalent dealer-delta exposure (×100 contract multiplier applied), not $-notional.
      </div>

      {/* v23: previous bottom asymmetry-footer block removed — folded into the top synthesis */}
    </div>
  );
}

// ── Volatility Gravity ──
function VolatilityGravityCard({ data, dp = v => v != null ? Number(v).toFixed(2) : "—" }) {
  if (!data?.levels?.length) return <div style={{fontSize:7,color:C.muted}}>No data</div>;
  // Display highest strike at top (ceiling), lowest at bottom (floor)
  const levels = [...data.levels].reverse();
  const hdr = {fontSize:6,color:C.muted,letterSpacing:"1.5px",padding:"5px 4px",textAlign:"center"};
  return (
    <div style={{border:`1px solid ${C.border}`}}>
      <div style={{display:"grid",gridTemplateColumns:"36px 65px 1fr 50px 1fr",
        borderBottom:`1px solid ${C.border}`}}>
        <div style={hdr}>TYPE</div><div style={hdr}>STRIKE</div>
        <div style={hdr}>FORCE</div><div style={hdr}>CLASS</div><div style={{...hdr,textAlign:"left",paddingLeft:8}}>BEHAVIOR</div>
      </div>
      {levels.map((l,i) => (
        <div key={i} style={{display:"grid",gridTemplateColumns:"36px 65px 1fr 50px 1fr",
          alignItems:"center",borderBottom:i<levels.length-1?`1px solid ${C.border}`:"none",
          transition:"background .15s"}}
          onMouseEnter={e=>e.currentTarget.style.background=C.bgCard}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{fontSize:14,textAlign:"center",padding:"6px 2px"}}>{l.icon}</div>
          <div style={{fontSize:8,textAlign:"center",color:C.white,fontFamily:mono}}>{dp(l.strike)}</div>
          <div style={{padding:"4px 10px"}}>
            <div style={{height:5,background:"#080808",border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${l.strength}%`,background:l.color,
                transition:"width .6s ease"}}/>
            </div>
          </div>
          <div style={{fontSize:6,fontWeight:700,letterSpacing:"1.5px",textAlign:"center",
            color:l.color}}>{l.label}</div>
          <div style={{fontSize:7,color:C.gray,fontFamily:"'DM Sans',sans-serif",
            padding:"6px 8px",lineHeight:1.4}}>{l.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ── Retail Trap ──
// v11: subscription-grade retail-trap card. Reads retail-v2 fields with
// graceful v1 fallback. Big visual hero, three-pillar driver grid, radial
// crowding gauge, 8-input diagnostic grid, verdict callout.
function RetailTrapCard({ data, cachedAt }) {
  if (!data) return <div style={{fontSize:7,color:C.muted,padding:14}}>No data</div>;
  const isActive = data.status === "TRAP_ACTIVE";

  const accent       = isActive ? C.red : C.green;
  const accentBg     = isActive ? "rgba(232,56,59,0.06)" : "rgba(46,189,89,0.05)";
  const accentBorder = isActive ? "rgba(232,56,59,0.45)" : "rgba(46,189,89,0.30)";

  const positioning = data.retail_positioning || "—";
  const posCol =
    positioning === "CROWDED_LONG"  ? C.red :
    positioning === "CROWDED_SHORT" ? C.green :
                                      C.gray;
  // v13: consumer-friendly labels (no internal state names).
  const posLabel =
    positioning === "CROWDED_LONG"  ? "RETAIL LONG" :
    positioning === "CROWDED_SHORT" ? "RETAIL SHORT" :
    positioning === "NEUTRAL"       ? "BALANCED" : "—";

  const score = typeof data.retail_crowding_score === "number" ? data.retail_crowding_score : null;
  const scorePct = score != null ? Math.round(score * 100) : null;
  const scoreCol = score == null ? C.muted
                  : score >= 0.75 ? C.red
                  : score >= 0.55 ? C.amber
                  :                 C.green;

  const conf = (data.retail_confidence || "").toLowerCase();
  const confCol = conf === "high" ? C.green : conf === "medium" ? C.amber : conf === "low" ? C.red : C.muted;

  const gex = data.gex_regime || "—";
  const gexCol = gex === "NEGATIVE" ? C.red : gex === "POSITIVE" ? C.green : C.gray;

  const ivSig = (data.iv_signal || "").replace(/_/g, " ");
  const ivCol = data.iv_signal?.includes("FADE")     ? C.red
              : data.iv_signal?.includes("BREAKOUT") ? C.green
              : data.iv_signal?.includes("CHEAP")    ? C.amber
              : C.gray;

  const inputs = data.retail_inputs || {};
  const fmt = (v, dec=2, suffix="") => {
    if (v == null || !isFinite(v)) return "—";
    return Number(v).toFixed(dec) + suffix;
  };
  const fmtPct = (v, dec=1) => {
    if (v == null || !isFinite(v)) return "—";
    return (Number(v) * 100).toFixed(dec) + "%";
  };

  // Mini stat tile (v12: brighter, larger labels)
  const Tile = ({ label, value, sub, color = C.white }) => (
    <div style={{background:C.bgCard, padding:"7px 9px", border:`1px solid ${C.border}`,
                 borderRadius:2}}>
      <div style={{fontSize:9, color:C.gray, letterSpacing:"1px", marginBottom:3, fontWeight:600}}>{label}</div>
      <div style={{fontSize:13, fontWeight:800, color, fontFamily:mono, lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:9, color:C.gray, marginTop:3, fontFamily:mono}}>{sub}</div>}
    </div>
  );

  // Inline radial gauge for crowding score (SVG, very lightweight)
  // v33: adds a small amber tick at 65% (the CROWDED_* threshold) so pros
  //      can see distance-to-trap at a glance. Geometry: track starts at the
  //      top (rotated -90°) and sweeps clockwise. At 65% the angle in the
  //      un-rotated frame is -90° + 0.65*360° = 144°. Tick is a short radial
  //      line straddling the track.
  const Gauge = ({ pct, color }) => {
    const r = 22, c = 2 * Math.PI * r;
    const safe = Math.max(0, Math.min(100, pct ?? 0));
    const dash = (safe / 100) * c;
    const tickAngle = (-90 + 0.65 * 360) * Math.PI / 180;
    const tInner = r - 4, tOuter = r + 4;
    const tx1 = 28 + tInner * Math.cos(tickAngle);
    const ty1 = 28 + tInner * Math.sin(tickAngle);
    const tx2 = 28 + tOuter * Math.cos(tickAngle);
    const ty2 = 28 + tOuter * Math.sin(tickAngle);
    return (
      <svg width={56} height={56} viewBox="0 0 56 56" style={{display:"block"}}>
        <circle cx={28} cy={28} r={r} stroke="#1a1a1a" strokeWidth={5} fill="none" />
        <circle cx={28} cy={28} r={r} stroke={color} strokeWidth={5} fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform="rotate(-90 28 28)" />
        {/* 0.65 trap-threshold tick (non-rotated; angle baked in) */}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2}
          stroke={C.amber} strokeWidth={1.5} opacity={0.85}>
          <title>Trap threshold (CROWDED_* fires at 0.65)</title>
        </line>
        <text x={28} y={32} textAnchor="middle"
          fill={color} fontSize={13} fontWeight={800} fontFamily={mono}>
          {pct != null ? pct : "—"}
        </text>
      </svg>
    );
  };

  // v33: "what to actually do" synthesis line that crosses positioning ×
  //      GEX regime into a one-line trader-actionable read. Sits below DC's
  //      headline. Stays in Card 04 only (full multi-signal synthesis is
  //      Options Cockpit Phase 2 work).
  const actionLine = (() => {
    if (!isActive) {
      return "No active retail/institutional divergence — read the GEX regime and skew on their own merit.";
    }
    if (positioning === "CROWDED_LONG" && gex === "NEGATIVE") {
      return "Bias short on bounces — crowded long meets negative dealer γ (downside fuel).";
    }
    if (positioning === "CROWDED_LONG" && gex === "POSITIVE") {
      return "Caution short — crowded long, but positive γ cushions selloffs. Size down, wait for failure.";
    }
    if (positioning === "CROWDED_SHORT" && gex === "POSITIVE") {
      return "Bias long on dips — crowded short meets positive dealer γ (squeeze fuel).";
    }
    if (positioning === "CROWDED_SHORT" && gex === "NEGATIVE") {
      return "Caution long — crowded short, but negative γ adds downside. Wait for failure of the low.";
    }
    return "Trap active but cross-confirmation mixed — wait for GEX regime to align with positioning.";
  })();
  const actionCol = !isActive ? "#9aa" : (
    /Bias /.test(actionLine) ? C.white : C.amber
  );

  return (
    <div style={{
      display:"flex", flexDirection:"column",
      border:`1px solid ${accentBorder}`, background:accentBg, borderRadius:3,
      overflow:"hidden",
    }}>
      {/* HERO ROW: status hero + headline */}
      <div style={{display:"flex", alignItems:"stretch", borderBottom:`1px solid ${C.border}`}}>
        <div style={{
          width:120, flexShrink:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:6, padding:"10px 6px",
          borderRight:`1px solid ${C.border}`,
          background: isActive ? "rgba(232,56,59,0.10)" : "rgba(46,189,89,0.05)",
          position:"relative", overflow:"hidden",
        }}>
          {isActive && <div style={{
            position:"absolute", inset:0, background:accent, opacity:0.06,
            animation:"trapPulse 2s ease-in-out infinite",
          }}/>}
          <div style={{fontSize:32, lineHeight:1}}>{isActive ? "⚠" : "✓"}</div>
          <div style={{
            fontSize:11, fontWeight:800, letterSpacing:"3px", color:accent,
            textAlign:"center", lineHeight:1.3, fontFamily:mono,
          }}>
            {isActive ? "TRAP" : "ALL"}<br/>{isActive ? "ACTIVE" : "CLEAR"}
          </div>
          {/* v13: methodology badge removed — internal detail, not user-facing. */}
        </div>

        <div style={{flex:1, padding:"10px 14px", display:"flex", flexDirection:"column", gap:6, minWidth:0}}>
          <div style={{
            fontSize:13, fontWeight:700, color:isActive?C.red:C.white,
            fontFamily:"'DM Sans',sans-serif", lineHeight:1.35,
          }}>
            {data.headline || "—"}
          </div>
          {/* v33: synthesis "what to actually do" line — translates the
                trap state × GEX regime into a one-line trader read. */}
          <div style={{
            fontSize:11, color:actionCol, fontFamily:"'DM Sans',sans-serif",
            lineHeight:1.4, fontStyle:"italic", marginTop:-2,
          }}>
            → {actionLine}
          </div>
          <div style={{display:"flex", gap:6, flexWrap:"wrap", alignItems:"center"}}>
            {data.price_extreme && data.price_extreme !== "NORMAL" && (
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:"1.5px",
                padding:"3px 8px", color:C.amber, border:`1px solid ${C.amber}55`,
                background:`${C.amber}12`, borderRadius:2, fontFamily:mono,
              }}>
                {data.price_extreme}
              </span>
            )}
            {conf && (
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:"1.5px",
                padding:"3px 8px", color:confCol, border:`1px solid ${confCol}55`,
                background:`${confCol}12`, borderRadius:2, fontFamily:mono,
              }}>
                CONFIDENCE: {conf.toUpperCase()}
              </span>
            )}
            {data.scoring_method && (
              <span style={{fontSize:9, color:C.gray, fontFamily:mono, letterSpacing:"1px"}}>
                · {data.scoring_method}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* THREE-PILLAR GRID + GAUGE */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 100px", gap:1,
                   background:C.border}}>
        <div style={{background:C.bg, padding:"10px 12px"}}>
          <div style={{fontSize:10, color:C.gray, letterSpacing:"1.5px", marginBottom:5, fontWeight:600}}>
            POSITIONING
          </div>
          <div style={{
            fontSize:16, fontWeight:800, color:posCol, fontFamily:"'Bebas Neue',sans-serif",
            letterSpacing:"1.5px", lineHeight:1,
          }}>
            {posLabel}
          </div>
          <div style={{fontSize:10, color:C.gray, marginTop:5, fontFamily:mono}}>
            crowd {scorePct != null ? scorePct + "%" : "—"}
          </div>
        </div>

        <div style={{background:C.bg, padding:"10px 12px"}}>
          <div style={{fontSize:10, color:C.gray, letterSpacing:"1.5px", marginBottom:5, fontWeight:600}}>
            DEALERS (GEX)
          </div>
          <div style={{
            fontSize:16, fontWeight:800, color:gexCol, fontFamily:"'Bebas Neue',sans-serif",
            letterSpacing:"1.5px", lineHeight:1,
          }}>
            {gex} γ
          </div>
          <div style={{fontSize:10, color:C.gray, marginTop:5, fontFamily:mono}}>
            net {fmtB ? fmtB(data.gex_net) : (data.gex_net != null ? Math.round(data.gex_net/1e9)+"B" : "—")}
          </div>
        </div>

        <div style={{background:C.bg, padding:"10px 12px"}}>
          <div style={{fontSize:10, color:C.gray, letterSpacing:"1.5px", marginBottom:5, fontWeight:600}}>
            VOLATILITY
          </div>
          <div style={{
            fontSize:16, fontWeight:800, color:ivCol, fontFamily:"'Bebas Neue',sans-serif",
            letterSpacing:"1.5px", lineHeight:1,
          }}>
            {ivSig || "—"}
          </div>
          <div style={{fontSize:10, color:C.gray, marginTop:5, fontFamily:mono}}>
            P/C {data.pc_oi_ratio != null ? data.pc_oi_ratio.toFixed(2) : "—"}
            {data.pc_sentiment ? " · " + data.pc_sentiment.toLowerCase() : ""}
          </div>
        </div>

        <div style={{background:C.bg, display:"flex", flexDirection:"column", alignItems:"center",
                     justifyContent:"center", padding:"6px", gap:3}}>
          <div style={{fontSize:10, color:C.gray, letterSpacing:"1.2px", fontWeight:700, fontFamily:mono}}>
            CROWD INTENSITY
          </div>
          <Gauge pct={scorePct} color={scoreCol} />
          <div style={{fontSize:8, color:C.gray, fontFamily:mono, letterSpacing:"1px"}}>
            0 CALM · 100 FRENZY
          </div>
        </div>
      </div>

      {/* INPUT DIAGNOSTICS GRID — only when v2 inputs present */}
      {Object.keys(inputs).length > 0 && (
        <div style={{padding:"10px 12px", borderTop:`1px solid ${C.border}`}}>
          <div style={{fontSize:10, color:C.gray, letterSpacing:"2px", marginBottom:8, fontFamily:mono, fontWeight:700}}>
            CROWDING INPUTS
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:5}}>
            <Tile label="0DTE CALL VOL %" value={fmtPct(inputs.zdte_call_volume_share)} sub="of total day" />
            <Tile label="0DTE PUT VOL %"  value={fmtPct(inputs.zdte_put_volume_share)}  sub="of total day" />
            <Tile label="0DTE P/C VOL"    value={fmt(inputs.zdte_pc_volume_ratio, 2, "×")}
                  color={inputs.zdte_pc_volume_ratio > 1.2 ? C.red : inputs.zdte_pc_volume_ratio < 0.8 ? C.green : C.white}
                  sub=">1.2 fear · <0.8 fomo" />
            <Tile label="WK P/C OI Δ"     value={fmtPct(inputs.weekly_pc_oi_delta, 1)}
                  color={inputs.weekly_pc_oi_delta > 0.10 ? C.amber : inputs.weekly_pc_oi_delta < -0.10 ? C.green : C.white}
                  sub="vs yest" />
            {/* v33: ROUND OI CONC kept in grid for back-compat / pro readers,
                  but greyed + relabeled NON-DIRECTIONAL. Per DC's 1d-C fix
                  this input was dropped from the directional crowding sum
                  because high-strike-count chains were biasing it long. */}
            <Tile label="ROUND OI CONC"   value={fmt(inputs.round_number_oi_concentration, 3)}
                  color={C.gray}
                  sub="non-directional · diag" />
            <Tile label="OTM PUT SKEW"    value={fmtPct(inputs.far_otm_put_skew, 1)}
                  color={inputs.far_otm_put_skew > 0.10 ? C.red : C.white}
                  sub="25Δ put vs ATM" />
            <Tile label="OTM CALL SKEW"   value={fmtPct(inputs.far_otm_call_skew, 1)}
                  color={inputs.far_otm_call_skew > 0.05 ? C.amber : C.white}
                  sub="25Δ call vs ATM" />
            <Tile label="ATM OI Δ 1D"     value={fmtPct(inputs.atm_oi_delta_1d, 1)}
                  color={Math.abs(inputs.atm_oi_delta_1d ?? 0) > 0.20 ? C.amber : C.white}
                  sub="signed" />
          </div>
          {inputs._etf_flow_not_implemented && (
            <div style={{fontSize:9, color:C.gray, marginTop:8, fontFamily:mono, letterSpacing:"1px"}}>
              · leveraged ETF flow signal: not yet implemented in DC
            </div>
          )}
        </div>
      )}

      {/* v33: ROUND-STRIKE OI HHI — standalone diagnostic block introduced
            in DC 1d-C. Same underlying value as the ROUND OI CONC tile
            above, but rendered with DC's `interpretation` text so the
            non-directional read is actually visible. Renders only when DC
            ships the field. */}
      {data.round_number_oi_hhi && (
        <div style={{
          padding:"9px 14px", borderTop:`1px solid ${C.border}`,
          display:"flex", alignItems:"center", gap:14,
          background:"#0a0a0a",
        }}>
          <div style={{flexShrink:0}}>
            <div style={{
              fontSize:9, color:C.gray, letterSpacing:"1.5px",
              fontFamily:mono, fontWeight:700,
            }}>
              ROUND-STRIKE OI HHI
            </div>
            <div style={{
              fontSize:8, color:"#666", letterSpacing:"1px",
              fontFamily:mono, marginTop:2,
            }}>
              diagnostic · non-directional
            </div>
          </div>
          <div style={{
            fontSize:14, fontWeight:800, color:C.white, fontFamily:mono,
            flexShrink:0, padding:"4px 10px", border:`1px solid ${C.border}`,
            background:C.bgCard, borderRadius:2, lineHeight:1,
          }}>
            {fmt(data.round_number_oi_hhi.value, 3)}
          </div>
          <div style={{
            flex:1, fontSize:11, color:"#bbb", lineHeight:1.4,
            fontFamily:"'DM Sans',sans-serif",
          }}>
            {data.round_number_oi_hhi.interpretation || "—"}
          </div>
        </div>
      )}

      {/* VERDICT CALLOUT */}
      {data.verdict && (
        <div style={{
          margin:"0", padding:"10px 14px",
          background:isActive ? "rgba(232,56,59,0.08)" : "rgba(46,189,89,0.04)",
          borderTop:`1px solid ${C.border}`,
          borderLeft:`3px solid ${accent}`,
          fontSize:11, color:"#ccc", lineHeight:1.55,
          fontFamily:"'DM Sans',sans-serif",
        }}>
          <div>
            <span style={{color:accent, fontWeight:800, marginRight:8, fontFamily:mono, letterSpacing:"2px", fontSize:10}}>
              {isActive ? "▶ TRAP" : "▶ STATUS"}
            </span>
            {/* v44: dropped client-side `(vN)` regex strip — DC #111
                 shipped producer-side cleanup, the verdict arrives
                 clean now. Kept the lowercase `trap` → `TRAP` cosmetic
                 uppercase since DC said the producer doesn't change
                 case (kept for visual emphasis). */}
            <strong style={{color:C.white, fontWeight:600}}>
              {data.verdict.replace(/\btrap\b/g, "TRAP")}
            </strong>
          </div>
          {/* v11: assessment timestamp — proves when the snapshot was taken
                  for screenshot evidence. */}
          {cachedAt && (() => {
            try {
              const dt = new Date(cachedAt);
              if (isNaN(dt.getTime())) return null;
              const pad = (n) => String(n).padStart(2, "0");
              const stamp =
                `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())} ` +
                `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())} UTC`;
              return (
                <div style={{
                  marginTop: 8, fontSize: 10, color: C.gray,
                  fontFamily: mono, letterSpacing: "1.5px", fontWeight: 600,
                }}>
                  ASSESSED: <span style={{color: C.white, fontWeight: 800}}>{stamp}</span>
                </div>
              );
            } catch {
              return null;
            }
          })()}
        </div>
      )}
    </div>
  );
}

// ── Market Entropy ──
// v35: readability + gauge restack pass.
//  - All labels bumped from 5/6/7 to 9-12 to match Cards 01-04.
//  - Color: prefer DC's `data.color` when present (back-compat) but fall
//    back to threshold-derived (green<0.4, amber<0.7, red≥0.7) instead of
//    bare gray, matching the band thresholds the gauge already uses.
//  - Gauge bar height 8→16 with a tiny pointer-triangle on top of the
//    needle so the position reads at a glance. ORDER/CHAOS legend
//    promoted from font-5 to font-9.
function MarketEntropyCard({ data }) {
  if (!data) return <div style={{fontSize:11,color:C.muted}}>No data</div>;

  // v44: entropy v2 canary — DC msg #117 ships `intraday.{score,state}`
  // alongside the legacy v1 `entropy/state` fields. Read v2 INTRADAY as
  // the primary signal; render v1 as a dimmed comparison line for the
  // canary period. v2 score is 0-1 where 1 = ORDERED (INVERTED from v1
  // where low entropy = ORDERED). Gauge accordingly fills left→right
  // for ORDERED-ness (left = CHAOTIC red, right = ORDERED green).
  const v2          = data.intraday;
  const v2State     = v2?.state;
  const v2Score     = typeof v2?.score === "number" ? v2.score : null;
  const useV2       = v2 !== undefined;
  const isUnknown   = useV2 && (v2State === "UNKNOWN" || v2Score == null);
  const stateColor  = (s) =>
        s === "ORDERED"  ? C.green
      : s === "MODERATE" ? C.amber
      : s === "CHAOTIC"  ? C.red
      :                    C.gray;
  const v1Val       = data.entropy;
  const v1State     = data.state;
  const v1Col       = v1Val == null ? C.gray
                    : v1Val < 0.4   ? C.green
                    : v1Val < 0.7   ? C.amber
                    :                 C.red;

  // Hero pillar values — pick v2 if present, else fall back to v1.
  const heroLabel    = useV2 ? "ENTROPY · v2"  : "ENTROPY";
  const heroVal      = useV2 ? v2Score          : v1Val;
  const heroValStr   = isUnknown          ? "—"
                     : heroVal == null    ? "—"
                     : heroVal.toFixed(2);
  const heroState    = useV2 ? (v2State || "—") : (v1State || "—");
  const heroCol      = useV2 ? stateColor(v2State) : v1Col;
  // Gauge position: v2 fills RIGHT for ORDERED (score*100%); v1 fills
  // RIGHT for CHAOS (entropy*100%).
  const heroPct      = useV2 && v2Score != null
                       ? Math.max(0, Math.min(100, v2Score * 100))
                       : v1Val != null
                       ? Math.max(0, Math.min(100, v1Val * 100))
                       : 0;
  // Bar bands flip based on which version drives the gauge.
  // v2: left red (chaotic), middle amber (moderate), right green (ordered)
  // v1: left green (ordered),  middle amber (moderate), right red    (chaotic)
  const bands = useV2
    ? [{ w:"40%", left:"0",   color:`${C.red}22`   },
       { w:"20%", left:"40%", color:`${C.amber}22` },
       { w:"40%", left:"60%", color:`${C.green}22` }]
    : [{ w:"40%", left:"0",   color:`${C.green}22` },
       { w:"30%", left:"40%", color:`${C.amber}22` },
       { w:"30%", left:"70%", color:`${C.red}22`   }];
  const leftLabel  = useV2 ? "CHAOS" : "ORDER";
  const rightLabel = useV2 ? "ORDER" : "CHAOS";

  return (
    <div style={{display:"flex",gap:10,alignItems:"stretch"}}>
      <div style={{width:160,flexShrink:0,background:C.bgCard,border:`1px solid ${C.border}`,
        padding:"14px 12px",display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",gap:8}}>
        <div style={{fontSize:10,color:C.gray,letterSpacing:"2px",fontWeight:700,fontFamily:mono}}>{heroLabel}</div>
        <div style={{fontSize:26,fontWeight:800,color:heroCol,lineHeight:1,
          fontFamily:"'Bebas Neue',sans-serif",letterSpacing:"2px"}}>
          {heroValStr}
        </div>
        {/* Gauge bar (16px tall) with bands + needle + pointer triangle */}
        <div style={{width:"100%",position:"relative",paddingTop:6}}>
          {!isUnknown && (
            <div style={{
              position:"absolute", top:0, left:`${heroPct}%`,
              transform:"translateX(-50%)",
              width:0, height:0,
              borderLeft:"4px solid transparent",
              borderRight:"4px solid transparent",
              borderTop:`5px solid ${heroCol}`,
            }}/>
          )}
          <div style={{width:"100%",height:16,background:"#080808",border:`1px solid ${C.border}`,
            overflow:"hidden",position:"relative",borderRadius:1}}>
            {bands.map((b,i) => (
              <div key={i} style={{position:"absolute",top:0,bottom:0,
                width:b.w,left:b.left,background:b.color}}/>
            ))}
            {!isUnknown && (
              <div style={{position:"absolute",top:-1,bottom:-1,left:`${heroPct}%`,width:3,
                background:heroCol,boxShadow:`0 0 6px ${heroCol}`,transform:"translateX(-1.5px)"}}/>
            )}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",width:"100%"}}>
          <span style={{fontSize:9,color:C.gray,letterSpacing:"1.2px",fontWeight:600,fontFamily:mono}}>{leftLabel}</span>
          <span style={{fontSize:9,color:C.gray,letterSpacing:"1.2px",fontWeight:600,fontFamily:mono}}>{rightLabel}</span>
        </div>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:"1.5px",color:heroCol,
          fontFamily:"'Bebas Neue',sans-serif",marginTop:2}}>
          {heroState}
        </div>
        {/* v44: legacy v1 comparison line during canary period */}
        {useV2 && v1Val != null && (
          <div style={{
            fontSize:9, color:C.muted, fontFamily:mono, marginTop:2,
            letterSpacing:"0.5px", textAlign:"center", lineHeight:1.3,
          }}>
            v1 legacy: <span style={{color:v1Col,fontWeight:600}}>{v1Val.toFixed(2)} · {v1State || "—"}</span>
          </div>
        )}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
        {data.n_strikes && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"9px",textAlign:"center"}}>
              <div style={{fontSize:9,color:C.gray,letterSpacing:"1.2px",fontWeight:700,fontFamily:mono}}>STRIKES</div>
              <div style={{fontSize:15,fontWeight:800,color:C.white,fontFamily:"'Bebas Neue',sans-serif",marginTop:3}}>
                {data.n_strikes}
              </div>
            </div>
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"9px",textAlign:"center"}}>
              <div style={{fontSize:9,color:C.gray,letterSpacing:"1.2px",fontWeight:700,fontFamily:mono}}>TOP STRIKE</div>
              <div style={{fontSize:15,fontWeight:800,color:C.orange,fontFamily:"'Bebas Neue',sans-serif",marginTop:3}}>
                {data.top_strike}
              </div>
            </div>
            {data.concentration_top5 != null && (
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"9px",textAlign:"center"}}>
                <div style={{fontSize:9,color:C.gray,letterSpacing:"1.2px",fontWeight:700,fontFamily:mono}}>TOP 5 CONC.</div>
                <div style={{fontSize:15,fontWeight:800,
                  color:data.concentration_top5>60?C.green:data.concentration_top5>40?C.amber:C.red,
                  fontFamily:"'Bebas Neue',sans-serif",marginTop:3}}>
                  {data.concentration_top5}%
                </div>
              </div>
            )}
          </div>
        )}
        {/* v44: interpretation block — branched by v2 state when present,
            else falls back to v1 thresholds. UNKNOWN gets a fourth msg. */}
        <div style={{background: useV2
            ? (v2State === "ORDERED"  ? "#00140a"
             : v2State === "MODERATE" ? "#0d0a00"
             : v2State === "CHAOTIC"  ? "#140004"
             :                          "#0d0d0d")
            : (v1Val<.4?"#00140a":v1Val<.7?"#0d0a00":"#140004"),
          borderLeft:`3px solid ${heroCol}`,padding:"10px 12px",
          fontSize:11,color:"#bbb",lineHeight:1.55,fontFamily:"'DM Sans',sans-serif",flex:1}}>
          {useV2 ? (
            v2State === "ORDERED"
              ? <>🟢 <strong style={{color:C.white}}>Tape is ORDERED — clean tradability.</strong> Price action shows structure (low realized vol relative to recent, range-respect intact). Trust signals, size up on confirmed setups. v2 calm-tape fix is working.</>
            : v2State === "MODERATE"
              ? <>🟡 <strong style={{color:C.white}}>Moderate — selective conditions.</strong> Some structure but tape isn't clean. Take the cleanest individual setup, avoid correlated trades.</>
            : v2State === "CHAOTIC"
              ? <>🔴 <strong style={{color:C.white}}>CHAOTIC — sit out or size down.</strong> Realized vol is high relative to recent, range respect broken, signals will whipsaw. Reduce size or prefer cash.</>
            :   <>⚪ <strong style={{color:C.white}}>UNKNOWN — insufficient input data.</strong> Too many features returned null this tick (typical: M5 bars unavailable for this asset). Will resolve once data loads. Don't trade off entropy this session.</>
          ) : (
            v1Val < 0.4
              ? <>🟢 <strong style={{color:C.white}}>Low entropy — strong institutional conviction.</strong> Signals are reliable, momentum trades have backing. Size up on confirmed setups.</>
            : v1Val < 0.7
              ? <>🟡 <strong style={{color:C.white}}>Moderate disorder — selective opportunities.</strong> Look for the cleanest individual setup. Avoid correlated multi-position trades.</>
            :   <>🔴 <strong style={{color:C.white}}>High entropy — chaos. No clear institutional direction.</strong> Reduce size, widen stops, prefer cash. Signals will whipsaw.</>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sauce View Container ──
function SauceView({ sauce, data, asset, cfdRatio = 1, cfdMode = false }) {
  // CFD conversion helper
  const dp = useCallback((v) => {
    if (v == null) return "—";
    if (!cfdMode) return Number(v).toFixed(2);
    const c = v * cfdRatio;
    return c > 1000 ? Math.round(c).toString() : c.toFixed(1);
  }, [cfdMode, cfdRatio]);

  // Inject keyframes for trap pulse animation
  const styleRef = useRef(null);
  useEffect(() => {
    if (styleRef.current) return;
    const style = document.createElement("style");
    style.textContent = `@keyframes trapPulse{0%,100%{opacity:.08}50%{opacity:.18}}`;
    document.head.appendChild(style);
    styleRef.current = style;
    return () => { if (style.parentNode) style.parentNode.removeChild(style); };
  }, []);

  // ── Multi-asset IV skew fetch (for IV Skew Velocity card) ──
  const [otherSkews, setOtherSkews] = useState({});
  useEffect(() => {
    if (!data?.iv_skew) return;
    let cancelled = false;
    const others = ASSETS.filter(a => a !== asset);
    Promise.all(others.map(a =>
      fetch(`/api/options/${a}/full?n=8`)
        .then(r => r.ok ? r.json() : null)
        .then(d => [a, d?.iv_skew || null])
        .catch(() => [a, null])
    )).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(([a, sk]) => { map[a] = sk; });
      setOtherSkews(map);
    });
    return () => { cancelled = true; };
  }, [asset, data?.iv_skew?.skew]);

  const allSkews = useMemo(() => {
    const result = {};
    ASSETS.forEach(a => {
      if (a === asset) result[a] = data?.iv_skew || null;
      else result[a] = otherSkews[a] || null;
    });
    return result;
  }, [asset, data?.iv_skew, otherSkews]);

  if (!sauce) {
    return (
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:10,color:"#888"}}>
        Loading Sauce analytics...
      </div>
    );
  }

  const ivd = data?.iv_divergence;
  const pc  = data?.pc_ratio;
  const em  = data?.expected_move;
  const vc  = data?.vanna_charm;

  // ── Plain-English headlines (for newbies) ──
  const HL_HW   = "Dealers are FORCED to buy or sell at certain price moves — it's not a choice, it's mechanical hedging. This card shows exactly what they must do next.";
  const HL_VC   = "Vanna shows the mechanical buy/sell pressure dealers face when IV moves — the structural bias for the session. Plus, on 0-DTE days, charm pin pressure tells you which way today's expiring options pull price into close.";
  const HL_RT   = "When small traders buy what the big institutions are selling, that's an exit-liquidity trap. This card flags it the moment it activates.";
  const HL_SKEW = "Where the options market is leaning, asset-by-asset. Five gauges — S&P, NASDAQ, Gold, Silver, WTI — show whether puts or calls are getting bid faster, and on which side the demand is building.";
  const HL_ENT  = "Is the options market organized today, or chaotic? Low entropy = clean conviction, signals work. High entropy = whipsaw, signals fail. Read this BEFORE you take a trade.";
  const HL_IV   = "The basic vibe check — are options expensive or cheap? Are bullish bets dominating, or bearish? The session's expected move sets your range.";

  // ── Explain blocks ──
  const EX_HW = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Retail asks <em>"What happened?"</em> This answers <strong style={{color:C.white}}>"What is the dealer forced to do next?"</strong> We calculate the exact dollar amount dealers must buy or sell for each price scenario.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>The dealer's hedging requirements for a 1% move remain <strong style={{color:C.white}}>mathematically constant</strong>. Like knowing the structural load a bridge must bear — the physics doesn't change with a 15-min delay.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<>If +1% forces $200M buying but −1% forces $500M selling → <strong style={{color:C.white}}>the downside is amplified 2.5×</strong>. This tells you which direction the market is "spring-loaded."</>,
      pills:[{label:"Risk asymmetry",ok:true},{label:"Position sizing",ok:true},{label:"Directional bias",ok:true}]},
  ];
  // v29 — rewritten end-to-end for the post-2.3 vanna-only verdict reality.
  // Old content used charm as the actionable example ("$200M Charm…") and
  // taught the misleading "both arrows align = high conviction" rule that
  // the body now rejects. New content: vanna IS the verdict; charm is
  // supplementary; 0-DTE pin pressure is the actionable charm signal.
  const EX_VC = [
    {icon:"📖",title:"WHAT IS THIS",body:<><strong style={{color:C.white}}>Vanna</strong> = how dealer hedging shifts when IV moves — this is <strong style={{color:C.white}}>the verdict</strong>. <strong style={{color:C.white}}>Charm</strong> = how it shifts as time passes; informational here, excluded from the verdict because it explodes near 0-DTE expiry. The actionable charm signal is the separate <strong style={{color:C.white}}>0-DTE pin pressure</strong> block.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>Vanna pressure is <strong style={{color:C.white}}>not opinion — it's physics</strong>. If vanna says STRONG BUY, dealers MUST buy if IV rises. A structural tailwind you can lean on. 0-DTE pin pressure (when present) tells you which way today's expiring options pull price toward close.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<>Read the <strong style={{color:C.white}}>vanna verdict</strong> for the directional setup. Combine with <strong style={{color:C.white}}>0-DTE pin pressure</strong> for intraday timing into close. Pair with the GEX regime for the full picture.</>,
      pills:[{label:"Intraday bias",ok:true},{label:"Session planning",ok:true},{label:"Size management",ok:true}]},
  ];
  // v33 — EX_RT rewritten: dropped the "Turns your 15-min delay into a
  //       confirmation tool" framing. The feed is real-time post-ThetaData
  //       migration, so that line was actively misleading. Replaced with a
  //       cleaner statement of what divergence between retail flow and
  //       institutional GEX means in practice.
  const EX_RT = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Compares <strong style={{color:C.white}}>institutional options positioning</strong> against <strong style={{color:C.white}}>retail sentiment</strong>. When retail buys the dip but institutions hedge for more downside, retail becomes exit liquidity.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>Retail and institutions both leave fingerprints in options flow — short-dated calls and weeklies for retail, dealer GEX and skew for institutions. When the two <strong style={{color:C.white}}>diverge sharply</strong>, the smaller side is usually wrong. This card flags those divergences the moment they appear, so you stop fading the side with the balance sheet.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<><strong style={{color:C.white}}>TRAP ACTIVE = trade with institutions, not retail.</strong> Wait for the trap to spring, then enter with institutional flow.</>,
      pills:[{label:"Counter-retail",ok:true},{label:"Confirmation",ok:true},{label:"Timing",ok:true},{label:"Contrarian for its own sake",ok:false}]},
  ];
  // v31 — rewritten for the post-2.3 5-asset reality + sign convention + 0-DTE.
  const EX_SKEW = [
    {icon:"📖",title:"WHAT IS THIS",body:<>The <strong style={{color:C.white}}>implied volatility skew</strong> = OOM put IV minus OOM call IV at the 25-delta wings. <strong style={{color:C.white}}>Positive skew = puts richer = normal equity skew</strong> (defensive crowd). The velocity shows how fast that gap is moving — building or accelerating in either direction.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>Rising put skew = institutions are <strong style={{color:C.white}}>buying downside protection faster</strong>. Falling skew (or inversion: calls richer than puts) = upside positioning building. Cross-asset divergence — one asset moving opposite to the rest — signals rotation or isolated stress.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<>Velocity ACCELERATING (&gt;0.02 vol-pts/hr) across <strong style={{color:C.white}}>most of the 5 assets in the same direction</strong> = systemic move building. One asset diverging = isolated positioning. The 0-DTE near-ATM mini-skew (when present) tells you which way today's expiring options are leaning. Pair with GEX regime for highest conviction.</>,
      pills:[{label:"Institutional bias",ok:true},{label:"Cross-asset divergence",ok:true},{label:"Exact entry",ok:false}]},
  ];
  const EX_ENT = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Measures how <strong style={{color:C.white}}>"ordered" or "chaotic"</strong> options flow is. Coherent institutional conviction = low entropy. Scattered random positions = high entropy. The market's thermodynamic temperature.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<><strong style={{color:C.white}}>Low Entropy = solid direction</strong> — signals reliable. <strong style={{color:C.white}}>High Entropy = chaos</strong> — everything whipsaws. Knowing this saves you from trading an untradeable market.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<><strong style={{color:C.white}}>High entropy → reduce size, prefer cash.</strong> Low entropy → trust signals, size up. Use per-asset entropy to find the "cleanest" trade today.</>,
      pills:[{label:"Tradability filter",ok:true},{label:"Size management",ok:true},{label:"Asset selection",ok:true}]},
  ];
  const EX_IV = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Measures the options market's <strong style={{color:C.white}}>directional sentiment</strong>. ATM IV vs realized vol shows if options are priced for more or less volatility than what's actually happening.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>When IV is <strong style={{color:C.white}}>rich vs realized</strong>, mean-reversion setups are favored. When IV is cheap, expect breakouts. The P/C ratio confirms institutional bias direction.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<>IV Rich + High P/C = <strong style={{color:C.white}}>bearish institutional positioning</strong>. IV Cheap + Low P/C = bullish. Expected move sets your range for the session.</>,
      pills:[{label:"Session bias",ok:true},{label:"Range estimation",ok:true},{label:"Scalp entries",ok:false}]},
  ];

  return (
    <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"10px 12px",
      display:"flex",flexDirection:"column",gap:12}}>

      {/* ─── ROW 1 (1×2) — Dealer's Homework + Vanna/Charm Pressure (the mechanical truth) ─── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <SauceCard num="01" title="DEALER'S HOMEWORK"
          sub={`WHAT DEALERS ARE MECHANICALLY FORCED TO DO NEXT — SCENARIO TABLE · ${asset}`}
          headline={HL_HW}
          explain={EX_HW}
          badges={[
            {label:"MECHANICAL OBLIGATION",color:C.orange},
            ...(sauce.dealer_scenarios?.asymmetry_ratio
              ? [{label:`${sauce.dealer_scenarios.asymmetry_ratio}× ${sauce.dealer_scenarios.spring_direction}`,
                  color:sauce.dealer_scenarios.spring_direction==="DOWNSIDE"?C.red:
                        sauce.dealer_scenarios.spring_direction==="UPSIDE"?C.green:C.amber}]
              : []),
          ]}
          freshnessBadge={<FreshnessBadge computedAt={(data.dealer_scenarios ?? data.sauce?.dealer_scenarios)?.computed_at} tier="A" showCadence />}>
          <DealerHomeworkCard data={sauce.dealer_scenarios} dp={dp}/>
        </SauceCard>

        {vc && vc.verdict !== "UNKNOWN" ? (
          <SauceCard num="02" title="VANNA / CHARM PRESSURE"
            sub={`MECHANICAL FLOW FROM IV SENSITIVITY + TIME DECAY · ${asset}`}
            headline={HL_VC}
            explain={EX_VC}
            badges={[
              // v28 — dropped redundant VANNA: BUY / CHARM: NEUTRAL badges; verdict is the truth-bearer
              {label:vc.verdict.replace(/_/g," "),
               color:vc.verdict.includes("BUY")?C.green:vc.verdict.includes("SELL")?C.red:C.gray},
            ]}
            freshnessBadge={<FreshnessBadge computedAt={data.vanna_charm?.computed_at} tier="A" showCadence />}
            calibratingBadge={<CalibratingBadge tooltip="Calibrating — vanna_pct cutoffs ±5/±25 + charm_0dte magnitude buckets are PROVISIONAL until DC re-fits against ~30 days of ThetaData history (msg #84). Verdict classification may shift." />}>
            {(() => {
              // v28 — synthesis line: vanna verdict + optional 0-DTE charm pin pressure, plain English.
              const verdictColor = vc.verdict.includes("BUY") ? C.green
                : vc.verdict.includes("SELL") ? C.red : "#bbb";
              const synthHead =
                  vc.verdict === "STRONG_VANNA_BUY"   ? "Vanna pressure is STRONGLY BULLISH"
                : vc.verdict === "VANNA_BUY"          ? "Vanna pressure is BULLISH"
                : vc.verdict === "VANNA_BALANCED"     ? "Vanna pressure is BALANCED"
                : vc.verdict === "VANNA_SELL"         ? "Vanna pressure is BEARISH"
                : vc.verdict === "STRONG_VANNA_SELL"  ? "Vanna pressure is STRONGLY BEARISH"
                : `Vanna verdict: ${vc.verdict}`;
              const synthMid =
                  vc.verdict.includes("BUY")  ? " — if IV rises, dealers must buy the underlying"
                : vc.verdict.includes("SELL") ? " — if IV rises, dealers must sell the underlying"
                :                                " — no directional pressure from vanna right now";
              const c0 = data.charm_0dte;
              const synthCharm = c0
                ? (c0.direction && c0.direction !== "NEUTRAL" && c0.magnitude_bucket
                    ? `, and 0-DTE charm shows ${c0.magnitude_bucket} pin pressure to the ${c0.direction === "BUY" ? "UPSIDE" : "DOWNSIDE"} today.`
                    : `, with 0-DTE charm in ${c0.magnitude_bucket || "LIGHT"} state today.`)
                : ".";

              // v28 — FlowBox now supports primary (verdict-driving) vs informational (gray accent + tag).
              const FlowBox = ({ label, desc, net, dir, pct, icon, isPrimary = true, muteReason }) => {
                const dirCol = dir === "BUY" ? C.green : dir === "SELL" ? C.red : "#999";
                const accentCol = isPrimary ? dirCol : "#666";
                const valueCol  = isPrimary ? dirCol : "#bbb";
                const bg  = isPrimary
                  ? (dir === "BUY" ? "#00140a" : dir === "SELL" ? "#140004" : C.bgCard)
                  : "#080808";
                return (
                  <div style={{flex:1,background:bg,border:`1px solid ${accentCol}30`,padding:"14px",
                    position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:accentCol}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{fontSize:9,color:"#bbb",letterSpacing:"1.5px",fontWeight:600}}>{label}</div>
                      <span style={{fontSize:20}}>{icon}</span>
                    </div>
                    {muteReason && (
                      <div style={{fontSize:8,color:"#888",fontStyle:"italic",marginBottom:6,letterSpacing:"0.4px"}}>
                        {muteReason}
                      </div>
                    )}
                    <div style={{fontSize:24,fontWeight:800,fontFamily:"'Bebas Neue',sans-serif",
                      letterSpacing:"2px",color:valueCol,lineHeight:1}}>
                      {dir || "—"}
                    </div>
                    <div style={{fontSize:10,color:"#bbb",fontFamily:"'DM Sans',sans-serif",marginTop:5,lineHeight:1.45}}>
                      {desc}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <div style={{background:C.bgCard,padding:"6px 10px",border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:9,color:"#bbb",letterSpacing:"1px",fontWeight:600}}>NET FLOW</div>
                        <div style={{fontSize:12,fontWeight:700,color:valueCol,fontFamily:mono}}>
                          {net != null ? fmtB(net) : "—"}
                        </div>
                      </div>
                      <div style={{background:C.bgCard,padding:"6px 10px",border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:9,color:"#bbb",letterSpacing:"1px",fontWeight:600}}>MAGNITUDE</div>
                        <div style={{fontSize:12,fontWeight:700,color:valueCol,fontFamily:mono}}>
                          {pct != null ? `${Math.abs(pct).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>

                  {/* v28: top synthesis — what this means right now, in one sentence (vanna + 0-DTE charm) */}
                  <div style={{background:"#0d0500",border:`1px solid ${C.orange}25`,
                    borderLeft:`3px solid ${C.orange}`,padding:"10px 12px",
                    fontSize:12,color:"#e0a050",lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>
                    <div style={{color:C.orange,fontSize:10,letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>
                      WHAT THIS MEANS RIGHT NOW
                    </div>
                    <span><strong style={{color:verdictColor,letterSpacing:"0.5px"}}>{synthHead}</strong>{synthMid}{synthCharm}</span>
                    {typeof vc.combined_pressure === "number" && (
                      <div style={{marginTop:6,fontSize:11,color:C.white,fontFamily:mono,letterSpacing:"0.5px",fontWeight:600}}>
                        vanna_pct {vc.combined_pressure > 0 ? "+" : ""}{Number(vc.combined_pressure).toFixed(1)}%
                        {" · cutoffs ±5 / ±25"}
                      </div>
                    )}
                  </div>

                  {/* Vanna primary + Charm informational FlowBoxes */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <FlowBox label="VANNA — IV SENSITIVITY" icon="📈"
                      desc={vc.vanna_direction === "BUY"
                        ? "IV rise → dealers must buy → bullish tailwind"
                        : vc.vanna_direction === "SELL"
                        ? "IV rise → dealers must sell → bearish headwind"
                        : "Balanced — no directional IV pressure"}
                      net={vc.vanna_net} dir={vc.vanna_direction} pct={vc.vanna_pct}
                      isPrimary={true}/>
                    <FlowBox label="CHARM — TIME DECAY" icon="⏳"
                      desc={vc.charm_direction === "BUY"
                        ? "Time decay → dealers must buy today (session-wide read)"
                        : vc.charm_direction === "SELL"
                        ? "Time decay → dealers must sell today (session-wide read)"
                        : "Session-wide charm balanced"}
                      net={vc.charm_net} dir={vc.charm_direction} pct={vc.charm_pct}
                      isPrimary={false}
                      muteReason="informational · Δ/year scale, not comparable to vanna_pct"/>
                  </div>

                  {/* v28: charm_0dte mini-block — only when today has a 0-DTE expiry (commodities → null). */}
                  {data.charm_0dte && (() => {
                    const c0 = data.charm_0dte;
                    const dirCol = c0.direction === "BUY" ? C.green
                      : c0.direction === "SELL" ? C.red : "#999";
                    const bucketCol = c0.magnitude_bucket === "HEAVY"   ? C.amber
                      : c0.magnitude_bucket === "MODERATE" ? "#bbb"
                      : "#666";
                    return (
                      <div style={{background:"#0a0606",border:`1px solid ${dirCol}30`,
                        borderLeft:`3px solid ${dirCol}`,padding:"10px 14px",
                        display:"flex",alignItems:"center",gap:14,fontFamily:"'DM Sans',sans-serif"}}>
                        <span style={{fontSize:20}}>📌</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:9,color:"#bbb",letterSpacing:"1.2px",fontWeight:600,marginBottom:3}}>
                            0-DTE PIN PRESSURE — TODAY ONLY
                          </div>
                          <div style={{fontSize:11,color:"#ddd",lineHeight:1.45}}>
                            {c0.direction === "NEUTRAL"
                              ? "Charm balanced — no directional pin pressure today."
                              : <>Pulling <strong style={{color:dirCol,letterSpacing:"0.5px"}}>
                                  {c0.direction === "BUY" ? "UPWARD" : "DOWNWARD"}
                                </strong> (toward {c0.direction === "BUY" ? "calls" : "puts"}) — magnitude{" "}
                                <strong style={{color:bucketCol,letterSpacing:"0.5px"}}>
                                  {c0.magnitude_bucket}
                                </strong>.</>}
                          </div>
                        </div>
                        <div style={{padding:"4px 11px",borderRadius:3,background:`${dirCol}20`,
                          color:dirCol,border:`1px solid ${dirCol}50`,fontSize:11,fontWeight:700,
                          fontFamily:mono,letterSpacing:"0.5px"}}>
                          {c0.direction}
                        </div>
                      </div>
                    );
                  })()}

                  {/* v43: session trajectory wired to real DC signal_history
                      (msg #115). `vc.vanna_pct_history` is a `[{t, v}, ...]`
                      array, 5-min cadence (Tier A), 96-entry FIFO cap, reset
                      at 09:30 ET each day. ALWAYS renders the header with a
                      state label so missing/empty/building/live is visible
                      at a glance. Sparkline only when length >= 2. Zone
                      bands at the verdict cutoffs ±5/±25. */}
                  {(() => {
                    const histField = vc.vanna_pct_history;
                    const fieldAbsent = histField === undefined;
                    const histRaw = histField || [];
                    const series  = histRaw.map(p => p?.v).filter(v => v != null && isFinite(v));
                    const stateLabel = fieldAbsent
                      ? { txt: "DATA MISSING — DC field not in this payload", col: C.amber }
                      : series.length === 0
                      ? { txt: "0 pts · pre-session (resets 09:30 ET)",       col: "#666" }
                      : series.length === 1
                      ? { txt: "1 pt · building (need 2+)",                   col: "#666" }
                      : { txt: `${series.length} pts · 5m`,                   col: "#666" };
                    if (series.length < 2) {
                      return (
                        <div style={{padding:"4px 0"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:9,color:"#bbb",letterSpacing:"1.5px",fontWeight:600}}>
                              SESSION TRAJECTORY — VANNA PRESSURE (vanna_pct)
                            </span>
                            <span style={{fontSize:8,color:stateLabel.col,letterSpacing:"0.4px",fontFamily:mono,fontWeight:fieldAbsent?700:400}}>
                              {stateLabel.txt}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    const last = series[series.length - 1];
                    const interp =
                        last >=  25 ? { label: "STRONG VANNA BUY",  color: C.green,    meaning: "strong bullish dealer-vanna tailwind." }
                      : last >=   5 ? { label: "VANNA BUY",         color: "#7ed87e",  meaning: "directional bullish vanna pressure." }
                      : last <= -25 ? { label: "STRONG VANNA SELL", color: C.red,      meaning: "strong bearish dealer-vanna headwind." }
                      : last <=  -5 ? { label: "VANNA SELL",        color: "#ed8d8d",  meaning: "directional bearish vanna pressure." }
                      :               { label: "VANNA BALANCED",    color: "#aaa",     meaning: "no directional pressure inside the deadband." };
                    return (
                      <div style={{padding:"4px 0"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                          <span style={{fontSize:9,color:"#bbb",letterSpacing:"1.5px",fontWeight:600}}>
                            SESSION TRAJECTORY — VANNA PRESSURE (vanna_pct)
                          </span>
                          <span style={{fontSize:8,color:"#666",letterSpacing:"0.4px",fontFamily:mono}}>
                            {series.length} pts · 5m
                          </span>
                        </div>
                        <MiniSparkline
                          series={series}
                          height={80}
                          zones={[
                            { upTo: -25,      color: C.red,     label: "STRONG SELL" },
                            { upTo:  -5,      color: "#ed8d8d", label: "SELL" },
                            { upTo:   5,      color: "#888",    label: "BALANCED (deadband)" },
                            { upTo:  25,      color: "#7ed87e", label: "BUY" },
                            { upTo: Infinity, color: C.green,   label: "STRONG BUY" },
                          ]}
                        />
                        <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:8,
                                     color:"#999",fontFamily:mono}}>
                          <span>open</span>
                          <span>now</span>
                        </div>
                        <div style={{marginTop:6,fontSize:10,color:"#ddd",lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>
                          Currently <strong style={{color:interp.color,letterSpacing:"0.5px"}}>{interp.label}</strong> — {interp.meaning}
                        </div>
                      </div>
                    );
                  })()}

                  {/* v28/v29: footer note — vanna-only verdict + conditional pointer to the 0-DTE block (only when it actually rendered) */}
                  <div style={{fontSize:9,color:"#999",fontStyle:"italic",textAlign:"right",
                    paddingRight:4,lineHeight:1.4}}>
                    Verdict is vanna-only (per format_version 2.3 — charm excluded due to 1/(2T) singularity at 0-DTE).
                    {data.charm_0dte
                      ? " Today's actionable charm signal is the 0-DTE pin-pressure block above."
                      : " No 0-DTE expiry today on this ticker (commodity options are monthly), so no charm pin-pressure block."}
                  </div>
                </div>
              );
            })()}
          </SauceCard>
        ) : (
          <div style={{background:C.bgPanel,border:`1px solid ${C.border}`,padding:20,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:10,color:"#888",fontFamily:"'DM Sans',sans-serif"}}>
            Vanna / Charm pressure data unavailable for this session
          </div>
        )}
      </div>

      {/* ─── ROW 2 (full) — IV Skew · cross-asset (v31: title de-emphasises noisy velocity, surfaces sign convention) ─── */}
      <SauceCard num="03" title="IV SKEW · CROSS-ASSET"
        sub={`25-DELTA PUT/CALL SKEW · RATE OF CHANGE · ALL 5 ASSETS · ${asset} ACTIVE`}
        headline={HL_SKEW}
        explain={EX_SKEW}
        badges={(() => {
          const sk = data?.iv_skew;
          const vel = sk?.velocity;
          const badges = [];
          if (sk?.skew != null) badges.push({
            label:`SKEW ${sk.skew > 0 ? "+" : ""}${(sk.skew * 100).toFixed(2)}`,
            color:sk.skew > 0.03 ? C.red : sk.skew < -0.01 ? C.green : C.gray
          });
          if (vel?.verdict) badges.push({
            label:vel.verdict.replace(/_/g," "),
            // v31 — STALE_PREV_SNAPSHOT now mapped to amber explicitly (was falling through to muted)
            color:{PUTS_ACCELERATING:C.red,PUTS_BUILDING:C.amber,CALLS_ACCELERATING:C.green,
              CALLS_BUILDING:C.cyan,STABLE:C.gray,STALE_PREV_SNAPSHOT:C.amber}[vel.verdict] || C.muted
          });
          return badges;
        })()}
        freshnessBadge={<FreshnessBadge computedAt={data.iv_skew?.computed_at} tier="A" showCadence />}>
        {(() => {
          // v31 — active-asset synthesis line: skew level + velocity verdict + expiry context + 0-DTE.
          const sk    = data?.iv_skew;
          const vel   = sk?.velocity;
          const sk0   = data?.iv_skew_0dte;
          const skewLevel =
              sk?.skew == null         ? null
            : sk.skew >  0.03          ? { word: "ELEVATED", color: C.red,    blurb: "puts well-bid — defensive positioning" }
            : sk.skew <  0             ? { word: "INVERTED", color: C.green,  blurb: "calls richer than puts — bullish positioning building" }
            :                            { word: "NORMAL",   color: "#bbb",   blurb: "small put premium — typical equity skew" };
          const velPhrase = !vel?.verdict ? null
            : vel.verdict === "PUTS_ACCELERATING"  ? { phrase: "PUTS ACCELERATING",  color: C.red,    blurb: "fear demand rising fast" }
            : vel.verdict === "PUTS_BUILDING"      ? { phrase: "PUTS BUILDING",      color: C.amber,  blurb: "defensive flow incrementally building" }
            : vel.verdict === "CALLS_ACCELERATING" ? { phrase: "CALLS ACCELERATING", color: C.green,  blurb: "upside demand rising fast" }
            : vel.verdict === "CALLS_BUILDING"     ? { phrase: "CALLS BUILDING",     color: C.cyan,   blurb: "modest demand for upside" }
            : vel.verdict === "STABLE"             ? { phrase: "STABLE",             color: "#bbb",   blurb: "no rate-of-change in skew" }
            : vel.verdict === "STALE_PREV_SNAPSHOT"? { phrase: "VELOCITY UNAVAILABLE", color: C.amber, blurb: "sanity gate fired — prev-snapshot rejected as implausible" }
            :                                        { phrase: vel.verdict.replace(/_/g," "), color: "#aaa", blurb: "" };
          const expiryStr = sk?.expiry_dte != null
            ? `${sk.expiry_dte}-DTE chain (${sk.expiry_class || "front"})`
            : "front chain";
          const sk0Tail = sk0?.skew != null
            ? ` 0-DTE near-ATM skew shows ${sk0.skew >= 0 ? "+" : ""}${(sk0.skew * 100).toFixed(2)} vol-pts ${sk0.skew >= 0 ? "(slight put lean)" : "(call lean)"}.`
            : "";

          return (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>

              {/* v31: top synthesis — active asset only */}
              {(skewLevel || velPhrase) && (
                <div style={{background:"#0d0500",border:`1px solid ${C.orange}25`,
                  borderLeft:`3px solid ${C.orange}`,padding:"10px 12px",
                  fontSize:12,color:"#e0a050",lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>
                  <div style={{color:C.orange,fontSize:10,letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>
                    WHAT THIS MEANS RIGHT NOW · {asset}
                  </div>
                  <span>
                    {skewLevel && <>Skew is <strong style={{color:skewLevel.color,letterSpacing:"0.5px"}}>{skewLevel.word}</strong> (
                      <span style={{color:C.white,fontFamily:mono}}>
                        {sk.skew >= 0 ? "+" : ""}{(sk.skew * 100).toFixed(2)} vol-pts
                      </span>
                      {" "}on the {expiryStr}) — {skewLevel.blurb}.</>}
                    {velPhrase && <> Velocity: <strong style={{color:velPhrase.color,letterSpacing:"0.5px"}}>{velPhrase.phrase}</strong>
                      {velPhrase.blurb && <> — {velPhrase.blurb}.</>}</>}
                    {sk0Tail}
                  </span>
                  {typeof sk?.skew === "number" && (
                    <div style={{marginTop:6,fontSize:11,color:C.white,fontFamily:mono,letterSpacing:"0.5px",fontWeight:600}}>
                      skew {sk.skew >= 0 ? "+" : ""}{(sk.skew * 100).toFixed(2)} · velocity cutoffs ±0.5 / ±2.0 bps/hr · sign: + = puts richer (normal)
                    </div>
                  )}
                </div>
              )}

              {/* 5-asset cross-asset row (existing — readability bumped via SkewAssetColumn refactor) */}
              <div style={{display:"flex",gap:8}}>
                {ASSETS.map(a => (
                  <SkewAssetColumn key={a}
                    label={ASSET_LABEL[a]}
                    ticker={a}
                    skew={allSkews[a]}
                    skew0={a === asset ? data?.iv_skew_0dte : null}
                    isActive={a === asset}/>
                ))}
              </div>

              {/* v31: footer note — sign convention + velocity caveat */}
              <div style={{fontSize:9,color:"#999",fontStyle:"italic",textAlign:"right",
                paddingRight:4,lineHeight:1.45}}>
                Sign convention: positive skew = puts richer (normal equity skew); zero or negative = calls richer (rare, bullish).
                Velocity is soft on thin 1-DTE chains — treat <span style={{fontFamily:mono}}>*_BUILDING</span> /{" "}
                <span style={{fontFamily:mono}}>*_ACCELERATING</span> as suggestive, not deterministic.
              </div>
            </div>
          );
        })()}
      </SauceCard>

      {/* ─── ROW 3 (1×2) — Retail Trap + Market Entropy (divergence + tradability) ─── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <SauceCard num="04" title="THE RETAIL TRAP"
          sub={`INSTITUTIONAL GEX VS. RETAIL SENTIMENT — EXIT LIQUIDITY DETECTOR · ${asset}`}
          headline={HL_RT}
          explain={EX_RT}
          badges={[
            {label:sauce.retail_trap?.status==="TRAP_ACTIVE"?"⚠ TRAP ACTIVE":"✓ CLEAR",
             color:sauce.retail_trap?.status==="TRAP_ACTIVE"?C.red:C.green},
          ]}
          freshnessBadge={<FreshnessBadge computedAt={(data.retail_trap ?? data.sauce?.retail_trap)?.computed_at} tier="B" showCadence />}>
          <RetailTrapCard data={sauce.retail_trap} cachedAt={data?.cached_at}/>
        </SauceCard>

        {/* v47: header badge wired to entropy v2 (DC msg #117 canary).
              Reads intraday.state when present, falls back to v1 state
              only if v2 fields absent. 4-state coloring matches the
              hero pillar inside MarketEntropyCard. */}
        {(() => {
          const ent     = sauce.market_entropy;
          const v2State = ent?.intraday?.state;
          const useV2   = v2State !== undefined;
          const state   = useV2 ? v2State : (ent?.state ?? "—");
          const col     =
              state === "ORDERED"  ? C.green
            : state === "MODERATE" ? C.amber
            : state === "CHAOTIC"  ? C.red
            : state === "UNKNOWN"  ? C.gray
            : (ent?.color ?? C.gray);
          return (
            <SauceCard num="05" title="MARKET ENTROPY"
              sub={`OPTIONS FLOW DISORDER INDEX — INSTITUTIONAL CONVICTION VS. CHAOS · ${asset}`}
              headline={HL_ENT}
              explain={EX_ENT}
              badges={[{label: state || "—", color: col}]}
              freshnessBadge={<FreshnessBadge computedAt={(data.market_entropy ?? data.sauce?.market_entropy)?.computed_at} tier="B" showCadence />}
              calibratingBadge={<CalibratingBadge tooltip="Calibrating — entropy v2 in CANARY (validated against ~30 hand-labels at 77.8% accuracy). Live-validation period: compare v2 vs v1 across calm range / news / chop conditions. Cutover to v2-only once validation is complete." />}>
              <MarketEntropyCard data={sauce.market_entropy}/>
            </SauceCard>
          );
        })()}
      </div>

      {/* ─── ROW 4 (full) — IV & Sentiment Snapshot (general vibe check) ─── */}
      {/* v36: badge color inversion fix (FADE → amber not green; BREAKOUT
            → cyan not amber) so the header badge agrees with the EX_IV
            body. Also add showCadence on FreshnessBadge. */}
      <SauceCard num="06" title="IV & SENTIMENT SNAPSHOT"
        sub={`ATM IV · REALIZED VOL · PUT/CALL · EXPECTED MOVE · ${asset}`}
        headline={HL_IV}
        explain={EX_IV}
        badges={[
          {label:ivd?.signal?.replace(/_/g," ")||"—",
           color:ivd?.signal?.includes("FADE")?C.amber:ivd?.signal?.includes("BREAKOUT")?C.cyan:C.gray},
          {label:`P/C ${pc?.oi_ratio?.toFixed(2)||"—"}`,
           color:(pc?.oi_ratio||0)>1.2?C.red:(pc?.oi_ratio||0)<0.8?C.green:C.gray},
        ]}
        freshnessBadge={<FreshnessBadge computedAt={oldestComputedAt(data.iv_divergence?.computed_at, data.pc_ratio?.computed_at, data.expected_move?.computed_at, data.expected_move_0dte?.computed_at)} tier="B" showCadence />}>

        {/* v36: section-grouped layout (IV REGIME · SENTIMENT · RANGE)
              with a synthesis line below. Section headers use the same
              tiny-mono style as the inputs grid header on Card 04. */}
        {(() => {
          const em0   = data?.expected_move_0dte;
          // Synthesis line — IV signal × P/C OI stance.
          const sig   = (ivd?.signal || "").toUpperCase();
          const ratio = pc?.oi_ratio;
          const pcStance = ratio == null    ? "neutral positioning"
                         : ratio > 1.2      ? "bearish positioning"
                         : ratio < 0.8      ? "bullish positioning"
                         :                    "neutral positioning";
          const synth =
            (sig.includes("FADE") || sig.includes("RICH"))
              ? `IV rich + ${pcStance} → mean-reversion / fade setups favored. Sell premium if you trade options directly.`
            : (sig.includes("BREAKOUT") || sig.includes("CHEAP"))
              ? `IV cheap + ${pcStance} → breakout / momentum setups favored. Buy premium if you trade options directly.`
            : `IV fairly priced + ${pcStance} → no edge from the IV regime alone, read the other cards for direction.`;
          const synthCol = sig.includes("FADE")     ? C.amber
                         : sig.includes("BREAKOUT") ? C.cyan
                         :                            "#aaa";
          const SectionLabel = ({children}) => (
            <div style={{
              fontSize:9, color:C.gray, letterSpacing:"2px",
              fontFamily:mono, fontWeight:700, marginBottom:6,
            }}>{children}</div>
          );
          // v37: shared section-grid style — fixed 240px columns auto-fill
          //       so pills are consistent width across all 3 sections and
          //       leftover row space stays empty (operator-picked layout).
          const sectionGrid = {
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill, 240px)",
            gap:8,
          };
          // v37: hide TODAY ± pill entirely when DC ships null
          //       (non-SPX-class assets don't have daily 0-DTE expiries).
          const showToday = em0?.straddle != null;
          return (
            // v39: outer two-column flex — pills left fills available
            //       space (so auto-fill grid actually has columns to fill),
            //       READ synthesis right at fixed 380px width.
            <div style={{display:"flex", gap:14, alignItems:"stretch"}}>
              {/* LEFT COLUMN — sections of pills (expands to fill) */}
              <div style={{display:"flex", flexDirection:"column", gap:10, flex:1, minWidth:0}}>
                {/* IV REGIME */}
                <div>
                  <SectionLabel>IV REGIME</SectionLabel>
                  <div style={sectionGrid}>
                    <Pill label="ATM IV"       value={ivd?.iv_atm!=null?`${(ivd.iv_atm*100).toFixed(1)}%`:"—"} color={C.white}/>
                    <Pill label="30D REALIZED" value={ivd?.realized_vol!=null?`${(ivd.realized_vol*100).toFixed(1)}%`:"—"} color={C.cyan}/>
                    {/* v36: divergence color flipped to match semantics —
                         positive = IV rich vs RV = options expensive = amber
                         (fade); negative = cheap = cyan (breakout). */}
                    <Pill label="DIVERGENCE"   value={ivd?.divergence!=null?`${ivd.divergence>0?"+":""}${(ivd.divergence*100).toFixed(1)}pp`:"—"}
                      color={ivd?.divergence>0?C.amber:ivd?.divergence<0?C.cyan:C.gray}
                      sub={ivd?.signal?.replace(/_/g," ")}/>
                  </div>
                </div>

                {/* SENTIMENT */}
                <div>
                  <SectionLabel>SENTIMENT</SectionLabel>
                  <div style={sectionGrid}>
                    <Pill label="P/C OI RATIO"  value={pc?.oi_ratio?.toFixed(2)||"—"}  color={(pc?.oi_ratio||0)>1?C.red:C.green} sub={pc?.oi_sentiment}/>
                    <Pill label="P/C VOL RATIO" value={pc?.vol_ratio?.toFixed(2)||"—"} color={(pc?.vol_ratio||0)>1?C.red:C.green} sub={pc?.vol_sentiment}/>
                  </div>
                </div>

                {/* RANGE */}
                <div>
                  <SectionLabel>RANGE</SectionLabel>
                  <div style={sectionGrid}>
                    {/* v37: TODAY ± only renders when 0-DTE expected move is
                         actually present (SPX-class chains). For USTEC / XAU /
                         XAG / XTI (no daily 0-DTE) the pill hides entirely. */}
                    {showToday && (
                      <Pill label="TODAY ±"  value={`±${dp(em0.straddle)} (${em0.pct?.toFixed(1)}%)`}
                        color={C.white}
                        sub={em0?.move_up!=null?`${dp(em0.move_up)} ↑ · ${dp(em0.move_down)} ↓`:"0-DTE"}/>
                    )}
                    <Pill label="SWING ±"  value={em?.straddle!=null?`±${dp(em.straddle)} (${em.pct?.toFixed(1)}%)`:"—"}
                      color={C.gray}
                      sub={em?.move_up!=null?`${dp(em.move_up)} ↑ · ${dp(em.move_down)} ↓`:"next non-today"}/>
                    <Pill label="PUT WALL"  value={dp(data?.walls?.primary_put_wall)}  color={C.green} sub="support"/>
                    <Pill label="CALL WALL" value={dp(data?.walls?.primary_call_wall)} color={C.red}   sub="resistance"/>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN — READ synthesis (fixed width, the primary read) */}
              <div style={{
                flex:"0 0 380px", minWidth:0,
                display:"flex", flexDirection:"column", justifyContent:"center",
                padding:"18px 26px",
                background:"#0a0a0a",
                border:`1px solid ${synthCol}33`,
                borderLeft:`4px solid ${synthCol}`,
                borderRadius:2,
              }}>
                <div style={{
                  fontSize:13, color:synthCol, letterSpacing:"3px",
                  fontWeight:800, fontFamily:mono, marginBottom:14,
                }}>
                  ▶ READ
                </div>
                <div style={{
                  fontSize:18, color:C.white, lineHeight:1.45,
                  fontFamily:"'DM Sans',sans-serif", fontWeight:500,
                }}>
                  {synth}
                </div>
              </div>
            </div>
          );
        })()}
      </SauceCard>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  IV SKEW VELOCITY — Half-circle gauge + multi-asset comparison
// ══════════════════════════════════════════════════════════════════════════════

function SkewGauge({ velocity, size = 100 }) {
  // Half-circle needle gauge: left = calls accelerating, right = puts accelerating
  // velocity in vol pts/hr, clamp to ±0.05 for display
  const cx = size / 2, cy = size * 0.55;
  const r = size * 0.38;
  const clampV = Math.max(-0.05, Math.min(0.05, velocity || 0));
  const pct = (clampV + 0.05) / 0.10; // 0..1
  const angle = Math.PI * (1 - pct); // π..0 (left to right)
  const nx = cx + r * 0.85 * Math.cos(angle);
  const ny = cy - r * 0.85 * Math.sin(angle);

  // Arc segments: green (calls) | yellow (stable) | red (puts)
  const arcPath = (startPct, endPct) => {
    const a1 = Math.PI * (1 - startPct);
    const a2 = Math.PI * (1 - endPct);
    const x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy - r * Math.sin(a2);
    const large = (endPct - startPct) > 0.5 ? 1 : 0;
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`;
  };

  return (
    <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size * 0.82}`}>
      {/* Background track */}
      <path d={arcPath(0, 1)} fill="none" stroke="#1a1a1a" strokeWidth={size * 0.08}
        strokeLinecap="round"/>
      {/* Color zones: green (0-35%), yellow (35-65%), red (65-100%) */}
      <path d={arcPath(0, 0.35)} fill="none" stroke={C.green} strokeWidth={size * 0.06}
        opacity={0.3} strokeLinecap="round"/>
      <path d={arcPath(0.35, 0.65)} fill="none" stroke={C.yellow} strokeWidth={size * 0.06}
        opacity={0.3} strokeLinecap="round"/>
      <path d={arcPath(0.65, 1.0)} fill="none" stroke={C.red} strokeWidth={size * 0.06}
        opacity={0.3} strokeLinecap="round"/>
      {/* Active zone glow */}
      <path d={arcPath(Math.max(0, pct - 0.05), Math.min(1, pct + 0.05))}
        fill="none" stroke={pct < 0.35 ? C.green : pct > 0.65 ? C.red : C.yellow}
        strokeWidth={size * 0.06} opacity={0.8} strokeLinecap="round"/>
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={C.white} strokeWidth={1.5} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={size * 0.035} fill={C.white}/>
      {/* Labels — v31: bumped to size*0.10 sans-serif. v32: anchors flipped (start
          / end) + x insets (0.04 / 0.96) so first letters don't clip the SVG sides;
          y moved to cy + size*0.16 to clear the new SVG bottom (size*0.82). */}
      <text x={size * 0.04} y={cy + size * 0.16} fill={C.green} fontSize={size * 0.10}
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontWeight={700} textAnchor="start">CALL</text>
      <text x={size * 0.96} y={cy + size * 0.16} fill={C.red} fontSize={size * 0.10}
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontWeight={700} textAnchor="end">PUT</text>
    </svg>
  );
}

function IVBar({ label, value, maxVal, color }) {
  // v31 — readability bumps: label 6→9, value 7→10, color C.muted (#444) → #aaa.
  const pct = maxVal > 0 ? Math.min(100, (value / maxVal) * 100) : 0;
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
      <div style={{width:30,fontSize:9,color:"#aaa",textAlign:"right",flexShrink:0,
        fontFamily:mono,fontWeight:600}}>{label}</div>
      <div style={{flex:1,height:11,background:"#080808",border:`1px solid ${C.border}`,
        overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,
          background:`linear-gradient(90deg,${color}30,${color}80)`,
          borderRight:`2px solid ${color}`,transition:"width .3s"}}/>
      </div>
      <div style={{width:48,fontSize:10,color:color,fontFamily:mono,textAlign:"right",
        fontWeight:700}}>{value != null ? `${(value * 100).toFixed(1)}%` : "—"}</div>
    </div>
  );
}

function SkewAssetColumn({ label, ticker, skew, skew0, isActive }) {
  if (!skew || skew.atm_iv == null) {
    return (
      <div style={{flex:1,background:C.bgCard,border:`1px solid ${isActive?C.orange+"50":C.border}`,
        padding:10,display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:10,color:"#888",minHeight:140}}>
        {label}: no data
      </div>
    );
  }
  const vel = skew.velocity || {};
  const maxIV = Math.max(skew.put_25d_iv || 0, skew.atm_iv || 0, skew.call_25d_iv || 0, 0.01);

  // v31 — STALE_PREV_SNAPSHOT now mapped explicitly to amber.
  const verdictColor = {
    PUTS_ACCELERATING: C.red, PUTS_BUILDING: C.amber,
    CALLS_ACCELERATING: C.green, CALLS_BUILDING: C.cyan,
    STABLE: "#bbb", UNKNOWN: "#888",
    STALE_PREV_SNAPSHOT: C.amber,
  }[vel.verdict] || "#888";

  // v31 — expiry label from 2.3's expiry_dte / expiry_class.
  const expiryLabel = skew.expiry_dte != null
    ? `${skew.expiry_dte}DTE${skew.expiry_class === "0dte" ? " (0DTE fallback)" : ""}`
    : (skew.expiry_class || null);

  return (
    <div style={{flex:1,background:C.bgCard,
      border:`1px solid ${isActive ? C.orange + "50" : C.border}`,
      padding:"10px 12px",position:"relative",overflow:"hidden"}}>
      {isActive && <div style={{position:"absolute",top:0,left:0,right:0,height:1,
        background:C.orange,opacity:0.4}}/>}
      {/* Header — ticker label + expiry_dte sub-label + verdict badge */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        marginBottom:6}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:isActive?C.orange:C.white,
            fontFamily:mono,letterSpacing:"0.5px"}}>{label}</div>
          {expiryLabel && (
            <div style={{fontSize:9,color:"#aaa",fontFamily:mono,letterSpacing:"0.3px",marginTop:2}}>
              {expiryLabel}
            </div>
          )}
        </div>
        <span style={{fontSize:9,padding:"2px 6px",border:`1px solid ${verdictColor}40`,
          color:verdictColor,background:`${verdictColor}10`,fontWeight:700,
          letterSpacing:"0.3px",whiteSpace:"nowrap"}}>
          {(vel.verdict || "NO DATA").replace(/_/g," ")}
        </span>
      </div>
      {/* Gauge */}
      <div style={{display:"flex",justifyContent:"center",margin:"2px 0 4px"}}>
        <SkewGauge velocity={vel.velocity} size={90}/>
      </div>
      {/* Skew value */}
      <div style={{textAlign:"center",marginBottom:6}}>
        <div style={{fontSize:14,fontWeight:800,fontFamily:mono,
          color:skew.skew > 0 ? C.red : skew.skew < 0 ? C.green : "#bbb"}}>
          {skew.skew != null ? `${skew.skew > 0 ? "+" : ""}${(skew.skew * 100).toFixed(2)}` : "—"}
          <span style={{fontSize:9,color:"#999",fontWeight:400}}> vol pts</span>
        </div>
        {vel.velocity != null && (
          <div style={{fontSize:9,color:verdictColor,fontFamily:mono,marginTop:2}}>
            {vel.velocity > 0 ? "▲" : vel.velocity < 0 ? "▼" : "—"}{" "}
            {Math.abs(vel.velocity_bps_hr || 0).toFixed(1)} bps/hr
          </div>
        )}
      </div>
      {/* v31 — 0-DTE near-ATM mini-pill (only on active asset; others not fetched) */}
      {skew0?.skew != null && (
        <div style={{
          fontSize:9,padding:"3px 7px",marginBottom:6,
          background:"#0a0a0a",border:`1px solid ${C.border}`,borderRadius:2,
          fontFamily:mono,color:"#ccc",
          display:"flex",justifyContent:"space-between",alignItems:"center",letterSpacing:"0.3px",
        }}>
          <span style={{color:"#999",fontWeight:600}}>0DTE ±0.5%</span>
          <span style={{color:skew0.skew > 0 ? C.red : skew0.skew < 0 ? C.green : "#bbb",fontWeight:700}}>
            {skew0.skew >= 0 ? "+" : ""}{(skew0.skew * 100).toFixed(2)}
          </span>
        </div>
      )}
      {/* IV bars */}
      <IVBar label="25P" value={skew.put_25d_iv} maxVal={maxIV} color={C.red}/>
      <IVBar label="ATM" value={skew.atm_iv} maxVal={maxIV} color={C.white}/>
      <IVBar label="25C" value={skew.call_25d_iv} maxVal={maxIV} color={C.green}/>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  LEVELS VIEW — Card-based GEX analytics (mockup style)
// ══════════════════════════════════════════════════════════════════════════════

function LevelsView({ data, asset, chartData, layers, vis, setVis, refLines,
  spot, cfdRatio, cfdMode, priceBars,
  priceNormRatio, sharedRange, setSharedRange, levelsView }) {

  if (!data) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#888"}}>Loading...</div>;

  // CFD conversion helper
  const dp = useCallback((v) => {
    if (v == null) return "—";
    if (!cfdMode) return Number(v).toFixed(2);
    const c = v * cfdRatio;
    return c > 1000 ? Math.round(c).toString() : c.toFixed(1);
  }, [cfdMode, cfdRatio]);

  const gex = data.gex;
  const agg = levelsView === "0dte" ? data.gex_0dte?.aggregate : data.gex_stack?.aggregate;
  const stack = data.gex_stack;
  const sauce = data.sauce;

  // Compute per-expiry totals for Gamma Calendar
  const expiryTotals = useMemo(() => {
    if (!stack?.layers) return [];
    return stack.layers.map(l => {
      const total = (l.net_gex || []).reduce((s,v) => s + (v||0), 0);
      return { expiry: l.expiry, label: l.label, total, weight: l.weight, color: l.color, T_years: l.T_years };
    }).sort((a,b) => (a.expiry||"").localeCompare(b.expiry||""));
  }, [stack]);
  const maxExpGex = Math.max(1, ...expiryTotals.map(e => Math.abs(e.total)));

  // v45: derive 0-DTE structural_integrity + volatility_gravity per DC
  // msg #119 cookbook. Non-null only when levelsView === "0dte" AND the
  // raw 0-DTE inputs are present (gex_0dte for L02, gex_0dte +
  // dealer_heatmap_0dte for L03). Card components handle empty `levels`
  // arrays via their existing "No data" placeholder.
  const si0Derived = useMemo(() => {
    if (levelsView !== "0dte") return null;
    if (!data?.gex_0dte || data?.spot == null) return null;
    // v46: pass cfd_ratio_used so the derivation converts chain → broker.
    return deriveStructuralIntegrity0dte(data.gex_0dte, data.spot, data.cfd_ratio_used ?? 1.0);
  }, [levelsView, data?.gex_0dte, data?.spot, data?.cfd_ratio_used]);
  const vg0Derived = useMemo(() => {
    if (levelsView !== "0dte") return null;
    if (!data?.gex_0dte || data?.spot == null) return null;
    return deriveVolatilityGravity0dte(data.gex_0dte, data.dealer_heatmap_0dte, data.spot, data.cfd_ratio_used ?? 1.0);
  }, [levelsView, data?.gex_0dte, data?.dealer_heatmap_0dte, data?.spot, data?.cfd_ratio_used]);
  // Effective payloads passed into the cards — swing or 0-DTE-derived.
  const siCardData = levelsView === "0dte" ? si0Derived : sauce?.structural_integrity;
  const vgCardData = levelsView === "0dte" ? vg0Derived : sauce?.volatility_gravity;

  // ── Plain-English headlines (for newbies) ──
  const HL_REG = "The single most important reading on this page. Are dealers calming the market today (POSITIVE = chop / mean-reversion), or amplifying every move (NEGATIVE = trending / dangerous)?";
  const HL_SI  = "Each price strike ranked by how hard the market will defend it. Reinforced concrete = strong support or resistance. Glass = price falls right through. This is your trading ladder.";
  const HL_VG  = "Each strike labeled as a 🧲 Magnet (price gets stuck near it) or a 🚀 Spring (price gets violently shoved away from it). Tells you where to enter and where to take profit.";
  const HL_CAL = "Big options expire on specific dates. While they're alive, dealer hedging keeps price calm. When they die, the safety net releases — and price moves freely. This shows when the calm ends.";

  // ── Explain blocks ──
  // v40 — EX_SI rewritten: dropped the "15-minute delay" framing
  //       (stale post-ThetaData; real-time now). Replaced with the
  //       structural-truth statement that's actually stable.
  const EX_SI = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Every price level has a <strong style={{color:C.white}}>"structural strength"</strong> determined by dealer gamma. High gamma = dealers aggressively mean-revert = reinforced concrete. No gamma = nothing stops the move = thin ice.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>These structural levels are <strong style={{color:C.white}}>positioning-driven, not price-driven</strong>. They reflect where institutions have parked dealer hedging exposure — and they hold for the entire session unless a major expiry rolls off. Read them once at session open and reuse them all day.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<><strong style={{color:C.white}}>Trade toward reinforced levels</strong> (they attract price). Avoid longs above thin ice. The "hardness" label tells you exactly how much friction price will encounter.</>,
      pills:[{label:"S/R mapping",ok:true},{label:"Stop placement",ok:true},{label:"Target selection",ok:true}]},
  ];
  const EX_VG = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Classifies every key level as a <strong style={{color:C.white}}>🧲 Magnet</strong> (attracts and pins price) or a <strong style={{color:C.white}}>🚀 Spring</strong> (violent bounce/breakout). Magnets create chop. Springs create explosive moves.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>Moves you from <em>scalping</em> to <strong style={{color:C.white}}>strategic positioning</strong>. Know which levels trap you in chop vs. which launch a trade in your favor.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<><strong style={{color:C.white}}>Enter near Springs, target Magnets.</strong> Near a Spring → expect acceleration. Near a Magnet → expect chop, tighten stops.</>,
      pills:[{label:"Entry zones",ok:true},{label:"Target levels",ok:true},{label:"Position strategy",ok:true}]},
  ];
  const EX_CAL = [
    {icon:"📖",title:"WHAT IS THIS",body:<>Options expire on specific dates. When they do, dealers stop hedging — that hedging <strong style={{color:C.white}}>kept price in a tight range</strong>. This shows when gamma is released.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>When a massive expiry dies, price is <strong style={{color:C.white}}>free to move more violently</strong>. Monday after big Friday expiry = structurally more volatile — every time.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<>Large expiry today → <strong style={{color:C.white}}>range compression today, expansion the day after</strong>. Negative GEX expiring = extra dangerous.</>,
      pills:[{label:"Weekly planning",ok:true},{label:"Vol timing",ok:true},{label:"Size management",ok:true},{label:"Intraday timing",ok:false}]},
  ];
  const EX_REG = [
    {icon:"📖",title:"WHAT IS THIS",body:<>The <strong style={{color:C.white}}>GEX regime</strong> tells you whether dealers are net-long or net-short gamma overall. The <strong style={{color:C.white}}>flip level</strong> is the price where that flips. Together they define today's volatility character.</>},
    {icon:"💡",title:"WHY IT MATTERS",body:<>Positive regime = <strong style={{color:C.white}}>dealers fade moves</strong> (chop, mean-reversion). Negative regime = <strong style={{color:C.white}}>dealers chase moves</strong> (trending, violent). Same chart pattern means opposite things in each regime.</>},
    {icon:"🎯",title:"HOW TO USE IT",body:<>Above flip + positive = <strong style={{color:C.white}}>fade extremes, scalp ranges</strong>. Below flip + negative = <strong style={{color:C.white}}>trade with the trend, give it room</strong>. Crossing the flip level = regime change incoming.</>,
      pills:[{label:"Session strategy",ok:true},{label:"Stop sizing",ok:true},{label:"Trend vs chop",ok:true}]},
  ];

  return (
    <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"10px 12px",
      display:"flex",flexDirection:"column",gap:12}}>

      {/* ─── ROW 1 (full) — GEX REGIME & KEY LEVELS (the headline numbers) ─── */}
      {/* v40: FreshnessBadge + showCadence; tile-label fonts 7→10; body
            explanation fonts 9→11; synthesis line + distance-to-flip. */}
      <SauceCard prefix="LEVELS" num="01" title="GEX REGIME & KEY LEVELS"
        sub={`STRUCTURAL POSITIONING SUMMARY · ${asset}`}
        headline={HL_REG}
        explain={EX_REG}
        badges={[
          {label:gex?.regime||"—",color:gex?.regime==="POSITIVE"?C.green:C.red},
          {label:spot>data.gex_flip?"ABOVE FLIP":"BELOW FLIP",color:spot>data.gex_flip?C.green:C.red},
        ]}
        freshnessBadge={<FreshnessBadge computedAt={oldestComputedAt(data.gex?.computed_at, data.gex_flip_computed_at)} tier="B" showCadence />}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.gray,letterSpacing:"1.5px",fontWeight:700,fontFamily:mono}}>REGIME</div>
            <div style={{fontSize:24,fontWeight:800,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:"2px",
              color:gex?.regime==="POSITIVE"?C.green:C.red,marginTop:4}}>{gex?.regime||"—"}</div>
            <div style={{fontSize:11,color:"#bbb",fontFamily:"'DM Sans',sans-serif",marginTop:4,lineHeight:1.4}}>
              {gex?.regime==="POSITIVE"?"Dealers suppress moves — mean-reversion":"Dealers amplify moves — trending"}
            </div>
          </div>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.gray,letterSpacing:"1.5px",fontWeight:700,fontFamily:mono}}>NET GEX</div>
            <div style={{fontSize:24,fontWeight:800,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:"2px",
              color:gex?.regime==="POSITIVE"?C.green:C.red,marginTop:4}}>{gex?.net_total_gex!=null?fmtB(gex.net_total_gex):"—"}</div>
            <div style={{fontSize:11,color:"#bbb",fontFamily:"'DM Sans',sans-serif",marginTop:4}}>total dealer gamma</div>
          </div>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.gray,letterSpacing:"1.5px",fontWeight:700,fontFamily:mono}}>FLIP LEVEL</div>
            <div style={{fontSize:24,fontWeight:800,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:"2px",
              color:C.orange,marginTop:4}}>{dp(data.gex_flip)}</div>
            <div style={{fontSize:11,color:"#bbb",fontFamily:"'DM Sans',sans-serif",marginTop:4,lineHeight:1.4}}>
              {spot>data.gex_flip?"Price above — suppressed":"Price below — amplified"}
            </div>
          </div>
        </div>
        {/* v40: synthesis "what to actually do" line — crosses regime ×
              above/below-flip into a one-line trader read with explicit
              distance-to-flip. Pattern parallel to Sauce 04 v33's
              actionLine and Sauce 06 v36's READ. */}
        {(() => {
          const isPos      = gex?.regime === "POSITIVE";
          const aboveFlip  = data?.gex_flip != null && spot > data.gex_flip;
          const dist       = (spot != null && data?.gex_flip != null)
                              ? ((spot - data.gex_flip) / data.gex_flip) * 100
                              : null;
          const distLabel  = dist == null ? null
                            : `price is ${Math.abs(dist).toFixed(1)}% ${dist >= 0 ? "above" : "below"} flip`;
          const synth =
              isPos && aboveFlip
                ? `Above flip + positive γ → dealers fade extremes. Favor scalps inside the range, mean-reversion setups.`
            : isPos && !aboveFlip
                ? `Below flip + positive γ → above-flip dynamics pending. Wait for price to reclaim the flip before trusting fade setups.`
            : !isPos && aboveFlip
                ? `Above flip + negative γ → below-flip violence is one bad print away. Trail stops tighter, don't fight strength yet.`
            :   `Below flip + negative γ → dealers amplify moves. Trade with the trend, give it room, expect violence.`;
          const synthCol = isPos ? C.green : C.red;
          return (
            <div style={{
              marginTop:10, padding:"10px 14px",
              background:"#0a0a0a", borderLeft:`3px solid ${synthCol}`,
              fontSize:12, color:"#ddd", lineHeight:1.5,
              fontFamily:"'DM Sans',sans-serif",
            }}>
              <span style={{color:synthCol, fontFamily:mono, letterSpacing:"2px",
                fontSize:11, fontWeight:800, marginRight:8}}>▶ READ</span>
              {synth}
              {distLabel && (
                <span style={{color:C.gray, fontFamily:mono, marginLeft:8, fontSize:11}}>
                  ({distLabel})
                </span>
              )}
            </div>
          );
        })()}
      </SauceCard>

      {/* ─── ROW 2 (1×2) — Structural Integrity Map + Volatility Gravity (the level ladder) ─── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {/* v45: L02 wired to SWING / 0-DTE toggle. SWING reads producer-
              shipped sauce.structural_integrity; 0-DTE uses consumer-side
              derivation (siCardData) per DC msg #119. Title sub-line +
              badge counts switch source accordingly. */}
        <SauceCard prefix="LEVELS" num="02"
          title={`STRUCTURAL INTEGRITY MAP${levelsView==="0dte"?" · 0-DTE":""}`}
          sub={`LIQUIDITY DENSITY BY STRIKE — WHERE THE FLOOR IS GLASS VS. REINFORCED CONCRETE · ${asset}`}
          headline={HL_SI}
          explain={EX_SI}
          badges={[
            {label:`${(siCardData?.levels||[]).filter(l=>l.gex_norm>0.1).length} REINFORCED`,color:C.green},
            {label:`${(siCardData?.levels||[]).filter(l=>l.gex_norm<-0.15).length} THIN ICE`,color:C.red},
          ]}
          freshnessBadge={<FreshnessBadge computedAt={
            levelsView==="0dte" ? data?.gex_0dte?.aggregate?.computed_at ?? data?.gex_0dte?.computed_at
                                : sauce?.structural_integrity?.computed_at
          } tier="B" showCadence />}>
          {levelsView === "0dte" && !data?.gex_0dte
            ? <div style={{fontSize:11,color:C.muted,padding:14,fontStyle:"italic"}}>No 0-DTE structural data for this asset (no 0-DTE expiry today).</div>
            : <StructuralIntegrityCard data={siCardData} dp={dp}/>}
        </SauceCard>

        {/* v45: L03 wired to SWING / 0-DTE toggle (same pattern as L02). */}
        <SauceCard prefix="LEVELS" num="03"
          title={`VOLATILITY GRAVITY${levelsView==="0dte"?" · 0-DTE":""}`}
          sub={`VANNA + CHARM FORCE FIELD — WHICH LEVELS PIN VS. LAUNCH PRICE · ${asset}`}
          headline={HL_VG}
          explain={EX_VG}
          badges={[
            {label:`🧲 ${(vgCardData?.levels||[]).filter(l=>l.type==="magnet").length} MAGNETS`,color:C.cyan},
            {label:`🚀 ${(vgCardData?.levels||[]).filter(l=>l.type==="spring").length} SPRINGS`,color:C.red},
          ]}
          freshnessBadge={<FreshnessBadge computedAt={
            levelsView==="0dte" ? oldestComputedAt(data?.gex_0dte?.aggregate?.computed_at, data?.gex_0dte?.computed_at, data?.dealer_heatmap_0dte?.computed_at)
                                : sauce?.volatility_gravity?.computed_at
          } tier="B" showCadence />}>
          {levelsView === "0dte" && !data?.gex_0dte
            ? <div style={{fontSize:11,color:C.muted,padding:14,fontStyle:"italic"}}>No 0-DTE volatility-gravity data for this asset (no 0-DTE expiry today).</div>
            : <VolatilityGravityCard data={vgCardData} dp={dp}/>}
        </SauceCard>
      </div>

      {/* ─── ROW 3 (full) — Gamma Expiration Calendar (the timing) ─── */}
      {/* v40: FreshnessBadge + showCadence; expiry-row table-header fonts
            7→10; per-row label fonts 9→11; bar-value font 8→10. */}
      <SauceCard prefix="LEVELS" num="04" title="GAMMA EXPIRATION CALENDAR"
        sub={`DEALER GEX STACKED BY EXPIRY · ${asset} · ${expiryTotals.length} CHAINS`}
        headline={HL_CAL}
        explain={EX_CAL}
        badges={[
          {label:expiryTotals[0]?`NEXT: ${expiryTotals[0].expiry}`:"—",color:C.orange},
          {label:agg?.regime||"—",color:agg?.regime==="POSITIVE"?C.green:C.red},
        ]}
        freshnessBadge={<FreshnessBadge computedAt={oldestComputedAt(data.gex_stack?.computed_at, data.max_pain_computed_at, data.hvl_computed_at, data.gex_flip_computed_at)} tier="B" showCadence />}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
          <Pill label="TOTAL GEX" value={agg?.net_total_gex!=null?fmtB(agg.net_total_gex):"—"} color={agg?.regime==="POSITIVE"?C.green:C.red} sub={agg?.regime}/>
          <Pill label="GEX FLIP" value={dp(data.gex_flip)} color={C.orange} sub={spot>data.gex_flip?"Above → suppress":"Below → amplify"}/>
          <Pill label="MAX PAIN" value={dp(data.max_pain)} color={C.purple}/>
          <Pill label="HVL" value={dp(data.hvl)} color={C.yellow} sub="high volume level"/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <div style={{display:"grid",gridTemplateColumns:"90px 1fr 80px",gap:8,fontSize:10,
            color:C.gray,letterSpacing:"1.5px",padding:"0 0 5px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontFamily:mono}}>
            <div>EXPIRY</div><div>DEALER GEX</div><div style={{textAlign:"right"}}>TOTAL</div>
          </div>
          {expiryTotals.map((e,i) => {
            const isFirst = i === 0;
            const isNeg = e.total < 0;
            const pct = Math.min(95, Math.abs(e.total) / maxExpGex * 95);
            const col = isNeg ? C.red : isFirst ? C.orange : C.cyan;
            return (
              <div key={e.expiry} style={{display:"grid",gridTemplateColumns:"90px 1fr 80px",
                gap:8,alignItems:"center",padding:"3px 0"}}>
                <div style={{fontSize:11,color:isFirst?C.orange:isNeg?C.red:C.white,
                  fontWeight:isFirst?700:500,fontFamily:mono}}>
                  {e.expiry?.slice(5)||e.label}{isFirst?" ← NEXT":""}
                </div>
                <div style={{height:20,background:"#080808",border:`1px solid ${C.border}`,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,
                    background:`linear-gradient(90deg,${col}15,${col}40)`,
                    borderLeft:`2px solid ${col}`,display:"flex",alignItems:"center",
                    paddingLeft:7,fontSize:10,fontWeight:700,color:col,whiteSpace:"nowrap"}}>
                    {fmtB(e.total)}
                  </div>
                </div>
                <div style={{fontSize:11,textAlign:"right",color:col,fontFamily:mono,fontWeight:700}}>
                  {fmtB(e.total)}
                </div>
              </div>
            );
          })}
        </div>
      </SauceCard>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HEAT MAP VIEW — Card-based dealer delta + probability field
// ══════════════════════════════════════════════════════════════════════════════

function HeatMapView({ data, asset, spot, cfdRatio, cfdMode, vis,
  sharedRange, setSharedRange, probFieldData, fieldContrast,
  fieldMode, setFieldMode, fieldWeights, setFieldWeights, weightsChanged,
  DEFAULT_WEIGHTS, priceBars, priceNormRatio, refLines,
  blendMode, coneWeight = 0.5,
  fullscreen = false,             // v19: heatmap-only fullscreen (parent controls)
  onToggleFullscreen = () => {},  // v19: callback to enter/exit fullscreen
}) {

  // v19: contour-isoline toggle (button lives next to REFRESH) + user-
  //   adjustable stroke width (slider appears while the toggle is on).
  const [showContour, setShowContour] = useState(false);
  const [contourWidth, setContourWidth] = useState(0.6);

  // ── 1Hz live MT5 price (for spot marker only; candles are fetched separately) ──
  const [liveSpot, setLiveSpot] = useState(null);
  const liveTickRef = useRef(null);
  useEffect(() => {
    const poll = () => {
      fetch("/api/ticks")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d || !d[asset]) return;
          const mt5Price = d[asset].price || d[asset].bid;
          if (mt5Price && mt5Price > 0 && priceNormRatio && priceNormRatio > 0) {
            setLiveSpot(mt5Price / priceNormRatio);
          }
        })
        .catch(() => {});
    };
    poll();
    liveTickRef.current = setInterval(poll, 1000);
    return () => clearInterval(liveTickRef.current);
  }, [asset, priceNormRatio]);

  // ── Live candles for the heatmap ──
  // v19: both modes now fetch live bars via the session cache.
  //   curr → M30 × 800 (intraday feel for the open month)
  //   prev → H1  × 2000 (covers prev+curr months comfortably; ProbabilityMatrix
  //                       filters to the payload's `days` window)
  // Previous month's producer `realized_ohlc` is kept as a fallback inside
  // ProbabilityMatrix for when the H1 fetch returns empty.
  const [liveBars, setLiveBars] = useState([]);
  const [barsRefreshTick, setBarsRefreshTick] = useState(0);
  const monthMode = fieldMode === "month_prev" ? "prev" : "curr";
  useEffect(() => {
    let cancelled = false;
    const tf    = monthMode === "prev" ? "H1"  : "M30";
    const count = monthMode === "prev" ? 2000  : 800;
    fetchBarsCached(asset, tf, count)
      .then(d => {
        if (cancelled) return;
        const arr = Array.isArray(d) ? d : (d?.bars || d?.data || []);
        if (arr.length > 0) {
          console.log(`[heatmap bars] ${asset} ${tf}: ${arr.length} bars, first=${JSON.stringify(arr[0])}, last=${JSON.stringify(arr[arr.length-1])}`);
        }
        setLiveBars(arr);
      })
      .catch((e) => console.warn('[heatmap bars] fetch failed:', e));
    return () => { cancelled = true; };
  }, [asset, monthMode, barsRefreshTick]);
  const refreshBars = useCallback(() => setBarsRefreshTick(t => t + 1), []);

  // Listen for cache/sync events → bump tick so bars + heatmap cones refetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setBarsRefreshTick(t => t + 1);
    window.addEventListener("mk:data-sync-complete", onSync);
    return () => window.removeEventListener("mk:data-sync-complete", onSync);
  }, []);

  // ── GBM cones from cache — overlay polylines on the heatmap. ──
  // The cones file has gbm_month_curr / gbm_month_prev keyed structures with
  // {median, sd1_high, sd1_low, sd2_high, sd2_low, sd3_high, sd3_low, dates}.
  const [conesData, setConesData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cones/${asset}`)
      .then(r => {
        if (!r.ok) {
          console.warn(`[heatmap cones] ${asset} returned ${r.status}`);
          return null;
        }
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        if (!d) { setConesData(null); return; }
        const conesShape = d?.cones ? Object.keys(d.cones) : Object.keys(d);
        console.log(`[heatmap cones] ${asset}: top keys=${Object.keys(d).join(',')}, cones keys=${conesShape.slice(0,8).join(',')}`);
        setConesData(d);
      })
      .catch(e => { console.warn('[heatmap cones] fetch failed:', e); if (!cancelled) setConesData(null); });
    return () => { cancelled = true; };
  }, [asset, barsRefreshTick]);

  if (!data) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:11,color:"#888",background:"#06080c"}}>Loading...</div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",
      background:"#06080c",minHeight:0,position:"relative"}}>
      {/* Floating refresh + contour + fullscreen buttons — top-right corner of the heatmap area */}
      <div style={{position:"absolute",top:fullscreen?10:46,right:14,zIndex:50,display:"flex",gap:6}}>
        {/* v19: CONTOUR toggle + width slider (slider visible while toggle is on) */}
        <div onClick={() => setShowContour(s => !s)} title="Toggle contour isolines"
          style={{
            cursor:"pointer",userSelect:"none",
            padding:"5px 11px",fontSize:9,fontFamily:mono,fontWeight:700,
            letterSpacing:"1px",
            background: showContour ? "#1f2937" : "#0b0f17",
            color: showContour ? "#22d3ee" : "#777",
            border: `1px solid ${showContour ? "#22d3ee" : "#1f2937"}`,
            borderRadius:3,
            transition:"all .15s",
          }}>
          ◉ CONTOUR
        </div>
        {showContour && (
          <div style={{
            display:"flex",alignItems:"center",gap:6,
            padding:"0 10px",fontSize:9,fontFamily:mono,fontWeight:700,
            letterSpacing:"1px",
            background:"#0b0f17",
            color:"#22d3ee",
            border:"1px solid #1f2937",
            borderRadius:3,
          }}>
            <span style={{color:"#777"}}>W</span>
            <input type="range" min="0.2" max="2.5" step="0.1"
              value={contourWidth}
              onChange={e => setContourWidth(Number(e.target.value))}
              title={`Contour stroke width: ${contourWidth.toFixed(1)}`}
              style={{width:70,accentColor:"#22d3ee",cursor:"pointer"}}/>
            <span style={{minWidth:20,textAlign:"right"}}>{contourWidth.toFixed(1)}</span>
          </div>
        )}
        {/* v19: FULL / EXIT toggle (heatmap-only fullscreen) */}
        <div onClick={onToggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Expand heatmap to fullscreen"}
          style={{
            cursor:"pointer",userSelect:"none",
            padding:"5px 11px",fontSize:9,fontFamily:mono,fontWeight:700,
            letterSpacing:"1px",
            background: fullscreen ? "#1f2937" : "#0b0f17",
            color: fullscreen ? "#22d3ee" : "#777",
            border: `1px solid ${fullscreen ? "#22d3ee" : "#1f2937"}`,
            borderRadius:3,
            transition:"all .15s",
          }}>
          {fullscreen ? "⤡ EXIT" : "⤢ FULL"}
        </div>
        <div onClick={refreshBars} title="Refresh candles & cones"
          style={{
            cursor:"pointer",userSelect:"none",
            padding:"5px 11px",fontSize:9,fontFamily:mono,fontWeight:700,
            letterSpacing:"1px",
            background:"#0b0f17",
            color:"#22d3ee",
            border:"1px solid #1f2937",
            borderRadius:3,
            transition:"all .15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#1f2937";
            e.currentTarget.style.borderColor = "#22d3ee";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#0b0f17";
            e.currentTarget.style.borderColor = "#1f2937";
          }}>
          ↻ REFRESH
        </div>
      </div>

      <ProbabilityMatrix
        fieldData={probFieldData}
        spot={vis.spot ? (liveSpot || spot) : null}
        cfdRatio={cfdRatio}
        cfdMode={cfdMode}
        refLines={refLines}
        blendMode={blendMode}
        monthMode={monthMode}
        contrast={fieldContrast}
        liveBars={liveBars}
        conesData={conesData}
        coneWeight={coneWeight}
        showContour={showContour}
        contourWidth={contourWidth}
      />
    </div>
  );
}


// ── Main Component ─────────────────────────────────────────────────────────────
export default function OptionsPanel() {
  const [asset, setAsset]           = useState("US500");
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastFetch, setLastFetch]   = useState(null);
  const [tab, setTab_]              = useState("sauce");    // "sauce"|"levels"|"heatmap"
  const setTab = useCallback((t) => {
    setTab_(t);
    // Kick ResizeObservers after tab switch — charts need to remeasure
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }, []);
  const [levelsView, setLevelsView] = useState("swing");    // "swing"|"0dte" (within LEVELS tab)
  // v15: ETF→CFD conversion moved to backend (data_server.py v12). The JSON
  //      arriving on /api/options/:ticker/full is already in MT5 CFD price
  //      space. Hold `cfdMode=false` (and `cfdRatio=1`) so downstream
  //      formatters pass values through untouched. If MT5 is offline the
  //      backend ships raw ETF values with `_conversion_applied=false`; we
  //      surface that as a warning banner below.
  const cfdMode = false;
  const [fullscreen, setFullscreen] = useState(false);
  // v42: showPrice + showHeatmap removed — both fed dead consumer paths
  //       (toolbar toggles ripped, GexChart never instantiated).
  const [sharedRange, setSharedRange] = useState(null);

  const [gexPct, setGexPct] = useState(0.65);
  const splitterRef = useRef(null);
  const chartAreaRef = useRef(null);

  const onSplitterDown = useCallback((e) => {
    e.preventDefault();
    const startX   = e.clientX;
    const startPct = gexPct;
    const totalW   = chartAreaRef.current?.offsetWidth || 900;
    const onMove = (mv) => {
      const delta = (mv.clientX - startX) / totalW;
      setGexPct(p => Math.max(0.3, Math.min(0.85, startPct + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [gexPct]);
  const [priceBars, setPriceBars]   = useState([]);
  const [ticks, setTicks]           = useState(null);
  const [probFieldData, setProbFieldData] = useState(null);
  const [fieldMode, setFieldMode] = useState("month_curr");   // month_curr|month_prev
  const [blendMode, setBlendMode] = useState(false);          // GMB blend toggle
  const [fieldContrast, setFieldContrast] = useState(0.5);  // 0=soft, 0.5=neutral, 1=hard
  const [coneWeight, setConeWeight] = useState(0.5);        // 0=pure options, 1=pure cone
  const [fieldWeights, setFieldWeights] = useState({
    w_mc: 48, w_anchor: 16, w_ou: 12, w_gex: 14, w_dealer: 10,
  });
  const DEFAULT_WEIGHTS = { w_mc: 94, w_anchor: 63, w_ou: 51, w_gex: 70, w_dealer: 70 };
  const weightsChanged = Object.keys(DEFAULT_WEIGHTS).some(k => fieldWeights[k] !== DEFAULT_WEIGHTS[k]);

  const spot = data?.spot;

  useEffect(() => {
    if (spot && spot > 0) {
      setSharedRange([spot * 0.88, spot * 1.12]);
    }
  }, [spot, asset]);

  const [vis, setVis] = useState({
    flip:true, maxpain:true, putwall:true, callwall:true,
    hvl:true, expmove:true, spot:true,
  });

  const timerRef = useRef(null);
  // v20: track the currently in-flight AbortController + "busy" flag so
  //   (a) asset/tab switches can abort the pending fetch, (b) the polling
  //   interval skips a tick while a previous fetch is still running, and
  //   (c) a hung backend can't leave `loading` stuck true forever.
  const abortRef    = useRef(null);
  const inFlightRef = useRef(false);

  // v15: priceNormRatio + cfdRatio retired — backend (data_server.py v12)
  //      serves pre-converted CFD data. Both constants are kept at 1 so the
  //      existing prop-drilled consumers keep working (divide-by-1 no-op
  //      instead of an ETF back-conversion).
  const cfdRatio       = 1;
  const priceNormRatio = 1;
  const conversionMissing = data != null && data._conversion_applied === false;

  useEffect(() => {
    fetch("/api/ticks")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTicks(d); })
      .catch(() => {});
  }, []);

  // ── Fetch price bars — timeframe and count scale with prob field mode ──
  useEffect(() => {
    let cancelled = false;
    // Default: M15 × 60 bars for GEX views.
    // Heatmap tab no longer fetches bars here — candles come from the prob field payload (v2.0).
    if (tab === "heatmap") return;
    let tf = "M15", count = 60;
    fetch(`/api/bars/${asset}?timeframe=${tf}&count=${count}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        const arr = Array.isArray(d) ? d : (d?.bars || d?.data || []);
        setPriceBars(arr.slice(-count));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [asset, tab]);

  // ── Fetch probability field data (v2.0 — single payload contains both modes) ──
  // Producer rewrites this file every 15 min during US session.
  // Clear probfield on asset/tab change (avoids a flash of stale data from the
  // previous asset while the new fetch is in flight).
  useEffect(() => { setProbFieldData(null); }, [asset, tab]);

  // v5: local sync tick at OptionsPanel scope (barsRefreshTick lives in
  //     HeatMapView and isn't reachable here). Bumped by the cache watcher /
  //     periodic sync / refresh button broadcast.
  const [probSyncTick, setProbSyncTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setProbSyncTick(t => t + 1);
    window.addEventListener("mk:data-sync-complete", onSync);
    return () => window.removeEventListener("mk:data-sync-complete", onSync);
  }, []);

  useEffect(() => {
    if (tab !== "heatmap") return;
    let cancelled = false;
    let timer = null;

    const load = () => {
      fetch(`/api/probability-field/${asset}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled) return;
          if (!d) { setProbFieldData(null); return; }
          // Soft format_version check — warn once but still try to render
          if (d.format_version) {
            const ver = String(d.format_version);
            if (!ver.startsWith("2") && !ver.startsWith("3")) {
              console.warn(`[probability-field] Unexpected format_version: ${ver}. Frontend expects 2.x or 3.x.`);
            }
          }
          setProbFieldData(d);
        })
        .catch(() => { if (!cancelled) setProbFieldData(null); });
    };

    load();
    timer = setInterval(load, POLL_MS);  // 15 min, matches POLL_MS used for options data
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  // probSyncTick is bumped by the OptionsPanel-scope mk:data-sync-complete
  // listener (v5), so any cache change triggers a refetch within ~1–2s.
  }, [asset, tab, probSyncTick]);

  // ── Fetch options data (v20: stable against asset/tab switches) ──
  // Guards:
  //   (a) AbortController on every call; the previous in-flight request is
  //       aborted when a new one starts (ticker switch) or when the effect
  //       unmounts (tab switch away).
  //   (b) 15s timeout on each fetch — AbortController fired from a timer so
  //       a hung backend can't leave loading=true forever.
  //   (c) `inFlightRef` so the polling interval is a no-op if a prior fetch
  //       is still running; stops request stacking on slow backends.
  //   (d) setState calls after await are gated on "is this the current
  //       controller?" so stale responses from a prior asset can't write.
  const fetchData = useCallback(async (canonical) => {
    // Abort any prior in-flight request.
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 15000);

    setLoading(true);
    setError(null);
    try {
      const url = `/api/options/${canonical}/full?n=8`;
      const r = await fetch(url, { signal: controller.signal });
      if (abortRef.current !== controller) return;  // stale — a newer fetch already started
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${r.status}`);
      }
      const json = await r.json();
      if (abortRef.current !== controller) return;  // stale after parse
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      if (abortRef.current !== controller) return;  // stale error
      if (e?.name === "AbortError") {
        // Timeout or deliberate abort — surface a short message only on timeout.
        if (controller.signal.reason === undefined) setError("request timed out");
        // Deliberate aborts (asset change / unmount) leave error untouched.
      } else {
        setError(e.message);
      }
    } finally {
      clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        abortRef.current = null;
        inFlightRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData(asset);
    clearInterval(timerRef.current);
    // Polling tick: skip if a prior fetch is still in flight — avoids
    // stacking concurrent requests on a slow backend.
    timerRef.current = setInterval(() => {
      if (inFlightRef.current) return;
      fetchData(asset);
    }, POLL_MS);
    return () => {
      clearInterval(timerRef.current);
      if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    };
  }, [asset, fetchData]);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { chartData, layers } = useMemo(() => {
    if (!data) return { chartData:[], layers:[] };
    let source = levelsView === "0dte" ? data.gex_0dte : data.gex_stack;
    if (!source?.strikes?.length) {
      if (data.gex?.strikes?.length) {
        source = {
          strikes: data.gex.strikes,
          layers:  [{ label:"GEX1", color:GEX_COLORS[0], expiry:data.expiry,
                       net_gex:data.gex.net_gex }],
        };
      } else return { chartData:[], layers:[] };
    }
    const { strikes, layers: ls } = source;
    const chartData = strikes.map((s, i) => {
      const row = { strike: s };
      ls?.forEach(l => { row[l.label] = l.net_gex?.[i] ?? 0; });
      return row;
    });
    return { chartData, layers: ls || [] };
  }, [data, levelsView]);

  const refLines = useMemo(() => {
    if (!data) return [];
    const lines = [];
    if (vis.flip && data.gex_flip != null)
      lines.push({ value:data.gex_flip, label:"FLIP", color:C.orange, dash:"5 3" });
    if (vis.maxpain && data.max_pain != null)
      lines.push({ value:data.max_pain, label:"MAX PAIN", color:C.purple, dash:"3 4" });
    if (vis.putwall && data.walls?.primary_put_wall != null)
      lines.push({ value:data.walls.primary_put_wall, label:"PUT WALL", color:C.green, dash:"5 2" });
    if (vis.callwall && data.walls?.primary_call_wall != null)
      lines.push({ value:data.walls.primary_call_wall, label:"CALL WALL", color:C.red, dash:"5 2" });
    if (vis.hvl && data.hvl != null)
      lines.push({ value:data.hvl, label:"HVL", color:C.yellow, dash:"2 4" });
    if (vis.expmove && data.expected_move?.move_up != null) {
      lines.push({ value:data.expected_move.move_up,   label:"EXP+", color:"#555", dash:"2 5" });
      lines.push({ value:data.expected_move.move_down, label:"EXP−", color:"#555", dash:"2 5" });
    }
    return lines;
  }, [data, vis]);

  const em   = data?.expected_move;
  const ivd  = data?.iv_divergence;
  const pc   = data?.pc_ratio;
  const agg  = levelsView === "0dte" ? data?.gex_0dte?.aggregate : data?.gex_stack?.aggregate;

  const dp = useCallback((v) => {
    if (!v) return "—";
    if (!cfdMode) return Number(v).toFixed(2);
    const c = v * cfdRatio;
    return c > 1000 ? Math.round(c).toString() : c.toFixed(1);
  }, [cfdMode, cfdRatio]);

  // v19: heatmap-specific fullscreen — hide panel header + asset bar when
  //   the heatmap tab is fullscreen so the heatmap gets the whole viewport.
  //   Sub-tab row (tabs + per-tab controls) stays visible for MONTH/BLEND/
  //   CONTRAST access; HeatMapView renders a floating EXIT button.
  const heatmapFs = fullscreen && tab === "heatmap";

  const panelStyle = {
    background: C.bg,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    fontFamily: mono,
    overflow: "hidden",
    ...(fullscreen ? {position:"fixed",inset:0,zIndex:9999} : {}),
  };

  return (
    <div style={panelStyle}>
      {!heatmapFs && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"8px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div>
            <span style={{fontSize:11,fontWeight:800,color:C.orange,letterSpacing:"2px"}}>OPTIONS QUANT</span>
            <span style={{fontSize:7,color:C.muted,marginLeft:12}}>
              CBOE 15-min delayed · GEX · Max Pain · IV Divergence</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {data?.is_stale && (
              <span style={{fontSize:7,color:C.amber,border:`1px solid ${C.amber}40`,padding:"1px 5px"}}>⚠ STALE</span>
            )}
            {lastFetch && <span style={{fontSize:7,color:C.muted}}>{lastFetch.toLocaleTimeString()}</span>}
            <Btn label={loading?"…":"↻ REFRESH"} active={false}
              onClick={() => fetchData(asset)} color={C.cyan}/>
            <Btn label={fullscreen?"⤡ EXIT":"⤢ FULL"} active={fullscreen}
              onClick={() => setFullscreen(f=>!f)} color={C.muted}/>
          </div>
        </div>
      )}

      {/* ═══ ASSET BAR ═══ */}
      {!heatmapFs && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"4px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",gap:3}}>
            {ASSETS.map(a => (
              <button key={a} onClick={() => setAsset(a)}
                style={{background:a===asset?`${C.orange}18`:"transparent",
                  border:a===asset?`1px solid ${C.orange}`:`1px solid ${C.border}`,
                  borderRadius:2,
                  color:a===asset?C.orange:C.gray,padding:"6px 14px",
                  fontSize:9,fontWeight:700,fontFamily:mono,cursor:"pointer",
                  letterSpacing:"0.5px",transition:"all .15s"}}>
                {ASSET_LABEL[a]}
                <span style={{fontSize:7,color:a===asset?C.orange:C.muted,marginLeft:5,
                  opacity:0.7}}>({CBOE_TICKER[a]})</span>
              </button>
            ))}
          </div>
          {/* v15: CFD PRICES toggle removed — backend always ships CFD-space data */}
          {conversionMissing && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 10px", background: `${C.amber}18`,
              border: `1px solid ${C.amber}60`,
              fontSize: 9, color: C.amber, fontWeight: 700, letterSpacing: "1px",
            }}>⚠ MT5 OFFLINE · LEVELS IN ETF SPACE</div>
          )}
        </div>
      )}

      {/* ═══ SUB-TAB BAR (like Fundamentals) ═══ */}
      <div style={{display:"flex",alignItems:"center",height:32,
        background:C.bg,borderBottom:`1px solid ${C.border}`,padding:"0 10px",gap:3,flexShrink:0}}>
        {[
          {key:"sauce",   icon:"🧪",label:"The Sauce",   count:6},
          {key:"levels",  icon:"📊",label:"Levels",      count:4},
          {key:"heatmap", icon:"🗺️",label:"Heat Map",    count:null},
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{height:28,padding:"0 16px",display:"flex",alignItems:"center",gap:5,
              fontSize:8,letterSpacing:"1.5px",color:tab===t.key?C.orange:C.muted,
              cursor:"pointer",textTransform:"uppercase",fontWeight:700,fontFamily:mono,
              border:tab===t.key?`1px solid ${C.orange}`:`1px solid transparent`,
              background:tab===t.key?`${C.orange}12`:"transparent",
              position:"relative",transition:"all .15s",whiteSpace:"nowrap"}}>
            <span style={{fontSize:10}}>{t.icon}</span>
            {t.label}
            {t.count && <span style={{fontSize:6,padding:"1px 4px",marginLeft:3,
              background:tab===t.key?`${C.orange}20`:C.bgCard,
              border:`1px solid ${tab===t.key?C.orange:C.border}`,
              color:tab===t.key?C.orange:C.muted}}>{t.count}</span>}
          </button>
        ))}

        {/* Per-tab controls inline */}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {tab === "levels" && (<>
            {/* v41: SWING/0DTE segmented pill — mirrors Heat Map MONTH
                  toggle style for visual consistency. */}
            <div style={{display:"flex",alignItems:"center",gap:0,
              border:`1px solid ${C.border}`,borderRadius:3,overflow:"hidden"}}>
              {[
                {key:"swing", label:"SWING 1–8", color:C.cyan},
                {key:"0dte",  label:"0 DTE",     color:C.yellow},
              ].map(({key,label,color}) => (
                <div key={key}
                  onClick={() => setLevelsView(key)}
                  style={{
                    cursor:"pointer",userSelect:"none",
                    padding:"5px 14px",fontSize:9,fontFamily:mono,fontWeight:700,
                    letterSpacing:"1px",
                    background: levelsView===key ? color : "transparent",
                    color:      levelsView===key ? "#000" : "#9ca3af",
                    transition:"all .15s",
                  }}>
                  {label}
                </div>
              ))}
            </div>
            {/* v42: PRICE LINE + DEALER Δ toggles removed — both flipped
                  state nobody read (showHeatmap had zero consumers;
                  showPrice fed GexChart which is never instantiated on
                  this tab). See header v42 entry for full audit. */}
          </>)}
          {tab === "heatmap" && (<>
            {/* CURRENT / PREVIOUS month toggle */}
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:8,color:"#888",fontFamily:mono,letterSpacing:"1px",fontWeight:600}}>MONTH</span>
              <div style={{display:"flex",gap:0,border:`1px solid ${C.border}`,borderRadius:3,overflow:"hidden"}}>
                {[
                  {key:"month_curr",label:"CURRENT", color:C.amber},
                  {key:"month_prev",label:"PREVIOUS",color:C.purple},
                ].map(({key,label,color}) => (
                  <div key={key}
                    onClick={() => setFieldMode(key)}
                    style={{
                      cursor:"pointer",userSelect:"none",
                      padding:"4px 12px",fontSize:9,fontFamily:mono,fontWeight:700,
                      letterSpacing:"1px",
                      background: fieldMode===key ? color : "transparent",
                      color:      fieldMode===key ? "#000" : "#9ca3af",
                      transition:"all .15s",
                    }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* BLEND toggle */}
            <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:6}}>
              <span style={{fontSize:8,color:"#888",fontFamily:mono,letterSpacing:"1px",fontWeight:600}}>BLEND</span>
              <div onClick={() => setBlendMode(b => !b)}
                style={{
                  cursor:"pointer",userSelect:"none",
                  padding:"4px 14px",fontSize:9,fontFamily:mono,fontWeight:700,
                  letterSpacing:"1px",
                  background: blendMode ? "#22c55e" : "transparent",
                  color:      blendMode ? "#000" : "#9ca3af",
                  border:`1px solid ${blendMode ? "#22c55e" : C.border}`,
                  borderRadius:3,
                  boxShadow: blendMode ? "0 0 8px rgba(34,197,94,0.4)" : "none",
                  transition:"all .15s",
                }}>
                {blendMode ? "ON" : "OFF"}
              </div>
            </div>

            {/* CONTRAST slider — shapes the power curve applied to options_weight.
                 0 = soft (flat, low contrast), 1 = hard (punchy, highlights pop). */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:6}}>
              <span style={{fontSize:8,color:"#888",fontFamily:mono,letterSpacing:"1px",fontWeight:600}}>CONTRAST</span>
              <input type="range" min="0" max="100" step="1"
                value={Math.round((fieldContrast || 0) * 100)}
                onChange={e => setFieldContrast(Number(e.target.value) / 100)}
                style={{
                  width:80,height:4,cursor:"pointer",
                  accentColor:"#22d3ee",
                  background:"#1f2937",
                }}/>
              <span style={{fontSize:9,color:"#22d3ee",fontFamily:mono,fontWeight:700,
                minWidth:22,textAlign:"right"}}>
                {Math.round((fieldContrast || 0) * 100)}
              </span>
            </div>

            {/* CONE WEIGHT slider — only meaningful when BLEND is on.
                 0% = pure options, 100% = pure cone, 50% = equal mix. */}
            {blendMode && (
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:6}}>
                <span style={{fontSize:8,color:"#888",fontFamily:mono,letterSpacing:"1px",fontWeight:600}}>CONE</span>
                <input type="range" min="0" max="100" step="1"
                  value={Math.round((coneWeight || 0) * 100)}
                  onChange={e => setConeWeight(Number(e.target.value) / 100)}
                  style={{
                    width:80,height:4,cursor:"pointer",
                    accentColor:"#22c55e",
                    background:"#1f2937",
                  }}/>
                <span style={{fontSize:9,color:"#22c55e",fontFamily:mono,fontWeight:700,
                  minWidth:22,textAlign:"right"}}>
                  {Math.round((coneWeight || 0) * 100)}
                </span>
              </div>
            )}
          </>)}
        </div>
      </div>

      {error && (
        <div style={{padding:"8px 14px",background:`${C.red}10`,
          border:`1px solid ${C.red}30`,fontSize:8,color:C.red,margin:"6px 14px"}}>✘ {error}</div>
      )}

      {data && (
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,overflow:"hidden"}}>
          {/* ═══ PILL ROW (hidden on sauce tab) ═══ */}
          {tab !== "sauce" && (
          <div style={{display:"flex",gap:4,padding:"6px 14px",
            flexShrink:0,overflowX:"auto",borderBottom:`1px solid ${C.border}`}}>
            <Pill label="SPOT" value={dp(spot)} color={C.cyan}
              sub={cfdMode && priceNormRatio ? `CFD ×${priceNormRatio.toFixed(2)}` : "15-min delay"}
              explain="Current underlying price."/>
            <Pill label="GEX FLIP" value={dp(data.gex_flip)}
              color={data.gex_flip&&spot>data.gex_flip?C.green:C.amber}
              sub={data.gex_flip?(spot>data.gex_flip?"above → dealers suppress":"below → dealers amplify"):"no crossing"}
              explain="Price where dealer hedging flips direction. Above = stabilizing, below = trend-amplifying."/>
            <Pill label="MAX PAIN" value={dp(data.max_pain)} color={C.purple}
              sub={data.max_pain&&spot?`${spot>data.max_pain?"▼":"▲"} ${Math.abs(spot-data.max_pain).toFixed(2)} away`:""}
              explain="Strike where the most options expire worthless — a magnet for price into expiry."/>
            <Pill label="PUT WALL ↑" value={dp(data.walls?.primary_put_wall)} color={C.green}
              sub="support"
              explain="Largest put-OI strike — tends to act as support."/>
            <Pill label="CALL WALL ↓" value={dp(data.walls?.primary_call_wall)} color={C.red}
              sub="resistance"
              explain="Largest call-OI strike — tends to act as resistance."/>
            <Pill label="HVL" value={dp(data.hvl)} color={C.yellow}
              sub="high vol level"
              explain="High-volume level. Price tends to accelerate away from it."/>
            <Pill label="EXP MOVE"
              value={em?.straddle!=null?`±${dp(em.straddle)} (${em.pct?.toFixed(1)}%)` : "—"}
              color={C.gray}
              sub={em?.move_up?`${dp(em.move_up)} ↑  ${dp(em.move_down)} ↓`:"ATM straddle"}
              explain="Options-implied expected range by today's expiry (±1σ)."/>
            <Pill label="NET GEX" value={agg?.net_total_gex!=null?fmtB(agg.net_total_gex):"—"}
              color={agg?.regime==="POSITIVE"?C.green:C.red}
              sub={agg?.regime||""}
              explain="Aggregate dealer gamma. Positive = mean-reverting tape; Negative = trend-amplifying."/>
            {data?.dealer_heatmap && (
              <Pill label="DEALER Δ NET"
                value={data.dealer_heatmap.net_dealer_delta!=null ? fmtB(data.dealer_heatmap.net_dealer_delta) : "—"}
                color={data.dealer_heatmap.net_dealer_delta<0?C.green:C.red}
                sub={data.dealer_heatmap.net_dealer_delta<0?"net buy":"net sell"}
                explain="Net delta dealers need to hedge. Negative = they must buy into dips; positive = they must sell into rallies."/>
            )}
          </div>
          )}

          {/* ═══ TAB: THE SAUCE ═══ */}
          {tab === "sauce" && (
            <SauceView sauce={data?.sauce} data={data} asset={asset} cfdRatio={cfdRatio} cfdMode={cfdMode}/>
          )}

          {/* ═══ TAB: LEVELS ═══ */}
          {tab === "levels" && (
            <LevelsView data={data} asset={asset} chartData={chartData} layers={layers}
              vis={vis} setVis={setVis} refLines={refLines}
              spot={spot} cfdRatio={cfdRatio} cfdMode={cfdMode}
              priceBars={priceBars}
              priceNormRatio={priceNormRatio}
              sharedRange={sharedRange} setSharedRange={setSharedRange}
              levelsView={levelsView}/>
          )}

          {/* ═══ TAB: HEAT MAP ═══ */}
          {tab === "heatmap" && (
            <HeatMapView data={data} asset={asset} spot={spot}
              cfdRatio={cfdRatio} cfdMode={cfdMode} vis={vis}
              sharedRange={sharedRange} setSharedRange={setSharedRange}
              probFieldData={probFieldData} fieldContrast={fieldContrast}
              fieldMode={fieldMode} setFieldMode={setFieldMode}
              fieldWeights={fieldWeights} setFieldWeights={setFieldWeights}
              weightsChanged={weightsChanged} DEFAULT_WEIGHTS={DEFAULT_WEIGHTS}
              priceBars={priceBars} priceNormRatio={priceNormRatio}
              refLines={refLines} blendMode={blendMode}
              coneWeight={coneWeight}
              fullscreen={heatmapFs}
              onToggleFullscreen={() => setFullscreen(f => !f)}/>
          )}

          <div style={{padding:"3px 14px",borderTop:`1px solid ${C.border}`,flexShrink:0,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:6,color:C.muted}}>
              CBOE delayed · {ASSET_LABEL[asset]} via {CBOE_TICKER[asset]}
              {conversionMissing ? " · RAW ETF (MT5 offline)" : " · CFD"}
              {" · GEX = dealer gamma exposure · Not financial advice"}
            </span>
            <span style={{fontSize:6,color:data?.market_open?C.green:C.muted}}>
              ● {data?.market_open?"MARKET OPEN":"CLOSED"}</span>
          </div>
        </div>
      )}

      {!data && !loading && !error && (
        <div style={{flex:1,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:9,color:C.muted}}>
          Select an asset to load options data
        </div>
      )}
    </div>
  );
}