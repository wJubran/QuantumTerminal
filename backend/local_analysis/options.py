# version: v1
"""
The OPTIONS QUANT page's file, {T}_options.json, from public ETF option
chains (Yahoo Finance through yfinance, no key, quotes delayed ~15 min):

    US500 ← SPY   USTEC ← QQQ   XAUUSD ← GLD   XAGUSD ← SLV   XTIUSD ← USO

- Expiries: today's (0-DTE, until 16:00 New York), the next eight after
  today ("swing") and the next two monthly (third-Friday) expiries.
- Implied vols: Yahoo's, cleaned (out-of-range values and its power-of-two
  failure values are dropped) and turned into one smile per expiry from the
  out-of-the-money side, so calls and puts at a strike share one vol.
- GEX: dealers long calls and short puts, $ of underlying per 1% move
  (options_math). Flip = price where total swing GEX changes sign.
- Dealer delta (dealer_heatmap, dealer_scenarios): shares of the ETF
  (x100 multiplier). dealer_delta at a strike = how much the dealers' delta
  would change if price went there; negative means they would be buying.
- Prices are written in the chart's own price space ("levels_space":
  "broker"): every ETF level is multiplied by broker price / ETF price, both
  taken at the time of the ETF quote. Only gex_*.aggregate.strikes stay in
  ETF strikes, with the ratio in cfd_ratio_used, as the UI expects.
- structural_integrity / volatility_gravity are the UI's own derivations
  (frontend/src/lib/options_0dte_derivations.js), ported line for line.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence

import numpy as np

from . import options_math as om

log = logging.getLogger("qt.local_analysis.options")

ASSETS = {"US500": "SPY", "USTEC": "QQQ", "XAUUSD": "GLD", "XAGUSD": "SLV", "XTIUSD": "USO"}
SWING_EXPIRIES = 8
MONTHLIES = 2
BAND = 0.20                 # strikes kept within ±20% of spot
IV_LO, IV_HI = 0.03, 3.0
HISTORY_CAP = 96
SWING_ENTROPY_CUTS = (0.30, 0.15)     # ORDERED / MODERATE thresholds for the open-interest score
YEAR = 365.0 * 86400.0


# ── New York clock ──────────────────────────────────────────────────────────

def et_offset(utc: datetime) -> timedelta:
    """New York's UTC offset at a naive UTC time (US rules since 2007)."""
    y = utc.year
    start = datetime(y, 3, 8 + (6 - datetime(y, 3, 8).weekday()) % 7, 7)      # 2nd Sunday of March, 2am EST
    end = datetime(y, 11, 1 + (6 - datetime(y, 11, 1).weekday()) % 7, 6)      # 1st Sunday of November, 2am EDT
    return timedelta(hours=-4) if start <= utc < end else timedelta(hours=-5)


def to_et(utc: datetime) -> datetime:
    return utc + et_offset(utc)


def close_utc(day: date) -> datetime:
    """16:00 New York on `day`, as naive UTC."""
    return datetime(day.year, day.month, day.day, 16) - et_offset(datetime(day.year, day.month, day.day, 20))


def market_open(utc: datetime) -> bool:
    et = to_et(utc)
    return et.weekday() < 5 and (9, 30) <= (et.hour, et.minute) < (16, 0)


def session_start(utc: datetime) -> datetime:
    """The latest weekday 09:30 New York at or before `utc` (naive UTC)."""
    et = to_et(utc)
    d = et.date()
    for _ in range(8):
        start = datetime(d.year, d.month, d.day, 9, 30) - et_offset(datetime(d.year, d.month, d.day, 14))
        if d.weekday() < 5 and start <= utc:
            return start
        d -= timedelta(days=1)
    return utc - timedelta(days=7)


def select_expiries(expiries: Sequence[str], now: datetime) -> List[str]:
    """Today's expiry (until the close), the next SWING_EXPIRIES and the next MONTHLIES monthlies."""
    today = to_et(now).date()
    days = sorted({date.fromisoformat(e) for e in expiries})
    future = [d for d in days if d > today]
    chosen = set(future[:SWING_EXPIRIES])
    chosen |= set([d for d in future if d.weekday() == 4 and 15 <= d.day <= 21][:MONTHLIES])
    if today in days and now < close_utc(today):
        chosen.add(today)
    return [d.isoformat() for d in sorted(chosen)]


