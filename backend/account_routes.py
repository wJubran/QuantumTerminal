"""
================================================================================
Quantum Terminal — Account & Calibration API Routes
================================================================================
FastAPI router for Layer 3 (Account Management + Risk Governor) and
Layer 2 (Calibration Store) endpoints.

Wired into data_server.py via:
    from account_routes import create_account_router
    app.include_router(create_account_router(broadcast_event))

Endpoints:
    # ── Account & Risk ──
    GET    /api/account/status           — equity, P&L, circuit breakers, halt status
    GET    /api/account/settings         — current trading settings (prop firm rules)
    PATCH  /api/account/settings         — update trading settings
    POST   /api/account/sync             — force MT5 equity sync
    POST   /api/account/reset-baseline   — reset baseline (initial balance + clear breakers)
    GET    /api/account/trades           — recent trade log (last 50)

    # ── Calibration ──
    GET    /api/calibration/summary      — universe calibration badge summary
    GET    /api/calibration/management   — unified management dashboard (freshness + calibration + flow + anchor)
    GET    /api/calibration/{ticker}     — full calibration report for one asset
    GET    /api/calibration/badges/{ticker} — badge lookup for all setups on one asset
    GET    /api/calibration/detail/{ticker}/{signal_type} — IS/OOS drill-down for one setup
    GET    /api/calibration/outcomes/{ticker}/{signal_type} — raw trade records for chart viz
    POST   /api/calibration/run/{ticker} — trigger backtest calibration for one asset
    POST   /api/calibration/run          — trigger universe calibration (background)
    GET    /api/calibration/status       — calibration job status

    # ── Governor ──
    GET    /api/governor/status          — risk governor status
    POST   /api/governor/check           — pre-trade check (dry run)

    # ── Walk-Forward (Phase 3I) ──
    POST   /api/wf/run/{ticker}          — trigger WF engine for one asset
    GET    /api/wf/status                — WF job status

    # ── Flow Calibration (Phase 3I) ──
    POST   /api/flow/calibrate/{ticker}  — trigger flow calibrator + validator
    GET    /api/flow/status              — flow calibration job status
================================================================================
"""

import json
import asyncio
import logging
import threading
from debug_subprocess import debug_popen as _debug_popen
from typing import Optional, Callable, Awaitable
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

log = logging.getLogger("account_routes")

PROJECT_ROOT = Path(__file__).resolve().parent


# ── Request models ──

class DebugConfigRequest(BaseModel):
    """Debug configuration update."""
    subprocess_debug: Optional[bool] = None


class SettingsUpdateRequest(BaseModel):
    """Partial settings update — only include fields to change."""
    account_size: Optional[float] = None
    max_daily_loss_pct: Optional[float] = None
    max_daily_profit_pct: Optional[float] = None
    max_total_drawdown_pct: Optional[float] = None
    max_trailing_drawdown_pct: Optional[float] = None
    max_open_positions: Optional[int] = None
    max_correlated_positions: Optional[int] = None
    risk_per_trade_pct: Optional[float] = None
    use_kelly: Optional[bool] = None
    kelly_fraction: Optional[float] = None
    min_calibration_grade: Optional[str] = None
    require_calibration: Optional[bool] = None
    trading_enabled: Optional[bool] = None
    # Auto Trading (Phase 3G)
    auto_trading_enabled: Optional[bool] = None
    auto_min_confidence: Optional[float] = None
    auto_min_grade: Optional[str] = None
    auto_max_daily_trades: Optional[int] = None
    auto_allowed_types: Optional[list] = None
    auto_allowed_tickers: Optional[list] = None
    auto_scan_interval: Optional[float] = None
    auto_log_only: Optional[bool] = None
    # Scheduler
    scheduler_enabled: Optional[bool] = None
    scheduler_weekly_enabled: Optional[bool] = None
    scheduler_weekly_day: Optional[int] = None
    scheduler_weekly_time: Optional[str] = None
    scheduler_daily_enabled: Optional[bool] = None
    scheduler_daily_time: Optional[str] = None
    scheduler_daily_skip_weekends: Optional[bool] = None
    scheduler_calc_before_weekly: Optional[bool] = None
    # Calibration
    calibration_workers: Optional[int] = None


class PreTradeCheckRequest(BaseModel):
    """Dry-run pre-trade check."""
    ticker: str
    direction: str         # "long" or "short"
    signal_type: str
    entry_price: float
    stop_loss: float
    target_price: float
    proposed_lots: float = 0.1


class CalibrationRunRequest(BaseModel):
    """Calibration run parameters."""
    lookback_months: int = 6
    mc_sims: int = 20000
    parallel_workers: int = 1  # CPU cores for sweep (1 = sequential)


# ── Router factory ──

