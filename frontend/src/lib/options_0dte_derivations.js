// version: v2
// v2 — Strike-space conversion fix. DC's cookbook (msg #119) silently
//      assumed gex_0dte.aggregate.strikes and spot were in the same
//      space, but `gex_0dte.aggregate.strikes` is in chain-native /
//      ETF space (e.g. GLD strikes 180-800 for XAUUSD), while spot
//      arrives in broker space (e.g. XAUUSD broker 4563). Producer's
//      compute_structural_integrity does the same internal logic but
//      multiplies by cfd_ratio when packaging output. Fix: take
//      cfd_ratio_used as a parameter and convert chain strikes to
//      broker space ONCE at the top of each function so all internal
//      math runs in broker space and output strikes naturally land in
//      broker space.
//
//      Visible symptom that drove this fix: MainChart 0-DTE structural
//      lines on US500 were ~0.7% off (small but visible); on XAUUSD /
//      XAGUSD / XTIUSD they'd have been off by the cfd_ratio multiple
//      (10× or more) — completely invisible on chart.
//
//      Note `dealer_heatmap_0dte.strikes` IS pre-multiplied (broker
//      space, per DC's strike-multiplication contract). The linear
//      interpolation now works between broker-space x-grids on both
//      sides → no extra conversion needed there.
// version: v1
// options_0dte_derivations.js — consumer-side derivation of the 0-DTE
// structural_integrity + volatility_gravity composites from raw 0-DTE
// payload fields (gex_0dte + dealer_heatmap_0dte). Per DC msg #119
// (sauce-revision-2026-05-13 thread, 2026-05-15): the producer ships
// these two as deliberately-derived rather than packaged because the
// underlying gex_0dte.strikes[] + .net_gex[] arrays are already in the
// payload, and re-shipping classified composites would just duplicate
// the same data with a second surface that can drift.
//
// SOURCE OF TRUTH: the data producer's options_engine.py (not part of this repository)
//   compute_structural_integrity → :908+
//   compute_volatility_gravity   → :1086+
//
// CONTRACT NOTES:
//   - TIERS table cutoffs (0.60 / 0.30 / 0.10 / 0.0 / -0.15 / -0.50) MUST
//     match producer. Update both sides in lockstep.
//   - Window normalization: gex_norm is computed against the WINDOWED
//     absMax, NOT the full chain — so consumer-derived values match
//     producer-derived (which uses the same window). Don't use the
//     full chain absMax here.
//   - Window width is 21 strikes for structural, 18 for volatility.
//     Asymmetry is intentional per producer.
//   - High-clamp readjust (`lo = max(0, hi - nLevels)`) preserves window
//     width when spot sits near the right edge of the chain.
//
// SANITY CHECK: run deriveStructuralIntegrity0dte against the SWING
// gex_stack.aggregate (instead of gex_0dte.aggregate) and compare to
// producer's data.sauce.structural_integrity.levels[]. They should
// match byte-for-byte (modulo float rounding).

// ══ Math helpers ═══════════════════════════════════════════════════════════

