// version: v6
/**
 * ExposureStrip.jsx — Account summary + open positions + pending orders
 *                     (below Quant chart).
 *
 * v6 — LIVE P&L now updates at tick rate, TODAY polls on its own cadence.
 *      Previously both came through a single 3s Promise.all that bundled
 *      6 endpoints — slow, and the LIVE cell was bound to whatever
 *      `position.profit` the backend last reported (server-supplied
 *      mid-poll; can be 3+ seconds stale). Now the strip accepts a
 *      `priceMap` prop and recomputes unrealized P&L per position from
 *      the live tick: profit = (livePrice - openPrice) × dir × lots ×
 *      (tick_value / tick_size). Falls back to server-supplied profit
 *      when no live price is available. Polling is split: positions /
 *      pending / status / mt5 every 1.5s; period-pnl every 4s (kept
 *      independent so it doesn't block the live cell).
 *
 * v5 — Audio alerts on the EDIT-popover commit paths. saveEdit (position
 *      SL/TP) and savePendingEdit (pending price/SL/TP) now play the
 *      order_placed sound on success, matching the operator's "tp or sl
 *      placed or adjusted = order placed" mapping.
 * v2 — bigger / clearer strip, authoritative BALANCE from MT5 (not the risk
 *      governor's "initial_balance" setting), renamed UNREALIZED → LIVE P&L,
 *      and a positions table below the strip with inline [EDIT] and [CLOSE]
 *      per row. Edit popover modifies SL/TP via PATCH /api/positions/{ticket}.
 * v3 — PENDING ORDERS section below the positions table. MODIFY (price/SL/TP)
 *      via PATCH /api/orders/{ticket}, CANCEL via DELETE /api/orders/{ticket}.
 *
 * Data sources:
 *   /api/mt5/status          — authoritative MT5 account.balance / equity / currency
 *   /api/positions           — live open positions
 *   /api/orders/pending      — resting LIMIT / STOP orders                      (v3)
 *   /api/symbol-info         — tick_value + tick_size for exposure math
 *   /api/account/status      — trading_allowed / halt_reason (risk governor)
 *   /api/account/period-pnl  — TODAY pnl for the strip
 *
 * Refreshes every 3s. Also refreshes immediately when any trade action in the
 * app fires window.__mk_execution_refresh() (OrderTicket, CLOSE, EDIT).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playSound } from "../utils/sounds";  // v5: audio on SL/TP edit commit

const C = {
  bg: "#000", bgPanel: "#0a0a0a", bgCard: "#111", bgHover: "#1a1a1a",
  border: "#222", borderLt: "#333",
  white: "#fff", gray: "#999", muted: "#555",
  orange: "#ff6d00", green: "#2ebd59", red: "#e8383b",
  cyan: "#00d2d3", amber: "#ffa500", blue: "#3796ff",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

function usd(v, dp = 0, cur = "$") {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const n = abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${sign}${cur}${n}`;
}
function pct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${v.toFixed(2)}%`;
}
function pnlColor(v) {
  if (v > 0) return C.green;
  if (v < 0) return C.red;
  return C.muted;
}

// v4: dollar delta between two prices for N lots of a symbol.
// Mirrors the live-exposure formula at the top of ExposureStrip:
//   dpp = tick_value / tick_size  (dollars per 1.0 price point for 1 lot)
//   $   = |from - to| * dpp * lots
// Returns null when inputs are missing / zero so callers can show "—".
function dollarDelta(fromPrice, toPrice, lots, si) {
  if (!si || !(si.tick_value > 0) || !(si.tick_size > 0)) return null;
  if (!(fromPrice > 0) || !(toPrice > 0) || !(lots > 0))  return null;
  const dpp = si.tick_value / si.tick_size;
  return Math.abs(fromPrice - toPrice) * dpp * lots;
}

export default function ExposureStrip({
  pollInterval = 1500,         // v6: faster live polling
  pnlPollInterval = 4000,      // v6: closed-trade P&L on a separate, calmer cycle
  priceMap = null,             // v6: live tick map { ticker -> { price, ... } }
}) {
  // ── Data state ─────────────────────────────────────────────────────────
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]); // v3
  const [symMap, setSymMap] = useState({});
  const [acctStatus, setAcctStatus] = useState(null);   // risk governor
  const [mt5Account, setMt5Account] = useState(null);   // real MT5 balance/equity
  const [mt5Connected, setMt5Connected] = useState(true);
  const [periodPnl, setPeriodPnl] = useState(null);
  const [editing, setEditing] = useState(null);          // position ticket in edit mode
  const [editingPending, setEditingPending] = useState(null); // v3: pending order ticket in edit mode
  const timerRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────
  // v6: split into "live" (positions / status / mt5) and "today P&L" so the
  //   slower deal-history call doesn't block the fast cell. Both reuse the
  //   global __mk_execution_refresh hook so trade actions hit both at once.
  const fetchLive = useCallback(async () => {
    try {
      const [posR, penR, siR, stR, mt5R] = await Promise.all([
        fetch("/api/positions"),
        fetch("/api/orders/pending"),
        fetch("/api/symbol-info"),
        fetch("/api/account/status"),
        fetch("/api/mt5/status"),
      ]);
      if (posR.ok) {
        const d = await posR.json();
        setPositions(d.positions || []);
        setMt5Connected(d.mt5_connected !== false);
      }
      if (penR.ok) {
        const d = await penR.json();
        setPendingOrders(d.orders || []);
      }
      if (siR.ok) {
        const d = await siR.json();
        setSymMap(d.symbols || d);
      }
      if (stR.ok) setAcctStatus(await stR.json());
      if (mt5R.ok) {
        const d = await mt5R.json();
        setMt5Account(d.account || null);
        if (d.connected === false) setMt5Connected(false);
      }
    } catch { /* non-critical */ }
  }, []);

  const fetchPnl = useCallback(async () => {
    try {
      const r = await fetch("/api/account/period-pnl");
      if (r.ok) setPeriodPnl(await r.json());
    } catch { /* non-critical */ }
  }, []);

  const refreshAll = useCallback(() => {
    fetchLive();
    fetchPnl();
  }, [fetchLive, fetchPnl]);

  useEffect(() => {
    fetchLive();
    fetchPnl();
    const liveTimer = setInterval(fetchLive, pollInterval);
    const pnlTimer  = setInterval(fetchPnl, pnlPollInterval);
    window.__mk_execution_refresh = refreshAll;
    return () => {
      clearInterval(liveTimer);
      clearInterval(pnlTimer);
      if (window.__mk_execution_refresh === refreshAll) delete window.__mk_execution_refresh;
    };
  }, [fetchLive, fetchPnl, refreshAll, pollInterval, pnlPollInterval]);

  // ── Derived metrics ────────────────────────────────────────────────────
  const currencySym = useMemo(() => {
    const c = (mt5Account?.currency || "USD").toUpperCase();
    return c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : c + " ";
  }, [mt5Account]);

  const balance = mt5Account?.balance ?? null;
  const equity  = mt5Account?.equity  ?? acctStatus?.equity ?? null;

  const { exposure, livePnl } = useMemo(() => {
    let exp = 0, pl = 0;
    for (const p of positions) {
      const si = symMap?.[p.ticker];
      const dpp = (si?.tick_value > 0 && si?.tick_size > 0) ? si.tick_value / si.tick_size : 0;
      if (dpp > 0 && p.open_price > 0 && p.lots > 0 && p.stop_loss > 0) {
        exp += Math.abs(p.open_price - p.stop_loss) * dpp * p.lots;
      }
      // v6: prefer recomputing profit from the live tick if priceMap has
      //   this ticker — avoids the ~3s stale window between position polls.
      //   Falls back to server-supplied position.profit otherwise.
      let profit = p.profit || 0;
      const livePrice = priceMap?.get?.(p.ticker)?.price;
      if (livePrice > 0 && dpp > 0 && p.open_price > 0 && p.lots > 0) {
        const dir = String(p.direction).toUpperCase() === "BUY" ? 1 : -1;
        profit = (livePrice - p.open_price) * dir * p.lots * dpp;
      }
      pl += profit + (p.swap || 0) + (p.commission || 0);
    }
    return { exposure: exp, livePnl: pl };
  }, [positions, symMap, priceMap]);

  const exposurePct = equity > 0 ? (exposure / equity) * 100 : 0;
  const today    = periodPnl?.today?.pnl ?? 0;
  const todayPct = periodPnl?.today?.pct ?? 0;
  const openCount = positions.length;
  const tradingAllowed = acctStatus?.trading_allowed !== false;
  const haltReason = acctStatus?.halt_reason || "";

  // ── Cell helper ────────────────────────────────────────────────────────
  const cell = (label, value, color = C.white, sub = null) => (
    <div style={{
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: "6px 16px",
      borderRight: `1px solid ${C.border}`,
      minWidth: 110,
    }}>
      <span style={{
        fontSize: 8, color: C.gray, letterSpacing: "1.4px",
        fontFamily: mono, fontWeight: 700, textTransform: "uppercase",
        marginBottom: 2,
      }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontSize: 14, color, fontWeight: 700, fontFamily: mono,
          fontVariantNumeric: "tabular-nums", letterSpacing: "0.5px",
        }}>{value}</span>
        {sub && <span style={{
          fontSize: 9, color, opacity: 0.7, fontFamily: mono,
          fontVariantNumeric: "tabular-nums",
        }}>{sub}</span>}
      </div>
    </div>
  );

  // ── Position row actions ───────────────────────────────────────────────
  const closePos = useCallback(async (ticket, ticker) => {
    if (!window.confirm(`Close position ${ticker} (#${ticket})?`)) return;
    try {
      const r = await fetch(`/api/positions/${encodeURIComponent(ticket)}/close`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) {
        alert(`Close failed: ${d.error || d.detail?.message || `HTTP ${r.status}`}`);
        return;
      }
      refreshAll();
    } catch (e) { alert(`Close error: ${e.message}`); }
  }, [refreshAll]);

  const saveEdit = useCallback(async (ticket, sl, tp) => {
    try {
      const body = {};
      if (sl !== "" && sl != null) body.stop_loss = parseFloat(sl);
      if (tp !== "" && tp != null) body.take_profit = parseFloat(tp);
      const r = await fetch(`/api/positions/${encodeURIComponent(ticket)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) {
        alert(`Modify failed: ${d.error || d.detail?.message || `HTTP ${r.status}`}`);
        return;
      }
      // v5: position SL/TP edit committed → order_placed
      try { playSound("order_placed"); } catch { /* never fatal */ }
      setEditing(null);
      refreshAll();
    } catch (e) { alert(`Modify error: ${e.message}`); }
  }, [refreshAll]);

  // v3: Pending-order actions ───────────────────────────────────────────────
  const cancelPending = useCallback(async (ticket, ticker) => {
    if (!window.confirm(`Cancel pending order on ${ticker} (#${ticket})?`)) return;
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(ticket)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) {
        alert(`Cancel failed: ${d.error || d.detail?.message || `HTTP ${r.status}`}`);
        return;
      }
      refreshAll();
    } catch (e) { alert(`Cancel error: ${e.message}`); }
  }, [refreshAll]);

  const savePendingEdit = useCallback(async (ticket, price, sl, tp) => {
    try {
      const body = {};
      if (price !== "" && price != null) body.price       = parseFloat(price);
      if (sl    !== "" && sl    != null) body.stop_loss   = parseFloat(sl);
      if (tp    !== "" && tp    != null) body.take_profit = parseFloat(tp);
      const r = await fetch(`/api/orders/${encodeURIComponent(ticket)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) {
        alert(`Modify failed: ${d.error || d.detail?.message || `HTTP ${r.status}`}`);
        return;
      }
      // v5: pending order price/SL/TP edit committed → order_placed
      try { playSound("order_placed"); } catch { /* never fatal */ }
      setEditingPending(null);
      refreshAll();
    } catch (e) { alert(`Modify error: ${e.message}`); }
  }, [refreshAll]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: C.bgPanel,
      borderTop: `1px solid ${C.border}`,
      fontFamily: mono,
      display: "flex", flexDirection: "column",
    }}>
      {/* ═══ Summary strip ═══ */}
      <div style={{
        display: "flex", alignItems: "stretch",
        height: 54,
        borderBottom: `1px solid ${C.border}`,
        overflow: "hidden",
      }}>
        {cell("BALANCE", balance != null ? usd(balance, 2, currencySym) : "—")}
        {cell("EQUITY",
          equity != null ? usd(equity, 2, currencySym) : "—",
          pnlColor((equity || 0) - (balance || 0)))}
        {cell("EXPOSURE",
          usd(exposure, 2, currencySym),
          exposure > 0 ? C.red : C.muted,
          exposure > 0 ? pct(exposurePct) : null)}
        {cell("LIVE P&L",
          (livePnl >= 0 ? "+" : "") + usd(livePnl, 2, currencySym),
          pnlColor(livePnl))}
        {cell("TODAY",
          (today >= 0 ? "+" : "") + usd(today, 2, currencySym),
          pnlColor(today),
          todayPct ? pct(todayPct) : null)}
        {cell("POSITIONS",
          String(openCount),
          openCount > 0 ? C.orange : C.muted)}

        {/* Status pills on the right */}
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center",
          gap: 8, padding: "0 14px",
        }}>
          {!mt5Connected && (
            <span style={{
              fontSize: 9, color: C.red, fontWeight: 700, letterSpacing: "1px",
              padding: "3px 8px", border: `1px solid ${C.red}40`,
              background: `${C.red}10`,
            }}>MT5 OFFLINE</span>
          )}
          {mt5Connected && haltReason && (
            <span style={{
              fontSize: 9, color: C.red, opacity: 0.9, maxWidth: 240,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={haltReason}>{haltReason}</span>
          )}
          <span style={{
            fontSize: 9, color: tradingAllowed ? C.green : C.red,
            fontWeight: 700, letterSpacing: "1.2px",
            padding: "3px 10px",
            border: `1px solid ${tradingAllowed ? C.green : C.red}40`,
            background: `${tradingAllowed ? C.green : C.red}12`,
          }}>
            {tradingAllowed ? "LIVE" : "HALTED"}
          </span>
        </div>
      </div>

      {/* ═══ Positions table ═══ */}
      {openCount > 0 && (
        <div style={{
          maxHeight: 220, overflowY: "auto",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(90px, 1.2fr) 62px 70px 96px 96px 96px 96px 86px 86px 100px 120px",
            alignItems: "center",
            padding: "4px 12px",
            background: C.bgCard,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 8, color: C.gray, letterSpacing: "1.5px",
            fontWeight: 700, textTransform: "uppercase", gap: 8,
          }}>
            <span>TICKER</span>
            <span>SIDE</span>
            <span>LOTS</span>
            <span>OPEN</span>
            <span>CURRENT</span>
            <span>STOP LOSS</span>
            <span>TAKE PROFIT</span>
            <span style={{ textAlign: "right" }}>RISK</span>
            <span style={{ textAlign: "right" }}>REWARD</span>
            <span style={{ textAlign: "right" }}>P&L</span>
            <span style={{ textAlign: "right" }}>ACTIONS</span>
          </div>

          {/* Rows */}
          {positions.map((p) => (
            <PositionRow
              key={p.ticket}
              pos={p}
              symInfo={symMap?.[p.ticker]}
              editing={editing === p.ticket}
              currencySym={currencySym}
              onEditStart={() => setEditing(p.ticket)}
              onEditCancel={() => setEditing(null)}
              onSave={(sl, tp) => saveEdit(p.ticket, sl, tp)}
              onClose={() => closePos(p.ticket, p.ticker)}
            />
          ))}
        </div>
      )}

      {/* ═══ Pending orders table (v3) ═══ */}
      {pendingOrders.length > 0 && (
        <div style={{
          maxHeight: 220, overflowY: "auto",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "4px 12px",
            background: `${C.blue}12`,
            borderBottom: `1px solid ${C.blue}40`,
            fontSize: 9, color: C.blue, letterSpacing: "1.5px",
            fontWeight: 800, textTransform: "uppercase",
          }}>
            PENDING ORDERS <span style={{ opacity: 0.7 }}>({pendingOrders.length})</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(90px, 1.2fr) 90px 70px 96px 96px 96px 86px 86px 120px",
            alignItems: "center",
            padding: "4px 12px",
            background: C.bgCard,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 8, color: C.gray, letterSpacing: "1.5px",
            fontWeight: 700, textTransform: "uppercase", gap: 8,
          }}>
            <span>TICKER</span>
            <span>TYPE</span>
            <span>LOTS</span>
            <span>PRICE</span>
            <span>STOP LOSS</span>
            <span>TAKE PROFIT</span>
            <span style={{ textAlign: "right" }}>RISK</span>
            <span style={{ textAlign: "right" }}>REWARD</span>
            <span style={{ textAlign: "right" }}>ACTIONS</span>
          </div>
          {pendingOrders.map((o) => (
            <PendingOrderRow
              key={o.ticket}
              order={o}
              symInfo={symMap?.[o.ticker]}
              currencySym={currencySym}
              editing={editingPending === o.ticket}
              onEditStart={() => setEditingPending(o.ticket)}
              onEditCancel={() => setEditingPending(null)}
              onSave={(price, sl, tp) => savePendingEdit(o.ticket, price, sl, tp)}
              onCancelOrder={() => cancelPending(o.ticket, o.ticker)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function PositionRow({ pos, symInfo, editing, currencySym, onEditStart, onEditCancel, onSave, onClose }) {
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  useEffect(() => {
    if (editing) {
      setSl(pos.stop_loss > 0 ? String(pos.stop_loss) : "");
      setTp(pos.take_profit > 0 ? String(pos.take_profit) : "");
    }
  }, [editing, pos.stop_loss, pos.take_profit]);

  const side = (pos.direction || "").toUpperCase();
  const sideColor = side === "BUY" ? C.green : side === "SELL" ? C.red : C.gray;
  const plColor = pnlColor(pos.profit || 0);

  const fmt = (v) => {
    if (v == null || !isFinite(v) || v === 0) return "—";
    // Pick decimals from value magnitude
    const dp = v < 10 ? 5 : v < 1000 ? 3 : 2;
    return v.toFixed(dp);
  };

  // v4: $ risk (SL) / $ reward (TP) using the same dpp formula as exposure
  const riskUsd   = dollarDelta(pos.open_price, pos.stop_loss,   pos.lots, symInfo);
  const rewardUsd = dollarDelta(pos.open_price, pos.take_profit, pos.lots, symInfo);
  const fmtDollar = (v) => v == null ? "—" : `${currencySym}${v.toFixed(2)}`;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(90px, 1.2fr) 62px 70px 96px 96px 96px 96px 86px 86px 100px 120px",
      alignItems: "center",
      padding: "6px 12px",
      borderBottom: `1px solid ${C.border}`,
      fontSize: 11, fontFamily: mono, color: C.white,
      fontVariantNumeric: "tabular-nums", gap: 8,
    }}>
      <span style={{ fontWeight: 700, color: C.orange }}>{pos.ticker}</span>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "1px",
        padding: "2px 7px",
        border: `1px solid ${sideColor}50`,
        background: `${sideColor}15`,
        color: sideColor, textAlign: "center", justifySelf: "start",
      }}>{side}</span>
      <span>{(pos.lots || 0).toFixed(2)}</span>
      <span style={{ color: C.gray }}>{fmt(pos.open_price)}</span>
      <span>{fmt(pos.current_price)}</span>

      {/* SL cell — input when editing */}
      {editing ? (
        <input
          value={sl} onChange={e => setSl(e.target.value)} placeholder="0"
          style={{
            background: C.bg, border: `1px solid ${C.red}60`,
            color: C.red, fontFamily: mono, fontSize: 10, padding: "3px 6px",
            outline: "none", width: "100%",
          }}
        />
      ) : (
        <span style={{ color: pos.stop_loss > 0 ? C.red : C.muted }}>
          {fmt(pos.stop_loss)}
        </span>
      )}

      {/* TP cell — input when editing */}
      {editing ? (
        <input
          value={tp} onChange={e => setTp(e.target.value)} placeholder="0"
          style={{
            background: C.bg, border: `1px solid ${C.green}60`,
            color: C.green, fontFamily: mono, fontSize: 10, padding: "3px 6px",
            outline: "none", width: "100%",
          }}
        />
      ) : (
        <span style={{ color: pos.take_profit > 0 ? C.green : C.muted }}>
          {fmt(pos.take_profit)}
        </span>
      )}

      {/* v4: $ RISK if SL hit */}
      <span style={{
        color: riskUsd != null ? C.red : C.muted,
        fontWeight: 700, textAlign: "right",
      }} title="Loss in account currency if SL hit">
        {fmtDollar(riskUsd)}
      </span>

      {/* v4: $ REWARD if TP hit */}
      <span style={{
        color: rewardUsd != null ? C.green : C.muted,
        fontWeight: 700, textAlign: "right",
      }} title="Gain in account currency if TP hit">
        {fmtDollar(rewardUsd)}
      </span>

      <span style={{ color: plColor, fontWeight: 700, textAlign: "right" }}>
        {(pos.profit >= 0 ? "+" : "") + usd(pos.profit || 0, 2, currencySym)}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        {editing ? (
          <>
            <button onClick={() => onSave(sl, tp)}
              style={btnStyle(C.green, true)} title="Save SL/TP">SAVE</button>
            <button onClick={onEditCancel}
              style={btnStyle(C.muted)} title="Cancel">×</button>
          </>
        ) : (
          <>
            <button onClick={onEditStart}
              style={btnStyle(C.cyan)} title="Edit SL / TP">EDIT</button>
            <button onClick={onClose}
              style={btnStyle(C.red, true)} title="Close position">CLOSE</button>
          </>
        )}
      </div>
    </div>
  );
}

function btnStyle(color, bold = false) {
  return {
    background: `${color}15`,
    border: `1px solid ${color}50`,
    color, fontFamily: mono, fontSize: 9,
    fontWeight: bold ? 800 : 700, letterSpacing: "0.5px",
    padding: "3px 8px", cursor: "pointer", minWidth: 42,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// v3: Pending-order row — MODIFY (price / SL / TP) + CANCEL per row.
function PendingOrderRow({ order, symInfo, currencySym = "$", editing, onEditStart, onEditCancel, onSave, onCancelOrder }) {
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  useEffect(() => {
    if (editing) {
      setPrice(order.price > 0 ? String(order.price) : "");
      setSl(order.stop_loss   > 0 ? String(order.stop_loss)   : "");
      setTp(order.take_profit > 0 ? String(order.take_profit) : "");
    }
  }, [editing, order.price, order.stop_loss, order.take_profit]);

  const direction = (order.direction || "").toUpperCase();
  const kind      = (order.order_type || "").toUpperCase();
  const typeColor = direction === "BUY" ? C.green : direction === "SELL" ? C.red : C.gray;

  const fmt = (v) => {
    if (v == null || !isFinite(v) || v === 0) return "—";
    const dp = v < 10 ? 5 : v < 1000 ? 3 : 2;
    return v.toFixed(dp);
  };

  // v4: $ risk / $ reward for the pending order. Price (not open_price) is
  //     the reference since the order hasn't filled yet.
  const riskUsd   = dollarDelta(order.price, order.stop_loss,   order.lots, symInfo);
  const rewardUsd = dollarDelta(order.price, order.take_profit, order.lots, symInfo);
  const fmtDollar = (v) => v == null ? "—" : `${currencySym}${v.toFixed(2)}`;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(90px, 1.2fr) 90px 70px 96px 96px 96px 86px 86px 120px",
      alignItems: "center",
      padding: "6px 12px",
      borderBottom: `1px solid ${C.border}`,
      fontSize: 11, fontFamily: mono, color: C.white,
      fontVariantNumeric: "tabular-nums", gap: 8,
    }}>
      <span style={{ fontWeight: 700, color: C.orange }}>{order.ticker}</span>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "1px",
        padding: "2px 7px",
        border: `1px solid ${typeColor}50`,
        background: `${typeColor}15`,
        color: typeColor, textAlign: "center", justifySelf: "start",
      }}>{direction} {kind}</span>
      <span>{(order.lots || 0).toFixed(2)}</span>

      {/* PRICE cell — input when editing */}
      {editing ? (
        <input
          value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
          style={{
            background: C.bg, border: `1px solid ${C.blue}60`,
            color: C.blue, fontFamily: mono, fontSize: 10, padding: "3px 6px",
            outline: "none", width: "100%",
          }}
        />
      ) : (
        <span style={{ color: C.blue, fontWeight: 700 }}>{fmt(order.price)}</span>
      )}

      {/* SL cell */}
      {editing ? (
        <input
          value={sl} onChange={e => setSl(e.target.value)} placeholder="0"
          style={{
            background: C.bg, border: `1px solid ${C.red}60`,
            color: C.red, fontFamily: mono, fontSize: 10, padding: "3px 6px",
            outline: "none", width: "100%",
          }}
        />
      ) : (
        <span style={{ color: order.stop_loss > 0 ? C.red : C.muted }}>
          {fmt(order.stop_loss)}
        </span>
      )}

      {/* TP cell */}
      {editing ? (
        <input
          value={tp} onChange={e => setTp(e.target.value)} placeholder="0"
          style={{
            background: C.bg, border: `1px solid ${C.green}60`,
            color: C.green, fontFamily: mono, fontSize: 10, padding: "3px 6px",
            outline: "none", width: "100%",
          }}
        />
      ) : (
        <span style={{ color: order.take_profit > 0 ? C.green : C.muted }}>
          {fmt(order.take_profit)}
        </span>
      )}

      {/* v4: $ RISK if SL hit after fill */}
      <span style={{
        color: riskUsd != null ? C.red : C.muted,
        fontWeight: 700, textAlign: "right",
      }} title="Loss in account currency if SL hit after this order fills">
        {fmtDollar(riskUsd)}
      </span>

      {/* v4: $ REWARD if TP hit after fill */}
      <span style={{
        color: rewardUsd != null ? C.green : C.muted,
        fontWeight: 700, textAlign: "right",
      }} title="Gain in account currency if TP hit after this order fills">
        {fmtDollar(rewardUsd)}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        {editing ? (
          <>
            <button onClick={() => onSave(price, sl, tp)}
              style={btnStyle(C.green, true)} title="Save changes">SAVE</button>
            <button onClick={onEditCancel}
              style={btnStyle(C.muted)} title="Cancel edit">×</button>
          </>
        ) : (
          <>
            <button onClick={onEditStart}
              style={btnStyle(C.cyan)} title="Modify price / SL / TP">MODIFY</button>
            <button onClick={onCancelOrder}
              style={btnStyle(C.red, true)} title="Cancel pending order">CANCEL</button>
          </>
        )}
      </div>
    </div>
  );
}
