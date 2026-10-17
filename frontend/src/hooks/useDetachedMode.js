// version: v1
/**
 * useDetachedMode — reads ?detached=<pageId> from the URL on mount and
 * exposes a swapPage() helper that updates the URL via history.replaceState
 * (so Ctrl+R preserves the chosen page).
 *
 * Used by analytical_terminal.jsx to early-return DetachedShell when the
 * window was opened via window.mkElectron.openInNewWindow(pageId).
 */
import { useState, useCallback } from "react";

const VALID_PAGES = new Set(["quant", "fundamental", "flow", "options", "stress", "learn"]);

function readInitialPage() {
  if (typeof window === "undefined") return null;
  try {
    const p = new URLSearchParams(window.location.search).get("detached");
    return p && VALID_PAGES.has(p) ? p : null;
  } catch {
    return null;
  }
}

export default function useDetachedMode() {
  const [pageId, setPageId] = useState(readInitialPage);

  const swapPage = useCallback((newId) => {
    if (!VALID_PAGES.has(newId)) return;
    setPageId(newId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("detached", newId);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      console.error("[useDetachedMode] history.replaceState failed:", e);
    }
  }, []);

  return { isDetached: pageId != null, pageId, swapPage };
}

export { VALID_PAGES };
