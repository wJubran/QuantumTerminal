// version: v3
// v3: universe is now hardcoded to the 5 ETF-backed canonicals DC produces
//     options data for (US500/USTEC/XAUUSD/XAGUSD/XTIUSD). Reason: the
//     planned `/api/stress_lab/index` source returns 404 — that endpoint's
//     watchlist file was retired in StressLab v7 when Thesis/Forest-Path
//     were removed. The cockpit's universe IS "tickers with options data",
//     which is exactly those 5. When DC expands the options universe (or
//     ships /api/options/universe), update the constant or swap to the
//     endpoint.
// v2: clear selectedPayload/selectedError on asset switch (issue 1); remove dead aliveRef (issue 2).
// version: v1
// useOptionsCockpit.js — orchestrates the cockpit's state + data fetches.
//
// Returns:
//   {
//     mode, setMode,               // "intraday" | "swing"
//     selectedAsset, setSelectedAsset,
//     selectedPayload,             // 2.3 options payload for selectedAsset, or null
//     selectedLoading,
//     selectedError,
//     universe,                    // [{ ticker, payload, loading, error, fetchedAt }]
//     refreshUniverse,             // () => void — manual refresh
//   }
//
// Per-asset payloads are GET /api/options/{ticker}/full?n=8 (the live 2.3
// payload). Polling:
//   - Selected asset: every 60s.
//   - Universe rows: every 5 min.
// Polling pauses when document.visibilityState !== "visible".
import { useEffect, useState, useCallback, useMemo } from "react";

// Phase-1 universe: the 5 ETF-backed canonicals DC produces options for
// (confirmed in bus thread dc-thetadata-migration-2026-05-12 msgs #79/#85).
// Swap to a dynamic source when DC ships /api/options/universe.
const OPTIONS_UNIVERSE = ["US500", "USTEC", "XAUUSD", "XAGUSD", "XTIUSD"];

const SELECTED_POLL_MS = 60_000;
const UNIVERSE_POLL_MS = 5 * 60_000;

async function fetchOptionsFull(ticker, signal) {
  const r = await fetch(`/api/options/${encodeURIComponent(ticker)}/full?n=8`, { signal });
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export function useOptionsCockpit() {
  // Stable Phase-1 universe; memoized to keep effect dep refs stable.
  const index = useMemo(() => OPTIONS_UNIVERSE, []);
  const indexLoading = false;
  const [mode, setMode]                 = useState("intraday");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedPayload, setSelectedPayload] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [universe, setUniverse] = useState([]);
  const [universeTick, setUniverseTick] = useState(0);
  // Default-select the first asset in the index once it loads.
  useEffect(() => {
    if (!selectedAsset && Array.isArray(index) && index.length > 0) {
      setSelectedAsset(index[0].ticker || index[0]);
    }
  }, [index, selectedAsset]);

  // Polling for the selected asset.
  useEffect(() => {
    if (!selectedAsset) return undefined;
    setSelectedPayload(null);
    setSelectedError(null);
    const ac = new AbortController();
    let timer = null;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timer = setTimeout(tick, SELECTED_POLL_MS);
        return;
      }
      setSelectedLoading(true);
      setSelectedError(null);
      try {
        const data = await fetchOptionsFull(selectedAsset, ac.signal);
        if (!cancelled) setSelectedPayload(data);
      } catch (e) {
        if (!cancelled && e.name !== "AbortError") setSelectedError(e);
      } finally {
        if (!cancelled) setSelectedLoading(false);
        if (!cancelled) timer = setTimeout(tick, SELECTED_POLL_MS);
      }
    };
    tick();
    return () => { cancelled = true; ac.abort(); if (timer) clearTimeout(timer); };
  }, [selectedAsset]);

  // Universe-row fetching. Each ticker in the index gets one fetch on mount
  // + every UNIVERSE_POLL_MS thereafter (also gated by visibility).
  useEffect(() => {
    if (!Array.isArray(index) || index.length === 0) return undefined;
    const tickers = index.map(e => e.ticker || e);
    let cancelled = false;
    const controllers = tickers.map(() => new AbortController());

    const fetchAll = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const next = await Promise.all(tickers.map(async (t, i) => {
        try {
          const p = await fetchOptionsFull(t, controllers[i].signal);
          return { ticker: t, payload: p, loading: false, error: null, fetchedAt: Date.now() };
        } catch (e) {
          if (e.name === "AbortError") return null;
          return { ticker: t, payload: null, loading: false, error: e, fetchedAt: Date.now() };
        }
      }));
      if (!cancelled) setUniverse(next.filter(Boolean));
    };
    fetchAll();
    const interval = setInterval(fetchAll, UNIVERSE_POLL_MS);
    return () => {
      cancelled = true;
      controllers.forEach(c => c.abort());
      clearInterval(interval);
    };
  }, [index, universeTick]);

  const refreshUniverse = useCallback(() => setUniverseTick(t => t + 1), []);

  return {
    mode, setMode,
    selectedAsset, setSelectedAsset,
    selectedPayload, selectedLoading, selectedError,
    universe, indexLoading,
    refreshUniverse,
  };
}
