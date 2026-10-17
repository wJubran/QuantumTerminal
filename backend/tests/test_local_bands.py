"""Locally computed bands and the Replay page's files: shape the chart, the
Pulse Room and the Replay page read, no look-ahead, reuse of past anchors,
and the runner / routes end to end."""

import json
import math
import os
from datetime import datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient

from local_analysis import bands, cones, models, runner


def daily_bars(start, end, weekdays=range(5), sigma=0.01, seed=7, vol_from=None, vol_after=None):
    """Synthetic daily bars (open = previous close); the daily vol switches to
    `vol_after` from date `vol_from` on."""
    rng = np.random.default_rng(seed)
    out, price, d = [], 100.0, start
    while d <= end:
        if d.weekday() in weekdays:
            s = vol_after if (vol_from and d >= vol_from) else sigma
            close = price * math.exp(rng.normal(0.0, s))
            out.append({"time": d.strftime("%Y-%m-%dT00:00:00"), "open": price, "close": close})
            price = close
        d += timedelta(days=1)
    return out


@pytest.fixture(autouse=True)
def small_archives(monkeypatch):
    """Keep the Replay archives short so the suite stays fast."""
    monkeypatch.setattr(bands, "REPLAY_DAYS", 30)
    monkeypatch.setattr(cones, "HISTORY_DAYS", 70)
    runner._built.clear()


@pytest.fixture(scope="module")
def weekday_bars():
    return daily_bars(datetime(2025, 1, 6), datetime(2026, 10, 16))      # last bar Friday


def _live_keys():
    return [f"{p}_{k}sd_{s}" for p in ("gbm", "mjd", "bat") for k in (1, 2, 3) for s in ("high", "low")]


def test_live_bands_have_the_shape_the_chart_and_pulse_room_read(weekday_bars):
    b = bands.live("TEST", weekday_bars)
    n = len(b["timestamps"])
    assert n == min(bands.HISTORY_DAYS, len(weekday_bars) - models.MIN_RETURNS - 1) + bands.FORWARD_DAYS
    for k in ["mean"] + _live_keys():
        assert len(b[k]) == n and all(math.isfinite(v) for v in b[k]), k
    times = [datetime.strptime(t, "%Y-%m-%d %H:%M") for t in b["timestamps"]]
    assert times == sorted(times) and len(set(times)) == n
    hist, fwd = times[:-bands.FORWARD_DAYS], times[-bands.FORWARD_DAYS:]
    assert all(t.hour == 12 for t in hist)                    # half a trading day after each open
    assert hist[-1] == datetime(2026, 10, 16, 12, 0)
    assert fwd[0] == datetime(2026, 10, 19) and all(t.weekday() < 5 and t.hour == 0 for t in fwd)
    # lines are ordered around the shared centre at every point
    for p in ("gbm", "mjd", "bat"):
        rows = np.array([b[f"{p}_3sd_low"], b[f"{p}_2sd_low"], b[f"{p}_1sd_low"], b["mean"],
                         b[f"{p}_1sd_high"], b[f"{p}_2sd_high"], b[f"{p}_3sd_high"]])
        assert (np.diff(rows, axis=0) >= -1e-9).all(), p


def test_band_width_follows_the_horizon(weekday_bars):
    """GBM: the forecast for the next day (τ = 1) is √2 wider than the
    half-day history point of the same anchor (τ = 0.5)."""
    b = bands.live("TEST", weekday_bars)
    i = -bands.FORWARD_DAYS
    half = math.log(b["gbm_1sd_high"][i - 1] / b["mean"][i - 1])
    one = math.log(b["gbm_1sd_high"][i] / b["mean"][i])
    assert one / half == pytest.approx(math.sqrt(2), rel=1e-3)
    tail = math.log(b["gbm_1sd_high"][-1] / b["mean"][-1])
    assert tail / one == pytest.approx(math.sqrt(bands.FORWARD_DAYS), rel=1e-3)


