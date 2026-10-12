"""Guard the non-publishing RMC Classics Android readiness workflow."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/android-build.yml").read_text()


class AndroidBuildGuardTests(unittest.TestCase):
    def test_workflow_is_read_only_and_never_publishes(self):
        self.assertIn("permissions:\n  contents: read", WORKFLOW)
        self.assertIn("pull_request:", WORKFLOW)
        self.assertNotIn("google_play", WORKFLOW.lower())
        self.assertNotIn("play_store", WORKFLOW.lower())
        self.assertNotIn(
            "publish", WORKFLOW.lower().replace("non-publishing", ""))
        self.assertNotIn("secrets.", WORKFLOW)

    def test_android_shell_and_bundle_are_built_from_locked_frontend(self):
        self.assertIn("run: npm ci", WORKFLOW)
        self.assertIn("run: npm run build", WORKFLOW)
        self.assertIn("npx cap add android", WORKFLOW)
        self.assertIn("npx cap sync android", WORKFLOW)
        self.assertIn("./gradlew --no-daemon bundleRelease", WORKFLOW)
        self.assertIn(
            'applicationId "com.rmcclassics.app"', WORKFLOW)
        self.assertIn(
            "app/build/outputs/bundle/release/app-release.aab", WORKFLOW)
        self.assertNotIn("bundleDebug", WORKFLOW)
        self.assertNotIn("/bundle/debug/", WORKFLOW)

    def test_release_bundle_is_validated_and_must_remain_unsigned(self):
        self.assertIn('unzip -t "$AAB"', WORKFLOW)
        self.assertIn(
            "base/manifest/AndroidManifest.xml", WORKFLOW)
        self.assertIn(
            "^META-INF/[^/]+\\.(RSA|DSA|EC)$", WORKFLOW)
        self.assertIn(
            "Refusing signed artifact in non-publishing readiness workflow.",
            WORKFLOW,
        )
        validate_step = WORKFLOW.index('unzip -t "$AAB"')
        unsigned_step = WORKFLOW.index('test -z "$SIGNATURES"')
        hash_step = WORKFLOW.index('shasum -a 256 "$AAB"')
        self.assertLess(validate_step, unsigned_step)
        self.assertLess(unsigned_step, hash_step)

    def test_bundle_receipt_is_hashed_and_retained(self):
        compile_step = WORKFLOW.index(
            "      - name: Compile non-publishing Android App Bundle")
        hash_step = WORKFLOW.index('shasum -a 256 "$AAB"')
        retain_step = WORKFLOW.index(
            "      - name: Retain Android readiness evidence")
        self.assertLess(compile_step, hash_step)
        self.assertLess(hash_step, retain_step)
        self.assertIn("if-no-files-found: error", WORKFLOW)
        self.assertIn("retention-days: 7", WORKFLOW)


if __name__ == "__main__":
    unittest.main()