export function round(v, decimals) {
  if (v == null || !Number.isFinite(v)) return v;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function argmin(arr) {
  if (!arr || arr.length === 0) return -1;
  let bestIdx = 0;
  let bestVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < bestVal) {
      bestVal = arr[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Linear interpolation matching numpy.interp(x, xs, ys, left=L, right=R).
// xs MUST be sorted ascending. Returns leftDefault when x < xs[0],
// rightDefault when x > xs[-1].
export function linearInterp(x, xs, ys, leftDefault = 0, rightDefault = 0) {
  const n = xs.length;
  if (n === 0) return leftDefault;
  if (x <= xs[0])     return n === ys.length ? (x === xs[0] ? ys[0] : leftDefault) : leftDefault;
  if (x >= xs[n - 1]) return x === xs[n - 1] ? ys[n - 1] : rightDefault;
  // Linear scan to find bracketing pair (xs is short — typically <600 elements).
  let i = 0;
  while (i < n - 1 && xs[i + 1] < x) i++;
  const x0 = xs[i],     x1 = xs[i + 1];
  const y0 = ys[i],     y1 = ys[i + 1];
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

// numpy.gradient(arr) for 1D, default spacing=1.
// Interior: central diff (arr[i+1] - arr[i-1]) / 2
// Endpoints: forward diff at start, backward diff at end.
export function numpyGradient1D(arr) {
  const n = arr.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const out = new Array(n);
  out[0]     = arr[1]     - arr[0];
  out[n - 1] = arr[n - 1] - arr[n - 2];
  for (let i = 1; i < n - 1; i++) {
    out[i] = (arr[i + 1] - arr[i - 1]) / 2;
  }
  return out;
}

// ══ STRUCTURAL_INTEGRITY_TIERS (Source of truth: options_engine.py:908) ════
//
// MUST stay in sync with producer's compute_structural_integrity TIERS.
// Order matters — first matching `min <= gex_norm < max` wins. The last
// tier (Free Fall) catches gex_norm < -0.50 via `min: -Infinity`.

export const STRUCTURAL_INTEGRITY_TIERS = [
  { min:  0.60,      max:  Infinity, label: "Reinforced Concrete", icon: "🏗️", friction: "Maximum"   },
  { min:  0.30,      max:  0.60,     label: "Steel Beam",          icon: "🔩",  friction: "Strong"    },
  { min:  0.10,      max:  0.30,     label: "Reinforced",          icon: "🧱",  friction: "Moderate"  },
  { min:  0.00,      max:  0.10,     label: "Plywood",             icon: "🪵",  friction: "Light"     },
  { min: -0.15,      max:  0.00,     label: "Thin Ice",            icon: "🧊",  friction: "None"      },
  { min: -0.50,      max: -0.15,     label: "Glass Floor",         icon: "💎",  friction: "Amplified" },
  { min: -Infinity,  max: -0.50,     label: "Free Fall",           icon: "🕳️", friction: "Extreme ↓" },
];

function tierFor(gexNorm) {
  for (const t of STRUCTURAL_INTEGRITY_TIERS) {
    if (gexNorm >= t.min && gexNorm < t.max) return t;
  }
  return STRUCTURAL_INTEGRITY_TIERS[STRUCTURAL_INTEGRITY_TIERS.length - 1];
}

// ══ deriveStructuralIntegrity0dte ══════════════════════════════════════════
//
// Inputs:
//   gex0dte = data.gex_0dte (or null)
//   spot    = data.spot  (broker-space, in the v2.4+ "broker" levels_space)
//   nLevels = window width (default 21, matches producer)
//
// Output: { spot, levels: [{ strike, gex, gex_norm, hardness, icon,
//   friction, is_spot, color }, ...] }
// Returns { spot, levels: [] } on missing/malformed input.

export function deriveStructuralIntegrity0dte(gex0dte, spot, cfdRatio = 1.0, nLevels = 21) {
  const agg = gex0dte?.aggregate;
  if (!agg?.strikes?.length || !agg?.net_gex?.length || agg.strikes.length !== agg.net_gex.length) {
    return { spot, levels: [] };
  }

  // v2: convert chain strikes → broker space once, up front. After this,
  // `strikes`, `spot`, `spacing`, and the spotIdx all live in broker space.
  const ratio   = (typeof cfdRatio === "number" && Number.isFinite(cfdRatio) && cfdRatio > 0) ? cfdRatio : 1.0;
  const strikes = agg.strikes.map(s => s * ratio);
  const netGex  = agg.net_gex;  // GEX values not multiplied — DC's contract

  // Median strike spacing for the is_spot test.
  const diffs = strikes.slice(1).map((s, i) => s - strikes[i]);
  const spacing = diffs.length ? median(diffs) : 1.0;

  // Window = ±nLevels/2 around spot, with high-clamp readjust.
  const spotIdx = argmin(strikes.map(s => Math.abs(s - spot)));
  const half    = Math.floor(nLevels / 2);
  let lo        = Math.max(0, spotIdx - half);
  let hi        = Math.min(strikes.length, lo + nLevels);
  lo            = Math.max(0, hi - nLevels);

  const selStrikes = strikes.slice(lo, hi);
  const selGex     = netGex.slice(lo, hi);

  // CRITICAL: normalize against the WINDOW abs_max, NOT the full chain.
  const absMax = Math.max(1e-6, ...selGex.map(Math.abs));

  return {
    spot: round(spot, 2),
    levels: selStrikes.map((strike, i) => {
      const gexVal  = selGex[i];
      const gexNorm = gexVal / absMax;
      const tier    = tierFor(gexNorm);
      return {
        strike:   round(strike, 2),
        gex:      round(gexVal, 2),
        gex_norm: round(gexNorm, 3),
        hardness: tier.label,
        icon:     tier.icon,
        friction: tier.friction,
        is_spot:  Math.abs(strike - spot) < spacing * 0.6,
        color:
          gexNorm >  0.10 ? "#00c853" :
          gexNorm > -0.15 ? "#ffab00" :
                            "#f44336",
      };
    }),
  };
}

// ══ deriveVolatilityGravity0dte ════════════════════════════════════════════
//
// Inputs:
//   gex0dte           = data.gex_0dte
//   dealerHeatmap0dte = data.dealer_heatmap_0dte (NEW in 2.4.1)
//   spot
//   nLevels           = window width (default 18 — NOT 21, asymmetry is intentional)
//
// Output: { levels: [{ strike, gex, gex_norm, dealer_delta, type, label,
//   icon, color, desc, strength }, ...] }

export function deriveVolatilityGravity0dte(gex0dte, dealerHeatmap0dte, spot, cfdRatio = 1.0, nLevels = 18) {
  const agg = gex0dte?.aggregate;
  if (!agg?.strikes?.length || agg.strikes.length < 3 || !agg?.net_gex?.length) {
    return { spot, levels: [] };
  }

  // v2: same chain → broker conversion as deriveStructuralIntegrity0dte.
  // dealer_heatmap_0dte.strikes is ALREADY in broker space (per DC's
  // contract — dealer_heatmap.strikes IS multiplied), so the linear
  // interpolation below operates on a broker-space x-grid on both sides.
  const ratio      = (typeof cfdRatio === "number" && Number.isFinite(cfdRatio) && cfdRatio > 0) ? cfdRatio : 1.0;
  const gexStrikes = agg.strikes.map(s => s * ratio);
  const gexNet     = agg.net_gex;
  if (gexStrikes.length !== gexNet.length) return { spot, levels: [] };

  // Same window pattern as structural — but nLevels=18 (NOT 21).
  const spotIdx = argmin(gexStrikes.map(s => Math.abs(s - spot)));
  const half    = Math.floor(nLevels / 2);
  let lo        = Math.max(0, spotIdx - half);
  let hi        = Math.min(gexStrikes.length, lo + nLevels);
  lo            = Math.max(0, hi - nLevels);

  const selStrikes = gexStrikes.slice(lo, hi);
  const selGex     = gexNet.slice(lo, hi);
  const absMax     = Math.max(1e-6, ...selGex.map(Math.abs));

  // Linear-interp dealer_delta from dealer_heatmap_0dte onto our windowed
  // strikes (the heatmap's strike grid may differ from gex's).
  const ddStrikes = dealerHeatmap0dte?.strikes ?? [];
  const ddVals    = dealerHeatmap0dte?.dealer_delta ?? [];
  const haveDD    = ddStrikes.length > 1 && ddVals.length === ddStrikes.length;
  const selDD     = haveDD
    ? selStrikes.map(s => linearInterp(s, ddStrikes, ddVals, 0, 0))
    : new Array(selStrikes.length).fill(0);

  // Discrete gradient (numpy.gradient equivalent, 1D, spacing=1).
  const ddGrad = numpyGradient1D(selDD);

  return {
    spot: round(spot, 2),
    levels: selStrikes.map((strike, i) => {
      const gexNorm = selGex[i] / absMax;
      const ddLocal = selDD[i];
      const grad    = ddGrad[i];

      let levelType, label, icon, color, desc;
      // Magnet: strong positive gex AND non-trivial dealer_delta locally.
      if (gexNorm > 0.15 && Math.abs(ddLocal) > absMax * 0.10) {
        levelType = "magnet"; label = "MAGNET"; icon = "🧲"; color = "#00d4ff";
        desc = "Dealers absorb moves here — expect chop and mean-reversion";
      // Strong-spring: deeply negative gex.
      } else if (gexNorm < -0.15) {
        levelType = "spring"; label = "SPRING"; icon = "🚀";
        color = ddLocal < 0 ? "#00c853" : "#f44336";
        desc = ddLocal < 0
          ? "Dealers amplify moves — expect violent bounce up"
          : "Dealers amplify moves — expect breakdown";
      // Sign-flip-spring: sharp dealer-delta gradient.
      } else if (Math.abs(grad) > absMax * 0.30) {
        levelType = "spring"; label = "SPRING"; icon = "🚀"; color = "#f44336";
        desc = "Dealer-delta sign flip — expect violent move";
      // Default: weak magnet.
      } else {
        levelType = "magnet"; label = "MAGNET"; icon = "🧲"; color = "#00d4ff";
        desc = "Mild absorption — minor pinning";
      }

      return {
        strike:       round(strike, 2),
        gex:          round(selGex[i], 2),
        gex_norm:     round(gexNorm, 3),
        dealer_delta: round(ddLocal, 2),
        type:         levelType,
        label, icon, color, desc,
        strength:     Math.min(100, Math.floor(Math.abs(gexNorm) * 100)),
      };
    }),
  };
}
