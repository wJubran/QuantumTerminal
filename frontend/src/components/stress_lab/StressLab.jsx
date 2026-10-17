// version: v11
// StressLab.jsx — the top-level Stress Lab page. Orchestrates layout and
// the active sub-tab.
//
// v11 — Open-source edition: no subscription tiers — removed the Pro gate,
//       the trial banner and the "PRO" identity pill. Removed the Indicators
//       sub-tab: it issued ATAS API keys from the commercial server, which
//       does not exist in the open-source build (a stored "indicators"
//       sub-tab value falls back to Pulse Room).
//
// v10 — Added Options Cockpit sub-tab (2026-05-13). New "options_cockpit"
//       value in VALID_SUBTABS + SubTabNav + body switcher; component lives
//       at ./cockpit/OptionsCockpit. Phase 1 ships a placeholder; full
//       universe-scan + per-asset cockpit fills in via subsequent tasks.
//       Plan: docs/plans/2026-05-13-options-cockpit-implementation.md.
//       Spec:  docs/specs/2026-05-13-options-cockpit-design.md.
// v9 — Indicators sub-tab now ships the ATAS API-key UI (2026-05-13).
//      Replaced the IndicatorsComingSoon placeholder with
//      IndicatorsAtasKey: GET /api/auth/atas/key on mount drives between
//      a Generate form (no key) and a status panel (has key) with
//      Regenerate / Revoke. POST returns the raw mkatas_* key once;
//      it lives in component state only for the duration of the copy-once
//      modal and is never persisted (no localStorage, no AppData, no
//      logging — F-24 lesson). 403 not_eligible → friendly support
//      message; 401 → re-auth via existing auth_request refresh. Contract:
//      bus thread atas-subproject-c-indicators-tab (msg #95).
//
// v8 — Removed beta whitelist gate (2026-05-08). Per-client whitelist no
//      longer needed: v7 already reduced page content to Pulse Room (live)
//      + Indicators (placeholder), neither of which is the unvalidated DC
//      engine the whitelist originally guarded. All Pro / Trial users now
//      see the page directly. Standard / expired users still hit the
//      GatedPanel below. Removed: ComingSoonPanel function, isStressLabWhitelisted
//      import, userEmail from useUserTier destructure. The whitelist.js
//      file remains in the repo (dormant — not imported anywhere now).
// v7 — Pre-ship cleanup (2026-05-07). Removed Thesis and Forest Path
//      sub-tabs and all their associated rendering (watchlist strip,
//      hero/lens/forecast/trade/market-probabilities/guidance/math-deep-
//      dive/empty-state/last-signal panels) plus useStressLabAsset and
//      useStressLabIndex usage and the per-asset ComputeTrace top row.
//      Operator decision: ship Stress Lab to clients with only Pulse Room
//      live + a placeholder for Indicators. Migration: legacy localStorage
//      values "thesis" / "forest_path" are coerced to "pulse_room" on read
//      so existing users don't land on a removed tab.
// v6 — Task 26: wired live prices to PulseRoom via a small REST polling
//      adapter (PulseRoomPricesHost). Polls /api/ticks at 1 Hz and feeds a
//      {symbol: lastPrice} map into <PulseRoom prices={...} />. Polls only
//      while the Pulse Room sub-tab is active (parent unmounts the host
//      when the user switches away), so there is zero cost for users who
//      never open the tab. Chose REST polling over importing useTerminalData
//      because that hook is already running in analytical_terminal.jsx and
//      a second instance would duplicate the WS subscriptions on /ws/prices
//      and /ws/events. /api/ticks is the same endpoint useTerminalData uses
//      to seed prices on initial load — well-trodden, low cost.

import React, { useEffect, useState } from "react";
import { SL, mono } from "./theme";
import PulseRoom           from "./PulseRoom/PulseRoom"; // v5: live sub-tab
import OptionsCockpit from "./cockpit/OptionsCockpit"; // v10: Options Cockpit sub-tab
// v8: whitelist import removed; v11: the page is open to everyone.

// v7: dropped imports — Thesis / Forest Path / per-asset thesis fetching
//     no longer rendered. ComputeTrace, WatchlistStrip, HeroCard, LensStrip,
//     ForecastChart, TradeCard, MarketProbabilities, GuidancePanel,
//     MathDeepDive, EmptyState, LastSignalPanel, ForestPath, useMemo,
//     useStressLabIndex, useStressLabAsset all removed. The dependent
//     files remain in the repo as dormant code (may revive in a later
//     release); only this page stops importing them.

const SUBTAB_STORAGE_KEY  = "mk_stress_lab_subtab";  // v4

