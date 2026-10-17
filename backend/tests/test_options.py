"""The OPTIONS QUANT page's file: levels from a public ETF option chain,
moved into the feed's price space, in the shape the page reads."""

import json
import math
import os
from datetime import date, datetime, timedelta

import pytest

from local_analysis import options, runner

SPOT = 500.0
NOW = datetime(2026, 10, 14, 15, 0)                  # a Wednesday, 11:00 in New York
EXPIRIES = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-21",
            "2026-10-23", "2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02", "2026-11-20", "2026-12-18"]


def _ncdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _rows(day, now, call):
    t = max((options.close_utc(date.fromisoformat(day)) - now).total_seconds() / options.YEAR, 1e-4)
    rows = []
    for k in range(400, 605, 5):
        m = math.log(k / SPOT)
        iv = 0.18 - 0.25 * m + 0.6 * m * m
        d1 = (math.log(SPOT / k) + 0.5 * iv * iv * t) / (iv * math.sqrt(t))
        c = SPOT * _ncdf(d1) - k * _ncdf(d1 - iv * math.sqrt(t))
        price = c if call else c - SPOT + k
        oi = 1000 + (20000 if call and k == 520 else 0) + (25000 if not call and k == 480 else 0)
        rows.append({"strike": float(k), "bid": max(price * 0.99, 0.01), "ask": price * 1.01 + 0.01,
                     "volume": 300.0 if abs(k - SPOT) < 30 else 20.0, "openInterest": float(oi),
                     "impliedVolatility": 0.5 if k == 405 else iv})     # 0.5: one of Yahoo's failed solves
    return rows


def fake_fetch(etf, now):
    chains = {d: {"calls": _rows(d, now, True), "puts": _rows(d, now, False)}
              for d in options.select_expiries(EXPIRIES, now)}
    closes = [SPOT * math.exp(0.01 * math.sin(i)) for i in range(60)]
    return {"spot": SPOT, "time": (now - datetime(1970, 1, 1)).total_seconds(), "open": SPOT,
            "closes": closes, "chains": chains}


class Feed:
    provider_type, provider_id, connected = "sim", "sim_default", True

    def get_latest_ticks(self, symbols):
        return {s: type("Tick", (), {"bid": 4999.0, "ask": 5001.0, "last": 5000.0})() for s in symbols}

    def get_bars(self, ticker, timeframe, count):
        return []


def _build(tmp_path, now=NOW):
    runner._options_note["built"].clear()
    epoch = (now - datetime(1970, 1, 1)).total_seconds()
    assert runner.update_options(Feed(), ["US500", "EURUSD"], cache_dir=tmp_path, fetch=fake_fetch,
                                 force=True, now=epoch) == ["US500"]
    return json.loads((tmp_path / "US500_options.json").read_text())


def test_new_york_clock_and_expiry_choice():
    assert options.et_offset(datetime(2026, 1, 15, 12)) == timedelta(hours=-5)
    assert options.et_offset(datetime(2026, 7, 15, 12)) == timedelta(hours=-4)
    assert options.close_utc(date(2026, 10, 14)) == datetime(2026, 10, 14, 20, 0)
    chosen = options.select_expiries(EXPIRIES, NOW)
    assert chosen[0] == "2026-10-14" and "2026-10-13" not in chosen          # today kept, yesterday gone
    # 16 Oct is itself the October monthly, so the second monthly added is November's
    assert len(chosen) == 1 + options.SWING_EXPIRIES + 1 and chosen[-1] == "2026-11-20"
    after_close = options.select_expiries(EXPIRIES, datetime(2026, 10, 14, 21, 0))
    assert "2026-10-14" not in after_close
    assert options.market_open(NOW) and not options.market_open(datetime(2026, 10, 17, 15, 0))


