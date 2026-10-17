// version: v3
// scoring.js — proximity formula + tier classification.
// Pure functions only. No DOM, no React. Imported by pulseStore
// and tested standalone via node.
//
// Math reference: docs/specs/2026-05-04-pulse-room-design.md §4

const TYPE_WEIGHT = { CO: 1.0, QB: 0.8 };
const HIGH_THRESHOLD = 75;
const MED_THRESHOLD = 40;

// Return the price on `element.curve` that corresponds to "now" in the
// snapshot's frame of reference. Curves are stored with t_min = minutes
// from computed_at (spec §3.1), so:
//   - if any point has t_min >= 0, take the first such point (the next
//     forward sample after now);
//   - otherwise (e.g. all bands timestamps are in the past), fall back to
//     the most recent past point.
// Returns null only if the curve is empty.
function priceAtNow(element) {
  if (!element.curve || element.curve.length === 0) return null;
  let bestPast = null;
  for (const p of element.curve) {
    if (p.t_min >= 0) return p.price;
    bestPast = p;
  }
  return bestPast ? bestPast.price : null;
}

export function elementProximity(element, currentPrice, cone1dSd, thresholdSd) {
  if (cone1dSd <= 0) return 0;
  const elemNow = priceAtNow(element);
  if (elemNow == null) return 0;
  const distAbs = Math.abs(currentPrice - elemNow);
  const distSd = distAbs / cone1dSd;
  return Math.max(0, 1 - distSd / thresholdSd);
}

export function tierOf(score) {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MED_THRESHOLD) return "med";
  return "low";
}

export function scoreAsset(assetSnapshot, currentPrice, thresholdSd = 0.5) {
  const cone1dSd = assetSnapshot.cone_1d_sd;
  let weightedSum = 0;
  let nActive = 0;
  const contributors = [];

  for (const el of assetSnapshot.elements) {
    const elemNow = priceAtNow(el);
    if (elemNow == null) continue;
    const prox = elementProximity(el, currentPrice, cone1dSd, thresholdSd);
    if (prox > 0) {
      nActive++;
      const weight = TYPE_WEIGHT[el.family] ?? 1.0;
      weightedSum += prox * weight;
      contributors.push({
        id: el.id,
        family: el.family,
        // Default missing origin to "current_week" so older snapshots and
        // test fixtures without the new field still render with a sensible
        // color. Backend now always emits it.
        origin: el.origin ?? "current_week",
        label: el.label,
        proximity: prox,
        side: elemNow > currentPrice ? "above" : "below",
        distPips: Math.abs(currentPrice - elemNow) / assetSnapshot.pip_size,
      });
    }
  }

  let convMult = 1.0;
  if (nActive >= 3) convMult = 1.3;
  else if (nActive === 2) convMult = 1.1;

  const score = Math.min(100, Math.round(100 * weightedSum * convMult));
  contributors.sort((a, b) => b.proximity - a.proximity);

  return { score, level: tierOf(score), contributors, nActive };
}