def test_recent_volatility_sets_the_band_width():
    calm_then_wild = daily_bars(datetime(2024, 1, 1), datetime(2026, 6, 30), sigma=0.005,
                                vol_from=datetime(2026, 3, 1), vol_after=0.02)
    closes = np.array([b["close"] for b in calm_then_wild])
    long = models.estimate(closes)
    recent = bands.recent_params(closes)
    assert 0.016 < recent.sigma < 0.024                    # the last 60 days
    assert long.sigma < 0.015                              # ~250 days, mostly calm
    assert recent.v0 == pytest.approx(recent.sigma ** 2)
    assert recent.lam == long.lam and recent.theta == long.theta


def test_bands_use_no_data_from_after_each_open(weekday_bars):
    later = weekday_bars + daily_bars(datetime(2026, 10, 19), datetime(2026, 10, 30), seed=3)
    a, b = bands.live("TEST", weekday_bars), bands.live("TEST", later)
    end = len(a["timestamps"]) - bands.FORWARD_DAYS           # a's history points
    i0 = a["timestamps"].index(b["timestamps"][0])            # b's window starts later
    assert a["timestamps"][i0:end] == b["timestamps"][:end - i0]
    for k in ["mean"] + _live_keys():
        assert a[k][i0:end] == b[k][:end - i0], k


def test_replay_file_matches_the_live_history(weekday_bars):
    live = bands.live("TEST", weekday_bars)
    r = bands.replay("TEST", weekday_bars)
    assert r["meta"]["schema_version"] == "bands_replay_v2"
    assert len(r["daily"]) == bands.REPLAY_DAYS
    day, entry = sorted(r["daily"].items())[-1]
    assert day == "2026-10-16"
    for m in ("gbm", "mjd", "bates"):
        e = entry[m]
        assert len(e["dates"]) == bands.FORWARD_DAYS and e["dates"][0] == "2026-10-19 00:00"
        assert all(len(e[ch]) == bands.FORWARD_DAYS for ch in bands.CHANNELS)
        assert e["select"]["date"] == "2026-10-16 12:00"
    i = live["timestamps"].index("2026-10-16 12:00")
    for m, pre in (("gbm", "gbm"), ("mjd", "mjd")):          # deterministic models agree exactly
        sel = entry[m]["select"]
        assert (sel["sd1_high"], sel["sd3_low"]) == (live[f"{pre}_1sd_high"][i], live[f"{pre}_3sd_low"][i])
        assert entry[m]["sd2_high"] == live[f"{pre}_2sd_high"][-bands.FORWARD_DAYS:]


def test_replay_reuses_past_anchors(weekday_bars):
    first = bands.replay("TEST", weekday_bars)
    stale = json.loads(json.dumps(first))
    oldest = sorted(stale["daily"])[0]
    stale["daily"][oldest]["gbm"]["median"][0] = -1.0       # marker: kept only if reused
    again = bands.replay("TEST", weekday_bars, previous=stale)
    assert again["daily"][oldest]["gbm"]["median"][0] == -1.0
    newest = sorted(stale["daily"])[-1]
    stale["daily"][newest]["gbm"]["median"][0] = -1.0
    assert bands.replay("TEST", weekday_bars, previous=stale)["daily"][newest]["gbm"]["median"][0] != -1.0


def test_historical_cones_for_the_replay_page(weekday_bars):
    h = cones.history("TEST", weekday_bars)
    assert set(h) == {"weekly", "monthly"}
    weeks = sorted(h["weekly"])
    assert weeks[-1] == "2026-10-12" and all(datetime.strptime(w, "%Y-%m-%d").weekday() == 0 for w in weeks)
    live = cones.build("TEST", weekday_bars)["cones"]
    assert h["weekly"]["2026-10-12"]["gbm"]["sd2_high"] == live["gbm_curr"]["sd2_high"]
    assert h["monthly"]["2026-10-01"]["mjd"]["median"] == live["mjd_month_curr"]["median"]
    assert set(h["weekly"]["2026-10-05"]) == {"gbm", "mjd", "bates"}


