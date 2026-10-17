# version: v1
"""
Daily economic series from FRED (Federal Reserve Bank of St. Louis), without
an API key, through the public CSV download:

    https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10YIE

Each series is kept in <cache>/fred/<ID>.csv and downloaded again at most
every REFRESH_SEC, so a day of passes costs a handful of requests. When FRED
can't be reached the last download is used, however old.
"""

from __future__ import annotations

import csv
import io
import logging
import os
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

log = logging.getLogger("qt.local_analysis.fred")

URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
REFRESH_SEC = 6 * 3600
RETRY_SEC = 1800            # after a failed download, wait this long before trying again

Series = List[Tuple[date, float]]

_failed_at: Dict[str, float] = {}     # series id → time of its last failed download


class FredError(Exception):
    pass


def parse(text: str) -> Series:
    """(day, value) rows of a fredgraph.csv download, oldest first. The
    header is "observation_date,<ID>" (older files: "DATE,<ID>"); missing
    values are "." or empty and are skipped."""
    rows = csv.reader(io.StringIO(text.lstrip("﻿")))
    header = next(rows, None)
    if not header or len(header) < 2 or header[0].strip().lower() not in ("observation_date", "date"):
        raise FredError("not a FRED series download")
    out: Series = []
    for row in rows:
        if len(row) < 2 or row[1].strip() in ("", "."):
            continue
        try:
            out.append((date.fromisoformat(row[0].strip()), float(row[1])))
        except ValueError:
            continue
    out.sort()
    return out


def _download(series_id: str, timeout: float) -> str:
    import httpx
    r = httpx.get(URL, params={"id": series_id}, timeout=timeout, follow_redirects=True,
                  headers={"User-Agent": "Mozilla/5.0 Quantum Terminal"})
    if r.status_code != 200:
        raise FredError(f"FRED answered {r.status_code} for {series_id}")
    return r.text


def series(series_id: str, cache_dir: Path, download: Optional[Callable[[str, float], str]] = None,
           timeout: float = 20.0, now: Optional[float] = None) -> Series:
    """The series, from the cache when fresh, else from FRED. Raises
    FredError only when there is neither a download nor a cached copy."""
    folder = Path(cache_dir) / "fred"
    path = folder / f"{series_id}.csv"
    now = time.time() if now is None else now
    cached = path.read_text(encoding="utf-8") if path.is_file() else None
    if cached is not None:
        fresh = now - path.stat().st_mtime < REFRESH_SEC
        if fresh or now - _failed_at.get(series_id, 0.0) < RETRY_SEC:
            try:
                return parse(cached)
            except FredError:
                cached = None
    if cached is None and now - _failed_at.get(series_id, 0.0) < RETRY_SEC:
        raise FredError(f"{series_id}: FRED was unreachable a moment ago")
    try:
        text = (download or _download)(series_id, timeout)
        rows = parse(text)
        if not rows:
            raise FredError(f"FRED returned no values for {series_id}")
    except Exception as e:
        _failed_at[series_id] = now
        if cached is not None:
            log.info(f"FRED {series_id}: {e}; using the copy from "
                     f"{time.strftime('%Y-%m-%d %H:%M', time.localtime(path.stat().st_mtime))}")
            return parse(cached)
        raise FredError(f"{series_id}: {e}") from e
    _failed_at.pop(series_id, None)
    folder.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=series_id + ".", suffix=".tmp", dir=str(folder))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except OSError:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return rows
