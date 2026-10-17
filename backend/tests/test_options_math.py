"""Option-chain arithmetic (local_analysis.options_math): Black-Scholes gamma,
GEX sign and units, the gamma flip, walls and max pain."""

import math

import numpy as np
import pytest

from local_analysis import options_math as om


def _chain(rows):
    """rows: (strike, 'C'|'P', oi, iv, t_years)"""
    k, cp, oi, iv, t = zip(*rows)
    return om.Chain(strike=np.array(k, float), is_call=np.array([c == "C" for c in cp]),
                    oi=np.array(oi, float), iv=np.array(iv, float), t=np.array(t, float),
                    expiry=np.array(["2026-12-18"] * len(rows)))


def _norm_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _bs_call(s, k, t, v):
    d1 = (math.log(s / k) + 0.5 * v * v * t) / (v * math.sqrt(t))
    return s * _norm_cdf(d1) - k * _norm_cdf(d1 - v * math.sqrt(t))


def test_gamma_matches_the_textbook_value_and_finite_differences():
    assert om.bs_gamma(100.0, 100.0, 1.0, 0.2) == pytest.approx(0.0198476, abs=1e-6)
    h = 0.01
    for s, k, t, v in [(100, 90, 0.25, 0.3), (50, 55, 0.05, 0.6), (4000, 4100, 0.5, 0.15)]:
        fd = (_bs_call(s + h, k, t, v) - 2 * _bs_call(s, k, t, v) + _bs_call(s - h, k, t, v)) / (h * h)
        assert om.bs_gamma(s, k, t, v) == pytest.approx(fd, rel=1e-3)


def test_gex_signs_and_dollar_units():
    s = 100.0
    c = _chain([(100, "C", 10, 0.2, 1.0), (100, "P", 4, 0.2, 1.0)])
    g = om.bs_gamma(s, 100.0, 1.0, 0.2)
    by = om.gex_by_strike(c, s)
    assert by["call"][0] == pytest.approx(g * 10 * 100 * s * s * 0.01)
    assert by["put"][0] == pytest.approx(-g * 4 * 100 * s * s * 0.01)
    assert by["net"][0] == pytest.approx(by["call"][0] + by["put"][0])


def test_contracts_without_usable_iv_or_oi_carry_no_gamma():
    c = _chain([(100, "C", 10, float("nan"), 0.5), (100, "C", 0, 0.2, 0.5),
                (100, "C", 10, 1e-5, 0.5), (100, "C", 10, 0.25, 0.5)])
    gex = om.contract_gex(c, 100.0)
    assert gex[:3].tolist() == [0.0, 0.0, 0.0] and gex[3] > 0


def test_gamma_flip_sits_between_the_put_and_call_concentrations():
    c = _chain([(90, "P", 5000, 0.25, 0.1), (95, "P", 3000, 0.25, 0.1),
                (105, "C", 3000, 0.25, 0.1), (110, "C", 5000, 0.25, 0.1)])
    flip = om.gamma_flip(c, 100.0)
    assert flip is not None and 90 < flip < 110
    below, above = om.net_gex_curve(c, np.array([flip - 1.0, flip + 1.0]))
    assert below < 0 < above


def test_gamma_flip_is_none_without_a_sign_change():
    c = _chain([(100, "C", 1000, 0.2, 0.2), (105, "C", 1000, 0.2, 0.2)])
    assert om.gamma_flip(c, 100.0) is None


def test_walls_pick_the_largest_call_and_put_gamma():
    c = _chain([(95, "P", 8000, 0.3, 0.1), (98, "P", 1000, 0.3, 0.1),
                (102, "C", 1000, 0.3, 0.1), (105, "C", 9000, 0.3, 0.1)])
    assert om.walls(om.gex_by_strike(c, 100.0)) == {"call_wall": 105.0, "put_wall": 95.0}
    assert om.walls(om.gex_by_strike(_chain([(100, "C", 0, 0.2, 0.1)]), 100.0)) == \
        {"call_wall": None, "put_wall": None}


def test_max_pain_matches_brute_force():
    rows = [(90, "C", 100, 0.2, 0.1), (100, "C", 500, 0.2, 0.1), (110, "C", 900, 0.2, 0.1),
            (90, "P", 800, 0.2, 0.1), (100, "P", 600, 0.2, 0.1), (110, "P", 50, 0.2, 0.1)]
    c = _chain(rows)

    def payout(settle):
        return sum(oi * (max(settle - k, 0) if cp == "C" else max(k - settle, 0))
                   for k, cp, oi, _, _ in rows)
    assert om.max_pain(c) == min((90, 100, 110), key=payout)
    assert om.max_pain(_chain([(100, "C", 0, 0.2, 0.1)])) is None
