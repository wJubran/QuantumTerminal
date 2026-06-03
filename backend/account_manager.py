"""
================================================================================
ACCOUNT MANAGER — Real Account State & Persistent P&L Tracking
================================================================================
Quantum Terminal | Layer 3 — Account & Risk Management

Bridges the signal engine to real account data. Reads MT5 account balance/equity,
tracks daily and weekly P&L with persistence across restarts, and provides
configurable trading rules for prop firm compliance.

Architecture:
    MT5 Account ──► AccountManager ──► PortfolioState (signal engine)
                         │
                         ▼
                  account_state.json (persistent)
                         │
                         ▼
                  RiskGovernor (pre-trade checks)

Settings are stored in account_settings.json (user-editable from terminal UI).
Account state (daily P&L, peak equity, etc.) is stored in account_state.json.

Usage:
    from account_manager import AccountManager
    mgr = AccountManager()
    mgr.sync_from_mt5()
    portfolio = mgr.get_portfolio_state()  # feeds into signal engine
    mgr.record_trade_result(pnl_usd=150.0)

Dependencies: MetaTrader5 (optional), json, pathlib
================================================================================
"""

import json
import logging
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional
from datetime import datetime, date, timedelta
from pathlib import Path

# version: v4 (broker-TZ-aware period-pnl bucketing)
# v4 — get_period_pnl now corrects for the broker TZ before bucketing
#      deals into today/yesterday/this_week/etc. The MetaTrader5 library
#      returns deal.time as broker server time treated as a Unix epoch
#      (i.e. broker_local seconds, not real UTC). Our boundaries
#      (datetime.now() + datetime(year, month, day)) are in real UTC
#      via .timestamp(). Without correction, the comparison was off by
#      the broker's TZ offset — for an operator + broker both at GMT+3,
#      ~3h of deals spilled across day boundaries, e.g. yesterday-late
#      trades counted as today and vice versa. v4 detects the broker
#      offset from a recent tick (round to whole hours) and converts
#      d.time → real-UTC before comparison.
log = logging.getLogger("mk.account_manager")

PROJECT_ROOT = Path(__file__).resolve().parent

# v3: AppData dir name from env var so v1 / v2 builds get separate dirs.
APP_DIR = os.environ.get("MK_APP_DIR_NAME", "QuantumTerminal")


def _get_user_data_dir() -> Path:
    """Per-user writable dir for account_settings.json + account_state.json.
    Fixes Errno 13 Permission denied under Program Files on installed consumer.
    v3: AppData dir name comes from MK_APP_DIR_NAME (default "QuantumTerminal")."""
    import platform as _platform
    if _platform.system() == "Windows":
        appdata = os.environ.get("APPDATA", "")
        base = Path(appdata) / APP_DIR if appdata else \
               Path.home() / "AppData" / "Roaming" / APP_DIR
    else:
        base = Path.home() / f".{APP_DIR.lower()}"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _resolve_default_settings_path() -> Path:
    """v2: Prefer the AppData path. If a legacy file exists next to the module
    (dev-mode / old install), migrate it on first use."""
    user_dir = _get_user_data_dir()
    user_path = user_dir / "account_settings.json"
    legacy = PROJECT_ROOT / "account_settings.json"
    if legacy.exists() and not user_path.exists():
        try:
            user_path.write_bytes(legacy.read_bytes())
            log.info(f"Migrated {legacy} → {user_path}")
        except Exception as e:
            log.warning(f"Settings migration failed: {e}")
    return user_path


def _resolve_default_state_path() -> Path:
    user_dir = _get_user_data_dir()
    user_path = user_dir / "account_state.json"
    legacy = PROJECT_ROOT / "account_state.json"
    if legacy.exists() and not user_path.exists():
        try:
            user_path.write_bytes(legacy.read_bytes())
            log.info(f"Migrated {legacy} → {user_path}")
        except Exception as e:
            log.warning(f"State migration failed: {e}")
    return user_path


# ============================================================
# 1. TRADING SETTINGS (user-configurable)
# ============================================================

