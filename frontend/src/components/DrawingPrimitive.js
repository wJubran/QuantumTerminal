// version: v11
/**
 * DrawingPrimitive.js — LWC v5 ISeriesPrimitive for Chart Drawings
 * Quantum Terminal | Phase 4C
 * v2 — RAY renderer: extends from p0 through p1 to the canvas edge.
 *
 * Renders user drawings (horizontal lines, trend lines, rectangles)
 * on the chart canvas at 60fps. Follows the same ISeriesPrimitive
 * pattern as SignalMarkersPrimitive.js.
 *
 * Coordinate system: drawings stored in price/time space,
 * converted to pixels each frame via series + timeScale APIs.
 *
 * Usage:
 *   const prim = new DrawingPrimitive();
 *   candleSeries.attachPrimitive(prim);
 *   prim.setDrawings(drawingsArray);      // committed drawings
 *   prim.setPreview(previewDrawing);      // in-progress drawing
 */

// ════════════════════════════════════════════════════════
// DRAWING PRIMITIVE (ISeriesPrimitive)
// ════════════════════════════════════════════════════════
export class DrawingPrimitive {
  constructor() {
    this._drawings = [];
    this._preview = null;       // drawing being created (follows cursor)
    this._selectedId = null;
    this._paneView = new DrawingPaneView(this);
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  // ── ISeriesPrimitive interface ──

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews() {
    return [this._paneView];
  }

  updateAllViews() {
    this._paneView.update();
  }

  // ── Data setters ──

  setDrawings(drawings) {
    this._drawings = drawings || [];
    this._requestUpdate?.();
  }

  setPreview(preview) {
    this._preview = preview;
    this._requestUpdate?.();
  }

  setSelectedId(id) {
    this._selectedId = id;
    this._requestUpdate?.();
  }
}

// ════════════════════════════════════════════════════════
// PANE VIEW — converts data coords to pixels, returns renderer
// ════════════════════════════════════════════════════════
class DrawingPaneView {
  constructor(source) {
    this._source = source;
    this._renderData = [];
    this._previewData = null;
  }

  update() {
    const { _chart: chart, _series: series, _drawings: drawings, _preview: preview, _selectedId: selId } = this._source;
    if (!chart || !series) { this._renderData = []; this._previewData = null; return; }

    const ts = chart.timeScale();

    this._renderData = drawings.map(d => this._convertDrawing(d, series, ts, d.id === selId)).filter(Boolean);
    this._previewData = preview ? this._convertDrawing(preview, series, ts, false, true) : null;
  }

