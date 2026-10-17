"""Regimes: the FRED client, the per-asset and macro HMM regimes, no look-ahead."""

import time

import numpy as np
import pytest

from local_analysis import fred, hmm, regimes


# ── FRED ──────────────────────────────────────────────────────────────

FRED_CSV = "observation_date,T10YIE\n2026-10-13,2.31\n2026-10-14,.\n2026-10-15,2.35\n2026-10-16,\n"


def test_fred_csv_parsing():
    assert fred.parse(FRED_CSV) == [(fred.date(2026, 10, 13), 2.31), (fred.date(2026, 10, 15), 2.35)]
    assert fred.parse("DATE,DGS10\n2026-10-16,4.1\n") == [(fred.date(2026, 10, 16), 4.1)]   # older header
    with pytest.raises(fred.FredError):
        fred.parse("<html>blocked</html>")


def test_fred_series_are_cached_and_survive_outages(tmp_path, monkeypatch):
    monkeypatch.setattr(fred, "_failed_at", {})
    calls = []

    def download(series_id, timeout):
        calls.append(series_id)
        return FRED_CSV

    rows = fred.series("T10YIE", tmp_path, download=download)
    assert len(rows) == 2 and (tmp_path / "fred" / "T10YIE.csv").is_file()
    fred.series("T10YIE", tmp_path, download=download)
    assert calls == ["T10YIE"]                                  # fresh copy: no second request

    def offline(series_id, timeout):
        raise OSError("network unreachable")

    later = time.time() + fred.REFRESH_SEC + 60
    assert fred.series("T10YIE", tmp_path, download=offline, now=later) == rows   # stale copy is used
    with pytest.raises(fred.FredError):
        fred.series("DGS10", tmp_path, download=offline)          # never downloaded: an error
    with pytest.raises(fred.FredError):                          # and no new attempt right away
        fred.series("DGS10", tmp_path, download=download)
    assert calls == ["T10YIE"]


# ── per-asset regimes ─────────────────────────────────────────────────

def switching_closes(n=1500, seed=5, vols=(0.5, 1.0, 2.5)):
    """Daily closes whose volatility switches between sticky regimes."""
    rng = np.random.default_rng(seed)
    p = np.array([[0.985, 0.012, 0.003], [0.01, 0.98, 0.01], [0.005, 0.03, 0.965]])
    state, s = np.zeros(n, int), 0
    for t in range(n):
        state[t] = s
        s = rng.choice(3, p=p[s])
    r = rng.normal(0.0, np.array(vols)[state] / 100.0)
    return 100.0 * np.exp(np.concatenate([[0.0], np.cumsum(r)])), state


def test_slow_regimes_find_the_stressed_periods():
    closes, state = switching_closes()
    x = regimes.slow_features(closes)
    truth = state[regimes.RV_DAYS - 1:]
    best, scores = regimes.select_states(x[-1000:])
    assert best is not None and set(scores) == {2, 3, 4}
    assert np.all(np.diff(best.means[:, 0]) > 0)                  # ordered calm → stressed
    wf = regimes.walk_forward(x, best.n_states)
    labelled = np.isfinite(wf.probs[:, 0])
    assert not labelled[:regimes.TRAIN_MIN].any() and labelled[regimes.TRAIN_MIN:].all()
    assert np.allclose(wf.probs[labelled].sum(axis=1), 1.0)
    top = np.argmax(wf.probs[labelled], axis=1) == best.n_states - 1
    # most days labelled "stressed" really were, and most stressed days are found
    assert (truth[labelled][top] == 2).mean() > 0.8
    assert top[truth[labelled] == 2].mean() > 0.7


def test_walk_forward_never_looks_ahead():
    closes, _ = switching_closes(n=900)
    x = regimes.slow_features(closes)
    full = regimes.walk_forward(x, 3)
    cut = 700
    part = regimes.walk_forward(x[:cut], 3)
    # Labels up to the cut are identical whether or not the later days exist.
    assert np.allclose(full.probs[:cut], part.probs, equal_nan=True)


def test_volatility_forecast_ratio():
    calm_burst = hmm.HMM(np.array([0.5, 0.5]), np.array([[0.99, 0.01], [0.20, 0.80]]),
                         np.zeros((2, 1)), np.array([[1.0], [9.0]]), 0.0)
    long_run = float(calm_burst.stationary() @ np.array([1.0, 9.0]))
    calm, burst = regimes.vol_forecast_ratio(calm_burst, np.array([[1.0, 0.0], [0.0, 1.0]]), 1)
    assert calm == pytest.approx(np.sqrt((0.99 + 0.01 * 9) / long_run))
    assert burst == pytest.approx(np.sqrt((0.20 + 0.80 * 9) / long_run))
    # the further ahead, the closer both get to the long run
    far = regimes.vol_forecast_ratio(calm_burst, np.array([[1.0, 0.0], [0.0, 1.0]]), 400)
    assert np.all(np.abs(far - 1.0) < np.abs(np.array([calm, burst]) - 1.0))


