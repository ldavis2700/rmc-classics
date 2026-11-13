"""Validate the signed-build RevenueCat Android key gate."""

import hashlib
import os
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/verify_android_revenuecat_key.py"


class AndroidRevenueCatKeyTests(unittest.TestCase):
    def run_gate(self, value=None):
        environment = os.environ.copy()
        environment.pop("REACT_APP_REVENUECAT_ANDROID_KEY", None)
        if value is not None:
            environment["REACT_APP_REVENUECAT_ANDROID_KEY"] = value
        return subprocess.run(
            [sys.executable, str(SCRIPT)], cwd=ROOT, env=environment,
            capture_output=True, text=True,
        )

    def test_accepts_android_public_key_and_prints_only_fingerprint(self):
        key = "goog_public-test-key"
        result = self.run_gate(key)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(key, result.stdout)
        self.assertEqual(
            result.stdout.strip(),
            "android_revenuecat_key_sha256=" + hashlib.sha256(key.encode()).hexdigest(),
        )

    def test_rejects_missing_ios_and_whitespace_bearing_keys(self):
        for value in (
            None,
            "",
            "goog_",
            "appl_wrong-platform",
            "goog_bad key",
            " goog_key",
            "goog_bad\x1fkey",
            "goog_" + ("x" * 508),
        ):
            with self.subTest(value=value):
                self.assertNotEqual(self.run_gate(value).returncode, 0)


if __name__ == "__main__":
    unittest.main()
