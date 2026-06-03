# version: v11
# v11 — User-owned saves move to %USERPROFILE%\Documents\Quantum Terminal\ as
#       per-file stores (2026-05-13). Bug: a 4-key trimmed user_config.json
#       was being written when _load_user_config silently fell back to {}
#       on read errors; profiles/templates/presets were getting wiped on
#       every rebuild/update. Fix: (a) new per-file store with one JSON
#       per saved item under Documents/Quantum Terminal/{profiles,chart_templates,
#       chart_presets}/; (b) one-time migration from AppData-v2 (and
#       QuantumTerminal-X + v1 QuantumTerminal as best-effort fallback sources, read-only)
#       gated on a marker file; (c) _load_user_config renames a corrupt
#       file to .corrupt.<ts> instead of silently wiping it. Existing REST
#       routes /api/chart-templates, /api/chart-presets, /api/config/profiles
#       are unchanged on the wire — only the backing storage changes.
#       Spec: docs/specs/2026-05-13-user-data-store-rework-design.md.
#
# v10 — Module-level chart_templates API (get_chart_templates,
#       save_chart_template, delete_chart_template), mirroring the v7
#       chart_presets layer. Default config skeleton gains a
#       "chart_templates": {} key; _save_user_config preserves it from
#       on-disk like chart_presets; _load_config defaults + backfills it.
#       Consumed via /api/chart-templates only — doesn't flow through the
#       merged config served to the frontend. (2026-05-11)
#
# v9 — _save_user_config now preserves chart_presets from on-disk state
#      before writing. This closes the residual race where ConfigManager
#      could overwrite a preset just saved via the module path (because the
#      instance's self._user_config is loaded once at init and doesn't
#      track chart_presets writes from the module path). Together with v8,
#      both write directions for chart_presets are now race-free.
#
# v8 — removed the v7 module-level `_cached_config` layer. The dual-layer
#      design (ConfigManager instance cache + module-level cache, both
#      writing to user_config.json) was a lost-write hazard: a chart-preset
#      PUT would update disk + module cache, but the ConfigManager instance
#      held a stale `self._user_config`; the next ConfigManager._save_user_config
#      (e.g. from a profile save or any /api/config PATCH) would overwrite
#      the file with its stale snapshot, silently dropping the just-saved
#      chart preset. v8 fixes this by making the chart-preset path
#      always-read-fresh-from-disk + atomic-write-via-tempfile, so the two
#      layers no longer race over a shared cache. Tests hook the path
#      resolver, not the cache, so dropping the cache is test-transparent.
# v7 — added module-level chart_presets API (get_chart_presets,
#      save_chart_preset, delete_chart_preset) plus a module-level
#      load/save layer (_user_config_path, _load_config, _save_config,
#      _cached_config) that operates directly on user_config.json. This
#      is independent of the ConfigManager class instance — chart presets
#      are consumed via /api/chart-presets only and don't flow through
#      the merged config served to the frontend, so the two layers can
#      coexist without a stale-cache hazard. Default config skeleton now
#      includes a "chart_presets": {} key so first-write of a preset slots
#      cleanly into existing user configs.
# v6 — user_config.json (profiles + universe + per-ticker preferences)
#      now lives in %APPDATA%\QuantumTerminal-v2\ instead of the install directory.
#      Reason: NSIS overwrites the install directory on every update,
#      which was wiping operator profiles on every reinstall. AppData
#      survives reinstalls. First-launch migration copies the legacy
#      PROJECT_ROOT/user_config.json into AppData if AppData is empty,
#      so existing users keep their profiles transparently.
"""
================================================================================
Quantum Terminal — Configuration Manager

v2 — Added get_broker_symbol() helper and auto-wires broker-symbol override
     callback into each provider after creation. Lets users override a
     broker's symbol naming (e.g. EURUSD → EURUSD_VV2) from the Settings
     panel and have the MT5 provider use that mapping at resolve time.
================================================================================
================================================================================
Central config system for the terminal. Single source of truth.

Architecture:
    server_config.py (static defaults, versioned in Git)
        ↓ merged with
    user_config.json (user runtime preferences, gitignored)
        ↓ produces
    ConfigManager.get_config() → unified config dict served to frontend

What it manages:
    - Universe: which tickers are active, their metadata, display order
    - Providers: which data/execution sources are configured and active
    - Display: theme, chart height, visible panels, default timeframe
    - Modules: which quant modules are enabled (cones, bands, signals, etc.)
    - Profiles: save/load named terminal configurations

Mutation:
    - PATCH /api/config → ConfigManager.update(patch_dict) → writes user_config.json
    - Frontend reads via GET /api/config on mount (useConfig hook)
    - Changes broadcast via WS event so all clients stay in sync

Portability (Rule 3):
    - user_config.json lives at PROJECT_ROOT/user_config.json
    - No absolute paths in config — terminal_path comes from local_config.ini
    - Machine-specific values (credentials, paths) stay in local_config.ini

Usage:
    from config_manager import ConfigManager
    cfg = ConfigManager()
    full_config = cfg.get_config()       # Merged config dict
    cfg.update({"display": {"chart_height": 500}})  # Partial update
================================================================================
"""

import json
import copy
import logging
import os
import tempfile
import hashlib
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

log = logging.getLogger("config_manager")

# ── Project root (Rule 3) ──
PROJECT_ROOT = Path(__file__).resolve().parent

# v6: AppData dir — same env-var convention used by license_client.py so v1
#     and v2 can run side by side without sharing user state. Default
#     "QuantumTerminal" preserves v1 behavior.
APP_DIR = os.environ.get("MK_APP_DIR_NAME", "QuantumTerminal")


def _appdata_user_config_path() -> Path:
    """Resolve %APPDATA%\\<APP_DIR>\\user_config.json. Used as the canonical
    storage path for user preferences + saved profiles. Survives reinstalls
    of the app (NSIS overwrites the install dir but leaves AppData alone)."""
    appdata = os.environ.get("APPDATA")
    if appdata:
        base = Path(appdata) / APP_DIR
    else:
        base = Path.home() / "AppData" / "Roaming" / APP_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base / "user_config.json"


# ════════════════════════════════════════════════════════════════
# v11: per-file user-data store (Documents\Quantum Terminal\)
# ════════════════════════════════════════════════════════════════
#
# Three classes of user-owned saves — profiles, chart_templates,
# chart_presets — live as one JSON file per saved item under
# %USERPROFILE%\Documents\Quantum Terminal\<class>\. Decouples them from the
# user_config.json trimming-on-save bug, and puts them in a folder users
# can see/back up/copy.

