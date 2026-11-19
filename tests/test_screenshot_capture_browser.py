"""Isolated browser fixture test. Does not exercise RMC API or signed devices."""
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import struct
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("capture", Path(__file__).parents[1] / "scripts/generate_screenshots.py")
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)

class Fixture(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/login":
            body = """<form action="/" method="get">
            <input type="email" required><input type="password" required>
            <input type="checkbox" data-testid="login-terms-checkbox" required>
            <button data-testid="login-submit" type="submit">Login fixture</button></form>"""
        else:
            ids = ["hero-tag", "game-card-chess", "leaderboard-list", "profile-name",
                   "chess-board", "memory-board", "c4-board"]
            body = "<h1>TEST FIXTURE — NOT RMC RELEASE EVIDENCE</h1>" + "".join(
                f'<div data-testid="{i}">{i}</div>' for i in ids)
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body.encode())


@unittest.skipUnless(importlib.util.find_spec("playwright"), "Playwright not installed")
class BrowserCaptureTests(unittest.TestCase):
    def test_capture_png_dimensions_and_receipt_hashes(self):
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as root:
                output = Path(root) / "captures"
                env = {
                    "SCREENSHOT_BASE_URL": f"http://127.0.0.1:{server.server_port}",
                    "SCREENSHOT_LOGIN_EMAIL": "fixture@example.invalid",
                    "SCREENSHOT_LOGIN_PASSWORD": "fixture-only",
                    "SCREENSHOT_OUT_DIR": str(output),
                }
                with patch.dict(os.environ, env), patch.object(capture, "DEVICES", [("iphone-test", 1284, 2778, 3)]):
                    capture.main()
                receipt = json.loads((output / "capture-receipt.json").read_text())
                self.assertFalse(receipt["signed_device_verified"])
                self.assertFalse(receipt["resubmission_ready"])
                self.assertEqual(len(receipt["files_sha256"]), 7)
                for name, digest in receipt["files_sha256"].items():
                    data = (output / name).read_bytes()
                    self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                    self.assertEqual(struct.unpack(">II", data[16:24]), (1284, 2778))
                    self.assertEqual(hashlib.sha256(data).hexdigest(), digest)
                serialized = json.dumps(receipt)
                self.assertNotIn(env["SCREENSHOT_LOGIN_EMAIL"], serialized)
                self.assertNotIn(env["SCREENSHOT_LOGIN_PASSWORD"], serialized)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

if __name__ == "__main__":
    unittest.main()