# ── Download ────────────────────────────────────────────────────────────────

def download_chain(etf: str, now: Optional[datetime] = None) -> Optional[dict]:
    """The chain in the shape build() reads (Yahoo's own field names)."""
    import yfinance as yf
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    t = yf.Ticker(etf)
    chains, quote = {}, {}
    for e in select_expiries(list(t.options), now):
        oc = t.option_chain(e)
        if oc.calls is None:
            continue
        chains[e] = {"calls": oc.calls.to_dict("records"), "puts": oc.puts.to_dict("records")}
        quote = oc.underlying or quote
    if not chains:
        return None
    hist = t.history(period="3mo", interval="1d", auto_adjust=False)
    closes = [float(c) for c in hist["Close"].tolist() if c == c and c > 0] if hist is not None else []
    return {"spot": quote.get("regularMarketPrice"), "time": quote.get("regularMarketTime"),
            "open": quote.get("regularMarketOpen"), "closes": closes, "chains": chains}


# ── Math helpers ────────────────────────────────────────────────────────────

def _ncdf(x):
    """Standard normal CDF (Abramowitz-Stegun 7.1.26, |error| < 1.5e-7)."""
    x = np.asarray(x, float)
    z = np.abs(x) / math.sqrt(2.0)
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
    erf = 1.0 - poly * np.exp(-z * z)
    return 0.5 * (1.0 + np.sign(x) * erf)


def _d1(s, k, t, iv):
    t = np.maximum(t, om.MIN_T_YEARS)
    with np.errstate(divide="ignore", invalid="ignore"):
        return (np.log(s / k) + 0.5 * iv * iv * t) / (iv * np.sqrt(t))


def dealer_delta(chain: om.Chain, spots) -> np.ndarray:
    """Dealers' delta in shares (long calls, short puts) if the ETF were at each of `spots`."""
    use = chain.usable
    k, t, iv, oi, call = chain.strike[use], chain.t[use], chain.iv[use], chain.oi[use], chain.is_call[use]
    out = []
    for s in np.atleast_1d(spots):
        nd1 = _ncdf(_d1(float(s), k, t, iv))
        delta = np.where(call, nd1, nd1 - 1.0)
        out.append(float(np.sum(np.where(call, 1.0, -1.0) * delta * oi * om.MULTIPLIER)))
    return np.array(out)


def _bs(s, k, t, iv, call: bool) -> float:
    t = max(t, om.MIN_T_YEARS)
    d1 = float(_d1(s, k, t, iv))
    d2 = d1 - iv * math.sqrt(t)
    c = s * float(_ncdf(d1)) - k * float(_ncdf(d2))
    return c if call else c - s + k


def _jsround(v: float, d: int) -> float:
    """JavaScript's Math.round(v * 10^d) / 10^d."""
    f = 10.0 ** d
    return math.floor(v * f + 0.5) / f


def _r(v, d: int = 2):
    return None if v is None or not math.isfinite(float(v)) else round(float(v), d)


def _num(v) -> float:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return float("nan")
    return v if math.isfinite(v) else float("nan")


def _iso(t: datetime) -> str:
    return t.replace(microsecond=0).isoformat() + "Z"


def _clean(o):
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return float(o) if math.isfinite(o) else None
    if isinstance(o, np.integer):
        return int(o)
    return o


# ── The chain ───────────────────────────────────────────────────────────────

def _table(rows: Sequence[dict]) -> Dict[str, np.ndarray]:
    get = {name: np.array([_num(r.get(key)) for r in rows], float) for name, key in
           (("strike", "strike"), ("bid", "bid"), ("ask", "ask"), ("volume", "volume"),
            ("oi", "openInterest"), ("iv", "impliedVolatility"))}
    ok = np.isfinite(get["strike"]) & (get["strike"] > 0)
    return {k: v[ok] for k, v in get.items()}


