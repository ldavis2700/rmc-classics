"""Exercise the actual Codemagic gate with detached shallow Git checkouts."""

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ReleaseSourceGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.origin = self.root / "origin"
        self.checkout = self.root / "checkout"
        self.origin.mkdir()
        self.git(self.origin, "init", "-b", "main")
        self.git(self.origin, "config", "user.email", "test@example.invalid")
        self.git(self.origin, "config", "user.name", "Release Guard Test")
        self.commit("first")
        self.first = self.git(self.origin, "rev-parse", "HEAD").stdout.strip()
        self.git(self.origin, "tag", "release-candidate")
        # Fetch a tag into FETCH_HEAD: no origin/main remote-tracking ref exists.
        self.checkout.mkdir()
        self.git(self.checkout, "init")
        self.git(self.checkout, "remote", "add", "origin", self.origin.as_uri())
        self.git(self.checkout, "fetch", "--depth=1", "origin", "tag", "release-candidate")
        self.git(self.checkout, "checkout", "--detach", "FETCH_HEAD")
        self.git(self.checkout, "config", "--unset-all", "remote.origin.fetch")
        config = (ROOT / "codemagic.yaml").read_text()
        block = config.split("      - name: Verify release source is current main\n", 1)[1]
        block = block.split("      - name:", 1)[0].split("        script: |\n", 1)[1]
        self.script = textwrap.dedent(block)

    def git(self, cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=True)

    def commit(self, content):
        (self.origin / "app.txt").write_text(content)
        self.git(self.origin, "add", "app.txt")
        self.git(self.origin, "commit", "-m", content)

    def run_gate(self):
        return subprocess.run(
            ["bash", "-c", self.script], cwd=self.checkout,
            env={**os.environ, "CM_BUILD_DIR": str(self.checkout)},
            text=True, capture_output=True,
        )

    def test_current_detached_shallow_checkout_without_origin_main_passes(self):
        missing = subprocess.run(
            ["git", "rev-parse", "--verify", "origin/main"],
            cwd=self.checkout, capture_output=True,
        )
        self.assertNotEqual(missing.returncode, 0)
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        receipt = (self.checkout / "release-source.txt").read_text()
        self.assertIn(f"commit={self.first}", receipt)
        self.assertIn("verified_against=origin/main", receipt)

    def test_stale_candidate_fails_without_success_receipt(self):
        self.commit("second")
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing stale TestFlight source", result.stdout)
        self.assertFalse((self.checkout / "release-source.txt").exists())

    def test_cached_main_is_refreshed_before_comparison(self):
        self.git(self.checkout, "update-ref", "refs/remotes/origin/main", self.first)
        self.commit("second")
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing stale TestFlight source", result.stdout)
        self.assertFalse((self.checkout / "release-source.txt").exists())

    def test_failed_fetch_never_accepts_cached_main(self):
        self.git(self.checkout, "update-ref", "refs/remotes/origin/main", self.first)
        self.git(self.checkout, "remote", "set-url", "origin", str(self.root / "missing"))
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.checkout / "release-source.txt").exists())


if __name__ == "__main__":
    unittest.main()
