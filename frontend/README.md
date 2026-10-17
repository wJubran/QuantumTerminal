# Quantum Terminal — user interface

React app (Create React App 5) for Quantum Terminal: charts (TradingView Lightweight Charts),
analysis pages, order ticket, Stress Lab and the bilingual Learning Center.

The production build is committed in [`../frontend_build`](../frontend_build), which is what
`backend/launcher.py` serves — you only need Node.js to change the UI.

## Develop

```bash
# terminal 1 — backend (simulated market, no broker needed)
cd backend && python launcher.py --sim --no-browser

# terminal 2 — UI with hot reload on http://localhost:3000
cd frontend
npm ci
npm start
```

REST calls are proxied to `http://127.0.0.1:8502` (`proxy` in `package.json`); WebSockets connect
to that address directly (override with `REACT_APP_DEV_BACKEND=host:port`). The backend accepts the
dev server's origin (`http://localhost:3000`) by default.

## Build

```bash
npm run build
```

writes the optimized UI straight into `../frontend_build` (see `.env.production`). Commit the source
change and the rebuilt `frontend_build/` together — CI rebuilds the UI and fails if the committed
build does not match the source.

Dependencies are pinned exactly (including transitive versions via `overrides`) so that builds are
reproducible; use `npm ci`, not `npm install`, unless you are deliberately upgrading.

## Layout

| Path | What it is |
|------|------------|
| `src/analytical_terminal.jsx` | App shell: header, tabs, layout, footer |
| `src/components/MainChart.jsx` | Chart engine: candles, cones, bands, heat map, drawings, orders |
| `src/components/OptionsPanel.jsx` | Options Quant page (GEX, walls, max pain) |
| `src/components/FundamentalsPanel.jsx` | Fundamental page (macro regime, yields, events) |
| `src/components/MoneyFlowPanel.jsx` | Money Flow page |
| `src/components/stress_lab/` | Stress Lab: Pulse Room, Options Cockpit |
| `src/components/learning/` | Learning Center — articles carry `en` + `ar` text |
| `src/hooks/useTerminalData.js` | Data layer: REST + WebSocket price/event streams |

### Writing a Learning Center article

Add a file under `src/components/learning/articles/<category>/`, export an object with `id`,
`category`, `order`, `title`, `summary` and `sections` (each text as `{ en, ar }`), then register it
in `articles/index.js`. Arabic text keeps technical terms in English (GBM, GEX, sigma…), and is
rendered right-to-left automatically.
