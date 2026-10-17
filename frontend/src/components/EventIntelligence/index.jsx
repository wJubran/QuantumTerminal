// version: v7
// EventIntelligence — top-level composing component.
// v7 — All four blocks (3 hero cards + 14-day heatmap) now sit on a
//      single 1×4 row. Hero cards back to horizontal, heatmap to the
//      right of them. CalendarHeatmap downsized in v3 to fit ~25%
//      width without horizontal scroll.
// v6 — Hero strip and 14-trading-day heatmap now sit side-by-side in a
//      50/50 grid instead of stacking vertically. Hero cards stack
//      vertically inside the left column so each one keeps a readable
//      width. Cuts the page's vertical footprint in half on wide screens.
// v5 — All "is upcoming?" filters now pass the full event object to
//      eventDate / withinRangeDays so utils.js v2 can read ev.time.
//      Without this, today's evening events (6 PM FOMC) were being
//      stamped at the 8:30 AM default and dropped as past once midday
//      hit. Fixes: today's events visible all day until their actual
//      release time.
//
//
// v3 changes:
//   - Added a TRUMP button in the StatusBar (right of the next-major
//     countdown). Opens TrumpNewsToast: a right-anchored sliding panel
//     showing live Trump-related headlines pulled from Google News RSS
//     via Electron main-process IPC (renderer can't fetch directly due
//     to CORS). Cached 5 min in main; manual REFRESH bypasses cache.
//
// v2 changes (per operator feedback 2026-04-27):
//   - All inline font sizes ~2× v1 ("everything seems so small to read").
//   - News feed swapped from upstream-pending placeholder to a fully client-
//     side generator (NewsFeed.jsx) that synthesises insights from the
//     existing calendar data — IMMINENT alerts, today's agenda, cluster
//     warnings, surprise spotlights, currency hot/cold streaks, event
//     spotlights. No server dependency.

import { useState, useMemo, useEffect } from "react";
import { C, mono } from "./theme";
import HeroCard from "./HeroCard";
import CalendarHeatmap from "./CalendarHeatmap";
import Filters from "./Filters";
import SurpriseScoreboard from "./SurpriseScoreboard";
import EventCard from "./EventCard";
import NewsFeed from "./NewsFeed";
import TrumpNewsToast from "./TrumpNewsToast";
import TrumpHairIcon from "./TrumpHairIcon";
import { countdown, eventDate, withinRangeDays, passesFilters, dayKey } from "./utils";
import { currencyMeta } from "./dictionaries";

