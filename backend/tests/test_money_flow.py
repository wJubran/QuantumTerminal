"""The MONEY FLOW page's files: sectors, countries, rotation arcs and the
asset-class money-flow proxy, in the shapes the page reads."""

import json
import os
from datetime import date, timedelta

import pytest

from local_analysis import money_flow, runner
from macro_data import COUNTRY_ETFS, SECTOR_ETFS

DAYS = [date(2026, 7, 1) + timedelta(days=k) for k in range(140)]
DAYS = [d for d in DAYS if d.weekday() < 5][-60:]
MISSING = {"XLC", "IBIT", "EWT"}                  # tickers whose download fails


def daily(drift, volume=5e7, price=100.0):
    rows, p = [], price
    for k, d in enumerate(DAYS):
        p *= 1 + drift + (0.002 if k % 2 else -0.002)
        rows.append((d, round(p, 4), volume))
    return rows


def fake_download(tickers):
    out = {}
    for t in tickers:
        if t in MISSING:
            continue
        drift = 0.0
        if t in ("SPY", "QQQ", "IWM", "EFA", "EEM"):
            drift = 0.004                         # equities bought on heavy volume
        elif t in ("TLT", "IEF", "AGG", "LQD", "HYG"):
            drift = -0.003                        # bonds sold
        elif t == "EWZ":
            drift = 0.006                         # Brazil leads
        elif t == "EWJ":
            drift = -0.005                        # Japan lags
        elif t == "XLE":
            drift = 0.003
        vol = 2e8 if t in ("SPY", "TLT") else 5e7
        out[t] = daily(drift, vol)
    return out


@pytest.fixture
def files(tmp_path):
    assert runner.update_money_flow(cache_dir=tmp_path, download=fake_download, force=True) is True
    return {name: json.loads((tmp_path / name).read_text())
            for name in ("GLOBAL_macro_sectors.json", "GLOBAL_macro_countries.json",
                         "GLOBAL_macro_flows.json", "GLOBAL_macro_sector_flows.json")}, tmp_path


def test_sectors_and_countries_leave_failed_tickers_out(files):
    f, _ = files
    for body in f.values():
        json.dumps(body, allow_nan=False)
    sec = f["GLOBAL_macro_sectors.json"]
    assert {s["ticker"] for s in sec["sectors"]} == set(SECTOR_ETFS) - MISSING
    assert all(isinstance(s["chg_1w"], float) and isinstance(s["chg_4w"], float) and s["name"] for s in sec["sectors"])
    assert sec["top5_4w"][0]["ticker"] == "XLE"
    assert [s["chg_4w"] for s in sec["top5_4w"]] == sorted((s["chg_4w"] for s in sec["top5_4w"]), reverse=True)
    cty = f["GLOBAL_macro_countries.json"]
    assert {c["ticker"] for c in cty["countries"]} == set(COUNTRY_ETFS) - MISSING
    assert cty["top5_1w"][0]["code"] == "BR" and cty["bottom5_4w"][-1]["code"] == "JP"


def test_rotation_arcs_run_from_the_weakest_markets_to_the_strongest(files):
    flows = files[0]["GLOBAL_macro_flows.json"]
    assert set(flows) >= {"1W", "4W"}
    first = flows["4W"]["flows"][0]
    assert (first["from"], first["to"]) == ("JP", "BR")
    assert isinstance(first["magnitude"], float) and first["magnitude"] > 0 and 0 < first["strength"] <= 1
    assert first["color"] == "#00d2d3"                          # into an emerging market


def test_capital_flows_follow_the_pressure_on_each_asset_class(files):
    flows = files[0]["GLOBAL_macro_sector_flows.json"]
    assert set(flows) >= {"macro", "weekly"}
    macro = flows["macro"]
    nodes = macro["sectors"]
    assert set(nodes) <= set(money_flow.NODES) and all(isinstance(n["label"], str) for n in nodes.values())
    assert nodes["EQUITIES"]["net_flow_b"] > 0 > nodes["BONDS"]["net_flow_b"]
    assert nodes["EQUITIES"]["sentiment"] == "INFLOW" and nodes["BONDS"]["sentiment"] == "OUTFLOW"
    assert "IBIT" not in nodes["CRYPTO"]["etfs"]                 # failed tickers are left out
    first = macro["flows"][0]
    assert (first["from"], first["to"], first["type"]) == ("BONDS", "EQUITIES", "yield_driven")
    assert all(0 < fl["strength"] <= 1 and fl["from"] in nodes and fl["to"] in nodes for fl in macro["flows"])
    assert isinstance(macro["computed_at"], str) and "proxy" in macro["method"]


def test_another_producers_files_and_the_hourly_cadence(tmp_path):
    (tmp_path / "GLOBAL_macro_sectors.json").write_text('{"producer": "data-center", "sectors": []}')
    assert runner.update_money_flow(cache_dir=tmp_path, download=fake_download, force=True) is True
    assert json.loads((tmp_path / "GLOBAL_macro_sectors.json").read_text())["producer"] == "data-center"
    assert runner.update_money_flow(cache_dir=tmp_path, download=fake_download) is False      # within the hour

    def offline(tickers):
        raise OSError("network unreachable")
    assert runner.update_money_flow(cache_dir=tmp_path, download=offline, force=True) is False


def test_the_money_flow_routes_serve_the_files():
    from fastapi.testclient import TestClient
    os.environ["MK_PROVIDER"] = "sim"
    import data_server
    try:
        with TestClient(data_server.app, base_url="http://127.0.0.1:8502") as client:
            cache = runner._cache_dir()
            assert runner.update_money_flow(cache_dir=cache, download=fake_download, force=True)
            assert client.get("/api/macro/sectors").json()["sectors"]
            assert client.get("/api/macro/countries").json()["countries"]
            assert client.get("/api/macro/flows", params={"period": "4W"}).json()["flows"]
            capital = client.get("/api/fundamental/money-flow", params={"period": "macro"}).json()
            assert capital["sectors"]["EQUITIES"]["label"] == "Equities" and capital["days"] == money_flow.MONTH
            weekly = client.get("/api/fundamental/money-flow", params={"period": "weekly"}).json()
            assert weekly["days"] == money_flow.WEEK
            for name in ("GLOBAL_macro_sectors.json", "GLOBAL_macro_countries.json",
                         "GLOBAL_macro_flows.json", "GLOBAL_macro_sector_flows.json"):
                (cache / name).unlink()
    finally:
        os.environ.pop("MK_PROVIDER", None)
