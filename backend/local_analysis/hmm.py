# version: v1
"""
Gaussian hidden Markov model with diagonal covariances, in numpy.

Fitted by Baum-Welch (EM) from several deterministic starting points; the
best log-likelihood wins. Everything runs in log space, so long daily series
don't underflow.

Two kinds of state probabilities:
    filtered   P(state_t | x_1..x_t)    uses only the past — what was knowable on day t
    smoothed   P(state_t | x_1..x_T)    uses the whole sample, future included

Anything shown as "the regime on day t" uses the filtered probabilities, so a
past day is never labelled with knowledge of what came after it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

VAR_FLOOR = 1e-3        # fraction of each feature's overall variance a state's variance can't go below
TRANS_FLOOR = 1e-6      # keeps every transition possible, so no state becomes absorbing


@dataclass(frozen=True)
class HMM:
    startprob: np.ndarray   # (K,)
    transmat: np.ndarray    # (K, K), rows sum to 1
    means: np.ndarray       # (K, D)
    variances: np.ndarray   # (K, D)
    loglik: float           # log-likelihood of the sample it was fitted on

    @property
    def n_states(self) -> int:
        return self.startprob.size

    def reorder(self, order) -> "HMM":
        """The same model with its states permuted (new state i = old state order[i])."""
        o = np.asarray(order)
        return HMM(self.startprob[o], self.transmat[np.ix_(o, o)], self.means[o],
                   self.variances[o], self.loglik)

    def expected_duration(self) -> np.ndarray:
        """Average number of steps a visit to each state lasts: 1 / (1 - p_ii)."""
        stay = np.clip(np.diag(self.transmat), 0.0, 1.0 - 1e-12)
        return 1.0 / (1.0 - stay)

    def stationary(self) -> np.ndarray:
        """Long-run share of time in each state."""
        w, v = np.linalg.eig(self.transmat.T)
        p = np.real(v[:, np.argmin(np.abs(w - 1.0))])
        p = np.abs(p)
        return p / p.sum()


def _logsumexp(a: np.ndarray, axis: int) -> np.ndarray:
    m = np.max(a, axis=axis, keepdims=True)
    m = np.where(np.isfinite(m), m, 0.0)
    return np.squeeze(m, axis=axis) + np.log(np.sum(np.exp(a - m), axis=axis))


def _log_emission(x: np.ndarray, means: np.ndarray, variances: np.ndarray) -> np.ndarray:
    """log N(x_t | mean_k, diag(var_k)) for every t and k → (T, K)."""
    diff = x[:, None, :] - means[None, :, :]
    return -0.5 * (np.sum(diff * diff / variances[None], axis=2)
                   + np.sum(np.log(2.0 * np.pi * variances), axis=1)[None, :])


def _forward(log_b: np.ndarray, log_pi: np.ndarray, log_a: np.ndarray) -> np.ndarray:
    T, K = log_b.shape
    alpha = np.empty((T, K))
    alpha[0] = log_pi + log_b[0]
    for t in range(1, T):
        alpha[t] = log_b[t] + _logsumexp(alpha[t - 1][:, None] + log_a, axis=0)
    return alpha


def _backward(log_b: np.ndarray, log_a: np.ndarray) -> np.ndarray:
    T, K = log_b.shape
    beta = np.zeros((T, K))
    for t in range(T - 2, -1, -1):
        beta[t] = _logsumexp(log_a + (log_b[t + 1] + beta[t + 1])[None, :], axis=1)
    return beta


def _as_2d(x) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    return x[:, None] if x.ndim == 1 else x


def filtered(model: HMM, x) -> np.ndarray:
    """P(state_t | x_1..x_t) for every t → (T, K). Uses no future data."""
    x = _as_2d(x)
    alpha = _forward(_log_emission(x, model.means, model.variances),
                     np.log(model.startprob), np.log(model.transmat))
    return np.exp(alpha - _logsumexp(alpha, axis=1)[:, None])


def smoothed(model: HMM, x) -> np.ndarray:
    """P(state_t | x_1..x_T) for every t → (T, K). Uses the whole sample."""
    x = _as_2d(x)
    log_b = _log_emission(x, model.means, model.variances)
    log_a = np.log(model.transmat)
    alpha = _forward(log_b, np.log(model.startprob), log_a)
    beta = _backward(log_b, log_a)
    g = alpha + beta
    return np.exp(g - _logsumexp(g, axis=1)[:, None])


def viterbi(model: HMM, x) -> np.ndarray:
    """Most likely state sequence (uses the whole sample) → (T,) ints."""
    x = _as_2d(x)
    log_b = _log_emission(x, model.means, model.variances)
    log_a = np.log(model.transmat)
    T, K = log_b.shape
    delta = np.log(model.startprob) + log_b[0]
    back = np.zeros((T, K), dtype=int)
    for t in range(1, T):
        cand = delta[:, None] + log_a
        back[t] = np.argmax(cand, axis=0)
        delta = cand[back[t], np.arange(K)] + log_b[t]
    path = np.empty(T, dtype=int)
    path[-1] = int(np.argmax(delta))
    for t in range(T - 1, 0, -1):
        path[t - 1] = back[t, path[t]]
    return path


def _initial_params(x: np.ndarray, k: int, rng: np.random.Generator, attempt: int):
    """Attempt 0 splits the sample into k quantile bands of its first feature
    (states ordered from calm to wild when that feature is a volatility);
    later attempts start from random distinct observations."""
    T, D = x.shape
    var = np.var(x, axis=0) + 1e-12
    if attempt == 0:
        order = np.argsort(x[:, 0], kind="stable")
        groups = np.array_split(order, k)
        means = np.array([x[g].mean(axis=0) for g in groups])
        variances = np.array([np.var(x[g], axis=0) + VAR_FLOOR * var for g in groups])
    else:
        means = x[rng.choice(T, size=k, replace=False)]
        variances = np.tile(var, (k, 1))
    stay = 0.95
    trans = np.full((k, k), (1.0 - stay) / max(k - 1, 1))
    np.fill_diagonal(trans, stay if k > 1 else 1.0)
    return np.full(k, 1.0 / k), trans, means, variances


def fit(x, n_states: int, seed: int = 0, restarts: int = 4, n_iter: int = 200,
        tol: float = 1e-6) -> Optional[HMM]:
    """Baum-Welch from `restarts` starting points; the best log-likelihood wins.
    None when the sample is too short for the number of states."""
    x = _as_2d(x)
    T, D = x.shape
    k = int(n_states)
    if k < 1 or T < 10 * k * (D + 1):
        return None
    floor = VAR_FLOOR * (np.var(x, axis=0) + 1e-12)
    rng = np.random.default_rng(seed)
    best: Optional[HMM] = None
    for attempt in range(max(1, restarts)):
        pi, a, mu, var = _initial_params(x, k, rng, attempt)
        prev = -np.inf
        for _ in range(n_iter):
            log_b = _log_emission(x, mu, var)
            log_a = np.log(a)
            alpha = _forward(log_b, np.log(pi), log_a)
            beta = _backward(log_b, log_a)
            ll = float(_logsumexp(alpha[-1], axis=0))
            g = np.exp(alpha + beta - ll)                                    # (T, K)
            xi = np.exp(alpha[:-1, :, None] + log_a[None] + (log_b[1:] + beta[1:])[:, None, :] - ll)
            w = g.sum(axis=0) + 1e-300
            pi = np.clip(g[0], 1e-12, None)
            pi /= pi.sum()
            a = xi.sum(axis=0) + TRANS_FLOOR
            a /= a.sum(axis=1, keepdims=True)
            mu = (g.T @ x) / w[:, None]
            var = np.maximum((g.T @ (x * x)) / w[:, None] - mu * mu, floor)
            if ll - prev < tol * max(1.0, abs(ll)):
                break
            prev = ll
        log_b = _log_emission(x, mu, var)
        ll = float(_logsumexp(_forward(log_b, np.log(pi), np.log(a))[-1], axis=0))
        if np.isfinite(ll) and (best is None or ll > best.loglik):
            best = HMM(pi, a, mu, var, ll)
    return best
