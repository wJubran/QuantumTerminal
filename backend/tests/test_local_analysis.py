"""Local analysis engine: model quantiles, cone anchors, the runner and the API."""

import json
import math
import os
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

from local_analysis import cones, models, runner


def params(**kw):
    base = dict(sigma=0.01, lam=0.0, mu_j=0.0, sigma_j=0.0, v0=1e-4, theta=1e-4,
                kappa=math.log(2) / 20, xi=0.0, rho=0.0, n_returns=250)
    base.update(kw)
    return models.Params(**base)


def daily_bars(start, end, weekdays=range(5), sigma=0.01, seed=7, jumps=()):
    """Synthetic daily bars on the given weekdays: a GBM close path, open = previous close."""
    rng = np.random.default_rng(seed)
    bars, price, d = [], 100.0, start
    while d <= end:
        if d.weekday() in weekdays:
            r = rng.normal(0.0, sigma) + (jumps[len(bars)] if len(bars) in jumps else 0.0)
            close = price * math.exp(r)
            bars.append({"time": d.strftime("%Y-%m-%dT00:00:00"), "open": price, "close": close})
            price = close
        d += timedelta(days=1)
    return bars


# ── models ────────────────────────────────────────────────────────────

def test_gbm_quantiles_are_closed_form():
    q = models.gbm_quantiles(params(sigma=0.01), [0.0, 4.0])
    assert np.allclose(q[0], 0.0)
    assert np.allclose(q[1], 0.01 * 2.0 * models.Z_LEVELS)


def test_mjd_without_jumps_is_gbm():
    p = params(sigma=0.012)
    assert np.allclose(models.mjd_quantiles(p, [1.0, 5.0]), models.gbm_quantiles(p, [1.0, 5.0]))


def test_mjd_quantiles_match_monte_carlo():
    p = params(sigma=0.008, lam=0.05, mu_j=-0.02, sigma_j=0.015)
    t = 5.0
    exact = models.mjd_quantiles(p, [t])[0]
    rng = np.random.default_rng(1)
    n = 400_000
    k = rng.poisson(p.lam * t, n)
    x = (rng.standard_normal(n) * p.sigma * math.sqrt(t) + k * p.mu_j
         + np.sqrt(k) * p.sigma_j * rng.standard_normal(n) - p.lam * t * p.mu_j)
    mc = np.quantile(x, models.PROBS)
    assert np.allclose(exact[1:-1], mc[1:-1], atol=5e-4)     # sd2 … sd2
    assert np.allclose(exact[[0, -1]], mc[[0, -1]], atol=3e-3)
    assert exact[0] + exact[-1] < 0                          # negative jumps skew the left tail


def test_bates_without_vol_of_vol_or_jumps_is_gbm():
    p = params(sigma=0.01, v0=1e-4, theta=1e-4, xi=0.0)
    tau = [0.0, 1.0, 5.0]
    mc = models.bates_quantiles(p, tau, seed=3)
    exact = models.gbm_quantiles(p, tau)
    assert np.allclose(mc[0], 0.0)
    assert np.allclose(mc[1:, 1:-1], exact[1:, 1:-1], rtol=0.04, atol=2e-4)


def test_bates_is_reproducible_and_follows_current_variance():
    calm = params(sigma=0.01, v0=0.25e-4, theta=1e-4, xi=0.002)
    a = models.bates_quantiles(calm, [5.0], seed=11)
    assert np.array_equal(a, models.bates_quantiles(calm, [5.0], seed=11))
    # variance starts below its mean → narrower than GBM at the long-run vol
    assert a[0][4] < models.gbm_quantiles(calm, [5.0])[0][4]


def test_estimate_recovers_volatility_and_jumps():
    bars = daily_bars(datetime(2024, 1, 1), datetime(2025, 6, 30), sigma=0.01,
                      jumps={300: -0.07, 320: -0.06, 340: -0.08, 360: -0.065})
    p = models.estimate([b["close"] for b in bars])
    assert p.n_returns == models.LOOKBACK
    assert 0.0085 < p.sigma < 0.0115
    assert p.lam > 0 and p.mu_j < -0.04


def test_too_little_history_gives_no_estimate():
    assert models.estimate([100.0 + i for i in range(30)]) is None
    assert cones.build("X", daily_bars(datetime(2026, 9, 1), datetime(2026, 10, 1))) is None


# ── cones ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def weekday_cones():
    """Mon–Fri instrument; last bar Friday 16 Oct 2026."""
    return cones.build("TEST", daily_bars(datetime(2024, 6, 3), datetime(2026, 10, 16)))


