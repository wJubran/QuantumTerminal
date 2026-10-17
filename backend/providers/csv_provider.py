"""
================================================================================
Quantum Terminal — CSV files as a data source (offline analysis)
================================================================================
Charts and the whole analysis engine on bars you exported from anywhere:
MetaTrader 5 (File → Save as / "Export bars"), TradingView, NinjaTrader,
Dukascopy or a spreadsheet. No network.

    account config (providers.accounts.csv_default)
        folder   where the files are (default: <app-data folder>/csv)

File names: {TICKER}_{TIMEFRAME}.csv (XAUUSD_M15.csv, XAUUSD_D1.csv), or
{TICKER}.csv. A missing timeframe is built from the ticker's file with the
longest timeframe that divides it (H4 from H1, else from M15), and the ticker
must also be in the terminal's ticker list.

Columns are found by name, case-insensitively and with or without <…>:
    date / time / datetime / timestamp  (one column, or separate date and time)
    open, high, low, close
    volume / vol / tick_volume / tickvol  (optional)
The delimiter is detected (comma, semicolon or tab). Dates may be "2026-10-16
13:45", "2026.10.16 13:45:00", "2026-10-16T13:45:00Z", "16/10/2026 13:45" or
Unix seconds / milliseconds. Times are shown as they are in the file.

The "live" price is the last close, so this source suits analysis and
replays, not trading.
================================================================================
"""

from __future__ import annotations

import csv
import io
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from providers.feed_base import TF_SECONDS, FeedError, FeedProvider, Row, aggregate

log = logging.getLogger("qt.provider.csv")

_TIME_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
                 "%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
                 "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M",
                 "%Y%m%d %H%M%S", "%Y%m%d %H:%M:%S", "%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%d/%m/%Y",
                 "%d.%m.%Y", "%Y%m%d")
_NAMES = {
    "datetime": ("datetime", "timestamp", "date_time", "gmt time", "local time", "time (utc)"),
    "date": ("date", "day"),
    "time": ("time",),
    "open": ("open", "o"),
    "high": ("high", "h"),
    "low": ("low", "l"),
    "close": ("close", "c", "last", "price"),
    "volume": ("volume", "vol", "tick_volume", "tickvol", "tick volume", "real_volume", "v"),
}


def _clean(name: str) -> str:
    return name.strip().strip("<>").strip().lower()


def _parse_time(text: str) -> Optional[float]:
    s = text.strip()
    if not s:
        return None
    if re.fullmatch(r"\d{9,13}(\.\d+)?", s):
        v = float(s)
        return v / 1000.0 if v > 1e11 else v
    s2 = s.replace("Z", "").split("+")[0].strip()
    if "." in s2 and re.search(r":\d\d\.\d+$", s2):       # drop fractional seconds
        s2 = s2.rsplit(".", 1)[0]
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(s2, fmt).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
    return None


def parse_csv(text: str) -> List[Row]:
    """Bars from CSV text, oldest first, duplicates dropped (the last one wins)."""
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    header = next(reader, None)
    if header is None:
        return []
    cols = {_clean(h): i for i, h in enumerate(header)}
    has_header = any(_clean(h) in sum(_NAMES.values(), ()) for h in header)
    if not has_header:
        # No header: assume date[,time],open,high,low,close[,volume]
        first = header
        dt_cols = 2 if len(first) >= 6 and _parse_time(first[0]) is None and _parse_time(f"{first[0]} {first[1]}") else 1
        names = (["date", "time"] if dt_cols == 2 else ["datetime"]) + ["open", "high", "low", "close", "volume"]
        cols = {n: i for i, n in enumerate(names) if i < len(first)}
        rows_iter = [first] + list(reader)
    else:
        rows_iter = reader

    def col(key):
        for alias in _NAMES[key]:
            if alias in cols:
                return cols[alias]
        return None

    c_dt, c_d, c_t = col("datetime"), col("date"), col("time")
    if c_dt is None and c_d is None and c_t is not None:     # one "time" column (TradingView)
        c_dt, c_t = c_t, None
    c_o, c_h, c_l, c_c, c_v = col("open"), col("high"), col("low"), col("close"), col("volume")
    if None in (c_o, c_h, c_l, c_c) or (c_dt is None and c_d is None):
        raise FeedError("CSV file: need date/time, open, high, low and close columns")
    out: Dict[float, Row] = {}
    for r in rows_iter:
        try:
            if c_dt is not None:
                t = _parse_time(r[c_dt])
            else:
                t = _parse_time(f"{r[c_d]} {r[c_t]}" if c_t is not None else r[c_d])
            if t is None:
                continue
            o, h, l, c = (float(r[i].replace(",", ".") if r[i].count(",") == 1 and "." not in r[i] else r[i])
                          for i in (c_o, c_h, c_l, c_c))
            v = float(r[c_v]) if c_v is not None and c_v < len(r) and r[c_v].strip() else 0.0
        except (ValueError, IndexError):
            continue
        out[t] = (t, o, max(h, o, c), min(l, o, c), c, v)
    return [out[t] for t in sorted(out)]