  _convertDrawing(d, series, ts, selected, isPreview = false) {
    const pixelPoints = [];
    const isPosition = d.type === "position_long" || d.type === "position_short";

    if (isPosition && d.points.length >= 3) {
      // Position tools: entry uses left time, SL/TP use right time (may be off-chart)
      // Get entry x from point[0], compute right x from point[1] or fallback to pixel offset
      let entryX = null, rightX = null;
      try { entryX = ts.timeToCoordinate(d.points[0].time); } catch {}
      try { rightX = ts.timeToCoordinate(d.points[1].time); } catch {}
      if (entryX == null) return null; // entry off-screen → skip entirely
      if (rightX == null) rightX = entryX + 200; // fallback: 200px wide
      const boxW = Math.max(rightX - entryX, 80);

      for (let i = 0; i < d.points.length; i++) {
        let y = null;
        try { y = series.priceToCoordinate(d.points[i].price); } catch {}
        if (y == null) return null;
        pixelPoints.push({ x: i === 0 ? entryX : entryX + boxW, y });
      }
    } else {
      for (const pt of d.points) {
        let x = null;
        if (d.type === "hline") {
          x = 0;
        } else {
          try { x = ts.timeToCoordinate(pt.time); } catch { x = null; }
        }
        let y = null;
        try { y = series.priceToCoordinate(pt.price); } catch { y = null; }

        if (d.type === "hline" && y != null) {
          pixelPoints.push({ x: 0, y });
        } else if (x != null && y != null) {
          pixelPoints.push({ x, y });
        }
      }
    }

    // Need minimum points to render. v7: price_point moved to 2-point
    //     (anchor + label position). Only hline and text remain 1-point.
    const onePointTypes = (d.type === "hline" || d.type === "text");
    const minPts = onePointTypes ? 1 : isPosition ? 3 : 2;
    if (pixelPoints.length < minPts) return null;

    // Extra data for fib/fib_ext — compute pixel Y for each level.
    // v8: fib_ext uses 3-point TV math: price = C + lvl * (B - A).
    //     2-point fib_ext preview (stage 1) skips levels — only AB line renders.
    let fibLevels = null;
    const isFibRet = d.type === "fib" && d.points.length >= 2;
    const isFibExt3 = d.type === "fib_ext" && d.points.length >= 3;
    if (isFibRet || isFibExt3) {
      const FALLBACK_FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
      const FALLBACK_EXT = [0, 0.618, 1.0, 1.272, 1.618, 2.0, 2.618];
      let levelDefs = d.style?._levels;
      if (!levelDefs) {
        const defaults = d.type === "fib_ext" ? FALLBACK_EXT : FALLBACK_FIB;
        levelDefs = defaults.map(l => ({ level: l, color: null, enabled: true }));
      }
      fibLevels = levelDefs
        .filter(entry => entry.enabled !== false)
        .map(entry => {
          const lvl = typeof entry === "number" ? entry : entry.level;
          const color = (typeof entry === "object" && entry.color) ? entry.color : null;
          let price;
          if (isFibExt3) {
            // Extension: measured from C, scaled by (B - A), direction preserved.
            price = d.points[2].price + lvl * (d.points[1].price - d.points[0].price);
          } else {
            // Retracement: measured from high toward low.
            const pHigh = Math.max(d.points[0].price, d.points[1].price);
            const pLow  = Math.min(d.points[0].price, d.points[1].price);
            const range = pHigh - pLow;
            price = pHigh - lvl * range;
          }
          let y = null;
          try { y = series.priceToCoordinate(price); } catch {}
          return { level: lvl, price, y, color };
        }).filter(f => f.y != null);
    }

    // v10: ABC validity check for fib_ext (3-point). Permissive — math still
    //      runs, but _drawFib dims the levels and shows a "⚠ invalid ABC"
    //      badge when the geometry doesn't match a bullish or bearish setup.
    let validAbc = true;
    if (d.type === "fib_ext" && d.points.length >= 3) {
      const A = d.points[0], B = d.points[1], C = d.points[2];
      const timeOK = A.time < B.time && B.time < C.time;
      if (!timeOK) {
        validAbc = false;
      } else if (A.price < B.price) {
        validAbc = A.price < C.price && C.price < B.price; // bullish
      } else if (A.price > B.price) {
        validAbc = B.price < C.price && C.price < A.price; // bearish
      } else {
        validAbc = false; // degenerate (A == B)
      }
    }

    return {
      type: d.type,
      points: pixelPoints,
      style: d.style || {},
      selected,
      isPreview,
      id: d.id,
      fibLevels,
      validAbc,
      pricePoints: (d.type === "position_long" || d.type === "position_short") ? d.points : null,
    };
  }

  renderer() {
    return new DrawingRenderer(this._renderData, this._previewData);
  }

  zOrder() {
    return "top";
  }
}

// ════════════════════════════════════════════════════════
// RENDERER — canvas drawing operations
// ════════════════════════════════════════════════════════
class DrawingRenderer {
  constructor(renderData, previewData) {
    this._data = renderData;
    this._preview = previewData;
  }

  draw(target) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hRatio = scope.horizontalPixelRatio;
      const vRatio = scope.verticalPixelRatio;
      const w = scope.bitmapSize.width;
      const h = scope.bitmapSize.height;

      // Draw committed drawings
      for (const d of this._data) {
        this._drawShape(ctx, d, hRatio, vRatio, w, h);
      }

