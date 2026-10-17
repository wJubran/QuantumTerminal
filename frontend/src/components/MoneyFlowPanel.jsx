// version: v2
/**
 * MoneyFlowPanel.jsx — Multi-Tab Money Flow Dashboard
 * Quantum Terminal
 *
 * Three sub-tabs:
 *   1. CAPITAL FLOWS — existing MoneyFlowMap (animated inter-sector capital flow map)
 *   2. SECTORS       — circle bubble view of sector ETF performance (US SPDR sectors)
 *   3. GLOBAL        — real world map with country shapes colored by ETF performance
 *
 * Dependencies: d3, topojson-client (npm install topojson-client)
 * Map data: Natural Earth 110m countries from CDN (fetched once, cached)
 *
 * v2 — SectorBubbles fit-to-view fix. d3.packSiblings packs bubbles relative
 *      to (0,0) without any bounding-box constraint, so the resulting cluster
 *      can be wider or taller than the SVG. Translating by +cx/+cy then puts
 *      edge bubbles half outside the view. Now the cluster's bounding box is
 *      measured after packing and a uniform scale-to-fit is applied so the
 *      whole pack always sits inside the SVG with a small padding margin.
 *      Bubbles still preserve relative size; they're just collectively
 *      shrunk if the natural pack overflows.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import MoneyFlowMap from "./MoneyFlowMap";

// ── Theme (matches analytical_terminal.jsx) ──
const C = {
  bg: "#000000", bgPanel: "#0a0a0a", bgCard: "#111111", bgHover: "#1a1a1a",
  border: "#222222", borderLt: "#333333",
  white: "#ffffff", gray: "#999999", muted: "#444444",
  orange: "#ff6d00", orangeDim: "#cc5500",
  green: "#2ebd59", red: "#e8383b",
  blue: "#3796ff", cyan: "#00d2d3", purple: "#9b59b6",
  amber: "#ffa500", yellow: "#f1c40f",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const API = "";  // relative — same origin in production, proxied in dev

// ════════════════════════════════════════════════════════
// SUB-TAB NAVIGATION
// ════════════════════════════════════════════════════════
const SUB_TABS = [
  { id: "flows",   label: "CAPITAL FLOWS" },
  { id: "sectors", label: "SECTORS" },
  { id: "global",  label: "GLOBAL" },
];

// ════════════════════════════════════════════════════════
// TOP / BOTTOM LEADERBOARD (shared across tabs 2 & 3)
// ════════════════════════════════════════════════════════
function Leaderboard({ top5, bottom5, periodLabel }) {
  const renderRow = (item, idx) => {
    const val = periodLabel === "1W" ? item.chg_1w : item.chg_4w;
    const col = val >= 0 ? C.green : C.red;
    const arrow = val >= 0 ? "▲" : "▼";
    return (
      <div key={idx} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "5px 12px", borderBottom: `1px solid ${C.border}`,
        background: idx % 2 === 0 ? C.bgCard : "transparent",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: mono, width: 16 }}>
            {idx + 1}.
          </span>
          <span style={{ fontSize: 11, color: C.white, fontFamily: mono, fontWeight: 600 }}>
            {item.name || item.ticker}
          </span>
          {item.code && (
            <span style={{ fontSize: 9, color: C.gray, fontFamily: mono }}>
              {item.code}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: col, fontFamily: mono, fontWeight: 700 }}>
          {arrow} {Math.abs(val).toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
      padding: "16px 24px",
    }}>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: C.green, fontFamily: mono,
          letterSpacing: "1.5px", padding: "8px 12px",
          borderBottom: `2px solid ${C.green}44`, marginBottom: 2,
        }}>
          ▲ TOP 5 — {periodLabel}
        </div>
        {top5.map((item, i) => renderRow(item, i))}
      </div>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: C.red, fontFamily: mono,
          letterSpacing: "1.5px", padding: "8px 12px",
          borderBottom: `2px solid ${C.red}44`, marginBottom: 2,
        }}>
          ▼ BOTTOM 5 — {periodLabel}
        </div>
        {bottom5.map((item, i) => renderRow(item, i))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PERIOD TOGGLE (1W / 4W)
// ════════════════════════════════════════════════════════
function PeriodToggle({ period, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: C.bgCard, borderRadius: 3, padding: 2 }}>
      {["1W", "4W"].map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          background: period === p ? `${C.orange}22` : "transparent",
          border: period === p ? `1px solid ${C.orange}` : `1px solid transparent`,
          color: period === p ? C.orange : C.muted,
          fontSize: 9, fontWeight: 700, fontFamily: mono,
          padding: "3px 10px", cursor: "pointer", letterSpacing: "1px",
        }}>
          {p}
        </button>
      ))}
    </div>
  );
}


// ════════════════════════════════════════════════════════
// TAB 2 — SECTORS (Circle Bubbles)
// ════════════════════════════════════════════════════════
function SectorBubbles({ data, period }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 420 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDimensions({ w: Math.max(600, width), h: 420 });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const sectors = data?.sectors || [];
  const key = period === "1W" ? "chg_1w" : "chg_4w";

  const bubbles = useMemo(() => {
    if (!sectors.length) return [];
    const maxAbs = Math.max(...sectors.map(s => Math.abs(s[key])), 0.01);
    const minR = 42, maxR = 72;

    const nodes = sectors.map(s => {
      const absVal = Math.abs(s[key]);
      const r = minR + (absVal / maxAbs) * (maxR - minR);
      return { ...s, r, val: s[key] };
    });

    // pack with a small +4 inflation so the rendered ring (border + hover halo)
    // doesn't kiss neighbouring bubbles. The +4 is added back to the inflated
    // radius for layout, then peeled off when rendering.
    const packed = d3.packSiblings(nodes.map(n => ({ ...n, r: n.r + 4 })));

    // v2: scale-to-fit. d3.packSiblings doesn't constrain to a box — the
    //   resulting cluster can extend beyond the SVG. Without scaling, edge
    //   bubbles render half-outside (orig bug: "half of them are outside
    //   view boundaries"). Measure the cluster's bbox using the inflated
    //   radii (so we leave room for the hover halo too), then scale uniformly
    //   to fit dimensions.w × dimensions.h with `padding` px of margin.
    const padding = 16;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of packed) {
      if (p.x - p.r < minX) minX = p.x - p.r;
      if (p.x + p.r > maxX) maxX = p.x + p.r;
      if (p.y - p.r < minY) minY = p.y - p.r;
      if (p.y + p.r > maxY) maxY = p.y + p.r;
    }
    const packW = maxX - minX;
    const packH = maxY - minY;
    const availW = Math.max(1, dimensions.w - 2 * padding);
    const availH = Math.max(1, dimensions.h - 2 * padding);
    // Only ever shrink — never blow bubbles up beyond their designed radii.
    const scale = Math.min(1, availW / packW, availH / packH);

    const packCx = (minX + maxX) / 2;
    const packCy = (minY + maxY) / 2;
    const cx = dimensions.w / 2;
    const cy = dimensions.h / 2;

    return packed.map((p, i) => ({
      ...nodes[i],
      x: (p.x - packCx) * scale + cx,
      y: (p.y - packCy) * scale + cy,
      r: nodes[i].r * scale,
    }));
  }, [sectors, key, dimensions]);

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg width={dimensions.w} height={dimensions.h} style={{ display: "block", margin: "0 auto" }}>
        {bubbles.map((b) => {
          const isPos = b.val >= 0;
          const col = isPos ? C.green : C.red;
          const bgCol = isPos ? `${C.green}18` : `${C.red}18`;
          const borderCol = isPos ? `${C.green}55` : `${C.red}55`;

          return (
            <g key={b.ticker} style={{ cursor: "default" }}>
              <circle cx={b.x} cy={b.y} r={b.r + 2}
                fill="none" stroke={borderCol} strokeWidth={1.5} opacity={0.5}
              />
              <circle cx={b.x} cy={b.y} r={b.r}
                fill={bgCol} stroke={borderCol} strokeWidth={1}
              />
              <text x={b.x} y={b.y - 8}
                textAnchor="middle" fill={C.white}
                fontSize={b.r > 55 ? 10 : 9} fontWeight={700} fontFamily={mono}
                style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}
              >
                {b.name.length > 14 ? b.name.slice(0, 12) + "…" : b.name}
              </text>
              <text x={b.x} y={b.y + 5}
                textAnchor="middle" fill={C.muted}
                fontSize={8} fontFamily={mono}
              >
                {b.ticker}
              </text>
              <text x={b.x} y={b.y + 20}
                textAnchor="middle" fill={col}
                fontSize={13} fontWeight={800} fontFamily={mono}
              >
                {b.val >= 0 ? "+" : ""}{b.val.toFixed(2)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}


// ════════════════════════════════════════════════════════
// HELP GUIDE — Interactive globe icon with expandable guide
// ════════════════════════════════════════════════════════
function HelpGuide() {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <>
      {/* Globe icon button */}
      <div
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "absolute", top: -22, left: 20,
          width: 28, height: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 15,
          borderRadius: "50%",
          background: open ? `${C.orange}22` : `${C.bgCard}cc`,
          border: `1px solid ${open ? C.orange : hovered ? C.gray : C.border}`,
          transition: "all 0.2s",
          filter: hovered && !open ? `drop-shadow(0 0 6px ${C.orange}66)` : "none",
        }}
        title="How to read this map"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={open ? C.orange : hovered ? C.white : C.gray} strokeWidth={1.8}>
          {/* Globe */}
          <circle cx={12} cy={12} r={10} />
          <ellipse cx={12} cy={12} rx={4.5} ry={10} />
          <line x1={2} y1={12} x2={22} y2={12} />
          <path d="M4 7h16M4 17h16" strokeWidth={1} opacity={0.5} />
          {/* Question mark overlay */}
          <text x={12} y={16} textAnchor="middle" fill={open ? C.orange : hovered ? C.white : C.gray}
            fontSize={10} fontWeight={900} fontFamily={mono} stroke="none">?</text>
        </svg>
      </div>

      {/* Expandable guide panel */}
      {open && (
        <div style={{
          position: "absolute", top: 12, left: 20,
          width: 340,
          background: `${C.bgCard}f8`,
          border: `1px solid ${C.orange}44`,
          borderRadius: 6,
          padding: "14px 16px",
          zIndex: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          maxHeight: "80%",
          overflowY: "auto",
        }}>
          {/* Close button */}
          <div onClick={() => setOpen(false)}
            style={{
              position: "absolute", top: 8, right: 10,
              cursor: "pointer", color: C.muted, fontSize: 12, fontFamily: mono,
            }}>✕</div>

          <div style={{ fontSize: 11, color: C.orange, fontFamily: mono, fontWeight: 800, marginBottom: 10, letterSpacing: "1px" }}>
            HOW TO READ THIS MAP
          </div>

          {/* Section 1 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: C.white, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>
              WHAT AM I LOOKING AT?
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: "1.6" }}>
              Each country is colored by its stock market performance over the selected period (1 week or 4 weeks).{" "}
              <span style={{ color: C.green, fontWeight: 700 }}>Green</span> = market gaining,{" "}
              <span style={{ color: C.red, fontWeight: 700 }}>Red</span> = market declining.
              The brighter the color, the stronger the move. Hover any country for exact numbers.
            </div>
          </div>

          {/* Section 2 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: C.white, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>
              WHAT DO THE FLOW LINES MEAN?
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: "1.6" }}>
              Arcs represent capital rotation channels — real-world routes money travels between regions.
              Transatlantic (US↔Europe), transpacific (US↔Asia), developed↔emerging, and key bilateral pairs (US-China, US-Japan).
              Direction is determined by which side of the channel is outperforming.
              Hover any arc to see the channel name and magnitude.
            </div>
          </div>

          {/* Section 3 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: C.white, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>
              HOW TO USE IN TRADING
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: "1.6" }}>
              <span style={{ color: C.green }}>►</span>{" "}
              <span style={{ color: C.white, fontWeight: 600 }}>Confirm your bias</span> — planning to long EUR/USD?
              Check if Europe is green and US is red. If capital is flowing into Europe, your trade has macro wind behind it.
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: "1.6", marginTop: 4 }}>
              <span style={{ color: C.green }}>►</span>{" "}
              <span style={{ color: C.white, fontWeight: 600 }}>Spot risk regime</span> — if all emerging markets are green
              and safe havens (US, JP, CH) are red, global risk appetite is high. Favor risk-on positions.
              The opposite means defensive positioning.
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: "1.6", marginTop: 4 }}>
              <span style={{ color: C.green }}>►</span>{" "}
              <span style={{ color: C.white, fontWeight: 600 }}>Watch for divergences</span> — if one country is deep red
              while its neighbors are green, it could mean a country-specific problem (avoid) or a mean-reversion
              opportunity (potential long). Check the news before acting.
            </div>
            <div style={{ fontSize: 8, color: C.gray, fontFamily: mono, lineHeight: "1.6", marginTop: 4 }}>
              <span style={{ color: C.amber }}>►</span>{" "}
              <span style={{ color: C.white, fontWeight: 600 }}>Be cautious with yield-seeking flows</span> — amber
              arcs show money chasing high-yield emerging markets. These flows reverse fast on any risk event.
              Don't chase them late.
            </div>
          </div>

          {/* Section 4 */}
          <div style={{
            borderTop: `1px solid ${C.border}`,
            paddingTop: 8, marginTop: 4,
          }}>
            <div style={{ fontSize: 9, color: C.white, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>
              ⚠ ACCURACY
            </div>
            <div style={{ fontSize: 8, color: C.muted, fontFamily: mono, lineHeight: "1.6" }}>
              Flows are modeled using regional performance channels and central bank rate differentials —
              comparing ETF returns between country groups and adjusting confidence based on monetary policy
              direction (hiking, cutting, holding). This is a proxy, not settlement data. ±15-25% margin.
              Flows flagged "against carry" move opposite to rate incentives — treat with extra caution.
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ════════════════════════════════════════════════════════
// TAB 3 — GLOBAL MAP (Real world map with d3-geo)
// ════════════════════════════════════════════════════════

// ISO 3166-1 numeric → alpha-2 mapping for tracked countries
const ISO_NUM_TO_ALPHA = {
  "840": "US", "392": "JP", "156": "CN", "276": "DE", "826": "GB",
  "076": "BR", "036": "AU", "124": "CA", "410": "KR", "158": "TW",
  "356": "IN", "250": "FR", "380": "IT", "724": "ES", "484": "MX",
  "710": "ZA", "792": "TR", "682": "SA", "702": "SG", "344": "HK",
  "458": "MY", "528": "NL", "752": "SE", "756": "CH", "764": "TH",
};

// World map TopoJSON CDN URL (Natural Earth 110m — ~200KB)
const WORLD_TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Cache the fetched topology globally so we don't re-fetch on tab switches
let _cachedGeoFeatures = null;

function GlobalMap({ data, period }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [containerW, setContainerW] = useState(1000);
  const [geoFeatures, setGeoFeatures] = useState(_cachedGeoFeatures);
  const [mapLoading, setMapLoading] = useState(!_cachedGeoFeatures);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [flowData, setFlowData] = useState(null);
  const [hoveredFlow, setHoveredFlow] = useState(null);

  // Fetch implied flows
  useEffect(() => {
    fetch(`${API}/api/macro/flows?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFlowData(d); })
      .catch(() => {});
  }, [period]);

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setContainerW(Math.max(700, width - 40));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch world topology once
  useEffect(() => {
    if (_cachedGeoFeatures) {
      setGeoFeatures(_cachedGeoFeatures);
      setMapLoading(false);
      return;
    }
    fetch(WORLD_TOPO_URL)
      .then(r => r.json())
      .then(topo => {
        const countries = feature(topo, topo.objects.countries);
        _cachedGeoFeatures = countries.features;
        setGeoFeatures(countries.features);
        setMapLoading(false);
      })
      .catch(err => {
        console.error("Failed to load world map:", err);
        setMapLoading(false);
      });
  }, []);

  const countries = data?.countries || [];
  const key = period === "1W" ? "chg_1w" : "chg_4w";

  // Build lookup: alpha-2 code → country data
  const countryMap = useMemo(() => {
    const m = {};
    countries.forEach(c => { m[c.code] = c; });
    return m;
  }, [countries]);

  // D3 projection
  const svgH = containerW * 0.5;
  const projection = useMemo(() => {
    return d3.geoNaturalEarth1()
      .fitSize([containerW, svgH], { type: "Sphere" })
      .precision(0.1);
  }, [containerW, svgH]);

  const pathGen = useMemo(() => d3.geoPath(projection), [projection]);

  // Manual label offsets (dx, dy in pixels) for crowded regions
  // Prevents overlaps in Europe and East Asia
  const LABEL_OFFSETS = {
    // Europe — spread labels outward from the cluster
    GB: { dx: -45, dy: -10 },
    NL: { dx: 0,   dy: -30 },
    DE: { dx: 40,  dy: -18 },
    FR: { dx: -60, dy: 0 },
    CH: { dx: 0,   dy: 30 },
    SE: { dx: 15,  dy: -35 },
    IT: { dx: 40,  dy: 20 },
    ES: { dx: -40, dy: 35 },
    TR: { dx: 45,  dy: 10 },
    // East Asia — spread KR/JP right, offset small territories
    KR: { dx: 65,  dy: 20 },
    JP: { dx: 55,  dy: -15 },
    // Tiny territories — large offsets with leader lines
    HK: { dx: 40,  dy: 30 },
    SG: { dx: 35,  dy: 30 },
    TW: { dx: 45,  dy: 5 },
    MY: { dx: 30,  dy: -25 },
  };

  // Compute label positions (centroid + offset for crowded areas)
  const labelPositions = useMemo(() => {
    if (!geoFeatures) return {};
    const positions = {};
    geoFeatures.forEach(feat => {
      const numId = String(feat.id);
      const alpha2 = ISO_NUM_TO_ALPHA[numId];
      if (!alpha2) return;
      const centroid = pathGen.centroid(feat);
      if (centroid && !isNaN(centroid[0])) {
        const offset = LABEL_OFFSETS[alpha2] || { dx: 0, dy: 0 };
        positions[alpha2] = {
          cx: centroid[0],          // true centroid (for leader line start)
          cy: centroid[1],
          x: centroid[0] + offset.dx,  // label position (offset)
          y: centroid[1] + offset.dy,
          hasOffset: offset.dx !== 0 || offset.dy !== 0,
        };
      }
    });
    return positions;
  }, [geoFeatures, pathGen]);

  // Color scale: interpolate from red to green
  const getCountryFill = useCallback((alpha2) => {
    const c = countryMap[alpha2];
    if (!c) return `${C.muted}15`; // untracked: very dark
    const val = c[key];
    if (val >= 0) {
      const intensity = Math.min(val / 8, 1); // cap at 8% for full saturation
      return d3.interpolateRgb(`${C.green}20`, `${C.green}bb`)(intensity);
    } else {
      const intensity = Math.min(Math.abs(val) / 8, 1);
      return d3.interpolateRgb(`${C.red}20`, `${C.red}bb`)(intensity);
    }
  }, [countryMap, key]);

  const getCountryStroke = useCallback((alpha2) => {
    const c = countryMap[alpha2];
    if (!c) return `${C.muted}20`;
    const val = c[key];
    return val >= 0 ? `${C.green}66` : `${C.red}66`;
  }, [countryMap, key]);

  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  if (mapLoading) {
    return (
      <div style={{
        textAlign: "center", padding: 60, color: C.orange,
        fontSize: 10, fontFamily: mono, letterSpacing: "1px",
      }}>
        LOADING WORLD MAP...
      </div>
    );
  }

  if (!geoFeatures) {
    return (
      <div style={{
        textAlign: "center", padding: 40, color: C.red,
        fontSize: 10, fontFamily: mono,
      }}>
        Failed to load world map data
      </div>
    );
  }

  const hoveredData = hoveredCountry ? countryMap[hoveredCountry] : null;

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove}
      style={{ width: "100%", padding: "8px 20px", position: "relative" }}>
      <svg ref={svgRef} width={containerW} height={svgH}
        style={{ display: "block", margin: "0 auto", overflow: "visible" }}>

        {/* Sphere outline */}
        <path d={pathGen({ type: "Sphere" })}
          fill="none" stroke={C.border} strokeWidth={0.5} />

        {/* Graticule (lat/lon grid) */}
        <path d={pathGen(d3.geoGraticule10())}
          fill="none" stroke={C.border} strokeWidth={0.2} opacity={0.3} />

        {/* Country shapes */}
        {geoFeatures.map(feat => {
          const numId = String(feat.id);
          const alpha2 = ISO_NUM_TO_ALPHA[numId];
          const isTracked = !!alpha2 && !!countryMap[alpha2];
          const isHovered = hoveredCountry === alpha2;
          const d = pathGen(feat);
          if (!d) return null;

          return (
            <path key={feat.id} d={d}
              fill={isTracked ? getCountryFill(alpha2) : `${C.muted}08`}
              stroke={isTracked ? getCountryStroke(alpha2) : `${C.muted}18`}
              strokeWidth={isHovered ? 2 : isTracked ? 0.8 : 0.3}
              style={{
                cursor: isTracked ? "pointer" : "default",
                transition: "fill 0.2s, stroke-width 0.15s",
                filter: isHovered ? `drop-shadow(0 0 6px ${countryMap[alpha2]?.[key] >= 0 ? C.green : C.red}66)` : "none",
              }}
              onMouseEnter={() => { if (isTracked) setHoveredCountry(alpha2); }}
              onMouseLeave={() => setHoveredCountry(null)}
            />
          );
        })}

        {/* Labels on tracked countries */}
        {Object.entries(labelPositions).map(([alpha2, pos]) => {
          const c = countryMap[alpha2];
          if (!c || !pos) return null;
          const val = c[key];
          const col = val >= 0 ? C.green : C.red;
          const isHovered = hoveredCountry === alpha2;

          return (
            <g key={`label-${alpha2}`} style={{ pointerEvents: "none" }}>
              {/* Leader line from centroid to offset label */}
              {pos.hasOffset && (
                <line x1={pos.cx} y1={pos.cy} x2={pos.x} y2={pos.y}
                  stroke={`${col}55`} strokeWidth={0.8}
                  strokeDasharray="2,2"
                />
              )}
              {/* Background pill for readability */}
              <rect x={pos.x - 22} y={pos.y - 14} width={44} height={28} rx={3}
                fill={`${C.bg}dd`} stroke={`${col}55`} strokeWidth={isHovered ? 1.5 : 0.7}
              />
              {/* Country code */}
              <text x={pos.x} y={pos.y - 2} textAnchor="middle"
                fill={isHovered ? C.white : C.gray}
                fontSize={10} fontWeight={800} fontFamily={mono}>
                {alpha2}
              </text>
              {/* % change */}
              <text x={pos.x} y={pos.y + 10} textAnchor="middle"
                fill={col}
                fontSize={10} fontWeight={800} fontFamily={mono}>
                {val >= 0 ? "+" : ""}{val.toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* ── Flow arcs between countries ── */}
        {(flowData?.flows || []).map((f, i) => {
          const fromPos = labelPositions[f.from];
          const toPos = labelPositions[f.to];
          if (!fromPos || !toPos) return null;

          const x1 = fromPos.cx, y1 = fromPos.cy;
          const x2 = toPos.cx,   y2 = toPos.cy;

          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const bulge = dist * 0.3;
          const nx = -dy / dist * bulge;
          const ny = dx / dist * bulge;
          const cpx = mx + nx;
          const cpy = my + ny;

          const arcPath = `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
          const isHov = hoveredFlow === i;

          return (
            <g key={`flow-${i}`}>
              {/* Invisible fat hit area for hover */}
              <path d={arcPath} fill="none" stroke="transparent" strokeWidth={10}
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onMouseEnter={() => setHoveredFlow(i)}
                onMouseLeave={() => setHoveredFlow(null)} />
              {/* Subtle glow */}
              <path d={arcPath} fill="none" stroke={f.color}
                strokeWidth={isHov ? 2.5 : 1.2}
                opacity={isHov ? 0.65 : 0.35}
                style={{ pointerEvents: "none", transition: "opacity 0.2s, stroke-width 0.2s" }} />
              {/* Animated particles */}
              <path d={arcPath} fill="none" stroke={f.color}
                strokeWidth={isHov ? 1.5 : 0.8}
                strokeDasharray="2,10"
                opacity={isHov ? 1.0 : 0.55}
                style={{
                  pointerEvents: "none",
                  animation: `flowDash ${2.5 / Math.max(0.3, f.strength)}s linear infinite`,
                  transition: "opacity 0.2s",
                }} />
              {/* Label — only on hover */}
              {isHov && (() => {
                const ri = f.rate_info;
                const hasRate = ri && ri.from_rate != null;
                const boxH = hasRate ? 36 : 22;
                return (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={cpx - 50} y={cpy - 20} width={100} height={boxH} rx={3}
                      fill={`${C.bg}ee`} stroke={`${f.color}66`} strokeWidth={1} />
                    <text x={cpx} y={cpy - 6} textAnchor="middle"
                      fill={f.color} fontSize={8} fontWeight={700} fontFamily={mono}>
                      {f.label} Δ{f.magnitude.toFixed(1)}%
                    </text>
                    {hasRate && (
                      <text x={cpx} y={cpy + 8} textAnchor="middle"
                        fill={ri.against_carry ? C.red : C.gray} fontSize={7} fontFamily={mono}>
                        {f.from}:{ri.from_rate.toFixed(1)}% → {f.to}:{ri.to_rate.toFixed(1)}%
                        {ri.against_carry ? " ⚠" : ""}
                      </text>
                    )}
                  </g>
                );
              })()}
            </g>
          );
        })}
      </svg>

      {/* ── CSS for animated flow particles ── */}
      <style>{`
        @keyframes flowDash {
          0% { stroke-dashoffset: 18; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>

      {/* ── Help button (top left) — globe with ? ── */}
      <HelpGuide />

      {/* ── Flow type legend (bottom left) ── */}
      <div style={{
        position: "absolute", bottom: 8, left: 24,
        background: `${C.bgCard}ee`,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        padding: "6px 10px",
        zIndex: 10,
      }}>
        <div style={{ fontSize: 7, color: C.gray, fontFamily: mono, fontWeight: 700, marginBottom: 4, letterSpacing: "1px" }}>
          FLOW TYPES
        </div>
        {[
          { color: "#2ebd59", label: "Risk-On" },
          { color: "#e8383b", label: "Risk-Off" },
          { color: "#ffa500", label: "Yield-Seeking" },
          { color: "#3796ff", label: "Rotation" },
          { color: "#00d2d3", label: "Emerging Rebalance" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <div style={{ width: 14, height: 2, background: l.color, borderRadius: 1 }} />
            <span style={{ fontSize: 7, color: C.gray, fontFamily: mono }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* ── Hover tooltip ── */}
      {hoveredData && (
        <div ref={tooltipRef} style={{
          position: "absolute",
          left: Math.min(mousePos.x + 16, containerW - 200),
          top: mousePos.y - 10,
          background: `${C.bgCard}f0`,
          border: `1px solid ${hoveredData[key] >= 0 ? C.green : C.red}55`,
          borderRadius: 4,
          padding: "10px 14px",
          minWidth: 160,
          zIndex: 20,
          pointerEvents: "none",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.white, fontFamily: mono, marginBottom: 4 }}>
            {hoveredData.name}
          </div>
          <div style={{ fontSize: 9, color: C.gray, fontFamily: mono, marginBottom: 6 }}>
            ETF: {hoveredData.ticker} · Close: ${hoveredData.close}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <div style={{ fontSize: 8, color: C.muted, fontFamily: mono }}>1 WEEK</div>
              <div style={{
                fontSize: 13, fontWeight: 800, fontFamily: mono,
                color: hoveredData.chg_1w >= 0 ? C.green : C.red,
              }}>
                {hoveredData.chg_1w >= 0 ? "▲" : "▼"} {Math.abs(hoveredData.chg_1w).toFixed(2)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.muted, fontFamily: mono }}>4 WEEK</div>
              <div style={{
                fontSize: 13, fontWeight: 800, fontFamily: mono,
                color: hoveredData.chg_4w >= 0 ? C.green : C.red,
              }}>
                {hoveredData.chg_4w >= 0 ? "▲" : "▼"} {Math.abs(hoveredData.chg_4w).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════
// MAIN PANEL — CONTAINER WITH SUB-TABS
// ════════════════════════════════════════════════════════
export default function MoneyFlowPanel({ assetsData }) {
  const [subTab, setSubTab] = useState("flows");
  const [period, setPeriod] = useState("1W");
  const [sectorData, setSectorData] = useState(null);
  const [countryData, setCountryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMacroData = useCallback(async (type) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = type === "sectors" ? "sectors" : "countries";
      const resp = await fetch(`${API}/api/macro/${endpoint}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (type === "sectors") setSectorData(data);
      else setCountryData(data);
    } catch (e) {
      setError(`Failed to load ${type}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === "sectors" && !sectorData) fetchMacroData("sectors");
    if (subTab === "global" && !countryData) fetchMacroData("countries");
  }, [subTab, sectorData, countryData, fetchMacroData]);

  const leaderboardData = useMemo(() => {
    if (subTab === "sectors" && sectorData) {
      return {
        top5: period === "1W" ? sectorData.top5_1w : sectorData.top5_4w,
        bottom5: period === "1W" ? sectorData.bottom5_1w : sectorData.bottom5_4w,
      };
    }
    if (subTab === "global" && countryData) {
      return {
        top5: period === "1W" ? countryData.top5_1w : countryData.top5_4w,
        bottom5: period === "1W" ? countryData.bottom5_1w : countryData.bottom5_4w,
      };
    }
    return null;
  }, [subTab, period, sectorData, countryData]);

  const showPeriodControls = subTab === "sectors" || subTab === "global";

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: C.bg, fontFamily: mono,
    }}>
      {/* ── Header: Sub-tabs + Period toggle ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", borderBottom: `1px solid ${C.border}`,
        background: C.bgPanel,
      }}>
        <div style={{ display: "flex", gap: 2 }}>
          {SUB_TABS.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)} style={{
              background: subTab === t.id ? `${C.orange}18` : "transparent",
              border: subTab === t.id ? `1px solid ${C.orange}` : `1px solid ${C.border}`,
              color: subTab === t.id ? C.orange : C.muted,
              fontSize: 9, fontWeight: 700, fontFamily: mono,
              padding: "5px 14px", cursor: "pointer",
              letterSpacing: "1.5px",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showPeriodControls && <PeriodToggle period={period} onChange={setPeriod} />}
          {showPeriodControls && (
            <button onClick={() => {
              if (subTab === "sectors") { setSectorData(null); fetchMacroData("sectors"); }
              if (subTab === "global") { setCountryData(null); fetchMacroData("countries"); }
            }} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.muted, fontSize: 9, fontFamily: mono,
              padding: "3px 8px", cursor: "pointer",
            }}>
              ↻
            </button>
          )}
        </div>
      </div>

      {/* ── Loading / Error (tabs 2 & 3) ── */}
      {loading && showPeriodControls && (
        <div style={{
          textAlign: "center", padding: 40, color: C.orange,
          fontSize: 10, fontFamily: mono, letterSpacing: "1px",
        }}>
          LOADING MACRO DATA...
        </div>
      )}
      {error && (
        <div style={{
          textAlign: "center", padding: 20, color: C.red,
          fontSize: 10, fontFamily: mono,
        }}>
          {error}
        </div>
      )}

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Tab 1: Capital Flows */}
        {subTab === "flows" && (
          <MoneyFlowMap />
        )}

        {/* Tab 2: Sectors */}
        {subTab === "sectors" && !loading && sectorData && (
          <>
            <div style={{
              textAlign: "center", padding: "16px 0 4px",
              fontSize: 10, color: C.muted, letterSpacing: "1px",
            }}>
              US SECTOR ROTATION — BUBBLE SIZE = MAGNITUDE OF CHANGE
            </div>
            <SectorBubbles data={sectorData} period={period} />
            <Leaderboard
              top5={leaderboardData?.top5 || []}
              bottom5={leaderboardData?.bottom5 || []}
              periodLabel={period}
            />
          </>
        )}

        {/* Tab 3: Global */}
        {subTab === "global" && !loading && countryData && (
          <>
            <div style={{
              textAlign: "center", padding: "12px 0 2px",
              fontSize: 10, color: C.muted, letterSpacing: "1px",
            }}>
              GLOBAL EQUITY FLOWS — HOVER COUNTRY FOR DETAILS
            </div>
            <GlobalMap data={countryData} period={period} />
            <Leaderboard
              top5={leaderboardData?.top5 || []}
              bottom5={leaderboardData?.bottom5 || []}
              periodLabel={period}
            />
          </>
        )}
      </div>
    </div>
  );
}