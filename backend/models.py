"""
models.py — Data models for consumer terminal.
Provides TickData, BarData, etc. that providers and data_server import.

All classes accept and silently ignore unknown keyword arguments
so PRO provider code that passes extra fields won't crash.
"""
from typing import Optional, Dict, Any
from datetime import datetime


def _make_flex(cls):
    """Decorator: wraps __init__ to silently drop unknown kwargs."""
    orig = cls.__init__
    import inspect
    params = set(inspect.signature(orig).parameters.keys()) - {'self'}

    def flex_init(self, *args, **kwargs):
        valid = {k: v for k, v in kwargs.items() if k in params}
        orig(self, *args, **valid)
        # Store extras as attributes
        for k, v in kwargs.items():
            if k not in params:
                setattr(self, k, v)

    cls.__init__ = flex_init

    # Add to_dict if not present
    if not hasattr(cls, 'to_dict'):
        def to_dict(self):
            d = {}
            for k in params:
                d[k] = getattr(self, k, None)
            for k, v in self.__dict__.items():
                if k not in d:
                    d[k] = v
            return d
        cls.to_dict = to_dict

    return cls


from dataclasses import dataclass


@_make_flex
@dataclass
class TickData:
    ticker: str = ""
    symbol: str = ""
    bid: float = 0.0
    ask: float = 0.0
    last: float = 0.0
    volume: float = 0.0
    time: Optional[datetime] = None
    spread: float = 0.0
    time_msc: int = 0
    flags: int = 0
    volume_real: float = 0.0


@_make_flex
@dataclass
class BarData:
    ticker: str = ""
    symbol: str = ""
    timeframe: str = ""
    time: Optional[datetime] = None
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    volume: float = 0.0
    tick_volume: float = 0.0
    spread: int = 0
    real_volume: float = 0.0


@_make_flex
@dataclass
class AccountInfo:
    balance: float = 0.0
    equity: float = 0.0
    margin: float = 0.0
    free_margin: float = 0.0
    currency: str = "USD"
    leverage: int = 100
    server: str = ""
    login: int = 0
    name: str = ""
    company: str = ""
    profit: float = 0.0
    margin_level: float = 0.0


@_make_flex
@dataclass
class SymbolInfo:
    ticker: str = ""
    symbol: str = ""
    description: str = ""
    point: float = 0.0
    digits: int = 5
    tick_size: float = 0.0
    tick_value: float = 0.0
    volume_min: float = 0.01
    volume_max: float = 100.0
    volume_step: float = 0.01
    trade_contract_size: float = 100000.0
    currency_base: str = ""
    currency_profit: str = ""
    currency_margin: str = ""
    spread: int = 0
    trade_mode: int = 0
    trade_stops_level: int = 0
    swap_long: float = 0.0
    swap_short: float = 0.0


@_make_flex
@dataclass
class OrderRequest:
    symbol: str = ""
    ticker: str = ""
    direction: str = ""
    volume: float = 0.01
    price: float = 0.0
    sl: float = 0.0
    tp: float = 0.0
    comment: str = ""
    order_type: str = "market"


@_make_flex
@dataclass
class OrderResult:
    success: bool = False
    order_id: int = 0
    message: str = ""
    price: float = 0.0
    volume: float = 0.0
    retcode: int = 0


@_make_flex
@dataclass
class Position:
    ticket: int = 0
    symbol: str = ""
    ticker: str = ""
    direction: str = ""
    volume: float = 0.0
    price_open: float = 0.0
    price_current: float = 0.0
    sl: float = 0.0
    tp: float = 0.0
    profit: float = 0.0
    comment: str = ""
    time_open: Optional[datetime] = None
    swap: float = 0.0
    commission: float = 0.0


@_make_flex
@dataclass
class PendingOrder:
    """A resting (unfilled) order — LIMIT or STOP — on the broker."""
    ticket: int = 0
    symbol: str = ""
    ticker: str = ""
    direction: str = ""          # "BUY" | "SELL"
    order_type: str = ""         # "LIMIT" | "STOP"
    volume: float = 0.0
    price_open: float = 0.0
    sl: float = 0.0
    tp: float = 0.0
    comment: str = ""
    time_setup: Optional[datetime] = None


@_make_flex
@dataclass
class ClosedTrade:
    """A completed round-trip (entry + exit deal) from the broker history."""
    ticket: str = ""
    ticker: str = ""
    direction: str = ""          # "BUY" | "SELL"
    lots: float = 0.0
    open_price: float = 0.0
    close_price: float = 0.0
    profit: float = 0.0
    commission: float = 0.0
    swap: float = 0.0
    open_time: str = ""          # ISO-8601 UTC
    close_time: str = ""         # ISO-8601 UTC
    comment: str = ""
    magic: int = 0