// version: v6
//
// v6 — Open-source edition: removed secureSavePassword / secureLoadPassword /
//      secureClearPassword (no login any more) and downloadAndInstall (updates
//      are GitHub releases opened in the browser).
// Electron preload — context bridge for privileged native APIs.
//
// Anything renderer-side that needs to talk to the OS (file save dialog,
// open new window, etc.) goes through here.
//
// v5 — F-24 (Security wave 2): exposes secureSavePassword /
//      secureLoadPassword / secureClearPassword that route to main's
//      safeStorage via IPC. Replaces consumer-side plaintext password
//      in localStorage (audit F-24 vulnerability). LoginScreen.jsx v50
//      consumes these; one-time migration in v50 reads any legacy
//      localStorage.mk_saved_pass, encrypts it, then deletes the
//      plaintext. See main.js v9 for IPC handler details + storage path.
// v4 — exposes downloadAndInstall(url, onProgress) for the in-app updater.
//      The main process streams the installer to %TEMP%, fires
//      "mk:installer-progress" events for the UI, then spawns the .exe
//      detached and quits the terminal. Renderer-side callers wire the
//      onProgress callback to a progress bar and await the return value.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mkElectron", {
  isElectron: true,

  // saveScreenshot(suggestedName, bytes)
  //   suggestedName: string filename ("US500_M15_2026-04-27.png")
  //   bytes:         Uint8Array | ArrayBuffer of raw PNG bytes
  //   returns:       Promise<{ saved: boolean, path?: string }>
  //
  // Bypasses Chromium's download manager — instead the main process pops
  // a native dialog.showSaveDialog and fs.writeFile-s the buffer directly.
  // Much faster than `link.click()` on a data URL.
  saveScreenshot: async (suggestedName, bytes) => {
    // Bytes can be Uint8Array (good) or ArrayBuffer (we wrap). IPC handles
    // typed arrays as Buffer on the main side.
    const buf = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    return ipcRenderer.invoke("mk:save-screenshot", { suggestedName, bytes: buf });
  },

  // openInNewWindow(pageId)
  //   pageId: one of "quant" | "fundamental" | "flow" | "options" | "stress" | "learn"
  //   returns: Promise<{ ok: boolean, error?: string }>
  //
  // Asks the main process to spawn a child BrowserWindow that loads the
  // same React app with `?detached=<pageId>` so the renderer boots into
  // DetachedShell mode. Each child window has parent: mainWindow so it
  // closes automatically when the user closes the main window.
  openInNewWindow: (pageId) => ipcRenderer.invoke("mk:open-in-new-window", { pageId }),

  // fetchTrumpNews({ force? })
  //   returns Promise<{ ok, items?: [{title, link, pubDate, source}], fetchedAt?, cached?, error? }>
  //
  // Main process pulls the Google News RSS feed (search=Trump), parses items,
  // caches in-memory for 5 min. Pass { force: true } to bypass cache.
  fetchTrumpNews: (opts) => ipcRenderer.invoke("mk:fetch-trump-news", opts || {}),

  // openExternal(url)
  //   Opens the given URL in the user's default browser via shell.openExternal.
  //   Only http(s) URLs are allowed.
  openExternal: (url) => ipcRenderer.invoke("mk:open-external", url),
});
