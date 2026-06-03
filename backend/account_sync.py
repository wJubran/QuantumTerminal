"""Background loop that keeps the AccountManager's equity/balance in sync with
the active hosted provider (e.g. TickerAll).

The built-in AccountManager.sync_from_mt5() is hardcoded to the local
MetaTrader5 Python package, so off a real terminal (or on Linux) it is a no-op
and the dashboard shows the placeholder $100k default. This loop fills that gap
by polling the active provider's get_account_info() instead.

Additive / opt-in: it only does anything when an override provider is active and
connected (the caller in data_server only starts it then); the MT5 path is
unaffected and keeps using sync_from_mt5().
"""
import asyncio
import logging

log = logging.getLogger("mk.account_sync")


async def account_sync_loop(app_state, interval: float = 5.0):
    """Periodically push the active provider's account snapshot into the
    AccountManager so /api/account/status reflects the real account."""
    from account_manager import get_account_manager

    mgr = get_account_manager()
    first = True
    while True:
        try:
            provider = getattr(app_state, "provider", None)
            if provider is not None and getattr(provider, "connected", False):
                ok = await asyncio.to_thread(mgr.sync_from_provider, provider)
                if ok and first:
                    log.info("Initial provider account sync complete")
                    first = False
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning(f"account_sync_loop error: {e}")
        await asyncio.sleep(interval)
