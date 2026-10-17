# Changelog

Notable changes to Quantum Terminal. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Options Quant, checked against the live SPY, QQQ, GLD, SLV and USO chains:
  - the swing entropy states are recalibrated (every market read CHAOTIC);
  - the wall, HVL and expected-move tooltips and the GEX articles now describe what the terminal computes;
  - the L01 card no longer says BELOW FLIP when there is no flip.

## [1.2.0] — 2026-10-17

### Added

- **The OPTIONS QUANT page from public option chains:**
  - US500, USTEC, XAUUSD, XAGUSD and XTIUSD from the SPY, QQQ, GLD, SLV and USO chains (yfinance);
  - GEX, the gamma flip, walls, max pain, HVL, expected move, 25-delta skew, IV against realized vol,
    put/call ratios, dealer scenarios, the structural and gravity ladders and the entropy card, for the
    swing expiries and today's 0-DTE;
  - levels moved into your feed's price space; refreshed every 15 minutes while New York trades.

- **Market regimes computed by the terminal** (the REGIMES strip above the chart, and its shading):
  - **MICRO:** each instrument's volatility regime, calm to stressed, from a hidden Markov model on its
    daily bars (2–4 states by BIC). It is refitted walk-forward every month, so no day is labelled with
    later data.
  - **⚠ IMMINENT:** a 15-minute volatility alarm. It fires when the next two hours are expected to be at
    least 1.5 times as volatile as usual for those hours; the session clock is factored out.
  - **MACRO:** the GOLDILOCKS / REFLATION / STAGFLATION / DEFLATION quadrant, from the S&P 500, 10-year
    breakeven inflation and WTI crude on FRED (free, no key; needs internet).
- Learning Center article *Market regimes (HMM)* (English and Arabic), and a *How the regimes are
  computed* section in both READMEs.
- **The FUNDAMENTAL page works without a data server.** It is built from free public data:
  - the macro regime with its 12-month trail;
  - Fed net liquidity (balance sheet − TGA − reverse repo) with the Fed's rate changes marked;
  - the Treasury curve now and 3 months ago, the 2s10s spread, the real yield and fed funds, all from
    FRED;
  - the VIX;
  - CFTC Commitments of Traders positioning, as a z-score against three years;
  - a −100…+100 score per instrument from the regime, its 200-day trend and its 3-month momentum, with
    each part shown.

  Downloads are cached, so the page keeps the latest data offline. The page now shows how old its data
  is. A Learning Center article explains each card.
- **The MONEY FLOW page works without a data server.** It is rebuilt hourly from daily ETF prices and
  volumes (Yahoo Finance):
  - US sector ETFs and country ETFs over 1 and 4 weeks;
  - arcs from the weakest markets to the strongest;
  - a CAPITAL FLOWS map of seven asset classes. Their net flow is a stated proxy (return × dollar volume
    of representative ETFs), not reported fund flows.

  Tickers that can't be downloaded are left out instead of being shown as flat.
- **Five more data sources**, picked in *Settings → DATA SOURCES* (with TEST and USE buttons) while the
  terminal runs, or with `python launcher.py --provider <type>`:
  - **Yahoo Finance**: free, no account. Forex; metals, energy, grain, soft and livestock futures;
    indices, stocks, ETFs and crypto. Some markets are delayed.
  - **Binance**: crypto in real time, free, no account.
  - **OANDA**: forex, metals, energy, grains and index CFDs, with order execution (a free practice
    account works).
  - **Alpaca**: US stocks and ETFs, including commodity ETFs, and crypto.
  - **CSV files**: bars exported from MetaTrader 5, TradingView, NinjaTrader or anywhere else, for
    offline analysis.
- **Paper account on live prices.** Sources that only deliver prices trade on a paper account that
  fills at their live bid/ask. Stop loss and take profit trigger on wicks, using the source's 1-minute
  bars but never a price from before the order existed. RESET starts the account over.
- Switching sources rebuilds the cones and bands from the new source's bars. The header names the
  active source, for example `FEED ● YAHOO`.
- API tokens and secrets stay on the computer: they are sent only to their source, and the browser
  sees `••••••`. `OANDA_TOKEN`, `OANDA_ACCOUNT_ID`, `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` can be
  used instead of the Settings panel.
- Learning Center article *Data sources: connect and configure* (English and Arabic), and a *Data
  sources* section in both READMEs, explaining how to set up each source and map its ticker names.
