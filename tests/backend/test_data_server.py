import sys
import os
from pathlib import Path
import pytest
from unittest.mock import MagicMock

# 1. Ensure project root is in sys.path so 'backend' can be imported
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# 2. Mock external dependencies that might trigger complex side effects on import
sys.modules["debug_subprocess"] = MagicMock()
sys.modules["account_routes"] = MagicMock()
sys.modules["periodic_sync"] = MagicMock()
sys.modules["data_sync_client"] = MagicMock()

# Now import the app
from backend.data_server import app

def test_app_is_initialized():
    """Verify that the FastAPI app object exists and is configured."""
    assert app is not None
    assert hasattr(app, "routes")
    # Verify the app title or name if applicable
    assert app.title is not None