def _valid_iv(iv: np.ndarray) -> np.ndarray:
    ok = np.isfinite(iv) & (iv >= IV_LO) & (iv <= IV_HI)
    with np.errstate(divide="ignore", invalid="ignore"):
        p2 = np.log2(np.where(ok, iv, 1.0))
    return ok & (np.abs(p2 - np.round(p2)) > 1e-9)          # Yahoo's failed solves: 0.5, 0.25, 0.125, …


class Expiry:
    def __init__(self, day: str, calls: dict, puts: dict, spot: float, now: datetime):
        self.day = day
        self.t = (close_utc(date.fromisoformat(day)) - now).total_seconds() / YEAR
        otm_k = np.concatenate([calls["strike"][calls["strike"] >= spot], puts["strike"][puts["strike"] < spot]])
        otm_iv = np.concatenate([calls["iv"][calls["strike"] >= spot], puts["iv"][puts["strike"] < spot]])
        ok = _valid_iv(otm_iv)
        order = np.argsort(otm_k[ok])
        self.smile_k, self.smile_iv = otm_k[ok][order], otm_iv[ok][order]
        self.calls, self.puts = calls, puts

    @property
    def usable(self) -> bool:
        return self.t > 0 and self.smile_k.size >= 3

    def iv(self, k) -> np.ndarray:
        return np.interp(np.asarray(k, float), self.smile_k, self.smile_iv)

    def chain(self) -> om.Chain:
        k = np.concatenate([self.calls["strike"], self.puts["strike"]])
        oi = np.nan_to_num(np.concatenate([self.calls["oi"], self.puts["oi"]]))
        n = k.size
        return om.Chain(strike=k, is_call=np.arange(n) < self.calls["strike"].size, oi=oi, iv=self.iv(k),
                        t=np.full(n, self.t), expiry=np.full(n, self.day))

    def volume(self, call: bool) -> float:
        return float(np.nansum((self.calls if call else self.puts)["volume"]))

    def oi(self, call: bool) -> float:
        return float(np.nansum((self.calls if call else self.puts)["oi"]))


def _concat(chains: Sequence[om.Chain]) -> Optional[om.Chain]:
    if not chains:
        return None
    return om.Chain(*(np.concatenate([getattr(c, f) for c in chains])
                      for f in ("strike", "is_call", "oi", "iv", "t", "expiry")))


def _on_grid(chain: om.Chain, spot: float, grid: np.ndarray):
    """(call, put) GEX summed per grid strike."""
    g = om.contract_gex(chain, spot)
    idx = np.searchsorted(grid, chain.strike)
    hit = (idx < grid.size) & (grid[np.minimum(idx, grid.size - 1)] == chain.strike)
    call = np.bincount(idx[hit], weights=np.where(chain.is_call, g, 0.0)[hit], minlength=grid.size)
    put = np.bincount(idx[hit], weights=np.where(chain.is_call, 0.0, g)[hit], minlength=grid.size)
    return call, put


# ── The UI's derivations, ported from options_0dte_derivations.js ───────────

TIERS = [
    (0.60, math.inf, "Reinforced Concrete", "🏗️", "Maximum"),
    (0.30, 0.60, "Steel Beam", "🔩", "Strong"),
    (0.10, 0.30, "Reinforced", "🧱", "Moderate"),
    (0.00, 0.10, "Plywood", "🪵", "Light"),
    (-0.15, 0.00, "Thin Ice", "🧊", "None"),
    (-0.50, -0.15, "Glass Floor", "💎", "Amplified"),
    (-math.inf, -0.50, "Free Fall", "🕳️", "Extreme ↓"),
]


