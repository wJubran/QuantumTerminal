// version: v9
/**
 * DrawingManager.js — Drawing State Management
 * Quantum Terminal | Phase 4C
 * v2 — added RAY tool (2 clicks: anchor + direction; extends infinitely
 *      past the direction point to the canvas edge).
 *
 * Pure JS class — no React dependency.
 * Manages drawing CRUD, serialization (for profile persistence),
 * and hit-testing (for click-to-select).
 *
 * Consumed by MainChart.jsx via ref. Drawings stored in price/time
 * coordinates so they survive zoom, pan, and resize.
 */

let _nextId = 1;

// ── Drawing type definitions ──
export const DRAWING_TYPES = {
  hline:     { label: "Horizontal Line", points: 1, icon: "─" },
  trendline: { label: "Trend Line",      points: 2, icon: "╲" },
  ray:       { label: "Ray",             points: 2, icon: "↗" },  // v2: 2 clicks, extends past p1 forever
  path:      { label: "Path",            points: -1, icon: "↝" }, // v3: click-to-add vertices, dblclick to end with arrow
  text:        { label: "Text",          points: 1,  icon: "T" },  // v5: click to place, prompts for content
  price_point: { label: "Price Point",   points: 2,  icon: "⊙" }, // v6: click 1 = anchor (saves price), click 2 = label box position
  rectangle: { label: "Rectangle",       points: 2, icon: "▭" },
  circle:    { label: "Circle",          points: 2, icon: "○" },
  fib:       { label: "Fib Retracement", points: 2, icon: "⊟" },
  fib_ext:   { label: "Fib Extension",   points: 4, icon: "⊞" }, // v9: A, B, C define math; D sets the right-edge width of level lines
  pen:           { label: "Freehand Pen",    points: -1, icon: "✎" },  // -1 = N points (drag to draw)
  position_long: { label: "Long Position",   points: 2,  icon: "▲" },  // 2 clicks → entry + SL, TP auto
  position_short:{ label: "Short Position",  points: 2,  icon: "▼" },  // 2 clicks → entry + SL, TP auto
};

// ── Fibonacci default level configs ──
export const DEFAULT_FIB_LEVELS = [
  { level: 0,     color: "#ffffff", enabled: true },
  { level: 0.236, color: "#ffc107", enabled: true },
  { level: 0.382, color: "#2ebd59", enabled: true },
  { level: 0.5,   color: "#3796ff", enabled: true },
  { level: 0.618, color: "#9b59b6", enabled: true },
  { level: 0.786, color: "#ff6d00", enabled: true },
  { level: 1.0,   color: "#ffffff", enabled: true },
];

// v8: defaults tuned to the user's trend-based fib ext preferences.
export const DEFAULT_FIB_EXT_LEVELS = [
  { level: 0,     color: "#ffffff", enabled: true },
  { level: 1.618, color: "#2ebd59", enabled: true },
  { level: 1.809, color: "#9b59b6", enabled: true },
  { level: 2.0,   color: "#3796ff", enabled: true },
  { level: 2.38,  color: "#ffc107", enabled: true },
  { level: 2.68,  color: "#ff6d00", enabled: true },
];

// Legacy compat
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

// ── Default drawing style ──
export const DEFAULT_DRAW_STYLE = {
  color: "#ff6d00",
  lineWidth: 1,
  opacity: 0.8,
  // v9: fib/fib_ext internal color fill between levels — off by default.
  //     Toggle on per-drawing via the style editor.
  fibFill: false,
};

export default class DrawingManager {
  constructor() {
    /** @type {Array<Drawing>} */
    this._drawings = [];
    this._selectedId = null;
    this._onChange = null; // callback when state changes
  }

  // ── Lifecycle ──

  /** Register a change callback (triggers re-render in React) */
  onChange(cb) { this._onChange = cb; }

  _notify() { this._onChange?.(); }

  // ── CRUD ──

  /** Add a completed drawing */
  add(drawing) {
    const id = `draw_${_nextId++}_${Date.now()}`;
    const d = {
      id,
      type: drawing.type,           // "hline" | "trendline" | "rectangle"
      points: drawing.points,       // [{time, price}, ...] — 1 or 2 points
      style: { ...DEFAULT_DRAW_STYLE, ...(drawing.style || {}) },
      ticker: drawing.ticker || "",
      timeframe: drawing.timeframe || "",
      created: Date.now(),
    };
    this._drawings.push(d);
    this._notify();
    return d;
  }

  /** Remove drawing by id */
  remove(id) {
    this._drawings = this._drawings.filter(d => d.id !== id);
    if (this._selectedId === id) this._selectedId = null;
    this._notify();
  }