_USER_DATA_SUBDIRS = ("profiles", "chart_templates", "chart_presets")
_MIGRATION_MARKER = ".migrated_v1"
_README_TEXT = (
    "Quantum Terminal — your saved settings live here.\n"
    "\n"
    "  profiles/         — saved workspace profiles\n"
    "  chart_templates/  — saved chart templates\n"
    "  chart_presets/    — saved chart style presets\n"
    "\n"
    "Each .json file is one saved item. Safe to back up this whole folder.\n"
    "Copying these files to another machine restores your settings there.\n"
)


def _user_data_dir() -> Path:
    """Resolve the root of the per-file user-data store. Defaults to
    %USERPROFILE%\\Documents\\Quantum Terminal\\. Overridable via MK_USER_DATA_DIR
    env var (used by tests + power users)."""
    override = os.environ.get("MK_USER_DATA_DIR", "").strip()
    if override:
        return Path(override)
    # Path.home() returns USERPROFILE on Windows. "Documents" is the
    # conventional name; if a user has redirected (OneDrive), Path.home()
    # still resolves under the OneDrive-managed Documents in practice.
    return Path.home() / "Documents" / "Quantum Terminal"


def _user_data_subdir(kind: str) -> Path:
    """Resolve and create one subdir of the user-data store."""
    if kind not in _USER_DATA_SUBDIRS:
        raise ValueError(f"unknown user-data subdir: {kind!r}")
    d = _user_data_dir() / kind
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ensure_user_data_root() -> Path:
    """Create Documents\\Quantum Terminal\\ + all subdirs + README. Idempotent."""
    root = _user_data_dir()
    root.mkdir(parents=True, exist_ok=True)
    for sub in _USER_DATA_SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)
    readme = root / "README.txt"
    if not readme.exists():
        try:
            readme.write_text(_README_TEXT, encoding="utf-8")
        except OSError:
            pass
    return root


_FILENAME_INVALID_RE = re.compile(r"[^A-Za-z0-9_\- ]")


def _slugify_name(name: str) -> str:
    """Make a filename-safe slug from a user-supplied name. Replaces
    unsafe chars with `_`, collapses runs, trims, caps at 60 chars."""
    s = _FILENAME_INVALID_RE.sub("_", (name or "").strip())
    s = re.sub(r"_+", "_", s)
    s = s.strip("_ ") or "untitled"
    return s[:60]


def _name_hash8(name: str) -> str:
    return hashlib.sha256((name or "").encode("utf-8")).hexdigest()[:8]


def _user_data_filename(name: str) -> str:
    """`<slug>__<hash8>.json` — deterministic, collision-safe."""
    return f"{_slugify_name(name)}__{_name_hash8(name)}.json"