      // Draw preview (dashed, semi-transparent)
      if (this._preview) {
        this._drawShape(ctx, this._preview, hRatio, vRatio, w, h);
      }
    });
  }

  _drawShape(ctx, d, hRatio, vRatio, canvasW, canvasH) {
    const style = d.style;
    const opacity = d.isPreview ? 0.5 : (style.opacity ?? 0.8);
    const color = style.color || "#ff6d00";
    const lw = (style.lineWidth || 1) * hRatio;
    const selected = d.selected;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.fillStyle = color;

    if (d.isPreview) {
      ctx.setLineDash([6 * hRatio, 4 * hRatio]);
    } else {
      ctx.setLineDash([]);
    }

    switch (d.type) {
      case "hline":
        this._drawHLine(ctx, d, hRatio, vRatio, canvasW, selected);
        break;
      case "trendline":
        this._drawTrendLine(ctx, d, hRatio, vRatio, selected);
        break;
      case "ray":
        this._drawRay(ctx, d, hRatio, vRatio, canvasW, selected);
        break;
      case "path":
        this._drawPath(ctx, d, hRatio, vRatio, selected);
        break;
      case "text":
        this._drawText(ctx, d, hRatio, vRatio, selected);
        break;
      case "price_point":
        this._drawPricePoint(ctx, d, hRatio, vRatio, selected);
        break;
      case "rectangle":
        this._drawRectangle(ctx, d, hRatio, vRatio, selected);
        break;
      case "circle":
        this._drawCircle(ctx, d, hRatio, vRatio, selected);
        break;
      case "fib":
        this._drawFib(ctx, d, hRatio, vRatio, canvasW, selected);
        break;
      case "fib_ext":
        this._drawFib(ctx, d, hRatio, vRatio, canvasW, selected);
        break;
      case "pen":
        this._drawPen(ctx, d, hRatio, vRatio, selected);
        break;
      case "position_long":
      case "position_short":
        this._drawPosition(ctx, d, hRatio, vRatio, canvasW, selected);
        break;
    }

    ctx.restore();
  }

  _drawHLine(ctx, d, hRatio, vRatio, canvasW, selected) {
    const y = Math.round(d.points[0].y * vRatio);

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();

    // Selection highlight — thicker outline
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
      ctx.restore();
    }

    // Price label on right edge
    const price = d.style._priceLabel;
    if (price != null) {
      ctx.globalAlpha = 0.9;
      const text = typeof price === "number" ? price.toFixed(2) : String(price);
      ctx.font = `${Math.round(9 * vRatio)}px 'Courier New', monospace`;
      const tw = ctx.measureText(text).width;
      const pad = 3 * hRatio;
      const lx = canvasW - tw - pad * 3;
      ctx.fillStyle = "#111";
      ctx.fillRect(lx - pad, y - 7 * vRatio, tw + pad * 2, 14 * vRatio);
      ctx.fillStyle = d.style.color || "#ff6d00";
      ctx.fillText(text, lx, y + 3 * vRatio);
    }
  }

  _drawTrendLine(ctx, d, hRatio, vRatio, selected) {
    const [p0, p1] = d.points;
    const x0 = Math.round(p0.x * hRatio);
    const y0 = Math.round(p0.y * vRatio);
    const x1 = Math.round(p1.x * hRatio);
    const y1 = Math.round(p1.y * vRatio);

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Endpoint circles
    const r = 3 * hRatio;
    for (const [px, py] of [[x0, y0], [x1, y1]]) {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Selection highlight
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // v5: Text — anchored label. Uses d.style._text for content and
  //     d.style.fontSize for scaling. A translucent bounding rectangle
  //     appears on selection so the handle is obvious.
  _drawText(ctx, d, hRatio, vRatio, selected) {
    const pt = d.points?.[0];
    if (!pt) return;
    const x = Math.round(pt.x * hRatio);
    const y = Math.round(pt.y * vRatio);
    const text = d.style?._text || "Text";
    const fontSize = Math.round((d.style?.fontSize || 11) * hRatio);
    ctx.save();
    ctx.font = `${fontSize}px 'Courier New', 'Monaco', 'Consolas', monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    // Respect opacity even though the outer _drawDrawing already sets alpha
    const m = ctx.measureText(text);
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = d.style?.color || "#ff6d00";
      ctx.fillRect(x - 3, y - fontSize * 0.7, m.width + 6, fontSize * 1.4);
      ctx.restore();
    }
    // v5: explicitly set fillStyle so color edits from the style editor
    //     always apply, regardless of what the outer wrapper left behind.
    ctx.fillStyle = d.style?.color || "#ff6d00";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // v7: Price Point — click 1 anchors the price, click 2 places a
  //     bordered label box. A leader line connects anchor → box.
  //     Font size is driven by style.fontSize so the editor slider works.
  _drawPricePoint(ctx, d, hRatio, vRatio, selected) {
    const a = d.points?.[0];
    const b = d.points?.[1] || d.points?.[0]; // fallback if only anchor exists
    if (!a) return;
    const ax = Math.round(a.x * hRatio);
    const ay = Math.round(a.y * vRatio);
    const bx = Math.round(b.x * hRatio);
    const by = Math.round(b.y * vRatio);
    const r = 4 * hRatio;
    const color = d.style?.color || "#ff6d00";
    const priceLabel = d.style?._priceLabel ?? a.price;

    // Anchor dot
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fill();

    // Leader line from anchor → label box (only if they differ)
    if (b !== a && (ax !== bx || ay !== by)) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, (d.style?.lineWidth || 1) * hRatio);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    }

    // Label box
    if (priceLabel != null && isFinite(priceLabel)) {
      const fs = Math.round((d.style?.fontSize || 11) * hRatio);
      ctx.save();
      ctx.font = `bold ${fs}px 'Courier New', 'Monaco', 'Consolas', monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      const txt = Number(priceLabel).toFixed(Math.abs(priceLabel) < 10 ? 4 : 2);
      const m = ctx.measureText(txt);
      const padX = 6 * hRatio;
      const padY = 4 * hRatio;
      const boxW = m.width + padX * 2;
      const boxH = fs + padY * 2;
      const boxX = bx - boxW / 2;
      const boxY = by - boxH / 2;
      // Solid dark background so text stays legible over any chart content
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#000";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.restore();
      // Colored border
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, (d.style?.lineWidth || 1) * hRatio);
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
      // Text
      ctx.fillStyle = color;
      ctx.fillText(txt, bx, by);
      ctx.restore();

      // Selection highlight — outer ring on anchor + thicker box outline
      if (selected) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2 * hRatio;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(ax, ay, r + 3 * hRatio, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(boxX - 2, boxY - 2, boxW + 4, boxH + 4);
        ctx.restore();
      }
      return;
    }

    // Fallback selection (no label) — just the anchor ring
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2 * hRatio;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(ax, ay, r + 3 * hRatio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // v3: Path — polyline connecting every clicked vertex with an arrowhead
  //     at the last point (the direction of travel). Dots at every vertex
  //     so any point is draggable later.
  _drawPath(ctx, d, hRatio, vRatio, selected) {
    const pts = d.points;
    if (!pts || pts.length < 2) {
      // During drawing, if we somehow have 1 point, still show the dot.
      if (pts?.length === 1) {
        const px = Math.round(pts[0].x * hRatio);
        const py = Math.round(pts[0].y * vRatio);
        ctx.beginPath();
        ctx.arc(px, py, 3 * hRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // Polyline
    ctx.beginPath();
    ctx.moveTo(Math.round(pts[0].x * hRatio), Math.round(pts[0].y * vRatio));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(Math.round(pts[i].x * hRatio), Math.round(pts[i].y * vRatio));
    }
    ctx.stroke();

    // Arrowhead at the last segment (direction = last vertex)
    const sx = Math.round(pts[pts.length - 2].x * hRatio);
    const sy = Math.round(pts[pts.length - 2].y * vRatio);
    const ex = Math.round(pts[pts.length - 1].x * hRatio);
    const ey = Math.round(pts[pts.length - 1].y * vRatio);
    this._drawArrowhead(ctx, sx, sy, ex, ey, hRatio);

    // v6: vertex handles removed — matches ray tool, cleaner visual.

    // Selection highlight — thicker outline along the whole polyline
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(Math.round(pts[0].x * hRatio), Math.round(pts[0].y * vRatio));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(Math.round(pts[i].x * hRatio), Math.round(pts[i].y * vRatio));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Arrowhead fill triangle pointing from (x1,y1) → (x2,y2). Size scales
  // with hRatio so it stays consistent under high-DPI rendering.
  _drawArrowhead(ctx, x1, y1, x2, y2, hRatio) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return;
    const angle = Math.atan2(dy, dx);
    const size = 10 * hRatio;
    const wing = Math.PI / 7; // tight arrow — 25° half-angle
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - size * Math.cos(angle - wing),
      y2 - size * Math.sin(angle - wing)
    );
    ctx.lineTo(
      x2 - size * Math.cos(angle + wing),
      y2 - size * Math.sin(angle + wing)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // v2: Ray — same as trendline but extends from p0 through p1 to the
  //     canvas edge in the direction of p1. Handles at p0 + p1 only.
  _drawRay(ctx, d, hRatio, vRatio, canvasW, selected) {
    const [p0, p1] = d.points;
    if (!p0 || !p1) return;
    const x0 = Math.round(p0.x * hRatio);
    const y0 = Math.round(p0.y * vRatio);
    const x1 = Math.round(p1.x * hRatio);
    const y1 = Math.round(p1.y * vRatio);

    const dx = x1 - x0;
    const dy = y1 - y0;
    const canvasH = ctx.canvas?.height || 10000;

    // Extended endpoint — where the ray crosses the canvas boundary in
    // the direction of p1.
    let xEnd, yEnd;
    if (dx === 0 && dy === 0) {
      xEnd = x1; yEnd = y1;                 // degenerate — render as a dot
    } else if (dx === 0) {
      xEnd = x1;                            // vertical ray
      yEnd = dy > 0 ? canvasH : 0;
    } else {
      const slope = dy / dx;
      xEnd = dx > 0 ? canvasW : 0;          // horizontal direction → canvas edge
      yEnd = Math.round(y0 + slope * (xEnd - x0));
    }

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();

    // Selection highlight + drag handles — only when the ray is selected
    // so a quiet ray stays clean. Matches the style of other drawings.
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(xEnd, yEnd);
      ctx.stroke();
      ctx.restore();

      const r = 3 * hRatio;
      for (const [px, py] of [[x0, y0], [x1, y1]]) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawRectangle(ctx, d, hRatio, vRatio, selected) {
    const [p0, p1] = d.points;
    const x0 = Math.round(p0.x * hRatio);
    const y0 = Math.round(p0.y * vRatio);
    const x1 = Math.round(p1.x * hRatio);
    const y1 = Math.round(p1.y * vRatio);

    const rx = Math.min(x0, x1);
    const ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0);
    const rh = Math.abs(y1 - y0);

    // Fill (semi-transparent)
    ctx.save();
    ctx.globalAlpha = (d.style.opacity ?? 0.8) * (d.isPreview ? 0.15 : 0.08);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();

    // Border
    ctx.strokeRect(rx, ry, rw, rh);

    // Selection highlight
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.setLineDash([]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    // Corner handles when selected
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      const hs = 3 * hRatio;
      for (const [cx, cy] of [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]]) {
        ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
      }
      ctx.restore();
    }
  }

  _drawCircle(ctx, d, hRatio, vRatio, selected) {
    const [p0, p1] = d.points;
    const cx = Math.round(p0.x * hRatio);
    const cy = Math.round(p0.y * vRatio);
    const rx = Math.abs(Math.round((p1.x - p0.x) * hRatio));
    const ry = Math.abs(Math.round((p1.y - p0.y) * vRatio));

    if (rx < 1 && ry < 1) return;

    // Fill
    ctx.save();
    ctx.globalAlpha = (d.style.opacity ?? 0.8) * (d.isPreview ? 0.12 : 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Stroke
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Selection highlight
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Handle points: center + edge
      ctx.save();
      ctx.globalAlpha = 0.9;
      const hs = 3 * hRatio;
      ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
      const ex = Math.round(p1.x * hRatio), ey = Math.round(p1.y * vRatio);
      ctx.fillRect(ex - hs, ey - hs, hs * 2, hs * 2);
      ctx.restore();
    }
  }

  _drawFib(ctx, d, hRatio, vRatio, canvasW, selected) {
    const pts = d.points;

    // v8: fib_ext stage-1 preview — AB rubber-band only, no levels.
    if (d.type === "fib_ext" && pts.length === 2) {
      const x0 = Math.round(pts[0].x * hRatio);
      const y0 = Math.round(pts[0].y * vRatio);
      const x1 = Math.round(pts[1].x * hRatio);
      const y1 = Math.round(pts[1].y * vRatio);
      ctx.save();
      ctx.strokeStyle = d.style?.color || "#ff6d00";
      ctx.lineWidth = Math.max(1, (d.style?.lineWidth || 1) * hRatio);
      ctx.setLineDash([6 * hRatio, 4 * hRatio]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (!d.fibLevels || d.fibLevels.length === 0) return;

    // v8: for fib_ext 3-point, level lines span from C rightward with a
    //     width equal to the AB pixel span (min 150px). v11: 4-point case
    //     uses points[3].x (the user-placed width anchor D) as the right
    //     edge, giving the user direct control over extension width.
    //     Retracement (fib) keeps its original behavior — lines span
    //     between points[0] and points[1].
    let x0, x1, xStart, xEnd, fibWidth;
    if (d.type === "fib_ext" && pts.length >= 3) {
      const xA = Math.round(pts[0].x * hRatio);
      const xB = Math.round(pts[1].x * hRatio);
      const xC = Math.round(pts[2].x * hRatio);
      xStart = xC;
      if (pts.length >= 4) {
        const xD = Math.round(pts[3].x * hRatio);
        xEnd = Math.max(xD, xC + 20 * hRatio); // enforce a tiny minimum
        fibWidth = xEnd - xStart;
      } else {
        const abSpan = Math.abs(xB - xA);
        fibWidth = Math.max(abSpan, 150 * hRatio);
        xEnd = xC + fibWidth;
      }
      x0 = xA; // used for AB line
      x1 = xB;
    } else {
      x0 = Math.round(pts[0].x * hRatio);
      x1 = Math.round(pts[1].x * hRatio);
      const xMin = Math.min(x0, x1);
      const xMax = Math.max(x0, x1);
      fibWidth = Math.max(xMax - xMin, 100 * hRatio);
      xStart = xMin;
      xEnd   = xMin + fibWidth;
    }

    // v8: for fib_ext 3-point, draw the AB trendline as context.
    // v9: also draw the B→C pullback line so the full A→B→C path is visible.
    if (d.type === "fib_ext" && pts.length >= 3) {
      const yA = Math.round(pts[0].y * vRatio);
      const yB = Math.round(pts[1].y * vRatio);
      const xC = Math.round(pts[2].x * hRatio);
      const yC = Math.round(pts[2].y * vRatio);
      ctx.save();
      ctx.strokeStyle = d.style?.color || "#ff6d00";
      ctx.lineWidth = Math.max(1, (d.style?.lineWidth || 1) * hRatio);
      ctx.globalAlpha = d.isPreview ? 0.5 : 0.8;
      ctx.setLineDash([]);
      // A → B
      ctx.beginPath();
      ctx.moveTo(x0, yA);
      ctx.lineTo(x1, yB);
      ctx.stroke();
      // B → C
      ctx.beginPath();
      ctx.moveTo(x1, yB);
      ctx.lineTo(xC, yC);
      ctx.stroke();
      ctx.restore();
    }

    // Fallback color cycle for levels without per-level color
    const fallbackColors = ["#ffffff", "#ffc107", "#2ebd59", "#3796ff", "#9b59b6", "#ff6d00", "#e8383b", "#00d2d3"];

    // v10: fib_ext ABC geometry invalid → force every level line, fill, and
    //      label to muted grey so it's visually obvious the projection is
    //      geometrically unsound (math still runs — permissive per spec).
    const invalidFibExt = d.type === "fib_ext" && d.validAbc === false;
    const mutedColor = "#888888";

    const fontSize = Math.round(8 * vRatio);
    ctx.font = `${fontSize}px 'Courier New', monospace`;

    for (let i = 0; i < d.fibLevels.length; i++) {
      const fl = d.fibLevels[i];
      const y = Math.round(fl.y * vRatio);
      // Per-level color → drawing color override → fallback cycle
      const lineColor = invalidFibExt
        ? mutedColor
        : (fl.color || d.style.color || fallbackColors[i % fallbackColors.length]);

      // Fill zone between this level and next.
      // v11: only drawn when style.fibFill is explicitly true; defaults off.
      if (d.style?.fibFill === true && i < d.fibLevels.length - 1) {
        const nextY = Math.round(d.fibLevels[i + 1].y * vRatio);
        ctx.save();
        ctx.globalAlpha = invalidFibExt ? 0.02 : (d.isPreview ? 0.04 : 0.03);
        ctx.fillStyle = lineColor;
        ctx.fillRect(xStart, Math.min(y, nextY), fibWidth, Math.abs(nextY - y));
        ctx.restore();
      }

      // Level line
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = invalidFibExt ? 0.5 : (d.isPreview ? 0.4 : 0.7);
      ctx.setLineDash([4 * hRatio, 3 * hRatio]);
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
      ctx.stroke();
      ctx.restore();

      // Label
      ctx.save();
      ctx.globalAlpha = 0.85;
      const label = `${(fl.level * 100).toFixed(1)}%  ${fl.price.toFixed(2)}`;
      ctx.fillStyle = "#111";
      const tw = ctx.measureText(label).width;
      const pad = 2 * hRatio;
      ctx.fillRect(xEnd + pad, y - fontSize * 0.6, tw + pad * 2, fontSize * 1.3);
      ctx.fillStyle = lineColor;
      ctx.fillText(label, xEnd + pad * 2, y + fontSize * 0.35);
      ctx.restore();
    }

    // v10: "⚠ invalid ABC" badge near point C when geometry check failed.
    if (invalidFibExt && pts.length >= 3) {
      const xC = Math.round(pts[2].x * hRatio);
      const yC = Math.round(pts[2].y * vRatio);
      const badge = "⚠ invalid ABC";
      const bfs = Math.round(9 * vRatio);
      ctx.save();
      ctx.font = `${bfs}px 'Courier New', monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const bw = ctx.measureText(badge).width;
      const bpad = 3 * hRatio;
      const bx = xC + 8 * hRatio;
      const by = yC - bfs - 6 * vRatio;
      // Dark pill background for contrast
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#000";
      ctx.fillRect(bx - bpad, by - bfs * 0.7, bw + bpad * 2, bfs * 1.4);
      // Muted grey text
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = mutedColor;
      ctx.fillText(badge, bx, by);
      ctx.restore();
    }

    // Selection highlight — border around the entire fib zone
    if (selected) {
      const yTop = Math.round(d.fibLevels[0].y * vRatio);
      const yBot = Math.round(d.fibLevels[d.fibLevels.length - 1].y * vRatio);
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2 * hRatio;
      ctx.setLineDash([]);
      ctx.strokeRect(xStart, Math.min(yTop, yBot), fibWidth, Math.abs(yBot - yTop));
      ctx.restore();

      // Endpoint handles — one per anchor (2 for fib, 3 for fib_ext)
      ctx.save();
      ctx.globalAlpha = 0.9;
      const hs = 3 * hRatio;
      for (const p of pts) {
        const px = Math.round(p.x * hRatio);
        const py = Math.round(p.y * vRatio);
        ctx.fillRect(px - hs, py - hs, hs * 2, hs * 2);
      }
      ctx.restore();
    }
  }

  _drawPen(ctx, d, hRatio, vRatio, selected) {
    const pts = d.points;
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(Math.round(pts[0].x * hRatio), Math.round(pts[0].y * vRatio));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(Math.round(pts[i].x * hRatio), Math.round(pts[i].y * vRatio));
    }
    ctx.stroke();

    // Selection highlight
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = (d.style.lineWidth || 1) * hRatio + 4 * hRatio;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(Math.round(pts[0].x * hRatio), Math.round(pts[0].y * vRatio));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(Math.round(pts[i].x * hRatio), Math.round(pts[i].y * vRatio));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPosition(ctx, d, hRatio, vRatio, canvasW, selected) {
    // points[0]=entry, points[1]=SL, points[2]=TP
    const [pEntry, pSL, pTP] = d.points;
    const isLong = d.type === "position_long";
    const opacity = d.isPreview ? 0.4 : (d.style.opacity ?? 0.8);
    const lw = (d.style.lineWidth || 1) * hRatio;

    const entryY = Math.round(pEntry.y * vRatio);
    const slY = Math.round(pSL.y * vRatio);
    const tpY = Math.round(pTP.y * vRatio);
    const xL = Math.round(Math.min(pEntry.x, pSL.x) * hRatio);
    const xR = Math.round(Math.max(pEntry.x, pSL.x) * hRatio);
    const boxW = Math.max(xR - xL, 60 * hRatio);

    const greenColor = "#2ebd59";
    const redColor = "#e8383b";
    const entryColor = "#ff6d00";

    // ── Filled zones ──
    // Risk zone (Entry ↔ SL) — red
    ctx.save();
    ctx.globalAlpha = opacity * (d.isPreview ? 0.12 : 0.15);
    ctx.fillStyle = redColor;
    const riskTop = Math.min(entryY, slY);
    const riskH = Math.abs(slY - entryY);
    ctx.fillRect(xL, riskTop, boxW, riskH);
    ctx.restore();

    // Reward zone (Entry ↔ TP) — green
    ctx.save();
    ctx.globalAlpha = opacity * (d.isPreview ? 0.12 : 0.15);
    ctx.fillStyle = greenColor;
    const rewardTop = Math.min(entryY, tpY);
    const rewardH = Math.abs(tpY - entryY);
    ctx.fillRect(xL, rewardTop, boxW, rewardH);
    ctx.restore();

    // ── Border around full box ──
    ctx.save();
    ctx.globalAlpha = opacity * 0.3;
    ctx.strokeStyle = isLong ? greenColor : redColor;
    ctx.lineWidth = hRatio;
    ctx.setLineDash([]);
    const fullTop = Math.min(slY, tpY);
    const fullH = Math.abs(tpY - slY);
    ctx.strokeRect(xL, fullTop, boxW, fullH);
    ctx.restore();

    // ── Horizontal lines (contained within box) ──
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = lw;
    ctx.setLineDash([]);

    // Entry line (orange, solid)
    ctx.strokeStyle = entryColor;
    ctx.beginPath();
    ctx.moveTo(xL, entryY);
    ctx.lineTo(xL + boxW, entryY);
    ctx.stroke();

    // SL line (red, dashed)
    ctx.strokeStyle = redColor;
    ctx.setLineDash([4 * hRatio, 3 * hRatio]);
    ctx.beginPath();
    ctx.moveTo(xL, slY);
    ctx.lineTo(xL + boxW, slY);
    ctx.stroke();

    // TP line (green, dashed)
    ctx.strokeStyle = greenColor;
    ctx.beginPath();
    ctx.moveTo(xL, tpY);
    ctx.lineTo(xL + boxW, tpY);
    ctx.stroke();
    ctx.restore();

    // ── Labels ──
    const fontSize = Math.round(9 * vRatio);
    ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
    const pad = 3 * hRatio;
    const labelX = xL + boxW + pad;

    const prices = d.pricePoints;
    const entryPrice = prices?.[0]?.price;
    const slPrice = prices?.[1]?.price;
    const tpPrice = prices?.[2]?.price;

    // Entry label
    ctx.save();
    ctx.globalAlpha = 0.9;
    const entryText = `ENTRY ${entryPrice != null ? entryPrice.toFixed(2) : ""}`;
    const etw = ctx.measureText(entryText).width;
    ctx.fillStyle = "#111";
    ctx.fillRect(labelX, entryY - fontSize * 0.6, etw + pad * 2, fontSize * 1.3);
    ctx.fillStyle = entryColor;
    ctx.fillText(entryText, labelX + pad, entryY + fontSize * 0.35);
    ctx.restore();

    // SL label
    ctx.save();
    ctx.globalAlpha = 0.9;
    const slText = `SL ${slPrice != null ? slPrice.toFixed(2) : ""}`;
    const stw = ctx.measureText(slText).width;
    ctx.fillStyle = "#111";
    ctx.fillRect(labelX, slY - fontSize * 0.6, stw + pad * 2, fontSize * 1.3);
    ctx.fillStyle = redColor;
    ctx.fillText(slText, labelX + pad, slY + fontSize * 0.35);
    ctx.restore();

    // TP label
    ctx.save();
    ctx.globalAlpha = 0.9;
    const tpText = `TP ${tpPrice != null ? tpPrice.toFixed(2) : ""}`;
    const ttw = ctx.measureText(tpText).width;
    ctx.fillStyle = "#111";
    ctx.fillRect(labelX, tpY - fontSize * 0.6, ttw + pad * 2, fontSize * 1.3);
    ctx.fillStyle = greenColor;
    ctx.fillText(tpText, labelX + pad, tpY + fontSize * 0.35);
    ctx.restore();

    // ── R:R label in reward zone ──
    if (entryPrice != null && slPrice != null && tpPrice != null) {
      const risk = Math.abs(entryPrice - slPrice);
      const reward = Math.abs(tpPrice - entryPrice);
      const rr = risk > 0 ? (reward / risk).toFixed(1) : "∞";
      const rrText = `${rr}:1 R:R`;
      ctx.save();
      ctx.font = `bold ${Math.round(11 * vRatio)}px 'Courier New', monospace`;
      ctx.globalAlpha = opacity * 0.9;
      ctx.fillStyle = isLong ? greenColor : redColor;
      const rrW = ctx.measureText(rrText).width;
      const rrX = xL + (boxW - rrW) / 2;
      const rrY = (entryY + tpY) / 2 + fontSize * 0.35;
      // Background
      ctx.fillStyle = "#111";
      ctx.globalAlpha = 0.7;
      ctx.fillRect(rrX - pad, rrY - fontSize * 1.0, rrW + pad * 2, fontSize * 1.4);
      ctx.globalAlpha = opacity * 0.95;
      ctx.fillStyle = isLong ? greenColor : redColor;
      ctx.fillText(rrText, rrX, rrY);
      ctx.restore();
    }

    // ── Selection highlight ──
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2 * hRatio;
      ctx.strokeStyle = isLong ? greenColor : redColor;
      ctx.setLineDash([]);
      ctx.strokeRect(xL - 2 * hRatio, fullTop - 2 * vRatio, boxW + 4 * hRatio, fullH + 4 * vRatio);
      ctx.restore();

      // Drag handles on each line (middle of box)
      ctx.save();
      ctx.globalAlpha = 0.9;
      const hs = 4 * hRatio;
      const hx = xL + boxW / 2;
      ctx.fillStyle = entryColor;
      ctx.fillRect(hx - hs, entryY - hs, hs * 2, hs * 2);
      ctx.fillStyle = redColor;
      ctx.fillRect(hx - hs, slY - hs, hs * 2, hs * 2);
      ctx.fillStyle = greenColor;
      ctx.fillRect(hx - hs, tpY - hs, hs * 2, hs * 2);

      // Right-edge width handle (vertical bar)
      const rEdge = xL + boxW;
      const midY = (fullTop + fullTop + fullH) / 2;
      ctx.fillStyle = isLong ? greenColor : redColor;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(rEdge - 2 * hRatio, midY - 12 * vRatio, 4 * hRatio, 24 * vRatio);
      // Small arrows ◀▶
      ctx.globalAlpha = 0.9;
      ctx.font = `${Math.round(8 * vRatio)}px 'Courier New', monospace`;
      ctx.fillText("◀▶", rEdge - 6 * hRatio, midY + 3 * vRatio);
      ctx.restore();
    }
  }
}