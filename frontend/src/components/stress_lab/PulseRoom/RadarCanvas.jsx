// version: v4
// RadarCanvas.jsx — 154×154px canvas drawn per the Pulse Room visual spec.
// Layers 1..9: bg fill → rings → crosshair → sweep trail → sweep line →
//              outer ring → blip rings → object dots → object labels → center dot.
//
// Each card runs its own RAF for Phase 1 simplicity. If profiling shows
// pressure with many cards visible, switch to a single global RAF.
//
// Dot color is keyed off `contributor.origin` (cone time scope or "bands"),
// not by family. APEX text label is drawn above any dot whose id is in
// `apexIds` (computed by AssetCard from canvas-position overlap).
//
// v4 — rAF preservation. The rAF effect now runs once on mount instead of
//      cancelling and restarting on every contributor/tier/apexIds prop
//      change. Props flow through propsRef (synced via a tiny no-deps
//      effect). Fixes the per-second Pulse Room sonar stutter described in
//      docs/specs/2026-05-06-radarcanvas-raf-preservation-design.md.

import React, { useEffect, useRef } from "react";
import { colorFor } from "./originColors";

const W = 154, H = 154;
const CX = 77, CY = 77;
const R = Math.min(W, H) / 2 - 5;  // 72
const RING_INNER1 = R * 0.33;
const RING_INNER2 = R * 0.66;

const SPEED_BY_TIER = { high: 0.9, med: 0.65, low: 0.35 };

