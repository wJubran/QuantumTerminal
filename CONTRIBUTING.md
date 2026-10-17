# Contributing to QuantumTerminal

Thank you for your interest in contributing to QuantumTerminal! This is a free, open-source project and we welcome contributions from developers of all experience levels.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
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
| **New Broker Providers** | Add Interactive Brokers, Alpaca, or other providers (implement `providers/base_provider.py`; `providers/sim_provider.py` is a complete example) | Python, REST/WebSocket APIs |
| **Local Quant Engine** | Compute cones / bands / probability fields from provider bars so the analysis panels work without an external data server | Python, NumPy, Quant |
| **Open-Source React UI** | Rebuild the frontend as open-source JSX/React source | React, TypeScript |
| **Backend Architecture** | Refactor and improve the FastAPI backend structure | Python, FastAPI |
| **Documentation** | Improve setup guides, add inline comments, write wiki pages | Markdown, Python |
| **Testing** | Extend the pytest suite in `backend/tests/` (providers, routes, data manager) | Python, pytest |

### Other Ways to Help

- Report bugs by opening an Issue
- Suggest new features or overlays
- Review open Pull Requests
- Improve the README or this CONTRIBUTING guide
- Share the project with others who might be interested

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js (optional, for Electron packaging)
- Git
- A broker account for live data (MT5, Rithmic, or Tradovate) — optional: `--sim` gives you a realistic simulated market with paper trading on any OS

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

## Development Workflow

1. **Fork** the repository and create your branch from `main`
2. **Name your branch** descriptively: `feature/add-ibkr-provider` or `fix/mt5-thread-safety`
3. **Make your changes** with clear, focused commits
4. **Test your changes** before submitting (`python -m pytest` in `backend/`)
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
