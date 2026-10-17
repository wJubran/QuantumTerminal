/**
 * SignalMarkersPrimitive.js — LWC v5 ISeriesPrimitive for signal arrow markers.
 * Quantum Terminal
 *
 * Renders signal arrows (FADE, BKOUT, CONV, DRIFT, ANCHR, REGM) on the chart canvas.
 * Attached to the candlestick series via series.attachPrimitive().
 *
 * LWC v5 removed setMarkers() from the series API, so this custom primitive
 * replaces that functionality with full control over arrow shape, labels,
 * and confidence dots.
 */

export class SignalMarkersPrimitive {
  _markers = [];
  _chart = null;
  _series = null;
  _requestUpdate = null;

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

  setMarkers(markers) {
    this._markers = markers || [];
    if (this._requestUpdate) this._requestUpdate();
  }

  paneViews() {
    return [new SignalMarkersView(this)];
  }
}

class SignalMarkersView {
  constructor(source) { this._source = source; }

  zOrder() { return "top"; }

  renderer() {
    const source = this._source;
    return {
      draw(target) {
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          const chart = source._chart;
          const series = source._series;
          if (!chart || !series || !source._markers.length) return;
          const ts = chart.timeScale();

          for (const m of source._markers) {
            const x = ts.timeToCoordinate(m.time);
            if (x === null || x < -20 || x > mediaSize.width + 20) continue;
            const basePrice = m.direction === "long" ? m.low : m.high;
            const y = series.priceToCoordinate(basePrice);
            if (y === null) continue;

            const isLong = m.direction === "long";
            const size = 7;
            const gap = 5;
            const alpha = m.opacity ?? 1.0;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Arrow triangle
            ctx.fillStyle = m.color;
            ctx.beginPath();
            if (isLong) {
              const tip = y + gap;
              ctx.moveTo(x, tip);
              ctx.lineTo(x - size * 0.6, tip + size);
              ctx.lineTo(x + size * 0.6, tip + size);
            } else {
              const tip = y - gap;
              ctx.moveTo(x, tip);
              ctx.lineTo(x - size * 0.6, tip - size);
              ctx.lineTo(x + size * 0.6, tip - size);
            }
            ctx.closePath();
            ctx.fill();

            // Label
            if (m.label) {
              ctx.font = "bold 7px 'Courier New', monospace";
              ctx.textAlign = "center";
              ctx.fillStyle = m.color;
              const labelY = isLong ? y + gap + size + 9 : y - gap - size - 3;
              ctx.fillText(m.label, x, labelY);
            }

            // Confidence dot
            if (m.confidence != null && m.confidence > 0) {
              const dotY = isLong ? y + gap + size + 14 : y - gap - size - 10;
              const dotR = 1.5 + m.confidence * 2;
              ctx.beginPath();
              ctx.arc(x, dotY, dotR, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          }
        });
      },
    };
  }
}

export default SignalMarkersPrimitive;
