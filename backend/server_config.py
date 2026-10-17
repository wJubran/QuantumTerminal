"""
================================================================================
Quantum Terminal — Data Server Configuration
================================================================================
Central config for the FastAPI data server (Phase 3C).

All paths are relative to PROJECT_ROOT for portability (Rule 3).
MT5 terminal path is read from local_config.ini (gitignored, Rule 3).
Universe must match the orchestrator's ASSET_UNIVERSE.

Usage:
    from server_config import ServerConfig, PROJECT_ROOT
    config = ServerConfig()
================================================================================
"""

import configparser
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Dict

# ── Portable project root (Rule 3) ──
PROJECT_ROOT = Path(__file__).resolve().parent


def _env_list(name: str) -> List[str]:
    """Comma-separated env var → list of non-empty, stripped entries."""
    return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]


# ── Load local_config.ini for machine-specific values (Rule 3) ──
def _load_mt5_path() -> Optional[str]:
    """
    Read MT5 terminal path from local_config.ini.
    Falls back to None (MT5 auto-detect) if file or key is missing.
    
    Expected format in local_config.ini:
        [mt5]
        terminal_path = C:/Program Files/MetaTrader 5/terminal64.exe
    """
    ini_path = PROJECT_ROOT / "local_config.ini"
    if not ini_path.exists():
        return None
    cp = configparser.ConfigParser()
    cp.read(str(ini_path))
    return cp.get("mt5", "terminal_path", fallback=None)


MT5_TERMINAL_PATH = _load_mt5_path()


# ── Asset universe — must stay in sync with orchestrator.py ──
ASSET_UNIVERSE = [
    # Forex
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD",
    # Indices
    "US500", "USTEC", "GER40", "UK100",
    # Commodities
    "XAUUSD", "XAGUSD", "XTIUSD",
]


# ── Symbol alias map ──
# Canonical name → list of possible broker names to try (in order).
# The adapter tries each until one resolves in the connected MT5 terminal.
# Only needed for symbols whose canonical name doesn't match the broker.
# Forex pairs (EURUSD etc.) are universal and don't need aliases.
SYMBOL_ALIASES: Dict[str, List[str]] = {
    "US500":  ["US500", "US500.cash", "SPX500", "SP500", "US500Cash", "USA500"],
    "USTEC":  ["USTEC", "USTEC.cash", "NAS100", "NSDQ100", "USTECCash", "USTECH"],
    "GER40":  ["GER40", "GER40.cash", "DAX40", "DE40", "GER40Cash", "GDAXI"],
    "UK100":  ["UK100", "UK100.cash", "FTSE100", "UK100Cash"],
    "XTIUSD": ["XTIUSD", "USOIL", "WTI", "XTIUSD.cash", "USOIL.cash", "CL"],
    "XBRUSD": ["XBRUSD", "UKOIL", "BRENT", "XBRUSD.cash", "UKOIL.cash"],
    "XAUUSD": ["XAUUSD", "GOLD", "XAUUSD.cash"],
    "XAGUSD": ["XAGUSD", "SILVER", "XAGUSD.cash"],
}


# ── MT5 timeframe mapping (string → MT5 constant) ──
# These are the actual MetaTrader5 Python API constants.
# M1-M30 happen to equal their minute value, but H1+ use encoded values.
MT5_TIMEFRAMES = {
    "M1":  1,      # mt5.TIMEFRAME_M1
    "M5":  5,      # mt5.TIMEFRAME_M5
    "M15": 15,     # mt5.TIMEFRAME_M15
    "M30": 30,     # mt5.TIMEFRAME_M30
    "H1":  16385,  # mt5.TIMEFRAME_H1
    "H4":  16388,  # mt5.TIMEFRAME_H4
    "D1":  16408,  # mt5.TIMEFRAME_D1
    "W1":  32769,  # mt5.TIMEFRAME_W1
}


