// useAppVersion.js — v2
// Reads /api/version for current + latest version info.
// Re-fetches on mount and on manual refetch(); otherwise server caches 10min.
// v2 — Open-source edition: releases live on GitHub; Telegram link removed.

import { useCallback, useEffect, useState } from "react";

const RELEASES_URL = "https://github.com/wJubran/QuantumTerminal/releases";

export function useAppVersion() {
  const [state, setState] = useState({
    current: "",
    latest: "",
    updateAvailable: false,
    downloadUrl: RELEASES_URL,
    releasedAt: "",
    bannerMessage: "",
    loading: true,
    error: null,
  });

  const fetchVersion = useCallback(async (force = false) => {
    try {
      const url = force ? "/api/version?refresh=true" : "/api/version";
      const res = await fetch(url);
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false, error: `HTTP ${res.status}` }));
        return;
      }
      const d = await res.json();
      setState({
        current: d.current || "",
        latest: d.latest || "",
        updateAvailable: !!d.update_available,
        downloadUrl: d.download_url || RELEASES_URL,
        releasedAt: d.released_at || "",
        bannerMessage: d.banner_message || "",
        loading: false,
        error: null,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }, []);

  useEffect(() => { fetchVersion(false); }, [fetchVersion]);

  return { ...state, refetch: () => fetchVersion(true) };
}

export default useAppVersion;