def create_account_router(
    broadcast_event: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> APIRouter:
    """
    Create account/calibration API router.

    Lazy-loads AccountManager, RiskGovernor, CalibrationStore on first call
    to avoid import errors if modules aren't deployed yet.
    """
    router = APIRouter(tags=["account"])

    # ── Lazy singletons ──
    _cache = {}

    def _get_account_manager():
        if 'acct' not in _cache:
            try:
                from account_manager import get_account_manager
                _cache['acct'] = get_account_manager()
            except ImportError:
                raise HTTPException(503, "account_manager module not available")
        return _cache['acct']

    def _get_governor():
        if 'gov' not in _cache:
            try:
                from risk_governor import get_governor
                _cache['gov'] = get_governor()
            except ImportError:
                raise HTTPException(503, "risk_governor module not available")
        return _cache['gov']

    def _get_cal_store():
        if 'cal' not in _cache:
            try:
                from calibration_store import get_store
                _cache['cal'] = get_store()
            except ImportError:
                raise HTTPException(503, "calibration_store module not available")
        return _cache['cal']

    async def _notify(event_type: str, detail: str = ""):
        if broadcast_event:
            await broadcast_event({
                "type": "account_update",
                "detail": event_type,
                "message": detail,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    # ════════════════════════════════════════════════════════
    # DEBUG CONFIG — subprocess_debug flag
    # ════════════════════════════════════════════════════════

    _DEBUG_CONFIG_PATH = PROJECT_ROOT / "debug_config.json"

    def _load_debug_config() -> dict:
        """Load debug_config.json — returns defaults if missing."""
        try:
            if _DEBUG_CONFIG_PATH.exists():
                return json.loads(_DEBUG_CONFIG_PATH.read_text())
        except Exception:
            pass
        return {"subprocess_debug": False}

    def _save_debug_config(cfg: dict):
        try:
            _DEBUG_CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
        except Exception as e:
            log.warning(f"Failed to save debug_config.json: {e}")

    @router.get("/api/dev/debug-config")
    async def get_debug_config():
        """Get current debug configuration."""
        return _load_debug_config()

    @router.patch("/api/dev/debug-config")
    async def update_debug_config(payload: DebugConfigRequest):
        """
        Update debug configuration.
          subprocess_debug (bool) — open visible console windows for subprocesses
        """
        cfg = _load_debug_config()
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        cfg.update(updates)
        _save_debug_config(cfg)
        mode = "ON" if cfg.get("subprocess_debug") else "OFF"
        await _notify("debug_config_changed",
                      f"Subprocess debug mode: {mode} — takes effect on next calibration/WF run")
        return cfg

    # ════════════════════════════════════════════════════════
    # ACCOUNT & RISK ENDPOINTS
    # ════════════════════════════════════════════════════════

    @router.get("/api/account/status")
    async def get_account_status():
        """Full account status — equity, P&L, circuit breakers."""
        mgr = _get_account_manager()
        return mgr.get_status_dict()

    @router.get("/api/account/settings")
    async def get_account_settings():
        """Current trading settings."""
        mgr = _get_account_manager()
        return mgr.get_settings_dict()

    @router.patch("/api/account/settings")
    async def update_account_settings(req: SettingsUpdateRequest):
        """Update trading settings (partial — only include changed fields)."""
        mgr = _get_account_manager()
        # Build dict of non-None fields only
        updates = {k: v for k, v in req.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields to update")
        mgr.update_settings(updates)
        await _notify("settings_changed", f"Updated: {', '.join(updates.keys())}")
        return {"status": "ok", "updated": list(updates.keys()), "settings": mgr.get_settings_dict()}

    @router.post("/api/account/sync")
    async def force_mt5_sync():
        """Force MT5 equity sync."""
        mgr = _get_account_manager()
        success = await asyncio.to_thread(mgr.sync_from_mt5)
        if success:
            await _notify("mt5_sync", "Equity synced from MT5")
            return {"status": "ok", "equity": mgr.state.current_equity}
        else:
            return {"status": "failed", "message": "MT5 sync failed — check connection"}

    @router.post("/api/account/reset-baseline")
    async def reset_baseline():
        """
        Reset account baseline to current account_size.
        Clears all circuit breaker halts, resets initial_balance,
        peak_equity, and daily/weekly tracking.

        Call this after changing account_size or starting fresh.
        """
        mgr = _get_account_manager()
        mgr.reset_baseline()
        await _notify("baseline_reset", f"Baseline reset to ${mgr.state.initial_balance:,.2f}")
        return {
            "status": "ok",
            "initial_balance": mgr.state.initial_balance,
            "current_equity": mgr.state.current_equity,
            "peak_equity": mgr.state.peak_equity,
            "circuit_breakers_cleared": True,
        }

    @router.get("/api/account/trades")
    async def get_recent_trades():
        """Recent trade log (last 50)."""
        mgr = _get_account_manager()
        return {"trades": mgr.state.recent_trades}

    @router.get("/api/account/period-pnl")
    async def get_period_pnl(request: Request):
        """
        Real closed-trade P&L by period: today, yesterday, this_week,
        last_week, this_month, last_month. Each period: {pnl, trades, pct}.

        Sourced from the active hosted provider's closed-trade history when one
        is connected (the local-MetaTrader5 deal-log path is a no-op off a
        terminal); falls back to AccountManager.get_period_pnl() otherwise.
        """
        mgr = _get_account_manager()
        provider = getattr(request.app.state, "provider", None)
        if (provider is not None and getattr(provider, "connected", False)
                and hasattr(provider, "get_period_pnl")):
            equity = mgr.state.current_equity or mgr.state.initial_balance
            result = await asyncio.to_thread(provider.get_period_pnl, equity)
            if result is not None:
                return result
        return await asyncio.to_thread(mgr.get_period_pnl)

    # ════════════════════════════════════════════════════════
    # GOVERNOR ENDPOINTS
    # ════════════════════════════════════════════════════════

    @router.get("/api/governor/status")
    async def get_governor_status():
        """Full risk governor status."""
        gov = _get_governor()
        return gov.get_status()

    @router.post("/api/governor/check")
    async def pre_trade_check(req: PreTradeCheckRequest):
        """
        Dry-run pre-trade check — tests if a trade would be allowed
        without actually placing it. Useful for UI preview.
        """
        gov = _get_governor()

        # Build a mock signal object for the check
        class _MockSignal:
            pass
        sig = _MockSignal()
        sig.ticker = req.ticker.upper()

        class _Dir:
            value = req.direction.lower()
        class _Type:
            value = req.signal_type
        sig.direction = _Dir()
        sig.signal_type = _Type()
        sig.entry_price = req.entry_price
        sig.stop_loss = req.stop_loss
        sig.target_price = req.target_price

        allowed, reason = gov.pre_trade_check(sig, proposed_lots=req.proposed_lots)
        adjusted_lots = req.proposed_lots
        adjust_notes = ""
        if allowed:
            adjusted_lots, adjust_notes = gov.adjust_position_size(sig, req.proposed_lots)

        return {
            "allowed": allowed,
            "reason": reason,
            "adjusted_lots": round(adjusted_lots, 4),
            "adjust_notes": adjust_notes,
        }

    # ════════════════════════════════════════════════════════
    # CALIBRATION ENDPOINTS
    # ════════════════════════════════════════════════════════

    @router.get("/api/calibration/summary")
    async def get_calibration_summary():
        """Universe calibration badge summary — for dashboard display."""
        store = _get_cal_store()
        return store.get_universe_summary()

    @router.get("/api/calibration/management")
    async def get_calibration_management():
        """
        Unified management dashboard data — aggregates freshness, calibration,
        flow params, and entry confirmation status across all assets.

        Used by CalibrationDashboard.jsx (Phase 3I).
        """
        import asyncio as _aio

        # ── Universe ──
        try:
            from config_manager import ConfigManager
            cm = ConfigManager()
            universe = cm.get_active_universe()
        except Exception:
            try:
                from server_config import ASSET_UNIVERSE
                universe = list(ASSET_UNIVERSE)
            except Exception:
                universe = []

        # ── Freshness (all 9 data types × universe) ──
        freshness = {}
        try:
            from data_freshness import DataFreshnessMonitor
            monitor = DataFreshnessMonitor()
            for ticker in universe:
                tf = monitor.get_ticker_freshness(ticker)
                freshness[ticker] = tf.to_dict()
        except ImportError:
            log.warning("data_freshness not available for management endpoint")
        except Exception as e:
            log.warning(f"Freshness fetch failed: {e}")

        # ── Calibration badges ──
        calibration = {}
        try:
            store = _get_cal_store()
            calibration = store.get_universe_summary()
        except Exception as e:
            log.warning(f"Calibration summary failed: {e}")

        # ── Flow params status ──
        flow = {"calibrated": [], "missing": [], "details": {}}
        flow_path = PROJECT_ROOT / "flow_params.json"
        if flow_path.exists():
            try:
                with open(flow_path, "r") as f:
                    flow_data = json.load(f)
                for ticker in universe:
                    if ticker in flow_data:
                        flow["calibrated"].append(ticker)
                        fd = flow_data[ticker]
                        flow["details"][ticker] = {
                            "calibrated_at": fd.get("calibrated_at", ""),
                            "wf_score": fd.get("wf_score", 0),
                            "wf_variance": fd.get("wf_variance", 0),
                            "classify_method": fd.get("classify_method", ""),
                        }
                    else:
                        flow["missing"].append(ticker)
            except Exception as e:
                log.warning(f"Flow params read failed: {e}")
                flow["missing"] = universe[:]
        else:
            flow["missing"] = universe[:]

        # ── Anchor params status ──
        anchor = {"calibrated": [], "missing": [], "details": {}}
        anchor_path = PROJECT_ROOT / "anchor_params.json"
        if anchor_path.exists():
            try:
                with open(anchor_path, "r") as f:
                    anchor_data = json.load(f)
                for ticker in universe:
                    if ticker in anchor_data:
                        anchor["calibrated"].append(ticker)
                        ad = anchor_data[ticker]
                        anchor["details"][ticker] = {
                            "threshold": ad.get("anchor_distance_max_sd", ""),
                            "calibrated_at": ad.get("calibrated_at", ""),
                        }
                    else:
                        anchor["missing"].append(ticker)
            except Exception as e:
                log.warning(f"Anchor params read failed: {e}")
                anchor["missing"] = universe[:]
        else:
            anchor["missing"] = universe[:]

        # ── Entry confirmation edge (from calibration reports) ──
        entry_conf = {}
        for ticker in universe:
            ticker_cal = calibration.get(ticker, {})
            setups = ticker_cal.get("setups", {})
            edges = {}
            for sig_type, badge in setups.items():
                edge = badge.get("confirmation_edge", "unknown")
                edges[sig_type] = edge
            has_any = any(e != "unknown" for e in edges.values())
            entry_conf[ticker] = {
                "calibrated": has_any,
                "edges": edges,
            }

        # ── Source-of-truth reference ──
        sources = {
            "freshness": "data_freshness.py — 9 data types per asset",
            "calibration": "calibration_reports/*.json — backtest_engine output",
            "flow": "flow_params.json — flow_calibrator.py output",
            "wf_settings": "best_wf_settings.json — walk_forward_engine output",
            "anchor_params": "anchor_params.json — anchor_signal_backtester output",
        }

        return {
            "universe": universe,
            "freshness": freshness,
            "calibration": calibration,
            "flow": flow,
            "anchor": anchor,
            "entry_confirmation": entry_conf,
            "sources": sources,
        }

    # ── Calibration job tracking (must be before {ticker} routes) ──
    _running_jobs = {}  # ticker → {"status": "running"/"done"/"error", ...}
    _cancel_tokens = {}  # ticker → threading.Event (set = cancel)

    @router.get("/api/calibration/status")
    async def get_calibration_status():
        """Get calibration job status for all tickers."""
        return _running_jobs

    @router.post("/api/calibration/cancel/{ticker}")
    async def cancel_calibration_ticker(ticker: str):
        """Cancel a running calibration for one asset."""
        canonical = ticker.upper()
        token = _cancel_tokens.get(canonical)
        if token:
            token.set()
            if canonical in _running_jobs:
                _running_jobs[canonical]["status"] = "cancelled"
            log.info(f"Calibration cancel requested for {canonical}")
            return {"cancelled": True, "ticker": canonical}
        return {"cancelled": False, "reason": f"No running job for {canonical}"}

    @router.post("/api/calibration/cancel")
    async def cancel_calibration_all():
        """Cancel all running calibrations."""
        cancelled = []
        for ticker, token in _cancel_tokens.items():
            if not token.is_set():
                token.set()
                if ticker in _running_jobs:
                    _running_jobs[ticker]["status"] = "cancelled"
                cancelled.append(ticker)
        log.info(f"Calibration cancel all: {cancelled}")
        return {"cancelled": cancelled}

    @router.get("/api/calibration/badges/{ticker}")
    async def get_calibration_badges(ticker: str):
        """Badge lookup for all setups on one asset."""
        store = _get_cal_store()
        badges = store.get_all_badges(ticker.upper())
        if not badges:
            return {"ticker": ticker.upper(), "calibrated": False, "badges": {}}
        return {"ticker": ticker.upper(), "calibrated": True, "badges": badges}

    @router.get("/api/calibration/detail/{ticker}/{signal_type}")
    async def get_calibration_detail(ticker: str, signal_type: str):
        """
        Detailed IS/OOS breakdown for one signal type on one asset.
        Used by the calibration page drill-down.

        Returns: {
            ticker, signal_type,
            overall: { grade, score, win_rate, expectancy, ... },
            in_sample: { grade, score, win_rate, total, ... },
            out_of_sample: { grade, score, win_rate, total, ... },
            overfitting_risk, config, date_range, computed_at,
        }
        """
        store = _get_cal_store()
        detail = store.get_detail(ticker.upper(), signal_type)
        if detail is None:
            raise HTTPException(
                404,
                f"No calibration detail for {ticker.upper()} / {signal_type}"
            )
        return detail

    @router.get("/api/calibration/outcomes/{ticker}/{signal_type}")
    async def get_calibration_outcomes(ticker: str, signal_type: str):
        """
        Raw trade outcome records for one signal type on one asset.
        Used by the trade chart visualization in the calibration page.

        Returns: [
            { eval_date, direction, entry_price, stop_loss, target_price,
              exit_price, exit_date, outcome, r_multiple, is_oos,
              entry_confirmed, confirmation_pattern, ... },
            ...
        ]
        """
        store = _get_cal_store()
        outcomes = store.get_outcomes(ticker.upper(), signal_type)
        if outcomes is None:
            raise HTTPException(
                404,
                f"No outcome data for {ticker.upper()} / {signal_type}. "
                f"Re-run calibration to generate outcomes."
            )
        return outcomes

    @router.get("/api/calibration/{ticker}")
    async def get_calibration_report(ticker: str):
        """Full calibration report for one asset."""
        store = _get_cal_store()
        report = store.load_report(ticker.upper())
        if report is None:
            raise HTTPException(404, f"No calibration report for {ticker.upper()}")
        return report

    @router.post("/api/calibration/run/{ticker}")
    async def run_calibration_ticker(ticker: str, req: CalibrationRunRequest = None):
        """
        Trigger backtest calibration for one asset (runs in background thread).
        Returns immediately — poll /api/calibration/status for progress.
        """
        canonical = ticker.upper()

        if canonical in _running_jobs and _running_jobs[canonical].get("status") == "running":
            raise HTTPException(409, f"Calibration already running for {canonical}")

        if req is None:
            req = CalibrationRunRequest()

        _running_jobs[canonical] = {
            "status": "running",
            "ticker": canonical,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "pct": 0,
            "eval_date": "loading data...",
            "eval_num": 0,
            "eval_total": 0,
            "signals": 0,
            "wins": 0,
            "losses": 0,
            "elapsed_s": 0,
            "eta_s": 0,
        }

        # Create cancel token for this job
        cancel_token = threading.Event()
        _cancel_tokens[canonical] = cancel_token

        async def _run():
            try:
                from backtest_engine import BacktestEngine, BacktestConfig

                # Resolve parallel workers: request → account settings → default 1
                pw = req.parallel_workers
                if pw <= 1:
                    try:
                        mgr = _get_account_manager()
                        pw = mgr.get_settings_dict().get("calibration_workers", 1) or 1
                    except Exception:
                        pw = 1

                config = BacktestConfig(
                    mc_sims=req.mc_sims,
                    lookback_months=req.lookback_months,
                    parallel_workers=pw,
                )
                engine = BacktestEngine(config)

                def _on_progress(info):
                    """Update job status with live progress from engine."""
                    _running_jobs[canonical] = {
                        "status": "running",
                        "ticker": canonical,
                        "started_at": _running_jobs.get(canonical, {}).get("started_at", ""),
                        "pct": info.get("pct", 0),
                        "eval_date": info.get("eval_date", ""),
                        "eval_num": info.get("eval_num", 0),
                        "eval_total": info.get("eval_total", 0),
                        "signals": info.get("signals_so_far", 0),
                        "wins": info.get("wins_so_far", 0),
                        "losses": info.get("losses_so_far", 0),
                        "elapsed_s": info.get("elapsed_s", 0),
                        "eta_s": info.get("eta_s", 0),
                    }

                report = await asyncio.to_thread(
                    engine.run_with_atr_sweep, canonical,
                    lookback_months=req.lookback_months,
                    progress_callback=_on_progress,
                    cancel_token=cancel_token,
                )

                # Check if cancelled
                if cancel_token.is_set():
                    _running_jobs[canonical] = {
                        "status": "cancelled", "ticker": canonical,
                    }
                    log.info(f"Calibration cancelled for {canonical}")
                else:
                    # Save to store
                    store = _get_cal_store()
                    store.save_report(report)

                    _running_jobs[canonical] = {
                        "status": "done",
                        "ticker": canonical,
                        "overall_score": report.overall_score,
                        "overall_grade": report.overall_grade,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    }

                    await _notify("calibration_complete",
                                  f"{canonical}: {report.overall_grade} ({report.overall_score:.2f})")

            except Exception as e:
                log.error(f"Calibration failed for {canonical}: {e}", exc_info=True)
                _running_jobs[canonical] = {
                    "status": "error",
                    "ticker": canonical,
                    "error": str(e),
                }
            finally:
                _cancel_tokens.pop(canonical, None)

        asyncio.create_task(_run())
        return {"status": "started", "ticker": canonical}

    @router.post("/api/calibration/run")
    async def run_calibration_universe(req: CalibrationRunRequest = None):
        """
        Trigger calibration for the full universe (background).
        Returns immediately — poll /api/calibration/status.
        """
        if req is None:
            req = CalibrationRunRequest()

        # Get universe from config_manager
        try:
            from config_manager import ConfigManager
            cm = ConfigManager()
            tickers = cm.get_active_universe()
        except Exception:
            try:
                from server_config import ASSET_UNIVERSE
                tickers = list(ASSET_UNIVERSE)
            except Exception:
                raise HTTPException(500, "Cannot determine asset universe")

        # Mark all as running
        for t in tickers:
            _running_jobs[t] = {
                "status": "queued",
                "ticker": t,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "pct": 0,
                "eval_date": "",
                "eval_num": 0,
                "eval_total": 0,
                "signals": 0,
                "wins": 0,
                "losses": 0,
                "elapsed_s": 0,
                "eta_s": 0,
            }

        # Create a shared cancel token for the universe run
        universe_cancel = threading.Event()
        for t in tickers:
            _cancel_tokens[t] = universe_cancel

        async def _run_all():
            try:
                from backtest_engine import BacktestEngine, BacktestConfig

                # Resolve parallel workers: request → account settings → default 1
                pw = req.parallel_workers
                if pw <= 1:
                    try:
                        mgr = _get_account_manager()
                        pw = mgr.get_settings_dict().get("calibration_workers", 1) or 1
                    except Exception:
                        pw = 1

                config = BacktestConfig(
                    mc_sims=req.mc_sims,
                    lookback_months=req.lookback_months,
                    parallel_workers=pw,
                )
                engine = BacktestEngine(config)
                store = _get_cal_store()

                for i, ticker in enumerate(tickers):
                    # ── Cancel check between tickers ──
                    if universe_cancel.is_set():
                        for remaining in tickers[i:]:
                            _running_jobs[remaining] = {
                                "status": "cancelled", "ticker": remaining,
                            }
                        log.info(f"Universe calibration cancelled at ticker {i}/{len(tickers)}")
                        break

                    _running_jobs[ticker] = {
                        "status": "running",
                        "ticker": ticker,
                        "started_at": _running_jobs.get(ticker, {}).get("started_at", ""),
                        "pct": 0,
                        "eval_date": "loading data...",
                        "eval_num": 0,
                        "eval_total": 0,
                        "signals": 0,
                        "wins": 0,
                        "losses": 0,
                        "elapsed_s": 0,
                        "eta_s": 0,
                    }

                    def _make_cb(t):
                        """Create a closure-safe callback for this ticker."""
                        def _on_progress(info):
                            _running_jobs[t] = {
                                "status": "running",
                                "ticker": t,
                                "started_at": _running_jobs.get(t, {}).get("started_at", ""),
                                "pct": info.get("pct", 0),
                                "eval_date": info.get("eval_date", ""),
                                "eval_num": info.get("eval_num", 0),
                                "eval_total": info.get("eval_total", 0),
                                "signals": info.get("signals_so_far", 0),
                                "wins": info.get("wins_so_far", 0),
                                "losses": info.get("losses_so_far", 0),
                                "elapsed_s": info.get("elapsed_s", 0),
                                "eta_s": info.get("eta_s", 0),
                            }
                        return _on_progress

                    try:
                        report = await asyncio.to_thread(
                            engine.run_with_atr_sweep, ticker,
                            lookback_months=req.lookback_months,
                            progress_callback=_make_cb(ticker),
                            cancel_token=universe_cancel,
                        )

                        if universe_cancel.is_set():
                            _running_jobs[ticker] = {
                                "status": "cancelled", "ticker": ticker,
                            }
                        else:
                            store.save_report(report)
                            _running_jobs[ticker] = {
                                "status": "done",
                                "ticker": ticker,
                                "overall_score": report.overall_score,
                                "overall_grade": report.overall_grade,
                            }
                    except Exception as e:
                        _running_jobs[ticker] = {
                            "status": "error",
                            "ticker": ticker,
                            "error": str(e),
                        }

                if not universe_cancel.is_set():
                    await _notify("calibration_universe_complete",
                                  f"{len(tickers)} assets calibrated")

            except Exception as e:
                log.error(f"Universe calibration failed: {e}", exc_info=True)
            finally:
                for t in tickers:
                    _cancel_tokens.pop(t, None)

        asyncio.create_task(_run_all())
        return {"status": "started", "tickers": tickers}

    # ════════════════════════════════════════════════════════
    # AUTO EXECUTOR ENDPOINTS (Phase 3G)
    # ════════════════════════════════════════════════════════

    @router.get("/api/auto/status")
    async def get_auto_status():
        """Auto executor status — settings + today's activity."""
        mgr = _get_account_manager()
        settings = mgr.get_settings_dict()

        # Read today's trade count from auto log
        trades_today = 0
        signals_processed = 0
        auto_log_path = PROJECT_ROOT / "auto_executor_log.json"
        if auto_log_path.exists():
            try:
                with open(auto_log_path, "r") as f:
                    log_data = json.load(f)
                today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                for entry in reversed(log_data):
                    ts = entry.get("timestamp", "")
                    if not ts.startswith(today_str):
                        break
                    signals_processed += 1
                    if entry.get("action") in ("executed", "dry_run"):
                        trades_today += 1
            except Exception:
                pass

        return {
            "enabled": settings.get("auto_trading_enabled", False),
            "log_only_mode": settings.get("auto_log_only", True),
            "live_trading_on": mgr.settings.trading_enabled,
            "trades_today": trades_today,
            "signals_processed": signals_processed,
            "max_daily_trades": settings.get("auto_max_daily_trades", 5),
            "min_confidence": settings.get("auto_min_confidence", 0.60),
            "min_grade": settings.get("auto_min_grade", "C"),
            "allowed_types": settings.get("auto_allowed_types", []),
            "allowed_tickers": settings.get("auto_allowed_tickers", []) or "all",
            "scan_interval": settings.get("auto_scan_interval", 30.0),
        }

    @router.get("/api/auto/log")
    async def get_auto_log(limit: int = 50):
        """Recent auto executor actions (audit trail)."""
        auto_log_path = PROJECT_ROOT / "auto_executor_log.json"
        if not auto_log_path.exists():
            return {"actions": [], "count": 0}
        try:
            with open(auto_log_path, "r") as f:
                data = json.load(f)
            return {"actions": data[-limit:], "count": len(data)}
        except Exception:
            return {"actions": [], "count": 0}

    @router.get("/api/auto/log/summary")
    async def get_auto_log_summary(days: int = 30):
        """
        Performance summary from auto executor log.
        Aggregates by overall, per-ticker, per-signal-type, and per-ticker-type.
        """
        auto_log_path = PROJECT_ROOT / "auto_executor_log.json"
        if not auto_log_path.exists():
            return {"trades": 0, "summary": {}}
        try:
            with open(auto_log_path, "r") as f:
                all_data = json.load(f)
        except Exception:
            return {"trades": 0, "summary": {}}

        # Filter to requested time window
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        entries = [e for e in all_data
                   if e.get("action") in ("executed", "dry_run")
                   and e.get("timestamp", "") >= cutoff]

        if not entries:
            return {"trades": 0, "days": days, "summary": {}}

        # Build aggregations
        def _agg(subset):
            count = len(subset)
            tickers = list(set(e.get("ticker", "") for e in subset))
            types = list(set(e.get("signal_type", "") for e in subset))
            avg_conf = sum(e.get("confidence", 0) for e in subset) / count if count else 0
            avg_rr = sum(e.get("risk_reward", 0) for e in subset) / count if count else 0
            total_risk = sum(e.get("risk_usd", 0) for e in subset)
            avg_risk_pct = sum(e.get("risk_pct", 0) for e in subset) / count if count else 0
            grades = {}
            for e in subset:
                g = e.get("calibration_grade", "?")
                grades[g] = grades.get(g, 0) + 1
            regimes = {}
            for e in subset:
                r = e.get("regime", "?")
                regimes[r] = regimes.get(r, 0) + 1
            directions = {"long": 0, "short": 0}
            for e in subset:
                d = e.get("direction", "")
                if d in directions:
                    directions[d] += 1
            return {
                "count": count,
                "avg_confidence": round(avg_conf, 4),
                "avg_risk_reward": round(avg_rr, 2),
                "total_risk_usd": round(total_risk, 2),
                "avg_risk_pct": round(avg_risk_pct, 4),
                "grade_distribution": grades,
                "regime_distribution": regimes,
                "direction_split": directions,
                "tickers": tickers,
                "signal_types": types,
            }

        # Overall
        summary = {"overall": _agg(entries)}

        # Per ticker
        by_ticker = {}
        for e in entries:
            t = e.get("ticker", "?")
            by_ticker.setdefault(t, []).append(e)
        summary["by_ticker"] = {t: _agg(v) for t, v in by_ticker.items()}

        # Per signal type
        by_type = {}
        for e in entries:
            st = e.get("signal_type", "?")
            by_type.setdefault(st, []).append(e)
        summary["by_signal_type"] = {st: _agg(v) for st, v in by_type.items()}

        # Per ticker × signal type
        by_ticker_type = {}
        for e in entries:
            key = f"{e.get('ticker', '?')}|{e.get('signal_type', '?')}"
            by_ticker_type.setdefault(key, []).append(e)
        summary["by_ticker_type"] = {k: _agg(v) for k, v in by_ticker_type.items()}

        return {
            "trades": len(entries),
            "days": days,
            "summary": summary,
        }

    # ════════════════════════════════════════════════════════
    # TRADE MANAGER ENDPOINTS
    # ════════════════════════════════════════════════════════

    @router.get("/api/trade-manager/status")
    async def get_trade_manager_status():
        """Trade manager status — managed positions and modes."""
        try:
            from trade_manager import get_trade_manager
            tm = get_trade_manager()
            return tm.get_status()
        except ImportError:
            raise HTTPException(503, "trade_manager module not available")

    # ════════════════════════════════════════════════════════
    # WALK-FORWARD CALIBRATION (Phase 3I)
    # ════════════════════════════════════════════════════════

    _wf_jobs = {}  # ticker → {"status": "running"/"done"/"error", ...}

    @router.post("/api/wf/run/{ticker}")
    async def run_wf_ticker(ticker: str):
        """
        Trigger walk-forward engine for one asset (background subprocess).
        Calls: python walk_forward_engine.py --assets TICKER --sims 100000
        Writes to backtest_results/best_wf_settings.json (merge-on-save).
        Returns immediately — poll /api/wf/status for progress.
        """
        import subprocess
        canonical = ticker.upper()

        if canonical in _wf_jobs and _wf_jobs[canonical].get("status") == "running":
            raise HTTPException(409, f"WF already running for {canonical}")

        _wf_jobs[canonical] = {
            "status": "running",
            "ticker": canonical,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        async def _run():
            try:
                # Walk-forward engine is verbose — redirect to log file, not PIPE.
                cmd = [
                    "python", str(PROJECT_ROOT / "walk_forward_engine.py"),
                    "--assets", canonical,
                    "--sims", "100000",
                    "--step", "5",
                ]
                wf_log_path = PROJECT_ROOT / "flow_output" / f"wf_{canonical}.log"
                await _notify("wf_started",
                              f"Walk-forward engine started for {canonical}")

                def _wf_runner():
                    p = _debug_popen(cmd, label=f"wf_{canonical}")
                    p.wait(timeout=900)
                    return p
                proc = await asyncio.to_thread(_wf_runner)

                if proc.returncode == 0:
                    _wf_jobs[canonical] = {
                        "status": "done",
                        "ticker": canonical,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "wf_log": str(wf_log_path),
                    }
                    await _notify("wf_done",
                                  f"Walk-forward complete for {canonical} — best_wf_settings.json updated")
                    log.info(f"WF completed for {canonical}")
                else:
                    tail = f"See subprocess_logs/wf_{canonical}.log" 
                    _wf_jobs[canonical] = {
                        "status": "error",
                        "ticker": canonical,
                        "error": tail,
                    }
                    await _notify("wf_error",
                                  f"Walk-forward FAILED for {canonical} — check flow_output/wf_{canonical}.log")
                    log.error(f"WF failed for {canonical} (log: {wf_log_path})")
            except subprocess.TimeoutExpired:
                _wf_jobs[canonical] = {
                    "status": "error", "ticker": canonical,
                    "error": "Timed out after 900s",
                }
            except Exception as e:
                _wf_jobs[canonical] = {
                    "status": "error", "ticker": canonical,
                    "error": str(e),
                }

        asyncio.create_task(_run())
        return {"status": "started", "ticker": canonical}

    @router.get("/api/wf/status")
    async def get_wf_status():
        """Walk-forward job status for all tickers."""
        return _wf_jobs

    # ════════════════════════════════════════════════════════
    # FLOW CALIBRATION (Phase 3I)
    # ════════════════════════════════════════════════════════

    _flow_jobs = {}  # ticker → {"status": "running"/"done"/"error", ...}

    @router.post("/api/flow/calibrate/{ticker}")
    async def run_flow_calibrate_ticker(ticker: str):
        """
        Trigger flow_calibrator.py for one asset (background subprocess).
        Updates flow_params.json for this ticker, then validates via
        flow_confirmation.py CLI diagnostic.
        Returns immediately — poll /api/flow/status for progress.
        """
        import subprocess
        canonical = ticker.upper()

        if canonical in _flow_jobs and _flow_jobs[canonical].get("status") == "running":
            raise HTTPException(409, f"Flow calibration already running for {canonical}")

        _flow_jobs[canonical] = {
            "status": "running",
            "ticker": canonical,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "phase": "calibrating",
        }

        async def _run():
            try:
                # Phase 1: Run flow_calibrator.py for this ticker
                # IMPORTANT: flow_calibrator produces massive output (1944-combo grid search +
                # GPU progress bars). capture_output=True / PIPE deadlocks when the pipe buffer
                # fills (~64 KB on Windows). Redirect stdout+stderr to a log file instead.
                # Rule: Use DEVNULL/file not PIPE for verbose subprocesses.
                cal_cmd = [
                    "python", str(PROJECT_ROOT / "flow_calibrator.py"),
                    canonical,
                ]
                _flow_jobs[canonical]["phase"] = "calibrating"
                await _notify("flow_calibration_started",
                              f"Flow calibration started for {canonical} — GPU grid search running")

                def _cal_runner():
                    p = _debug_popen(cal_cmd, label=f"flow_calibrator_{canonical}")
                    p.wait(timeout=900)
                    return p
                proc = await asyncio.to_thread(_cal_runner)

                if proc.returncode != 0:
                    # Read tail of log for error context
                    tail = f"See subprocess_logs/flow_calibrator_{canonical}.log" 
                    _flow_jobs[canonical] = {
                        "status": "error", "ticker": canonical,
                        "phase": "calibration_failed",
                        "error": tail,
                    }
                    await _notify("flow_calibration_error",
                                  f"Flow calibration FAILED for {canonical} — check flow_output/calibrate_{canonical}.log")
                    log.error(f"Flow calibration failed for {canonical} (log: {cal_log_path})")
                    return

                # Phase 2: Run flow_confirmation.py CLI diagnostic to validate.
                # Validator output is small (~50 lines) — PIPE is safe here.
                _flow_jobs[canonical]["phase"] = "validating"
                await _notify("flow_validation_started",
                              f"Flow calibration complete for {canonical} — running validator")
                val_cmd = [
                    "python", str(PROJECT_ROOT / "flow_confirmation.py"),
                    canonical,
                ]
                val_proc = await asyncio.to_thread(
                    subprocess.run, val_cmd,
                    cwd=str(PROJECT_ROOT),
                    capture_output=True, text=True, timeout=120,
                    env={**__import__("os").environ, "PYTHONUTF8": "1"},
                )

                _flow_jobs[canonical] = {
                    "status": "done",
                    "ticker": canonical,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "validation_output": val_proc.stdout[-1000:] if val_proc.stdout else "",
                }
                await _notify("flow_calibration_done",
                              f"Flow calibration + validation complete for {canonical} — flow_params.json updated")
                log.info(f"Flow calibration + validation complete for {canonical}")

            except subprocess.TimeoutExpired:
                _flow_jobs[canonical] = {
                    "status": "error", "ticker": canonical,
                    "error": "Timed out after 900s",
                }
                await _notify("flow_calibration_error",
                              f"Flow calibration TIMED OUT for {canonical} (>900s)")
            except Exception as e:
                _flow_jobs[canonical] = {
                    "status": "error", "ticker": canonical,
                    "error": str(e),
                }
                await _notify("flow_calibration_error",
                              f"Flow calibration ERROR for {canonical}: {e}")

        asyncio.create_task(_run())
        return {"status": "started", "ticker": canonical}

    @router.get("/api/flow/status")
    async def get_flow_status():
        """Flow calibration job status for all tickers."""
        return _flow_jobs

    return router