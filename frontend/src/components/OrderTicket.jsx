/**
 * ============================================================================
 * Quantum Terminal — OrderTicket
 * ============================================================================
 * Modal trade entry form. Posts to /api/orders.
 *
 * Props:
 *   isOpen         — boolean, show/hide modal
 *   onClose        — callback to close modal
 *   config         — terminal config (execution settings)
 *   selectedTicker — pre-filled ticker from active chart
 *   currentPrice   — live price for the selected ticker
 *   universe       — array of ticker strings for dropdown
 *   onLog          — debug panel logger (optional)
 *   signalData     — optional signal pre-fill { signal_id, signal_type, ticker,
 *                     direction, entry_price, stop_loss, target_price, confidence, lots }
 *   priceMap       — Map of ticker → asset data (for resolving live price of any ticker)
 *
 * Safety:
 *   - Checks execution.live_trading before enabling submit
 *   - Enforces max_lots from config
 *   - Confirm dialog when execution.confirm_orders is true
 *   - Visual BUY/SELL distinction (green/red)
 * ============================================================================
 */

// version: v5
// v5 — Diagnostic logging on the toast→sound path so we can triage why
//      orders aren't triggering audio. v4 was supposed to play via a
//      useEffect on result, but the user reports zero console output,
//      meaning the chain breaks somewhere before playSound is reached.
//      Logs at the three checkpoints: submit-success branch, ref capture,
//      and useEffect entry. Once the issue is found these can be removed.
// v4 — Order sounds are now triggered from the success toast (the result
//      banner) via a useEffect that watches `result.success`. This is
//      more reliable than firing inline after the fetch — the sound
//      tracks the visible UI state, so if the toast appears the sound
//      plays. Captures orderType into a ref at submit time so the
//      effect uses the type at submission, not whatever the form holds
//      when the response comes back.
// v3 — orderType comparisons in the playSound branch are UPPERCASE
//      ("MARKET" / "LIMIT") to match the actual state value. v2 used
//      lowercase, so the sounds never fired.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { playSound } from "../utils/sounds";  // v2+: audio alerts on order events

const mono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";

const getColors = () => ({
  bg:      getComputedStyle(document.documentElement).getPropertyValue("--mk-bg").trim()      || "#0a0a0f",
  bgPanel: getComputedStyle(document.documentElement).getPropertyValue("--mk-bgPanel").trim() || "#12121a",
  border:  getComputedStyle(document.documentElement).getPropertyValue("--mk-border").trim()  || "#1e1e2e",
  white:   getComputedStyle(document.documentElement).getPropertyValue("--mk-white").trim()   || "#e8e8f0",
  muted:   getComputedStyle(document.documentElement).getPropertyValue("--mk-muted").trim()   || "#4a4a5e",
  orange:  getComputedStyle(document.documentElement).getPropertyValue("--mk-orange").trim()  || "#e67e22",
  green:   getComputedStyle(document.documentElement).getPropertyValue("--mk-green").trim()   || "#27ae60",
  red:     getComputedStyle(document.documentElement).getPropertyValue("--mk-red").trim()     || "#e74c3c",
  cyan:    getComputedStyle(document.documentElement).getPropertyValue("--mk-cyan").trim()    || "#00bcd4",
});

// ── Decimals per ticker (for rounding SL/TP display) ──
const DECIMALS = {
  EURUSD: 5, GBPUSD: 5, USDJPY: 3, AUDUSD: 5, USDCHF: 5, USDCAD: 5,
  US500: 2, USTEC: 2, US30: 2, GER40: 2, UK100: 2,
  XAUUSD: 2, XAGUSD: 3, XTIUSD: 2,
  ETHUSD: 2, BTCUSD: 2,
};

function roundPrice(val, ticker) {
  if (!val || isNaN(val)) return "";
  const dec = DECIMALS[ticker?.toUpperCase()] || 5;
  return parseFloat(val).toFixed(dec);
}


