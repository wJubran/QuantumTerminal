// version: v1
// pulseStore.js — single source of truth for Pulse Room.
// Custom React hook: returns state + mutators.

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./pulseApi";

const POLL_INTERVAL_MS = 10_000;

export function usePulseStore() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    scannerEnabled: false,
    watchlist: { assets: [] },
    snapshot: null,
    snapshotMeta: { exists: false },
    calculating: false,
    calculateError: null,
  });

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const _applyServerState = useCallback((s) => {
    if (!mounted.current) return;
    setState((prev) => ({
      ...prev,
      loading: false,
      error: null,
      scannerEnabled: s.scanner_enabled,
      watchlist: s.watchlist,
      snapshot: s.snapshot,
      snapshotMeta: s.snapshot_meta,
    }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.fetchState();
      _applyServerState(s);
    } catch (e) {
      if (mounted.current) {
        setState((prev) => ({ ...prev, loading: false, error: String(e.message || e) }));
      }
    }
  }, [_applyServerState]);

  // Initial fetch + 10s polling.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const setScanner = useCallback(async (enabled) => {
    try {
      const s = await api.putScanner(enabled);
      _applyServerState(s);
    } catch (e) {
      setState((prev) => ({ ...prev, error: String(e.message || e) }));
    }
  }, [_applyServerState]);

  const setWatchlist = useCallback(async (watchlist) => {
    try {
      const s = await api.putWatchlist(watchlist);
      _applyServerState(s);
    } catch (e) {
      setState((prev) => ({ ...prev, error: String(e.message || e) }));
    }
  }, [_applyServerState]);

  const calculate = useCallback(async () => {
    setState((prev) => ({ ...prev, calculating: true, calculateError: null }));
    try {
      const s = await api.calculate();
      _applyServerState(s);
    } catch (e) {
      if (mounted.current) {
        setState((prev) => ({
          ...prev,
          calculateError: String(e.message || e),
        }));
      }
    } finally {
      if (mounted.current) {
        setState((prev) => ({ ...prev, calculating: false }));
      }
    }
  }, [_applyServerState]);

  return { state, refresh, setScanner, setWatchlist, calculate };
}