  /** Update a drawing's points (for drag-to-adjust) */
  updatePoints(id, newPoints) {
    const d = this.getById(id);
    if (!d) return;
    d.points = newPoints;
    this._notify();
  }

  /** v4: Patch the selected drawing's style. Merges into existing style
   *  object so callers can change color without resetting lineWidth etc. */
  updateStyle(id, styleUpdates) {
    const d = this.getById(id);
    if (!d || !styleUpdates) return;
    d.style = { ...d.style, ...styleUpdates };
    this._notify();
  }

  /** Move entire drawing by delta time/price */
  moveBy(id, deltaTime, deltaPrice) {
    const d = this.getById(id);
    if (!d) return;
    d.points = d.points.map(pt => ({
      time: pt.time + deltaTime,
      price: pt.price + deltaPrice,
    }));
    this._notify();
  }

  /** Move a single point of a drawing (endpoint drag) */
  movePoint(id, pointIndex, newTime, newPrice) {
    const d = this.getById(id);
    if (!d || !d.points[pointIndex]) return;
    // Position tools: only allow price changes, time stays fixed
    if (d.type === "position_long" || d.type === "position_short") {
      d.points[pointIndex] = { time: d.points[pointIndex].time, price: newPrice };
    } else {
      d.points[pointIndex] = { time: newTime, price: newPrice };
    }
    // Update hline price label if applicable
    if (d.type === "hline" && d.style?._priceLabel != null) {
      d.style._priceLabel = newPrice;
    }
    this._notify();
  }

  /** Resize position tool width — sync both SL and TP times */
  resizePositionWidth(id, newTime) {
    const d = this.getById(id);
    if (!d || d.points.length < 3) return;
    const minTime = d.points[0].time + 60; // at least 1 min wide
    const clampedTime = Math.max(newTime, minTime);
    d.points[1] = { ...d.points[1], time: clampedTime };
    d.points[2] = { ...d.points[2], time: clampedTime };
    this._notify();
  }

  /** Remove all drawings for a ticker+timeframe */
  clearForChart(ticker, timeframe) {
    this._drawings = this._drawings.filter(
      d => !(d.ticker === ticker && d.timeframe === timeframe)
    );
    this._selectedId = null;
    this._notify();
  }

  /** Clear all drawings */
  clearAll() {
    this._drawings = [];
    this._selectedId = null;
    this._notify();
  }

  // ── Selection ──

  select(id) {
    this._selectedId = id;
    this._notify();
  }

  deselect() {
    if (this._selectedId) {
      this._selectedId = null;
      this._notify();
    }
  }

  get selectedId() { return this._selectedId; }

  // ── Queries ──

  /** Get drawings for a specific ticker + timeframe */
  getForChart(ticker, timeframe) {
    return this._drawings.filter(
      d => d.ticker === ticker && d.timeframe === timeframe
    );
  }

  getAll() { return this._drawings; }

  getById(id) { return this._drawings.find(d => d.id === id) || null; }

  // ── Hit Testing ──

  /**
   * Find the drawing closest to (time, price) within a threshold.
   * Returns the drawing or null.
   *
   * @param {number} time — UTC timestamp
   * @param {number} price — price value
   * @param {number} priceTolerance — max distance in price units
   * @param {number} timeTolerance — max distance in seconds
   * @param {string} ticker
   * @param {string} timeframe
   */
  hitTest(time, price, priceTolerance, timeTolerance, ticker, timeframe) {
    const candidates = this.getForChart(ticker, timeframe);
    let bestDist = Infinity;
    let bestDrawing = null;

    for (const d of candidates) {
      const dist = this._distanceTo(d, time, price, priceTolerance, timeTolerance);
      if (dist < bestDist && dist <= 1.0) {
        bestDist = dist;
        bestDrawing = d;
      }
    }
    return bestDrawing;
  }

