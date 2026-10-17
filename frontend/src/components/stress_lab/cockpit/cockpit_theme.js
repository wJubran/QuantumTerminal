// version: v1
// cockpit_theme.js — palette overrides on top of stress_lab/theme.js's SL.
// Adds verdict colors (buy/sell/warn) and the trade-card accent.
// Re-exports SL/mono so cockpit components only need one import.
import { SL, mono, relativeTime } from "../theme";

export const CK = {
  ...SL,
  buy:       "#00c853",
  buySoft:   "rgba(0,200,83,0.12)",
  buyBorder: "rgba(0,200,83,0.40)",
  sell:      "#f44336",
  sellSoft:  "rgba(244,67,54,0.12)",
  sellBorder:"rgba(244,67,54,0.40)",
  warn:      "#ffab00",
  warnSoft:  "rgba(255,171,0,0.12)",
  warnBorder:"rgba(255,171,0,0.40)",
  info:      "#38bdf8",
  infoSoft:  "rgba(56,189,248,0.12)",
  neutralDim:"#6b7280",
  panelGrad: "linear-gradient(180deg, #131922 0%, #11161e 100%)",
};

export { mono, relativeTime };
