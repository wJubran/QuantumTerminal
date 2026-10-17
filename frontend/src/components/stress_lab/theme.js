// version: v1
// Stress Lab theme — sits on top of the Quantum Terminal palette. We keep the
// black/orange industrial base from chart_constants but add:
//   · a gold "PRO" accent (ffd89e/b8823d) for tier pill + hero gradient
//   · conviction-specific coloring for chips (strong/moderate/wait/avoid)
//   · lens alignment colors (align/warn/oppose/neutral) computed from verdict
//
// Exported as plain constants + helper functions so every sub-component
// pulls from one source of truth.

export const SL = {
  // Base (inherited from main terminal theme)
  bg:        "#000",
  bgPanel:   "#0a0a0a",
  bgCard:    "#111",
  bgRaised:  "#141b24",
  border:    "#222",
  borderLt:  "#333",
  white:     "#fff",
  text:      "#e8ecf1",
  textSoft:  "#c5cdd9",
  muted:     "#6b7785",
  dim:       "#4d5866",

  // Accents
  orange:    "#ff6d00",
  green:     "#27c49a",
  greenDeep: "#1d5c42",
  red:       "#ff5e5e",
  redDeep:   "#5c1d1d",
  amber:     "#f5a623",
  amberDeep: "#5c4a1d",
  blue:      "#3796ff",
  cyan:      "#2aa3d9",
  grey:      "#7a8a99",
  greyDeep:  "#293847",

  // Pro tier — gold gradient
  proGold:     "#ffd89e",
  proGoldDeep: "#b8823d",
  proBgStart:  "#5d3a1f",
  proBgEnd:    "#8b5a2b",
};

export const mono = "'Courier New', 'SF Mono', 'Monaco', 'Consolas', monospace";

// ── Conviction → chip / verdict styling ─────────────────────────────────
// Direction suffix (LONG/SHORT) applies to strong + moderate only.
export function convictionStyle(conviction, direction) {
  const key = conviction === "wait" || conviction === "avoid"
    ? conviction
    : `${conviction}_${direction || "neutral"}`;
  const table = {
    strong_long:    { bg: "#0f2a1d", text: SL.green, border: SL.greenDeep, label: "STRONG LONG" },
    strong_short:   { bg: "#2a1616", text: SL.red,   border: SL.redDeep,   label: "STRONG SHORT" },
    moderate_long:  { bg: "#2a2316", text: SL.amber, border: SL.amberDeep, label: "MODERATE LONG" },
    moderate_short: { bg: "#2a2316", text: SL.amber, border: SL.amberDeep, label: "MODERATE SHORT" },
    wait:           { bg: "#15202a", text: SL.grey,  border: SL.greyDeep,  label: "WAIT" },
    avoid:          { bg: "#2a1616", text: SL.red,   border: SL.redDeep,   label: "AVOID" },
  };
  return table[key] || table.wait;
}

// ── Lens alignment vs thesis direction ──────────────────────────────────
// Returns "align" | "warn" | "oppose" | "neutral" | "unavailable"
export function lensAlignment(verdict, thesisDirection) {
  if (!verdict || verdict === "unavailable") return "unavailable";
  if (verdict === "neutral" || verdict === "supportive") return "neutral";
  if (verdict === "divergent_unclear") return "warn";
  if (verdict === "short_risk_warning" || verdict === "long_risk_warning") return "oppose";
  // verdict is "long" or "short"
  if (!thesisDirection) return "neutral";
  if (verdict === thesisDirection) return "align";
  return "oppose";
}

export const ALIGNMENT_COLORS = {
  align:       { border: SL.green,  tint: "#0f2a1d" },
  warn:        { border: SL.amber,  tint: "#2a2316" },
  oppose:      { border: SL.red,    tint: "#2a1616" },
  neutral:     { border: SL.muted,  tint: "#15202a" },
  unavailable: { border: SL.borderLt, tint: SL.bgCard },
};

// ── Number formatting ───────────────────────────────────────────────────
export function fmtPrice(v, decimals) {
  if (v == null || !Number.isFinite(v)) return "—";
  const dp = decimals != null ? decimals
           : Math.abs(v) < 10 ? 4
           : Math.abs(v) < 1000 ? 2
           : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtPct(v, dp = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
}

export function fmtProb(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

// Format values inside lens.facts — engine emits a mix of types.
export function fmtFactValue(v) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (Number.isFinite(v)) {
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (Math.abs(v) >= 1)    return v.toFixed(2);
    if (Math.abs(v) > 0)     return v.toFixed(3);
    return "0";
  }
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Prettify a fact key: "ou_half_life_days" → "OU half life days"
export function prettyFactKey(key) {
  return String(key).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Relative time label like "2 min ago" / "just now" from an ISO timestamp.
export function relativeTime(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45)      return "just now";
  if (s < 90)      return "1 min ago";
  if (s < 3600)    return `${Math.round(s / 60)} min ago`;
  if (s < 7200)    return "1 hr ago";
  if (s < 86400)   return `${Math.round(s / 3600)} hr ago`;
  return new Date(t).toLocaleDateString();
}
