// version: v10
// v10 — Open-source edition: removed the in-app updater IPC
//       (mk:download-and-install — it downloaded and launched an installer
//       from a URL supplied by the page) and the saved-password IPC
//       (mk:secure-*-password — there is no login any more). Updates are
//       published as GitHub releases, which the UI opens in the browser.
// v9 — F-24 (Security wave 2): three new IPC handlers for encrypted
//      credential storage via Electron safeStorage. Replaces the
//      consumer-side plaintext password in localStorage (the audit's
//      F-24 vulnerability). safeStorage uses the OS keychain — DPAPI on
//      Windows, Keychain on macOS, libsecret on Linux. Encrypted blob
//      written to `app.getPath('userData')/mk_credentials.json` (same
//      Electron userData dir as session storage). LoginScreen.jsx v50
//      consumes these via window.mkElectron.secureSavePassword/
//      secureLoadPassword/secureClearPassword and runs a one-time
//      migration that reads any legacy localStorage.mk_saved_pass,
//      encrypts it, then deletes the plaintext. Bus thread:
//      security-audit-2026-05-09 + terminal_server_vps msg #166.
// v8 — Ctrl+= / Ctrl+- / Ctrl+0 zoom shortcuts + external-URL routing
//      (2026-05-08). Two operator-requested changes:
//       (1) Restored browser-style font zoom that v1 had natively (browser
//           mode). Wired via webContents.setZoomLevel; Ctrl+0 resets to
//           100%. Range clamped to [-8, +9] (V8's safe zone). Applied to
//           BOTH the main window and detached windows. Existing F12 dev-
//           tools toggle stays dev-only; zoom is always-on.
//       (2) Added setWindowOpenHandler to BrowserWindows so window.open()
//           calls and <a target="_blank"> clicks route to the OS default
//           browser via shell.openExternal instead of spawning an embedded
//           Electron child window. Specific motivator: the "OPEN FREE
//           DEMO ACCOUNT" button in SettingsPanel was opening the broker
//           site inside a stripped-down Electron sub-window.
// v7 — Drop the /S NSIS silent flag from the installer spawn. Electron-
//      builder's oneClick:true installer is already near-silent (small
//      progress window only) AND its .onInstSuccess auto-launches the
//      new exe. The /S flag put NSIS into truly-silent mode which
//      ALSO suppressed the auto-launch hook — so the update finished
//      with no terminal running, requiring the user to click the
//      shortcut. With /S dropped, oneClick handles both: silent UX
//      (small NSIS progress only) + auto-relaunch.
// v6 — Silent NSIS install. The installer is now spawned with /S and
//      windowsHide: true so no NSIS GUI flashes during update. Combined
//      with oneClick:true in electron-builder NSIS config, the installer
//      runs silently and auto-launches the new exe on completion.
// v5 — IPC: mk:download-and-install. Replaces the old "open download URL
//      in a new window" flow which spawned a blank Electron child window
//      and then chained Chromium's download dialog. Now the URL is fetched
//      directly via https/http (with redirects), streamed to %TEMP%, the
//      installer is spawned detached, and the running terminal quits so
//      NSIS can replace the install dir without "in use" conflicts.
// Quantum Terminal Consumer — Electron main process
// =============================================================================
// Approach: minimal-risk, maximum-reuse.
//
//   1. Spawn the existing Python backend (PyInstaller-built data_server.exe in
//      production, or `python data_server.py` from venv_consumer in dev) as a
//      hidden child process — `windowsHide: true` so the user sees no console.
//
//   2. Wait for /api/health to come up.
//
//   3. Open a single BrowserWindow pointing at http://127.0.0.1:8502/ — same
//      URL the browser opens today. All React fetch('/api/...') calls resolve
//      relative to that host, no frontend code changes required.
//
//   4. On window close: kill the backend child cleanly so no zombie process.
//
// This is intentionally a thin shell. The whole React/LWC/data pipeline is
// untouched — same code as production. If this proves stable, follow-ups can
// switch the renderer to load from a local file:// build for full offline /
// no-localhost-port operation.

const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs   = require("fs");
const http = require("http");