- **Probability bands computed by the terminal** (`BANDS` on a chart, key **B**):
  - GBM, MJD and Bates bands that restart at every trading day's open, so they follow the price;
  - their width comes from the last 60 trading days, and the tails keep the cones' long-run shape;
  - each band has a 20-day forward fan;
  - the Pulse Room ranks the watchlist against them too.
- **The REPLAY page works without a data server.** The terminal writes the past weekly and monthly
  cones, eight quarterly anchors, and every day's band forecast for it to play back.
- The main README explains the project in Arabic as well, and both READMEs have detailed requirements
  and a step-by-step guide: installing Python, a virtual environment, running on the simulator or with
  MetaTrader 5, updating, the desktop app, and fixes for common problems.

### Changed

- The LIVE TRADING switch is enforced by the server as well: `POST /api/orders` is refused while it is
  off, as the order ticket already was. Closing positions and editing SL/TP still work.
- Jumps are recognised relative to the volatility of their time, not one threshold for the whole year.
  After a lasting rise in volatility, the new regime's ordinary days are no longer treated as "jumps".
  This affects the MJD and Bates cones.

### Fixed

- The README said the Money Flow page fetched its data live; it reads analysis files like the other
  panels.

## [1.1.0] — 2026-10-17

The first stable open-source release.

### Added

- **Volatility cones computed by the terminal itself**, from the active feed's daily bars:
  - DAILY, WEEKLY, MONTHLY and QUARTERLY cones;
  - GBM in closed form, MJD as exact mixture quantiles, Bates by seeded Monte Carlo;
  - no look-ahead, and rebuilt once per trading day.

  Turn them on from the ▾ next to CONES on a chart; `MK_LOCAL_ANALYSIS=0` turns the computation off.
- **Simulated market with a paper-trading account**, no broker needed (`python launcher.py --sim`):
  - Bates-model prices that are consistent across timeframes and reproducible from a seed;
  - market, limit and stop orders, with SL/TP triggered on wicks.
- **The React source of the UI** in `frontend/`. CI checks that the committed build is byte-for-byte
  what the source produces.
- **Bilingual (English / Arabic) project guide** in the Learning Center, and an Arabic README.
- **Test suite** (pytest), run in CI on Linux and Windows with Python 3.10 and 3.12.
- **Community files:** security policy, issue forms and a pull request template.
- **Release workflow** that publishes a version with its notes from this file.

### Changed

- Everything left over from the former commercial product is removed: its name, subscription prices,
  payment and affiliate links, the licence server and the sign-in screen. Every feature is open to
  everyone.
- The update check reads this repository's GitHub releases. `MK_UPDATE_CHECK=0` turns it off.
- With no analysis data server configured, the header shows `SERVER ○ NONE` rather than an offline
  error.
- On the simulator, the trading switch says that orders go to the paper account.
- The Learning Center describes the cone lines as the ±1/2/3-sigma quantiles they are.

### Fixed

- The backend now starts: a syntax error in `/api/health`, a missing module and a wrong UI path no
  longer stop it.
- The local API only accepts the terminal itself:
  - a Host allow-list blocks DNS rebinding;
  - Origin and `Sec-Fetch-Site` are checked, WebSockets included;
  - CORS is restricted;
  - a path traversal in the UI file serving is closed.
- MetaTrader 5 calls are serialized, and the WebSocket broadcaster is hardened.
- The data-sync config loads without a `consumer_config.ini`.
- Cache files with two-word categories are filed under the right ticker.
- `/api/bands_replay` reads the analysis cache instead of a fixed developer folder.
- Every module resolves the per-user folder the same way, so Pulse Room finds the cone and band
  files the sync client and the local engine write (it looked in another folder outside the desktop
  app). Files from the old locations are copied in once, never moved or overwritten.
- Pydantic v2 deprecation warnings are gone.

## [0.1.0-alpha] — 2026-05-21

Initial public pre-release: the Python backend and the Electron shell as source, with a compiled UI
build.

[Unreleased]: https://github.com/wJubran/QuantumTerminal/compare/v1.1.0...HEAD
[1.2.0]: https://github.com/wJubran/QuantumTerminal/releases/tag/v1.2.0
[1.1.0]: https://github.com/wJubran/QuantumTerminal/releases/tag/v1.1.0
[0.1.0-alpha]: https://github.com/wJubran/QuantumTerminal/releases/tag/v0.1.0-alpha