// v7: subtab values supported in the current build. Used to migrate
//     legacy localStorage values ("thesis" / "forest_path") to the
//     default Pulse Room.
const VALID_SUBTABS = new Set(["pulse_room", "options_cockpit"]);

// v6: small polling adapter that supplies <PulseRoom /> with a live
//     {symbol: lastPrice} map. Mounted only while the Pulse Room sub-tab
//     is active — when the user switches sub-tabs, this component
//     unmounts and the polling timer is torn down (see useEffect cleanup
//     in the parent's conditional render).
//
//     Endpoint: GET /api/ticks → { ticks: { [sym]: { last, bid, ask, ... } } }
//     Cadence : 1 Hz. The Pulse Room scoring layer in PulseRoom.jsx uses
//             whatever it gets (missing entries are tolerated).
const PULSE_ROOM_PRICE_POLL_MS = 1000;

function PulseRoomPricesHost() {
  const [prices, setPrices] = useState({});

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetch("/api/ticks");
        if (!cancelled && r.ok) {
          const j = await r.json();
          if (!cancelled && j && j.ticks) {
            const next = {};
            for (const [sym, t] of Object.entries(j.ticks)) {
              if (t && typeof t.last === "number") next[sym] = t.last;
            }
            setPrices(next);
          }
        }
      } catch { /* network blip — try again next interval */ }
      if (!cancelled) timer = setTimeout(tick, PULSE_ROOM_PRICE_POLL_MS);
    };

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  return <PulseRoom prices={prices} />;
}

// v4: sub-tab nav bar. Sits between the trial banner and the body content.
// v7: tab list trimmed to Pulse Room (live) + Indicators (placeholder).
function SubTabNav({ value, onChange }) {
  const tabs = [
    { id: "pulse_room",       label: "Pulse Room" },
    { id: "options_cockpit",  label: "Options Cockpit" },   // v10
  ];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0,
      borderBottom: `1px solid ${SL.border}`,
      marginBottom: 14, fontFamily: mono,
    }}>
      {tabs.map(t => {
        const active = value === t.id;
        return (
          <button key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: "9px 18px",
              color: active ? SL.orange : SL.muted,
              fontFamily: mono, fontSize: 11, fontWeight: 700,
              letterSpacing: "1.8px", textTransform: "uppercase",
              borderBottom: `2px solid ${active ? SL.orange : "transparent"}`,
              marginBottom: -1,
              transition: "color 120ms ease-out, border-color 120ms ease-out",
            }}
          >{t.label}</button>
        );
      })}
    </div>
  );
}

// v8: ComingSoonPanel removed. The whitelist gate was the only caller.
//     Whitelist.js remains in the repo as dormant code in case the gate is
//     ever re-introduced.

// ── Page body ───────────────────────────────────────────────────────────
function StressLabBody() {
  // v7: sub-tab persisted; default to Pulse Room. Legacy values
  //     ("thesis" / "forest_path") from older builds are coerced to
  //     "pulse_room" via the VALID_SUBTABS check.
  const [subTab, setSubTab] = useState(() => {
    try {
      const stored = localStorage.getItem(SUBTAB_STORAGE_KEY);
      return VALID_SUBTABS.has(stored) ? stored : "pulse_room";
    } catch { return "pulse_room"; }
  });
  useEffect(() => {
    try { localStorage.setItem(SUBTAB_STORAGE_KEY, subTab); } catch {}
  }, [subTab]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: "auto",
      background: SL.bg, padding: "14px 18px 24px 18px",
      fontFamily: mono,
    }}>
      {/* Identity pill (v7: ComputeTrace removed with thesis) */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
        flexWrap: "wrap",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "5px 11px", borderRadius: 3,
          background: `linear-gradient(90deg, ${SL.proBgStart}, ${SL.proBgEnd})`,
          color: SL.proGold, border: `1px solid ${SL.proGoldDeep}`,
          fontSize: 11, fontWeight: 700, letterSpacing: "1.2px",
        }}>◆ STRESS LAB</div>
      </div>

      {/* v4: Sub-tab nav (v7: Pulse Room / Indicators) */}
      <SubTabNav value={subTab} onChange={setSubTab} />

      {/* Pulse Room — live prices via PulseRoomPricesHost.
          Mounted only while the sub-tab is active; unmounts on switch. */}
      {subTab === "pulse_room" && <PulseRoomPricesHost />}

      {/* v10: Options Cockpit — placeholder shell (Phase 1). */}
      {subTab === "options_cockpit" && <OptionsCockpit />}

    </div>
  );
}

// ── Top-level ───────────────────────────────────────────────────────────
// v11: open to everyone — no tier checks in the open-source edition.
export default function StressLab() {
  return <StressLabBody />;
}
