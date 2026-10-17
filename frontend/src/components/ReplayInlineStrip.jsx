// version: v1
// ReplayInlineStrip.jsx — Slim post-Apply control strip. Show/hide chips
//   for chosen layers + GBM/MJD/BATES visibility + MAX CONES count.
//   Only flips visibility flags on already-built series; no rebuilds.
//
// Props:
//   appliedConfig — the config snapshot from the popup
//   visibility    — { weekly, monthly, quarterly, bands, regime, gbm, mjd, bates: boolean }
//   onVisibility  — (key, value) => void
//   maxCones      — number
//   onMaxCones    — (n) => void

const C = {
  bg: "#0a0a0a", border: "#222",
  white: "#fff", gray: "#999", muted: "#666", orange: "#ff6d00",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

function Chip({ on, label, color, onClick }) {
  return (
    <button type="button" aria-pressed={!!on} onClick={onClick}
      style={{
        padding: "4px 10px",
        background: on ? (color || C.orange) : "transparent",
        color: on ? "#000" : C.gray,
        border: `1px solid ${on ? (color || C.orange) : C.border}`,
        fontFamily: mono, fontSize: 9, letterSpacing: "1px",
        fontWeight: 700, cursor: "pointer",
      }}>{label}</button>
  );
}

export default function ReplayInlineStrip({
  appliedConfig, visibility, onVisibility, maxCones, onMaxCones,
}) {
  if (!appliedConfig) return null;
  const L = appliedConfig.layers;
  const anyCone = L.weekly || L.monthly || (L.quarterly && L.quarterly.enabled);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "6px 10px", background: C.bg, borderTop: `1px solid ${C.border}`,
      fontFamily: mono,
    }}>
      {/* Layer show/hide chips — only for chosen layers */}
      {L.weekly  && <Chip on={visibility.weekly}  label="WEEKLY"  onClick={() => onVisibility("weekly",  !visibility.weekly)}/>}
      {L.monthly && <Chip on={visibility.monthly} label="MONTHLY" onClick={() => onVisibility("monthly", !visibility.monthly)}/>}
      {L.quarterly?.enabled && <Chip on={visibility.quarterly} label="QUARTERLY" onClick={() => onVisibility("quarterly", !visibility.quarterly)}/>}
      {L.bands   && <Chip on={visibility.bands}  label="BANDS"   onClick={() => onVisibility("bands",  !visibility.bands)}/>}
      {L.regime?.enabled && <Chip on={visibility.regime} label="REGIME" onClick={() => onVisibility("regime", !visibility.regime)}/>}

      {/* Models — only if any cone layer */}
      {anyCone && (
        <>
          <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }}/>
          <Chip on={visibility.gbm}   label="GBM"   color="#3796ff" onClick={() => onVisibility("gbm",   !visibility.gbm)}/>
          <Chip on={visibility.mjd}   label="MJD"   color="#ffa500" onClick={() => onVisibility("mjd",   !visibility.mjd)}/>
          <Chip on={visibility.bates} label="BATES" color="#8b5cf6" onClick={() => onVisibility("bates", !visibility.bates)}/>
        </>
      )}

      {/* MAX CONES — only if any cone layer */}
      {anyCone && (
        <>
          <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }}/>
          <span style={{ fontSize: 8, color: C.muted, letterSpacing: "1.5px" }}>MAX CONES</span>
          <input type="number" min={0} value={maxCones}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onMaxCones(Number.isFinite(n) && n >= 0 ? n : 0);
            }}
            style={{
              width: 50, padding: "3px 6px", background: "#000", color: C.white,
              border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10,
              outline: "none",
            }}/>
        </>
      )}
    </div>
  );
}
