"""Gaussian HMM (local_analysis.hmm): parameter recovery, no look-ahead in the
filtered probabilities, and the helpers built on a fitted model."""

import numpy as np
import pytest

from local_analysis import hmm


def _two_regimes(n=1500, seed=1):
    """Calm (σ 0.5%) and turbulent (σ 2%) days with sticky switching."""
    rng = np.random.default_rng(seed)
    p_stay = (0.98, 0.95)
    states = np.empty(n, dtype=int)
    s = 0
    for t in range(n):
        states[t] = s
        if rng.random() > p_stay[s]:
            s = 1 - s
    sigma = np.where(states == 0, 0.005, 0.02)
    mean = np.where(states == 0, 0.0005, -0.001)
    return mean + sigma * rng.standard_normal(n), states


def test_recovers_two_volatility_regimes():
    x, states = _two_regimes()
    model = hmm.fit(x, 2, seed=0)
    assert model is not None
    calm = int(np.argmin(model.variances[:, 0]))
    wild = 1 - calm
    assert np.sqrt(model.variances[calm, 0]) == pytest.approx(0.005, rel=0.15)
    assert np.sqrt(model.variances[wild, 0]) == pytest.approx(0.02, rel=0.15)
    assert model.transmat[calm, calm] == pytest.approx(0.98, abs=0.02)
    assert model.transmat[wild, wild] == pytest.approx(0.95, abs=0.04)
    path = hmm.viterbi(model, x)
    agree = np.mean((path == wild) == (states == 1))
    assert agree > 0.9


def test_filtered_probabilities_use_no_future_data():
    x, _ = _two_regimes(600)
    model = hmm.fit(x, 2, seed=0)
    full = hmm.filtered(model, x)
    cut = 400
    head = hmm.filtered(model, x[:cut])
    np.testing.assert_allclose(full[:cut], head, atol=1e-12)
    # Smoothed probabilities also use later data, which is why they're not used for display.
    assert np.abs(hmm.smoothed(model, x) - full).max() > 0.05


def test_probabilities_are_distributions():
    x, _ = _two_regimes(500)
    model = hmm.fit(np.column_stack([x, np.abs(x)]), 3, seed=0)
    for p in (hmm.filtered(model, np.column_stack([x, np.abs(x)])),
              hmm.smoothed(model, np.column_stack([x, np.abs(x)]))):
        assert p.shape == (500, 3)
        np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-9)
        assert (p >= 0).all()
    np.testing.assert_allclose(model.transmat.sum(axis=1), 1.0, atol=1e-12)
    np.testing.assert_allclose(model.stationary().sum(), 1.0, atol=1e-9)


def test_fit_is_deterministic_and_reorder_keeps_the_likelihood():
    x, _ = _two_regimes(400)
    a, b = hmm.fit(x, 2, seed=7), hmm.fit(x, 2, seed=7)
    np.testing.assert_array_equal(a.means, b.means)
    r = a.reorder([1, 0])
    np.testing.assert_allclose(hmm.filtered(r, x)[:, ::-1], hmm.filtered(a, x), atol=1e-10)
    assert r.expected_duration()[0] == pytest.approx(a.expected_duration()[1])


def test_too_little_data_gives_no_model():
    assert hmm.fit(np.zeros(15), 3) is None
