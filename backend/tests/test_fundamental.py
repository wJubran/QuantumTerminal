"""The FUNDAMENTAL page's file: FRED liquidity, yields and VIX, the macro
regime block, CFTC positioning and the asset scores, in the shape the page reads."""

import json
import os
from datetime import date, datetime, timedelta

import numpy as np
import pytest

from local_analysis import cot, fred, fundamental, regimes, runner


def business_days(end, n):
    d, out = end, []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return out[::-1]


END = date(2026, 10, 16)
DAYS = business_days(END, 1500)
WEDNESDAYS = [d for d in DAYS if d.weekday() == 2]


def series_values(seed=3):
    rng = np.random.default_rng(seed)
    n = len(DAYS)
    out = {
        "SP500": 4000 * np.exp(np.cumsum(0.0006 + rng.normal(0, 0.009, n))),
        "T10YIE": 2.3 + np.cumsum(rng.normal(0, 0.015, n)) * 0.2,
        "DCOILWTICO": 75 * np.exp(np.cumsum(rng.normal(0, 0.018, n))),
        "RRPONTSYD": np.linspace(2200.0, 40.0, n),
        "DGS2": np.r_[np.full(n - 63, 4.40), np.full(63, 3.60)],
        "DGS5": np.r_[np.full(n - 63, 4.20), np.full(63, 3.70)],
        "DGS10": np.r_[np.full(n - 63, 4.30), np.full(63, 4.05)],
        "DGS30": np.r_[np.full(n - 63, 4.50), np.full(63, 4.60)],
        "DFII10": np.full(n, 1.80),
        "DFF": np.r_[np.full(n - 40, 4.33), np.full(40, 4.08)],
        "DFEDTARU": np.r_[np.full(n - 40, 4.50), np.full(40, 4.25)],
        "DFEDTARL": np.r_[np.full(n - 40, 4.25), np.full(40, 4.00)],
        "VIXCLS": np.r_[np.full(n - 20, 19.5), np.full(20, 16.2)],
    }
    weekly = {
        "WALCL": np.linspace(8_900_000.0, 6_600_000.0, len(WEDNESDAYS)),       # $ millions
        "WTREGEN": np.full(len(WEDNESDAYS), 750_000.0),
    }
    return out, weekly


def fred_download():
    daily, weekly = series_values()

    def download(series_id, timeout):
        if series_id in weekly:
            rows = zip(WEDNESDAYS, weekly[series_id])
        else:
            rows = zip(DAYS, daily[series_id])
        return f"observation_date,{series_id}\n" + "".join(f"{d.isoformat()},{v:.4f}\n" for d, v in rows)
    return download


def cot_download(code, timeout):
    """Socrata rows, newest first, as the CFTC API returns them."""
    weeks = [END - timedelta(days=3 + 7 * k) for k in range(cot.WEEKS)]          # Tuesdays
    rows = []
    for k, d in enumerate(weeks):
        trend = (cot.WEEKS - k) * 800.0 if code == "088691" else 0.0          # gold longs keep building
        long_ = 200_000 + trend + 3000 * np.sin(k)
        rows.append({"report_date_as_yyyy_mm_dd": f"{d.isoformat()}T00:00:00.000",
                     "open_interest_all": "500000", "noncomm_positions_long_all": str(int(long_)),
                     "noncomm_positions_short_all": "60000"})
    return rows


class Closes:
    provider_type, provider_id, connected = "sim", "sim_default", True

    def get_bars(self, ticker, timeframe, count):
        rng = np.random.default_rng(len(ticker))
        drift = {"US500": 0.001, "XAUUSD": 0.0008, "EURUSD": -0.0004}.get(ticker, 0.0)
        c = 100 * np.exp(np.cumsum(drift + rng.normal(0, 0.008, count)))
        start = datetime(2025, 9, 1)
        return [{"time": start + timedelta(days=i), "open": float(v), "close": float(v)} for i, v in enumerate(c)]


@pytest.fixture
def built(tmp_path, monkeypatch):
    monkeypatch.setattr(fred, "_failed_at", {})
    monkeypatch.setattr(cot, "_failed_at", {})
    download = fred_download()
    assert runner.update_macro(cache_dir=tmp_path, download=download)
    assert runner.update_fundamental(Closes(), ["XAUUSD", "EURUSD", "US500", "USDJPY"], cache_dir=tmp_path,
                                     download=download, cot_download=cot_download)
    return json.loads((tmp_path / runner.FUNDAMENTAL_FILE).read_text()), tmp_path, download


