// version: v5
// v5 — Added row-level CalibratingBadge to Vanna Pressure (cutoffs ±5/±25
//      provisional) and Market Entropy (v2 in canary) rows. Other 8 rows
//      are not flagged provisional by DC — left unmarked.
// v4 — Phase-2 signal_history wire-up (DC msg #123, format_version 2.4.2).
//      Wired 7 more sparklines: iv_skew, iv_skew_0dte, iv_divergence,
//      retail_trap, pc_ratio, charm_0dte, expected_move_0dte. The
//      pc_ratio one was actually already shipping in 2.4 — I missed it
//      in v3, fixed here. Net result: 9 of 10 SignalStack rows now have
//      live sparklines (entropy stays deferred until v2 canary cuts
//      over per DC msg #117).
//      Mechanical wire-up — same extractSeries() pattern as the existing
//      vanna + dealer_scenarios rows. Each row pulls .v from the
//      [{t,v},...] array, falls back to FLAT8 when buffer < 2 entries.
//      Per-row tones unchanged.
// v3 — Wired entropy v2 canary (DC msg #117 sauce-revision-2026-05-13).
//      The Market Entropy row now reads `market_entropy.intraday.{score,
//      state}` as the primary signal (v1 `entropy/state` shown in
//      sub-text for canary comparison). Dropped the EXPERIMENTAL tag
//      and the dimming since v2 is the answer to the calm-tape bug.
//      Handles four states: ORDERED / MODERATE / CHAOTIC / UNKNOWN
//      (UNKNOWN renders gray when too many input features were null).
//      Once DC drops the legacy fields (canary cutover → format_version
//      2.5), we'll remove the v1 sub-text comparison.
// v2 — Three batched fixes:
//   (a) Real signal_history wired for the 2 signals DC has shipped
//       (msg #115 sauce-revision-2026-05-13 thread): vanna_pct_history
//       drives the Vanna Pressure sparkline, asymmetry_ratio_history
//       drives the Dealer Scenarios sparkline. Both extract `.v` from
//       the [{t, v}, ...] arrays and render the last 8 points (~40 min
//       at the Tier-A 5-min cadence). Falls back to FLAT8 when DC
//       hasn't filled the buffer yet (length < 2). Other 7 rows stay
//       on FLAT8 — those signals' history endpoints are deferred to
//       cockpit Phase-2 per DC's priority sort (msg #110).
//   (b) Wt column REMOVED — values were hand-typed placeholders
//       ("22%", "−12%", etc) that read like real fitted composite
//       weights but were just hand-rule guesses. Pros could mistake
//       them for real data; the column came out entirely until DC
//       ships composite_verdict with real per-signal weights.
//   (c) Market Entropy row marked experimental — entropy v1 has the
//       known calibration bug (calm tape reads CHAOTIC). Per DC msg
//       #110, v2 is in RnD redesign; in the meantime the row is dimmed
//       and the sub-text carries an "RnD redesign in progress · v1
//       calm-tape bias" tag so the user knows not to trust this row's
//       verdict.
// version: v1 — original Phase-1 scaffolding.
//
// SignalStack.jsx — 9-row deep-reasoning signal table.
// Reads the 2.3 payload directly; renders current value + verdict tag +
// sparkline + freshness.
import React from "react";
import { CK, mono } from "./cockpit_theme";
import Sparkline from "./Sparkline";
import CalibratingBadge from "../../shared/CalibratingBadge"; // v5

// Color the verdict tag by parsing BUY/SELL/NEUTRAL/etc out of the verdict
// string (matches the existing OptionsPanel.jsx convention).
function tagColors(text) {
  if (!text) return { bg: "rgba(255,255,255,0.05)", fg: CK.muted };
  if (text.includes("BUY"))   return { bg: CK.buySoft,  fg: CK.buy };
  if (text.includes("SELL"))  return { bg: CK.sellSoft, fg: CK.sell };
  if (text.includes("TRAP") || text.includes("WARN") || text.includes("CHAOTIC") || text.includes("HEAVY"))
                              return { bg: CK.warnSoft, fg: CK.warn };
  if (text.includes("ORDERED") || text.includes("CHEAP") || text.includes("BREAKOUT"))
                              return { bg: CK.buySoft,  fg: CK.buy };
  if (text.includes("FADE") || text.includes("RICH"))
                              return { bg: CK.sellSoft, fg: CK.sell };
  return { bg: CK.infoSoft, fg: CK.info };
}