def _user_data_atomic_write(path: Path, payload: Dict[str, Any]) -> None:
    """Atomic write via tempfile + os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=path.stem + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False, sort_keys=True)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        raise


def _user_data_list(kind: str) -> Dict[str, Dict[str, Any]]:
    """Walk a subdir, parse each .json file, return {name: payload}.
    Each file's `name` field is the authoritative key — filename slug is
    cosmetic. Skips files that don't parse or don't carry a `name`."""
    out: Dict[str, Dict[str, Any]] = {}
    d = _user_data_subdir(kind)
    for p in sorted(d.glob("*.json")):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            name = data.get("name")
            if not isinstance(name, str) or not name:
                # Fallback: try to recover the name from filename slug.
                # Shouldn't normally happen, but be lenient on read.
                continue
            payload = {k: v for k, v in data.items() if k != "name"}
            out[name] = payload
        except (OSError, json.JSONDecodeError):
            log.warning(f"Skipping unreadable user-data file: {p}")
            continue
    return out


def _user_data_load(kind: str, name: str) -> Optional[Dict[str, Any]]:
    """Load one item by exact name. Returns None if not present."""
    fn = _user_data_filename(name)
    p = _user_data_subdir(kind) / fn
    if not p.exists():
        # Fallback: scan in case filename was hand-edited.
        all_items = _user_data_list(kind)
        return all_items.get(name)
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("name") == name:
            return {k: v for k, v in data.items() if k != "name"}
        # Hash collision (extremely unlikely) — fall back to scan
        all_items = _user_data_list(kind)
        return all_items.get(name)
    except (OSError, json.JSONDecodeError):
        return None


def _user_data_save(kind: str, name: str, payload: Dict[str, Any]) -> None:
    """Write one item. Atomic. Overwrites if a file with the same
    slug+hash already exists (same name → same filename)."""
    if not name or not name.strip():
        raise ValueError("name cannot be empty")
    # Function-arg `name` MUST win over any stray `name` key inside payload;
    # spread payload first, then set name last.
    body = {**payload, "name": name}
    if "saved_at" not in body:
        body["saved_at"] = datetime.now(timezone.utc).isoformat()
    p = _user_data_subdir(kind) / _user_data_filename(name)
    _user_data_atomic_write(p, body)


def _user_data_delete(kind: str, name: str) -> bool:
    """Delete one item. Returns True if a file was removed."""
    fn = _user_data_filename(name)
    p = _user_data_subdir(kind) / fn
    if p.exists():
        try:
            p.unlink()
            return True
        except OSError:
            return False
    # Fallback: scan filenames in case slug rules changed.
    for cand in _user_data_subdir(kind).glob("*.json"):
        try:
            with open(cand, "r", encoding="utf-8") as f:
                if json.load(f).get("name") == name:
                    cand.unlink()
                    return True
        except (OSError, json.JSONDecodeError):
            continue
    return False


# ════════════════════════════════════════════════════════════════
# v11: one-time migration from user_config.json → per-file store
# ════════════════════════════════════════════════════════════════
#
# Reads up to three legacy sources (live AppData v2, orphaned QuantumTerminal-X,
# v1 QuantumTerminal — read-only) and writes each non-empty profiles[]/
# chart_presets[]/chart_templates[] entry to the new per-file store.
# Existing per-file entries are NEVER overwritten — first-source-wins.
# Gated on a marker file in the user-data root so this fires exactly once.

def _migration_marker_path() -> Path:
    return _user_data_dir() / _MIGRATION_MARKER


def _legacy_user_config_paths() -> List[Path]:
    """Return up to three paths to legacy user_config.json files, in
    priority order: live AppData v2 first, then any sibling dirs."""
    appdata = os.environ.get("APPDATA")
    paths: List[Path] = []
    if appdata:
        base = Path(appdata)
        # Live v2 first (most authoritative).
        paths.append(base / APP_DIR / "user_config.json")
        # QuantumTerminal-X — orphaned attempt with a typo'd env var.
        if APP_DIR != "QuantumTerminal-X":
            paths.append(base / "QuantumTerminal-X" / "user_config.json")
        # v1 — read-only fallback (Rule 8: never write).
        if APP_DIR != "QuantumTerminal":
            paths.append(base / "QuantumTerminal" / "user_config.json")
    return [p for p in paths if p.exists()]


def _migrate_user_data_once() -> None:
    """Run the one-time migration. Idempotent — gated on marker file."""
    _ensure_user_data_root()
    marker = _migration_marker_path()
    if marker.exists():
        return  # already migrated

    sources = _legacy_user_config_paths()
    migrated_counts = {"profiles": 0, "chart_templates": 0, "chart_presets": 0}

    for src in sources:
        try:
            with open(src, "r", encoding="utf-8") as f:
                legacy = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            log.warning(f"Migration skipping unreadable {src}: {e}")
            continue

        for kind in ("profiles", "chart_templates", "chart_presets"):
            section = legacy.get(kind) or {}
            if not isinstance(section, dict):
                continue
            existing = _user_data_list(kind)
            for name, payload in section.items():
                if not isinstance(name, str) or not name:
                    continue
                if name in existing:
                    continue  # never overwrite existing per-file entries
                if not isinstance(payload, dict):
                    continue
                try:
                    _user_data_save(kind, name, payload)
                    migrated_counts[kind] += 1
                    log.info(f"Migrated {kind}[{name!r}] from {src}")
                except Exception as e:
                    log.warning(f"Migration failed to write {kind}[{name!r}]: {e}")

    # Strip the migrated keys from the LIVE AppData v2 user_config.json
    # ONLY. Never touch QuantumTerminal-X or v1.
    live = _appdata_user_config_path()
    if live.exists():
        try:
            with open(live, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            stripped = False
            for kind in ("profiles", "chart_templates", "chart_presets"):
                if kind in cfg:
                    del cfg[kind]
                    stripped = True
            if stripped:
                _save_config(cfg)  # module-level atomic writer (existing)
                log.info(f"Stripped legacy save dicts from {live}")
        except (OSError, json.JSONDecodeError) as e:
            log.warning(f"Could not strip legacy keys from {live}: {e}")

    try:
        marker.write_text("migrated 2026-05-13\n", encoding="utf-8")
        log.info(
            f"User-data migration complete: profiles={migrated_counts['profiles']}, "
            f"chart_templates={migrated_counts['chart_templates']}, "
            f"chart_presets={migrated_counts['chart_presets']}"
        )
    except OSError as e:
        log.warning(f"Could not write migration marker: {e}")


# ── Import static defaults ──
from server_config import (
    ASSET_UNIVERSE, ASSET_DECIMALS, ASSET_CLASSES, SYMBOL_ALIASES,
    MT5_TIMEFRAMES, ServerConfig,
)


def _read_rithmic_config() -> Optional[Dict[str, str]]:
    """
    Read Rithmic credentials from local_config.ini [rithmic] section.
    Returns dict with user, password, system_name, url — or None if missing.
    Machine-specific credentials stay in local_config.ini (Rule 3, gitignored).
    """
    import configparser
    ini_path = PROJECT_ROOT / "local_config.ini"
    if not ini_path.exists():
        return None
    try:
        parser = configparser.ConfigParser()
        parser.read(str(ini_path))
        if "rithmic" not in parser:
            return None
        section = parser["rithmic"]
        cfg = {}
        for key in ("user", "password", "system_name", "url"):
            val = section.get(key, "").strip()
            if val and not val.startswith("YOUR_"):
                cfg[key] = val
        # Only return if we have at least user + password + url
        if cfg.get("user") and cfg.get("password") and cfg.get("url"):
            return cfg
        return None
    except Exception as e:
        log.warning(f"Failed to read [rithmic] from local_config.ini: {e}")
        return None


# ════════════════════════════════════════════════════════════════
# Default user config schema
# ════════════════════════════════════════════════════════════════

DEFAULT_USER_CONFIG = {
    "version": 1,

    # ── Universe ──
    "universe": {
        # Active tickers — derived from ASSET_UNIVERSE on first run
        # User can add/remove/reorder via settings panel
        "active_tickers": list(ASSET_UNIVERSE),

        # Custom tickers added by user (not in default universe)
        # Key = canonical name, value = metadata overrides
        "custom_tickers": {},

        # Tickers to hide from display (still tracked, just not shown)
        "hidden_tickers": [],

        # Display order — if empty, uses active_tickers order
        "display_order": [],
    },

    # ── Providers ──
    "providers": {
        # Which provider instance handles price feed
        "active_data": "mt5_default",

        # Which provider instance handles execution
        "active_execution": "mt5_default",

        # Configured accounts / data sources
        "accounts": {
            "mt5_default": {
                "id": "mt5_default",
                "type": "mt5",
                "label": "MetaTrader 5",
                "enabled": True,
                "terminal_path": None,   # None = auto-detect, or read from local_config.ini
                "aliases": {},           # Per-account alias overrides (merged with defaults)
                # When True, the tick loop polls MT5 every 0.2s instead of 1.0s
                # so the chart's last candle flickers at MT5-style rates.
                # Default OFF — opt-in for users with capable hardware.
                "use_tick_data": False,
            },
            "rithmic_default": {
                "id": "rithmic_default",
                "type": "rithmic",
                "label": "Rithmic — Paper Trading",
                "enabled": False,        # User enables after entering credentials
                "user": "",
                "password": "",
                "system_name": "Rithmic Paper Trading",
                "url": "",
                "app_name": "Quantum Terminal",
                "app_version": "1.0",
            },
        },
    },

    # ── Display ──
    "display": {
        "theme": "dark",
        "default_timeframe": "M15",
        "default_lookback_bars": 200,
        "chart_height": 420,
        "visible_panels": {
            "regime_bar": True,
            "signal_panel": True,
            "quant_panel": True,
            "asset_sidebar": True,
        },
        "chart_layers": {
            "cones_gbm": True,
            "cones_mjd": True,
            "bands": True,
            "signals": True,
            "anchors": True,
            "volume": True,
        },
    },

    # ── Execution ──
    # ALL OFF by default — user must explicitly enable live trading.
    "execution": {
        "live_trading": False,          # Master kill switch — no orders sent unless True
        "show_positions": False,        # Show current open positions from broker
        "show_trade_history": False,    # Show closed trades on chart / panel
        "confirm_orders": True,         # Require confirmation dialog before sending
        "default_risk_pct": 1.0,        # Default risk per trade (% of equity)
        "max_lots": 10.0,              # Hard cap on lot size
        "magic_number": 202603,         # MT5 magic number for Quantum Terminal orders
    },

    # ── Modules ──
    "modules": {
        "enabled": [
            "cones", "bands", "signals", "anchors", "regime",
            "garch", "ou", "wf", "kelly",
        ],
    },

    # ── Saved profiles ──
    "profiles": {
        # "profile_name": { full config snapshot minus profiles }
    },

    # ── Chart presets (named chart-style fragments, managed via /api/chart-presets) ──
    "chart_presets": {
        # "preset_name": { chart style fragment — see chartStyleDefaults.js for shape }
    },

    # ── Chart templates (named full-chart-config snapshots, managed via /api/chart-templates) ──
    "chart_templates": {
        # "name": { "sourceTicker": str, "config": {...full chart config...}, "savedAt": ISO str }
    },

    # ── Chart state (managed by MainChart, saved/restored with profiles) ──
    "_chart_state": {},

    # ── Last used profile name (auto-loaded on startup) ──
    "_last_profile": None,
}


# ════════════════════════════════════════════════════════════════
# Asset metadata builder
# ════════════════════════════════════════════════════════════════

# v4: pattern-based asset-class inference for dynamically-discovered tickers
#   that don't have a server_config.ASSET_CLASSES entry. Used by the settings
#   UI to group new assets correctly (FX / INDEX / COMMODITY / CRYPTO /
#   STOCK) instead of dumping them all under OTHER.
_CRYPTO_PREFIXES = ("BTC", "ETH", "SOL", "XRP", "ADA", "LTC", "DOGE",
                    "DOT", "AVAX", "LINK", "MATIC", "BNB", "TRX", "SHIB")
_COMMODITY_PREFIXES = ("XAU", "XAG", "XPT", "XPD", "XTI")
_COMMODITY_NAMES = frozenset({"BRENT", "WTI", "NGAS", "HG", "CL"})
_INDEX_NAMES = frozenset({
    "US500", "USTEC", "US30", "GER40", "UK100", "FR40", "AUS200",
    "JP225", "HK50", "SPX", "NDX", "DJI", "DAX", "FTSE", "NI225",
    "ESTX50", "EU50",
})
_CURRENCIES = frozenset({
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
    "SEK", "NOK", "DKK", "CNH", "MXN", "TRY", "ZAR", "SGD", "HKD",
})


def _infer_asset_class(ticker: str) -> str:
    t = (ticker or "").upper()
    if not t:
        return "OTHER"
    # Crypto — exact prefix or known ticker
    if any(t.startswith(p) for p in _CRYPTO_PREFIXES):
        return "CRYPTO"
    # Commodity — metals/energy
    if any(t.startswith(p) for p in _COMMODITY_PREFIXES) or t in _COMMODITY_NAMES:
        return "COMMODITY"
    # Index — explicit list
    if t in _INDEX_NAMES:
        return "INDEX"
    # FX — 6-letter pair of known currencies
    if len(t) == 6 and t[:3] in _CURRENCIES and t[3:] in _CURRENCIES:
        return "FX"
    # Stock — 1-5 letters, pure alpha (AAPL, TSLA, MSFT, NVDA, …)
    if 1 <= len(t) <= 5 and t.isalpha():
        return "STOCK"
    return "OTHER"


def _build_asset_metadata() -> Dict[str, dict]:
    """
    Build asset metadata dict from server_config static data.
    This is the server-side source of truth — replaces the hardcoded
    ASSET_META dict that was duplicated in the frontend.
    
    Returns:
        {
            "XAUUSD": {
                "class": "COMMODITY",
                "decimals": 2,
                "aliases": ["XAUUSD", "GOLD", "XAUUSD.cash"],
            },
            ...
        }
    """
    meta = {}
    for ticker in ASSET_UNIVERSE:
        meta[ticker] = {
            "class": ASSET_CLASSES.get(ticker, "OTHER"),
            "decimals": ASSET_DECIMALS.get(ticker, 2),
            "aliases": SYMBOL_ALIASES.get(ticker, [ticker]),
        }
    return meta


# ════════════════════════════════════════════════════════════════
# ConfigManager
# ════════════════════════════════════════════════════════════════

class ConfigManager:
    """
    Central configuration manager.
    
    Lifecycle:
        1. Load server_config.py defaults (static, versioned)
        2. Load user_config.json if it exists (user overrides, gitignored)
        3. Merge: user config wins where specified
        4. Expose merged config via get_config()
        5. Accept mutations via update() → writes back to user_config.json
    
    Provider management:
        - Creates provider instances from accounts config
        - Tracks which provider is active for data vs execution
        - Provides universe to active provider for symbol resolution
    """

    def __init__(self, config_path: Optional[Path] = None):
        # v6: default storage moved from PROJECT_ROOT (install dir, wiped
        #     on update) to AppData (survives reinstalls). Tests can still
        #     override via the config_path argument.
        self._config_path = config_path or _appdata_user_config_path()
        self._user_config: Dict[str, Any] = {}
        self._asset_metadata: Dict[str, dict] = _build_asset_metadata()
        self._providers: Dict[str, Any] = {}  # id → BaseProvider instance

        # v6: one-time migration — if AppData has no file yet but the legacy
        #     install-dir file exists, copy it over so existing users keep
        #     their profiles. Idempotent: only fires when AppData is empty.
        try:
            legacy_path = PROJECT_ROOT / "user_config.json"
            if (
                config_path is None
                and not self._config_path.exists()
                and legacy_path.exists()
                and legacy_path.resolve() != self._config_path.resolve()
            ):
                self._config_path.parent.mkdir(parents=True, exist_ok=True)
                self._config_path.write_text(
                    legacy_path.read_text(encoding="utf-8"), encoding="utf-8"
                )
                log.info(
                    f"Migrated legacy user_config from {legacy_path} → {self._config_path}"
                )
        except Exception as e:
            log.warning(f"Legacy user_config migration failed (non-fatal): {e}")

        # Load persisted user config
        self._load_user_config()

        # v11: one-time per-file user-data migration. Idempotent (gated on
        # a marker file in Documents\Quantum Terminal\). Safe to call always.
        try:
            _migrate_user_data_once()
            # v11: in-memory mirror of the disk strip. _user_config was
            # loaded BEFORE migration and still carries any legacy
            # profiles/chart_templates/chart_presets dicts. If we leave
            # them in the cache, the next workspace auto-save would
            # write them back to disk and silently undo the strip.
            # Idempotent — pop is a no-op if the key isn't there.
            for _k in ("profiles", "chart_templates", "chart_presets"):
                self._user_config.pop(_k, None)
        except Exception as e:
            log.warning(f"User-data migration error (non-fatal): {e}")

    # ── Persistence ──

    def _load_user_config(self) -> None:
        """Load user_config.json. On parse/IO failure, rename the corrupt
        file to user_config.json.corrupt.<UTC-timestamp> so a transient
        error can't trigger the workspace-save wipe sequence, then start
        with an empty config. Per-file user-data store (profiles /
        chart_templates / chart_presets) is unaffected — those live in
        Documents\\Quantum Terminal\\ and are not read here."""
        path = self._config_path
        if not path.exists():
            log.info("No user_config.json found — using defaults (will create on first save)")
            self._user_config = {}
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                self._user_config = json.load(f)
            log.info(f"Loaded user config from {path.name}")
            return
        except (json.JSONDecodeError, IOError, OSError) as e:
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = path.with_suffix(path.suffix + f".corrupt.{ts}")
            try:
                os.replace(str(path), str(backup))
                log.error(
                    f"user_config.json unreadable ({e}); preserved at {backup.name}. "
                    f"Starting with empty config — saved profiles / templates / presets "
                    f"in Documents\\Quantum Terminal\\ are unaffected."
                )
            except OSError as e2:
                log.error(f"user_config.json unreadable and could not be backed up: {e2}")
            self._user_config = {}

    def _save_user_config(self) -> None:
        """Write current user config to disk.

        v9: Before writing, preserve `chart_presets` from on-disk state.
        The chart-presets module-level layer (see _load_config / _save_config
        below) writes presets directly to disk, bypassing this instance's
        in-memory cache. Without this preservation, the next instance write
        would silently clobber any preset added since the last instance load.
        """
        try:
            preserved_chart_presets = None
            preserved_chart_templates = None
            if self._config_path.exists():
                try:
                    with open(self._config_path, "r", encoding="utf-8") as f:
                        on_disk = json.load(f)
                    preserved_chart_presets = on_disk.get("chart_presets")
                    preserved_chart_templates = on_disk.get("chart_templates")
                except (OSError, json.JSONDecodeError):
                    preserved_chart_presets = None
                    preserved_chart_templates = None
            if preserved_chart_presets is not None:
                self._user_config["chart_presets"] = preserved_chart_presets
            if preserved_chart_templates is not None:
                self._user_config["chart_templates"] = preserved_chart_templates
            with open(self._config_path, "w", encoding="utf-8") as f:
                json.dump(self._user_config, f, indent=2, ensure_ascii=False)
            log.info(f"Saved user config to {self._config_path.name}")
        except IOError as e:
            log.error(f"Failed to save user config: {e}")

    # ── Config Access ──

    def get_config(self) -> Dict[str, Any]:
        """
        Return the full merged config dict.
        This is what GET /api/config serves to the frontend.
        
        Shape:
        {
            "version": 1,
            "universe": { ... },
            "providers": { ... },
            "display": { ... },
            "modules": { ... },
            "profiles": { ... },
            "asset_metadata": { ticker: {class, decimals, aliases} },
            "available_timeframes": ["M1", "M5", ...],
            "available_provider_types": ["mt5", ...],
            "server": { host, port, uptime_seconds },
        }
        """
        merged = self._deep_merge(
            copy.deepcopy(DEFAULT_USER_CONFIG),
            copy.deepcopy(self._user_config),
        )

        # v11: overlay user-owned saves from the per-file store. These keys
        # are no longer in self._user_config (post-migration); the new
        # store is authoritative.
        try:
            merged["profiles"]        = _user_data_list("profiles")
            merged["chart_templates"] = _user_data_list("chart_templates")
            merged["chart_presets"]   = _user_data_list("chart_presets")
        except Exception as e:
            log.warning(f"Failed to load user-data store entries: {e}")
            # leave whatever was already in merged (could be {} from defaults)

        # Inject computed / read-only fields
        merged["asset_metadata"] = self._get_full_asset_metadata(merged)

        # v3: the Settings Universe UI reads `universe.active_tickers` straight
        # out of this dict, so overwrite it with the dynamic union of
        # configured + cache-discovered tickers. Raw user_config on disk
        # stays untouched — the override is applied at read time only.
        try:
            dyn = self.get_active_universe()
            if dyn:
                merged.setdefault("universe", {})["active_tickers"] = dyn
        except Exception:
            log.warning("universe auto-discovery failed; falling back to configured list", exc_info=True)

        # v5: surface per-ticker data-type availability so the Settings UI
        # can paint the dot color (green = full, purple = quarterly-only,
        # grey = nothing). Empty dict if cache discovery failed.
        try:
            merged["quant_data_types"] = self._discover_tickers_data_types()
        except Exception:
            merged["quant_data_types"] = {}
        # Tickers that actually have synced quant data in the consumer's local cache.
        # Source of truth = data_sync_client.synced_tickers (what the VPS has shipped),
        # NOT the hardcoded ASSET_UNIVERSE constant (which can lag behind producer changes).
        # Falls back to ASSET_UNIVERSE only if the sync client is unavailable (PRO mode
        # or pre-first-sync). Custom user tickers are never in this list.
        try:
            from data_sync_client import get_sync_client
            synced = get_sync_client().synced_tickers
            merged["quant_supported_tickers"] = list(synced) if synced else list(ASSET_UNIVERSE)
        except Exception:
            merged["quant_supported_tickers"] = list(ASSET_UNIVERSE)
        merged["available_timeframes"] = list(MT5_TIMEFRAMES.keys())

        from providers import list_provider_types
        merged["available_provider_types"] = list_provider_types()

        # Provider status
        merged["provider_status"] = {}
        for pid, prov in self._providers.items():
            merged["provider_status"][pid] = {
                "connected": prov.connected,
                "type": prov.provider_type,
                "label": prov.label,
                "can_execute": prov.can_execute,
            }

        return merged

    # v3: discover tickers from the sync cache so new DC-shipped assets
    #     auto-appear in the universe without user intervention.
    #     Matches only per-ticker filenames ending in one of the known
    #     data-type suffixes — this prevents GLOBAL-scope files like
    #     `GLOBAL_macro_sector_flows.json` from being mistaken for a
    #     "MACRO" ticker. Add suffixes here when DC ships new per-ticker
    #     data types.
    _PER_TICKER_SUFFIXES = (
        "bands", "cones", "historical_cones", "quarterly_cones",
        "scalp_bands", "options", "probfield", "bands_replay",
    )

    # v4: aggregate / composite files produced by DC that match the per-ticker
    #     filename pattern but aren't actually tickers (their content is a
    #     cross-asset rollup). Ask DC to rename these to GLOBAL_* prefixes
    #     so we don't need to maintain this list.
    _NON_TICKER_NAMES = frozenset({"SCORE", "COMPOSITE", "AGGREGATE"})

    def _discover_tickers_data_types(self) -> Dict[str, List[str]]:
        """v5: return {TICKER: [data_types]} from cache scan. Single source
        of truth for (a) get_active_universe discovery and (b) per-ticker
        quant-data-availability diagnostics surfaced in /api/config.
        """
        try:
            from data_sync_client import _get_cache_dir
            cache_dir = _get_cache_dir()
        except Exception:
            return {}
        if not cache_dir or not Path(cache_dir).is_dir():
            return {}
        # v4: longest-first so `_quarterly_cones` beats `_cones` on
        #   `GLOBAL_aapl_quarterly_cones.json` and AAPL survives.
        ordered = sorted(self._PER_TICKER_SUFFIXES, key=len, reverse=True)
        suffixes = tuple((f"_{s}", s) for s in ordered)
        result: Dict[str, set] = {}
        try:
            for f in Path(cache_dir).iterdir():
                if not f.is_file() or f.suffix.lower() != ".json":
                    continue
                name = f.stem
                if name.startswith("_"):
                    continue
                match_sfx = match_type = None
                for sfx_full, sfx_bare in suffixes:
                    if name.endswith(sfx_full):
                        match_sfx, match_type = sfx_full, sfx_bare
                        break
                if not match_sfx:
                    continue
                prefix = name[:-len(match_sfx)]
                if prefix.startswith("GLOBAL_"):
                    prefix = prefix[len("GLOBAL_"):]
                prefix = prefix.strip("_")
                if prefix and prefix.replace("-", "").isalnum():
                    up = prefix.upper()
                    if up in self._NON_TICKER_NAMES:
                        continue
                    result.setdefault(up, set()).add(match_type)
        except Exception:
            log.warning("cache discovery failed", exc_info=True)
            return {}
        return {t: sorted(types) for t, types in sorted(result.items())}

    def _discover_tickers_from_cache(self) -> List[str]:
        # Kept for back-compat — thin wrapper over the richer discovery.
        return list(self._discover_tickers_data_types().keys())

    def get_active_universe(self) -> List[str]:
        """
        Return the current active ticker list.
        v3: union of (a) tickers the user explicitly added to their universe
        and (b) tickers discovered in the local sync cache. Discovery alone
        is usually enough, but the union keeps user-pinned tickers visible
        even when their data hasn't arrived yet.
        """
        merged = self._deep_merge(
            copy.deepcopy(DEFAULT_USER_CONFIG.get("universe", {})),
            copy.deepcopy(self._user_config.get("universe", {})),
        )
        configured = merged.get("active_tickers", list(ASSET_UNIVERSE))
        discovered = self._discover_tickers_from_cache()
        if not discovered:
            return list(configured)
        # Union preserving order: configured first, then new discoveries.
        seen = set()
        out = []
        for t in list(configured) + discovered:
            tu = t.upper()
            if tu not in seen:
                seen.add(tu)
                out.append(tu)
        return out

    def get_display_order(self) -> List[str]:
        """
        Return tickers in display order, excluding hidden ones.
        Falls back to active_tickers order if no custom order set.
        v5: pulls the active list from get_active_universe() so dynamically
        discovered tickers (e.g. AAPL) flow through to /api/health and the
        chart's + menu. Previously it read the raw disk config, which
        bypassed discovery.
        """
        merged_uni = self._deep_merge(
            copy.deepcopy(DEFAULT_USER_CONFIG.get("universe", {})),
            copy.deepcopy(self._user_config.get("universe", {})),
        )
        active = self.get_active_universe()
        hidden = set(merged_uni.get("hidden_tickers", []))
        order = merged_uni.get("display_order", [])

        if order:
            # Use custom order, but only include active non-hidden tickers
            active_set = set(active) - hidden
            ordered = [t for t in order if t in active_set]
            # Append any active tickers not in the custom order
            for t in active:
                if t not in hidden and t not in ordered:
                    ordered.append(t)
            return ordered
        else:
            return [t for t in active if t not in hidden]

    def get_asset_meta(self, ticker: str) -> dict:
        """
        Get metadata for a single ticker.
        Merges static defaults with any user custom_ticker overrides.
        """
        base = self._asset_metadata.get(ticker, {
            "class": "OTHER",
            "decimals": 2,
            "aliases": [ticker],
        })
        custom = (
            self._user_config
            .get("universe", {})
            .get("custom_tickers", {})
            .get(ticker, {})
        )
        return {**base, **custom}

    def _get_full_asset_metadata(self, merged_config: dict) -> Dict[str, dict]:
        """
        Build complete asset metadata for all active + custom tickers.
        Merges static server_config data with user custom_ticker overrides.
        """
        result = {}
        active = merged_config.get("universe", {}).get("active_tickers", [])
        custom = merged_config.get("universe", {}).get("custom_tickers", {})

        for ticker in active:
            # v4: if the ticker has no static metadata, infer its class from
            # the naming pattern (AAPL → STOCK, BTCUSD → CRYPTO, XAUUSD →
            # COMMODITY, …) so the Settings UI can group it properly.
            base = self._asset_metadata.get(ticker, {
                "class": _infer_asset_class(ticker),
                "decimals": 2,
                "aliases": [ticker],
            })
            override = custom.get(ticker, {})
            result[ticker] = {**base, **override}

        # Add custom tickers not in default universe
        for ticker, meta in custom.items():
            if ticker not in result:
                result[ticker] = {
                    "class": meta.get("class", "OTHER"),
                    "decimals": meta.get("decimals", 2),
                    "aliases": meta.get("aliases", [ticker]),
                    **meta,
                }

        return result

    # ── Config Mutation ──

    def get_broker_symbol(self, ticker: str) -> Optional[str]:
        """v2: Return user-configured broker symbol override for a ticker.
        Looks up universe.custom_tickers[TICKER].broker_symbol; returns a
        non-empty trimmed string, or None if unset.
        """
        if not ticker:
            return None
        cfg = self.get_config()
        custom = cfg.get("universe", {}).get("custom_tickers", {}) or {}
        entry = custom.get(ticker.upper()) or {}
        val = entry.get("broker_symbol")
        if isinstance(val, str):
            s = val.strip()
            if s:
                return s
        return None

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply a partial update to user config.
        Deep-merges the patch into existing user config, saves to disk.
        
        Args:
            patch: Partial config dict (same shape as user_config.json)
                   Only specified fields are updated; others preserved.
        
        Returns:
            Updated full config (same as get_config())
        """
        self._user_config = self._deep_merge(self._user_config, patch)
        self._save_user_config()
        log.info(f"Config updated: {list(patch.keys())}")
        return self.get_config()

    # ── Universe Mutation Helpers ──

    def add_ticker(self, ticker: str, metadata: Optional[dict] = None) -> bool:
        """
        Add a ticker to the active universe.
        If it's not in the default universe, it goes into custom_tickers.
        """
        uni = self._user_config.setdefault("universe", {})
        active = uni.setdefault("active_tickers", list(ASSET_UNIVERSE))

        if ticker in active:
            log.info(f"Ticker {ticker} already in universe")
            return False

        active.append(ticker)

        # If not a default ticker, store metadata
        if ticker not in ASSET_UNIVERSE:
            custom = uni.setdefault("custom_tickers", {})
            custom[ticker] = metadata or {
                "class": "OTHER",
                "decimals": 2,
                "aliases": [ticker],
            }

        self._save_user_config()
        log.info(f"Added ticker: {ticker}")
        return True

    def remove_ticker(self, ticker: str) -> bool:
        """Remove a ticker from the active universe."""
        uni = self._user_config.get("universe", {})
        active = uni.get("active_tickers", [])

        if ticker not in active:
            return False

        active.remove(ticker)

        # Also remove from custom_tickers and display_order
        custom = uni.get("custom_tickers", {})
        custom.pop(ticker, None)
        order = uni.get("display_order", [])
        if ticker in order:
            order.remove(ticker)
        hidden = uni.get("hidden_tickers", [])
        if ticker in hidden:
            hidden.remove(ticker)

        self._save_user_config()
        log.info(f"Removed ticker: {ticker}")
        return True

    def toggle_ticker_visibility(self, ticker: str) -> bool:
        """Toggle a ticker between visible and hidden."""
        uni = self._user_config.setdefault("universe", {})
        hidden = uni.setdefault("hidden_tickers", [])

        if ticker in hidden:
            hidden.remove(ticker)
            visible = True
        else:
            hidden.append(ticker)
            visible = False

        self._save_user_config()
        log.info(f"Ticker {ticker} visibility: {'visible' if visible else 'hidden'}")
        return visible

    def reorder_tickers(self, order: List[str]) -> None:
        """Set custom display order for tickers."""
        uni = self._user_config.setdefault("universe", {})
        uni["display_order"] = order
        self._save_user_config()
        log.info(f"Display order updated: {len(order)} tickers")

    # ── Provider Management ──

    def _apply_env_provider_overrides(self, providers: Dict[str, Any]) -> Dict[str, Any]:
        """If TICKERALL_API_KEY is set, additively register a hosted-TickerAll
        provider account and make it the active data + execution source.

        Applied at READ time only — the on-disk user_config is never modified,
        and the existing MT5 (and Rithmic) provider config is left fully
        intact. No-op when the env var is unset, so default behaviour is
        unchanged."""
        try:
            from providers.tickerall_provider import tickerall_account_from_env
        except Exception:
            return providers
        acct = tickerall_account_from_env()
        if not acct:
            return providers
        out = copy.deepcopy(providers)
        accounts = out.setdefault("accounts", {})
        accounts[acct["id"]] = {**accounts.get(acct["id"], {}), **acct}
        out["active_data"] = acct["id"]
        out["active_execution"] = acct["id"]
        return out

    def init_providers(self) -> Dict[str, Any]:
        """
        Instantiate and connect all enabled providers from config.
        Called once at server startup.
        
        Returns:
            Dict of provider_id → provider instance
        """
        from providers import create_provider

        merged = self._deep_merge(
            copy.deepcopy(DEFAULT_USER_CONFIG.get("providers", {})),
            copy.deepcopy(self._user_config.get("providers", {})),
        )
        merged = self._apply_env_provider_overrides(merged)

        accounts = merged.get("accounts", {})
        self._providers.clear()

        for pid, acfg in accounts.items():
            if not acfg.get("enabled", True):
                log.info(f"Provider {pid} disabled — skipping")
                continue

            try:
                # Merge default aliases with account-specific aliases
                acfg_with_aliases = {**acfg}
                merged_aliases = {**SYMBOL_ALIASES}
                merged_aliases.update(acfg.get("aliases", {}))
                acfg_with_aliases["aliases"] = merged_aliases

                # Read terminal_path from local_config.ini if not set
                if acfg.get("type") == "mt5" and not acfg.get("terminal_path"):
                    from server_config import MT5_TERMINAL_PATH
                    acfg_with_aliases["terminal_path"] = MT5_TERMINAL_PATH

                # Read Rithmic credentials from local_config.ini if not set
                if acfg.get("type") == "rithmic" and not acfg.get("user"):
                    rithmic_cfg = _read_rithmic_config()
                    if rithmic_cfg:
                        acfg_with_aliases.update(rithmic_cfg)
                        log.info(f"Rithmic credentials loaded from local_config.ini")

                provider = create_provider(acfg_with_aliases)
                self._providers[pid] = provider
                # v2: give provider a live lookup for user-configured broker
                # symbol overrides (Settings panel → custom_tickers[X].broker_symbol).
                if hasattr(provider, "set_broker_symbol_lookup"):
                    try:
                        provider.set_broker_symbol_lookup(self.get_broker_symbol)
                    except Exception as e:
                        log.warning(f"Provider {pid}: broker_symbol lookup wiring failed: {e}")
                log.info(f"Provider created: {pid} ({provider.provider_type})")

            except KeyError as e:
                log.error(f"Failed to create provider {pid}: {e}")

        # When an env override (e.g. TICKERALL_API_KEY) makes a non-MT5 provider
        # the active source, also expose it under the "mt5_default" id. The app
        # has MT5-by-name callers (/api/mt5/status, trade gating, equity/position
        # sync) that look up "mt5_default" directly; without this they'd see the
        # dormant local-MT5 provider and report the session as offline. No-op
        # when no override is active (active_data stays "mt5_default").
        active_id = merged.get("active_data")
        if active_id and active_id != "mt5_default" and active_id in self._providers:
            self._providers["mt5_default"] = self._providers[active_id]
            log.info(f"Aliased mt5_default -> {active_id} (override provider active)")

        return self._providers

    def get_provider(self, provider_id: Optional[str] = None) -> Optional[Any]:
        """
        Get a provider by ID.
        If no ID given, returns the active data provider.
        """
        if provider_id:
            return self._providers.get(provider_id)

        # Default: active data provider
        merged = self._deep_merge(
            copy.deepcopy(DEFAULT_USER_CONFIG.get("providers", {})),
            copy.deepcopy(self._user_config.get("providers", {})),
        )
        merged = self._apply_env_provider_overrides(merged)
        active_id = merged.get("active_data", "mt5_default")
        return self._providers.get(active_id)

    def get_execution_provider(self) -> Optional[Any]:
        """Get the active execution provider."""
        merged = self._deep_merge(
            copy.deepcopy(DEFAULT_USER_CONFIG.get("providers", {})),
            copy.deepcopy(self._user_config.get("providers", {})),
        )
        merged = self._apply_env_provider_overrides(merged)
        active_id = merged.get("active_execution", "mt5_default")
        return self._providers.get(active_id)

    def get_all_providers(self) -> Dict[str, Any]:
        """Return all instantiated providers."""
        return dict(self._providers)

    # ── Profile Management ──

    def save_profile(self, name: str) -> None:
        """v11: save profile as one file under Documents\\Quantum Terminal\\profiles\\."""
        # Snapshot everything except profiles themselves AND the user-owned
        # saves (which now live in their own per-file stores).
        snapshot = {
            k: copy.deepcopy(v) for k, v in self._user_config.items()
            if k not in ("profiles", "chart_presets", "chart_templates")
        }
        _user_data_save("profiles", name, snapshot)
        log.info(f"Saved profile: {name}")

    def load_profile(self, name: str) -> bool:
        """v11: load profile from per-file store."""
        payload = _user_data_load("profiles", name)
        if payload is None:
            log.warning(f"Profile '{name}' not found")
            return False
        snapshot = dict(payload)
        snapshot.pop("saved_at", None)
        # Replace runtime config (workspace / universe / providers / display)
        # but DO NOT touch the saves stores — they live in files now.
        self._user_config = copy.deepcopy(snapshot)
        self._save_user_config()
        log.info(f"Loaded profile: {name}")
        return True

    def delete_profile(self, name: str) -> bool:
        """v11: delete profile from per-file store."""
        ok = _user_data_delete("profiles", name)
        if ok:
            log.info(f"Deleted profile: {name}")
        return ok

    def list_profiles(self) -> List[dict]:
        """v11: list profiles from per-file store."""
        items = _user_data_list("profiles")
        result = []
        for name, data in items.items():
            result.append({
                "name": name,
                "saved_at": data.get("saved_at", "unknown"),
                "ticker_count": len(
                    (data.get("universe") or {}).get("active_tickers", [])
                ),
            })
        return result

    # ── Utilities ──

    @staticmethod
    def _deep_merge(base: dict, override: dict) -> dict:
        """
        Recursively merge override into base.
        Lists in override REPLACE base lists (not append).
        Dicts are merged recursively.
        Scalar values in override win.
        """
        result = copy.deepcopy(base)
        for key, value in override.items():
            if (
                key in result
                and isinstance(result[key], dict)
                and isinstance(value, dict)
            ):
                result[key] = ConfigManager._deep_merge(result[key], value)
            else:
                result[key] = copy.deepcopy(value)
        return result