  /**
   * Normalized distance [0..1] from a point to a drawing.
   * Returns >1 if outside tolerance.
   */
  _distanceTo(drawing, time, price, priceTol, timeTol) {
    const pts = drawing.points;

    switch (drawing.type) {
      case "hline": {
        // Horizontal line — only price matters
        const dp = Math.abs(price - pts[0].price) / priceTol;
        return dp;
      }

      case "trendline": {
        // Distance from point to line segment
        return this._pointToSegmentDist(
          time, price, pts[0].time, pts[0].price, pts[1].time, pts[1].price,
          timeTol, priceTol
        );
      }

      case "ray": {
        // v2: Distance from point to ray (p0 → p1 extended past p1).
        // Projection parameter only clamped at lower bound (param >= 0).
        return this._pointToRayDist(
          time, price, pts[0].time, pts[0].price, pts[1].time, pts[1].price,
          timeTol, priceTol
        );
      }

      case "path": {
        // v3: Minimum distance across every segment in the polyline.
        if (!pts || pts.length < 2) return 2;
        let minDist = Infinity;
        for (let i = 1; i < pts.length; i++) {
          const d = this._pointToSegmentDist(
            time, price,
            pts[i-1].time, pts[i-1].price,
            pts[i].time,   pts[i].price,
            timeTol, priceTol,
          );
          if (d < minDist) minDist = d;
        }
        return minDist;
      }

      case "text": {
        // v5: L∞ hit — within a rectangle of half-width=timeTol and
        //     half-height=priceTol centered on the anchor.
        if (!pts[0]) return 2;
        const dt = Math.abs(time - pts[0].time) / (timeTol || 1);
        const dp = Math.abs(price - pts[0].price) / (priceTol || 1);
        return Math.max(dt, dp);
      }

      case "price_point": {
        // v6: 2-point now — clickable at either the anchor dot OR the
        //     label box position. Return min distance across both.
        if (!pts[0]) return 2;
        const anchorD = Math.max(
          Math.abs(time - pts[0].time) / (timeTol || 1),
          Math.abs(price - pts[0].price) / (priceTol || 1),
        );
        if (!pts[1]) return anchorD;
        const labelD = Math.max(
          Math.abs(time - pts[1].time) / (timeTol || 1),
          Math.abs(price - pts[1].price) / (priceTol || 1),
        );
        return Math.min(anchorD, labelD);
      }

      case "rectangle": {
        // Distance to nearest edge of the rectangle
        const tMin = Math.min(pts[0].time, pts[1].time);
        const tMax = Math.max(pts[0].time, pts[1].time);
        const pMin = Math.min(pts[0].price, pts[1].price);
        const pMax = Math.max(pts[0].price, pts[1].price);

        // Check if near any of the 4 edges
        const inTimeRange = time >= tMin - timeTol && time <= tMax + timeTol;
        const inPriceRange = price >= pMin - priceTol && price <= pMax + priceTol;

        if (!inTimeRange && !inPriceRange) return 2; // too far

        const dTop = Math.abs(price - pMax) / priceTol;
        const dBot = Math.abs(price - pMin) / priceTol;
        const dLeft = Math.abs(time - tMin) / timeTol;
        const dRight = Math.abs(time - tMax) / timeTol;

        // Near top/bottom edge (must be within time range)
        const edgeDists = [];
        if (inTimeRange) {
          edgeDists.push(dTop, dBot);
        }
        // Near left/right edge (must be within price range)
        if (inPriceRange) {
          edgeDists.push(dLeft, dRight);
        }

        return edgeDists.length > 0 ? Math.min(...edgeDists) : 2;
      }

      case "circle": {
        // Distance to circumference of circle defined by center (pt0) and edge (pt1)
        const cx = pts[0].time, cy = pts[0].price;
        const rx = Math.abs(pts[1].time - cx), ry = Math.abs(pts[1].price - cy);
        if (rx === 0 && ry === 0) return 2;
        // Normalized distance from center
        const nt = (time - cx) / (rx || 1);
        const np = (price - cy) / (ry || 1);
        const distFromCenter = Math.sqrt(nt * nt + np * np);
        // Distance to circumference (ring), normalized by tolerance
        const ringDist = Math.abs(distFromCenter - 1);
        const scaledDist = ringDist * Math.min(rx / timeTol, ry / priceTol);
        return Math.min(scaledDist, 2);
      }

      case "fib": {
        // Retracement — horizontal lines between two price points, levels
        // measured from the high toward the low: price = pHigh - lvl*range.
        if (pts.length < 2) return 2;
        const tMin = Math.min(pts[0].time, pts[1].time);
        const tMax = Math.max(pts[0].time, pts[1].time);
        if (time < tMin - timeTol || time > tMax + timeTol) return 2;
        const pHigh = Math.max(pts[0].price, pts[1].price);
        const pLow = Math.min(pts[0].price, pts[1].price);
        const range = pHigh - pLow;
        if (range === 0) return 2;
        const levels = drawing.style?._levels || FIB_LEVELS.map(l => ({ level: l, enabled: true }));
        let best = 2;
        for (const entry of levels) {
          const lvl = typeof entry === "number" ? entry : entry.level;
          if (typeof entry === "object" && entry.enabled === false) continue;
          const fibPrice = pHigh - lvl * range;
          const d = Math.abs(price - fibPrice) / priceTol;
          if (d < best) best = d;
        }
        return best;
      }

      case "fib_ext": {
        // v9: Extension — 3 math points (A, B, C) + 1 optional width anchor (D).
        //     Levels projected from C by (B - A): price = C + lvl * (B - A).
        //     Span: from C.time to D.time if 4 points, else fall back to
        //     a width equal to AB.
        if (pts.length < 3) return 2;
        const range = pts[1].price - pts[0].price;
        if (range === 0) return 2;
        const tStart = pts[2].time;
        const tEnd = pts.length >= 4
          ? pts[3].time
          : tStart + (Math.abs(pts[1].time - pts[0].time) || (timeTol * 10));
        const tLeft = Math.min(tStart, tEnd);
        const tRight = Math.max(tStart, tEnd);
        if (time < tLeft - timeTol || time > tRight + timeTol) return 2;
        const levels = drawing.style?._levels || FIB_LEVELS.map(l => ({ level: l, enabled: true }));
        let best = 2;
        for (const entry of levels) {
          const lvl = typeof entry === "number" ? entry : entry.level;
          if (typeof entry === "object" && entry.enabled === false) continue;
          const fibPrice = pts[2].price + lvl * range;
          const d = Math.abs(price - fibPrice) / priceTol;
          if (d < best) best = d;
        }
        return best;
      }

      case "pen": {
        // Distance to nearest segment of polyline
        if (pts.length < 2) return 2;
        let best = 2;
        for (let i = 0; i < pts.length - 1; i++) {
          const d = this._pointToSegmentDist(
            time, price, pts[i].time, pts[i].price, pts[i+1].time, pts[i+1].price,
            timeTol, priceTol
          );
          if (d < best) best = d;
        }
        return best;
      }

      case "position_long":
      case "position_short": {
        // 3 points: entry, SL, TP — check distance to any of the 3 horizontal lines
        if (pts.length < 3) return 2;
        const tMin = Math.min(pts[0].time, pts[1].time);
        const tMax = Math.max(pts[0].time, pts[1].time);
        if (time < tMin - timeTol || time > tMax + timeTol) return 2;
        const dEntry = Math.abs(price - pts[0].price) / priceTol;
        const dSL = Math.abs(price - pts[1].price) / priceTol;
        const dTP = Math.abs(price - pts[2].price) / priceTol;
        return Math.min(dEntry, dSL, dTP);
      }

      default:
        return 2;
    }
  }

