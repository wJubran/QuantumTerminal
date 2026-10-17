"""
================================================================================
Quantum Terminal — Interactive Brokers (IBKR) Provider
================================================================================
Connects to IB Gateway or TWS via ib_async.

Supported:
    - Real-time tick data (reqMktData)
    - Historical bars (reqHistoricalData)
    - Account info
    - Order execution (bracket, market, limit)

Requirements:
    pip install ib_async

IB Gateway must be running and API connections enabled.
Default ports: 4001 (IB Gateway), 7497 (TWS paper), 7496 (TWS live).
================================================================================
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from ib_async import IB, Stock, Forex, Future, Contract, MarketOrder, LimitOrder, BracketOrder
from ib_async.ticker import Ticker

from providers.base_provider import BaseProvider
from models import TickData, BarData, AccountInfo, SymbolInfo, OrderRequest, OrderResult, Position

# Timeframe mapping: canonical → IBKR bar size string
TIMEFRAME_MAP = {
    "M1":  "1 min",
    "M5":  "5 mins",
    "M15": "15 mins",
    "M30": "30 mins",
    "H1":  "1 hour",
    "H4":  "4 hours",
    "D1":  "1 day",
    "W1":  "1 week",
}

# Duration string for historical data requests
TIMEFRAME_DURATION = {
    "M1":  "1 D",
    "M5":  "2 D",
    "M15": "5 D",
    "M30": "10 D",
    "H1":  "1 M",
    "H4":  "3 M",
    "D1":  "1 Y",
    "W1":  "2 Y",
}


class IBKRProvider(BaseProvider):
    """
    Interactive Brokers data + execution provider.

    Wraps ib_async in a dedicated thread to keep MT5-style synchronous
    interface compatible with the BaseProvider contract.
    """

    PROVIDER_TYPE = "ibkr"

    def __init__(self, config: dict):
        """
        Args:
            config: {
                "id":        "ibkr_primary",
                "label":     "IBKR — Live",
                "host":      "127.0.0.1",   # IB Gateway host
                "port":      4001,           # 4001 = Gateway, 7497 = TWS paper
                "client_id": 1,
                "account":   "",             # leave blank for default account
                "symbols":   ["EURUSD", "AAPL", "XAUUSD"],
            }
        """
        self._id = config.get("id", "ibkr_primary")
        self._label = config.get("label", "IBKR")
        self._host = config.get("host", "127.0.0.1")
        self._port = int(config.get("port", 4001))
        self._client_id = int(config.get("client_id", 1))
        self._account = config.get("account", "")
        self._symbols = config.get("symbols", [])

        self._ib = IB()
        self._connected = False
        self._lock = threading.Lock()
        self._last_bars: Dict[str, Dict[str, datetime]] = {}   # symbol → tf → last bar time

    # ── Identity ──────────────────────────────────────────────────────────────

    @property
    def provider_type(self) -> str:
        return self.PROVIDER_TYPE

    @property
    def provider_id(self) -> str:
        return self._id

    @property
    def label(self) -> str:
        return self._label

    @property
    def can_execute(self) -> bool:
        return True

    # ── Connection ────────────────────────────────────────────────────────────

    @property
    def connected(self) -> bool:
        return self._connected and self._ib.isConnected()

    def connect(self) -> bool:
        if self.connected:
            return True
        try:
            self._ib.connect(self._host, self._port, clientId=self._client_id)
            self._connected = True
            return True
        except Exception as exc:
            self._connected = False
            return False

    def disconnect(self) -> None:
        try:
            self._ib.disconnect()
        except Exception:
            pass
        self._connected = False

    def heartbeat(self) -> bool:
        try:
            self._ib.reqCurrentTime()
            return True
        except Exception:
            self._connected = False
            return False

    # ── Symbol Resolution ─────────────────────────────────────────────────────

    def resolve_symbol(self, canonical: str) -> Optional[str]:
        """Map canonical ticker to IBKR contract. Returns canonical as-is (resolved in _make_contract)."""
        return canonical

    def _make_contract(self, canonical: str) -> Contract:
        """Convert canonical ticker to an IBKR Contract object."""
        # Forex pairs: 6-char string like EURUSD
        if len(canonical) == 6 and canonical.isalpha():
            return Forex(canonical)
        # Commodities
        if canonical in ("XAUUSD", "XAGUSD"):
            c = Contract()
            c.symbol = "XAUUSD" if "XAU" in canonical else "XAGUSD"
            c.secType = "CMDTY"
            c.exchange = "SMART"
            c.currency = "USD"
            return c
        # Default: US stock
        return Stock(canonical, "SMART", "USD")

    # ── Market Data ───────────────────────────────────────────────────────────

    def get_latest_ticks(self, symbols: List[str]) -> Dict[str, TickData]:
        result = {}
        for sym in symbols:
            try:
                contract = self._make_contract(sym)
                self._ib.qualifyContracts(contract)
                ticker = self._ib.reqMktData(contract, "", False, False)
                self._ib.sleep(0.1)
                result[sym] = TickData(
                    symbol=sym,
                    bid=ticker.bid or 0.0,
                    ask=ticker.ask or 0.0,
                    last=ticker.last or 0.0,
                    volume=int(ticker.volume or 0),
                    timestamp=datetime.now(timezone.utc),
                )
                self._ib.cancelMktData(contract)
            except Exception:
                continue
        return result

    def get_bars(self, ticker: str, timeframe: str = "M15", count: int = 200) -> List[BarData]:
        bar_size = TIMEFRAME_MAP.get(timeframe, "15 mins")
        duration = TIMEFRAME_DURATION.get(timeframe, "5 D")
        try:
            contract = self._make_contract(ticker)
            self._ib.qualifyContracts(contract)
            bars = self._ib.reqHistoricalData(
                contract,
                endDateTime="",
                durationStr=duration,
                barSizeSetting=bar_size,
                whatToShow="MIDPOINT" if len(ticker) == 6 else "TRADES",
                useRTH=False,
                formatDate=1,
            )
            return [
                BarData(
                    symbol=ticker,
                    timeframe=timeframe,
                    open=b.open,
                    high=b.high,
                    low=b.low,
                    close=b.close,
                    volume=int(b.volume),
                    timestamp=b.date if isinstance(b.date, datetime) else datetime.strptime(str(b.date), "%Y%m%d"),
                )
                for b in bars[-count:]
            ]
        except Exception:
            return []

    def check_new_bars(self, symbols: List[str], timeframe: str = "M15") -> List[dict]:
        new_bars = []
        for sym in symbols:
            bars = self.get_bars(sym, timeframe, count=2)
            if not bars:
                continue
            last = bars[-1]
            prev_time = self._last_bars.get(sym, {}).get(timeframe)
            if prev_time is None or last.timestamp > prev_time:
                self._last_bars.setdefault(sym, {})[timeframe] = last.timestamp
                if prev_time is not None:
                    new_bars.append({
                        "type": "bar",
                        "ticker": sym,
                        "timeframe": timeframe,
                        "bar": last.to_dict(),
                    })
        return new_bars

    def get_symbol_info(self, ticker: str) -> Optional[SymbolInfo]:
        try:
            contract = self._make_contract(ticker)
            details = self._ib.reqContractDetails(contract)
            if not details:
                return None
            d = details[0]
            return SymbolInfo(
                symbol=ticker,
                digits=d.minTick,
                lot_size=d.contract.multiplier or 1,
                min_lot=0.01,
                max_lot=10000.0,
                lot_step=0.01,
            )
        except Exception:
            return None

    # ── Account ───────────────────────────────────────────────────────────────

    def get_account_info(self) -> Optional[AccountInfo]:
        try:
            account = self._account or self._ib.managedAccounts()[0]
            values = {v.tag: float(v.value) for v in self._ib.accountValues(account) if v.currency in ("USD", "BASE")}
            return AccountInfo(
                balance=values.get("TotalCashValue", 0.0),
                equity=values.get("NetLiquidation", 0.0),
                margin=values.get("MaintMarginReq", 0.0),
                free_margin=values.get("AvailableFunds", 0.0),
                profit=values.get("UnrealizedPnL", 0.0),
            )
        except Exception:
            return None

    # ── Execution ─────────────────────────────────────────────────────────────

    def place_order(self, order: OrderRequest) -> OrderResult:
        try:
            contract = self._make_contract(order.symbol)
            self._ib.qualifyContracts(contract)

            if order.order_type == "MARKET":
                ib_order = MarketOrder(order.side, order.volume)
            else:
                ib_order = LimitOrder(order.side, order.volume, order.price)

            trade = self._ib.placeOrder(contract, ib_order)
            self._ib.sleep(0.5)
            return OrderResult(success=True, ticket=str(trade.order.orderId))
        except Exception as exc:
            return OrderResult(success=False, error=str(exc))

    def get_positions(self) -> List[Position]:
        try:
            return [
                Position(
                    symbol=p.contract.symbol,
                    side="BUY" if p.position > 0 else "SELL",
                    volume=abs(p.position),
                    open_price=p.avgCost,
                    profit=p.unrealizedPNL or 0.0,
                    ticket=str(p.contract.conId),
                )
                for p in self._ib.positions()
            ]
        except Exception:
            return []

    def close_position(self, ticket: str, lots: Optional[float] = None) -> OrderResult:
        try:
            positions = self._ib.positions()
            pos = next((p for p in positions if str(p.contract.conId) == ticket), None)
            if not pos:
                return OrderResult(success=False, error="Position not found")
            volume = lots if lots else abs(pos.position)
            side = "SELL" if pos.position > 0 else "BUY"
            order = MarketOrder(side, volume)
            trade = self._ib.placeOrder(pos.contract, order)
            self._ib.sleep(0.5)
            return OrderResult(success=True, ticket=str(trade.order.orderId))
        except Exception as exc:
            return OrderResult(success=False, error=str(exc))
