// version: v5
// UpdateAvailableModal — shown once per session when /api/version reports
// that a newer release is available. Two actions: OPEN RELEASE PAGE (the
// GitHub release with notes and downloads) or LATER (stores a
// sessionStorage flag so we don't re-prompt this session).
//
// v5 — Open-source edition: no in-app installer download. Releases are
//      published on GitHub, so the modal opens the release page instead of
//      downloading and launching an executable from inside the app.
// v3 — Force-open hook: any caller can dispatch
//      window.dispatchEvent(new CustomEvent('mk:open-updater')) to pop the
//      modal regardless of the once-per-session dismiss flag (used by the
//      SettingsPanel ABOUT button).
//
// Wiring: analytical_terminal.jsx mounts useAppVersion, and renders this
// modal when update_available=true AND the user hasn't dismissed it yet.

import React, { useEffect, useState } from "react";

const C = {
  bg:        "#000",
  bgPanel:   "#0a0a0a",
  bgCard:    "#111",
  border:    "#222",
  borderLt:  "#333",
  white:     "#fff",
  text:      "#e8ecf1",
  textSoft:  "#c5cdd9",
  muted:     "#6b7785",
  orange:    "#ff6d00",
  amber:     "#f5a623",
  green:     "#27c49a",
};
const mono = "'Courier New', 'SF Mono', 'Monaco', 'Consolas', monospace";

const DISMISS_KEY = "mk_update_prompt_dismissed";

export default function UpdateAvailableModal({
  current,
  latest,
  downloadUrl,
  bannerMessage,
}) {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) !== "1"; } catch { return true; }
  });

  // If the version info changes (e.g., a newer release drops while the
  // terminal is still open), clear the dismissal so the prompt re-appears.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("mk_update_prompt_latest_seen");
      if (stored !== latest) {
        sessionStorage.removeItem(DISMISS_KEY);
        sessionStorage.setItem("mk_update_prompt_latest_seen", latest || "");
        setOpen(true);
      }
    } catch {}
  }, [latest]);

  // v3: external force-open (SettingsPanel ABOUT → DOWNLOAD LATEST VERSION).
  useEffect(() => {
    const onForceOpen = () => {
      try { sessionStorage.removeItem(DISMISS_KEY); } catch {}
      setOpen(true);
    };
    window.addEventListener("mk:open-updater", onForceOpen);
    return () => window.removeEventListener("mk:open-updater", onForceOpen);
  }, []);

  if (!open) return null;

  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setOpen(false);
  };

  // Electron routes window.open to the system browser; a plain browser
  // opens a new tab.
  const openReleasePage = () => {
    try { window.open(downloadUrl, "_blank", "noopener,noreferrer"); } catch {}
    close();
  };

  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 1000000,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: mono, padding: 30,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 440, width: "100%",
          background: C.bgCard,
          border: `1px solid ${C.orange}80`,
          borderRadius: 6,
          padding: "26px 28px 22px 28px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${C.orange}, ${C.amber})`,
        }} />

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 12px", borderRadius: 3,
          background: `${C.orange}18`, color: C.orange,
          border: `1px solid ${C.orange}60`,
          fontSize: 10, fontWeight: 800, letterSpacing: "1.3px",
          marginBottom: 16,
        }}>↑ UPDATE AVAILABLE</div>

        <h2 style={{
          fontSize: 17, color: C.white, fontWeight: 700,
          margin: "0 0 8px 0", letterSpacing: "0.3px",
        }}>A new version of Quantum Terminal is available</h2>

        <div style={{
          display: "flex", alignItems: "baseline", gap: 10,
          fontSize: 12, color: C.textSoft, marginBottom: 14,
        }}>
          <span style={{ color: C.muted }}>
            Current <span style={{ color: C.white, fontWeight: 700 }}>v{current || "—"}</span>
          </span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ color: C.muted }}>
            Latest <span style={{ color: C.green, fontWeight: 700 }}>v{latest || "—"}</span>
          </span>
        </div>

        {bannerMessage && (
          <div style={{
            padding: "8px 12px",
            background: `${C.amber}10`,
            border: `1px solid ${C.amber}40`,
            borderLeft: `3px solid ${C.amber}`,
            borderRadius: 2, marginBottom: 16,
            fontSize: 11, color: C.textSoft, lineHeight: 1.55,
          }}>{bannerMessage}</div>
        )}

        <p style={{
          fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 18,
        }}>
          The release page on GitHub has the release notes and downloads. You can keep using the current version until you're ready to update.
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={openReleasePage}
            style={{
              flex: 1, padding: "9px 14px",
              background: `${C.orange}25`, color: C.orange,
              border: `1px solid ${C.orange}`, borderRadius: 3,
              fontSize: 11, fontWeight: 800, letterSpacing: "1.2px",
              fontFamily: mono, cursor: "pointer",
            }}
          >↗ OPEN RELEASE PAGE</button>
          <button
            onClick={close}
            style={{
              padding: "9px 18px",
              background: "transparent", color: C.muted,
              border: `1px solid ${C.borderLt}`, borderRadius: 3,
              fontSize: 11, fontWeight: 800, letterSpacing: "1.2px",
              fontFamily: mono, cursor: "pointer",
            }}
          >LATER</button>
        </div>
      </div>
    </div>
  );
}
