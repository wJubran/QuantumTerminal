// version: v1
// ReplayLoadingBar.jsx — Full-width progress bar shown between Apply and
//   replay-running. Phase label updates as orchestrator advances.
//
// Props:
//   phase    — string (current phase label)
//   error    — string | null (if non-null, bar turns red and shows message)
//   onRetry  — () => void (retry the same load — only shown on error)
//   onBack   — () => void (back to Configuration popup — only shown on error)

const C = {
  bg: "#0a0a0a", border: "#222",
  white: "#fff", gray: "#999", muted: "#666",
  orange: "#ff6d00", red: "#e8383b",
};
const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

export default function ReplayLoadingBar({ phase, error, onRetry, onBack }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", gap: 14,
      background: C.bg, fontFamily: mono,
    }}>
      <div style={{
        width: "60%", maxWidth: 480, height: 4,
        background: "#1a1a1a", overflow: "hidden", position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%", width: "30%",
          background: error ? C.red : C.orange,
          animation: error ? "none" : "mkReplayLoadSweep 1.4s linear infinite",
        }}/>
      </div>
      <div style={{
        fontSize: 10, color: error ? C.red : C.white,
        letterSpacing: "1.5px", fontWeight: 700,
      }}>{error || phase || "Loading…"}</div>
      {error && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onRetry}
            style={{
              padding: "6px 16px", background: C.orange, color: "#000",
              border: `1px solid ${C.orange}`, fontFamily: mono, fontSize: 10,
              letterSpacing: "1px", fontWeight: 800, cursor: "pointer",
            }}>RETRY</button>
          <button type="button" onClick={onBack}
            style={{
              padding: "6px 16px", background: "transparent", color: C.gray,
              border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10,
              letterSpacing: "1px", fontWeight: 700, cursor: "pointer",
            }}>BACK TO CONFIGURATION</button>
        </div>
      )}
      <style>{`
        @keyframes mkReplayLoadSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(467%); }
        }
      `}</style>
    </div>
  );
}