def test_quarterly_cones_carry_eight_anchors(weekday_bars):
    res = cones.build("TEST", daily_bars(datetime(2023, 1, 2), datetime(2026, 10, 16)))
    labels = [a["label"] for a in res["quarterly_anchors"]]
    assert labels == ["quarter_curr"] + [f"quarter_prev{i}" for i in range(1, 8)]
    assert res["quarterly_anchors"][-1]["anchor_date"] == "2025-01-01"
    assert {"gbm_quarter_prev7", "mjd_quarter_prev7"} <= set(res["quarterly"])


class FakeProvider:
    provider_type = "fake"
    connected = True

    def __init__(self, bars):
        self.bars = bars

    def get_bars(self, ticker, timeframe, count):
        assert timeframe == "D1"
        return self.bars[-count:]


def test_runner_writes_every_file_once_per_daily_bar(tmp_path, weekday_bars):
    p = FakeProvider(weekday_bars)
    assert runner.update_ticker("abc", p, cache_dir=tmp_path) is True
    names = {f.name for f in tmp_path.iterdir()}
    assert names == {"ABC_cones.json", "ABC_quarterly_cones.json", "ABC_bands.json",
                     "ABC_historical_cones.json", "ABC_bands_replay.json"}
    for f in tmp_path.iterdir():
        data = json.loads(f.read_text())
        assert data["producer"] == runner.PRODUCER and data["ticker"] == "ABC", f.name
    b = json.loads((tmp_path / "ABC_bands.json").read_text())
    assert isinstance(b["_last_modified"], float) and "timestamps" in b
    q = json.loads((tmp_path / "ABC_quarterly_cones.json").read_text())
    assert q["meta"]["anchors"][0]["label"] == "quarter_curr"
    assert runner.update_ticker("ABC", p, cache_dir=tmp_path) is False


def test_runner_leaves_another_producers_bands_alone(tmp_path, weekday_bars):
    theirs = {"producer": "data-center", "timestamps": ["2026-10-16 10:00"], "mean": [1.0]}
    (tmp_path / "ABC_bands.json").write_text(json.dumps(theirs))
    assert runner.update_ticker("ABC", FakeProvider(weekday_bars), cache_dir=tmp_path) is True
    assert json.loads((tmp_path / "ABC_bands.json").read_text()) == theirs


def test_routes_serve_the_local_bands_and_replay_files():
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            runner._built.clear()
            assert runner.update_ticker("XAUUSD", data_server.app.state.provider, force=True)
            b = client.get("/api/bands/XAUUSD").json()
            assert len(b["gbm_1sd_high"]) == len(b["timestamps"]) and "bat_3sd_low" in b
            h = client.get("/api/historical_cones/XAUUSD").json()
            assert h["weekly"] and h["monthly"]
            r = client.get("/api/bands_replay/XAUUSD").json()
            assert r["meta"]["schema_version"] == "bands_replay_v2" and r["daily"]
            q = client.get("/api/quarterly_cones/XAUUSD").json()
            assert q["meta"]["anchors"]

            from pulse_room import builder
            from data_sync_client import _get_cache_dir
            snap = builder.build_snapshot({"assets": [{"symbol": "XAUUSD", "families": ["CO", "QB"]}]},
                                          cache_dir=_get_cache_dir(), write=False)
            origins = {e["origin"] for e in snap["assets"]["XAUUSD"]["elements"]}
            assert "bands" in origins and "current_week" in origins
    finally:
        os.environ.pop("MK_PROVIDER", None)


def test_jump_test_absorbs_a_lasting_volatility_rise():
    """An isolated outlier is a jump; a lasting rise in volatility is not,
    after its first few days."""
    rng = np.random.default_rng(5)
    r = np.concatenate([rng.normal(0, 0.005, 200), rng.normal(0, 0.02, 100)])
    r[100] = -0.06
    m = models.jump_mask(r)
    assert m[100]
    assert m[200:215].sum() >= 1          # the shock itself is a surprise …
    assert m[230:].sum() <= 2             # … but the new regime is not a string of jumps
