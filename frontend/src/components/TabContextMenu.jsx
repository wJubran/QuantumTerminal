// version: v1
/**
 * TabContextMenu — small popup shown on right-click of a top-nav tab in the
 * main window. Single item: "Open in New Window".
 *
 * Closes on outside-click / Esc / scroll. Disables the item with a tooltip
 * if window.mkElectron isn't present (browser dev fallback).
 */
import { useEffect, useRef } from "react";

const mono = "'Courier New', Consolas, 'Liberation Mono', monospace";

export default function TabContextMenu({ x, y, pageId, pageLabel, onClose }) {
  const ref = useRef(null);
  const isElectron = !!(typeof window !== "undefined" && window.mkElectron && window.mkElectron.openInNewWindow);

  useEffect(() => {
    const onMouseDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey       = (e) => { if (e.key === "Escape") onClose(); };
    const onScroll    = () => onClose();
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const handleClick = async () => {
    if (!isElectron) return;
    try {
      const res = await window.mkElectron.openInNewWindow(pageId);
      if (!res?.ok) console.error("[TabContextMenu] openInNewWindow failed:", res?.error);
    } catch (e) {
      console.error("[TabContextMenu] openInNewWindow threw:", e);
    } finally {
      onClose();
    }
  };

  // Keep menu on-screen
  const adjX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1920) - 240);
  const adjY = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 1080) - 60);

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
      <button
        disabled={!isElectron}
        onClick={handleClick}
        title={isElectron ? "" : "Available only in the desktop app"}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          color: isElectron ? "#fff" : "#666",
          padding: "8px 12px",
          textAlign: "left",
          cursor: isElectron ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          fontSize: "inherit",
          letterSpacing: "0.5px",
        }}
        onMouseEnter={(e) => { if (isElectron) e.currentTarget.style.background = "#1a1a1a"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: "12px", lineHeight: 1 }}>↗</span>
        <span>Open in New Window</span>
        <span style={{ flex: 1 }} />
        {pageLabel && <span style={{ color: "#666", fontSize: "9px" }}>{pageLabel}</span>}
      </button>
    </div>
  );
}
