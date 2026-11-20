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

    def test_redirect_is_rejected_before_credentials_are_filled(self):
        class RedirectedPage:
            url = "https://other.invalid/login"
            def goto(self, *args, **kwargs):
                return type("Response", (), {"ok": True})()
            def locator(self, *args):
                raise AssertionError("Credentials must not be filled after redirect")
        capture.BASE_URL = "https://example.invalid"
        with self.assertRaises(RuntimeError):
            capture.login(RedirectedPage())

    def test_navigation_requires_successful_expected_route(self):
        class Page:
            def __init__(self, url, ok):
                self.url, self.ok = url, ok
            def goto(self, *args, **kwargs):
                return type("Response", (), {"ok": self.ok})()
        capture.BASE_URL = "https://example.invalid"
        for url, ok in [("https://example.invalid/login", True),
                        ("http://example.invalid/profile", True),
                        ("https://example.invalid/profile", False)]:
            with self.subTest(url=url, ok=ok), self.assertRaises(RuntimeError):
                capture.navigate(Page(url, ok), "/profile")
        capture.navigate(Page("https://example.invalid/profile", True), "/profile")

    def test_capture_targets_are_page_content_not_hidden_desktop_controls(self):
        selectors = {path: selector for path, _, selector, _ in capture.SCREENS}
        self.assertEqual(selectors["/library"], "[data-testid='game-card-chess']")
        self.assertEqual(selectors["/leaderboard"], "[data-testid='leaderboard-list']")
        self.assertEqual(selectors["/profile"], "[data-testid='profile-name']")
        for path in ("/play/chess", "/play/memory", "/play/connect4"):
            self.assertIn("board", selectors[path])


if __name__ == "__main__":
    unittest.main()
