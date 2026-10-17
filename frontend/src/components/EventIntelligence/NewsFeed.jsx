// version: v2
// v2 — Pass full event objects to eventDate / countdown so the per-event
//      `time` is honored. Was reading 8:30 AM for every event regardless
//      of release time, which made today-PM events vanish from IMMINENT
//      after 8:30 AM and produced the wrong countdown headline.
// NewsFeed — client-side news generator. No upstream dependency. Reads the
// existing calendar (upcoming + recent_surprises) and synthesises insight
// items: IMMINENT alerts, agenda summary, cluster warnings, surprise
// spotlights, hot/cold streaks, and event spotlights. Filters by the
// central currency selector when one is active.

import { useMemo } from "react";
import { C, mono } from "./theme";
import { countdown, eventDate, eventHistory, scoreboardByCurrency, dayKey } from "./utils";

// ── Generator ────────────────────────────────────────────────────────────
function generateNewsItems(calendar, base = new Date()) {
  const items = [];
  const upcoming = calendar?.upcoming || [];
  const recent   = calendar?.recent_surprises || [];

  // 1. IMMINENT — events in next ~6 hours, high-impact
  const futureUpcoming = upcoming
    .map(ev => ({ ...ev, _t: eventDate(ev)?.getTime() || 0 }))
    .filter(ev => ev._t > base.getTime() - 60 * 60 * 1000)
    .sort((a, b) => a._t - b._t);

  for (const ev of futureUpcoming) {
    if (ev._t - base.getTime() > 6 * 3600 * 1000) break;
    if ((ev.impact || "").toLowerCase() !== "high") continue;
    const cd = countdown(ev, base);
    const hist = eventHistory(recent, ev.event, ev.currency, 3);
    const recentTrend = hist.reduce((s, h) => s + ((Number(h.surprise_pct) || 0) > 0 ? 1 : -1), 0);
    const trendLine =
      hist.length >= 2 && Math.abs(recentTrend) >= 2
        ? (recentTrend > 0 ? "Last 3 prints trended hot." : "Last 3 prints trended cool.")
        : hist.length >= 2 ? "Recent prints have been mixed." : "";
    items.push({
      id: `imminent-${ev.currency}-${ev.event}`,
      kind: "imminent",
      emoji: "🔥",
      badge: "IMMINENT",
      title: `${ev.currency} ${ev.event} in ${cd.primary}`,
      body: [
        `Forecast ${ev.forecast || "—"}, previous ${ev.previous || "—"}.`,
        trendLine,
      ].filter(Boolean),
      currency: ev.currency,
      ts: ev._t,
    });
    if (items.filter(i => i.kind === "imminent").length >= 3) break;
  }

  // 2. AGENDA — today's lineup summary
  const todayKey = dayKey(base);
  const todayEvents = upcoming.filter(ev => ev.date === todayKey);
  if (todayEvents.length > 0) {
    const high = todayEvents.filter(e => (e.impact || "").toLowerCase() === "high").length;
    const med  = todayEvents.filter(e => (e.impact || "").toLowerCase() === "medium").length;
    const low  = todayEvents.length - high - med;
    const ccys = [...new Set(todayEvents.map(e => e.currency))].filter(Boolean).sort();
    items.push({
      id: "agenda-today",
      kind: "agenda",
      emoji: "📅",
      badge: "TODAY",
      title: `${todayEvents.length} events today`,
      body: [
        `${high} high · ${med} medium · ${low} low.`,
        ccys.length > 0 ? `Currencies in play: ${ccys.join(", ")}.` : "",
      ].filter(Boolean),
      ts: base.getTime(),
    });
  }

  // 3. CLUSTER — any future day with 3+ high-impact for one currency
  const clusters = new Map();
  for (const ev of upcoming) {
    if ((ev.impact || "").toLowerCase() !== "high") continue;
    const t = eventDate(ev)?.getTime() || 0;
    if (t < base.getTime() - 60 * 60 * 1000) continue;
    if (t > base.getTime() + 14 * 86400 * 1000) continue;
    const k = `${ev.date}|${ev.currency}`;
    if (!clusters.has(k)) clusters.set(k, { date: ev.date, currency: ev.currency, count: 0, events: [], t });
    const c = clusters.get(k);
    c.count += 1;
    c.events.push(ev.event);
  }
  for (const [, c] of clusters) {
    if (c.count < 3) continue;
    items.push({
      id: `cluster-${c.date}-${c.currency}`,
      kind: "cluster",
      emoji: "⚠️",
      badge: "CLUSTER",
      title: `${c.currency} wall on ${c.date}`,
      body: [
        `${c.count} high-impact prints stacked on the same day:`,
        c.events.slice(0, 3).join("  ·  ") + (c.events.length > 3 ? "  …" : ""),
        "Expect wider ranges and possible whipsaws.",
      ],
      currency: c.currency,
      ts: c.t,
    });
  }

  // 4. SURPRISE — top notable surprises last 7 days, |%| >= 15
  const cutoff = base.getTime() - 7 * 86400 * 1000;
  const notable = recent
    .filter(e => Math.abs(Number(e.surprise_pct) || 0) >= 15)
    .filter(e => (eventDate(e)?.getTime() || 0) >= cutoff)
    .sort((a, b) => Math.abs(Number(b.surprise_pct) || 0) - Math.abs(Number(a.surprise_pct) || 0))
    .slice(0, 4);
  for (const ev of notable) {
    const sp = Number(ev.surprise_pct) || 0;
    items.push({
      id: `surprise-${ev.date}-${ev.currency}-${ev.event}`,
      kind: "surprise",
      emoji: sp > 0 ? "🚀" : "❄️",
      badge: "SURPRISE",
      title: `${ev.currency} ${ev.event}: ${sp > 0 ? "+" : ""}${sp.toFixed(1)}%`,
      body: [
        `Actual ${ev.actual ?? "—"} vs forecast ${ev.forecast ?? "—"} on ${ev.date}.`,
        sp >  20 ? "Outsize beat — bullish bias for the currency."   :
        sp >  15 ? "Material upside surprise."                       :
        sp < -20 ? "Outsize miss — bearish bias for the currency."   :
        sp < -15 ? "Material downside miss."                         : "",
      ].filter(Boolean),
      currency: ev.currency,
      ts: eventDate(ev)?.getTime() || 0,
    });
  }

  // 5. HOT / COLD STREAK — per-currency 30d aggregates
  const stats = scoreboardByCurrency(recent, 30, base);
  for (const s of stats) {
    if (s.total < 4) continue;
    const beatRatio = s.beats / s.total;
    if (s.avgPct >= 10 && beatRatio >= 0.55) {
      items.push({
        id: `streak-${s.code}-hot`,
        kind: "hot_streak",
        emoji: "📈",
        badge: "STREAK",
        title: `${s.code} hot — ${s.beats}/${s.total} beats (avg +${s.avgPct.toFixed(1)}%)`,
        body: [
          `Consensus has been catching up to ${s.code} reality 30d running.`,
          "Hawkish setup; pairs with a strong-currency directional bias.",
        ],
        currency: s.code,
        ts: base.getTime() - 1000,
      });
    } else if (s.avgPct <= -10 && beatRatio <= 0.45) {
      items.push({
        id: `streak-${s.code}-cold`,
        kind: "hot_streak",
        emoji: "📉",
        badge: "STREAK",
        title: `${s.code} cooling — ${s.total - s.beats}/${s.total} misses (avg ${s.avgPct.toFixed(1)}%)`,
        body: [
          `Forecasts have been overshooting ${s.code} reality across recent prints.`,
          "Dovish backdrop builds; weakness bias on the currency.",
        ],
        currency: s.code,
        ts: base.getTime() - 1000,
      });
    }
  }

  // 6. SPOTLIGHT — first upcoming high-impact with >=4 prints of history
  for (const ev of futureUpcoming) {
    if ((ev.impact || "").toLowerCase() !== "high") continue;
    const hist = eventHistory(recent, ev.event, ev.currency, 6);
    if (hist.length < 4) continue;
    const avgSp = hist.reduce((s, h) => s + (Number(h.surprise_pct) || 0), 0) / hist.length;
    const beats = hist.filter(h => (Number(h.surprise_pct) || 0) > 0).length;
    items.push({
      id: `spotlight-${ev.currency}-${ev.event}`,
      kind: "spotlight",
      emoji: "🔍",
      badge: "SPOTLIGHT",
      title: `Watching: ${ev.currency} ${ev.event}`,
      body: [
        `${ev.date} · fcst ${ev.forecast || "—"}, prev ${ev.previous || "—"}.`,
        `Last ${hist.length} prints: ${beats}/${hist.length} beats, avg ${avgSp > 0 ? "+" : ""}${avgSp.toFixed(1)}% surprise.`,
      ],
      currency: ev.currency,
      ts: ev._t,
    });
    break;
  }

  // Sort: by kind priority then by time
  const order = { imminent: 0, agenda: 1, cluster: 2, spotlight: 3, surprise: 4, hot_streak: 5 };
  items.sort((a, b) => {
    const oa = order[a.kind] ?? 99;
    const ob = order[b.kind] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.ts || 0) - (b.ts || 0);
  });

  return items;
}

