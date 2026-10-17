// version: v3
// WatchlistConfig.jsx — drawer for editing the pulse watchlist.
// Each asset row: symbol + CO checkbox + QB checkbox.

import React, { useEffect, useState } from "react";
import css from "./styles.module.css";

// Phase 1 supported universe — trimmed to symbols where both cones and bands
// files exist in the cache. Assets without bands (BRENT, USDCHF, NZDUSD,
// EURJPY, GBPJPY, US30) are excluded so users can't pick something the
// builder will silently skip. Phase 2 will replace this with a runtime
// check via /api/pulse/state's `available_assets` field.
const KNOWN_ASSETS = [
  "XAUUSD", "XAGUSD", "XTIUSD",
  "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD",
  "US500", "USTEC", "UK100", "GER40",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD",
  "DXY",
];

export default function WatchlistConfig({ watchlist, onSave, onCancel }) {
  const [draft, setDraft] = useState({});

  // Initialize the draft once on mount from whatever watchlist was passed.
  // Empty deps are intentional: we deliberately do NOT re-sync from the prop
  // because pulseStore polls /api/pulse/state every 10 s and replaces the
  // watchlist reference each time — re-syncing would clobber the user's
  // in-progress edits. Drawer is mount-take-snapshot; edits persist until
  // Save or Cancel.
  useEffect(() => {
    const d = {};
    for (const a of watchlist?.assets || []) {
      d[a.symbol] = new Set(a.families || []);
    }
    setDraft(d);
  }, []);

  const isSelected = (sym, fam) => draft[sym]?.has(fam);

  const toggle = (sym, fam) => {
    setDraft(prev => {
      const next = { ...prev };
      const current = new Set(next[sym] || []);
      if (current.has(fam)) current.delete(fam); else current.add(fam);
      if (current.size === 0) delete next[sym];
      else next[sym] = current;
      return next;
    });
  };

  const handleSave = () => {
    const assets = Object.entries(draft)
      .filter(([_, fams]) => fams && fams.size > 0)
      .map(([symbol, fams]) => ({ symbol, families: Array.from(fams).sort() }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    onSave({ assets });
  };

  return (
    <div style={{
      position: "absolute", inset: 0, background: "#06060Eee",
      display: "flex", alignItems: "stretch", justifyContent: "center",
      padding: 24, zIndex: 60,
    }}>
      <div style={{
        width: 480, maxHeight: "100%", overflowY: "auto",
        background: "#09091A", border: "1px solid rgba(232,184,75,0.18)",
        borderRadius: 8, padding: 18, fontFamily: "monospace",
      }}>
        <div className={css.title} style={{ marginBottom: 12 }}>
          Configure Pulse Watchlist
        </div>
        <div className={css.muted} style={{ fontSize: 10, marginBottom: 16 }}>
          Pick assets to scan. For each asset, choose which element families to track.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px",
                        fontSize: 9, color: "#9A7830", letterSpacing: 2,
                        textTransform: "uppercase", padding: "0 6px 4px" }}>
            <div>Asset</div><div>CO</div><div>QB</div>
          </div>
          {KNOWN_ASSETS.map(sym => (
            <div key={sym} style={{
              display: "grid", gridTemplateColumns: "1fr 60px 60px",
              padding: "6px 6px", borderRadius: 3,
              background: draft[sym] ? "rgba(232,184,75,0.04)" : "transparent",
              fontSize: 11, color: "#FFF",
            }}>
              <div style={{ letterSpacing: 1 }}>{sym}</div>
              <input type="checkbox" checked={isSelected(sym, "CO")} onChange={() => toggle(sym, "CO")} />
              <input type="checkbox" checked={isSelected(sym, "QB")} onChange={() => toggle(sym, "QB")} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnStyle("muted")}>Cancel</button>
          <button onClick={handleSave} style={btnStyle("primary")}>Save</button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(kind) {
  const base = {
    padding: "6px 14px", fontFamily: "monospace", fontSize: 10,
    letterSpacing: 2, textTransform: "uppercase", cursor: "pointer",
    borderRadius: 3, background: "transparent",
  };
  if (kind === "primary")
    return { ...base, color: "#E8B84B", border: "1px solid #E8B84B" };
  return { ...base, color: "#4A3C28", border: "1px solid #4A3C28" };
}
