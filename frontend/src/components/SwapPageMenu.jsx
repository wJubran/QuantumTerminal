// version: v1
/**
 * SwapPageMenu — popup shown on right-click of the orange child-window
 * border inside a detached window. Lists the 6 detachable pages with the
 * current one highlighted/disabled. Picking another page hot-swaps the
 * window's content without reload (URL updated via history.replaceState).
 */
import { useEffect, useRef } from "react";

const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

const PAGES = [
  { id: "quant",       label: "Quant Analysis"   },
  { id: "fundamental", label: "Fundamental"      },
  { id: "flow",        label: "Money Flow"       },
  { id: "options",     label: "Options Quant"    },
  { id: "stress",      label: "Stress Lab"       },
  { id: "learn",       label: "Learning Center"  },
];

export default function SwapPageMenu({ x, y, currentPageId, onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onMouseDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey       = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const adjX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1920) - 240);
  const adjY = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 1080) - 260);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: adjX,
        top: adjY,
        background: "#0a0a0a",
        border: "1px solid #333",
        boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
        padding: 4,
        minWidth: 220,
        zIndex: 10000,
        fontFamily: mono,
        fontSize: "10px",
      }}
    >
      <div style={{
        padding: "6px 12px 4px",
        color: "#666",
        letterSpacing: "1.5px",
        fontWeight: 700,
        fontSize: "8px",
        borderBottom: "1px solid #222",
        textTransform: "uppercase",
      }}>
        Switch Page
      </div>
      {PAGES.map(p => {
        const isCurrent = p.id === currentPageId;
        return (
          <button
            key={p.id}
            disabled={isCurrent}
            onClick={() => onSelect(p.id)}
            style={{
              display: "block",
              width: "100%",
              background: "transparent",
              border: "none",
              color: isCurrent ? "#ff6d00" : "#fff",
              padding: "8px 12px",
              textAlign: "left",
              cursor: isCurrent ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: "inherit",
              letterSpacing: "0.5px",
              fontWeight: isCurrent ? 700 : 400,
            }}
            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = "#1a1a1a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {isCurrent ? "● " : "○ "}{p.label}
            {isCurrent && <span style={{ marginLeft: 8, fontSize: "8px", color: "#888" }}>(current)</span>}
          </button>
        );
      })}
    </div>
  );
}
