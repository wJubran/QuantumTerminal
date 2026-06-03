"""
================================================================================
Quantum Terminal — Provider Registry
================================================================================
Maps provider type names to their implementation classes.

To add a new provider:
    1. Create providers/my_provider.py implementing BaseProvider
    2. Add "my_provider": MyProvider to PROVIDER_REGISTRY below
    3. Add account config in user_config.json under providers.accounts

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

# ── TickerAll provider (graceful if the `tickerall` package isn't installed) ──
try:
    from providers.tickerall_provider import TickerAllProvider
    TICKERALL_AVAILABLE = True
except ImportError:
    TickerAllProvider = None
    TICKERALL_AVAILABLE = False

# ── Provider type → class mapping ──
# Key = the "type" field in account config
# Value = class that implements BaseProvider
PROVIDER_REGISTRY = {
    "mt5": MT5Provider,
}

# Register Rithmic only if async_rithmic is installed
if RITHMIC_AVAILABLE:
    PROVIDER_REGISTRY["rithmic"] = RithmicProvider

# Register TickerAll only if the `tickerall` package is installed
if TICKERALL_AVAILABLE:
    PROVIDER_REGISTRY["tickerall"] = TickerAllProvider


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