function VerdictTag({ children }) {
  const c = tagColors(String(children || ""));
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 3, fontSize: 11, fontWeight: 600,
      letterSpacing: "0.3px",
      background: c.bg, color: c.fg,
    }}>{children}</span>
  );
}

// v2: FLAT8 stays as the fallback for rows where DC hasn't shipped
// signal_history yet. Vanna + Dealer Scenarios get real series.
const FLAT8 = [0, 0, 0, 0, 0, 0, 0, 0];

function flatColor(state) {
  if (state === "buy")     return CK.buy;
  if (state === "sell")    return CK.sell;
  if (state === "warn")    return CK.warn;
  return CK.muted;
}

// v2: extract last N values from a `[{t, v}, ...]` history array,
// filtering null/non-finite. Returns FLAT8-equivalent fallback when
// the buffer doesn't have enough points to draw a meaningful line.
function extractSeries(historyArr, take = 8) {
  if (!Array.isArray(historyArr)) return null;
  const vals = historyArr.map(p => p?.v).filter(v => Number.isFinite(v));
  if (vals.length < 2) return null;
  return vals.slice(-take);
}

export default function SignalStack({ payload }) {
  if (!payload) {
    return (
      <div style={{ padding: 20, color: CK.muted, fontFamily: mono, fontSize: 12 }}>
        No options data.
      </div>
    );
  }

  const vc   = payload.vanna_charm   || {};
  const skew = payload.iv_skew       || {};
  const sk0  = payload.iv_skew_0dte;
  const ds   = payload.sauce?.dealer_scenarios || {};
  const ent  = payload.sauce?.market_entropy   || {};
  const rt   = payload.sauce?.retail_trap      || {};
  const ivd  = payload.iv_divergence || {};
  const pc   = payload.pc_ratio      || {};
  const em0  = payload.expected_move_0dte;
  const c0   = payload.charm_0dte;

  // v2 — pull real series from DC's signal_history (msg #115).
  // v4 — extended to all 9 wired signals (msg #123 + the pc_ratio that
  //      was already shipping). Entropy v2 history pending v2 cutover.
  const vannaSeries = extractSeries(vc.vanna_pct_history);
  const dsSeries    = extractSeries(ds.asymmetry_ratio_history);
  const skewSeries  = extractSeries(skew.skew_pct_history);
  const sk0Series   = extractSeries(sk0?.skew_pct_history);
  const ivdSeries   = extractSeries(ivd.divergence_history);
  const rtSeries    = extractSeries(rt.retail_crowding_score_history);
  const pcSeries    = extractSeries(pc.oi_ratio_history);
  const c0Series    = extractSeries(c0?.net_history);
  const em0Series   = extractSeries(em0?.straddle_history);

  // Header note about which rows are live vs flat.
  const liveCount =
      (vannaSeries ? 1 : 0) + (dsSeries  ? 1 : 0) + (skewSeries ? 1 : 0) +
      (sk0Series   ? 1 : 0) + (ivdSeries ? 1 : 0) + (rtSeries   ? 1 : 0) +
      (pcSeries    ? 1 : 0) + (c0Series  ? 1 : 0) + (em0Series  ? 1 : 0);

  const rows = [
    {
      name: "Vanna Pressure",
      sub: "bs_greeks OI-weighted · vanna_pct cutoffs ±5/±25 (provisional)",
      now: typeof vc.combined_pressure === "number" ? vc.combined_pressure.toFixed(2) : "—",
      verdict: vc.verdict ? vc.verdict.replace(/_/g, " ") : "—",
      tone: "buy",
      series: vannaSeries || FLAT8,
      isLive: !!vannaSeries,
      calibrating: { tooltip: "Calibrating — vanna_pct cutoffs ±5/±25 are PROVISIONAL until DC re-fits against ~30 days of ThetaData history (msg #84). Verdict classification (STRONG_VANNA_BUY / VANNA_BUY / VANNA_BALANCED / VANNA_SELL / STRONG_VANNA_SELL) may shift." },
    },
    {
      name: "IV Skew (front non-0DTE)",
      sub: `put25 − call25 · ${skew.expiry_class || "—"}${typeof skew.expiry_dte === "number" ? ` · ${skew.expiry_dte}DTE` : ""}`,
      now: typeof skew.skew === "number" ? skew.skew.toFixed(4) : "—",
      verdict: typeof skew.skew_pct === "number" ? `skew ${skew.skew_pct.toFixed(1)}%` : "—",
      tone: skew.skew < 0 ? "buy" : skew.skew > 0.02 ? "sell" : "neutral",
      series: skewSeries || FLAT8,
      isLive: !!skewSeries,
    },
    {
      name: "IV Skew 0DTE",
      sub: sk0 ? "today only · ±0.5% near-ATM wings · velocity not yet computed" : "no 0DTE expiry",
      now: sk0 && typeof sk0.skew === "number" ? sk0.skew.toFixed(4) : "—",
      verdict: sk0 ? "shipped · experimental" : "—",
      tone: sk0 && sk0.skew < 0 ? "buy" : sk0 && sk0.skew > 0.01 ? "sell" : "neutral",
      series: sk0Series || FLAT8,
      isLive: !!sk0Series,
    },
    {
      name: "Dealer Scenarios",
      sub: "asymmetry_ratio · spring_direction · cuts 1.3 / 0.7",
      now: typeof ds.asymmetry_ratio === "number" ? ds.asymmetry_ratio.toFixed(2) : "—",
      verdict: ds.spring_direction ? `SPRING ${ds.spring_direction}` : "—",
      tone: ds.spring_direction === "UPSIDE" ? "buy" : ds.spring_direction === "DOWNSIDE" ? "sell" : "neutral",
      series: dsSeries || FLAT8,
      isLive: !!dsSeries,
    },
    (() => {
      // v3: read entropy v2 canary (DC msg #117) — intraday is primary,
      // v1 shown in sub-text for side-by-side comparison during canary.
      const v2 = ent.intraday;
      const useV2 = v2 !== undefined;
      const v2State = v2?.state;
      const v2Score = typeof v2?.score === "number" ? v2.score : null;
      const isUnknown = useV2 && (v2State === "UNKNOWN" || v2Score == null);
      // Tone palette: ORDERED=buy, MODERATE=neutral, CHAOTIC=warn, UNKNOWN=neutral.
      const v2Tone =
            v2State === "ORDERED"  ? "buy"
          : v2State === "CHAOTIC"  ? "warn"
          :                          "neutral";
      const v1Suffix = (ent.entropy != null && ent.state)
        ? ` · v1 legacy: ${ent.entropy.toFixed(2)} ${ent.state}`
        : "";
      return {
        name: "Market Entropy",
        sub: useV2
          ? `v2-hybrid (price-action + options-flow) · acceptance: calm tape MUST read ORDERED${v1Suffix}`
          : "v2 canary not present — falling back to v1 (calm-tape bug expected)",
        now: useV2
          ? (isUnknown ? "—" : v2Score?.toFixed(2))
          : (typeof ent.entropy === "number" ? ent.entropy.toFixed(2) : "—"),
        verdict: useV2 ? (v2State || "—") : (ent.state || "—"),
        tone: useV2 ? v2Tone
            : ent.state === "ORDERED" ? "buy" : ent.state === "CHAOTIC" ? "warn" : "neutral",
        series: FLAT8,
        isLive: false,
        calibrating: { tooltip: "Calibrating — entropy v2 in CANARY (validated against ~30 hand-labels at 77.8% accuracy). Live-validation period: compare v2 vs v1 across calm range / news / chop conditions. Cutover to v2-only once validation is complete." },
      };
    })(),
    {
      name: "Retail Trap",
      sub: "status + crowding direction · CONTRARIAN",
      now: typeof rt.retail_crowding_score === "number" ? rt.retail_crowding_score.toFixed(2) : "—",
      verdict: rt.status === "TRAP_ACTIVE" ? `TRAP_ACTIVE · ${rt.retail_positioning || ""}` : (rt.status || "—"),
      tone: rt.status === "TRAP_ACTIVE" ? "warn" : "neutral",
      series: rtSeries || FLAT8,
      isLive: !!rtSeries,
    },
    {
      name: "IV vs Realized",
      sub: "iv_atm − rv30 close-close · ±0.02 / ±0.05 cuts",
      now: typeof ivd.divergence === "number" ? ivd.divergence.toFixed(3) : "—",
      verdict: ivd.signal || "—",
      tone: (ivd.signal || "").includes("CHEAP") || (ivd.signal || "").includes("BREAKOUT") ? "buy"
          : (ivd.signal || "").includes("RICH")  || (ivd.signal || "").includes("FADE")     ? "sell" : "neutral",
      series: ivdSeries || FLAT8,
      isLive: !!ivdSeries,
    },
    {
      name: "P/C OI Ratio",
      sub: "cumulative · cross-check vs Retail Trap",
      now: typeof pc.oi_ratio === "number" ? pc.oi_ratio.toFixed(2) : "—",
      verdict: pc.oi_sentiment || "—",
      tone: "neutral",
      series: pcSeries || FLAT8,
      isLive: !!pcSeries,
    },
    {
      name: "0-DTE Pin Pressure",
      sub: c0 ? "today only · charm_0dte (provisional buckets)" : "no 0DTE expiry",
      now: c0 && typeof c0.net === "number" ? c0.net.toExponential(1) : "—",
      verdict: c0 ? `${c0.magnitude_bucket} · ${c0.direction}` : "—",
      tone: c0 && c0.direction === "BUY" ? "buy" : c0 && c0.direction === "SELL" ? "sell" : "neutral",
      series: c0Series || FLAT8,
      isLive: !!c0Series,
    },
    {
      name: "Expected Move (0DTE)",
      sub: em0 ? "today's straddle · range boundary" : "no 0DTE expiry",
      now: em0 && typeof em0.straddle === "number" ? `±${em0.straddle.toFixed(1)}` : "—",
      verdict: em0 && typeof em0.move_up === "number" ? `${em0.move_down?.toFixed(0)} – ${em0.move_up?.toFixed(0)}` : "—",
      tone: "neutral",
      series: em0Series || FLAT8,
      isLive: !!em0Series,
    },
  ];

  return (
    <div style={{
      background: CK.bgCard, border: `1px solid ${CK.border}`,
      borderRadius: 8, overflow: "hidden", fontFamily: mono,
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CK.border}`,
        fontSize: 11, color: CK.muted, letterSpacing: "0.8px",
        textTransform: "uppercase", display: "flex", justifyContent: "space-between",
      }}>
        <span>Signal Stack · session trajectory</span>
        <span style={{ color: CK.dim, fontSize: 10 }}>
          {liveCount > 0
            ? `${liveCount} live · ${rows.length - liveCount} flat (entropy v2 pending cutover)`
            : `sparklines flat — DC signal_history populating`}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ fontSize: 10, color: CK.dim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, borderBottom: `1px solid ${CK.border}` }}>Signal</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, borderBottom: `1px solid ${CK.border}`, width: 90 }}>Now</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, borderBottom: `1px solid ${CK.border}`, width: 220 }}>Verdict</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, borderBottom: `1px solid ${CK.border}`, width: 140 }}>Trajectory</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const dim = r.experimental ? 0.6 : 1.0;
            return (
              <tr key={i} style={{ fontSize: 12, borderBottom: "1px solid #131a24", opacity: dim }}>
                <td style={{ padding: "9px 12px", fontWeight: 600, color: CK.text }}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {r.name}
                    {r.experimental && (
                      <span style={{
                        fontSize: 9, color: CK.warn, fontStyle: "italic",
                        letterSpacing: "0.4px",
                      }}>· EXPERIMENTAL</span>
                    )}
                    {r.calibrating && <CalibratingBadge tooltip={r.calibrating.tooltip} />}
                  </span>
                  <div style={{ fontSize: 10, color: CK.muted, fontWeight: 400, marginTop: 2 }}>{r.sub}</div>
                </td>
                <td style={{ padding: "9px 12px", fontFamily: mono, color: CK.text }}>{r.now}</td>
                <td style={{ padding: "9px 12px" }}><VerdictTag>{r.verdict}</VerdictTag></td>
                <td style={{ padding: "9px 12px" }}>
                  <Sparkline series={r.series} color={flatColor(r.tone)} />
                  {r.isLive && (
                    <span style={{
                      fontSize: 8, color: CK.buy, marginLeft: 4,
                      letterSpacing: "0.4px", verticalAlign: "middle",
                    }}>● LIVE</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
