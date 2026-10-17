"""
================================================================================
Quantum Terminal — Thread-safe MetaTrader5 access
================================================================================
The MetaTrader5 Python package talks to the terminal over a single IPC
channel and is not safe to call from several threads at once. The server
calls it concurrently from many places: tick_loop, focus_tick_loop and
bar_check_loop each run provider calls in asyncio.to_thread() workers, the
account manager syncs in another worker, and some routes call it on the
event-loop thread. Interleaved calls can return another call's data, fail
spuriously or wedge the terminal bridge.

`mt5` below is a drop-in proxy for the MetaTrader5 module: every function
call is serialized through one process-wide re-entrant lock, while constants
(TIMEFRAME_*, ORDER_TYPE_*, ...) pass straight through.

    from mt5_safe import mt5, MT5_AVAILABLE   # module-level use
    mt5 = require_mt5()                       # function-local use (raises ImportError)

Hold MT5_LOCK yourself to make a multi-call sequence atomic — the lock is
re-entrant, so the proxied calls inside the block don't deadlock.
================================================================================
"""

import functools
import threading
from typing import Any, Dict

MT5_LOCK = threading.RLock()


class LockedModule:
    """Proxy that runs every callable attribute of `module` under `lock`."""

    def __init__(self, module: Any, lock=MT5_LOCK):
        object.__setattr__(self, "_module", module)
        object.__setattr__(self, "_lock", lock)
        object.__setattr__(self, "_wrapped", {})

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._module, name)
        if not callable(attr) or isinstance(attr, type):
            return attr  # constants, namedtuple types, submodules
        cache: Dict[str, Any] = self._wrapped
        wrapped = cache.get(name)
        if wrapped is None or wrapped.__wrapped__ is not attr:
            lock = self._lock

            @functools.wraps(attr)
            def wrapped(*args, **kwargs):
                with lock:
                    return attr(*args, **kwargs)

            cache[name] = wrapped
        return wrapped

    def __setattr__(self, name: str, value: Any) -> None:
        setattr(self._module, name, value)

    def __dir__(self):
        return dir(self._module)

    def __repr__(self) -> str:
        return f"<thread-safe proxy for {self._module!r}>"


try:
    import MetaTrader5 as _raw_mt5
except ImportError:  # not installed (the package only ships for Windows)
    _raw_mt5 = None

MT5_AVAILABLE = _raw_mt5 is not None
mt5 = LockedModule(_raw_mt5) if MT5_AVAILABLE else None


def require_mt5() -> LockedModule:
    """The locked proxy — a drop-in replacement for a function-local
    `import MetaTrader5 as mt5`. Like that import, raises ModuleNotFoundError
    (an ImportError) when the package isn't installed."""
    if mt5 is None:
        raise ModuleNotFoundError("No module named 'MetaTrader5'", name="MetaTrader5")
    return mt5
