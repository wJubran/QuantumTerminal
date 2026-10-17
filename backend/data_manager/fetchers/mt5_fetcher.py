"""
MT5Fetcher — MetaTrader 5 data source adapter.

Wraps mt5.copy_rates_range() and mt5.copy_rates_from_pos() with:
  - Automatic timezone conversion to UTC
  - Consistent lowercase column names
  - Graceful failure handling
  - Symbol alias resolution (GER40 → DE40 etc.) via server_config.SYMBOL_ALIASES
"""

import pandas as pd
import numpy as np
from datetime import datetime, timezone
from typing import Optional, Dict, List
from pathlib import Path

from .base_fetcher import BaseFetcher

import logging
log = logging.getLogger("dmm.mt5_fetcher")

# ── Load MT5 terminal path from local_config.ini (Rule 3 — no hardcoded paths) ──
def _load_mt5_path_from_ini() -> Optional[str]:
    """Read MT5 terminal path from local_config.ini if it exists."""
    import configparser
    ini = Path(__file__).resolve().parent.parent.parent / "local_config.ini"
    if not ini.exists():
        return None
    cp = configparser.ConfigParser()
    cp.read(str(ini))
    return cp.get("mt5", "terminal_path", fallback=None)

DEFAULT_MT5_PATH = _load_mt5_path_from_ini()

# ── Symbol alias map — imported from server_config if available ──
_SYMBOL_ALIASES: Dict[str, List[str]] = {}

def _load_aliases():
    """Load SYMBOL_ALIASES from server_config.py (same project root)."""
    global _SYMBOL_ALIASES
    if _SYMBOL_ALIASES:
        return
    try:
        import sys
        project_root = str(Path(__file__).resolve().parent.parent.parent)
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from server_config import SYMBOL_ALIASES
        _SYMBOL_ALIASES = SYMBOL_ALIASES
    except ImportError:
        log.info("server_config not found — symbol aliases unavailable in MT5Fetcher")

def _mt5():
    """MetaTrader5 through the server's thread-safe proxy (backend/mt5_safe.py)
    so fetches never interleave with the live tick loops. Raises
    ModuleNotFoundError when the package isn't installed, like a plain import."""
    import sys
    backend_dir = str(Path(__file__).resolve().parent.parent.parent)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from mt5_safe import require_mt5
    return require_mt5()

# ── MT5 timeframe mapping ────────────────────────────────────────────────────
_TF_MAP = {}  # Populated lazily after mt5 import


def _ensure_tf_map():
    """Build timeframe string → MT5 constant map. Safe to call repeatedly."""
    global _TF_MAP
    if _TF_MAP:
        return
    try:
        mt5 = _mt5()
        _TF_MAP.update({
            "M1":  mt5.TIMEFRAME_M1,
            "M2":  mt5.TIMEFRAME_M2,
            "M3":  mt5.TIMEFRAME_M3,
            "M4":  mt5.TIMEFRAME_M4,
            "M5":  mt5.TIMEFRAME_M5,
            "M6":  mt5.TIMEFRAME_M6,
            "M10": mt5.TIMEFRAME_M10,
            "M12": mt5.TIMEFRAME_M12,
            "M15": mt5.TIMEFRAME_M15,
            "M20": mt5.TIMEFRAME_M20,
            "M30": mt5.TIMEFRAME_M30,
            "H1":  mt5.TIMEFRAME_H1,
            "H2":  mt5.TIMEFRAME_H2,
            "H3":  mt5.TIMEFRAME_H3,
            "H4":  mt5.TIMEFRAME_H4,
            "H6":  mt5.TIMEFRAME_H6,
            "H8":  mt5.TIMEFRAME_H8,
            "H12": mt5.TIMEFRAME_H12,
            "D1":  mt5.TIMEFRAME_D1,
            "W1":  mt5.TIMEFRAME_W1,
            "MN":  mt5.TIMEFRAME_MN1,
        })
    except (ModuleNotFoundError, AttributeError):
        log.warning("MetaTrader5 module not available — MT5Fetcher will be non-functional")