// ── Compact list mode ────────────────────────────────────────────────────
function CompactList({ items, kind }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ color: C.muted, fontSize: 16, padding: 22, textAlign: "center", fontFamily: mono }}>
        No events match the current filter.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {/* Header */}
      <div style={{
        display: "flex", gap: 14, padding: "8px 12px",
        background: C.bg3, borderBottom: `1px solid ${C.border}`,
        fontSize: 14, color: C.muted, letterSpacing: "1.8px", fontFamily: mono,
      }}>
        <span style={{ width: 130 }}>{kind === "upcoming" ? "COUNTDOWN" : "DATE"}</span>
        <span style={{ width: 56 }}>CCY</span>
        <span style={{ width: 24 }}>!</span>
        <span style={{ flex: 1 }}>EVENT</span>
        {kind === "recent" && <span style={{ width: 90, textAlign: "right" }}>ACTUAL</span>}
        <span style={{ width: 90, textAlign: "right" }}>FORECAST</span>
        <span style={{ width: 90, textAlign: "right" }}>PREVIOUS</span>
        {kind === "recent" && <span style={{ width: 90, textAlign: "right" }}>SURPRISE</span>}
      </div>
      {items.map((ev, i) => {
        const cd = countdown(ev);
        const meta = currencyMeta(ev.currency);
        const cdColor =
          cd.kind === "now"     ? C.orange :
          cd.kind === "minutes" ? C.red    :
          cd.kind === "hours"   ? C.amber  :
          cd.kind === "days"    ? C.cyan   : C.muted;
        const sp = ev.surprise_pct;
        const spColor = !Number.isFinite(sp) ? C.muted : sp > 0 ? C.green : C.red;
        const impactCol =
          (ev.impact || "").toLowerCase() === "high"   ? C.red    :
          (ev.impact || "").toLowerCase() === "medium" ? C.amber  : C.gray;
        return (
          <div key={i} style={{
            display: "flex", gap: 14, padding: "10px 12px",
            borderBottom: `1px solid ${C.border}07`,
            fontSize: 16, fontFamily: mono, color: C.white,
            fontVariantNumeric: "tabular-nums",
          }}>
            <span style={{ width: 130, color: cdColor, fontWeight: 700 }}>
              {kind === "upcoming" ? cd.primary : ev.date?.slice(5)}
            </span>
            <span style={{ width: 56, color: meta?.color || C.gray, fontWeight: 800, letterSpacing: "1.2px" }}>
              {ev.currency}
            </span>
            <span style={{ width: 24, color: impactCol, fontWeight: 700, textAlign: "center" }}>●</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ev.event}
            </span>
            {kind === "recent" && (
              <span style={{ width: 90, textAlign: "right", color: C.white, fontWeight: 700 }}>
                {ev.actual ?? "—"}
              </span>
            )}
            <span style={{ width: 90, textAlign: "right", color: C.orange }}>{ev.forecast ?? "—"}</span>
            <span style={{ width: 90, textAlign: "right", color: C.muted }}>{ev.previous ?? "—"}</span>
            {kind === "recent" && (
              <span style={{ width: 90, textAlign: "right", color: spColor, fontWeight: 700 }}>
                {Number.isFinite(sp) ? `${sp > 0 ? "+" : ""}${sp.toFixed(1)}%` : "—"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────────────────────
function StatusBar({ todayCount, weekCount, hero, onTrumpClick }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cd = hero ? countdown(hero.date) : null;
  const cdColor = !cd ? C.muted :
    cd.kind === "minutes" ? C.red :
    cd.kind === "hours"   ? C.amber :
    cd.kind === "days"    ? C.cyan : C.gray;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap",
      padding: "14px 20px", background: C.bg3, border: `1px solid ${C.border}`,
      fontFamily: mono, fontSize: 18, color: C.gray,
    }}>
      <span style={{ color: C.orange, fontWeight: 800, letterSpacing: "2.5px", fontSize: 20 }}>
        EVENT INTELLIGENCE
      </span>
      <span style={{ color: C.border2 }}>|</span>
      <span>Today: <span style={{ color: C.white, fontWeight: 700 }}>{todayCount}</span></span>
      <span>This week: <span style={{ color: C.white, fontWeight: 700 }}>{weekCount}</span></span>
      <span style={{ color: C.border2 }}>|</span>
      {hero ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: C.muted, letterSpacing: "1.5px" }}>NEXT MAJOR:</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{hero.currency}</span>
          <span style={{ color: C.gray }}>{hero.event}</span>
          <span style={{
            padding: "4px 14px", background: `${cdColor}18`, border: `1px solid ${cdColor}55`,
            color: cdColor, fontWeight: 800, fontVariantNumeric: "tabular-nums",
          }}>{cd.primary}</span>
        </span>
      ) : (
        <span style={{ color: C.muted }}>No upcoming high-impact events in window.</span>
      )}

      <div style={{ flex: 1 }} />

      {/* v3: TRUMP news button — opens the right-side toast panel.
           v4: 🇺🇸 emoji replaced with a yellow hair silhouette SVG. */}
      <button
        onClick={onTrumpClick}
        title="Live Trump headlines from Google News"
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "8px 16px",
          background: `${C.red}18`,
          border: `1px solid ${C.red}66`,
          color: C.red, fontFamily: mono, fontSize: 16, fontWeight: 800,
          letterSpacing: "2px", cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${C.red}28`; }}
        onMouseLeave={e => { e.currentTarget.style.background = `${C.red}18`; }}
      >
        <TrumpHairIcon width={28} />
        TRUMP
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function EventIntelligence({ calendar }) {
  const upcomingAll = calendar?.upcoming || [];
  const recentAll   = calendar?.recent_surprises || [];

  const [filters, setFilters] = useState({
    currencies: new Set(),
    impacts:    new Set(),
    range:      "14",
  });
  const [viewMode, setViewMode] = useState("cards");
  const [dayFilter, setDayFilter] = useState(null);
  const [showTrumpToast, setShowTrumpToast] = useState(false);  // v3

  const rangeDays = filters.range === "all" ? 365 : parseInt(filters.range, 10);

  const upcoming = useMemo(() => {
    return upcomingAll.filter(ev => {
      if (!withinRangeDays(ev, rangeDays)) return false;
      if (!passesFilters(ev, filters)) return false;
      if (dayFilter) {
        if (ev.date !== dayFilter.dayKey) return false;
        if ((ev.currency || "").toUpperCase() !== dayFilter.currency) return false;
      }
      return true;
    });
  }, [upcomingAll, filters, rangeDays, dayFilter]);

  const recent = useMemo(() => {
    return recentAll.filter(ev => {
      if (!withinRangeDays(ev, rangeDays)) return false;
      if (!passesFilters(ev, filters)) return false;
      if (dayFilter) {
        if (ev.date !== dayFilter.dayKey) return false;
        if ((ev.currency || "").toUpperCase() !== dayFilter.currency) return false;
      }
      return true;
    });
  }, [recentAll, filters, rangeDays, dayFilter]);

  const heroEvents = useMemo(() => {
    const sortByDate = (a, b) => String(a.date).localeCompare(String(b.date));
    const future = upcoming
      .filter(ev => {
        const d = eventDate(ev);
        return d && d.getTime() >= Date.now() - 60 * 60 * 1000;
      })
      .sort(sortByDate);
    const high = future.filter(e => (e.impact || "").toLowerCase() === "high");
    const med  = future.filter(e => (e.impact || "").toLowerCase() === "medium");
    return [...high, ...med, ...future].slice(0, 3);
  }, [upcoming]);

  const today = dayKey(new Date());
  const todayCount = useMemo(
    () => upcomingAll.filter(ev => ev.date === today).length,
    [upcomingAll, today]
  );
  const weekCount = useMemo(
    () => upcomingAll.filter(ev => withinRangeDays(ev, 7) && eventDate(ev) >= new Date()).length,
    [upcomingAll]
  );

  const handleHeatmapCellClick = ({ dayKey: dk, currency }) => {
    setDayFilter({ dayKey: dk, currency });
  };
  const handleScoreboardCurrencyClick = (code) => {
    const set = new Set(filters.currencies);
    if (set.has(code)) set.delete(code); else set.add(code);
    setFilters({ ...filters, currencies: set });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <StatusBar
        todayCount={todayCount}
        weekCount={weekCount}
        hero={heroEvents[0]}
        onTrumpClick={() => setShowTrumpToast(true)}
      />

      <TrumpNewsToast
        open={showTrumpToast}
        onClose={() => setShowTrumpToast(false)}
      />

      {/* v7: 1×4 row — 3 hero cards + heatmap, equal columns */}
      {heroEvents.length === 0 ? (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`,
          padding: "40px 22px", textAlign: "center",
          fontFamily: mono, fontSize: 18, color: C.muted,
        }}>
          No upcoming events match the current filter window.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 16, alignItems: "stretch",
        }}>
          {heroEvents.map((ev, i) => (
            <HeroCard key={`${ev.date}-${ev.event}-${i}`} ev={ev} allRecent={recentAll} />
          ))}
          {Array.from({ length: Math.max(0, 3 - heroEvents.length) }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          <CalendarHeatmap upcoming={upcomingAll} windowDays={14} onCellClick={handleHeatmapCellClick} />
        </div>
      )}

      {/* FILTERS + SCOREBOARD */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 16 }}>
        <Filters
          filters={filters} setFilters={setFilters}
          viewMode={viewMode} setViewMode={setViewMode}
          dayFilter={dayFilter} setDayFilter={setDayFilter}
        />
        <SurpriseScoreboard
          recentSurprises={recentAll}
          days={30}
          onCurrencyClick={handleScoreboardCurrencyClick}
        />
      </div>

      {/* EVENTS BODY: cards/list (left) + news rail (right) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 16 }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Upcoming */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 20, color: C.gray, fontWeight: 700, letterSpacing: "2px",
              textTransform: "uppercase", fontFamily: mono,
            }}>
              Upcoming · {upcoming.filter(ev => eventDate(ev) >= new Date()).length}
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {viewMode === "cards" ? (
            upcoming.filter(ev => eventDate(ev) >= new Date()).length === 0 ? (
              <div style={{ color: C.muted, fontSize: 16, padding: 22, textAlign: "center", fontFamily: mono }}>
                No upcoming events in the current filter.
              </div>
            ) : (
              upcoming
                .filter(ev => eventDate(ev) >= new Date())
                .map((ev, i) => (
                  <EventCard key={`up-${ev.date}-${ev.event}-${i}`}
                    ev={ev} kind="upcoming" allRecent={recentAll} />
                ))
            )
          ) : (
            <CompactList items={upcoming.filter(ev => eventDate(ev) >= new Date())} kind="upcoming" />
          )}

          {/* Recent */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span style={{
              fontSize: 20, color: C.gray, fontWeight: 700, letterSpacing: "2px",
              textTransform: "uppercase", fontFamily: mono,
            }}>
              Recent · {recent.length}
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {viewMode === "cards" ? (
            recent.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 16, padding: 22, textAlign: "center", fontFamily: mono }}>
                No recent prints in the current filter.
              </div>
            ) : (
              [...recent].reverse().slice(0, 30).map((ev, i) => (
                <EventCard key={`rc-${ev.date}-${ev.event}-${i}`}
                  ev={ev} kind="recent" allRecent={recentAll} />
              ))
            )
          ) : (
            <CompactList items={[...recent].reverse()} kind="recent" />
          )}
        </div>

        {/* Right rail: client-generated news + insights */}
        <div>
          <NewsFeed calendar={calendar} filters={filters} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        fontSize: 14, color: C.muted, letterSpacing: "0.5px",
        padding: "8px 12px", fontFamily: mono,
      }}>
        {(calendar?.total_events_stored || 0).toLocaleString()} total events stored ·
        Surprise = (Actual − Forecast) / |Forecast| × 100 ·
        Countdowns assume 08:30 release time (server data ships dates only)
      </div>
    </div>
  );
}
