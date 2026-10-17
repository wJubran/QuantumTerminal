// version: v1
// mk_debug_telemetry.js — disposable diagnostic harness.
//
// Loaded as a raw <script> tag from public/index.html (gated by
// REACT_APP_MK_DEBUG=1 at build time). Runs BEFORE the React bundle so
// the monkey-patches on global timers see all subsequent allocations.
//
// Public API:
//   window.__mkDebug
//     .longTasks  []  { ts, duration, name }
//     .memorySnaps[]  { ts, usedJS, totalJS, jsLimit }
//     .counters   []  { ts, intervals, timeouts, rafs, observers,
//                       assetsMapSize, barsArrLen, signalsLen }
//     .syncEvents []  { ts, type, detail? }
//     .notes      []  { ts, text }
//     .config     {}  { sampleIntervalMs, maxLongTasks, maxCounters }
//     .note(text)     push a free-form timestamped note
//     .dump()         copy capture to clipboard as JSON
//     .reset()        clear all arrays
//
// After the diagnostic session, run __mkDebug.dump() in DevTools and
// paste into a file `frontend_capture.json`.
//
// Disposable — see spec §8 (Removal procedure):
//   docs/specs/2026-05-05-debug-telemetry-harness-design.md

(function () {
  "use strict";
  if (typeof window === "undefined") return;

  function nowIso() {
    return new Date().toISOString();
  }

  // ----- Config + buffers -----
  const CFG = { sampleIntervalMs: 30000, maxLongTasks: 10000, maxCounters: 500 };

  const dbg = {
    startedAt: nowIso(),
    longTasks: [],
    memorySnaps: [],
    counters: [],
    syncEvents: [],
    notes: [],
    config: CFG,

    note(text) {
      try {
        dbg.notes.push({ ts: nowIso(), text: String(text == null ? "" : text) });
      } catch (e) {
        console.error("[mkDebug] note() failed:", e);
      }
    },

    dump() {
      const payload = JSON.stringify({
        startedAt: dbg.startedAt,
        capturedAt: nowIso(),
        longTasks: dbg.longTasks,
        memorySnaps: dbg.memorySnaps,
        counters: dbg.counters,
        syncEvents: dbg.syncEvents,
        notes: dbg.notes,
        config: dbg.config,
        userAgent: (typeof navigator !== "undefined") ? navigator.userAgent : "",
      }, null, 2);
      dbg.lastDump = payload;

      try {
        navigator.clipboard.writeText(payload).then(
          () => console.info(
            "[mkDebug] capture (%d KB) copied to clipboard",
            Math.round(payload.length / 1024)
          ),
          (err) => console.error(
            "[mkDebug] clipboard failed:", err,
            "— payload also in __mkDebug.lastDump"
          )
        );
      } catch (e) {
        console.error(
          "[mkDebug] clipboard not available; payload in __mkDebug.lastDump"
        );
      }
      return payload.length;
    },

    reset() {
      dbg.longTasks = [];
      dbg.memorySnaps = [];
      dbg.counters = [];
      dbg.syncEvents = [];
      dbg.notes = [];
    },
  };

  window.__mkDebug = dbg;

  // ----- Long-task observer -----
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (dbg.longTasks.length >= CFG.maxLongTasks) break;
        dbg.longTasks.push({
          ts: nowIso(),
          duration: Math.round(e.duration),
          name: e.name || "self",
        });
      }
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch (e) {
    console.warn("[mkDebug] longtask observer not supported:", e);
  }

  // ----- Memory snapshots -----
  function snapMemory() {
    if (!performance || !performance.memory) return;
    if (dbg.memorySnaps.length >= 200) return; // cap
    dbg.memorySnaps.push({
      ts: nowIso(),
      usedJS: performance.memory.usedJSHeapSize,
      totalJS: performance.memory.totalJSHeapSize,
      jsLimit: performance.memory.jsHeapSizeLimit,
    });
  }
  setInterval(snapMemory, CFG.sampleIntervalMs);
  snapMemory(); // initial baseline

  // ----- Active counter monkey-patches -----
  // setInterval / clearInterval
  const _origSetInterval = window.setInterval.bind(window);
  const _origClearInterval = window.clearInterval.bind(window);
  const _activeIntervals = new Set();
  window.setInterval = function (handler, timeout) {
    const args = Array.prototype.slice.call(arguments);
    const id = _origSetInterval.apply(window, args);
    _activeIntervals.add(id);
    return id;
  };
  window.clearInterval = function (id) {
    _activeIntervals.delete(id);
    return _origClearInterval(id);
  };

  // setTimeout / clearTimeout
  const _origSetTimeout = window.setTimeout.bind(window);
  const _origClearTimeout = window.clearTimeout.bind(window);
  const _activeTimeouts = new Set();
  window.setTimeout = function (handler, timeout) {
    const args = Array.prototype.slice.call(arguments);
    const id = _origSetTimeout.apply(window, args);
    _activeTimeouts.add(id);
    // self-cleanup: when the timer fires it's no longer active
    return id;
  };
  window.clearTimeout = function (id) {
    _activeTimeouts.delete(id);
    return _origClearTimeout(id);
  };

  // requestAnimationFrame: track rate of scheduling over the last 30s.
  // RAFs self-fire and self-clear, so "active count" doesn't fit; instead
  // record a sliding window of timestamps.
  const _origRAF = window.requestAnimationFrame.bind(window);
  const _rafTimes = [];
  window.requestAnimationFrame = function (cb) {
    _rafTimes.push(Date.now());
    return _origRAF(cb);
  };
  function rafsInLastWindow() {
    const cutoff = Date.now() - CFG.sampleIntervalMs;
    while (_rafTimes.length && _rafTimes[0] < cutoff) _rafTimes.shift();
    return _rafTimes.length;
  }

  // ResizeObserver count
  let _activeObservers = 0;
  if (typeof window.ResizeObserver === "function") {
    const _OrigRO = window.ResizeObserver;
    window.ResizeObserver = function PatchedResizeObserver(cb) {
      const ro = new _OrigRO(cb);
      _activeObservers++;
      const origDisconnect = ro.disconnect.bind(ro);
      ro.disconnect = function () {
        _activeObservers = Math.max(0, _activeObservers - 1);
        return origDisconnect();
      };
      return ro;
    };
    // Preserve prototype for `instanceof` checks
    window.ResizeObserver.prototype = _OrigRO.prototype;
  }

  // ----- Counter snapshot loop -----
  function snapCounters() {
    if (dbg.counters.length >= CFG.maxCounters) return;
    let assetsMapSize = null;
    let barsArrLen = null;
    let signalsLen = null;
    try {
      const h = window.__mkDebugHandle;
      if (h) {
        if (h.assets && typeof h.assets.size === "number") assetsMapSize = h.assets.size;
        else if (h.assets && Array.isArray(h.assets)) assetsMapSize = h.assets.length;
        if (typeof h.barsLen === "number") barsArrLen = h.barsLen;
        if (typeof h.signalsLen === "number") signalsLen = h.signalsLen;
      }
    } catch (e) { /* swallow */ }
    dbg.counters.push({
      ts: nowIso(),
      intervals: _activeIntervals.size,
      timeouts: _activeTimeouts.size,
      rafs: rafsInLastWindow(),
      observers: _activeObservers,
      assetsMapSize: assetsMapSize,
      barsArrLen: barsArrLen,
      signalsLen: signalsLen,
    });
  }
  setInterval(snapCounters, CFG.sampleIntervalMs);
  snapCounters(); // initial baseline

  // ----- Sync-event tap -----
  try {
    window.addEventListener("mk:data-sync-complete", function (e) {
      if (dbg.syncEvents.length >= 5000) return;
      dbg.syncEvents.push({
        ts: nowIso(),
        type: "mk:data-sync-complete",
        detail: (e && e.detail) ? e.detail : null,
      });
    });
  } catch (e) {
    console.warn("[mkDebug] sync-event tap install failed:", e);
  }

  console.info(
    "[mkDebug] harness installed at %s — call __mkDebug.dump() to capture",
    dbg.startedAt
  );
})();
