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


def test_hazard_grows_with_the_horizon():
    model = hmm.HMM(np.array([0.5, 0.5]), np.array([[0.95, 0.05], [0.10, 0.90]]),
                    np.zeros((2, 1)), np.ones((2, 1)), 0.0)
    quiet = np.array([1.0, 0.0])
    h1, h8 = regimes.hazard(model, quiet, 1, 1), regimes.hazard(model, quiet, 1, 8)
    assert h1 == pytest.approx(0.05) and h8 == pytest.approx(1 - 0.95 ** 8)
    assert regimes.hazard(model, np.array([0.0, 1.0]), 1, 8) == 1.0   # already there


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


def test_trailing_zscore_uses_only_the_past():
    x = np.arange(50, dtype=float)
    z = regimes.zscore(x, window=20, min_periods=10)
    assert np.isnan(z[:9]).all() and np.isfinite(z[9:]).all()
    y = x.copy()
    y[40:] = 1e6                                                  # a different future …
    assert np.allclose(regimes.zscore(y, 20, 10)[:40], z[:40], equal_nan=True)   # … changes nothing before it