@dataclass
class TradingSettings:
    """
    User-configurable trading rules. Saved to account_settings.json.
    Editable from the terminal settings panel.
    """
    # -- Account --
    account_size: float = 100_000.0        # Initial account balance (or prop firm start)
    currency: str = "USD"

    # -- Prop Firm Rules --
    max_daily_loss_pct: float = 2.0        # Max daily loss as % of initial balance
    max_daily_profit_pct: float = 0.0      # Max daily profit lock (0 = disabled)
    max_total_drawdown_pct: float = 10.0   # Max drawdown from initial balance
    max_trailing_drawdown_pct: float = 0.0 # Max drawdown from peak equity (0 = disabled)

    # -- Position Limits --
    max_open_positions: int = 4
    max_correlated_positions: int = 2      # Max same-direction in correlated group
    risk_per_trade_pct: float = 0.5        # Fixed fractional risk per trade

    # -- Kelly --
    use_kelly: bool = True
    kelly_fraction: float = 0.25           # Quarter-Kelly

    # -- Calibration Gating --
    min_calibration_grade: str = "C"       # Filter signals below this grade
    require_calibration: bool = False      # If True, only trade calibrated setups

    # -- Session Rules --
    trading_enabled: bool = True           # Master switch
    auto_sync_mt5: bool = True             # Auto-sync equity from MT5 on startup

    # -- Auto Trading (Phase 3G) --
    auto_trading_enabled: bool = False     # Auto-execute signals (separate from live_trading)
    auto_min_confidence: float = 0.60      # Min signal confidence to auto-trade
    auto_min_grade: str = "C"              # Min calibration grade to auto-trade
    auto_max_daily_trades: int = 5         # Max auto-trades per day
    auto_allowed_types: list = field(default_factory=lambda: [
        "cone_boundary_fade", "drift_momentum", "institutional_anchor",
        "cone_convergence", "regime_transition", "cone_breakout",
    ])
    auto_allowed_tickers: list = field(default_factory=list)  # Empty = all universe
    auto_scan_interval: float = 30.0       # Seconds between scans
    auto_log_only: bool = True             # True = dry run (log but don't execute)

    # -- Scheduler (Phase 3G) --
    scheduler_enabled: bool = True
    scheduler_weekly_enabled: bool = True
    scheduler_weekly_day: int = 6              # 0=Mon, 6=Sun
    scheduler_weekly_time: str = "21:30"       # HH:MM UTC
    scheduler_daily_enabled: bool = True
    scheduler_daily_time: str = "21:30"        # HH:MM UTC
    scheduler_daily_skip_weekends: bool = True
    scheduler_calc_before_weekly: bool = True   # Run cones before weekly orch
    # Calibration
    calibration_workers: int = 1               # CPU threads for ATR/management sweep
    scheduler_calc_modules: str = "anchors,cones"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> 'TradingSettings':
        # Only take keys that exist in the dataclass
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in valid_keys}
        return cls(**filtered)


# ============================================================
# 2. ACCOUNT STATE (persistent)
# ============================================================

@dataclass
class AccountState:
    """
    Persistent account state — survives server restarts.
    Saved to account_state.json.
    """
    # -- Equity tracking --
    initial_balance: float = 100_000.0     # Set once at start (prop firm funded amount)
    current_equity: float = 100_000.0      # Last known equity
    peak_equity: float = 100_000.0         # Highest equity ever (for trailing DD)

    # -- Daily tracking --
    daily_start_equity: float = 100_000.0  # Equity at start of current day
    daily_pnl: float = 0.0                 # P&L since daily reset
    daily_trades: int = 0                  # Trade count today
    current_date: str = ""                 # ISO date of current tracking day

    # -- Weekly tracking --
    weekly_start_equity: float = 100_000.0
    weekly_pnl: float = 0.0
    weekly_trades: int = 0
    current_week: str = ""                 # ISO week string (e.g., "2026-W12")

    # -- Circuit breaker states --
    daily_loss_halt: bool = False           # True = daily loss limit hit
    daily_profit_lock: bool = False         # True = daily profit target hit
    total_drawdown_halt: bool = False       # True = max drawdown breached
    trailing_drawdown_halt: bool = False    # True = trailing DD breached

    # -- Trade log (lightweight) --
    recent_trades: List[Dict] = field(default_factory=list)  # Last 50 trades

    # -- Timestamps --
    last_mt5_sync: str = ""
    last_updated: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> 'AccountState':
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in valid_keys}
        # Handle list fields that may come as None
        if 'recent_trades' not in filtered or filtered['recent_trades'] is None:
            filtered['recent_trades'] = []
        return cls(**filtered)


