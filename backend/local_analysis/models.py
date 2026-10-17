# version: v2
"""
Return-distribution models behind the locally computed volatility cones.

Each model answers one question: given the daily closes before an anchor,
what are the quantiles of the log return after `tau` trading days?

    GBM    normal log returns, constant volatility          (closed form)
    MJD    GBM plus Poisson jumps with normal sizes          (exact mixture)
    Bates  Heston stochastic variance plus the same jumps    (Monte Carlo)

All three have a zero expected log return, so the median stays near the
anchor price and the models differ in how wide and how skewed the spread is.
Time is counted in trading days and every parameter is per trading day.

The cone lines are the ±1/2/3 sigma quantiles of that distribution:
sd1 ≈ p15.9 / p84.1, sd2 ≈ p2.3 / p97.7, sd3 ≈ p0.13 / p99.87.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Optional, Sequence

import numpy as np

Z_LEVELS = np.array([-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0])

MIN_RETURNS = 40        # fewer daily returns than this → no estimate
LOOKBACK = 250          # daily returns used, about one trading year
JUMP_SIGMAS = 3.0       # |return − median| beyond this many running sigmas is a jump
JUMP_SEED = 20          # returns that seed the running sigma of the jump test
VAR_HALF_LIFE = 20.0    # trading days for variance to revert halfway to its mean
EWMA_LAMBDA = 0.94      # RiskMetrics decay for the current variance
RV_BLOCK = 20           # trading days per realized-variance sample (vol of vol)
RHO_BLOCK = 5           # trading days per block for the return/variance correlation
BATES_PATHS = 25_000
BATES_MAX_STEP = 0.25   # longest Monte Carlo step, in trading days
REPLAY_PATHS = 10_000   # Bates paths for the Replay page's archived cones and bands
REPLAY_STEP = 0.5       # and their longest step


def norm_cdf(x) -> np.ndarray:
    """Standard normal CDF, vectorized (Abramowitz & Stegun 7.1.26, |error| < 1e-7)."""
    x = np.asarray(x, dtype=float)
    z = np.abs(x) / math.sqrt(2.0)
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741
                + t * (-1.453152027 + t * 1.061405429))))
    erf = 1.0 - poly * np.exp(-z * z)
    return 0.5 * (1.0 + np.sign(x) * erf)


PROBS = norm_cdf(Z_LEVELS)


@dataclass(frozen=True)
class Params:
    """Per-trading-day parameters estimated from daily closes."""
    sigma: float      # diffusive volatility of log returns
    lam: float        # jump intensity (jumps per trading day)
    mu_j: float       # mean log jump size
    sigma_j: float    # standard deviation of the log jump size
    v0: float         # current variance (Bates starting point)
    theta: float      # long-run variance (Bates)
    kappa: float      # speed of variance mean reversion (Bates)
    xi: float         # volatility of variance (Bates)
    rho: float        # correlation of return and variance shocks (Bates)
    n_returns: int

    def as_dict(self) -> dict:
        return {k: (float(f"{v:.6g}") if isinstance(v, float) else v) for k, v in asdict(self).items()}


def jump_mask(r: np.ndarray) -> np.ndarray:
    """True for the returns that count as jumps: further than JUMP_SIGMAS
    running sigmas from the median.

    The running sigma is an EWMA (RiskMetrics λ) of the earlier squared
    deviations, seeded with the robust sigma (1.4826 × MAD) of the first
    JUMP_SEED returns. Every return updates it, capped at the threshold. So a
    lasting rise in volatility is absorbed within days instead of turning the
    whole new regime into "jumps", while an isolated outlier barely moves it.
    """
    r = np.asarray(r, dtype=float)
    dev = r - float(np.median(r))
    s0 = 1.4826 * float(np.median(np.abs(dev[:JUMP_SEED])))
    if s0 <= 0:
        s0 = float(np.std(dev))
    mask = np.zeros(r.size, dtype=bool)
    if s0 <= 0:
        return mask
    v = s0 * s0
    for t, d in enumerate(dev):
        lim2 = JUMP_SIGMAS * JUMP_SIGMAS * v
        mask[t] = d * d > lim2
        v = EWMA_LAMBDA * v + (1.0 - EWMA_LAMBDA) * min(d * d, lim2)
    return mask


def estimate(closes: Sequence[float]) -> Optional[Params]:
    """Estimate every model's parameters from the closes before an anchor.

    Jumps are the returns jump_mask() flags, relative to the volatility of
    their time; at least two are needed to estimate a jump size, else the
    jump part is off. The diffusive volatility comes from the remaining
    returns. Bates: v0 is their EWMA variance, theta their plain variance,
    kappa a fixed 20-day half-life, xi matches the dispersion of 20-day
    realized variances (Var[v] = theta·xi²/2kappa for a CIR variance), and rho
    is the correlation of 5-day returns with the next change in realized
    variance. Returns None when there is too little data.
    """
    c = np.asarray(closes, dtype=float)[-(LOOKBACK + 1):]
    c = c[np.isfinite(c) & (c > 0)]
    r = np.diff(np.log(c))
    if r.size < MIN_RETURNS:
        return None

    if float(np.std(r)) <= 0:
        return None                     # a flat price series has no spread to model
    is_jump = jump_mask(r)
    jumps, diffusive = r[is_jump], r[~is_jump]
    sigma = float(np.std(diffusive, ddof=1))
    if not np.isfinite(sigma) or sigma <= 0:
        return None
    if jumps.size >= 2:
        lam, mu_j, sigma_j = jumps.size / r.size, float(np.mean(jumps)), float(np.std(jumps, ddof=1))
    else:
        lam, mu_j, sigma_j = 0.0, 0.0, 0.0

    theta = sigma * sigma
    kappa = math.log(2.0) / VAR_HALF_LIFE
    v = theta
    for x in diffusive:
        v = EWMA_LAMBDA * v + (1.0 - EWMA_LAMBDA) * x * x
    v0 = float(v)

    xi = 0.0
    blocks = diffusive.size // RV_BLOCK
    if blocks >= 3:
        rv = (diffusive[-blocks * RV_BLOCK:] ** 2).reshape(blocks, RV_BLOCK).mean(axis=1)
        xi = math.sqrt(max(0.0, 2.0 * kappa * float(np.var(rv, ddof=1)) / theta))
    xi = min(xi, 2.0 * math.sqrt(2.0 * kappa * theta))   # at most twice the Feller bound

    rho = 0.0
    blocks = diffusive.size // RHO_BLOCK
    if blocks >= 12:
        b = diffusive[-blocks * RHO_BLOCK:].reshape(blocks, RHO_BLOCK)
        ret, rv = b.sum(axis=1), (b ** 2).mean(axis=1)
        if np.std(ret[:-1]) > 0 and np.std(np.diff(rv)) > 0:
            rho = float(np.clip(np.corrcoef(ret[:-1], np.diff(rv))[0, 1], -0.9, 0.9))

    return Params(sigma=sigma, lam=lam, mu_j=mu_j, sigma_j=sigma_j, v0=v0, theta=theta,
                  kappa=kappa, xi=xi, rho=rho, n_returns=int(r.size))


def gbm_quantiles(p: Params, tau) -> np.ndarray:
    """Log-return quantiles at each tau (trading days): shape (len(tau), 7)."""
    tau = np.asarray(tau, dtype=float)
    return np.sqrt(np.maximum(tau, 0.0))[:, None] * p.sigma * Z_LEVELS[None, :]


def mjd_quantiles(p: Params, tau) -> np.ndarray:
    """Exact quantiles of the Merton mixture, by bisection on its CDF.

    After tau days the log return is σ·W(tau) plus N ~ Poisson(λ·tau) normal
    jumps, minus λ·tau·μ_J so its mean is zero:
        F(x) = Σ_n Pois(n; λτ) · Φ((x + λτμ_J − nμ_J) / √(σ²τ + nσ_J²))
    All horizons are solved together; Poisson terms beyond each horizon's own
    10-sigma cut-off are dropped.
    """
    tau = np.asarray(tau, dtype=float)
    if p.lam <= 0:
        return gbm_quantiles(p, tau)
    out = np.zeros((tau.size, Z_LEVELS.size))
    live = tau > 0
    if not live.any():
        return out
    t = tau[live]
    m = p.lam * t                                                   # (T,)
    n = np.arange(int(m.max() + 10.0 * math.sqrt(m.max()) + 10.0) + 1, dtype=float)
    lgam = np.array([math.lgamma(k + 1.0) for k in n])
    w = np.exp(-m[:, None] + n[None, :] * np.log(m)[:, None] - lgam[None, :])   # (T, N)
    w[n[None, :] > (m + 10.0 * np.sqrt(m) + 10.0)[:, None]] = 0.0
    w /= w.sum(axis=1, keepdims=True)
    mean = (n[None, :] - m[:, None]) * p.mu_j                                  # (T, N)
    sd = np.sqrt(p.sigma ** 2 * t[:, None] + n[None, :] * p.sigma_j ** 2)      # (T, N)
    lo = np.repeat((mean.min(axis=1) - 12.0 * sd.max(axis=1))[:, None], Z_LEVELS.size, axis=1)
    hi = np.repeat((mean.max(axis=1) + 12.0 * sd.max(axis=1))[:, None], Z_LEVELS.size, axis=1)
    for _ in range(80):
        mid = 0.5 * (lo + hi)                                                  # (T, 7)
        z = (mid[:, :, None] - mean[:, None, :]) / sd[:, None, :]
        cdf = (w[:, None, :] * norm_cdf(z)).sum(axis=2)
        below = cdf < PROBS[None, :]
        lo, hi = np.where(below, mid, lo), np.where(below, hi, mid)
    out[live] = 0.5 * (lo + hi)
    return out


def bates_quantiles(p: Params, tau, seed: int, n_paths: int = BATES_PATHS,
                    max_step: float = BATES_MAX_STEP) -> np.ndarray:
    """Monte Carlo quantiles of the Bates model (Heston variance + Merton jumps).

    Full-truncation Euler steps of at most `max_step` trading days. The
    same paths are read at every tau, so the cone is smooth in time; `seed`
    makes the result reproducible. The Replay page's archives use fewer
    paths and longer steps than the live overlays (REPLAY_PATHS, REPLAY_STEP).
    """
    tau = np.asarray(tau, dtype=float)
    rng = np.random.default_rng(seed)
    x = np.zeros(n_paths)
    v = np.full(n_paths, p.v0)
    shock_v = math.sqrt(max(0.0, 1.0 - p.rho ** 2))
    out = np.zeros((tau.size, Z_LEVELS.size))
    done = 0.0
    for i, t in enumerate(tau):
        if t > done:
            k = max(1, math.ceil((t - done) / max_step - 1e-9))
            h = (t - done) / k
            for _ in range(k):
                z1 = rng.standard_normal(n_paths)
                z2 = rng.standard_normal(n_paths)
                vp = np.maximum(v, 0.0)
                x += np.sqrt(vp * h) * z1
                if p.lam > 0:
                    nj = rng.poisson(p.lam * h, n_paths)
                    hit = nj > 0
                    if hit.any():
                        x[hit] += nj[hit] * p.mu_j + np.sqrt(nj[hit]) * p.sigma_j * rng.standard_normal(int(hit.sum()))
                    x -= p.lam * h * p.mu_j
                v = v + p.kappa * (p.theta - vp) * h + p.xi * np.sqrt(vp * h) * (p.rho * z1 + shock_v * z2)
            done = t
        if t > 0:
            out[i] = np.quantile(x, PROBS)
    return out


def quantiles(model: str, p: Params, tau, seed: int = 0, archive: bool = False) -> np.ndarray:
    """Log-return quantiles of `model`. archive=True: the cheaper Monte Carlo
    settings used for the Replay page's files."""
    if model == "gbm":
        return gbm_quantiles(p, tau)
    if model == "mjd":
        return mjd_quantiles(p, tau)
    if model == "bates":
        if archive:
            return bates_quantiles(p, tau, seed, n_paths=REPLAY_PATHS, max_step=REPLAY_STEP)
        return bates_quantiles(p, tau, seed)
    raise ValueError(f"unknown model {model!r}")