// v2 uses port 8503 (v1 uses 8502) so both can run simultaneously without
// conflict. Explicitly passed to the backend via --port so server_config
// defaults can't override.
const BACKEND_PORT = 8503;
const BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`;
const HEALTH_URL   = `${BACKEND_URL}/api/health`;
const READY_TIMEOUT_MS = 60_000;   // give the backend up to 60s to come up
const HEALTH_POLL_MS   = 500;

let backendProc = null;
let mainWindow  = null;
let isQuitting  = false;

// Registry of detached child windows (right-click "Open in New Window" → page).
// `parent: mainWindow` causes Electron to auto-close these when main closes,
// so we just need to track membership for cleanup + future broadcast features.
const detachedWindows = new Set();

// Allowlist must match the renderer's VALID_PAGES in useDetachedMode.js.
const VALID_DETACHED_PAGES = new Set(["quant", "fundamental", "flow", "options", "stress", "learn"]);

// ── 1. Locate the backend ─────────────────────────────────────────────────
//   Production (after `npm run dist`):
//     extraResources copies `source code/backend/` to `<resourcesDir>/backend/`
//     PyInstaller exe is expected at `<resourcesDir>/backend/dist/data_server/data_server.exe`
//     Falling back to `<resourcesDir>/backend/data_server.exe` if the user
//     copied the PyInstaller output one level up.
//   Development (`npm start` or `npm run start:dev`):
//     Look for venv_consumer + data_server.py beside the project tree.
function findBackendCommand() {
  const isDev = !app.isPackaged;
  const projectRoot = isDev
    ? path.resolve(__dirname, "..")             // v2/ folder
    : process.resourcesPath;                    // electron resources/ in installed app

  const candidates = [];

  // Spawn launcher.py — it imports data_server.app, mounts the React build
  // at /, and runs uvicorn. Spawning data_server.py directly only serves
  // /api/* and 404s on the root URL.
  // Port + no-browser are env vars (MK_PORT, MK_NO_BROWSER), set in startBackend().

  // Production: prebuilt PyInstaller exe inside extraResources
  if (!isDev) {
    candidates.push({
      cmd:  path.join(projectRoot, "backend", "dist", "data_server", "data_server.exe"),
      args: [],
      cwd:  path.join(projectRoot, "backend", "dist", "data_server"),
      label: "packaged: extraResources/backend/dist/data_server/",
    });
    candidates.push({
      cmd:  path.join(projectRoot, "backend", "data_server.exe"),
      args: [],
      cwd:  path.join(projectRoot, "backend"),
      label: "packaged: extraResources/backend/",
    });
  }

  // Dev: run launcher.py from this repository (electron_shell/ sits next to
  //   backend/), or from the legacy `source code/` layout. Prefer a project
  //   venv (.venv / venv / venv_consumer — Windows or POSIX layout), then
  //   the Python on PATH for the "cloned it, no venv yet" first run.
  if (isDev) {
    const launcherPy = [
      path.join(projectRoot, "backend", "launcher.py"),
      path.join(projectRoot, "source code", "backend", "launcher.py"),
    ].find((p) => fs.existsSync(p));
    if (launcherPy) {
      const repoRoot = path.dirname(path.dirname(launcherPy));
      for (const venv of [".venv", "venv", "venv_consumer"]) {
        for (const py of [path.join(repoRoot, venv, "Scripts", "python.exe"),
                          path.join(repoRoot, venv, "bin", "python")]) {
          candidates.push({ cmd: py, args: [launcherPy], cwd: path.dirname(launcherPy),
                            label: `dev: ${venv} + launcher.py` });
        }
      }
      candidates.push({
        cmd: process.platform === "win32" ? "python" : "python3",
        args: [launcherPy], cwd: path.dirname(launcherPy), onPath: true,
        label: "dev: system python (no venv detected, may fail without deps installed)",
      });
    }
  }

  for (const c of candidates) {
    if (c.onPath || (c.cmd && fs.existsSync(c.cmd))) {
      console.log(`[electron] backend: ${c.label}`);
      return c;
    }
  }
  return null;
}

// ── 2. Spawn backend ──────────────────────────────────────────────────────
function startBackend() {
  const target = findBackendCommand();
  if (!target) {
    dialog.showErrorBox(
      "Backend not found",
      "Could not locate the Python backend. Expected a PyInstaller-built data_server.exe inside extraResources/backend/, or backend/launcher.py next to electron_shell/ in a source checkout."
    );
    app.exit(1);
    return;
  }

  console.log(`[electron] spawning: ${target.cmd} ${target.args.join(" ")}`);
  backendProc = spawn(target.cmd, target.args, {
    cwd: target.cwd,
    windowsHide: true,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      MK_PORT: String(BACKEND_PORT),       // launcher.py reads this
      MK_NO_BROWSER: "1",                  // skip auto-launch of system browser
      // Keep: isolates AppData from v1/browser mode (auth, cache, account state).
      // backend/app_paths.py defaults to "QuantumTerminal" without it, which
      // would hide existing %APPDATA%\QuantumTerminal-v2 data.
      MK_APP_DIR_NAME: "QuantumTerminal-v2",
      // `npm run start:sim` / `electron . --sim`: simulated market + paper trading
      ...(process.argv.includes("--sim") ? { MK_PROVIDER: "sim" } : {}),
    },
  });

  backendProc.stdout.on("data", (d) => console.log(`[backend] ${d.toString().trimEnd()}`));
  backendProc.stderr.on("data", (d) => console.error(`[backend ERR] ${d.toString().trimEnd()}`));
  backendProc.on("exit", (code, signal) => {
    console.log(`[electron] backend exited code=${code} signal=${signal}`);
    if (!isQuitting) {
      // Backend died unexpectedly — close the window to make it visible.
      if (mainWindow) mainWindow.close();
    }
  });
  backendProc.on("error", (err) => {
    console.error("[electron] backend spawn error:", err);
    dialog.showErrorBox("Backend spawn failed", String(err));
  });
}

// ── 3. Poll /api/health ───────────────────────────────────────────────────
function waitForBackend() {
  return new Promise((resolve, reject) => {
    const startTs = Date.now();
    const tick = () => {
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - startTs > READY_TIMEOUT_MS) return reject(new Error("backend health check timed out"));
      setTimeout(tick, HEALTH_POLL_MS);
    };
    tick();
  });
}

// ── 4. Create the window ──────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1600,
    height: 1000,
    minWidth:  1024,
    minHeight: 720,
    icon: path.join(app.isPackaged ? process.resourcesPath : __dirname, "..", "icon.ico"),
    backgroundColor: "#000000",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      preload: path.join(__dirname, "preload.js"),
      // Allow the renderer to talk to http://127.0.0.1:8502 — no mixed-content
      // headache because Electron's default security model already permits
      // localhost http when the page itself is loaded over http.
    },
  });

  // Strip the default File/Edit/View menu — keeps the chrome looking like an app.
  // Comment this out if you want devtools/menu access during testing.
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(BACKEND_URL);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });

  // v8: route window.open() and target=_blank links to OS default browser
  //     instead of spawning an embedded Electron sub-window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url).catch(err =>
        console.error("[electron] shell.openExternal failed:", err));
    }
    return { action: "deny" };
  });

  // v8: keyboard shortcuts. Ctrl+= / Ctrl+- / Ctrl+0 zoom (always on);
  //     F12 devtools (dev mode only). Single listener so we don't
  //     register two before-input-event handlers on the same wc.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    // F12 dev tools — gated to dev / unpackaged builds.
    if (input.key === "F12" &&
        (process.env.ELECTRON_DEV === "1" || !app.isPackaged)) {
      mainWindow.webContents.toggleDevTools();
      return;
    }
    // Ctrl+= / Ctrl+- / Ctrl+0 zoom — always on, production included.
    if (input.control || input.meta) {
      const wc = mainWindow.webContents;
      if (input.key === "=" || input.key === "+") {
        wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 9));
        event.preventDefault();
      } else if (input.key === "-") {
        wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -8));
        event.preventDefault();
      } else if (input.key === "0") {
        wc.setZoomLevel(0);
        event.preventDefault();
      }
    }
  });
}

// ── 5. Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
    console.log("[electron] backend healthy — opening window");
    createWindow();
  } catch (e) {
    console.error("[electron] giving up:", e);
    dialog.showErrorBox("Backend failed to start", String(e));
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  isQuitting = true;
  app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (backendProc && !backendProc.killed) {
    try { backendProc.kill("SIGTERM"); } catch {}
    setTimeout(() => {
      if (backendProc && !backendProc.killed) { try { backendProc.kill("SIGKILL"); } catch {} }
    }, 3000);
  }
});

// ── IPC: save screenshot via native dialog ─────────────────────────────
// Renderer sends raw PNG bytes; main pops a native dialog + writes the file.
// Bypasses Chromium's download manager → instant dialog, no base64 hop.
ipcMain.handle("mk:save-screenshot", async (_event, { suggestedName, bytes }) => {
  try {
    const win = BrowserWindow.fromWebContents(_event.sender) || mainWindow;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save chart screenshot",
      defaultPath: suggestedName || "chart.png",
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (canceled || !filePath) return { saved: false };
    // bytes arrives as Uint8Array (preload wraps ArrayBuffer). Buffer.from
    // accepts Uint8Array and writes raw bytes — no base64 conversion.
    await fs.promises.writeFile(filePath, Buffer.from(bytes));
    return { saved: true, path: filePath };
  } catch (e) {
    console.error("[electron] save-screenshot failed:", e);
    return { saved: false, error: String(e) };
  }
});

// ── IPC: fetch Trump-related news from Google News RSS ───────────────
// Renderer's `fetch` can't reach news.google.com (no CORS). Main process
// fetches the RSS, parses items with regex (no XML lib dep), caches for
// 5 minutes so repeated toast-opens don't spam the upstream.
let trumpNewsCache = { items: null, fetchedAt: 0 };
const TRUMP_CACHE_MS = 5 * 60 * 1000;

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'");
}
function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch   = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch    = block.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch    = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch  = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    items.push({
      title:   decodeHtml((titleMatch  ? titleMatch[1]  : "").trim()),
      link:    (linkMatch  ? linkMatch[1]  : "").trim(),
      pubDate: (dateMatch  ? dateMatch[1]  : "").trim(),
      source:  decodeHtml((sourceMatch ? sourceMatch[1] : "").trim()),
    });
  }
  return items;
}

ipcMain.handle("mk:fetch-trump-news", async (_event, opts) => {
  const force = opts && opts.force;
  const now = Date.now();
  if (!force && trumpNewsCache.items && now - trumpNewsCache.fetchedAt < TRUMP_CACHE_MS) {
    return {
      ok: true, items: trumpNewsCache.items,
      fetchedAt: trumpNewsCache.fetchedAt, cached: true,
    };
  }
  try {
    const url = "https://news.google.com/rss/search?q=Trump&hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Quantum Terminal" },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} from Google News` };
    }
    const xml = await res.text();
    // v4: sort by pubDate descending (latest first) BEFORE slicing so we
    //     never drop fresher items just because Google's RSS shipped them
    //     out of order. Items without a parseable date sink to the bottom.
    const all = parseRssItems(xml);
    all.sort((a, b) => {
      const ta = new Date(a.pubDate).getTime();
      const tb = new Date(b.pubDate).getTime();
      const sa = isNaN(ta) ? -Infinity : ta;
      const sb = isNaN(tb) ? -Infinity : tb;
      return sb - sa;
    });
    const items = all.slice(0, 30);
    trumpNewsCache = { items, fetchedAt: now };
    return { ok: true, items, fetchedAt: now, cached: false };
  } catch (e) {
    console.error("[electron] fetch-trump-news failed:", e);
    return { ok: false, error: String(e) };
  }
});

