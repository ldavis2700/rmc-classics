"""Verify actual JavaScript purchase/account boundaries without a native store."""
from pathlib import Path
import subprocess


def test_iap_session_runtime():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "--experimental-vm-modules", "--test", "tests/iap-session-runtime.cjs"],
        cwd=root, text=True, capture_output=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
