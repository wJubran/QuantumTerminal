// version: v2
// PulseRoom.jsx — top-level for the PRO Pulse Room sub-tab inside Stress Lab.
// Renders top bar (with scanner switch), stale banner, asset grid,
// alert strip, footer stats. Composes everything from this directory.

import React, { useEffect, useMemo, useState } from "react";
import { usePulseStore } from "./pulseStore";
import { scoreAsset } from "./scoring";
import { generateAlertText } from "./alertText";
import ScannerSwitch from "./ScannerSwitch";
import WatchlistConfig from "./WatchlistConfig";
import AssetCard from "./AssetCard";
import AlertStrip from "./AlertStrip";
import StatsFooter from "./StatsFooter";
import StaleBanner from "./StaleBanner";
import PulseErrorBoundary from "./PulseErrorBoundary";
import css from "./styles.module.css";

const POLL_PRICE_MS = 250;  // poll the existing v2 price hub when no WS is wired yet

function PulseRoomInner({ prices }) {
  // `prices` is a {symbol: lastPrice} map maintained by the parent
  // (see Task 26 wiring). It's optional for first mount.
  const { state, refresh, setScanner, setWatchlist, calculate } = usePulseStore();
  const [showWatchlistConfig, setShowWatchlistConfig] = useState(false);

  const { snapshot, scannerEnabled, snapshotMeta, calculating, calculateError } = state;

  // ---- per-tick scoring (only when snapshot exists & scanner ON) ----
  const scoredAssets = useMemo(() => {
    if (!snapshot || !snapshot.assets) return [];
    if (!scannerEnabled) return Object.entries(snapshot.assets).map(([sym, a]) => ({
      symbol: sym, score: 0, level: "low", contributors: [], priceNow: prices?.[sym] ?? null,
    }));
    const out = [];
    const threshold = snapshot.threshold_sd ?? 0.5;
    for (const [sym, asset] of Object.entries(snapshot.assets)) {
      const priceNow = prices?.[sym];
      if (!priceNow) {
        out.push({ symbol: sym, score: 0, level: "low", contributors: [], priceNow: null });
        continue;
      }
      const r = scoreAsset(asset, priceNow, threshold);
      out.push({
        symbol: sym, priceNow,
        score: r.score, level: r.level, contributors: r.contributors,
        nActive: r.nActive,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }, [snapshot, prices, scannerEnabled]);

  // ---- top-6 cards / counter rollups ----
  const topCards = scoredAssets.slice(0, 6);
  const counts = useMemo(() => {
    const c = { scanned: scoredAssets.length, impact: 0, elevated: 0, quiet: 0 };
    for (const a of scoredAssets) {
      if (a.level === "high") c.impact++;
      else if (a.level === "med") c.elevated++;
      else c.quiet++;
    }
    return c;
  }, [scoredAssets]);

  // ---- alerts (top assets that have any score) ----
  const alerts = useMemo(() => {
    return scoredAssets
      .filter(a => a.score >= 40 && a.contributors.length > 0)
      .slice(0, 6)
      .map(a => ({
        symbol: a.symbol,
        text: generateAlertText(a.contributors),
        contributors: a.contributors.slice(0, 3),
        level: a.level,
      }))
      .filter(a => a.text);
  }, [scoredAssets]);

  // ---- stale detection ----
  const isStale = useMemo(() => {
    if (!snapshotMeta?.exists) return false;
    if (snapshot && state.watchlist) {
      // We don't recompute the hash here — the server already gives us the
      // snapshot's hash, and we trust the watchlist matches if scanner is ON
      // (auto-rebuild). Only show stale when scanner is OFF and the hashes differ.
      if (!scannerEnabled && snapshot.watchlist_hash) {
        // Heuristic: if the user's current watchlist_hash differs (we can't
        // see the live hash directly, but `/state` re-emits both), show stale
        // when source_sync_at < server's reported sync time. For Phase 1 we
        // surface a stale flag whenever snapshotMeta.computed_at is older
        // than 30 minutes; the server will set source_sync_at on auto-rebuild
        // so this is a soft indicator only.
        if (snapshotMeta.computed_at) {
          const ageMs = Date.now() - new Date(snapshotMeta.computed_at).getTime();
          return ageMs > 30 * 60_000;
        }
      }
    }
    return false;
  }, [snapshotMeta, snapshot, scannerEnabled, state.watchlist]);

  const watchlistEmpty = !state.watchlist?.assets?.length;

  return (
    <div className={css.page} style={{ position: "relative", minHeight: 600 }}>
      {/* Top bar */}
      <div className={css.topBar}>
        <div className={css.brandSmall}>Quantum Terminal</div>
        <div className={css.title}>Pulse Room</div>
        <ScannerSwitch enabled={scannerEnabled} onChange={setScanner} />
      </div>

      {/* Stale banner */}
      {isStale && (
        <StaleBanner
          ageMs={Date.now() - new Date(snapshotMeta.computed_at).getTime()}
          onRecalc={calculate}
          calculating={calculating}
        />
      )}

      {/* Empty / first-run state */}
      {watchlistEmpty && !showWatchlistConfig && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className={css.dim} style={{ marginBottom: 12 }}>
            Configure your Pulse watchlist to begin.
          </div>
          <button onClick={() => setShowWatchlistConfig(true)}
                  style={{ padding: "8px 16px", background: "#1a1a2e",
                           color: "#E8B84B", border: "1px solid #E8B84B",
                           cursor: "pointer", letterSpacing: 2,
                           fontFamily: "monospace", fontSize: 11 }}>
            Configure watchlist
          </button>
        </div>
      )}

      {/* Calculate prompt when watchlist set but no snapshot */}
      {!watchlistEmpty && !snapshotMeta?.exists && !showWatchlistConfig && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className={css.dim} style={{ marginBottom: 12 }}>
            Press Calculate to build your pulse data.
          </div>
          <button onClick={calculate} disabled={calculating}
                  style={{ padding: "8px 16px", background: "#1a1a2e",
                           color: "#E8B84B", border: "1px solid #E8B84B",
                           cursor: calculating ? "wait" : "pointer",
                           letterSpacing: 2, fontFamily: "monospace", fontSize: 11 }}>
            {calculating ? "Calculating…" : "Calculate"}
          </button>
          {calculateError && (
            <div style={{ marginTop: 12, color: "#E04040", fontSize: 11 }}>
              {calculateError}
            </div>
          )}
        </div>
      )}

      {/* Empty-snapshot info panel — snapshot built but no assets matched */}
      {snapshotMeta?.exists && !showWatchlistConfig && topCards.length === 0 && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className={css.dim} style={{ marginBottom: 12 }}>
            Snapshot built, but no assets matched your watchlist's data files.
          </div>
          <div className={css.muted} style={{ fontSize: 10, marginBottom: 16 }}>
            Some assets may be missing from the local cache. Try a different watchlist
            selection, or wait for the next data sync.
          </div>
          <button onClick={() => setShowWatchlistConfig(true)}
                  style={{ padding: "8px 16px", background: "#1a1a2e",
                           color: "#E8B84B", border: "1px solid #E8B84B",
                           cursor: "pointer", letterSpacing: 2,
                           fontFamily: "monospace", fontSize: 11 }}>
            Edit watchlist
          </button>
        </div>
      )}

      {/* Asset grid (only when snapshot exists and has assets) */}
      {snapshotMeta?.exists && !showWatchlistConfig && topCards.length > 0 && (
        <>
          <div className={css.grid}>
            {topCards.map(card => (
              <AssetCard key={card.symbol} card={card} />
            ))}
          </div>
          <AlertStrip alerts={alerts} />
          <StatsFooter
            counts={counts}
            lastCalcAt={snapshotMeta.computed_at}
            onRecalc={calculate}
            calculating={calculating}
            onEditWatchlist={() => setShowWatchlistConfig(true)}
          />
        </>
      )}

      {/* Watchlist config drawer */}
      {showWatchlistConfig && (
        <WatchlistConfig
          watchlist={state.watchlist}
          onSave={async (wl) => { await setWatchlist(wl); setShowWatchlistConfig(false); }}
          onCancel={() => setShowWatchlistConfig(false)}
        />
      )}

      {/* Calculating overlay */}
      {calculating && (
        <div className={css.calcOverlay}>Calculating…</div>
      )}

      {/* Generic error toast */}
      {state.error && (
        <div style={{ position: "absolute", bottom: 12, right: 12,
                      background: "#400", color: "#FBB", padding: "6px 12px",
                      fontSize: 11, fontFamily: "monospace", borderRadius: 3 }}>
          {state.error}
        </div>
      )}
    </div>
  );
}

export default function PulseRoom(props) {
  return (
    <PulseErrorBoundary>
      <PulseRoomInner {...props} />
    </PulseErrorBoundary>
  );
}
