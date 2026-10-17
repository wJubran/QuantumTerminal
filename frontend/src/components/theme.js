/**
 * theme.js — Theme System
 * Quantum Terminal | Phase 4F
 *
 * Provides DARK and LIGHT color palettes, React context, and a ThemeProvider
 * that injects CSS custom properties for global coverage.
 *
 * Usage:
 *   import { ThemeProvider, useTheme } from "./theme";
 *
 *   // Wrap app:
 *   <ThemeProvider mode="dark"> ... </ThemeProvider>
 *
 *   // In any component:
 *   const { C, mono, mode } = useTheme();
 */
import React, { createContext, useContext, useEffect, useMemo } from "react";

// ════════════════════════════════════════════════════════
// COLOR PALETTES
// ════════════════════════════════════════════════════════
export const DARK = {
  bg: "#000000", bgPanel: "#0a0a0a", bgCard: "#111111", bgHover: "#1a1a1a",
  border: "#222222", borderLt: "#333333",
  white: "#ffffff", gray: "#999999", muted: "#444444",
  orange: "#ff6d00", orangeDim: "#cc5500", orangeBg: "#ff6d0012",
  green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", amber: "#ffa500", cyan: "#00d2d3", purple: "#9b59b6",
  yellow: "#f1c40f",
  textPrimary: "#ffffff", textSecondary: "#999999", textMuted: "#444444",
  scrollThumb: "#333333", scrollTrack: "#0a0a0a",
};

export const LIGHT = {
  bg: "#f5f5f5", bgPanel: "#eaeaea", bgCard: "#ffffff", bgHover: "#e0e0e0",
  border: "#d0d0d0", borderLt: "#c0c0c0",
  white: "#111111", gray: "#666666", muted: "#aaaaaa",
  orange: "#e06000", orangeDim: "#cc5500", orangeBg: "#ff6d0012",
  green: "#1a9e45", red: "#d42d2d",
  blue: "#2070cc", amber: "#d48a00", cyan: "#008b8b", purple: "#7b3fa0",
  yellow: "#c9a000",
  textPrimary: "#111111", textSecondary: "#555555", textMuted: "#999999",
  scrollThumb: "#cccccc", scrollTrack: "#eaeaea",
};

export const THEMES = { dark: DARK, light: LIGHT };

export const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

// ════════════════════════════════════════════════════════
// REACT CONTEXT
// ════════════════════════════════════════════════════════
const ThemeContext = createContext({
  C: DARK,
  mono,
  mode: "dark",
});

export function useTheme() {
  return useContext(ThemeContext);
}

// ════════════════════════════════════════════════════════
// THEME PROVIDER — injects CSS vars + provides context
// ════════════════════════════════════════════════════════
export function ThemeProvider({ mode = "dark", children }) {
  const C = THEMES[mode] || DARK;

  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(C)) {
      root.style.setProperty(`--mk-${key}`, value);
    }
    root.style.setProperty("--mk-mono", mono);
    root.setAttribute("data-theme", mode);

    const styleId = "mk-theme-scrollbar";
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: ${C.scrollTrack}; }
      ::-webkit-scrollbar-thumb { background: ${C.scrollThumb}; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: ${C.orange}80; }
      body { background: ${C.bg}; color: ${C.textPrimary}; transition: background 0.3s, color 0.3s; }
      ::selection { background: ${C.orange}40; color: ${C.white}; }
    `;
  }, [mode, C]);

  const value = useMemo(() => ({ C, mono, mode }), [C, mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ════════════════════════════════════════════════════════
// HELPER — for components not yet migrated to context
// ════════════════════════════════════════════════════════
export function getThemeColors() {
  const root = document.documentElement;
  const mode = root.getAttribute("data-theme") || "dark";
  return THEMES[mode] || DARK;
}
