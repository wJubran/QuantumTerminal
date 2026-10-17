# Contributing to Quantum Terminal

Thank you for your interest in contributing to Quantum Terminal! This is a free, open-source project and we welcome contributions from developers of all experience levels.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Working on the UI](#working-on-the-ui)
- [Development Workflow](#development-workflow)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

Be respectful, constructive, and collaborative. We are here to build something useful together.

---

## How Can I Contribute?

There are many ways to contribute, regardless of your skill level:

### High Priority Areas

| Area | Description | Skills Needed |
|------|-------------|---------------|
| **Local Quant Engine** | Compute cones / bands / regimes from provider bars so the analysis panels work without pre-computed data | Python, NumPy, Quant |
| **New Broker Providers** | Add Interactive Brokers, Alpaca, or other providers (implement `providers/base_provider.py`; `providers/sim_provider.py` is a complete example) | Python, REST/WebSocket APIs |
| **UI** | Improve the React UI in `frontend/` (see [Working on the UI](#working-on-the-ui)) | React, JavaScript |
| **Translations** | The Learning Center is in English and Arabic; translate more of the UI or add a language | Any language you speak |
| **Backend Architecture** | Refactor and improve the FastAPI backend structure | Python, FastAPI |
| **Documentation** | Improve setup guides, add inline comments, write wiki pages | Markdown, Python |
| **Testing** | Extend the pytest suite in `backend/tests/` (providers, routes, data manager) | Python, pytest |

### Other Ways to Help

- Report bugs by opening an Issue (security problems privately; see [SECURITY.md](SECURITY.md))
- Suggest new features or overlays
- Review open Pull Requests
- Improve the README or this CONTRIBUTING guide
- Share the project with others who might be interested

---

## Getting Started

### Prerequisites

- Python 3.10+
- Git
- Node.js 22 — only to change the UI (`frontend/`) or run the Electron shell
- A broker account for live data (MetaTrader 5 or Rithmic) — optional: `--sim` gives you a realistic simulated market with paper trading on any OS

### Local Setup

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/QuantumTerminal.git
cd QuantumTerminal

# 3. Install Python dependencies (+ pytest and ruff)
cd backend
pip install -r requirements-dev.txt

# 4. Run the terminal on the simulated market (no broker needed)
python launcher.py --sim        # or just `python launcher.py` with MetaTrader 5

# 5. Open the UI
# Navigate to http://127.0.0.1:8502 in your browser
```

### Tests and checks

Run these from `backend/` before opening a pull request — CI runs the same on Linux and Windows:

```bash
ruff check --select E9,F63,F7,F82 .   # syntax errors and undefined names
python -m pytest                      # full suite, no broker or MT5 needed
```

New features should come with tests. The simulated provider takes an injectable clock (`SimProvider(config, clock=...)`), which makes time-dependent behaviour (new bars, stop-loss triggers) deterministic to test.

---

## Working on the UI

The React source is in `frontend/`; the backend serves the production build committed in `frontend_build/`.

```bash
# terminal 1 — backend on the simulated market
cd backend && python launcher.py --sim --no-browser

# terminal 2 — UI with hot reload on http://localhost:3000
cd frontend
npm ci
npm start
```

When you are done, run `npm run build` (it writes to `../frontend_build`) and commit the rebuilt
`frontend_build/` in the same commit as your source change. CI rebuilds the UI and fails if the two
differ, and it builds with `CI=true`, so lint warnings fail the build too. Dependencies are pinned
exactly — use `npm ci`, not `npm install`, unless you are deliberately upgrading one.

Learning Center articles live in `frontend/src/components/learning/articles/`; every text has an
`en` and an `ar` version. See [frontend/README.md](frontend/README.md) for the layout of the UI code
and how to add an article.

---

## Development Workflow

1. **Fork** the repository and create your branch from `main`
2. **Name your branch** descriptively: `feature/add-ibkr-provider` or `fix/mt5-thread-safety`
3. **Make your changes** with clear, focused commits
4. **Test your changes** before submitting (`python -m pytest` in `backend/`; `npm run build` in `frontend/` for UI changes)
5. **Open a Pull Request** with a clear description of what you changed and why

---

## Commit Message Guidelines

Use clear, descriptive commit messages:

```
feat: add Interactive Brokers provider
fix: resolve MT5 thread-safety issue in data_server.py
docs: update installation instructions
refactor: reorganize backend provider structure
test: add unit tests for websocket broadcaster
```

Prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Pull Request Process

1. Ensure your PR description clearly explains **what** changed and **why**
2. Reference any related Issues using `Closes #issue_number`
3. Keep PRs focused — one feature or fix per PR is preferred
4. Be responsive to review feedback
5. PRs are merged by the maintainer after review

---

## Questions?

Feel free to open an Issue with the `question` label if you need help getting started or have any questions about the codebase.

We appreciate every contribution, no matter how small.