export default function OrderTicket({
  isOpen,
  onClose,
  config,
  selectedTicker,
  currentPrice,
  universe = [],
  onLog,
  signalData = null,
  priceMap = null,
}) {
  // Form state
  const [ticker, setTicker] = useState(selectedTicker || "");
  const [direction, setDirection] = useState("BUY");
  const [orderType, setOrderType] = useState("MARKET");
  const [lots, setLots] = useState("0.01");
  const [price, setPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [comment, setComment] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);       // { success, message }
  // v4: orderType captured at submit time so the toast-driven sound effect
  //     plays the sound for the type SUBMITTED, not whatever the form
  //     holds when the response comes back.
  const submittedOrderTypeRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accountBalance, setAccountBalance] = useState(0);
  const [symbolInfo, setSymbolInfo] = useState(null); // from /api/symbol-info/{ticker}

  const colorsRef = useRef(getColors());

  // Refresh colors on theme change
  useEffect(() => {
    const obs = new MutationObserver(() => { colorsRef.current = getColors(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => obs.disconnect();
  }, []);

  // v4: toast-driven audio alerts. When the success result banner appears,
  //     play the corresponding sound. Driven off the visible UI state so
  //     it tracks 1:1 with what the operator sees, not whatever obscure
  //     branch the submit handler took. Uses the orderType captured at
  //     submit time so subsequent form edits don't change the sound.
  useEffect(() => {
    console.log("[order-sound] effect fired — result:", result, "submittedType:", submittedOrderTypeRef.current);
    if (!result || !result.success) return;
    const t = submittedOrderTypeRef.current;
    console.log("[order-sound] success branch — type:", t);
    if (t === "MARKET") {
      console.log("[order-sound] -> playSound('order_filled')");
      playSound("order_filled");
    } else if (t) {
      // LIMIT / STOP / STOP_LIMIT — all are "order placed" per operator mapping
      console.log("[order-sound] -> playSound('order_placed')");
      playSound("order_placed");
    } else {
      console.warn("[order-sound] result.success but submittedType is falsy — sound skipped");
    }
  }, [result]);

  // Fetch account balance when modal opens
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const r = await fetch("/api/account/status");
        if (r.ok) {
          const d = await r.json();
          setAccountBalance(d.current_equity || d.initial_balance || 0);
        }
      } catch { /* non-critical */ }
    })();
  }, [isOpen]);

  // Fetch real symbol info from broker when ticker changes
  useEffect(() => {
    if (!isOpen || !ticker) { setSymbolInfo(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/symbol-info/${ticker}`);
        if (r.ok && !cancelled) {
          const info = await r.json();
          setSymbolInfo(info);
          // Enforce broker min lot + round to lot_step
          const currentLots = signalData?.lots > 0 ? signalData.lots : (parseFloat(lots) || 0);
          const step = info.lot_step || 0.01;
          const minLot = info.min_lot || step;
          let adjusted = currentLots;
          // Round to lot_step
          if (step > 0) adjusted = Math.round(adjusted / step) * step;
          // Enforce min
          if (adjusted < minLot) adjusted = minLot;
          // Enforce max
          if (info.max_lot && adjusted > info.max_lot) adjusted = info.max_lot;
          // Clean floating point noise
          const decPlaces = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
          adjusted = parseFloat(adjusted.toFixed(decPlaces));
          if (adjusted !== currentLots) {
            setLots(String(adjusted));
          }
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen, ticker, signalData]);

  // Sync ticker when chart changes
  useEffect(() => {
    if (selectedTicker && isOpen) setTicker(selectedTicker);
  }, [selectedTicker, isOpen]);

  // Reset form on open — pre-fill from signalData if present
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setShowConfirm(false);
      setSubmitting(false);

      if (signalData) {
        // Signal-linked order — pre-fill from signal
        setTicker(signalData.ticker || selectedTicker || "");
        const dir = (signalData.direction || "long").toUpperCase();
        setDirection(dir === "LONG" || dir === "BUY" ? "BUY" : "SELL");
        setOrderType("MARKET");
        // Lots will be re-adjusted when symbolInfo loads (enforces min_lot + lot_step)
        setLots(signalData.lots > 0 ? String(signalData.lots) : "0.01");
        setPrice("");
        setStopLoss(signalData.stop_loss ? roundPrice(signalData.stop_loss, signalData.ticker) : "");
        setTakeProfit(signalData.target_price ? roundPrice(signalData.target_price, signalData.ticker) : "");
        setComment("");
      } else {
        // Manual order — blank form
        setTicker(selectedTicker || "");
        setDirection("BUY");
        setOrderType("MARKET");
        setLots("0.01");
        setPrice("");
        setStopLoss("");
        setTakeProfit("");
        setComment("");
      }
    }
  }, [isOpen, selectedTicker, signalData]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        if (showConfirm) setShowConfirm(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, showConfirm, onClose]);

  const log = useCallback((level, msg) => {
    if (onLog) onLog({ level, message: msg, source: "ORDER" });
  }, [onLog]);

  const exec = config?.execution || {};
  const isLive = exec.live_trading === true;
  const maxLots = exec.max_lots || 10.0;

  const handleSubmit = useCallback(() => {
    // Validate
    const lotVal = parseFloat(lots);
    if (!ticker) return setResult({ success: false, message: "Select a ticker" });
    if (isNaN(lotVal) || lotVal <= 0) return setResult({ success: false, message: "Invalid lot size" });
    if (lotVal > maxLots) return setResult({ success: false, message: `Exceeds max lots (${maxLots})` });
    if (symbolInfo?.min_lot && lotVal < symbolInfo.min_lot) {
      return setResult({ success: false, message: `Below broker minimum (${symbolInfo.min_lot} lots for ${ticker})` });
    }
    if (symbolInfo?.max_lot && lotVal > symbolInfo.max_lot) {
      return setResult({ success: false, message: `Exceeds broker maximum (${symbolInfo.max_lot} lots for ${ticker})` });
    }
    if (orderType !== "MARKET" && !price) return setResult({ success: false, message: "Price required for limit/stop orders" });

    // Confirm gate
    if (exec.confirm_orders !== false && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    doSubmit();
  }, [ticker, lots, orderType, price, maxLots, exec, showConfirm, symbolInfo]);

  const doSubmit = useCallback(async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setResult(null);

    const body = {
      ticker: ticker.toUpperCase(),
      direction,
      order_type: orderType,
      lots: parseFloat(lots),
      comment: comment || "Quantum Terminal",
    };
    if (orderType === "MARKET") {
      // Send live market price so governor can estimate risk accurately
      const livePrice = priceMap?.get(ticker.toUpperCase())?.price
        || (ticker.toUpperCase() === selectedTicker?.toUpperCase() ? currentPrice : 0);
      if (livePrice > 0) body.price = livePrice;
    } else if (price) {
      body.price = parseFloat(price);
    }
    if (stopLoss) body.stop_loss = parseFloat(stopLoss);
    if (takeProfit) body.take_profit = parseFloat(takeProfit);

    // Signal attribution — auto-registers with TradeMapper on backend
    if (signalData?.signal_id) {
      body.signal_id = signalData.signal_id;
      body.signal_type = signalData.signal_type || "";
      body.signal_confidence = signalData.confidence || 0;
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // v4: capture orderType BEFORE setResult so the effect-based
        //     sound trigger picks the right sound for this submission.
        submittedOrderTypeRef.current = orderType;
        console.log("[order-sound] submit success — captured orderType:", orderType, "data:", data);
        setResult({ success: true, message: `${direction} ${lots} ${ticker} filled @ ${data.price}` });
        log("success", `Order filled: ${direction} ${lots} ${ticker} @ ${data.price} (ID: ${data.order_id})`);
        // Trigger position refresh
        if (window.__mk_execution_refresh) window.__mk_execution_refresh();
      } else {
        const errMsg = data.error || data.detail || `HTTP ${res.status}`;
        console.warn("[order-sound] order rejected — res.ok:", res.ok, "data.success:", data?.success, "data:", data);
        setResult({ success: false, message: errMsg });
        log("error", `Order rejected: ${errMsg}`);
      }
    } catch (e) {
      console.warn("[order-sound] fetch threw:", e);
      setResult({ success: false, message: e.message });
      log("error", `Order error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }, [ticker, direction, orderType, lots, price, stopLoss, takeProfit, comment, log, signalData, priceMap, selectedTicker, currentPrice]);

  if (!isOpen) return null;

  const c = colorsRef.current;
  const dirColor = direction === "BUY" ? c.green : c.red;

  const inputStyle = {
    background: c.bg, border: `1px solid ${c.border}`, color: c.white,
    padding: "5px 8px", fontSize: 10, fontFamily: mono, width: "100%",
    boxSizing: "border-box", outline: "none",
  };

  const labelStyle = {
    color: c.muted, fontSize: 8, fontWeight: 700, letterSpacing: "1px",
    marginBottom: 3, display: "block",
  };

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.65)", zIndex: 9998,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: c.bgPanel, border: `1px solid ${c.border}`,
          padding: 0, width: 340, maxHeight: "80vh", overflow: "auto",
          fontFamily: mono,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderBottom: `1px solid ${c.border}`,
        }}>
          <span style={{ color: c.orange, fontWeight: 800, fontSize: 11, letterSpacing: "1.5px" }}>
            {signalData ? "SIGNAL ORDER" : "NEW ORDER"}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: c.muted,
              cursor: "pointer", fontSize: 14, fontFamily: mono, padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Signal attribution banner */}
        {signalData && (
          <div style={{
            padding: "5px 12px", display: "flex", alignItems: "center", gap: 6,
            background: `${c.orange}10`, borderBottom: `1px solid ${c.orange}25`,
            fontSize: 8, fontFamily: mono, color: c.orange,
          }}>
            <span style={{ fontSize: 10 }}>⚡</span>
            <span style={{ fontWeight: 700, letterSpacing: "0.5px" }}>
              SIGNAL ORDER — {(signalData.signal_type || "").replace(/_/g, " ").toUpperCase()}
            </span>
            {signalData.confidence > 0 && (
              <span style={{ color: c.muted, marginLeft: "auto" }}>
                CONF {(signalData.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}

        {/* Not live warning */}
        {!isLive && (
          <div style={{
            padding: "6px 12px", background: `${c.red}10`,
            borderBottom: `1px solid ${c.red}30`, color: c.red,
            fontSize: 8, fontWeight: 700, letterSpacing: "0.5px",
          }}>
            ⚠ LIVE TRADING IS OFF — Enable in Settings → Trading
          </div>
        )}

        <div style={{ padding: "12px" }}>
          {/* Ticker */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>SYMBOL</label>
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">— Select —</option>
              {universe.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Direction: BUY / SELL */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>DIRECTION</label>
            <div style={{ display: "flex", gap: 4 }}>
              {["BUY", "SELL"].map(d => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  style={{
                    flex: 1,
                    background: direction === d ? (d === "BUY" ? `${c.green}20` : `${c.red}20`) : "transparent",
                    border: `1px solid ${direction === d ? (d === "BUY" ? c.green : c.red) : c.border}`,
                    color: direction === d ? (d === "BUY" ? c.green : c.red) : c.muted,
                    padding: "6px 0", cursor: "pointer", fontFamily: mono,
                    fontSize: 10, fontWeight: 800, letterSpacing: "1px",
                  }}
                >
                  {d === "BUY" ? "▲ BUY" : "▼ SELL"}
                </button>
              ))}
            </div>
          </div>

          {/* Order type */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>ORDER TYPE</label>
            <div style={{ display: "flex", gap: 4 }}>
              {["MARKET", "LIMIT", "STOP"].map(t => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  style={{
                    flex: 1,
                    background: orderType === t ? `${c.orange}20` : "transparent",
                    border: `1px solid ${orderType === t ? c.orange : c.border}`,
                    color: orderType === t ? c.orange : c.muted,
                    padding: "4px 0", cursor: "pointer", fontFamily: mono,
                    fontSize: 8, fontWeight: 700,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Lots */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>LOTS</label>
            {(() => {
              const brokerMin = symbolInfo?.min_lot || 0.01;
              const brokerMax = symbolInfo?.max_lot || maxLots;
              const brokerStep = symbolInfo?.lot_step || 0.01;
              // Generate smart quick-lot buttons based on broker min
              const quickLots = brokerMin >= 1
                ? [1, 2, 5, 10, 20].filter(v => v >= brokerMin && v <= brokerMax)
                : [0.01, 0.05, 0.1, 0.5, 1.0].filter(v => v >= brokerMin && v <= brokerMax);
              return (
                <>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="number" step={brokerStep} min={brokerMin} max={Math.min(brokerMax, maxLots)}
                      value={lots}
                      onChange={(e) => setLots(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    {quickLots.map(v => (
                      <button
                        key={v}
                        onClick={() => setLots(String(v))}
                        style={{
                          background: parseFloat(lots) === v ? `${c.cyan}20` : "transparent",
                          border: `1px solid ${parseFloat(lots) === v ? c.cyan : c.border}`,
                          color: parseFloat(lots) === v ? c.cyan : c.muted,
                          padding: "3px 4px", fontSize: 7, cursor: "pointer",
                          fontFamily: mono, minWidth: 28,
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 7, color: c.muted, marginTop: 2 }}>
                    Min: {brokerMin} | Max: {Math.min(brokerMax, maxLots)} | Step: {brokerStep}
                    {symbolInfo && <span style={{ marginLeft: 6, color: c.orange }}>({symbolInfo.broker_symbol || ticker})</span>}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Price (for limit/stop) */}
          {orderType !== "MARKET" && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>PRICE</label>
              <input
                type="number" step="0.00001"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentPrice ? String(currentPrice) : "Enter price"}
                style={inputStyle}
              />
            </div>
          )}

          {/* SL / TP row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>STOP LOSS</label>
              <input
                type="number" step="0.00001"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>TAKE PROFIT</label>
              <input
                type="number" step="0.00001"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Comment */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>COMMENT</label>
            <input
              type="text" maxLength={63}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Quantum Terminal"
              style={inputStyle}
            />
          </div>

          {/* Current price + P&L preview */}
          {(() => {
            // Resolve price for the actual ticker in the form (not selectedTicker)
            const tickerPrice = priceMap?.get(ticker)?.price || (ticker === selectedTicker ? currentPrice : null);
            const dec = DECIMALS[ticker?.toUpperCase()] || 2;
            const lotVal = parseFloat(lots) || 0;
            const slVal = parseFloat(stopLoss) || 0;
            const tpVal = parseFloat(takeProfit) || 0;
            const entryVal = tickerPrice || parseFloat(price) || 0;
            const isBuy = direction === "BUY";

            // $ P&L from broker symbol info:
            // $ per point per lot = tick_value / tick_size
            // $ risk = |entry - SL| × (tick_value / tick_size) × lots
            let dollarPerPoint = 0;
            if (symbolInfo?.tick_value > 0 && symbolInfo?.tick_size > 0) {
              dollarPerPoint = symbolInfo.tick_value / symbolInfo.tick_size;
            }

            let riskUsd = 0, rewardUsd = 0;
            if (entryVal > 0 && slVal > 0 && dollarPerPoint > 0) {
              const diff = isBuy ? entryVal - slVal : slVal - entryVal;
              riskUsd = diff * dollarPerPoint * lotVal;
            }
            if (entryVal > 0 && tpVal > 0 && dollarPerPoint > 0) {
              const diff = isBuy ? tpVal - entryVal : entryVal - tpVal;
              rewardUsd = diff * dollarPerPoint * lotVal;
            }

            const riskPct = accountBalance > 0 ? (Math.abs(riskUsd) / accountBalance * 100) : 0;
            const rewardPct = accountBalance > 0 ? (Math.abs(rewardUsd) / accountBalance * 100) : 0;
            const rr = riskUsd > 0 && rewardUsd > 0 ? (rewardUsd / riskUsd) : 0;

            return (
              <>
                {tickerPrice && ticker && (
                  <div style={{
                    padding: "4px 8px", marginBottom: 4,
                    background: `${dirColor}08`, border: `1px solid ${dirColor}20`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ color: c.muted, fontSize: 8 }}>{ticker} MARKET</span>
                    <span style={{ color: c.white, fontWeight: 700, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                      {tickerPrice.toFixed(dec)}
                    </span>
                  </div>
                )}
                {(riskUsd !== 0 || rewardUsd !== 0) && (
                  <div style={{
                    marginBottom: 10, padding: "5px 8px",
                    background: `${c.muted}08`, border: `1px solid ${c.border}`,
                    fontSize: 9, fontFamily: mono,
                  }}>
                    {riskUsd !== 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ color: c.red, fontWeight: 700 }}>
                          RISK: -${Math.abs(riskUsd).toFixed(2)}
                        </span>
                        {accountBalance > 0 && (
                          <span style={{ color: c.red, fontSize: 8 }}>
                            {riskPct.toFixed(2)}% of balance
                          </span>
                        )}
                      </div>
                    )}
                    {rewardUsd !== 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ color: c.green, fontWeight: 700 }}>
                          REWARD: +${Math.abs(rewardUsd).toFixed(2)}
                        </span>
                        {accountBalance > 0 && (
                          <span style={{ color: c.green, fontSize: 8 }}>
                            {rewardPct.toFixed(2)}% of balance
                          </span>
                        )}
                      </div>
                    )}
                    {rr > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${c.border}`, paddingTop: 2, marginTop: 2 }}>
                        <span style={{ color: c.white, fontWeight: 700 }}>R:R {rr.toFixed(1)}:1</span>
                        {accountBalance > 0 && (
                          <span style={{ color: c.muted, fontSize: 7 }}>
                            Balance: ${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !isLive}
            style={{
              width: "100%", padding: "8px 0",
              background: isLive ? `${dirColor}25` : `${c.muted}10`,
              border: `1px solid ${isLive ? dirColor : c.muted}`,
              color: isLive ? dirColor : c.muted,
              cursor: isLive && !submitting ? "pointer" : "not-allowed",
              fontFamily: mono, fontSize: 11, fontWeight: 800,
              letterSpacing: "1.5px",
            }}
          >
            {submitting ? "SENDING..."
              : !isLive ? "TRADING DISABLED"
              : `${direction} ${lots} ${ticker || "..."}`}
          </button>

          {/* Result feedback */}
          {result && (
            <div style={{
              marginTop: 8, padding: "6px 8px",
              background: result.success ? `${c.green}10` : `${c.red}10`,
              border: `1px solid ${result.success ? c.green : c.red}30`,
              color: result.success ? c.green : c.red,
              fontSize: 9,
            }}>
              {result.success ? "✓ " : "✗ "}{result.message}
            </div>
          )}
        </div>

        {/* Confirm overlay (inside modal) */}
        {showConfirm && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: c.bgPanel, border: `1px solid ${dirColor}40`,
              padding: 16, width: 260,
            }}>
              <div style={{ color: c.white, fontWeight: 800, fontSize: 10, marginBottom: 10 }}>
                CONFIRM ORDER
              </div>
              <div style={{ color: c.muted, fontSize: 9, marginBottom: 4 }}>
                {direction} {lots} lots <span style={{ color: c.white }}>{ticker}</span>
              </div>
              <div style={{ color: c.muted, fontSize: 9, marginBottom: 4 }}>
                Type: {orderType}{orderType !== "MARKET" && price ? ` @ ${price}` : ""}
              </div>
              {stopLoss && <div style={{ color: c.muted, fontSize: 9 }}>SL: {stopLoss}</div>}
              {takeProfit && <div style={{ color: c.muted, fontSize: 9 }}>TP: {takeProfit}</div>}

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setShowConfirm(false)}
                  style={{
                    flex: 1, background: "transparent", border: `1px solid ${c.border}`,
                    color: c.muted, padding: "6px 0", cursor: "pointer",
                    fontFamily: mono, fontSize: 9, fontWeight: 700,
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={doSubmit}
                  style={{
                    flex: 1, background: `${dirColor}20`, border: `1px solid ${dirColor}`,
                    color: dirColor, padding: "6px 0", cursor: "pointer",
                    fontFamily: mono, fontSize: 9, fontWeight: 800,
                  }}
                >
                  CONFIRM {direction}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}