def fifteen_minute_bars(bursts=(300, 820, 1400, 1950), n=2000, seed=11):
    """15-minute closes with a busier New York afternoon and 90-minute news bursts."""
    rng = np.random.default_rng(seed)
    t = 1_760_000_400 + 900 * np.arange(n + 1)
    hour = (t[1:] % 86400) // 3600
    session = np.where((hour >= 13) & (hour < 17), 2.0, 1.0)
    burst = np.zeros(n, bool)
    for s in bursts:
        burst[s:s + 6] = True
    r = rng.normal(0.0, 0.001 * session * np.where(burst, 5.0, 1.0))
    closes = 100 * np.exp(np.concatenate([[0.0], np.cumsum(r)]))
    return [type("Bar", (), {"time": regimes.datetime(1970, 1, 1) + regimes.timedelta(seconds=float(e)),
                             "close": float(c)})() for e, c in zip(t, closes)]


def test_fast_alarm_fires_on_news_bursts_only():
    bars = fifteen_minute_bars()
    assert regimes._fast(bars[:1958])["imminent"] is True                  # inside the last burst
    after = regimes._fast(bars[:1960])
    assert after["imminent"] is False and after["minutes_since_alarm"] <= 60
    end = regimes._fast(bars)                                               # eleven hours later
    assert end["imminent"] is False and 300 < end["minutes_since_alarm"] < 900
    quiet = regimes._fast(fifteen_minute_bars(bursts=()))                   # the session clock alone
    assert quiet["imminent"] is False and quiet["minutes_since_alarm"] is None
    assert abs(quiet["vol_ratio"] - 1.0) < regimes.ALARM_RATIO - 1.0


