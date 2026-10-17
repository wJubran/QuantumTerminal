// version: v2
// v2 — Added F key for "fit chart" (snap visible range to last FIT_CANDLES
//      bars) (2026-05-08). Operator request for parity with v1's browser-
//      mode shortcut feel.
/**
 * useKeyboardShortcuts.js — Global keyboard shortcuts for the terminal.
 * Quantum Terminal | Phase 4A
 *
 * Shortcuts only fire when no input/textarea/select is focused.
 *
 * Key Map:
 *   ↑ / ↓       Navigate tickers in asset list
 *   1–6          Switch timeframe (M1, M5, M15, H1, H4, D1)
 *   B            Toggle bands
 *   S            Toggle signals
 *   C            Toggle all cones
 *   A            Toggle all anchors
 *   F            Fit chart to last FIT_CANDLES bars (v2)
 *   R            Run calculate on selected ticker
 *   Esc          Close settings panel / deselect ticker
 */
import { useEffect, useCallback } from "react";

const TF_KEYS = { "1": "M1", "2": "M5", "3": "M15", "4": "H1", "5": "H4", "6": "D1" };

/**
 * @param {Object} opts
 * @param {string[]}   opts.tickers        - Ordered list of visible ticker symbols
 * @param {string}     opts.selectedTicker  - Currently selected ticker
 * @param {Function}   opts.onSelectTicker  - (ticker) => void
 * @param {Function}   opts.onTimeframe     - (tf) => void — e.g. "M15"
 * @param {Function}   opts.onToggleBands   - () => void
 * @param {Function}   opts.onToggleSignals - () => void
 * @param {Function}   opts.onToggleCones   - () => void
 * @param {Function}   opts.onToggleAnchors - () => void
 * @param {Function}   opts.onCalculate     - () => void
 * @param {Function}   opts.onEscape        - () => void
 * @param {boolean}    opts.enabled         - Master switch (disable during modal/settings)
 */
export default function useKeyboardShortcuts({
  tickers = [],
  selectedTicker = "",
  onSelectTicker,
  onTimeframe,
  onToggleBands,
  onToggleSignals,
  onToggleCones,
  onToggleAnchors,
  onCalculate,
  onFitChart,
  onEscape,
  enabled = true,
}) {
  const handler = useCallback((e) => {
    if (!enabled) return;

    // Skip if user is typing in an input field
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    // Skip if contentEditable
    if (document.activeElement?.isContentEditable) return;

    const key = e.key;

    // ── Arrow keys: ticker navigation ──
    if (key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      if (!tickers.length) return;
      const idx = tickers.indexOf(selectedTicker);
      if (key === "ArrowUp") {
        const next = idx <= 0 ? tickers[tickers.length - 1] : tickers[idx - 1];
        onSelectTicker?.(next);
      } else {
        const next = idx < 0 || idx >= tickers.length - 1 ? tickers[0] : tickers[idx + 1];
        onSelectTicker?.(next);
      }
      return;
    }

    // ── Number keys 1-6: timeframe switch ──
    if (TF_KEYS[key]) {
      e.preventDefault();
      onTimeframe?.(TF_KEYS[key]);
      return;
    }

    // ── Letter keys (case-insensitive) ──
    const k = key.toLowerCase();

    if (k === "b") { e.preventDefault(); onToggleBands?.(); return; }
    if (k === "s") { e.preventDefault(); onToggleSignals?.(); return; }
    if (k === "c") { e.preventDefault(); onToggleCones?.(); return; }
    if (k === "a") { e.preventDefault(); onToggleAnchors?.(); return; }
    if (k === "f") { e.preventDefault(); onFitChart?.(); return; }   // v2
    if (k === "r") { e.preventDefault(); onCalculate?.(); return; }

    // ── Escape ──
    if (key === "Escape") { onEscape?.(); return; }
  }, [enabled, tickers, selectedTicker, onSelectTicker, onTimeframe,
      onToggleBands, onToggleSignals, onToggleCones, onToggleAnchors,
      onCalculate, onEscape]);

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}
