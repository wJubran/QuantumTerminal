# Changelog

Notable changes to Quantum Terminal. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The main README explains the project in Arabic as well, and both READMEs have detailed requirements
  and a step-by-step guide: installing Python, a virtual environment, running on the simulator or with
  MetaTrader 5, updating, the desktop app, and fixes for common problems.

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
[1.1.0]: https://github.com/wJubran/QuantumTerminal/releases/tag/v1.1.0
[0.1.0-alpha]: https://github.com/wJubran/QuantumTerminal/releases/tag/v0.1.0-alpha
