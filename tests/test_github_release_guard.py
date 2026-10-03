"""Execute the signed GitHub workflow's release gates without providers."""

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/ios-build.yml").read_text()


def step_script(name):
    marker = f"      - name: {name}\n"
    block = WORKFLOW.split(marker, 1)[1].split("      - name:", 1)[0]
    return textwrap.dedent(block.split("        run: |\n", 1)[1])


SOURCE_SCRIPT = step_script("Verify release source is current main")
CONFIG_SCRIPT = step_script("Validate release configuration")


class GitHubReleaseGuardTests(unittest.TestCase):
    def test_guards_precede_setup_install_build_and_signing(self):
        source = WORKFLOW.index("      - name: Verify release source is current main")
        config = WORKFLOW.index("      - name: Validate release configuration")
        self.assertLess(source, config)
        for step in ("Setup Node 20", "Install frontend deps", "Build web bundle",
                     "Install Apple Distribution certificate", "Build & upload via fastlane"):
            self.assertLess(config, WORKFLOW.index("      - name: " + step))

    def test_revenuecat_key_is_injected_into_web_build(self):
        build = WORKFLOW.split("      - name: Build web bundle\n", 1)[1]
        build = build.split("      - name:", 1)[0]
        self.assertIn("REACT_APP_REVENUECAT_IOS_KEY: ${{ secrets.REACT_APP_REVENUECAT_IOS_KEY }}", build)

    def test_source_receipt_is_retained_after_later_failures(self):
        upload = WORKFLOW.split("      - name: Upload release-source receipt\n", 1)[1]
        self.assertIn("if: ${{ always() }}", upload)
        self.assertIn("path: release-source.txt", upload)

    def run_config(self, **overrides):
        names = (
            "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8",
            "IOS_DISTRIBUTION_CERTIFICATE_BASE64",
            "IOS_DISTRIBUTION_CERTIFICATE_PASSWORD",
            "IOS_PROVISIONING_PROFILE_BASE64", "APP_STORE_APPLE_ID",
            "REACT_APP_REVENUECAT_IOS_KEY",
        )
        env = {k: v for k, v in os.environ.items() if k not in names}
        env.update(overrides)
        return subprocess.run(["bash", "-c", CONFIG_SCRIPT], env=env,
                              text=True, capture_output=True)

    def test_config_reports_every_missing_name_without_values(self):
        result = self.run_config()
        self.assertNotEqual(result.returncode, 0)
        for name in (
            "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8",
            "IOS_DISTRIBUTION_CERTIFICATE_BASE64",
            "IOS_DISTRIBUTION_CERTIFICATE_PASSWORD",
            "IOS_PROVISIONING_PROFILE_BASE64", "APP_STORE_APPLE_ID",
            "REACT_APP_REVENUECAT_IOS_KEY",
        ):
            self.assertIn(name, result.stdout)

    def test_valid_config_passes_without_printing_values(self):
        values = {
            "ASC_KEY_ID": "key-id", "ASC_ISSUER_ID": "issuer-id",
            "ASC_KEY_P8": "private-key-fixture",
            "IOS_DISTRIBUTION_CERTIFICATE_BASE64": "certificate-fixture",
            "IOS_DISTRIBUTION_CERTIFICATE_PASSWORD": "password-fixture",
            "IOS_PROVISIONING_PROFILE_BASE64": "profile-fixture",
            "APP_STORE_APPLE_ID": "1234567890",
            "REACT_APP_REVENUECAT_IOS_KEY": "appl_public_fixture",
        }
        result = self.run_config(**values)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout, "")

    def test_malformed_app_ids_and_blank_sdk_keys_fail(self):
        valid = {
            "ASC_KEY_ID": "x", "ASC_ISSUER_ID": "x", "ASC_KEY_P8": "x",
            "IOS_DISTRIBUTION_CERTIFICATE_BASE64": "x",
            "IOS_DISTRIBUTION_CERTIFICATE_PASSWORD": "x",
            "IOS_PROVISIONING_PROFILE_BASE64": "x",
            "APP_STORE_APPLE_ID": "1234567890",
            "REACT_APP_REVENUECAT_IOS_KEY": "appl_public_fixture",
        }
        for app_id in ("0", "com.rmcclassics.app", " 123", "123 ", "123\n"):
            with self.subTest(app_id=repr(app_id)):
                result = self.run_config(**{**valid, "APP_STORE_APPLE_ID": app_id})
                self.assertNotEqual(result.returncode, 0)
        for sdk_key in ("", " ", "\t\n"):
            with self.subTest(sdk_key=repr(sdk_key)):
                result = self.run_config(**{**valid, "REACT_APP_REVENUECAT_IOS_KEY": sdk_key})
                self.assertNotEqual(result.returncode, 0)

    def test_source_gate_accepts_current_main_and_rejects_stale_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            origin = root / "origin"
            checkout = root / "checkout"
            origin.mkdir()
            self.git(origin, "init", "-b", "main")
            self.git(origin, "config", "user.email", "test@example.invalid")
            self.git(origin, "config", "user.name", "Release Guard Test")
            (origin / "app.txt").write_text("first")
            self.git(origin, "add", "app.txt")
            self.git(origin, "commit", "-m", "first")
            first = self.git(origin, "rev-parse", "HEAD").stdout.strip()
            self.git(origin, "tag", "v1.0.0")
            checkout.mkdir()
            self.git(checkout, "init")
            self.git(checkout, "remote", "add", "origin", origin.as_uri())
            self.git(checkout, "fetch", "--depth=1", "origin", "tag", "v1.0.0")
            self.git(checkout, "checkout", "--detach", "FETCH_HEAD")
            env = {**os.environ, "GITHUB_WORKSPACE": str(checkout),
                   "GITHUB_REPOSITORY": "ldavis2700/rmc-classics"}
            current = subprocess.run(["bash", "-c", SOURCE_SCRIPT], cwd=checkout,
                                     env=env, text=True, capture_output=True)
            self.assertEqual(current.returncode, 0, current.stdout + current.stderr)
            self.assertIn(f"commit={first}", (checkout / "release-source.txt").read_text())

            (origin / "app.txt").write_text("second")
            self.git(origin, "add", "app.txt")
            self.git(origin, "commit", "-m", "second")
            (checkout / "release-source.txt").unlink()
            stale = subprocess.run(["bash", "-c", SOURCE_SCRIPT], cwd=checkout,
                                   env=env, text=True, capture_output=True)
            self.assertNotEqual(stale.returncode, 0)
            self.assertIn("Refusing stale TestFlight source", stale.stdout)
            self.assertFalse((checkout / "release-source.txt").exists())

    @staticmethod
    def git(cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, text=True,
                              capture_output=True, check=True)


if __name__ == "__main__":
    unittest.main()
