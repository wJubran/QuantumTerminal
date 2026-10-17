// version: v2
// OptionsCockpit.jsx — top-level container for the Options Cockpit sub-tab.
// v2 — full implementation: mode toggle + universe scan strip + per-asset
//      cockpit, all wired via useOptionsCockpit. v1 was the placeholder.
import React from "react";
import { CK, mono } from "./cockpit_theme";
import ModeToggle         from "./ModeToggle";
import UniverseScanStrip  from "./UniverseScanStrip";
import Cockpit            from "./Cockpit";
import { useOptionsCockpit } from "./useOptionsCockpit";

export default function OptionsCockpit() {
  const {
    mode, setMode,
    selectedAsset, setSelectedAsset,
    selectedPayload, selectedLoading, selectedError,
    universe, indexLoading, refreshUniverse,
  } = useOptionsCockpit();

  return (
    <div style={{
      minHeight: "100%", background: CK.bg, fontFamily: mono, color: CK.text,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 18px", borderBottom: `1px solid ${CK.border}`,
        background: "linear-gradient(180deg, #0d1218 0%, #0a0e14 100%)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.5px" }}>
          OPTIONS COCKPIT
          <span style={{ color: CK.muted, fontWeight: 400, marginLeft: 10 }}>
            {indexLoading ? "loading universe…" :
              universe.length > 0
                ? `${universe.length} tickers · ${selectedAsset || "—"} selected`
                : "no universe"}
          </span>
        </div>
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      <UniverseScanStrip
        universe={universe}
        selectedAsset={selectedAsset}
        onSelect={setSelectedAsset}
        onRefresh={refreshUniverse}
        mode={mode}
      />

      {selectedAsset
        ? (
          <Cockpit
            ticker={selectedAsset}
            mode={mode}
            payload={selectedPayload}
            loading={selectedLoading}
            error={selectedError}
          />
        )
        : (
          <div style={{ padding: 40, color: CK.muted, fontSize: 12, textAlign: "center" }}>
            Pick an asset from the strip above.
          </div>
        )
      }
    </div>
  );
}