def test_anchors_follow_the_calendar(weekday_cones):
    c, q = weekday_cones["cones"], weekday_cones["quarterly"]
    assert weekday_cones["weekdays"] == [0, 1, 2, 3, 4]

    def anchor(key, source=c):
        return source[key]["anchor"]["time"], source[key]["horizon_days"]

    assert anchor("gbm_daily_curr") == ("2026-10-16 00:00", 1)
    assert anchor("gbm_daily_prev") == ("2026-10-15 00:00", 1)
    assert anchor("gbm_curr") == ("2026-10-12 00:00", 5)          # Monday of the last week
    assert anchor("gbm_prev") == ("2026-10-05 00:00", 5)
    assert anchor("gbm_month_curr") == ("2026-10-01 00:00", 22)   # weekdays 1–31 Oct 2026
    assert anchor("gbm_month_prev_2") == ("2026-08-03 00:00", 21)
    assert anchor("gbm_quarter_curr", q) == ("2026-10-01 00:00", 66)
    assert anchor("mjd_quarter_prev3", q) == ("2026-01-01 00:00", 64)
    assert c["gbm_curr"]["dates"][-1] == "2026-10-17 00:00"       # end of Friday
    # time only advances on trading days: no grid point inside a weekend
    inner = [datetime.strptime(d, "%Y-%m-%d %H:%M") for d in c["gbm_month_curr"]["dates"][:-1]]
    assert all(d.weekday() < 5 for d in inner)
    assert set(c) == {f"{m}_{s}" for m in ("gbm", "mjd", "bates")
                      for s in ("daily_curr", "daily_prev", "daily_prev_2", "curr", "prev",
                                "month_curr", "month_prev", "month_prev_2")}


def test_cone_lines_are_ordered_and_start_at_the_anchor(weekday_cones):
    for key, e in {**weekday_cones["cones"], **weekday_cones["quarterly"]}.items():
        rows = np.array([e[s] for s in cones.SERIES]).T
        assert len(e["dates"]) == len(rows) >= 2, key
        assert np.allclose(rows[0], e["anchor"]["price"], rtol=1e-6), key
        assert (np.diff(rows, axis=1) >= 0).all(), key


def test_seven_day_calendar():
    res = cones.build("SIM", daily_bars(datetime(2025, 1, 1), datetime(2026, 10, 17), weekdays=range(7)))
    assert res["weekdays"] == list(range(7))
    assert res["cones"]["gbm_curr"]["anchor"]["time"] == "2026-10-12 00:00"
    assert res["cones"]["gbm_curr"]["horizon_days"] == 7


def test_a_cone_only_uses_bars_before_its_anchor():
    bars = daily_bars(datetime(2025, 1, 6), datetime(2026, 10, 16))
    changed = [dict(b) for b in bars]
    for b in changed:
        if b["time"] >= "2026-10-13":                            # after the weekly anchor (Mon 12th)
            b["close"] *= 1.05
    a, b = cones.build("T", bars)["cones"], cones.build("T", changed)["cones"]
    for key in ("gbm_curr", "mjd_curr", "bates_curr", "gbm_month_curr"):
        assert a[key] == b[key], key
    assert a["gbm_daily_curr"]["params"] != b["gbm_daily_curr"]["params"]


# ── runner ────────────────────────────────────────────────────────────

class FakeProvider:
    provider_type = "fake"
    connected = True

    def __init__(self, bars):
        self.bars = bars

    def get_bars(self, ticker, timeframe, count):
        assert timeframe == "D1"
        return self.bars[-count:]


@pytest.fixture
def provider(monkeypatch):
    from local_analysis import bands
    monkeypatch.setattr(bands, "REPLAY_DAYS", 20)        # keep the Replay archives short
    monkeypatch.setattr(cones, "HISTORY_DAYS", 40)
    runner._built.clear()
    return FakeProvider(daily_bars(datetime(2025, 1, 6), datetime(2026, 10, 16)))


def test_runner_writes_once_per_daily_bar(tmp_path, provider):
    assert runner.update_ticker("abc", provider, cache_dir=tmp_path) is True
    data = json.loads((tmp_path / "ABC_cones.json").read_text())
    assert data["producer"] == runner.PRODUCER and data["ticker"] == "ABC"
    assert "gbm_curr" in data and "median" in data["gbm_curr"]       # flat layout (cone routes + Pulse Room)
    assert "gbm_quarter_curr" in json.loads((tmp_path / "ABC_quarterly_cones.json").read_text())

    assert runner.update_ticker("ABC", provider, cache_dir=tmp_path) is False   # same last bar
    runner._built.clear()
    assert runner.update_ticker("ABC", provider, cache_dir=tmp_path) is False   # up to date on disk
    provider.bars = provider.bars + daily_bars(datetime(2026, 10, 19), datetime(2026, 10, 19), seed=9)
    assert runner.update_ticker("ABC", provider, cache_dir=tmp_path) is True    # new daily bar


