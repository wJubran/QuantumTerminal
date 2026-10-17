# version: v5
# v5 — cache dir comes from app_paths.cache_dir(), the folder the sync client
#      and the regime/cone routes read. Previously defaulted to
#      "QuantumTerminal-v2" (and ~/.config off Windows), so outside Electron
#      on Windows it never found the cones/bands files.
"""Pulse snapshot builder.

Reads cached cones/bands JSONs, extracts SD edges as forward curves,
and writes pulse_snapshot.json to AppData. Atomic write — partial
runs never corrupt the live snapshot.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import app_paths

from . import state


log = logging.getLogger("mk.pulse_room.builder")


# ---------- path resolvers ----------

def _default_cache_dir() -> Path:
    return app_paths.cache_dir()


def cones_path(ticker: str, cache_dir: Optional[Path] = None) -> Path:
    cd = cache_dir or _default_cache_dir()
    return cd / f"{ticker.upper()}_cones.json"


def bands_path(ticker: str, cache_dir: Optional[Path] = None) -> Path:
    cd = cache_dir or _default_cache_dir()
    return cd / f"GLOBAL_{ticker.lower()}_bands.json"


# ---------- safe JSON loader ----------

def load_json(path: Path) -> Optional[dict]:
    """Load JSON; return None on missing or malformed."""
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        log.warning("load_json failed for %s: %s", path, e)
        return None


# ---------- cone extraction ----------

def _parse_iso(s: str) -> datetime:
    """Parse a cone-format date like '2026-04-27 00:00' as UTC."""
    # Cones use 'YYYY-MM-DD HH:MM' (no seconds, no TZ)
    if "T" in s:
        s_normalized = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s_normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            pass
    return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


def _date_offsets_minutes(dates: list, base: Optional[datetime] = None) -> list:
    """Convert a list of date strings to minutes-from-base.

    If `base` is None, uses dates[0] (legacy behavior, kept so existing tests
    that don't pass a `now` continue to work). When the production code path
    in `build_snapshot` calls this, it always passes `base=now` so that t_min
    is minutes-from-computed_at (per spec §3.1) — past timestamps get t_min<0.
    """
    parsed = [_parse_iso(d) for d in dates]
    base_dt = base if base is not None else parsed[0]
    return [int((d - base_dt).total_seconds() // 60) for d in parsed]


def _index_at_offset_minutes(dates: list, target_minutes: int, base: Optional[datetime] = None) -> int:
    """Return the smallest index whose offset (relative to `base`, default dates[0])
    is at or after `target_minutes`."""
    offsets = _date_offsets_minutes(dates, base=base)
    for i, m in enumerate(offsets):
        if m >= target_minutes:
            return i
    return len(offsets) - 1


# ---------- cone origins ----------
# 8 origin variants — each is a separate cone scope inside the same
# <TICKER>_cones.json file. All use the gbm model.
# Format: (json_key, origin_id, display_label)
# Aligned with the producer's canonical schema:
#   gbm_now           — live, anchored at last D1 close / current px (uncached)
#   gbm_curr          — Monday open of current trading week (cached)
#   gbm_prev          — Monday open of last week (cached)
#   gbm_week_prev_2   — 2 weeks back (conditionally cached)
#   gbm_month_curr    — first trading day of current month (cached)
#   gbm_month_prev    — first trading day of last month (cached)
#   gbm_month_prev_2  — first trading day of month -2 (cached)
#   gbm_extreme_high  — bar of highest high in last 45 days (cached)
#   gbm_extreme_low   — bar of lowest low in last 45 days (cached)
CONE_ORIGINS = [
    ("gbm_now",            "now",            "now"),
    ("gbm_curr",           "current_week",   "current week"),
    ("gbm_prev",           "prev_week",      "previous week"),
    ("gbm_week_prev_2",    "week_prev_2",    "week -2"),
    ("gbm_month_curr",     "current_month",  "current month"),
    ("gbm_month_prev",     "prev_month",     "previous month"),
    ("gbm_month_prev_2",   "prev_month_2",   "month -2"),
    ("gbm_extreme_high",   "extreme_high",   "extreme high"),
    ("gbm_extreme_low",    "extreme_low",    "extreme low"),
]

# Priority order for sourcing the canonical 1-day volatility yardstick when
# multiple origins are available. gbm_curr is the historical canonical key;
# fall back to gbm_now (this-week scope), then gbm_month_curr.
_CONE_1D_SD_PRIORITY = ("gbm_curr", "gbm_now", "gbm_month_curr")


def _compute_cone_1d_sd(
    cones_json: dict,
    now: Optional[datetime] = None,
) -> Optional[float]:
    """Compute cone_1d_sd from the highest-priority origin variant present.

    Returns None if no priority variant is available or extraction fails.
    """
    for key in _CONE_1D_SD_PRIORITY:
        v = cones_json.get(key)
        if not v:
            continue
        try:
            dates = v["dates"]
            idx_1d = _index_at_offset_minutes(dates, 1440, base=now)
            up_width = v["sd1_high"][idx_1d] - v["median"][idx_1d]
            dn_width = v["median"][idx_1d] - v["sd1_low"][idx_1d]
            return float((up_width + dn_width) / 2.0)
        except (KeyError, IndexError, TypeError, ValueError):
            continue
    return None


def extract_cone_elements(
    cones_json: dict,
    now: Optional[datetime] = None,
) -> tuple[list, float]:
    """Return (elements_list, cone_1d_sd).

    Iterates CONE_ORIGINS and emits 7 series per present origin variant:
    median, sd1_upper/lower, sd2_upper/lower, sd3_upper/lower. Each
    element carries an `origin` field (e.g. "now", "current_week").
    Missing variant keys are silently skipped — some assets may have
    fewer variants in their cones JSON.

    cone_1d_sd is sourced from the highest-priority variant present
    (gbm_curr → gbm_now → gbm_month_curr).

    If `now` is provided, t_min values are re-based so t_min=0 corresponds
    to `now`; past timestamps get t_min<0, future get t_min>0. If `now` is
    None, falls back to legacy behavior (t_min=0 at dates[0]) so existing
    test fixtures keep working.
    """
    elements = []
    for json_key, origin_id, display_label in CONE_ORIGINS:
        v = cones_json.get(json_key)
        if not v:
            continue
        try:
            dates = v["dates"]
        except (KeyError, TypeError):
            continue
        offsets = _date_offsets_minutes(dates, base=now)

        # Median series → "<label> mean"
        try:
            median_series = v["median"]
        except (KeyError, TypeError):
            median_series = None
        if median_series is not None:
            elements.append({
                "id": f"co_{origin_id}_median",
                "family": "CO",
                "origin": origin_id,
                "label": f"{display_label} mean",
                "model": "gbm",
                "curve": [
                    {"t_min": int(t), "price": float(p)}
                    for t, p in zip(offsets, median_series)
                ],
            })

        # SD edges
        for sd in (1, 2, 3):
            for side, key_suffix in (("upper", "high"), ("lower", "low")):
                series_key = f"sd{sd}_{key_suffix}"
                if series_key not in v:
                    continue
                series = v[series_key]
                elements.append({
                    "id": f"co_{origin_id}_sd{sd}_{side}",
                    "family": "CO",
                    "origin": origin_id,
                    "label": f"{display_label} SD{sd} {side}",
                    "model": "gbm",
                    "curve": [
                        {"t_min": int(t), "price": float(p)}
                        for t, p in zip(offsets, series)
                    ],
                })

    cone_1d_sd = _compute_cone_1d_sd(cones_json, now=now)
    if cone_1d_sd is None:
        # Preserve legacy behavior: raise so callers can decide whether
        # to skip the asset entirely.
        raise ValueError(
            "cones JSON has no usable origin variant for cone_1d_sd "
            "(checked gbm_curr, gbm_now, gbm_month_curr)"
        )

    return elements, cone_1d_sd


# ---------- band extraction ----------

def extract_band_elements(
    bands_json: dict,
    now: Optional[datetime] = None,
) -> list:
    """Seven band elements: gbm sd1/2/3 × upper/lower + median.

    Every band element carries `origin: "bands"` so the schema is uniform
    with cone elements. (The radar UI colors by `origin`, not by family.)

    If `now` is provided, t_min values are re-based so t_min=0 corresponds
    to `now` (per spec §3.1: t_min is minutes from computed_at). Past
    timestamps get t_min<0, future get t_min>0. If `now` is None, falls
    back to legacy timestamps[0]-based offsets so existing fixtures work.
    """
    timestamps = bands_json["timestamps"]
    offsets = _date_offsets_minutes(timestamps, base=now)
    elements = []

    # Median (mean) series
    if "mean" in bands_json:
        mean_series = bands_json["mean"]
        elements.append({
            "id": "qb_median",
            "family": "QB",
            "origin": "bands",
            "label": "Bands mean",
            "model": "gbm",
            "curve": [
                {"t_min": int(t), "price": float(p)}
                for t, p in zip(offsets, mean_series)
            ],
        })

    # SD edges
    for sd in (1, 2, 3):
        for side, key_suffix in (("upper", "high"), ("lower", "low")):
            series = bands_json[f"gbm_{sd}sd_{key_suffix}"]
            elements.append({
                "id": f"qb_sd{sd}_{side}",
                "family": "QB",
                "origin": "bands",
                "label": f"Bands SD{sd} {side}",
                "model": "gbm",
                "curve": [
                    {"t_min": int(t), "price": float(p)}
                    for t, p in zip(offsets, series)
                ],
            })
    return elements


# ---------- pip size lookup ----------

# Phase 1 minimal pip table. Replace with a v2 metadata lookup once the
# implementer locates the existing per-symbol pip source. Defaulting to
# 0.01 covers most CFDs reasonably; FX overrides handle the major pairs.
_PIP_DEFAULTS = {
    "EURUSD": 0.0001, "GBPUSD": 0.0001, "AUDUSD": 0.0001, "NZDUSD": 0.0001,
    "USDCAD": 0.0001, "USDCHF": 0.0001, "USDJPY": 0.01,
    "EURJPY": 0.01, "GBPJPY": 0.01,
    "XAUUSD": 0.01, "XAGUSD": 0.001,
    "XTIUSD": 0.01, "BRENT": 0.01,
    "US500": 0.01, "USTEC": 0.01, "US30": 1.0,
    "UK100": 0.1, "GER40": 0.1,
    "BTCUSD": 1.0, "ETHUSD": 0.1, "SOLUSD": 0.01, "XRPUSD": 0.0001,
    "DXY": 0.001,
}


def _pip_size(symbol: str) -> float:
    return _PIP_DEFAULTS.get(symbol.upper(), 0.01)


# ---------- top-level snapshot build ----------

def build_snapshot(
    watchlist: dict,
    cache_dir: Optional[Path] = None,
    write: bool = True,
) -> dict:
    """Build the snapshot dict; optionally persist to AppData.

    Returns the snapshot dict regardless. If `write=True`, writes
    pulse_snapshot.json to the app-data dir (app_paths) atomically.

    Missing or malformed source files for an asset cause that asset
    to be skipped (with a logged warning). Other assets still build.
    """
    cd = cache_dir or _default_cache_dir()
    # Capture the wall-clock "now" once. Used both as snapshot["computed_at"]
    # and as the time-origin for re-basing curve t_min values (spec §3.1:
    # t_min is minutes from computed_at).
    now = datetime.now(timezone.utc)
    snapshot = {
        "version": "1.0",
        "computed_at": now.isoformat(),
        "threshold_sd": 0.5,
        "assets": {},
    }

    earliest_source_ts = None

    for asset_cfg in watchlist.get("assets", []):
        ticker = asset_cfg["symbol"]
        families = asset_cfg.get("families", [])
        if not families:
            continue

        elements = []
        cone_1d_sd = None

        if "CO" in families:
            cones_file = cones_path(ticker, cache_dir=cd)
            cones = load_json(cones_file)
            if cones is None:
                log.warning("skipping %s: cones JSON missing/malformed", ticker)
                continue
            try:
                cone_elements, cone_1d_sd = extract_cone_elements(cones, now=now)
                elements.extend(cone_elements)
            except (KeyError, ValueError) as e:
                log.warning("skipping %s: cones extraction error: %s", ticker, e)
                continue
            # Use the cache file's mtime as the "freshness" timestamp for this
            # source. The cones JSON itself has no `computed_at` field, so the
            # previous fallback to `cones["ticker"]` produced a ticker name
            # (e.g. "XAUUSD") which broke staleness detection downstream.
            try:
                ts = datetime.fromtimestamp(
                    cones_file.stat().st_mtime, tz=timezone.utc
                ).isoformat()
                earliest_source_ts = _min_iso(earliest_source_ts, ts)
            except OSError:
                pass

        if "QB" in families:
            bands_file = bands_path(ticker, cache_dir=cd)
            bands = load_json(bands_file)
            if bands is None:
                log.warning("skipping %s bands: bands JSON missing/malformed", ticker)
                # If cones succeeded, we still include the asset with cones-only.
                # If cones were never requested, this asset is empty — skip it.
                if not elements:
                    continue
            else:
                try:
                    band_elements = extract_band_elements(bands, now=now)
                    elements.extend(band_elements)
                except (KeyError, ValueError) as e:
                    log.warning("skipping %s bands: extraction error: %s", ticker, e)
                # Track bands file mtime for staleness too.
                try:
                    ts = datetime.fromtimestamp(
                        bands_file.stat().st_mtime, tz=timezone.utc
                    ).isoformat()
                    earliest_source_ts = _min_iso(earliest_source_ts, ts)
                except OSError:
                    pass

        if not elements:
            continue

        # If only QB was selected, derive cone_1d_sd from the cones JSON anyway
        # (we always need a volatility yardstick). This is a conservative
        # fallback — load cones silently to compute the SD even when not in families.
        if cone_1d_sd is None:
            cones_for_sd = load_json(cones_path(ticker, cache_dir=cd))
            if cones_for_sd is not None:
                try:
                    _, cone_1d_sd = extract_cone_elements(cones_for_sd, now=now)
                except (KeyError, ValueError):
                    pass

        if cone_1d_sd is None or cone_1d_sd <= 0:
            log.warning("skipping %s: cone_1d_sd unavailable or invalid", ticker)
            continue

        snapshot["assets"][ticker] = {
            "pip_size": _pip_size(ticker),
            "cone_1d_sd": cone_1d_sd,
            "selected_families": list(families),
            "elements": elements,
        }

    snapshot["source_sync_at"] = earliest_source_ts or snapshot["computed_at"]
    snapshot["watchlist_hash"] = state.watchlist_hash(watchlist)

    if write:
        snap_path = state._pulse_dir() / "pulse_snapshot.json"
        state._atomic_write(snap_path, snapshot)
        log.info("pulse snapshot written: %d assets", len(snapshot["assets"]))

    return snapshot


def _parse_iso_loose(s: str) -> datetime:
    """Parse various ISO-ish strings to a tz-aware UTC datetime.

    Handles trailing 'Z', timezone-aware ISO, and the cone "YYYY-MM-DD HH:MM"
    format. Naive inputs are treated as UTC.
    """
    s_clean = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s_clean)
    except ValueError:
        # Fallback for the cone "YYYY-MM-DD HH:MM" format
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _min_iso(a: Optional[str], b: Optional[str]) -> Optional[str]:
    """Return whichever ISO timestamp string is earlier in real time.

    Parses to datetime before comparing (lexicographic comparison was wrong
    when the two strings used different format conventions, e.g.
    'YYYY-MM-DD HH:MM' vs 'YYYY-MM-DDTHH:MM:SS+00:00').
    """
    if a is None:
        return b
    if b is None:
        return a
    try:
        da = _parse_iso_loose(a)
        db = _parse_iso_loose(b)
    except (ValueError, TypeError):
        # If we can't parse either, fall back to lexicographic compare so we
        # at least return something deterministic rather than crashing.
        return a if a < b else b
    return a if da <= db else b