def test_fast_features_remove_the_session_clock():
    rng = np.random.default_rng(2)
    t = 1_760_000_400 + 900 * np.arange(3000)
    session = np.where(((t % 86400) // 3600 >= 13) & ((t % 86400) // 3600 < 17), 3.0, 1.0)
    r = rng.normal(0.0, 0.001 * session)
    closes = 100 * np.exp(np.concatenate([[0.0], np.cumsum(r)]))
    x, when = regimes.fast_features(np.concatenate([[t[0] - 900], t]), closes)
    assert len(x) == len(when)
    busy = ((when % 86400) // 3600 >= 13) & ((when % 86400) // 3600 < 17)
    # After the time-of-day scaling the New York afternoon is no longer "volatile".
    assert abs(x[busy, 0].mean() - x[~busy, 0].mean()) < 0.15


# ── macro quadrants ───────────────────────────────────────────────────

def test_macro_quadrants_follow_growth_and_inflation():
    days = 400
    g = np.r_[np.full(100, 1.2), np.full(100, 1.0), np.full(100, -1.1), np.full(100, -1.0)]
    i = np.r_[np.full(100, -1.0), np.full(100, 1.3), np.full(100, 1.0), np.full(100, -1.2)]
    rng = np.random.default_rng(1)
    p = regimes.macro_probabilities(g + rng.normal(0, 0.4, days), i + rng.normal(0, 0.4, days))
    labels = [regimes.MACRO_STATES[k] for k in np.argmax(p, axis=1)]
    for block, name in enumerate(regimes.MACRO_STATES):
        seg = labels[block * 100 + 20:(block + 1) * 100]          # after a few days of switching
        assert seg.count(name) / len(seg) > 0.9, name


def test_trailing_scale_keeps_the_sign_and_uses_only_the_past():
    x = np.r_[np.full(30, 2.0), np.full(20, 1.0)]
    out = regimes.scaled(x, window=20, min_periods=10)
    assert np.isnan(out[:9]).all() and np.all(out[9:] > 0)          # a long rise still reads as rising
    assert out[29] == pytest.approx(1.0) and out[49] == pytest.approx(1.0)
    y = x.copy()
    y[40:] = -1e6                                                  # a different future …
    assert np.allclose(regimes.scaled(y, 20, 10)[:40], out[:40], equal_nan=True)   # … changes nothing before it


# ── the files and the API ─────────────────────────────────────────────

def business_days(start, n):
    d, out = start, []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += regimes.timedelta(days=1)
    return out


def synthetic_fred(seed=4):
    """Four macro phases after a year and a half of drift-free warm-up:
    goldilocks, reflation, stagflation, deflation (250 business days each)."""
    rng = np.random.default_rng(seed)
    warm, phase = 400, 250
    growth = np.r_[np.zeros(warm), np.full(phase, 1.0), np.full(phase, 1.0), np.full(phase, -1.0), np.full(phase, -1.0)]
    infl = np.r_[np.zeros(warm), np.full(phase, -1.0), np.full(phase, 1.0), np.full(phase, 1.0), np.full(phase, -1.0)]
    n = len(growth)
    days = business_days(fred.date(2019, 1, 2), n)
    sp = 3000 * np.exp(np.cumsum(0.0012 * growth + rng.normal(0, 0.008, n)))
    be = 2.2 + np.cumsum(0.004 * infl + rng.normal(0, 0.02, n))
    oil = 70 * np.exp(np.cumsum(0.002 * infl + rng.normal(0, 0.015, n)))
    csv = {"SP500": sp, "T10YIE": be, "DCOILWTICO": oil}

    def download(series_id, timeout):
        rows = [f"{d.isoformat()},{v:.4f}" for d, v in zip(days, csv[series_id])]
        rows[100] = f"{days[100].isoformat()},."              # FRED's missing-value marker
        return f"observation_date,{series_id}\n" + "\n".join(rows) + "\n"
    return download, days, warm, phase


def test_macro_files_follow_the_quadrants(tmp_path, monkeypatch):
    monkeypatch.setattr(fred, "_failed_at", {})
    download, days, warm, phase = synthetic_fred()
    from local_analysis import runner
    assert runner.update_macro(cache_dir=tmp_path, download=download) is True
    assert runner.update_macro(cache_dir=tmp_path, download=download) is False      # same data: no rewrite
    import json
    macro = json.loads((tmp_path / runner.MACRO_FILE).read_text())
    assert macro["producer"] == runner.PRODUCER and macro["slow"]["regime"] in regimes.MACRO_STATES
    assert 0 < macro["slow"]["confidence"] <= 1
    rows = macro["history"]["slow_d1"]
    dates = [r["date"] for r in rows]
    assert dates == sorted(set(dates))                                            # no duplicates, in order
    first, last = fred.date.fromisoformat(dates[0]), fred.date.fromisoformat(dates[-1])
    assert len(rows) == (last - first).days + 1                                   # every calendar day
    label = {r["date"]: r["regime"] for r in rows}
    for k, name in enumerate(regimes.MACRO_STATES):
        late = days[warm + k * phase + 120: warm + (k + 1) * phase]               # once the 3-month change caught up
        hits = sum(label.get(d.isoformat()) == name for d in late)
        assert hits / len(late) > 0.8, (name, hits / len(late))
    tr = json.loads((tmp_path / runner.TRANSITIONS_FILE).read_text())
    assert tr["current"]["regime"] == macro["history"]["slow_d1"][-1]["regime"]
    for horizon in ("7d", "30d", "90d"):
        assert abs(sum(tr["probabilities"][horizon].values()) - 1.0) < 1e-2


def test_macro_files_are_left_alone_when_they_belong_to_another_producer(tmp_path, monkeypatch):
    monkeypatch.setattr(fred, "_failed_at", {})
    from local_analysis import runner
    (tmp_path / runner.MACRO_FILE).write_text('{"producer": "data-center", "slow": {"regime": "REFLATION"}}')
    download, *_ = synthetic_fred()
    assert runner.update_macro(cache_dir=tmp_path, download=download) is False


def test_the_regime_routes_serve_the_local_files():
    import json
    import os
    from fastapi.testclient import TestClient
    from local_analysis import runner
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            runner._built.clear()
            assert runner.update_ticker("XAUUSD", data_server.app.state.provider, force=True, phases=("regime",))
            r = client.get("/api/regime/XAUUSD").json()
            n = r["slow"]["n_states_selected"]
            assert r["slow"]["regime"] in regimes.PALETTES[n] and 0 < r["slow"]["confidence"] <= 1
            assert isinstance(r["fast"]["imminent"], bool)
            rows = r["history"]["slow_d1"]
            assert len(rows) > 500 and all(row["regime"] in regimes.PALETTES[n] for row in rows)
            assert len({row["date"] for row in rows}) == len(rows)
            # dated by the bars' own days, the forming day excluded
            daily = data_server.app.state.provider.get_bars("XAUUSD", "D1", 3)
            assert rows[-1]["date"] == daily[-2].time[:10]
            json.dumps(r, allow_nan=False)                                     # the UI can't take NaN
    finally:
        os.environ.pop("MK_PROVIDER", None)