def test_levels_are_in_the_feeds_price_space(tmp_path):
    d = _build(tmp_path)
    json.dumps(d, allow_nan=False)
    assert d["producer"] == runner.PRODUCER and d["levels_space"] == "broker"
    assert d["cfd_ratio_used"] == pytest.approx(10.0) and d["spot"] == 5000.0 and d["spot_etf"] == SPOT
    assert d["walls"]["primary_call_wall"] == 5200.0 and d["walls"]["primary_put_wall"] == 4800.0
    assert 4800 < d["gex_flip"] < 5200
    assert d["gex"]["regime"] in ("POSITIVE", "NEGATIVE") and d["swing_expiry"] == "2026-10-15"
    assert d["max_pain"] is not None and d["hvl"] in (4800.0, 5200.0)
    em = d["expected_move"]
    assert em["move_down"] < 5000 < em["move_up"] and em["pct"] == pytest.approx(em["straddle"] / 50, abs=0.01)
    agg = d["gex_stack"]["aggregate"]
    assert agg["strikes"][0] >= 400 and agg["strikes"][-1] <= 600                # chain space
    assert d["gex_stack"]["strikes"][0] == agg["strikes"][0] * 10                 # broker space
    assert sum(sum(layer["net_gex"]) for layer in d["gex_stack"]["layers"]) == pytest.approx(agg["net_total_gex"], rel=1e-6)
    skew = d["iv_skew"]
    assert skew["put_25d_iv"] > skew["atm_iv"] > skew["call_25d_iv"] and skew["skew"] > 0
    assert skew["velocity"]["verdict"] == "UNKNOWN" and skew["expiry_dte"] == 1
    assert d["pc_ratio"]["oi_ratio"] > 1 and d["iv_divergence"]["signal"] is not None


def test_the_sauce_cards_and_the_0dte_blocks(tmp_path):
    d = _build(tmp_path)
    sauce = d["sauce"]
    scen = sauce["dealer_scenarios"]
    assert sorted(s["move_pct"] for s in scen["scenarios"]) == [-1.0, -0.5, 0.5, 1.0]
    assert all(s["direction"] == ("BUY" if s["forced_flow"] > 0 else "SELL") for s in scen["scenarios"])
    assert scen["spring_direction"] in ("UPSIDE", "DOWNSIDE", "NEUTRAL") and scen["asymmetry_ratio"] > 0
    si = sauce["structural_integrity"]["levels"]
    assert len(si) == 21 and [lv["strike"] for lv in si] == sorted(lv["strike"] for lv in si)
    assert [lv["strike"] for lv in si if lv["is_spot"]] == [5000.0]
    agg = d["gex_stack"]["aggregate"]
    assert si == options.structural_integrity(agg["strikes"], agg["net_gex"], 5000.0, 10.0)["levels"]
    vg = sauce["volatility_gravity"]["levels"]
    assert len(vg) == 18 and all(lv["type"] in ("magnet", "spring") and 0 <= lv["strength"] <= 100 for lv in vg)
    ent = sauce["market_entropy"]
    assert ent["state"] in ("ORDERED", "MODERATE", "CHAOTIC") and 0 <= ent["swing"]["score"] <= 1
    assert ent["n_strikes"] > 0 and ent["intraday"]["state"] != "UNKNOWN"
    assert d["gex_0dte"]["layers"][0]["expiry"] == "2026-10-14" and d["expected_move_0dte"]["straddle"] > 0
    hm0 = d["dealer_heatmap_0dte"]
    assert len(hm0["strikes"]) == len(hm0["dealer_delta"]) and hm0["strikes"] == sorted(hm0["strikes"])
    assert len(d["iv_skew"]["skew_pct_history"]) == 1                             # market open: one point
    later = _build(tmp_path, NOW + timedelta(hours=6))                            # after the close
    assert later["gex_0dte"] is None and later["sauce_0dte"] is None
    assert len(later["iv_skew"]["skew_pct_history"]) == 1                         # no new point after hours


def test_cadence_other_producers_and_offline(tmp_path):
    _build(tmp_path)
    epoch = (NOW - datetime(1970, 1, 1)).total_seconds()
    assert runner.update_options(Feed(), ["US500"], cache_dir=tmp_path, fetch=fake_fetch, now=epoch + 60) == []
    (tmp_path / "US500_options.json").write_text('{"producer": "data-center"}')
    assert runner.update_options(Feed(), ["US500"], cache_dir=tmp_path, fetch=fake_fetch, force=True, now=epoch) == []

    def offline(etf, now):
        raise OSError("network unreachable")
    assert runner.update_options(Feed(), ["XAUUSD"], cache_dir=tmp_path, fetch=offline, force=True, now=epoch) == []


def test_the_route_serves_the_file_with_the_live_price():
    from fastapi.testclient import TestClient
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            cache = runner._cache_dir()
            runner._options_note["built"].clear()
            epoch = (NOW - datetime(1970, 1, 1)).total_seconds()
            assert runner.update_options(Feed(), ["US500"], cache_dir=cache, fetch=fake_fetch,
                                         force=True, now=epoch) == ["US500"]
            r = client.get("/api/options/US500/full").json()
            assert r["_conversion_source"] == "broker_native" and r["sauce"]["structural_integrity"]["levels"]
            (cache / "US500_options.json").unlink()
    finally:
        os.environ.pop("MK_PROVIDER", None)
