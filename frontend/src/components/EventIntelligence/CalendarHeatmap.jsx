// version: v3
// CalendarHeatmap — currency × trading-day grid.
// v3 — downsized to fit a ~25% column on the 1×4 hero row. Cell widths are
//      auto-distributed via table-layout: fixed (no minWidth), the legend
//      blurb is dropped, and fonts/padding are tightened so 9 currencies ×
//      10 weekdays read cleanly even at quarter-screen width.
// v2 — 2× fonts, bigger cells.

import { useMemo, useState } from "react";
import { C, mono } from "./theme";
import { heatmapData, dayKey, weekdayShort, shortDayLabel } from "./utils";
import { currencyMeta } from "./dictionaries";

function intensityColor(weight, max) {
  if (!weight) return "transparent";
  const norm = Math.min(1, weight / Math.max(1, max));
  const a = 0.10 + norm * 0.85;
  return `rgba(255, 109, 0, ${a.toFixed(2)})`;
}

export default function CalendarHeatmap({ upcoming, windowDays = 14, onCellClick }) {
  const { days, rows } = useMemo(() => heatmapData(upcoming, windowDays), [upcoming, windowDays]);
  const [hovered, setHovered] = useState(null);

  const maxWeight = useMemo(() => {
    let m = 0;
    for (const r of rows) for (const dk of Object.keys(r.byDay)) {
      if (r.byDay[dk].weight > m) m = r.byDay[dk].weight;
    }
    return m;
  }, [rows]);

  const todayKey = dayKey(new Date());

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, padding: "10px 12px",
      fontFamily: mono, color: C.white,
    }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{
          fontSize: 14, color: C.gray, fontWeight: 700, letterSpacing: "1.5px",
          textTransform: "uppercase",
        }}>Next {windowDays} Trading Days</span>
      </div>

      <table style={{
        borderCollapse: "collapse", fontFamily: mono,
        width: "100%", tableLayout: "fixed",
      }}>
        <thead>
          <tr>
            <th style={{
              width: 36, textAlign: "left", padding: "4px 4px",
              color: C.muted, fontWeight: 700, fontSize: 9, letterSpacing: "0.5px",
            }}>CCY</th>
            {days.map(d => {
              const dk = dayKey(d);
              const isToday = dk === todayKey;
              return (
                <th key={dk} style={{
                  padding: "3px 0",
                  color: isToday ? C.orange : C.muted,
                  fontWeight: isToday ? 800 : 700,
                  letterSpacing: "0.5px",
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 9,
                  lineHeight: 1.1,
                }}>
                  <div>{weekdayShort(d)}</div>
                  <div style={{ fontVariantNumeric: "tabular-nums", color: isToday ? C.orange : C.gray, fontSize: 9 }}>
                    {shortDayLabel(d)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const meta = currencyMeta(r.code);
            return (
              <tr key={r.code}>
                <td style={{
                  padding: "3px 4px",
                  color: meta?.color || C.gray,
                  fontWeight: 800, letterSpacing: "0.5px",
                  fontSize: 11, borderRight: `1px solid ${C.border}`,
                }}>{r.code}</td>
                {days.map(d => {
                  const dk = dayKey(d);
                  const cell = r.byDay[dk] || { count: 0, weight: 0 };
                  const isHover = hovered && hovered.dk === dk && hovered.code === r.code;
                  const isToday = dk === todayKey;
                  return (
                    <td key={dk}
                      onMouseEnter={() => setHovered({ dk, code: r.code, cell })}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => cell.count > 0 && onCellClick && onCellClick({ dayKey: dk, currency: r.code })}
                      style={{
                        height: 26, padding: 0,
                        textAlign: "center",
                        background: intensityColor(cell.weight, maxWeight),
                        cursor: cell.count > 0 ? "pointer" : "default",
                        outline: isToday ? `1px dashed ${C.orange}55` : isHover ? `1px solid ${C.orange}` : "none",
                        fontVariantNumeric: "tabular-nums",
                        color: cell.count > 0 ? C.white : C.dim,
                        fontWeight: 700, fontSize: 11,
                      }}
                      title={cell.count > 0 ? `${r.code} · ${dk} · ${cell.count} event${cell.count === 1 ? "" : "s"} (impact weight ${cell.weight})` : ""}
                    >
                      {cell.count > 0 ? cell.count : "·"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
