/**
 * TradeHistoryPrimitive.js — LWC v5 ISeriesPrimitive for closed trade markers.
 * Quantum Terminal
 *
 * Renders entry/exit markers for closed trades with a connecting dashed line.
 * Entry: arrow (▲ BUY / ▼ SELL), Exit: × marker.
 * Color: configurable per direction (buy_color, sell_color) via setStyles().
 * Attached to candlestick series via series.attachPrimitive().
 */

const DEFAULTS = { buy_color: "#2ebd59", sell_color: "#e8383b", opacity: 0.7 };

export class TradeHistoryPrimitive {
  _trades = [];
  _styles = { ...DEFAULTS };
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

  setTrades(trades) {
    this._trades = trades || [];
    if (this._requestUpdate) this._requestUpdate();
  }

  setStyles(styles) {
    this._styles = { ...DEFAULTS, ...styles };
    if (this._requestUpdate) this._requestUpdate();
  }

  paneViews() {
    return [new TradeHistoryView(this)];
  }
}

class TradeHistoryView {
  constructor(source) { this._source = source; }
  zOrder() { return "top"; }

  renderer() {
    const source = this._source;
    return {
      draw(target) {
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          const chart = source._chart;
          const series = source._series;
          if (!chart || !series || !source._trades.length) return;
          const ts = chart.timeScale();
          const st = source._styles;

          for (const t of source._trades) {
            const x1 = ts.timeToCoordinate(t.openTime);
            const x2 = ts.timeToCoordinate(t.closeTime);
            const y1 = series.priceToCoordinate(t.openPrice);
            const y2 = series.priceToCoordinate(t.closePrice);

            // Skip if both points off-screen
            if ((x1 === null || x1 < -40 || x1 > mediaSize.width + 40) &&
                (x2 === null || x2 < -40 || x2 > mediaSize.width + 40)) continue;

            const isLong = t.direction === "BUY";
            const color = isLong ? st.buy_color : st.sell_color;

            ctx.save();
            ctx.globalAlpha = st.opacity;

            // ── Connecting line (dashed) ──
            if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            // ── Entry arrow ──
            if (x1 !== null && y1 !== null) {
              const sz = 6;
              ctx.fillStyle = color;
              ctx.beginPath();
              if (isLong) {
                ctx.moveTo(x1, y1 + 4);
                ctx.lineTo(x1 - sz * 0.6, y1 + 4 + sz);
                ctx.lineTo(x1 + sz * 0.6, y1 + 4 + sz);
              } else {
                ctx.moveTo(x1, y1 - 4);
                ctx.lineTo(x1 - sz * 0.6, y1 - 4 - sz);
                ctx.lineTo(x1 + sz * 0.6, y1 - 4 - sz);
              }
              ctx.closePath();
              ctx.fill();

              // Entry label
              ctx.font = "bold 7px 'Courier New', monospace";
              ctx.textAlign = "center";
              ctx.fillStyle = color;
              const labelY = isLong ? y1 + 4 + sz + 9 : y1 - 4 - sz - 3;
              ctx.fillText(isLong ? "BUY" : "SELL", x1, labelY);
            }

            // ── Exit × marker ──
            if (x2 !== null && y2 !== null) {
              const xSz = 4;
              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(x2 - xSz, y2 - xSz);
              ctx.lineTo(x2 + xSz, y2 + xSz);
              ctx.moveTo(x2 + xSz, y2 - xSz);
              ctx.lineTo(x2 - xSz, y2 + xSz);
              ctx.stroke();

              // P&L label
              ctx.font = "bold 7px 'Courier New', monospace";
              ctx.textAlign = "center";
              ctx.fillStyle = color;
              const pnlStr = (t.profit >= 0 ? "+" : "") + t.profit.toFixed(2);
              ctx.fillText(pnlStr, x2, y2 - xSz - 4);
            }

            ctx.restore();
          }
        });
      },
    };
  }
}

export default TradeHistoryPrimitive;