# ── Decimal precision per asset class ──
ASSET_DECIMALS = {
    # Forex — 5 decimal places (pipettes)
    "EURUSD": 5, "GBPUSD": 5, "AUDUSD": 5, "USDCHF": 5, "USDCAD": 5,
    "USDJPY": 3,
    # Indices — 2 decimal places
    "US500": 2, "USTEC": 2, "GER40": 2, "UK100": 2,
    # Commodities
    "XAUUSD": 2, "XAGUSD": 3, "XTIUSD": 2,
}


# ── Asset class classification ──
ASSET_CLASSES = {
    "EURUSD": "FX", "GBPUSD": "FX", "USDJPY": "FX",
    "AUDUSD": "FX", "USDCHF": "FX", "USDCAD": "FX",
    "US500": "INDEX", "USTEC": "INDEX", "GER40": "INDEX", "UK100": "INDEX",
    "XAUUSD": "COMMODITY", "XAGUSD": "COMMODITY",
    "XTIUSD": "COMMODITY",
    # Futures (Rithmic)
    "ES": "FUTURES", "NQ": "FUTURES", "YM": "FUTURES",
    "GC": "FUTURES", "SI": "FUTURES", "CL": "FUTURES", "BZ": "FUTURES",
}


@dataclass
class ServerConfig:
    """
    Master configuration for the data server.
    All file paths are relative to PROJECT_ROOT.
    MT5 terminal path comes from local_config.ini (Rule 3).
    """

    # ── Network ──
    host: str = "127.0.0.1"
    port: int = field(default_factory=lambda: int(os.environ.get("MK_PORT", "8502")))

    # ── MT5 ──
    mt5_terminal_path: Optional[str] = field(default_factory=lambda: MT5_TERMINAL_PATH)

    # ── Universe ──
    universe: List[str] = field(default_factory=lambda: list(ASSET_UNIVERSE))

    # ── MT5 polling intervals (seconds) ──
    tick_interval: float = 1.0        # How often to poll latest ticks
    bar_check_interval: float = 5.0   # How often to check for new closed bars

    # ── State file paths (relative to PROJECT_ROOT) ──
    terminal_payload: str = "terminal_payload.json"
    daily_signals: str = "daily_signals.json"
    signal_lifecycle: str = "signal_lifecycle.json"
    weekly_state: str = "weekly_state.json"
    bands_data_dir: str = "bands_data"

    # ── Display defaults ──
    default_timeframe: str = "M15"
    default_lookback_bars: int = 200

    # ── Frontend CORS ──
    # Cross-origin callers allowed to use the API (the React dev server).
    # The UI served by this process is same-origin and needs no entry.
    # Add more with MK_CORS_ORIGINS="http://host:port,http://other:port".
    cors_origins: List[str] = field(default_factory=lambda: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ] + _env_list("MK_CORS_ORIGINS"))

    # ── Host header allow-list (DNS-rebinding protection) ──
    # Loopback only by default. Serving on a LAN address? Add it with
    # MK_ALLOWED_HOSTS="192.168.1.20" (or "*" to disable the check).
    allowed_hosts: List[str] = field(default_factory=lambda: [
        "127.0.0.1", "localhost", "::1",
    ] + _env_list("MK_ALLOWED_HOSTS"))

    # ── Reconnection ──
    mt5_reconnect_delay: float = 5.0      # Seconds between reconnect attempts
    mt5_max_reconnect_attempts: int = 10   # Then log error, keep trying

    # ── File watcher ──
    file_watch_debounce: float = 1.0  # Seconds to debounce rapid file changes

    def resolve_path(self, relative: str) -> Path:
        """Resolve a config path relative to PROJECT_ROOT."""
        return PROJECT_ROOT / relative

    @property
    def watched_files(self) -> List[Path]:
        """All state files that the file watcher should monitor."""
        return [
            self.resolve_path(self.terminal_payload),
            self.resolve_path(self.daily_signals),
            self.resolve_path(self.signal_lifecycle),
            self.resolve_path(self.weekly_state),
        ]