# ════════════════════════════════════════════════════════════════
# Module-level chart_presets API
# ════════════════════════════════════════════════════════════════
#
# v7: chart presets are a small, self-contained slice of user_config.json
# that the chart-settings UI reads/writes via /api/chart-presets. A thin
# module-level layer (path resolver + load/save helpers) gives the routes
# module a clean import-time API.
#
# v8: the v7 implementation kept its own `_cached_config` dict next to the
# ConfigManager instance's `self._user_config` — both layers ultimately
# wrote the same file. That was a lost-write race: a chart-preset write
# refreshed the module cache, but the ConfigManager instance still held a
# stale snapshot, and the next instance-side save would clobber the disk
# copy and silently delete the just-saved preset. v8 removes the cache
# entirely. Every read re-loads from disk; every write atomically replaces
# the file via tempfile + os.replace. Slower (one disk read per preset
# query) but correct under multi-writer use.
#
# Tests patch `_user_config_path()` to a temp file — see
# tests/test_config_manager_chart_presets.py.


def _user_config_path() -> Path:
    """Return the absolute path to user_config.json. Wraps
    `_appdata_user_config_path()` so tests can monkey-patch this single
    name without touching the AppData resolver used by ConfigManager."""
    return _appdata_user_config_path()


def _load_config() -> Dict[str, Any]:
    """Always read fresh from disk. No cache — see v8 header note for
    rationale (dual-layer cache hazard)."""
    path = _user_config_path()
    if not path.exists():
        return {"profiles": {}, "chart_presets": {}, "chart_templates": {}, "_last_profile": None}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"profiles": {}, "chart_presets": {}, "chart_templates": {}, "_last_profile": None}
    if "chart_presets" not in data:
        data["chart_presets"] = {}
    if "chart_templates" not in data:
        data["chart_templates"] = {}
    return data