_STEP_NAMES = {"M1": "M1", "M5": "M5", "M15": "M15", "M30": "M30", "H1": "H1", "H4": "H4",
               "D1": "D1", "W1": "W1", "1M": "M1", "5M": "M5", "15M": "M15", "30M": "M30",
               "1H": "H1", "4H": "H4", "1D": "D1", "D": "D1", "DAILY": "D1", "1W": "W1", "W": "W1"}


class CsvProvider(FeedProvider):
    TYPE = "csv"
    LABEL = "CSV files (offline)"
    NATIVE = {tf: tf for tf in TF_SECONDS}       # whatever the files hold; see _rows()
    DEFAULT_QUOTE_INTERVAL = 5.0

    def __init__(self, account_config: Dict):
        super().__init__(account_config)
        folder = self._cfg.get("folder")
        if folder:
            self.folder = Path(folder).expanduser()
        else:
            import app_paths
            self.folder = app_paths.app_data_dir() / "csv"
        self._files: Dict[Tuple[str, str], Path] = {}
        self._parsed: Dict[Path, Tuple[float, List[Row]]] = {}

    def _scan(self) -> None:
        found: Dict[Tuple[str, str], Path] = {}
        for p in sorted(self.folder.glob("*.csv")) + sorted(self.folder.glob("*.txt")):
            stem = p.stem.upper()
            m = re.match(r"^(.+?)[_\- ]([A-Z0-9]+)$", stem)
            if m and m.group(2) in _STEP_NAMES:
                found[(m.group(1), _STEP_NAMES[m.group(2)])] = p
            else:
                found.setdefault((stem, ""), p)
        self._files = found

    def tickers(self) -> List[str]:
        return sorted({t for t, _ in self._files})

    def guess_symbol(self, canonical: str):
        return canonical if any(t == canonical for t, _ in self._files) else None

    def _check_connection(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        self._scan()
        if not self._files:
            raise FeedError(f"no CSV files in {self.folder} — name them like XAUUSD_M15.csv")
        log.info(f"CSV source: {len(self._files)} files for {', '.join(self.tickers())} in {self.folder}")

    def _load(self, path: Path) -> List[Row]:
        mtime = path.stat().st_mtime
        hit = self._parsed.get(path)
        if hit and hit[0] == mtime:
            return hit[1]
        rows = parse_csv(path.read_text(encoding="utf-8-sig", errors="replace"))
        self._parsed[path] = (mtime, rows)
        return rows

    def _step_of(self, rows: List[Row]) -> int:
        gaps = sorted(b[0] - a[0] for a, b in zip(rows[-200:], rows[-199:]) if b[0] > a[0])
        return int(gaps[len(gaps) // 4]) if gaps else 86400

    def _source(self, ticker: str, timeframe: str) -> Optional[Tuple[str, Path]]:
        """The file for (ticker, timeframe): its own file, else the one
        with the longest timeframe that divides it."""
        self._scan()
        if (ticker, timeframe) in self._files:
            return timeframe, self._files[(ticker, timeframe)]
        want = TF_SECONDS[timeframe]
        options = []
        for (t, tf), p in self._files.items():
            if t != ticker:
                continue
            step = TF_SECONDS.get(tf) or self._step_of(self._load(p))
            if step <= want and want % step == 0:
                options.append((step, tf or "?", p))
        if not options:
            return None
        step, tf, p = max(options)
        return tf, p

    def _rows(self, canonical: str, timeframe: str, count: int) -> List[Row]:
        src = self._source(canonical, timeframe)
        if src is None:
            return []
        tf, path = src
        rows = self._load(path)
        if tf != timeframe:
            rows = aggregate(rows, timeframe, self.clock)
        return rows[-count:]

    def _fetch_quotes(self, pairs: List[Tuple[str, str]]) -> Dict[str, Tuple[float, float, float, float]]:
        out = {}
        for canonical, _ in pairs:
            options = [(TF_SECONDS.get(tf, 0), p) for (t, tf), p in self._files.items() if t == canonical]
            if not options:
                continue
            rows = self._load(min(options)[1])
            if rows:
                close = rows[-1][4]
                out[canonical] = (close, close, close, rows[-1][0])
        return out

    def _fetch_bars(self, symbol: str, timeframe: str, count: int) -> List[Row]:
        return self._rows(symbol, timeframe, count)

