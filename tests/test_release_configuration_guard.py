"""Execute the actual Codemagic release configuration block without providers."""

import os
from pathlib import Path
import subprocess
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "codemagic.yaml").read_text()
GATE = "      - name: Validate monetization release configuration\n"
BLOCK = CONFIG.split(GATE, 1)[1].split("      - name:", 1)[0]
SCRIPT = textwrap.dedent(BLOCK.split("        script: |\n", 1)[1])


class ReleaseConfigurationGuardTests(unittest.TestCase):
    def run_gate(self, app_id=None, sdk_key=None):
        env = {k: v for k, v in os.environ.items() if k not in (
            "APP_STORE_APPLE_ID", "REACT_APP_REVENUECAT_IOS_KEY")}
        if app_id is not None:
            env["APP_STORE_APPLE_ID"] = app_id
        if sdk_key is not None:
            env["REACT_APP_REVENUECAT_IOS_KEY"] = sdk_key
        return subprocess.run(["bash", "-c", SCRIPT], env=env,
                              text=True, capture_output=True)

    def test_gate_precedes_dependency_install_and_archive(self):
        signed = CONFIG.split("  ios-unsigned:", 1)[0]
        self.assertLess(signed.index("Verify release source is current main"), signed.index(GATE))
        for step in ("Install frontend deps", "Build the web bundle", "Build .ipa"):
            self.assertLess(signed.index(GATE), signed.index("      - name: " + step))

    def test_both_missing_reports_all_required_names_without_unbound_error(self):
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("APP_STORE_APPLE_ID must", result.stdout)
        self.assertIn("REACT_APP_REVENUECAT_IOS_KEY must", result.stdout)
        self.assertIn("rmc_release", result.stdout)
        self.assertNotIn("unbound variable", result.stderr)

    def test_valid_format_passes_without_printing_values(self):
        result = self.run_gate("1234567890", "appl_test_fixture_not_a_real_key")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_malformed_ids_fail_including_embedded_valid_line(self):
        for app_id in ("", "0", "0000000000", "com.rmcclassics.app", " 123", "123 ",
                       "123\ninvalid", "invalid\n123", "123\n", "１２３"):
            with self.subTest(app_id=repr(app_id)):
                result = self.run_gate(app_id, "appl_test_fixture_not_a_real_key")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("APP_STORE_APPLE_ID must", result.stdout)
                self.assertNotIn("appl_test_fixture", result.stdout + result.stderr)

    def test_absent_empty_or_whitespace_sdk_key_fails(self):
        for key in (None, "", " ", "\t\n"):
            with self.subTest(key=repr(key)):
                result = self.run_gate("1234567890", key)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("REACT_APP_REVENUECAT_IOS_KEY must", result.stdout)
                self.assertNotIn("1234567890", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