function hexToRgb(hex) {
  const m = (hex || "#888888").replace("#", "");
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

export default function RadarCanvas({ contributors, tier, apexIds }) {
  const ref = useRef(null);
  const stateRef = useRef({
    sweep: Math.random() * Math.PI * 2,
    blips: [],   // per-contributor decaying
    raf: null,
  });
  // v4: latest props mirrored here every render. The rAF tick reads from
  // propsRef instead of closure scope so the rAF loop never has to restart
  // on prop changes — fixes the per-second sonar stutter described in
  // docs/specs/2026-05-06-radarcanvas-raf-preservation-design.md.
  const propsRef = useRef({ contributors, tier, apexIds });

  useEffect(() => {
    // Reset blip array length to match contributor count
    const s = stateRef.current;
    s.blips = (contributors || []).map(() => 0);
  }, [contributors]);

  // v4: sync effect — write the latest props into propsRef on every render.
  // No cleanup, no rAF restart; just a ref write. Cheap.
  useEffect(() => {
    propsRef.current.contributors = contributors;
    propsRef.current.tier = tier;
    propsRef.current.apexIds = apexIds;
  });

  // v4: rAF effect — runs ONCE on mount. The tick reads from propsRef each
  // frame. Effect deps intentionally empty so the rAF loop is never torn
  // down on prop change.
  useEffect(() => {
    const cnv = ref.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    const s = stateRef.current;

    const tick = () => {
      const { contributors, tier, apexIds } = propsRef.current;
      const speed = SPEED_BY_TIER[tier] ?? 0.5;

      s.sweep = (s.sweep + 0.016 * speed) % (Math.PI * 2);

      // Update blip values
      for (let i = 0; i < (contributors || []).length; i++) {
        const c = contributors[i];
        const a = angleFor(c, i);
        let diff = Math.abs(s.sweep - a);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.10) s.blips[i] = 1.0;
        else s.blips[i] = Math.max(0, s.blips[i] - 0.025);
      }

      drawAll(ctx, contributors || [], s.sweep, s.blips, apexIds);
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return () => {
      if (stateRef.current.raf) cancelAnimationFrame(stateRef.current.raf);
    };
  }, []);

  return <canvas ref={ref} width={W} height={H} style={{ display: "block" }} />;
}

// ---- drawing ----

function drawAll(ctx, contribs, sweep, blips, apexIds) {
  ctx.clearRect(0, 0, W, H);

  // Layer 1: bg fill circle
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.fillStyle = "#030309";
  ctx.fill();

  // Layer 2: concentric rings (33%, 66%, 100%)
  for (const [ringR, alpha, w] of [[RING_INNER1, 0.06, 0.5], [RING_INNER2, 0.06, 0.5], [R, 0.20, 1.0]]) {
    ctx.beginPath();
    ctx.arc(CX, CY, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(232,184,75,${alpha})`;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  // Layer 3: crosshair lines (0°, 90°, 45°, 135°)
  ctx.strokeStyle = "rgba(232,184,75,0.05)";
  ctx.lineWidth = 0.5;
  for (const a of [0, Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4]) {
    ctx.beginPath();
    ctx.moveTo(CX - R * Math.cos(a), CY - R * Math.sin(a));
    ctx.lineTo(CX + R * Math.cos(a), CY + R * Math.sin(a));
    ctx.stroke();
  }

  // Layer 4: sweep trail (clipped to circle)
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.clip();
  const trail = Math.PI * 0.55;
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a1 = sweep - trail + trail * (i / steps);
    const a2 = sweep - trail + trail * ((i + 1) / steps);
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R, a1, a2);
    ctx.closePath();
    ctx.fillStyle = `rgba(232,184,75,${(t * t * 0.14).toFixed(3)})`;
    ctx.fill();
  }
  ctx.restore();

  // Layer 5: sweep line (clipped to circle implicitly — line stays within radius)
  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.lineTo(CX + R * Math.cos(sweep), CY + R * Math.sin(sweep));
  ctx.strokeStyle = "rgba(232,184,75,0.80)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Layer 6: outer border ring (drawn opaquely on top of trail)
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(232,184,75,0.20)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Layer 7+8: glowing dots, optional APEX label
  for (let i = 0; i < contribs.length; i++) {
    const c = contribs[i];
    const angle = angleFor(c, i);
    const dist = distFor(c);   // 0..1 (clamped)
    const ox = CX + dist * R * Math.cos(angle);
    const oy = CY + dist * R * Math.sin(angle);
    const blip = blips[i] || 0;
    const [rR, rG, rB] = hexToRgb(colorFor(c.origin));
    const opacity = 0.55 + blip * 0.45;

    // Blip rings — drawn first, behind glow
    if (blip > 0.05) {
      ctx.beginPath();
      ctx.arc(ox, oy, 4 + blip * 10, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rR},${rG},${rB},${(blip * 0.6).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox, oy, 8 + blip * 16, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rR},${rG},${rB},${(blip * 0.2).toFixed(3)})`;
      ctx.stroke();
    }

    // Glow halo (radial gradient from center → transparent edge)
    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, 11);
    grad.addColorStop(0, `rgba(${rR},${rG},${rB},${(opacity * 0.7).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rR},${rG},${rB},0)`);
    ctx.beginPath();
    ctx.arc(ox, oy, 11, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Bright core
    ctx.beginPath();
    ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rR},${rG},${rB},${Math.min(1, opacity + 0.2).toFixed(3)})`;
    ctx.fill();

    // APEX label (only for overlapping dots)
    if (apexIds && apexIds.has(c.id)) {
      ctx.font = "bold 6px monospace";
      ctx.fillStyle = "#FFD875";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("APEX", ox, oy - 12);
    }
  }

  // Layer 9: center dot + halo
  ctx.beginPath();
  ctx.arc(CX, CY, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CX, CY, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#FFF";
  ctx.fill();
}

// ---- positioning helpers ----

// Deterministic per-element jitter so multiple "above" or "below" elements
// don't stack exactly at 12 or 6 o'clock. Hash from id.
function jitterFromId(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  // Map to ±0.4 rad
  return ((h % 1000) / 1000 - 0.5) * 0.8;
}

function angleFor(contrib, idx) {
  // Canvas: -π/2 = top (12 o'clock), +π/2 = bottom (6 o'clock).
  const base = contrib.side === "above" ? -Math.PI / 2 : Math.PI / 2;
  return base + jitterFromId(contrib.id || `idx${idx}`);
}

function distFor(contrib) {
  // Map proximity (1 = at price) to dist (0 = at center).
  // Inverse: dist = 1 - proximity, clamped to [0, 1].
  const p = Math.max(0, Math.min(1, contrib.proximity ?? 0));
  return 1 - p;
}
