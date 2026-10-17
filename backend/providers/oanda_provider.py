"""
================================================================================
Quantum Terminal — OANDA (forex, metals, commodities, indices): data + trading
================================================================================
OANDA's v20 REST API. You need an OANDA account and an API token; a free
practice account works. Create the token under My Account → Manage API Access.

    account config (providers.accounts.oanda_default)
        environment   "practice" (default) or "live"
        token         the API token (or the OANDA_TOKEN environment variable)
        account_id    e.g. 101-004-1234567-001 (or OANDA_ACCOUNT_ID). Empty: the
                      first account the token can reach
        clock         "ny_close" (default): the day starts at the 17:00 New York
                      roll, as on MetaTrader 5 forex brokers; "utc"
        symbols       {"US500": "SPX500_USD", …} extra or replacement mappings

Prices: bid/ask for every instrument in one /pricing request per second.
Bars: bid candles, with daily candles at the 17:00 New York roll.

Trading:
- market, limit and stop orders with SL/TP;
- partial closes, SL/TP changes, pending-order edits and cancels;
- account balance, equity and margin.

1 lot is the instrument's standard contract: 100,000 units of a currency
pair, 100 oz of gold, 5,000 oz of silver, 1,000 barrels of oil, or 1 unit of
an index. Try a practice account first; the terminal blocks orders until you
switch LIVE TRADING on.
================================================================================
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from models import AccountInfo, ClosedTrade, OrderRequest, OrderResult, PendingOrder, Position
from providers.feed_base import FeedError, FeedProvider, Row, check_response, http_client, parse_iso

log = logging.getLogger("qt.provider.oanda")

_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK",
               "PLN", "HUF", "CZK", "TRY", "ZAR", "MXN", "SGD", "HKD", "CNH"}


def _fail(message: str) -> OrderResult:
    return OrderResult(success=False, error=message, message=message)


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


class OandaProvider(FeedProvider):
    TYPE = "oanda"
    LABEL = "OANDA (forex, metals, commodities, indices)"
    is_simulated = False
    SYMBOLS = {
        "XAUUSD": "XAU_USD", "XAGUSD": "XAG_USD", "XPTUSD": "XPT_USD", "XPDUSD": "XPD_USD",
        "COPPER": "XCU_USD", "XTIUSD": "WTICO_USD", "XBRUSD": "BCO_USD", "NATGAS": "NATGAS_USD",
        "XNGUSD": "NATGAS_USD", "CORN": "CORN_USD", "WHEAT": "WHEAT_USD", "SOYBEAN": "SOYBN_USD",
        "SUGAR": "SUGAR_USD", "US500": "SPX500_USD", "USTEC": "NAS100_USD", "US30": "US30_USD",
        "US2000": "US2000_USD", "GER40": "DE30_EUR", "UK100": "UK100_GBP", "JP225": "JP225_USD",
        "FRA40": "FR40_EUR", "EU50": "EU50_EUR", "AUS200": "AU200_AUD", "HK50": "HK33_HKD",
        "BTCUSD": "BTC_USD", "ETHUSD": "ETH_USD",
    }
    NATIVE = {"M1": "M1", "M5": "M5", "M15": "M15", "M30": "M30",
              "H1": "H1", "H4": "H4", "D1": "D", "W1": "W"}
    DEFAULT_CLOCK = "ny_close"
    HOSTS = {"practice": "https://api-fxpractice.oanda.com", "live": "https://api-fxtrade.oanda.com"}
    MAX_COUNT = 5000

    def __init__(self, account_config: Dict):
        super().__init__(account_config)
        self.environment = str(self._cfg.get("environment") or "practice").lower()
        self.token = self._cfg.get("token") or os.environ.get("OANDA_TOKEN", "")
        self.account_id = self._cfg.get("account_id") or os.environ.get("OANDA_ACCOUNT_ID", "")
        self.base_url = (self._cfg.get("base_url") or self.HOSTS.get(self.environment, self.HOSTS["practice"])).rstrip("/")
        self._client = None
        self._instruments: Dict[str, dict] = {}

    # ── plumbing ──

    @property
    def can_execute(self) -> bool:
        return bool(self.token and self.account_id)

    def _http(self):
        if self._client is None:
            self._client = http_client({"Authorization": f"Bearer {self.token}",
                                        "Accept-Datetime-Format": "RFC3339",
                                        "Content-Type": "application/json"})
        return self._client

    def _request(self, method: str, path: str, **kw) -> Any:
        return check_response(self._http().request(method, self.base_url + path, **kw), "OANDA").json()

    def _send(self, method: str, path: str, body: Optional[dict] = None) -> Tuple[bool, dict]:
        """A trading call whose rejections come back as JSON with a reason:
        (ok, payload)."""
        resp = self._http().request(method, self.base_url + path, json=body)
        try:
            data = resp.json()
        except ValueError:
            data = {"errorMessage": (resp.text or "")[:200]}
        return resp.status_code < 300, data

    @staticmethod
    def _reason(data: dict) -> str:
        for k in ("orderRejectTransaction", "orderCancelTransaction", "tradeClientExtensionsModifyRejectTransaction"):
            tx = data.get(k)
            if isinstance(tx, dict) and tx.get("rejectReason" if "Reject" in k else "reason"):
                return f"{data.get('errorMessage') or 'Rejected'} ({tx.get('rejectReason') or tx.get('reason')})"
        return data.get("errorMessage") or str(data)[:200]

    def guess_symbol(self, canonical: str):
        if len(canonical) == 6 and canonical[:3] in _CURRENCIES and canonical[3:] in _CURRENCIES:
            return f"{canonical[:3]}_{canonical[3:]}"
        if "_" in canonical:
            return canonical
        return None

    def canonical_of(self, instrument: str) -> str:
        for c, inst in {**self.SYMBOLS, **self._overrides}.items():
            if inst == instrument:
                return c
        return instrument.replace("_", "")

    def _check_connection(self) -> None:
        if not self.token:
            raise FeedError("OANDA needs an API token: create one under My Account → Manage API Access, "
                            "then enter it in Settings → DATA SOURCES (or set OANDA_TOKEN)")
        accounts = [a.get("id") for a in self._request("GET", "/v3/accounts").get("accounts", [])]
        if not accounts:
            raise FeedError("OANDA: this token has no accounts")
        if not self.account_id:
            self.account_id = accounts[0]
        elif self.account_id not in accounts:
            raise FeedError(f"OANDA: account {self.account_id} is not reachable with this token "
                            f"(available: {', '.join(accounts)})")
        data = self._request("GET", f"/v3/accounts/{self.account_id}/instruments")
        self._instruments = {i["name"]: i for i in data.get("instruments", [])}

    def digits(self, canonical: str, price: float = 0.0) -> int:
        inst = self._instruments.get(self.feed_symbol(canonical) or "")
        if inst and "displayPrecision" in inst:
            return int(inst["displayPrecision"])
        return super().digits(canonical, price)

    def guess_alive(self, canonical: str) -> bool:
        return not self._instruments or (self.feed_symbol(canonical) or "") in self._instruments

    def resolve_universe(self, universe: List[str]) -> List[str]:
        resolved = super().resolve_universe(universe)
        if self._instruments:
            missing = [c for c in resolved if not self.guess_alive(c)]
            if missing:
                log.info(f"OANDA: not offered on this account: {', '.join(missing)}")
            self._resolved = [c for c in resolved if self.guess_alive(c)]
        return list(self._resolved)

    # ── market data ──

    def _fetch_quotes(self, pairs: List[Tuple[str, str]]) -> Dict[str, Tuple[float, float, float, float]]:
        by_inst = {f: c for c, f in pairs if self.guess_alive(c)}
        if not by_inst:
            return {}
        path = f"/v3/accounts/{self.account_id}/pricing"
        try:
            prices = self._request("GET", path, params={"instruments": ",".join(by_inst)}).get("prices", [])
        except FeedError:
            prices = []
            for inst in by_inst:
                try:
                    prices += self._request("GET", path, params={"instruments": inst}).get("prices", [])
                except FeedError:
                    continue
        out = {}
        for p in prices:
            c = by_inst.get(p.get("instrument"))
            if c is None or not p.get("bids") or not p.get("asks"):
                continue
            bid, ask = float(p["bids"][0]["price"]), float(p["asks"][0]["price"])
            out[c] = (bid, ask, bid, parse_iso(p["time"]) if p.get("time") else time.time())
        return out

    def _alignment(self) -> Dict[str, Any]:
        if self.clock == "ny_close":
            return {"dailyAlignment": 17, "alignmentTimezone": "America/New_York", "weeklyAlignment": "Sunday"}
        return {"dailyAlignment": 0, "alignmentTimezone": "UTC", "weeklyAlignment": "Monday"}

    def _fetch_bars(self, symbol: str, timeframe: str, count: int) -> List[Row]:
        rows: List[Row] = []
        to = None
        while len(rows) < count:
            params = {"granularity": self.NATIVE[timeframe], "price": "B",
                      "count": min(self.MAX_COUNT, count - len(rows)), **self._alignment()}
            if to is not None:
                params["to"] = to
            candles = self._request("GET", f"/v3/instruments/{symbol}/candles", params=params).get("candles", [])
            batch = [(parse_iso(c["time"]), float(c["bid"]["o"]), float(c["bid"]["h"]), float(c["bid"]["l"]),
                      float(c["bid"]["c"]), float(c.get("volume", 0))) for c in candles if c.get("bid")]
            if not batch:
                break
            rows = [r for r in batch if not rows or r[0] < rows[0][0]] + rows
            if len(candles) < params["count"]:
                break
            to = candles[0]["time"]
        return rows[-count:]

    # ── trading ──

    def _contract(self, canonical: str) -> float:
        from providers.sim_provider import _SPECS
        spec = _SPECS.get(canonical)
        return float(spec[4]) if spec else float(self._cfg.get("contract_size", 1.0))

    def _units(self, canonical: str, lots: float) -> str:
        inst = self._instruments.get(self.feed_symbol(canonical) or "", {})
        places = int(inst.get("tradeUnitsPrecision", 0))
        units = round(abs(lots) * self._contract(canonical), places)
        return str(int(units)) if places == 0 else f"{units:.{places}f}"

    def _price(self, canonical: str, price: float) -> str:
        return f"{float(price):.{self.digits(canonical, price)}f}"

    def place_order(self, order: OrderRequest) -> OrderResult:
        if not self._connected:
            return _fail("OANDA is not connected")
        canonical = (order.ticker or order.symbol or "").upper()
        inst = self.feed_symbol(canonical)
        direction = (order.direction or "").upper()
        kind = (order.order_type or "MARKET").upper()
        lots = float(getattr(order, "lots", None) or order.volume or 0)
        if not inst or direction not in ("BUY", "SELL") or kind not in ("MARKET", "LIMIT", "STOP"):
            return _fail(f"Unsupported order: {kind} {direction} {canonical}")
        if lots <= 0:
            return _fail("Invalid volume")
        units = self._units(canonical, lots)
        if float(units) == 0:
            return _fail("Volume too small for this instrument")
        body: Dict[str, Any] = {"type": kind, "instrument": inst,
                                "units": units if direction == "BUY" else f"-{units}",
                                "positionFill": "DEFAULT"}
        if kind == "MARKET":
            body["timeInForce"] = "FOK"
        else:
            if not order.price:
                return _fail(f"{kind} orders need a price")
            body["price"] = self._price(canonical, order.price)
            body["timeInForce"] = "GTC"
        sl = getattr(order, "stop_loss", None) or order.sl
        tp = getattr(order, "take_profit", None) or order.tp
        if sl:
            body["stopLossOnFill"] = {"price": self._price(canonical, sl), "timeInForce": "GTC"}
        if tp:
            body["takeProfitOnFill"] = {"price": self._price(canonical, tp), "timeInForce": "GTC"}
        if order.comment:
            body["clientExtensions"] = {"comment": str(order.comment)[:128], "tag": "quantum-terminal"}
        ok, data = self._send("POST", f"/v3/accounts/{self.account_id}/orders", {"order": body})
        fill = data.get("orderFillTransaction")
        if ok and fill:
            ticket = (fill.get("tradeOpened") or {}).get("tradeID") or fill.get("id")
            log.info(f"OANDA {kind} {direction} {lots} {canonical} filled @ {fill.get('price')} → trade {ticket}")
            return OrderResult(success=True, order_id=str(ticket), ticker=canonical, direction=direction,
                               lots=lots, price=float(fill.get("price") or 0))
        created = data.get("orderCreateTransaction")
        if ok and created and kind != "MARKET" and "orderCancelTransaction" not in data:
            return OrderResult(success=True, order_id=str(created.get("id")), ticker=canonical,
                               direction=direction, lots=lots, price=float(order.price or 0))
        return _fail(self._reason(data))

    def _trades(self) -> List[dict]:
        return self._request("GET", f"/v3/accounts/{self.account_id}/openTrades").get("trades", [])

    def get_positions(self) -> List[Position]:
        if not self._connected or not self.account_id:
            return []
        out = []
        for t in self._trades():
            canonical = self.canonical_of(t["instrument"])
            units = float(t.get("currentUnits", 0))
            direction = "BUY" if units > 0 else "SELL"
            tick = self.get_latest_ticks([canonical]).get(canonical)
            current = (tick.bid if direction == "BUY" else tick.ask) if tick else float(t["price"])
            lots = round(abs(units) / self._contract(canonical), 4)
            out.append(Position(
                ticket=str(t["id"]), ticker=canonical, symbol=canonical, direction=direction,
                lots=lots, volume=lots, open_price=float(t["price"]), current_price=current,
                stop_loss=float((t.get("stopLossOrder") or {}).get("price") or 0),
                take_profit=float((t.get("takeProfitOrder") or {}).get("price") or 0),
                profit=float(t.get("unrealizedPL") or 0), swap=float(t.get("financing") or 0),
                open_time=t.get("openTime", ""), comment=(t.get("clientExtensions") or {}).get("comment", ""),
            ))
        return out

    def close_position(self, ticket: str, lots: Optional[float] = None) -> OrderResult:
        if not self._connected:
            return _fail("OANDA is not connected")
        body = {"units": "ALL"}
        canonical = None
        if lots:
            trade = next((t for t in self._trades() if str(t["id"]) == str(ticket)), None)
            if trade is None:
                return _fail(f"Position {ticket} not found")
            canonical = self.canonical_of(trade["instrument"])
            body = {"units": self._units(canonical, float(lots))}
        ok, data = self._send("PUT", f"/v3/accounts/{self.account_id}/trades/{ticket}/close", body)
        fill = data.get("orderFillTransaction")
        if ok and fill:
            return OrderResult(success=True, order_id=str(ticket), price=float(fill.get("price") or 0),
                               ticker=canonical or "", lots=float(lots or 0))
        return _fail(self._reason(data))

    def modify_position(self, ticket: str, stop_loss=None, take_profit=None) -> dict:
        """None keeps a level, 0 removes it (same contract as MetaTrader 5)."""
        trade = next((t for t in self._trades() if str(t["id"]) == str(ticket)), None)
        if trade is None:
            return {"success": False, "error": f"Position {ticket} not found"}
        canonical = self.canonical_of(trade["instrument"])
        body: Dict[str, Any] = {}
        for key, value in (("stopLoss", stop_loss), ("takeProfit", take_profit)):
            if value is None:
                continue
            body[key] = {"price": self._price(canonical, value), "timeInForce": "GTC"} if float(value) else None
        if not body:
            return {"success": True, "ticket": str(ticket)}
        ok, data = self._send("PUT", f"/v3/accounts/{self.account_id}/trades/{ticket}/orders", body)
        if ok:
            return {"success": True, "ticket": str(ticket), "stop_loss": stop_loss, "take_profit": take_profit}
        return {"success": False, "error": self._reason(data)}

    def _pending(self) -> List[dict]:
        orders = self._request("GET", f"/v3/accounts/{self.account_id}/pendingOrders").get("orders", [])
        return [o for o in orders if o.get("type") in ("LIMIT", "STOP")]

    def get_pending_orders(self) -> List[PendingOrder]:
        if not self._connected or not self.account_id:
            return []
        out = []
        for o in self._pending():
            canonical = self.canonical_of(o["instrument"])
            units = float(o.get("units", 0))
            lots = round(abs(units) / self._contract(canonical), 4)
            out.append(PendingOrder(
                ticket=str(o["id"]), ticker=canonical, symbol=canonical,
                direction="BUY" if units > 0 else "SELL", order_type=o["type"],
                lots=lots, volume=lots, price=float(o["price"]), price_open=float(o["price"]),
                stop_loss=float((o.get("stopLossOnFill") or {}).get("price") or 0),
                take_profit=float((o.get("takeProfitOnFill") or {}).get("price") or 0),
                time_setup=o.get("createTime", ""),
            ))
        return out

    def cancel_order(self, ticket: str) -> OrderResult:
        ok, data = self._send("PUT", f"/v3/accounts/{self.account_id}/orders/{ticket}/cancel")
        return OrderResult(success=True, order_id=str(ticket)) if ok else _fail(self._reason(data))

    def modify_order(self, ticket: str, price: Optional[float] = None,
                     stop_loss: Optional[float] = None, take_profit: Optional[float] = None) -> OrderResult:
        o = next((o for o in self._pending() if str(o["id"]) == str(ticket)), None)
        if o is None:
            return _fail(f"Order {ticket} not found")
        canonical = self.canonical_of(o["instrument"])
        body: Dict[str, Any] = {"type": o["type"], "instrument": o["instrument"], "units": o["units"],
                                "price": self._price(canonical, price) if price else o["price"],
                                "timeInForce": o.get("timeInForce", "GTC"),
                                "positionFill": o.get("positionFill", "DEFAULT")}
        for key, new, old in (("stopLossOnFill", stop_loss, o.get("stopLossOnFill")),
                              ("takeProfitOnFill", take_profit, o.get("takeProfitOnFill"))):
            if new is None:
                if old:
                    body[key] = {"price": old["price"], "timeInForce": old.get("timeInForce", "GTC")}
            elif float(new):
                body[key] = {"price": self._price(canonical, new), "timeInForce": "GTC"}
        ok, data = self._send("PUT", f"/v3/accounts/{self.account_id}/orders/{ticket}", {"order": body})
        if ok:
            new_id = (data.get("orderCreateTransaction") or {}).get("id") or ticket
            return OrderResult(success=True, order_id=str(new_id))
        return _fail(self._reason(data))

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self._connected or not self.account_id:
            return None
        a = self._request("GET", f"/v3/accounts/{self.account_id}/summary").get("account", {})
        margin_rate = float(a.get("marginRate") or 0)
        nav, used = float(a.get("NAV") or 0), float(a.get("marginUsed") or 0)
        return AccountInfo(
            provider_type="oanda", account_id=self.account_id, login=self.account_id,
            label=self._label, broker="OANDA", company="OANDA",
            server=f"OANDA {self.environment}", name=a.get("alias") or self.account_id,
            currency=a.get("currency", "USD"), balance=float(a.get("balance") or 0), equity=nav,
            margin=used, free_margin=float(a.get("marginAvailable") or 0),
            margin_free=float(a.get("marginAvailable") or 0), profit=float(a.get("unrealizedPL") or 0),
            margin_level=round(nav / used * 100.0, 2) if used else 0.0,
            leverage=int(round(1 / margin_rate)) if margin_rate else 0, connected=True, simulated=False,
        )

    def get_trade_history(self, days: int = 7) -> List[ClosedTrade]:
        if not self._connected or not self.account_id:
            return []
        cutoff = time.time() - days * 86400
        trades = self._request("GET", f"/v3/accounts/{self.account_id}/trades",
                               params={"state": "CLOSED", "count": 500}).get("trades", [])
        out = []
        for t in trades:
            if not t.get("closeTime") or parse_iso(t["closeTime"]) < cutoff:
                continue
            canonical = self.canonical_of(t["instrument"])
            units = float(t.get("initialUnits", 0))
            out.append(ClosedTrade(
                ticket=str(t["id"]), ticker=canonical, direction="BUY" if units > 0 else "SELL",
                lots=round(abs(units) / self._contract(canonical), 4), open_price=float(t["price"]),
                close_price=float(t.get("averageClosePrice") or 0), profit=float(t.get("realizedPL") or 0),
                swap=float(t.get("financing") or 0), open_time=_iso(parse_iso(t["openTime"])),
                close_time=_iso(parse_iso(t["closeTime"])),
                comment=(t.get("clientExtensions") or {}).get("comment", ""),
            ))
        out.sort(key=lambda x: x.close_time, reverse=True)
        return out