  /** Normalized distance from point to a line segment */
  _pointToSegmentDist(t, p, t1, p1, t2, p2, tTol, pTol) {
    // Normalize to [0,1] space
    const nt = (t - t1) / (tTol || 1);
    const np = (p - p1) / (pTol || 1);
    const nt2 = (t2 - t1) / (tTol || 1);
    const np2 = (p2 - p1) / (pTol || 1);

    const lenSq = nt2 * nt2 + np2 * np2;
    if (lenSq === 0) {
      return Math.sqrt(nt * nt + np * np);
    }

    let param = (nt * nt2 + np * np2) / lenSq;
    param = Math.max(0, Math.min(1, param));

    const projT = nt2 * param;
    const projP = np2 * param;

    return Math.sqrt((nt - projT) ** 2 + (np - projP) ** 2);
  }

  // v2: ray variant — same as segment but with no upper clamp, so the line
  //     extends past p2 to infinity. Only param < 0 clamps (behind p1).
  _pointToRayDist(t, p, t1, p1, t2, p2, tTol, pTol) {
    const nt = (t - t1) / (tTol || 1);
    const np = (p - p1) / (pTol || 1);
    const nt2 = (t2 - t1) / (tTol || 1);
    const np2 = (p2 - p1) / (pTol || 1);

    const lenSq = nt2 * nt2 + np2 * np2;
    if (lenSq === 0) return Math.sqrt(nt * nt + np * np);

    let param = (nt * nt2 + np * np2) / lenSq;
    param = Math.max(0, param); // ← no upper bound

    const projT = nt2 * param;
    const projP = np2 * param;

    return Math.sqrt((nt - projT) ** 2 + (np - projP) ** 2);
  }

  // ── Serialization (for profile save/load) ──

  serialize() {
    return JSON.parse(JSON.stringify(this._drawings));
  }

  deserialize(data) {
    if (!Array.isArray(data)) return;
    this._drawings = data.map(d => ({
      ...d,
      style: { ...DEFAULT_DRAW_STYLE, ...(d.style || {}) },
    }));
    this._selectedId = null;
    // Update _nextId to avoid collisions
    for (const d of this._drawings) {
      const match = d.id?.match(/draw_(\d+)/);
      if (match) _nextId = Math.max(_nextId, parseInt(match[1]) + 1);
    }
    this._notify();
  }
}