def test_runner_never_overwrites_another_producers_files(tmp_path, provider):
    theirs = {"producer": "data-center", "gbm_curr": {"median": [1, 2]}}
    (tmp_path / "XYZ_cones.json").write_text(json.dumps(theirs))
    assert runner.update_ticker("XYZ", provider, cache_dir=tmp_path) is True    # quarterly is free
    assert json.loads((tmp_path / "XYZ_cones.json").read_text()) == theirs
    assert json.loads((tmp_path / "XYZ_quarterly_cones.json").read_text())["producer"] == runner.PRODUCER


def test_switching_sources_drops_files_the_new_source_cannot_replace(tmp_path, provider):
    provider.provider_type, provider.provider_id = "yahoo", "yahoo_default"
    assert runner.update_ticker("ABC", provider, cache_dir=tmp_path, phases=("live",)) is True
    theirs = {"producer": "data-center", "gbm_curr": {"median": [1, 2]}}
    (tmp_path / "XYZ_cones.json").write_text(json.dumps(theirs))

    outage = FakeProvider([])                     # the same source, without bars for a while
    outage.provider_type, outage.provider_id = "yahoo", "yahoo_default"
    assert runner.update_ticker("ABC", outage, cache_dir=tmp_path, phases=("live",)) is False
    assert (tmp_path / "ABC_cones.json").exists()

    other = FakeProvider([])                      # another source, which doesn't carry ABC or XYZ
    other.provider_type, other.provider_id = "binance", "binance_default"
    assert runner.update_ticker("ABC", other, cache_dir=tmp_path, phases=("live",)) is False
    assert not list(tmp_path.glob("ABC_*.json"))
    runner.update_ticker("XYZ", other, cache_dir=tmp_path, phases=("live",))
    assert json.loads((tmp_path / "XYZ_cones.json").read_text()) == theirs     # not ours: kept


def test_a_source_switch_starts_a_pass_at_once(monkeypatch):
    import asyncio
    phases = []

    async def fake_pass(app_state, phase, broadcast_event):
        phases.append(phase)
        return []

    async def fake_macro(broadcast_event):
        phases.append("macro")
        return False

    async def fake_fundamental(app_state, broadcast_event):
        phases.append("fundamental")
        return False

    monkeypatch.setattr(runner, "_pass", fake_pass)
    monkeypatch.setattr(runner, "_macro_pass", fake_macro)
    monkeypatch.setattr(runner, "_fundamental_pass", fake_fundamental)
    monkeypatch.setattr(runner, "START_DELAY_SEC", 0)
    one_pass = ["live", "regime", "macro", "fundamental", "replay"]

    async def main():
        task = asyncio.create_task(runner.run_loop(object(), interval=3600))
        for _ in range(500):
            if len(phases) == len(one_pass):
                break
            await asyncio.sleep(0.01)
        runner.request_pass()                     # Settings → DATA SOURCES → USE
        for _ in range(500):
            if len(phases) == 2 * len(one_pass):
                break
            await asyncio.sleep(0.01)
        task.cancel()
        return list(phases)

    assert asyncio.run(main()) == one_pass * 2


def test_runner_can_be_turned_off(monkeypatch):
    monkeypatch.setenv("MK_LOCAL_ANALYSIS", "0")
    assert runner.create_local_analysis_task(object()) is None
    monkeypatch.setenv("MK_LOCAL_ANALYSIS", "1")
    assert callable(runner.create_local_analysis_task(object()))


# ── through the API, on the simulated market ──────────────────────────

def test_the_chart_routes_serve_local_cones():
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            runner._built.clear()
            assert runner.update_ticker("XAUUSD", data_server.app.state.provider, force=True,
                                        phases=("live",))
            c = client.get("/api/cones/XAUUSD").json()
            assert {"gbm_curr", "mjd_month_curr", "bates_daily_curr"} <= set(c)
            assert len(c["gbm_curr"]["median"]) == len(c["gbm_curr"]["dates"])
            assert "gbm_quarter_curr" in client.get("/api/quarterly_cones/XAUUSD").json()
            status = client.get("/api/sync/status").json()
            assert status["staleness_level"] == "fresh"
            assert status["analysis_date"] == datetime.now(timezone.utc).strftime("%Y-%m-%d")
    finally:
        os.environ.pop("MK_PROVIDER", None)