def _save_config(cfg: Dict[str, Any]) -> None:
    """Atomically write user config to disk via tempfile + os.replace, so
    a crash mid-write can never leave a half-written user_config.json on
    disk. No cache to refresh — see v8 header note."""
    path = _user_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=path.stem + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, sort_keys=True)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        raise


def get_chart_presets() -> Dict[str, Any]:
    """Return the dict of named chart-style presets. {} if none."""
    return _user_data_list("chart_presets")


def save_chart_preset(name: str, style: Dict[str, Any]) -> None:
    """Create or replace a preset under `name`."""
    _user_data_save("chart_presets", name, dict(style))


def delete_chart_preset(name: str) -> None:
    """Remove a preset. No-op if it doesn't exist."""
    _user_data_delete("chart_presets", name)


def get_chart_templates() -> Dict[str, Any]:
    """Return the dict of named chart templates. {} if none."""
    return _user_data_list("chart_templates")


def save_chart_template(name: str, template: Dict[str, Any]) -> None:
    """Create or replace a chart template under `name`. `template` is the
    full template object: {sourceTicker, config, savedAt}."""
    _user_data_save("chart_templates", name, dict(template))


def delete_chart_template(name: str) -> None:
    """Remove a chart template. No-op if it doesn't exist."""
    _user_data_delete("chart_templates", name)