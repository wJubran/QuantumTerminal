"""
================================================================================
Quantum Terminal — Provider Registry
================================================================================
Maps provider type names to their implementation classes.

To add a new provider:
    1. Create providers/my_provider.py implementing BaseProvider — for an
       HTTP data feed, subclass providers.feed_base.FeedProvider and write
       _fetch_quotes / _fetch_bars (see binance_provider.py, ~100 lines)
    2. Add "my_provider": MyProvider to PROVIDER_REGISTRY below, and an entry
       in PROVIDER_INFO for the Settings → DATA SOURCES panel
    3. Add a default account in config_manager.DEFAULT_USER_CONFIG

That's it — the config_manager will instantiate and manage it.
================================================================================
"""

from providers.base_provider import BaseProvider
from providers.mt5_provider import MT5Provider

# ── Rithmic provider (graceful if async_rithmic not installed) ──
try:
    from providers.rithmic_provider import RithmicProvider
    RITHMIC_AVAILABLE = True
except ImportError:
    RithmicProvider = None
    RITHMIC_AVAILABLE = False

# ── Simulated market + paper trading (needs numpy) ──
try:
    from providers.sim_provider import SimProvider
    SIM_AVAILABLE = True
except ImportError:
    SimProvider = None
    SIM_AVAILABLE = False

# ── Provider type → class mapping ──
# Key = the "type" field in account config
# Value = class that implements BaseProvider
PROVIDER_REGISTRY = {
    "mt5": MT5Provider,
}

# Register Rithmic only if async_rithmic is installed
if RITHMIC_AVAILABLE:
    PROVIDER_REGISTRY["rithmic"] = RithmicProvider

if SIM_AVAILABLE:
    PROVIDER_REGISTRY["sim"] = SimProvider

# ── Internet data feeds and the paper account (need httpx; yfinance for Yahoo) ──
from providers.yahoo_provider import YahooProvider          # noqa: E402
from providers.binance_provider import BinanceProvider      # noqa: E402
from providers.oanda_provider import OandaProvider          # noqa: E402
from providers.alpaca_provider import AlpacaProvider        # noqa: E402
from providers.csv_provider import CsvProvider              # noqa: E402

PROVIDER_REGISTRY.update({
    "yahoo": YahooProvider,
    "binance": BinanceProvider,
    "oanda": OandaProvider,
    "alpaca": AlpacaProvider,
    "csv": CsvProvider,
})
if SIM_AVAILABLE:
    from providers.paper_provider import PaperProvider      # noqa: E402
    PROVIDER_REGISTRY["paper"] = PaperProvider

# Sources that only deliver prices: the paper account (or MT5 / OANDA) executes.
DATA_ONLY_TYPES = {"yahoo", "binance", "alpaca", "csv", "rithmic"}

# What the Settings → DATA SOURCES panel shows for each type, and the fields
# it lets the user edit (secret fields are never sent back to the browser).
PROVIDER_INFO = {
    "mt5": {"label": "MetaTrader 5", "data": True, "execution": True, "realtime": True,
            "covers": "Everything your broker offers: forex, metals, energy, indices, stocks, crypto CFDs",
            "needs": "Windows, the MetaTrader 5 terminal, a broker account (demo is fine)",
            "fields": []},
    "sim": {"label": "Simulated market", "data": True, "execution": True, "realtime": True,
            "covers": "Synthetic prices for the default tickers (not market data)",
            "needs": "Nothing",
            "fields": [{"key": "seed", "label": "Seed", "type": "number"},
                       {"key": "initial_balance", "label": "Starting balance (USD)", "type": "number"},
                       {"key": "leverage", "label": "Leverage", "type": "number"}]},
    "yahoo": {"label": "Yahoo Finance", "data": True, "execution": False, "realtime": False,
              "covers": "Forex, metals, energy and agricultural futures, indices, stocks, ETFs, crypto",
              "needs": "Internet only. Free, delayed (up to 10-15 min for futures and stocks)",
              "fields": [{"key": "quote_interval", "label": "Quote refresh (seconds)", "type": "number"}]},
    "binance": {"label": "Binance", "data": True, "execution": False, "realtime": True,
                "covers": "Crypto (BTCUSD, ETHUSD, SOLUSD … against USDT)",
                "needs": "Internet only. Free, no account needed",
                "fields": [{"key": "base_url", "label": "API address", "type": "select",
                            "options": ["https://api.binance.com", "https://api.binance.us",
                                        "https://data-api.binance.vision"]},
                           {"key": "quote_asset", "label": "Quote asset", "type": "text"}]},
    "oanda": {"label": "OANDA", "data": True, "execution": True, "realtime": True,
              "covers": "Forex, gold, silver, oil, natural gas, copper, grains, sugar, index CFDs",
              "needs": "An OANDA account (free practice account works) and an API token",
              "fields": [{"key": "environment", "label": "Environment", "type": "select",
                          "options": ["practice", "live"]},
                         {"key": "token", "label": "API token", "type": "secret"},
                         {"key": "account_id", "label": "Account ID (empty: first account)", "type": "text"}]},
    "alpaca": {"label": "Alpaca", "data": True, "execution": False, "realtime": True,
               "covers": "US stocks and ETFs (incl. GLD, SLV, USO, UNG, CPER), crypto",
               "needs": "A free Alpaca account and an API key pair",
               "fields": [{"key": "key_id", "label": "API key ID", "type": "text"},
                          {"key": "secret_key", "label": "API secret", "type": "secret"},
                          {"key": "feed", "label": "Feed", "type": "select", "options": ["iex", "sip"]}]},
    "csv": {"label": "CSV files", "data": True, "execution": False, "realtime": False,
            "covers": "Any instrument you have bars for, exported from MT5, TradingView, NinjaTrader…",
            "needs": "Files named like XAUUSD_M15.csv in the folder below",
            "fields": [{"key": "folder", "label": "Folder (empty: <app-data>/csv)", "type": "text"}]},
    "paper": {"label": "Paper account (live prices)", "data": False, "execution": True, "realtime": True,
              "covers": "Practice orders at the live prices of the active data source",
              "needs": "Nothing",
              "fields": [{"key": "initial_balance", "label": "Starting balance (USD)", "type": "number"},
                         {"key": "leverage", "label": "Leverage", "type": "number"}]},
    "rithmic": {"label": "Rithmic", "data": True, "execution": False, "realtime": True,
                "covers": "CME futures", "needs": "A Rithmic account and the async_rithmic package",
                "fields": []},
}


def create_provider(account_config: dict) -> BaseProvider:
    """
    Factory: create a provider instance from account config dict.
    
    Expected config shape:
        {
            "id": "mt5_primary",
            "type": "mt5",
            "label": "MT5 — CFI (Live)",
            "terminal_path": null,
            "aliases": {}
        }
    
    Raises KeyError if provider type is not registered.
    """
    provider_type = account_config.get("type", "")
    if provider_type not in PROVIDER_REGISTRY:
        registered = ", ".join(PROVIDER_REGISTRY.keys())
        raise KeyError(
            f"Unknown provider type: '{provider_type}'. "
            f"Registered types: {registered}"
        )
    
    cls = PROVIDER_REGISTRY[provider_type]
    return cls(account_config)


def list_provider_types() -> list:
    """Return list of registered provider type names."""
    return list(PROVIDER_REGISTRY.keys())
