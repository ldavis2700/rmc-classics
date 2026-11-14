"""Accessible loading state regression guard, no browser or network required."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class AccessibleLoadingStateTests(unittest.TestCase):
    def test_auth_loading_announces_status(self):
        app = (ROOT / "frontend/src/App.js").read_text(encoding="utf-8")
        start = app.index("function ProtectedRoute(")
        end = app.index("\nfunction App()", start)
        protected_route = app[start:end]
        self.assertIn('role="status"', protected_route)
        self.assertIn('aria-live="polite"', protected_route)
        self.assertIn('aria-busy="true"', protected_route)
        self.assertIn("if (loading)", protected_route)
        self.assertIn("<Navigate to=\"/login\" replace", protected_route)

if __name__ == "__main__":
    unittest.main()
