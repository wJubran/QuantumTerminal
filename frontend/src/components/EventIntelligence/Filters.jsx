// version: v2
// Filters — currency + impact + range + view. v2: 2× fonts.

import { C, mono } from "./theme";
import { CURRENCY_META } from "./dictionaries";

const IMPACTS = [
  { id: "high",   label: "High",   color: C.red    },
  { id: "medium", label: "Med",    color: C.amber  },
  { id: "low",    label: "Low",    color: C.gray   },
];
const RANGES = [
  { id: "7",  label: "7d"  },
  { id: "14", label: "14d" },
  { id: "30", label: "30d" },
  { id: "all", label: "ALL"},
];

function Pill({ active, color, onClick, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "8px 16px",
        background: active ? `${color}22` : "transparent",
        border: `1px solid ${active ? color : C.border}`,
        color: active ? color : C.muted,
        fontSize: 16, fontWeight: 700, letterSpacing: "1.5px",
        fontFamily: mono, cursor: "pointer",
        textTransform: "uppercase",
      }}
    >{children}</button>
  );
}

export default function Filters({ filters, setFilters, viewMode, setViewMode, dayFilter, setDayFilter }) {
  const toggle = (set, value) => {
    const out = new Set(set);
    if (out.has(value)) out.delete(value); else out.add(value);
    return out;
  };

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 14,
      fontFamily: mono, color: C.white,
    }}>
      <div style={{ fontSize: 20, color: C.gray, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>
        Filters
      </div>

      {dayFilter && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 16px",
          background: `${C.orange}10`, border: `1px solid ${C.orange}55`,
          fontSize: 16, color: C.orange, fontWeight: 700, letterSpacing: "1.2px",
        }}>
          <span style={{ flex: 1 }}>
            FILTER: {dayFilter.currency} on {dayFilter.dayKey}
          </span>
          <button onClick={() => setDayFilter(null)} style={{
            background: "transparent", border: `1px solid ${C.orange}`,
            color: C.orange, padding: "4px 12px", fontSize: 14, fontFamily: mono,
            cursor: "pointer", letterSpacing: "1.5px", fontWeight: 700,
          }}>CLEAR</button>
        </div>
      )}

      {/* Currency */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px", marginRight: 6, minWidth: 56 }}>CCY</span>
        <Pill
          active={filters.currencies.size === 0}
          color={C.orange}
          onClick={() => setFilters({ ...filters, currencies: new Set() })}
        >ALL</Pill>
        {CURRENCY_META.map(m => (
          <Pill
            key={m.code}
            active={filters.currencies.has(m.code)}
            color={m.color}
            onClick={() => setFilters({ ...filters, currencies: toggle(filters.currencies, m.code) })}
          >{m.code}</Pill>
        ))}
      </div>

      {/* Impact */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px", marginRight: 6, minWidth: 56 }}>IMPACT</span>
        <Pill
          active={filters.impacts.size === 0}
          color={C.orange}
          onClick={() => setFilters({ ...filters, impacts: new Set() })}
        >ALL</Pill>
        {IMPACTS.map(im => (
          <Pill
            key={im.id}
            active={filters.impacts.has(im.id)}
            color={im.color}
            onClick={() => setFilters({ ...filters, impacts: toggle(filters.impacts, im.id) })}
          >{im.label}</Pill>
        ))}
      </div>

      {/* Range + view */}
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px", marginRight: 6, minWidth: 56 }}>RANGE</span>
          {RANGES.map(r => (
            <Pill key={r.id}
              active={filters.range === r.id}
              color={C.cyan}
              onClick={() => setFilters({ ...filters, range: r.id })}
            >{r.label}</Pill>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: "1.5px", marginRight: 6 }}>VIEW</span>
          <Pill active={viewMode === "cards"} color={C.orange} onClick={() => setViewMode("cards")}>CARDS</Pill>
          <Pill active={viewMode === "list"}  color={C.orange} onClick={() => setViewMode("list")}>LIST</Pill>
        </div>
      </div>
    </div>
  );
}