# ============================================================
# 3. ACCOUNT MANAGER
# ============================================================

class AccountManager:
    """
    Manages account state, MT5 sync, and trading settings.
    """

    def __init__(self, settings_path: Optional[Path] = None,
                 state_path: Optional[Path] = None):
        # v2: default to %APPDATA%\QuantumTerminal\ (writable) instead of the module
        # directory, which lives under Program Files and is read-only for
        # non-admin users. Legacy files are migrated on first use.
        self._settings_path = settings_path or _resolve_default_settings_path()
        self._state_path = state_path or _resolve_default_state_path()

        self.settings = self._load_settings()
        self.state = self._load_state()

        # Check for day/week rollover
        self._check_daily_reset()
        self._check_weekly_reset()

    # ────────────────────────────────────────────────────────
    # PERSISTENCE
    # ────────────────────────────────────────────────────────

    def _load_settings(self) -> TradingSettings:
        """Load or create settings file."""
        if self._settings_path.exists():
            try:
                with open(self._settings_path) as f:
                    data = json.load(f)
                log.info(f"Loaded trading settings from {self._settings_path}")
                return TradingSettings.from_dict(data)
            except Exception as e:
                log.warning(f"Failed to load settings: {e} — using defaults")

        settings = TradingSettings()
        self._save_settings(settings)
        return settings

    def _save_settings(self, settings: TradingSettings = None):
        """Save settings to JSON."""
        if settings is None:
            settings = self.settings
        try:
            with open(self._settings_path, "w") as f:
                json.dump(settings.to_dict(), f, indent=2)
        except Exception as e:
            log.warning(f"Failed to save settings: {e}")

    def _load_state(self) -> AccountState:
        """Load or create state file."""
        if self._state_path.exists():
            try:
                with open(self._state_path) as f:
                    data = json.load(f)
                log.info(f"Loaded account state from {self._state_path}")
                return AccountState.from_dict(data)
            except Exception as e:
                log.warning(f"Failed to load state: {e} — using defaults")

        state = AccountState(
            initial_balance=self.settings.account_size,
            current_equity=self.settings.account_size,
            peak_equity=self.settings.account_size,
            daily_start_equity=self.settings.account_size,
            weekly_start_equity=self.settings.account_size,
        )
        self._save_state(state)
        return state

    def _save_state(self, state: AccountState = None):
        """Save state to JSON."""
        if state is None:
            state = self.state
        state.last_updated = datetime.now().isoformat()
        try:
            with open(self._state_path, "w") as f:
                json.dump(state.to_dict(), f, indent=2, default=str)
        except Exception as e:
            log.warning(f"Failed to save state: {e}")

    def update_settings(self, new_settings: dict):
        """Update settings from terminal UI (partial update)."""
        old_account_size = self.settings.account_size
        current = self.settings.to_dict()
        current.update(new_settings)
        self.settings = TradingSettings.from_dict(current)
        self._save_settings()
        log.info(f"Trading settings updated: {list(new_settings.keys())}")

        # Auto-reset baseline when account_size changes
        if "account_size" in new_settings and new_settings["account_size"] != old_account_size:
            self.reset_baseline(self.settings.account_size)

    def reset_baseline(self, new_balance: float = None):
        """
        Reset account state baseline. Call when:
        - Setting up a new funded account
        - Account size changes in settings
        - Starting fresh after a reset

        Sets initial_balance, peak_equity, daily/weekly start to the new value.
        Clears all circuit breaker halts. Preserves current_equity if MT5-synced.
        """
        bal = new_balance or self.settings.account_size
        equity = self.state.current_equity if self.state.current_equity > 0 else bal

        self.state.initial_balance = bal
        self.state.peak_equity = max(bal, equity)
        self.state.daily_start_equity = equity
        self.state.weekly_start_equity = equity
        self.state.daily_pnl = 0.0
        self.state.weekly_pnl = 0.0
        self.state.daily_trades = 0
        self.state.weekly_trades = 0

        # Clear all circuit breaker halts
        self.state.daily_loss_halt = False
        self.state.daily_profit_lock = False
        self.state.total_drawdown_halt = False
        self.state.trailing_drawdown_halt = False

        self._save_state()
        log.info(f"Account baseline reset: initial_balance=${bal:,.2f}, "
                 f"equity=${equity:,.2f}, all circuit breakers cleared")

    # ────────────────────────────────────────────────────────
    # MT5 SYNC
    # ────────────────────────────────────────────────────────

    def sync_from_mt5(self) -> bool:
        """
        Read real account equity from MT5.
        Returns True if sync successful.
        """
        try:
            import MetaTrader5 as mt5

            if not mt5.terminal_info():
                log.warning("MT5 not connected — cannot sync account")
                return False

            account = mt5.account_info()
            if account is None:
                log.warning("MT5 account_info() returned None")
                return False

            equity = account.equity
            balance = account.balance

            self.state.current_equity = equity
            self.state.peak_equity = max(self.state.peak_equity, equity)
            self.state.last_mt5_sync = datetime.now().isoformat()

            # Update daily P&L
            self.state.daily_pnl = equity - self.state.daily_start_equity
            self.state.weekly_pnl = equity - self.state.weekly_start_equity

            # Check circuit breakers
            self._check_circuit_breakers()

            self._save_state()
            log.info(f"MT5 sync: equity=${equity:,.2f}, balance=${balance:,.2f}, "
                     f"daily P&L=${self.state.daily_pnl:+,.2f}")
            return True

        except ImportError:
            log.info("MetaTrader5 package not available — manual equity mode")
            return False
        except Exception as e:
            log.warning(f"MT5 sync failed: {e}")
            return False

    def sync_from_provider(self, provider) -> bool:
        """Sync equity/balance from a BaseProvider (e.g. hosted TickerAll) rather
        than the local MetaTrader5 terminal. Used when an env-override provider is
        the active source and the MT5 package is unavailable. Additive — the MT5
        path keeps using sync_from_mt5()."""
        try:
            info = provider.get_account_info() if provider else None
            if not info:
                return False
            equity = float(getattr(info, "equity", 0.0) or 0.0)
            balance = float(getattr(info, "balance", 0.0) or 0.0)
            if equity <= 0.0:
                equity = balance
            if balance <= 0.0:
                balance = equity
            if equity <= 0.0 and balance <= 0.0:
                return False
            # First sync: anchor the day/week/peak baselines to the real account
            # (clears the placeholder $100k default so drawdown math is sane).
            if not self.state.last_mt5_sync:
                self.state.daily_start_equity = equity
                self.state.weekly_start_equity = equity
                self.state.peak_equity = max(equity, balance)
            self.state.initial_balance = balance
            self.state.current_equity = equity
            self.state.peak_equity = max(self.state.peak_equity, equity)
            self.state.last_mt5_sync = datetime.now().isoformat()
            self.state.daily_pnl = equity - self.state.daily_start_equity
            self.state.weekly_pnl = equity - self.state.weekly_start_equity
            # Snapshot the broker fields the dashboard + MT5 status header read
            # (login / server / balance / currency / margin / free_margin) + the
            # open-position count, so those hot, polled endpoints are served from
            # this cache instead of a ~5s-per-call accounts.get on every poll.
            try:
                _positions = provider.get_positions() or []
            except Exception:
                _positions = []
            self._broker = {
                "login": (str(getattr(info, "account_id", "") or "") or None),
                "server": getattr(info, "server", None),
                "balance": balance,
                "currency": getattr(info, "currency", "USD") or "USD",
                "margin": float(getattr(info, "margin", 0.0) or 0.0),
                "free_margin": float(getattr(info, "free_margin", getattr(info, "margin_free", 0.0)) or 0.0),
                "open_positions": len(_positions),
            }
            self._check_circuit_breakers()
            self._save_state()
            log.info(f"Provider account sync: equity=${equity:,.2f}, balance=${balance:,.2f}")
            return True
        except Exception as e:
            log.warning(f"Provider account sync failed: {e}")
            return False

    def sync_positions_from_mt5(self) -> List[Dict]:
        """Read open positions from MT5."""
        try:
            import MetaTrader5 as mt5

            if not mt5.terminal_info():
                return []

            positions = mt5.positions_get()
            if positions is None:
                return []

            result = []
            for pos in positions:
                result.append({
                    'ticket': pos.ticket,
                    'ticker': pos.symbol,
                    'direction': 'long' if pos.type == 0 else 'short',
                    'size': pos.volume,
                    'entry': pos.price_open,
                    'current_price': pos.price_current,
                    'current_pnl': pos.profit,
                    'sl': pos.sl,
                    'tp': pos.tp,
                    'magic': pos.magic,
                    'comment': pos.comment,
                })

            return result

        except (ImportError, Exception):
            return []

    # ────────────────────────────────────────────────────────
    # DAILY/WEEKLY RESETS
    # ────────────────────────────────────────────────────────

    def _check_daily_reset(self):
        """Reset daily tracking if it's a new day."""
        today = date.today().isoformat()
        if self.state.current_date != today:
            if self.state.current_date:
                log.info(f"Daily reset: {self.state.current_date} → {today} "
                         f"(yesterday P&L: ${self.state.daily_pnl:+,.2f})")
            self.state.daily_start_equity = self.state.current_equity
            self.state.daily_pnl = 0.0
            self.state.daily_trades = 0
            self.state.daily_loss_halt = False
            self.state.daily_profit_lock = False
            self.state.current_date = today
            self._save_state()

    def _check_weekly_reset(self):
        """Reset weekly tracking if it's a new week."""
        current_week = date.today().isocalendar()
        week_str = f"{current_week[0]}-W{current_week[1]:02d}"
        if self.state.current_week != week_str:
            if self.state.current_week:
                log.info(f"Weekly reset: {self.state.current_week} → {week_str} "
                         f"(last week P&L: ${self.state.weekly_pnl:+,.2f})")
            self.state.weekly_start_equity = self.state.current_equity
            self.state.weekly_pnl = 0.0
            self.state.weekly_trades = 0
            self.state.current_week = week_str
            self._save_state()

    # ────────────────────────────────────────────────────────
    # CIRCUIT BREAKERS
    # ────────────────────────────────────────────────────────

    def _check_circuit_breakers(self):
        """Check all prop firm circuit breakers."""
        s = self.settings
        st = self.state

        # Daily loss limit
        if s.max_daily_loss_pct > 0:
            daily_loss_limit = st.initial_balance * (s.max_daily_loss_pct / 100)
            if st.daily_pnl <= -daily_loss_limit:
                if not st.daily_loss_halt:
                    log.warning(f"🛑 DAILY LOSS LIMIT HIT: ${st.daily_pnl:+,.2f} "
                                f"exceeds -{s.max_daily_loss_pct}% of ${st.initial_balance:,.0f}")
                st.daily_loss_halt = True

        # Daily profit lock
        if s.max_daily_profit_pct > 0:
            daily_profit_limit = st.initial_balance * (s.max_daily_profit_pct / 100)
            if st.daily_pnl >= daily_profit_limit:
                if not st.daily_profit_lock:
                    log.info(f"🔒 DAILY PROFIT LOCK: ${st.daily_pnl:+,.2f} "
                             f"exceeds +{s.max_daily_profit_pct}% target")
                st.daily_profit_lock = True

        # Total drawdown from initial
        if s.max_total_drawdown_pct > 0:
            total_dd = (st.initial_balance - st.current_equity) / st.initial_balance * 100
            if total_dd >= s.max_total_drawdown_pct:
                if not st.total_drawdown_halt:
                    log.warning(f"🛑 MAX DRAWDOWN BREACHED: {total_dd:.1f}% from initial "
                                f"(limit: {s.max_total_drawdown_pct}%)")
                st.total_drawdown_halt = True

        # Trailing drawdown from peak
        if s.max_trailing_drawdown_pct > 0 and st.peak_equity > 0:
            trailing_dd = (st.peak_equity - st.current_equity) / st.peak_equity * 100
            if trailing_dd >= s.max_trailing_drawdown_pct:
                if not st.trailing_drawdown_halt:
                    log.warning(f"🛑 TRAILING DRAWDOWN BREACHED: {trailing_dd:.1f}% from peak "
                                f"${st.peak_equity:,.2f} (limit: {s.max_trailing_drawdown_pct}%)")
                st.trailing_drawdown_halt = True

    @property
    def is_trading_allowed(self) -> bool:
        """Check if trading is allowed based on all circuit breakers."""
        if not self.settings.trading_enabled:
            return False
        st = self.state
        return not (st.daily_loss_halt or st.daily_profit_lock or
                    st.total_drawdown_halt or st.trailing_drawdown_halt)

    @property
    def halt_reason(self) -> str:
        """Get the reason trading is halted, or empty string."""
        if not self.settings.trading_enabled:
            return "Trading disabled in settings"
        st = self.state
        reasons = []
        if st.daily_loss_halt:
            reasons.append(f"Daily loss limit ({self.settings.max_daily_loss_pct}%)")
        if st.daily_profit_lock:
            reasons.append(f"Daily profit locked ({self.settings.max_daily_profit_pct}%)")
        if st.total_drawdown_halt:
            reasons.append(f"Max drawdown ({self.settings.max_total_drawdown_pct}%)")
        if st.trailing_drawdown_halt:
            reasons.append(f"Trailing drawdown ({self.settings.max_trailing_drawdown_pct}%)")
        return " | ".join(reasons)

    # ────────────────────────────────────────────────────────
    # TRADE RECORDING
    # ────────────────────────────────────────────────────────

    def record_trade_result(self, pnl_usd: float, ticker: str = "",
                            direction: str = "", signal_type: str = "",
                            lots: float = 0.0, magic: int = 0):
        """
        Record a trade result and update P&L tracking.
        Called when a trade closes (from lifecycle manager or MT5 bridge).
        """
        self.state.daily_pnl += pnl_usd
        self.state.weekly_pnl += pnl_usd
        self.state.daily_trades += 1
        self.state.weekly_trades += 1
        self.state.current_equity += pnl_usd
        self.state.peak_equity = max(self.state.peak_equity, self.state.current_equity)

        # Append to recent trades (keep last 50)
        self.state.recent_trades.append({
            'timestamp': datetime.now().isoformat(),
            'ticker': ticker,
            'direction': direction,
            'signal_type': signal_type,
            'lots': lots,
            'pnl_usd': round(pnl_usd, 2),
            'magic': magic,
            'equity_after': round(self.state.current_equity, 2),
        })
        if len(self.state.recent_trades) > 50:
            self.state.recent_trades = self.state.recent_trades[-50:]

        self._check_circuit_breakers()
        self._save_state()

        log.info(f"Trade recorded: {ticker} {direction} {signal_type} → "
                 f"PnL=${pnl_usd:+,.2f} | Daily=${self.state.daily_pnl:+,.2f} | "
                 f"Equity=${self.state.current_equity:,.2f}")

    # ────────────────────────────────────────────────────────
    # BRIDGE TO SIGNAL ENGINE
    # ────────────────────────────────────────────────────────

    def get_portfolio_state(self):
        """
        Build a PortfolioState for the signal engine from current account data.
        """
        # Import here to avoid circular dependency
        from signal_engine_v2 import PortfolioState

        positions = self.sync_positions_from_mt5()

        return PortfolioState(
            equity=self.state.current_equity,
            open_positions=[
                {
                    'ticker': p['ticker'],
                    'direction': p['direction'],
                    'size': p['size'],
                    'entry': p['entry'],
                    'current_pnl': p['current_pnl'],
                    'risk_usd': abs(p['entry'] - p.get('sl', p['entry'])) * p['size'],
                }
                for p in positions
            ],
            daily_pnl=self.state.daily_pnl,
            weekly_pnl=self.state.weekly_pnl,
            peak_equity=self.state.peak_equity,
        )

    # ────────────────────────────────────────────────────────
    # REST API HELPERS (for data_server.py endpoints)
    # ────────────────────────────────────────────────────────

    def get_status_dict(self) -> dict:
        """Get full account status for the terminal dashboard."""
        s = self.settings
        st = self.state

        daily_loss_limit = st.initial_balance * (s.max_daily_loss_pct / 100) if s.max_daily_loss_pct > 0 else 0
        daily_profit_limit = st.initial_balance * (s.max_daily_profit_pct / 100) if s.max_daily_profit_pct > 0 else 0
        total_dd = (st.initial_balance - st.current_equity) / st.initial_balance * 100 if st.initial_balance > 0 else 0
        trailing_dd = (st.peak_equity - st.current_equity) / st.peak_equity * 100 if st.peak_equity > 0 else 0

        return {
            "trading_allowed": self.is_trading_allowed,
            "halt_reason": self.halt_reason,
            "login": getattr(self, "_broker", {}).get("login"),
            "server": getattr(self, "_broker", {}).get("server"),
            "equity": round(st.current_equity, 2),
            "balance": round(getattr(self, "_broker", {}).get("balance", st.initial_balance), 2),
            "currency": getattr(self, "_broker", {}).get("currency", "USD"),
            "margin": round(getattr(self, "_broker", {}).get("margin", 0.0), 2),
            "free_margin": round(getattr(self, "_broker", {}).get("free_margin", 0.0), 2),
            "initial_balance": round(st.initial_balance, 2),
            "peak_equity": round(st.peak_equity, 2),
            "daily_pnl": round(st.daily_pnl, 2),
            "daily_pnl_pct": round(st.daily_pnl / st.initial_balance * 100, 2) if st.initial_balance > 0 else 0,
            "daily_loss_limit": round(daily_loss_limit, 2),
            "daily_profit_limit": round(daily_profit_limit, 2),
            "daily_loss_halt": st.daily_loss_halt,
            "daily_profit_lock": st.daily_profit_lock,
            "weekly_pnl": round(st.weekly_pnl, 2),
            "total_drawdown_pct": round(total_dd, 2),
            "trailing_drawdown_pct": round(trailing_dd, 2),
            "total_drawdown_halt": st.total_drawdown_halt,
            "trailing_drawdown_halt": st.trailing_drawdown_halt,
            "daily_trades": st.daily_trades,
            "weekly_trades": st.weekly_trades,
            "open_positions": getattr(self, "_broker", {}).get("open_positions", len(self.sync_positions_from_mt5())),
            "max_positions": s.max_open_positions,
            "last_mt5_sync": st.last_mt5_sync,
            "last_updated": st.last_updated,
        }

    def get_settings_dict(self) -> dict:
        """Get current settings for the terminal UI."""
        return self.settings.to_dict()

    # ────────────────────────────────────────────────────────
    # MT5 DEAL HISTORY — REAL PERIOD P&L
    # ────────────────────────────────────────────────────────

    def get_period_pnl(self) -> dict:
        """
        Query MT5 closed deal history for accurate period P&L.

        Returns real closed-trade P&L (profit + swap + commission) for:
          - today, yesterday
          - this week, last week
          - this month, last month

        This is the source of truth — NOT the equity-delta tracking
        which drifts when weekly_start_equity is stale.
        """
        try:
            import MetaTrader5 as mt5
            import time as _time

            if not mt5.terminal_info():
                return self._empty_period_pnl("MT5 not connected")

            # v4: detect broker TZ offset (broker_time treated as UTC -
            # real_UTC). Round to whole hours since broker TZs are integer
            # offsets. Falls back to 0 (treat as UTC broker) on failure.
            broker_offset_sec = 0
            try:
                for sym in ("EURUSD", "XAUUSD", "USDJPY", "BTCUSD"):
                    tick = mt5.symbol_info_tick(sym)
                    if tick and getattr(tick, "time", 0):
                        raw = int(tick.time) - int(_time.time())
                        broker_offset_sec = round(raw / 3600) * 3600
                        # Sanity: clamp to ±14h (no real broker outside that)
                        if abs(broker_offset_sec) > 14 * 3600:
                            broker_offset_sec = 0
                        break
            except Exception as e:
                log.debug(f"broker offset detection failed: {e}")

            now = datetime.now()
            today_start = datetime(now.year, now.month, now.day)
            yesterday_start = today_start - timedelta(days=1)

            # Week boundaries (Monday 00:00)
            weekday = now.weekday()  # 0=Mon
            this_week_start = today_start - timedelta(days=weekday)
            last_week_start = this_week_start - timedelta(days=7)
            last_week_end = this_week_start

            # Month boundaries
            this_month_start = datetime(now.year, now.month, 1)
            if now.month == 1:
                last_month_start = datetime(now.year - 1, 12, 1)
            else:
                last_month_start = datetime(now.year, now.month - 1, 1)
            last_month_end = this_month_start

            # v4: fetch a wider window than strictly needed so deals near the
            # boundaries don't get clipped by MT5's own pseudo-UTC interpretation
            # of the input range. We filter precisely in Python below.
            query_from = last_month_start - timedelta(days=2)
            query_to   = now + timedelta(days=2)
            all_deals = mt5.history_deals_get(query_from, query_to)
            if all_deals is None:
                all_deals = ()

            # Filter to closing deals only (entry: 1=out, 2=inout, 3=out_by)
            # Deal type 6 = balance operations — skip those
            close_deals = [
                d for d in all_deals
                if d.entry in (1, 2, 3) and d.type not in (6,)
            ]

            def _sum_pnl(deals, dt_from, dt_to):
                """Sum profit + swap + commission for deals in [dt_from, dt_to).
                v4: convert d.time (broker pseudo-UTC) to real UTC before
                comparing against the boundaries (which are real UTC via
                .timestamp())."""
                ts_from = dt_from.timestamp()
                ts_to = dt_to.timestamp()
                total = 0.0
                count = 0
                for d in deals:
                    d_real_utc = d.time - broker_offset_sec
                    if ts_from <= d_real_utc < ts_to:
                        total += d.profit + d.swap + d.commission
                        count += 1
                return round(total, 2), count

            today_pnl, today_trades = _sum_pnl(close_deals, today_start, now + timedelta(hours=1))
            yesterday_pnl, yesterday_trades = _sum_pnl(close_deals, yesterday_start, today_start)
            this_week_pnl, this_week_trades = _sum_pnl(close_deals, this_week_start, now + timedelta(hours=1))
            last_week_pnl, last_week_trades = _sum_pnl(close_deals, last_week_start, last_week_end)
            this_month_pnl, this_month_trades = _sum_pnl(close_deals, this_month_start, now + timedelta(hours=1))
            last_month_pnl, last_month_trades = _sum_pnl(close_deals, last_month_start, last_month_end)

            equity = self.state.current_equity or self.state.initial_balance

            return {
                "today": {"pnl": today_pnl, "trades": today_trades,
                          "pct": round(today_pnl / equity * 100, 2) if equity > 0 else 0},
                "yesterday": {"pnl": yesterday_pnl, "trades": yesterday_trades,
                              "pct": round(yesterday_pnl / equity * 100, 2) if equity > 0 else 0},
                "this_week": {"pnl": this_week_pnl, "trades": this_week_trades,
                              "pct": round(this_week_pnl / equity * 100, 2) if equity > 0 else 0},
                "last_week": {"pnl": last_week_pnl, "trades": last_week_trades,
                              "pct": round(last_week_pnl / equity * 100, 2) if equity > 0 else 0},
                "this_month": {"pnl": this_month_pnl, "trades": this_month_trades,
                               "pct": round(this_month_pnl / equity * 100, 2) if equity > 0 else 0},
                "last_month": {"pnl": last_month_pnl, "trades": last_month_trades,
                               "pct": round(last_month_pnl / equity * 100, 2) if equity > 0 else 0},
                "source": "mt5_deals",
                "deals_scanned": len(close_deals),
            }

        except ImportError:
            return self._empty_period_pnl("MetaTrader5 not available")
        except Exception as e:
            log.warning(f"Period P&L fetch failed: {e}")
            return self._empty_period_pnl(str(e))

    @staticmethod
    def _empty_period_pnl(reason: str = "") -> dict:
        """Return empty period P&L structure."""
        empty = {"pnl": 0, "trades": 0, "pct": 0}
        return {
            "today": empty.copy(), "yesterday": empty.copy(),
            "this_week": empty.copy(), "last_week": empty.copy(),
            "this_month": empty.copy(), "last_month": empty.copy(),
            "source": "unavailable", "reason": reason,
            "deals_scanned": 0,
        }


# ============================================================
# 4. SINGLETON
# ============================================================

_manager_instance = None

def get_account_manager() -> AccountManager:
    """Get the singleton AccountManager instance."""
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = AccountManager()
    return _manager_instance