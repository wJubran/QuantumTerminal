"""Local analysis engine: volatility cones computed from the active feed's
daily bars, written to the analysis cache the chart already reads."""

from .runner import create_local_analysis_task, enabled, update_ticker  # noqa: F401