def test_the_file_has_every_section_in_the_pages_shape(built):
    data, _, _ = built
    json.dumps(data, allow_nan=False)
    assert data["producer"] == runner.PRODUCER

    reg = data["regime"]
    assert reg["label"] in regimes.MACRO_STATES and isinstance(reg["confidence"], int)
    assert 0 <= reg["confidence"] <= 100
    assert isinstance(reg["growth_z"], float) and isinstance(reg["inflation_z"], float)
    assert set(reg["implications"]) >= {"equities", "commodities", "fixed_income", "usd"}
    for p in [reg["current_position"], *reg["trail"]]:
        assert 0 <= p["x"] <= 1 and 0 <= p["y"] <= 1
    assert 1 <= len(reg["trail"]) <= 12
    assert [f["series"] for f in reg["growth_factors"]] == ["SP500"]
    assert {f["series"] for f in reg["inflation_factors"]} == {"T10YIE", "DCOILWTICO"}
    assert all(isinstance(f["z_score"], float) for f in reg["growth_factors"] + reg["inflation_factors"])

    liq = data["liquidity"]
    daily, _ = series_values()
    walcl, tga = 6600.0, 750.0
    rrp = round(float(daily["RRPONTSYD"][DAYS.index(WEDNESDAYS[-1])]), 1)   # as of the last weekly report
    assert liq["as_of"] == WEDNESDAYS[-1].isoformat()
    assert liq["components"] == {"walcl": walcl, "tga": tga, "rrp": rrp}
    assert liq["value_label"] == f"${(walcl - tga - rrp) / 1000:.2f}T"
    assert liq["delta_4w"] < 0 and liq["trend"] == "CONTRACTING" and liq["delta_4w_label"].startswith("−$")
    assert len(liq["chart"]) == 52 and all(isinstance(p["value"], float) for p in liq["chart"])
    assert liq["fed_events"] == [{"date": DAYS[-40].isoformat(), "event": "CUT 25bp", "type": "change",
                                  "detail": "Target 4.00-4.25%"}]

    yl = data["yields"]
    assert yl["curve"] == {"2Y": 3.6, "5Y": 3.7, "10Y": 4.05, "30Y": 4.6}
    assert yl["curve_prev"] == {"2Y": 4.4, "5Y": 4.2, "10Y": 4.3, "30Y": 4.5}
    assert yl["spread_2s10s"] == 0.45 and yl["spread_2s10s_bp"] == 45 and yl["prev_spread_2s10s_bp"] == -10
    assert yl["inverted"] is False and yl["fed_funds_rate"] == 4.08
    assert yl["vix"] == 16.2 and yl["prev_vix"] == 19.5 and yl["real_yield_10y"] == 1.8


def test_scores_and_positioning(built):
    data, _, _ = built
    scores = data["asset_scores"]
    assert list(scores) == ["XAUUSD", "EURUSD", "US500", "USDJPY"]        # universe order: the first is selected
    for s in scores.values():
        assert isinstance(s["score"], float) and -100 <= s["score"] <= 100
        assert s["score"] == pytest.approx(sum(f["contribution"] for f in s["factors"]), abs=0.05)
        assert all(isinstance(f["value"], float) and isinstance(f["contribution"], float) for f in s["factors"])
    gold = data["cot"]["XAUUSD"]
    assert gold["label"] == "CROWDED LONG" and gold["z_score"] > 1.5 and isinstance(gold["z_score"], float)
    assert gold["net_position"] > 0 and gold["open_interest"] == 500000 and len(gold["chart"]) >= 3
    assert data["cot"]["USDJPY"]["net_position"] < 0                     # yen futures long = USD/JPY short
    assert "US500" in data["cot"] and "EURUSD" in data["cot"]


def test_regime_rules_of_thumb_by_asset_class():
    assert fundamental.regime_stance("US500", "GOLDILOCKS") == 1.0
    assert fundamental.regime_stance("XAUUSD", "GOLDILOCKS") == -1.0
    assert fundamental.regime_stance("EURUSD", "GOLDILOCKS") == 1.0       # a weaker dollar lifts EUR/USD
    assert fundamental.regime_stance("USDJPY", "DEFLATION") == 1.0
    assert fundamental.regime_stance("XTIUSD", "STAGFLATION") == 1.0
    assert fundamental.regime_stance("BTCUSD", "REFLATION") == 0.0        # equities are MIXED there
    assert fundamental.regime_stance("EURGBP", "DEFLATION") == 0.0


def test_unchanged_data_is_not_rewritten_until_the_hourly_refresh(built, monkeypatch):
    _, path, download = built
    kw = dict(cache_dir=path, download=download, cot_download=cot_download)
    universe = ["XAUUSD", "EURUSD", "US500", "USDJPY"]
    assert runner.update_fundamental(Closes(), universe, **kw) is False
    later = runner.time.time() + runner.FUNDAMENTAL_REFRESH_SEC + 1
    assert runner.update_fundamental(Closes(), universe, now=later, **kw) is True


def test_missing_sources_leave_their_sections_out(tmp_path, monkeypatch):
    monkeypatch.setattr(fred, "_failed_at", {})
    monkeypatch.setattr(cot, "_failed_at", {})

    def offline(*args):
        raise OSError("network unreachable")
    assert runner.update_fundamental(None, ["XAUUSD"], cache_dir=tmp_path, download=offline,
                                     cot_download=offline) is False
    assert not (tmp_path / runner.FUNDAMENTAL_FILE).exists()
    # prices alone still give the scores
    assert runner.update_fundamental(Closes(), ["XAUUSD"], cache_dir=tmp_path, download=offline,
                                     cot_download=offline, force=True) is True
    data = json.loads((tmp_path / runner.FUNDAMENTAL_FILE).read_text())
    assert set(k for k in data if not k.startswith("_") and k not in
               ("producer", "engine_version", "signature", "computed_at")) == {"asset_scores"}


def test_the_route_reports_the_files_age():
    from fastapi.testclient import TestClient
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    from data_server import cfg_manager
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            cache = runner._cache_dir()
            fred._failed_at.clear()
            cot._failed_at.clear()
            download = fred_download()
            runner.update_macro(cache_dir=cache, download=download, force=True)
            assert runner.update_fundamental(data_server.app.state.provider, cfg_manager.get_active_universe(),
                                             cache_dir=cache, download=download, cot_download=cot_download,
                                             force=True)
            r = client.get("/api/fundamental_state").json()
            assert 0 <= r["_meta"]["age_hours"] < 0.1 and r["_meta"]["stale"] is False
            assert r["regime"]["label"] in regimes.MACRO_STATES
            assert set(r["asset_scores"]) <= set(cfg_manager.get_active_universe())
            (cache / runner.FUNDAMENTAL_FILE).unlink()
            (cache / runner.MACRO_FILE).unlink()
            (cache / runner.TRANSITIONS_FILE).unlink()
    finally:
        os.environ.pop("MK_PROVIDER", None)
