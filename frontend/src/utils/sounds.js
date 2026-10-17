// version: v3
// v3 — Added user_message event (envelope chime when a User Messages broadcast
//      arrives). Used by useUserMessages on a TRUE unread-count increase.
// sounds.js — central audio alert utility for the Consumer Terminal.
//
//   • One named event per alert (connected, order_filled, etc.)
//   • Preloads the WAV files on import so the first trigger has no delay
//   • Master enable/disable persists to localStorage; default ON
//   • Concurrent triggers clone the Audio node so back-to-back events
//     don't cut each other off
//   • Files are served by CRA from terminal_app/public/sounds/<file>.wav
//
// v2 — Diagnostic logging via console.warn on load/play failure so
//      "no sound" symptoms can be triaged by checking DevTools instead
//      of guessing whether the file 404'd, autoplay was blocked, or the
//      master switch was off.
//
// Adding a new event: drop the .wav in public/sounds/ and add a row to
// SOUND_FILES below. Then call playSound("<event>") wherever it triggers.

const STORAGE_KEY = "mk_sound_enabled";

// Map: event key → URL relative to the React build root.
export const SOUND_FILES = {
  connected:      "/sounds/connected.wav",
  disconnected:   "/sounds/disconnected.wav",
  order_filled:   "/sounds/order_filled.wav",
  order_placed:   "/sounds/order_placed.wav",
  target_hit:     "/sounds/target_hit.wav",
  stoploss_hit:   "/sounds/stoploss_hit.wav",
  regime_change:  "/sounds/regime_change.wav",
  band_extreme:   "/sounds/band_extreem.wav",
  user_message:   "/sounds/you_have_a_msg.wav",   // v3
};

// Cached preloaded Audio elements per event, used as templates for cloneNode.
const _audios = {};
function _ensureAudio(event) {
  if (_audios[event]) return _audios[event];
  const src = SOUND_FILES[event];
  if (!src) {
    console.warn(`[sounds] unknown event: ${event}`);
    return null;
  }
  try {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = 0.6;
    // v2: surface load failures (404 etc.) so we can tell the difference
    //     between "audio doesn't exist" and "audio blocked by autoplay".
    a.addEventListener("error", () => {
      console.warn(`[sounds] failed to load: ${src}`);
    });
    _audios[event] = a;
    return a;
  } catch (e) {
    console.warn(`[sounds] new Audio threw for ${event}:`, e);
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export function isSoundEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v !== "false";  // default ON
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try { localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false"); } catch {}
}

// Plays the named event's sound. Silent no-op if sound is disabled, the
// event isn't registered, or the browser blocks autoplay.
export function playSound(event) {
  if (!isSoundEnabled()) {
    console.debug(`[sounds] muted (master off): ${event}`);
    return;
  }
  const tpl = _ensureAudio(event);
  if (!tpl) return;
  try {
    // cloneNode allows overlapping playback for rapid-fire events.
    const clip = tpl.cloneNode(true);
    clip.volume = tpl.volume;
    const p = clip.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn(`[sounds] play() rejected for ${event}:`, err?.name || err);
      });
    }
  } catch (e) {
    console.warn(`[sounds] play threw for ${event}:`, e);
  }
}

// Preload every registered sound on first import so triggers are
// latency-free. Best effort; failures are silent.
try {
  for (const k of Object.keys(SOUND_FILES)) _ensureAudio(k);
} catch { /* ignore */ }
