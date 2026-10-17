// version: v3
// TrumpNewsToast — right-anchored sliding panel that shows Trump-related
// headlines pulled live from Google News RSS via the Electron main process.
//
// Open via the "TRUMP" button in the StatusBar. Dismissable via close
// button, Esc, or click on the backdrop.

import { useEffect, useState, useCallback, useRef } from "react";
import { C, mono } from "./theme";
import TrumpHairIcon from "./TrumpHairIcon";

function timeAgo(pubDate) {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return pubDate;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)    return "just now";
  if (diffMin < 60)   return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}
function fetchedAgo(ts) {
  if (!ts) return "—";
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60)    return `updated ${sec}s ago`;
  if (sec < 3600)  return `updated ${Math.floor(sec / 60)}m ago`;
  return `updated ${Math.floor(sec / 3600)}h ago`;
}

export default function TrumpNewsToast({ open, onClose }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [fetchedAt, setFetchedAt] = useState(0);
  const panelRef = useRef(null);

  const isElectron = !!(typeof window !== "undefined" && window.mkElectron && window.mkElectron.fetchTrumpNews);

  const load = useCallback(async (force = false) => {
    if (!isElectron) {
      setError("Trump news feed is only available in the desktop app.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await window.mkElectron.fetchTrumpNews({ force });
      if (res?.ok) {
        setItems(res.items || []);
        setFetchedAt(res.fetchedAt || Date.now());
      } else {
        setError(res?.error || "Could not fetch news");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isElectron]);

  // First-open auto-fetch. We intentionally only depend on `open` so reopening
  // the toast doesn't re-trigger fetches; the cache lives in main process.
  useEffect(() => {
    if (open && items.length === 0 && !loading && !error) {
      load(false);
    }
  }, [open]);  // eslint config in this project does not load exhaustive-deps

  // Esc / outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const openLink = (url) => {
    if (!url) return;
    if (isElectron && window.mkElectron.openExternal) {
      window.mkElectron.openExternal(url);
    } else {
      try { window.open(url, "_blank", "noopener,noreferrer"); } catch {}
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 99998,
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: 520, maxWidth: "92vw",
          background: C.bg1,
          borderLeft: `4px solid ${C.red}`,
          boxShadow: "-12px 0 30px rgba(0,0,0,0.5)",
          zIndex: 99999,
          display: "flex", flexDirection: "column",
          fontFamily: mono, color: C.white,
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg2,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <TrumpHairIcon width={48} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 22, fontWeight: 800, letterSpacing: "2px",
              color: C.red, textTransform: "uppercase",
            }}>Trump News</div>
            <div style={{
              fontSize: 14, color: C.muted, letterSpacing: "1px", marginTop: 2,
            }}>
              source: Google News · {fetchedAt ? fetchedAgo(fetchedAt) : "fetching..."}
            </div>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            title="Refresh"
            style={{
              background: loading ? `${C.amber}25` : "transparent",
              border: `1px solid ${loading ? C.amber : C.border2}`,
              color: loading ? C.amber : C.gray,
              padding: "8px 14px", fontSize: 14, fontWeight: 700,
              fontFamily: mono, letterSpacing: "1.5px",
              cursor: loading ? "default" : "pointer",
            }}
          >{loading ? "↻ FETCHING" : "↻ REFRESH"}</button>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: "transparent", border: `1px solid ${C.border2}`,
              color: C.gray, padding: "8px 14px", fontSize: 18, fontWeight: 700,
              fontFamily: mono, cursor: "pointer", lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {error && (
            <div style={{
              padding: "14px 16px", marginBottom: 12,
              background: `${C.red}10`, border: `1px solid ${C.red}55`,
              fontSize: 16, color: C.red, lineHeight: 1.5,
            }}>
              ⚠ {error}
              <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>
                Click REFRESH to retry. If this persists, your network may be blocking news.google.com.
              </div>
            </div>
          )}

          {!error && loading && items.length === 0 && (
            <div style={{
              padding: 36, textAlign: "center",
              color: C.muted, fontSize: 18, letterSpacing: "1.5px",
            }}>
              FETCHING HEADLINES…
            </div>
          )}

          {!error && !loading && items.length === 0 && (
            <div style={{
              padding: 30, textAlign: "center",
              color: C.muted, fontSize: 16, lineHeight: 1.5,
            }}>
              No Trump-related headlines found.
            </div>
          )}

          {items.map((it, i) => (
            <div key={i}
              onClick={() => openLink(it.link)}
              style={{
                padding: "12px 14px", marginBottom: 8,
                background: C.bg2, border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${C.red}77`,
                cursor: it.link ? "pointer" : "default",
              }}
              onMouseEnter={e => { if (it.link) e.currentTarget.style.background = C.bg3; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.bg2; }}
            >
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                gap: 10, marginBottom: 6,
              }}>
                <span style={{
                  fontSize: 13, color: C.amber, fontWeight: 700, letterSpacing: "1.2px",
                  textTransform: "uppercase",
                }}>{it.source || "—"}</span>
                <span style={{ fontSize: 13, color: C.muted, letterSpacing: "0.5px" }}>
                  {timeAgo(it.pubDate)}
                </span>
              </div>
              <div style={{
                fontSize: 17, color: C.white, fontWeight: 600, lineHeight: 1.45,
              }}>
                {it.title}
              </div>
              {it.link && (
                <div style={{
                  fontSize: 12, color: C.cyan, marginTop: 6, letterSpacing: "0.5px",
                }}>↗ open in browser</div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 20px",
          borderTop: `1px solid ${C.border}`,
          background: C.bg2,
          fontSize: 13, color: C.muted, letterSpacing: "1px",
        }}>
          {items.length} item{items.length === 1 ? "" : "s"} · cached 5 min · click outside or press Esc to close
        </div>
      </div>
    </>
  );
}