// ── IPC: open URL in user's default browser ──────────────────────────
ipcMain.handle("mk:open-external", async (_event, url) => {
  try {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return { ok: false, error: "invalid url" };
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ── IPC: open a detached child window for a given page ────────────────
// Renderer (TabContextMenu → preload.openInNewWindow) calls this with a
// pageId. We validate against the allowlist, spawn a BrowserWindow with
// parent: mainWindow (so it closes when main closes), and load the same
// app URL with ?detached=<pageId> so the renderer boots into DetachedShell.
ipcMain.handle("mk:open-in-new-window", async (_event, payload) => {
  try {
    const pageId = payload && payload.pageId;
    if (!VALID_DETACHED_PAGES.has(pageId)) {
      return { ok: false, error: `invalid pageId: ${String(pageId)}` };
    }
    if (!mainWindow) {
      return { ok: false, error: "main window not available" };
    }

    const childIcon = path.join(app.isPackaged ? process.resourcesPath : __dirname, "..", "icon.ico");

    const win = new BrowserWindow({
      width:  1200,
      height: 800,
      minWidth:  640,
      minHeight: 480,
      icon: childIcon,
      backgroundColor: "#000000",
      parent: mainWindow,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration:  false,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    const url = `${BACKEND_URL}/?detached=${encodeURIComponent(pageId)}`;
    win.loadURL(url);
    win.once("ready-to-show", () => win.show());
    win.on("closed", () => detachedWindows.delete(win));

    // v8: external-URL routing (matches main window).
    win.webContents.setWindowOpenHandler(({ url: u }) => {
      if (/^https?:\/\//.test(u)) {
        shell.openExternal(u).catch(err =>
          console.error("[electron] shell.openExternal failed:", err));
      }
      return { action: "deny" };
    });

    // v8: keyboard shortcuts. Ctrl+= / Ctrl+- / Ctrl+0 zoom (always on);
    //     F12 devtools (dev mode only). Mirrors main window.
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      if (input.key === "F12" &&
          (process.env.ELECTRON_DEV === "1" || !app.isPackaged)) {
        win.webContents.toggleDevTools();
        return;
      }
      if (input.control || input.meta) {
        const wc = win.webContents;
        if (input.key === "=" || input.key === "+") {
          wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 9));
          event.preventDefault();
        } else if (input.key === "-") {
          wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -8));
          event.preventDefault();
        } else if (input.key === "0") {
          wc.setZoomLevel(0);
          event.preventDefault();
        }
      }
    });

    detachedWindows.add(win);
    console.log(`[electron] spawned detached window: pageId=${pageId} url=${url}`);
    return { ok: true };
  } catch (e) {
    console.error("[electron] open-in-new-window failed:", e);
    return { ok: false, error: String(e) };
  }
});

// Single-instance lock — clicking the icon while running just focuses the window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
