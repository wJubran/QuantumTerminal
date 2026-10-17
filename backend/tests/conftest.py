"""
Shared test setup.

Several backend modules resolve AppData / home-directory paths at import
time, so every user-data location is pointed at a throwaway sandbox *before*
any of them is imported — tests never touch a real profile.
"""

import os
import sys
import tempfile
from pathlib import Path

_SANDBOX = Path(tempfile.mkdtemp(prefix="qt-tests-"))
os.environ["HOME"] = str(_SANDBOX)
os.environ["USERPROFILE"] = str(_SANDBOX)
os.environ["APPDATA"] = str(_SANDBOX / "AppData" / "Roaming")
os.environ["MK_USER_DATA_DIR"] = str(_SANDBOX / "Documents" / "Quantum Terminal")
os.environ.pop("MK_PROVIDER", None)
os.environ["MK_UPDATE_CHECK"] = "0"   # never call the GitHub API from tests

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
