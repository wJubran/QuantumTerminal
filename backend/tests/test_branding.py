"""Guard: no trace of the former commercial product (name, prices, payment or
affiliate links, licence server) may come back into the shipped code."""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# Built from fragments so this file does not match itself.
FORBIDDEN = [re.compile(p, re.IGNORECASE) for p in [
    r"\bmk[ .\-]?" + "trades",           # the former product name
    r"mk" + r"terminal\.xyz",            # its website / update server
    "now" + "payments",                  # payment processor
    "tick" + "mill",                     # broker affiliate link
    r"t\.me/",                           # Telegram links
    r"\bMK " + "Terminal",
    "MK_DATA" + "_CENTER",               # the producer's private data folder
    r"getLogger\(['\"]" + r"mk\b",       # logger names print in every console line
]]
PRICE = re.compile(r"\$\s?(29|49|59|119)\b(?!\.\d)")

SCANNED = ["frontend/src", "frontend/public", "frontend_build", "backend", "electron_shell", ".github",
           "README.md", "README.ar.md", "CONTRIBUTING.md", "SECURITY.md", "social-preview.svg"]
TEXT_SUFFIXES = {".py", ".js", ".jsx", ".json", ".html", ".css", ".md", ".svg", ".txt", ".yml", ".ini"}


def _files():
    for entry in SCANNED:
        path = REPO / entry
        if path.is_file():
            yield path
        elif path.is_dir():
            for f in path.rglob("*"):
                if (f.is_file() and f.suffix in TEXT_SUFFIXES and "node_modules" not in f.parts
                        and "__pycache__" not in f.parts and f.resolve() != Path(__file__).resolve()):
                    yield f


def test_no_former_branding_or_pricing():
    hits = []
    for f in _files():
        text = f.read_text(encoding="utf-8", errors="replace")
        for rx in FORBIDDEN + ([PRICE] if f.suffix in {".js", ".jsx", ".html"} else []):
            for m in rx.finditer(text):
                hits.append(f"{f.relative_to(REPO)}: {m.group(0)!r}")
    assert not hits, "former branding / pricing found:\n" + "\n".join(hits[:40])


def test_shipped_ui_has_no_source_maps():
    # The UI source lives in frontend/; the build must not embed it again.
    assert not list((REPO / "frontend_build").rglob("*.map"))


def test_shipped_ui_is_built_from_this_source():
    index = (REPO / "frontend_build" / "index.html").read_text(encoding="utf-8")
    assert "<title>Quantum Terminal</title>" in index