def _window(strikes: List[float], spot: float, n: int):
    spot_idx = int(np.argmin([abs(s - spot) for s in strikes]))
    lo = max(0, spot_idx - n // 2)
    hi = min(len(strikes), lo + n)
    return max(0, hi - n), hi


def structural_integrity(strikes: Sequence[float], net_gex: Sequence[float], spot: float,
                         ratio: float = 1.0, n: int = 21) -> dict:
    if not strikes or len(strikes) != len(net_gex):
        return {"spot": spot, "levels": []}
    ks = [s * ratio for s in strikes]
    diffs = [b - a for a, b in zip(ks, ks[1:])]
    spacing = float(np.median(diffs)) if diffs else 1.0
    lo, hi = _window(ks, spot, n)
    sel_k, sel_g = ks[lo:hi], list(net_gex[lo:hi])
    abs_max = max([1e-6] + [abs(g) for g in sel_g])
    levels = []
    for k, g in zip(sel_k, sel_g):
        x = g / abs_max
        tier = next((t for t in TIERS if t[0] <= x < t[1]), TIERS[-1])
        levels.append({"strike": _jsround(k, 2), "gex": _jsround(g, 2), "gex_norm": _jsround(x, 3),
                       "hardness": tier[2], "icon": tier[3], "friction": tier[4],
                       "is_spot": abs(k - spot) < spacing * 0.6,
                       "color": "#00c853" if x > 0.10 else "#ffab00" if x > -0.15 else "#f44336"})
    return {"spot": _jsround(spot, 2), "levels": levels}


def volatility_gravity(strikes: Sequence[float], net_gex: Sequence[float], dd_strikes: Sequence[float],
                       dd: Sequence[float], spot: float, ratio: float = 1.0, n: int = 18) -> dict:
    if len(strikes) < 3 or len(strikes) != len(net_gex):
        return {"spot": spot, "levels": []}
    ks = [s * ratio for s in strikes]
    lo, hi = _window(ks, spot, n)
    sel_k, sel_g = ks[lo:hi], list(net_gex[lo:hi])
    abs_max = max([1e-6] + [abs(g) for g in sel_g])
    have = len(dd_strikes) > 1 and len(dd) == len(dd_strikes)
    sel_dd = list(np.interp(sel_k, dd_strikes, dd, left=0.0, right=0.0)) if have else [0.0] * len(sel_k)
    grad = list(np.gradient(sel_dd)) if len(sel_dd) > 1 else [0.0] * len(sel_dd)
    levels = []
    for k, g, d, gr in zip(sel_k, sel_g, sel_dd, grad):
        x = g / abs_max
        if x > 0.15 and abs(d) > abs_max * 0.10:
            kind, color, desc = "magnet", "#00d4ff", "Dealers absorb moves here — expect chop and mean-reversion"
        elif x < -0.15:
            kind = "spring"
            color = "#00c853" if d < 0 else "#f44336"
            desc = ("Dealers amplify moves — expect violent bounce up" if d < 0
                    else "Dealers amplify moves — expect breakdown")
        elif abs(gr) > abs_max * 0.30:
            kind, color, desc = "spring", "#f44336", "Dealer-delta sign flip — expect violent move"
        else:
            kind, color, desc = "magnet", "#00d4ff", "Mild absorption — minor pinning"
        levels.append({"strike": _jsround(k, 2), "gex": _jsround(g, 2), "gex_norm": _jsround(x, 3),
                       "dealer_delta": _jsround(float(d), 2), "type": kind, "label": kind.upper(),
                       "icon": "🧲" if kind == "magnet" else "🚀", "color": color, "desc": desc,
                       "strength": min(100, math.floor(abs(x) * 100))})
    return {"spot": _jsround(spot, 2), "levels": levels}


# ── Blocks ──────────────────────────────────────────────────────────────────

def _gex_block(exps: Sequence[Expiry], spot: float, ratio: float, at: str, label) -> Optional[dict]:
    chains = [e.chain() for e in exps]
    allk = np.unique(np.concatenate([c.strike for c in chains]))
    grid = allk[(allk >= spot * (1 - BAND)) & (allk <= spot * (1 + BAND))]
    if grid.size < 3:
        return None
    layers, call_sum, put_sum = [], np.zeros(grid.size), np.zeros(grid.size)
    for i, (e, c) in enumerate(zip(exps, chains)):
        call, put = _on_grid(c, spot, grid)
        call_sum += call
        put_sum += put
        layers.append({"label": label(i), "expiry": e.day, "T_years": _r(e.t, 5),
                       "net_gex": [_r(v) for v in call + put]})
    net = call_sum + put_sum
    total = float(net.sum())
    regime = "POSITIVE" if total >= 0 else "NEGATIVE"
    return {"grid": grid, "call": call_sum, "put": put_sum, "chain": _concat(chains),
            "block": {"computed_at": at, "strikes": [_r(k * ratio) for k in grid], "layers": layers,
                      "aggregate": {"computed_at": at, "strikes": [_r(k, 4) for k in grid],
                                    "net_gex": [_r(v) for v in net], "net_total_gex": _r(total),
                                    "regime": regime}}}


def _dealer(chain: om.Chain, spot: float, ratio: float, grid: np.ndarray, at: str) -> dict:
    base = dealer_delta(chain, [spot])[0]
    dd = dealer_delta(chain, grid) - base
    flows = {m: float(-(dealer_delta(chain, [spot * (1 + m / 100.0)])[0] - base)) for m in (1.0, -1.0, 0.5, -0.5)}
    sells = sum(-f for m, f in flows.items() if abs(m) == 1.0 and f < 0)
    buys = sum(f for m, f in flows.items() if abs(m) == 1.0 and f > 0)
    asym = min(9.99, sells / buys) if buys > 0 else (9.99 if sells > 0 else 1.0)
    spring = "DOWNSIDE" if asym > 1.3 else "UPSIDE" if asym < 0.7 else "NEUTRAL"
    scenarios = [{"move_pct": m, "target_price": _r(spot * ratio * (1 + m / 100.0)),
                  "direction": "BUY" if f > 0 else "SELL", "forced_flow": _r(f, 0)} for m, f in flows.items()]
    return {"heatmap": {"computed_at": at, "strikes": [_r(k * ratio) for k in grid],
                        "dealer_delta": [_r(v, 0) for v in dd],
                        "net_dealer_delta": _r(-(flows[1.0] + flows[-1.0]), 0)},
            "scenarios": {"computed_at": at, "scenarios": scenarios, "asymmetry_ratio": round(asym, 2),
                          "spring_direction": spring}}


def _expected_move(e: Expiry, spot: float, ratio: float, at: str) -> dict:
    ks = np.unique(np.concatenate([e.calls["strike"], e.puts["strike"]]))
    k0 = float(ks[np.argmin(np.abs(ks - spot))])

    def mid(tab):
        i = np.nonzero(tab["strike"] == k0)[0]
        if i.size and tab["bid"][i[0]] > 0 and tab["ask"][i[0]] >= tab["bid"][i[0]]:
            return 0.5 * (tab["bid"][i[0]] + tab["ask"][i[0]])
        return None
    c, p = mid(e.calls), mid(e.puts)
    iv0 = float(e.iv(k0))
    straddle = (c + p) if c is not None and p is not None else _bs(spot, k0, e.t, iv0, True) + _bs(spot, k0, e.t, iv0, False)
    return {"computed_at": at, "expiry": e.day, "atm_strike": _r(k0 * ratio), "straddle": _r(straddle * ratio),
            "move_up": _r((spot + straddle) * ratio), "move_down": _r((spot - straddle) * ratio),
            "pct": _r(straddle / spot * 100.0, 2)}


def _skew(e: Expiry, spot: float, ratio: float, at: str, previous: Optional[dict], now: datetime) -> dict:
    k = np.linspace(spot * 0.6, spot * 1.4, 801)
    iv = e.iv(k)
    cd = _ncdf(_d1(spot, k, e.t, iv))
    kc = float(np.interp(-0.25, -cd, k))            # call delta falls from 1 to 0 with strike
    kp = float(np.interp(0.25, 1.0 - cd, k))        # put delta falls from 0 to -1: -put delta rises
    atm, c25, p25 = float(e.iv(spot)), float(e.iv(kc)), float(e.iv(kp))
    skew = p25 - c25
    vel = {"velocity": None, "velocity_bps_hr": None, "verdict": "UNKNOWN"}
    if previous and previous.get("expiry") == e.day and isinstance(previous.get("skew"), (int, float)):
        try:
            hours = (now - datetime.fromisoformat(str(previous["computed_at"]).rstrip("Z"))).total_seconds() / 3600
        except (KeyError, ValueError):
            hours = 0.0
        if 5 / 60 <= hours <= 3:
            per_hr = (skew - previous["skew"]) / hours
            bps = per_hr * 1e4
            side = "PUTS" if per_hr > 0 else "CALLS"
            verdict = f"{side}_ACCELERATING" if abs(bps) > 2.0 else f"{side}_BUILDING" if abs(bps) > 0.5 else "STABLE"
            vel = {"velocity": _r(per_hr * 100, 4), "velocity_bps_hr": _r(bps, 2), "verdict": verdict}
        elif hours > 3:
            vel["verdict"] = "STALE_PREV_SNAPSHOT"
    return {"computed_at": at, "expiry": e.day, "atm_iv": _r(atm, 4), "put_25d_iv": _r(p25, 4),
            "call_25d_iv": _r(c25, 4), "skew": _r(skew, 4), "skew_pct": _r(skew / atm * 100.0, 1),
            "atm_strike": _r(spot * ratio), "put_25d_strike": _r(kp * ratio), "call_25d_strike": _r(kc * ratio),
            "expiry_dte": max(0, (date.fromisoformat(e.day) - to_et(now).date()).days),
            "expiry_class": "front_non_0dte", "velocity": vel}


def _iv30(exps: Sequence[Expiry], spot: float) -> Optional[float]:
    pts = sorted((e.t, float(e.iv(spot)) ** 2 * e.t) for e in exps if e.t > 1 / 365)
    if not pts:
        return None
    t30 = 30 / 365
    ts, ws = [p[0] for p in pts], [p[1] for p in pts]
    if t30 >= ts[-1]:
        return math.sqrt(ws[-1] / ts[-1])
    return math.sqrt(max(float(np.interp(t30, [0.0] + ts, [0.0] + ws)), 0.0) / t30)


def _entropy(chain: om.Chain, spot: float, ratio: float, grid: np.ndarray, weights=None, cuts=(0.6, 0.35)):
    """Gamma concentration across strikes vs an even spread of open interest: 1 = all
    on one strike, 0 = as spread out as an even spread."""
    use = chain.usable
    g = om.bs_gamma(spot, chain.strike, chain.t, np.where(use, chain.iv, 0.0))
    w = chain.oi if weights is None else weights
    idx = np.searchsorted(grid, chain.strike)
    hit = (idx < grid.size) & (grid[np.minimum(idx, grid.size - 1)] == chain.strike) & use

    def spread(mass):
        m = np.bincount(idx[hit], weights=mass[hit], minlength=grid.size)
        tot = m.sum()
        if tot <= 0:
            return None, None
        p = m / tot
        return float(np.exp(-np.sum(p[p > 0] * np.log(p[p > 0])))), p
    n_eff, p = spread(g * w)
    n_ref, _ = spread(g)
    if n_eff is None or n_ref is None:
        return None
    score = max(0.0, min(1.0, 1.0 - n_eff / n_ref))
    top = np.argsort(p)[::-1]
    return {"score": round(score, 3), "state": "ORDERED" if score >= cuts[0] else "MODERATE" if score >= cuts[1] else "CHAOTIC",
            "top_strike": _r(grid[top[0]] * ratio), "concentration_top5": _r(p[top[:5]].sum() * 100, 1),
            "n_strikes": int((p > 0).sum())}


def _history(prev: Optional[dict], key: str, value, now: datetime, live: bool) -> list:
    start = session_start(now)
    out = []
    for pt in (prev or {}).get(key) or []:
        try:
            if datetime.fromisoformat(str(pt["t"]).rstrip("Z")) >= start:
                out.append(pt)
        except (KeyError, TypeError, ValueError):
            continue
    if live and value is not None:
        out.append({"t": _iso(now), "v": value})
    return out[-HISTORY_CAP:]


# ── The file ────────────────────────────────────────────────────────────────

def build(canonical: str, etf: str, data: dict, ratio: float, now: datetime,
          previous: Optional[dict] = None) -> Optional[dict]:
    """{T}_options.json from one chain download; None when it can't give levels."""
    spot = _num(data.get("spot"))
    if not (spot > 0 and ratio > 0 and math.isfinite(ratio)):
        return None
    exps = []
    for day, sides in sorted((data.get("chains") or {}).items()):
        e = Expiry(day, _table(sides.get("calls") or []), _table(sides.get("puts") or []), spot, now)
        if e.usable:
            exps.append(e)
    today = to_et(now).date().isoformat()
    zero = [e for e in exps if e.day == today]
    swing = [e for e in exps if e.day > today]
    if not swing:
        return None
    at, live, prev = _iso(now), market_open(now), previous or {}
    sw = _gex_block(swing, spot, ratio, at, lambda i: f"GEX{i + 1}")
    if sw is None:
        return None
    grid, chain = sw["grid"], sw["chain"]
    front = swing[0]
    flip = om.gamma_flip(chain, spot)
    calls_up = np.where(grid >= spot, sw["call"], 0.0)
    puts_dn = np.where(grid <= spot, sw["put"], 0.0)
    gross = sw["call"] - sw["put"]
    call_rank = [i for i in np.argsort(calls_up)[::-1][:3] if calls_up[i] > 0]
    put_rank = [i for i in np.argsort(puts_dn)[:3] if puts_dn[i] < 0]
    dealer = _dealer(chain, spot, ratio, grid, at)
    em = _expected_move(front, spot, ratio, at)
    skew = _skew(front, spot, ratio, at, prev.get("iv_skew"), now)
    skew["skew_pct_history"] = _history(prev.get("iv_skew"), "skew_pct_history", skew["skew_pct"], now, live)

    closes = [c for c in (data.get("closes") or []) if c and c > 0][-31:]
    rv = float(np.std(np.diff(np.log(closes)), ddof=1) * math.sqrt(252)) if len(closes) >= 11 else None
    iv30 = _iv30(swing, spot)
    div = iv30 - rv if iv30 is not None and rv is not None else None
    signal = (None if div is None else "FADE_FAVORED" if div > 0.05 else "SLIGHTLY_RICH" if div > 0.02
              else "BREAKOUT_FAVORED" if div < -0.05 else "SLIGHTLY_CHEAP" if div < -0.02 else "NEUTRAL")
    ivd = {"computed_at": at, "iv_atm": _r(iv30, 4), "realized_vol": _r(rv, 4), "divergence": _r(div, 4),
           "signal": signal, "atm_strike": _r(spot * ratio)}
    ivd["divergence_history"] = _history(prev.get("iv_divergence"), "divergence_history", ivd["divergence"], now, live)

    every = zero + swing
    oi_c, oi_p = sum(e.oi(True) for e in every), sum(e.oi(False) for e in every)
    v_c, v_p = sum(e.volume(True) for e in every), sum(e.volume(False) for e in every)

    def sentiment(x):
        return None if x is None else "BEARISH" if x > 1.2 else "BULLISH" if x < 0.8 else "NEUTRAL"
    oi_ratio = oi_p / oi_c if oi_c > 0 else None
    vol_ratio = v_p / v_c if v_c > 0 else None
    pc = {"computed_at": at, "oi_ratio": _r(oi_ratio, 3), "vol_ratio": _r(vol_ratio, 3),
          "oi_sentiment": sentiment(oi_ratio), "vol_sentiment": sentiment(vol_ratio)}
    pc["oi_ratio_history"] = _history(prev.get("pc_ratio"), "oi_ratio_history", pc["oi_ratio"], now, live)

    agg = sw["block"]["aggregate"]
    s_b = spot * ratio
    scen = dealer["scenarios"]
    scen["asymmetry_ratio_history"] = _history((prev.get("sauce") or {}).get("dealer_scenarios"),
                                               "asymmetry_ratio_history", scen["asymmetry_ratio"], now, live)
    # Open interest is far more evenly spread than volume: on the five ETFs' live chains
    # (16 Oct 2026) the open-interest score ran 0.05-0.35 and the volume score 0.25-0.50.
    ent = _entropy(chain, spot, ratio, grid, cuts=SWING_ENTROPY_CUTS)
    short = [e for e in every if e.t <= 7 / 365]
    vol_chain = _concat([e.chain() for e in short])
    vols = (np.nan_to_num(np.concatenate([np.concatenate([e.calls["volume"], e.puts["volume"]]) for e in short]))
            if short else None)
    intra = _entropy(vol_chain, spot, ratio, grid, vols) if vol_chain is not None and vols.sum() > 0 else None
    entropy = {"computed_at": at, "methodology": "gamma concentration vs an even spread of open interest"}
    if ent:
        entropy.update(entropy=round(1.0 - ent["score"], 3), state=ent["state"],
                       color={"ORDERED": "#00c853", "MODERATE": "#ffab00"}.get(ent["state"], "#f44336"),
                       swing={"score": ent["score"], "state": ent["state"], "computed_at": at},
                       n_strikes=ent["n_strikes"], top_strike=ent["top_strike"],
                       concentration_top5=ent["concentration_top5"])
    entropy["intraday"] = ({"score": intra["score"], "state": intra["state"], "computed_at": at} if intra
                           else {"score": None, "state": "UNKNOWN", "computed_at": at})

    payload = {
        "format_version": "2.4-local", "canonical": canonical, "cboe_ticker": etf, "levels_space": "broker",
        "cfd_ratio_used": round(ratio, 6), "spot": _r(s_b, 4), "spot_etf": _r(spot, 4),
        "computed_at": at, "cached_at": at, "market_open": live,
        "is_stale": bool(live and data.get("time") and (now - datetime.fromtimestamp(
            float(data["time"]), timezone.utc).replace(tzinfo=None)).total_seconds() > 1800),
        "expiry": front.day, "swing_expiry": front.day, "expiries": [e.day for e in every],
        "gex_flip": _r(flip * ratio) if flip else None, "gex_flip_computed_at": at,
        "max_pain": _r(om.max_pain(front.chain()) * ratio) if om.max_pain(front.chain()) else None,
        "max_pain_computed_at": at,
        "hvl": _r(grid[int(np.argmax(gross))] * ratio) if gross.max() > 0 else None, "hvl_computed_at": at,
        "walls": {"primary_call_wall": _r(grid[call_rank[0]] * ratio) if call_rank else None,
                  "primary_put_wall": _r(grid[put_rank[0]] * ratio) if put_rank else None,
                  "call_walls": [{"strike": _r(grid[i] * ratio), "gex": _r(calls_up[i])} for i in call_rank],
                  "put_walls": [{"strike": _r(grid[i] * ratio), "gex": _r(puts_dn[i])} for i in put_rank]},
        "gex": {"computed_at": at, "strikes": sw["block"]["strikes"], "net_gex": agg["net_gex"],
                "net_total_gex": agg["net_total_gex"], "regime": agg["regime"]},
        "gex_stack": sw["block"],
        "dealer_heatmap": dealer["heatmap"],
        "expected_move": em,
        "iv_skew": skew,
        "iv_divergence": ivd,
        "pc_ratio": pc,
        "sauce": {
            "dealer_scenarios": scen,
            "structural_integrity": {"computed_at": at, **structural_integrity(agg["strikes"], agg["net_gex"], s_b, ratio)},
            "volatility_gravity": {"computed_at": at, **volatility_gravity(
                agg["strikes"], agg["net_gex"], dealer["heatmap"]["strikes"], dealer["heatmap"]["dealer_delta"], s_b, ratio)},
            "market_entropy": entropy,
        },
        "gex_0dte": None, "gex_flip_0dte": None, "dealer_heatmap_0dte": None, "expected_move_0dte": None,
        "iv_skew_0dte": None, "sauce_0dte": None,
    }
    z = _gex_block(zero, spot, ratio, at, lambda i: "0DTE") if zero else None
    if z is not None:
        zf = om.gamma_flip(z["chain"], spot)
        zd = _dealer(z["chain"], spot, ratio, z["grid"], at)
        em0 = _expected_move(zero[0], spot, ratio, at)
        em0["straddle_history"] = _history(prev.get("expected_move_0dte"), "straddle_history", em0["straddle"], now, live)
        sk0 = {"computed_at": at, "skew": _r(float(zero[0].iv(spot * 0.995) - zero[0].iv(spot * 1.005)), 4)}
        sk0["skew_pct_history"] = _history(prev.get("iv_skew_0dte"), "skew_pct_history", sk0["skew"], now, live)
        payload.update(gex_0dte=z["block"], gex_flip_0dte=_r(zf * ratio) if zf else None,
                       dealer_heatmap_0dte={k: zd["heatmap"][k] for k in ("computed_at", "strikes", "dealer_delta")},
                       expected_move_0dte=em0, iv_skew_0dte=sk0, sauce_0dte={"dealer_scenarios": zd["scenarios"]})
    return _clean(payload)
