# TickerAll provider (optional) — hosted MT5 data + execution

This is an **opt-in** alternative to the local MetaTrader 5 terminal. It talks
to the hosted [TickerAll](https://tickerall.com) API over REST + WebSocket, so
the backend can run on Linux/macOS/containers with **no MT5 terminal**, and the
tick feed is **pushed over a WebSocket** instead of polled per symbol.

It implements the same `BaseProvider` contract as `MT5Provider` and returns the
same model field shapes, so nothing downstream changes. **The MT5 provider is
left fully intact** — this just adds a sibling you can switch on.

## Why you might want it

`MT5Provider.get_latest_ticks()` does one blocking IPC call **per symbol**
(~5 ms each), which (per `data_server.py` v9 notes) walls the tick loop around
5–7 fps at a 20-symbol universe and is why the separate "focus loop" exists. The
MT5 IPC channel is also single-threaded / not thread-safe.

This provider keeps a WebSocket open on a background thread and caches pushed
ticks in memory, so `get_latest_ticks()` becomes an **O(1) dict read** with no
network call and no shared MT5 handle — the per-symbol polling wall and the
thread-safety hazard both go away.

## Enable it (env var)

Set `TICKERALL_API_KEY` and the broker login you want connected. When the key is
present, the backend additively registers a `tickerall` provider and makes it the
active data + execution source for this run. Unset it and you're back on MT5 —
nothing else changes.

```bash
export TICKERALL_API_KEY="cf_live_..."     # the opt-in switch
export TICKERALL_BROKER="mt5"              # default
export TICKERALL_SERVER="Exness-MT5Trial7"
export TICKERALL_ACCOUNT="12345678"       # your numeric broker login
export TICKERALL_PASSWORD="..."
# optional:
# export TICKERALL_LABEL="TickerAll (hosted MT5)"
# export TICKERALL_BASE_URL="https://api.tickerall.com"
# export TICKERALL_STREAM_URL="wss://api.tickerall.com/v1/stream"
# export TICKERALL_ACCOUNT_ID="..."        # reuse an already-connected account id
```

Then start the backend as usual. Install the client first:

```bash
pip install tickerall
```

(The provider registry imports `tickerall` gracefully — if the package isn't
installed the provider simply isn't registered, and MT5 behaves as before.)

## Enable it (config instead of env)

You can also add it to your providers config like any other account and point
`active_data` / `active_execution` at it:

```json
{
  "providers": {
    "active_data": "tickerall_default",
    "active_execution": "tickerall_default",
    "accounts": {
      "tickerall_default": {
        "id": "tickerall_default",
        "type": "tickerall",
        "label": "TickerAll (hosted MT5)",
        "enabled": true,
        "api_key": "cf_live_...",
        "broker": "mt5",
        "server": "Exness-MT5Trial7",
        "account": "12345678",
        "password": "..."
      }
    }
  }
}
```

## What's supported

| Capability | Status |
|---|---|
| Live ticks (WS push → cache) | ✅ |
| Bars / `get_bars` / `get_bars_range` | ✅ |
| New-bar detection (`check_new_bars`) | ✅ |
| Account snapshot | ✅ (equity = balance + floating P/L; margin not exposed → `margin_free` mirrors equity) |
| Open positions | ✅ |
| Symbol specs (`get_symbol_info`) | ✅ (min/max/step lot, trade mode) |
| Market / limit / stop order placement | ✅ |
| Close / partial-close, modify SL-TP | ✅ |
| Pending-order **listing** / cancel / modify | ✅ |

## Tests

```bash
pip install tickerall websockets
python -m pytest backend/providers/test_tickerall_provider.py
```

The test runs the provider against an in-process mock TickerAll API (real HTTP +
WebSocket servers), so it needs no live account or network access.
