"""Offline checks: no browser, account login, or screenshot capture."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("capture", Path(__file__).parents[1] / "scripts/generate_screenshots.py")
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureGuardTests(unittest.TestCase):
    def inputs(self, out, url="https://example.invalid"):
        return dict(SCREENSHOT_BASE_URL=url, SCREENSHOT_LOGIN_EMAIL="test@example.invalid",
                    SCREENSHOT_LOGIN_PASSWORD="test-only", SCREENSHOT_OUT_DIR=str(out))

    def test_missing_inputs_fail_before_network(self):
        with self.assertRaises(ValueError):
            capture.configure({})

    def test_rejects_remote_http_credentials_and_non_origin(self):
        for url in ("http://example.invalid", "https://user:pw@example.invalid",
                    "https://example.invalid/path", "https://example.invalid?token=x"):
            with self.subTest(url=url), tempfile.TemporaryDirectory() as root:
                with self.assertRaises(ValueError):
                    capture.configure(self.inputs(Path(root) / "new", url))

    def test_existing_outputs_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                capture.configure(self.inputs(root))

    def test_explicit_https_and_localhost_are_accepted(self):
        for url in ("https://example.invalid", "http://localhost:3000"):
            with tempfile.TemporaryDirectory() as root:
                capture.configure(self.inputs(Path(root) / "new", url))
                self.assertEqual(capture.BASE_URL, url)

    def test_login_failure_is_not_swallowed(self):
        class FailedPage:
            def goto(self, *args, **kwargs):
                raise RuntimeError("test navigation failed")
        with self.assertRaises(RuntimeError):
            capture.login(FailedPage())


if __name__ == "__main__":
    unittest.main()