// ── Visual ──────────────────────────────────────────────────────────────
const KIND_COLOR = {
  imminent:   C.red,
  agenda:     C.amber,
  cluster:    C.amber,
  spotlight:  C.cyan,
  hot_streak: C.green,
  surprise:   C.orange,
};

function NewsItem({ item }) {
  const color = KIND_COLOR[item.kind] || C.gray;
  return (
    <div style={{
      padding: "14px 16px",
      background: C.bg2, border: `1px solid ${C.border}`,
      borderLeft: `5px solid ${color}`,
      fontFamily: mono,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{item.emoji}</span>
        <span style={{
          fontSize: 14, color, fontWeight: 800, letterSpacing: "1.5px",
          padding: "3px 10px", border: `1px solid ${color}55`, background: `${color}15`,
        }}>{item.badge}</span>
        {item.currency && (
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: "1.2px" }}>· {item.currency}</span>
        )}
      </div>
      <div style={{ fontSize: 18, color: C.white, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>
        {item.title}
      </div>
      {item.body.map((line, i) => (
        <div key={i} style={{ fontSize: 16, color: C.gray, lineHeight: 1.6, marginBottom: 4 }}>
          {line}
        </div>
      ))}
    </div>
  );
}

export default function NewsFeed({ calendar, filters }) {
  const items = useMemo(() => generateNewsItems(calendar), [calendar]);
  const filtered = useMemo(() => {
    if (!filters?.currencies || filters.currencies.size === 0) return items;
    return items.filter(it => !it.currency || filters.currencies.has(it.currency));
  }, [items, filters]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "0 4px",
      }}>
        <span style={{
          fontSize: 20, color: C.gray, fontWeight: 700, letterSpacing: "2px",
          textTransform: "uppercase", fontFamily: mono,
        }}>News &amp; Insights</span>
        <span style={{ fontSize: 13, color: C.muted, letterSpacing: "1px", fontFamily: mono }}>
          synthesised locally
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          background: C.bg2, border: `1px dashed ${C.border2}`,
          padding: "26px 18px", textAlign: "center",
          color: C.muted, fontSize: 16, fontFamily: mono, lineHeight: 1.5,
        }}>
          No insights match the current filter window.<br />
          Clear or widen filters to see more.
        </div>
      ) : (
        filtered.map(item => <NewsItem key={item.id} item={item} />)
      )}
    </div>
  );
}