class MT5Fetcher(BaseFetcher):
    """
    MetaTrader 5 data fetcher.

    Parameters
    ----------
    terminal_path : str or None
        Path to terminal64.exe. If None, reads from local_config.ini.
    auto_init : bool
        If True, call mt5.initialize() on first fetch. If False, caller
        is responsible for ensuring MT5 is already initialized.
    """

    name = "mt5"

    def __init__(self, terminal_path: Optional[str] = None, auto_init: bool = False):
        self.terminal_path = terminal_path or DEFAULT_MT5_PATH
        self.auto_init = auto_init
        self._initialized = False
        self._symbol_cache: Dict[str, str] = {}  # canonical → broker symbol

    def _resolve_symbol(self, canonical: str) -> str:
        """
        Resolve canonical ticker to broker symbol via alias lookup.
        Caches successful resolutions. Returns canonical if no alias found.
        """
        if canonical in self._symbol_cache:
            return self._symbol_cache[canonical]

        _load_aliases()

        try:
            mt5 = _mt5()

            # Try canonical name first
            info = mt5.symbol_info(canonical)
            if info is not None:
                if not info.visible:
                    mt5.symbol_select(canonical, True)
                self._symbol_cache[canonical] = canonical
                return canonical

            # Try aliases
            aliases = _SYMBOL_ALIASES.get(canonical, [])
            for alias in aliases:
                if alias == canonical:
                    continue
                info = mt5.symbol_info(alias)
                if info is not None:
                    if not info.visible:
                        mt5.symbol_select(alias, True)
                    log.info(f"Symbol alias resolved: {canonical} → {alias}")
                    self._symbol_cache[canonical] = alias
                    return alias

            # No alias found — return canonical (will fail downstream)
            log.warning(f"No broker symbol found for {canonical}")
            self._symbol_cache[canonical] = canonical
            return canonical

        except Exception:
            return canonical

    def _ensure_init(self) -> bool:
        """Initialize MT5 if auto_init is on and we haven't yet."""
        if self._initialized:
            return True
        if not self.auto_init:
            # Assume caller already initialized MT5
            self._initialized = True
            return True
        try:
            mt5 = _mt5()
            kwargs = {}
            if self.terminal_path:
                kwargs["path"] = self.terminal_path
            if mt5.initialize(**kwargs):
                self._initialized = True
                return True
            else:
                log.error(f"MT5 init failed: {mt5.last_error()}")
                return False
        except ModuleNotFoundError:
            log.error("MetaTrader5 package not installed")
            return False

    def is_available(self) -> bool:
        return self._ensure_init()

    def fetch_bars(
        self,
        symbol: str,
        timeframe: str,
        date_from: datetime,
        date_to: datetime,
    ) -> Optional[pd.DataFrame]:
        """
        Fetch OHLCV bars via mt5.copy_rates_range().
        """
        _ensure_tf_map()
        if not self._ensure_init():
            return None

        tf_const = _TF_MAP.get(timeframe.upper())
        if tf_const is None:
            log.error(f"Unknown timeframe: {timeframe}")
            return None

        try:
            mt5 = _mt5()

            broker_sym = self._resolve_symbol(symbol)

            if date_from.tzinfo is None:
                date_from = date_from.replace(tzinfo=timezone.utc)
            if date_to.tzinfo is None:
                date_to = date_to.replace(tzinfo=timezone.utc)

            rates = mt5.copy_rates_range(broker_sym, tf_const, date_from, date_to)
            if rates is None or len(rates) == 0:
                log.warning(f"No data returned for {symbol} ({broker_sym}) {timeframe} "
                          f"{date_from.date()}→{date_to.date()}")
                return None

            return self._to_dataframe(rates)

        except Exception as e:
            log.error(f"MT5 fetch_bars error for {symbol}: {e}")
            return None

    def fetch_bars_n(
        self,
        symbol: str,
        timeframe: str,
        n_bars: int,
    ) -> Optional[pd.DataFrame]:
        """
        Fetch the most recent N bars via mt5.copy_rates_from_pos().
        """
        _ensure_tf_map()
        if not self._ensure_init():
            return None

        tf_const = _TF_MAP.get(timeframe.upper())
        if tf_const is None:
            log.error(f"Unknown timeframe: {timeframe}")
            return None

        try:
            mt5 = _mt5()

            broker_sym = self._resolve_symbol(symbol)

            rates = mt5.copy_rates_from_pos(broker_sym, tf_const, 0, n_bars)
            if rates is None or len(rates) == 0:
                log.warning(f"No data returned for {symbol} ({broker_sym}) {timeframe} (last {n_bars} bars)")
                return None

            return self._to_dataframe(rates)

        except Exception as e:
            log.error(f"MT5 fetch_bars_n error for {symbol}: {e}")
            return None

    # ── internal ─────────────────────────────────────────────────────────────

    @staticmethod
    def _to_dataframe(rates) -> pd.DataFrame:
        """Convert MT5 rates array to standardized DataFrame."""
        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
        df.set_index("time", inplace=True)
        df.index.name = "time"

        # Ensure lowercase column names
        df.columns = [c.lower() for c in df.columns]

        # Keep only standard columns if present
        keep = ["open", "high", "low", "close", "tick_volume", "spread", "real_volume"]
        df = df[[c for c in keep if c in df.columns]]

        return df