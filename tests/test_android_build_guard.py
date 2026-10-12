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

    def test_pull_request_build_is_bound_to_exact_head(self):
        source = (
            "${{ github.event.pull_request.head.sha || github.sha }}"
        )
        self.assertIn(f"SOURCE_COMMIT: {source}", WORKFLOW)
        self.assertIn("ref: ${{ env.SOURCE_COMMIT }}", WORKFLOW)
        checkout_block = WORKFLOW.split(
            "- uses: actions/checkout@v5", 1)[1].split(
                "- name:", 1)[0]
        self.assertIn("persist-credentials: false", checkout_block)
        self.assertIn(
            'test "$(git rev-parse --verify \'HEAD^{commit}\')" '
            '= "$SOURCE_COMMIT"',
            WORKFLOW,
        )
        self.assertIn(
            "name: rmc-classics-android-readiness-"
            "${{ env.SOURCE_COMMIT }}",
            WORKFLOW,
        )
        checkout = WORKFLOW.index("ref: ${{ env.SOURCE_COMMIT }}")
        verify = WORKFLOW.index(
            'test "$(git rev-parse --verify \'HEAD^{commit}\')"'
        )
        build = WORKFLOW.index("./gradlew --no-daemon bundleRelease")
        self.assertLess(checkout, verify)
        self.assertLess(verify, build)

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
        hash_step = WORKFLOW.index('sha256sum "$AAB"')
        self.assertLess(validate_step, unsigned_step)
        self.assertLess(unsigned_step, hash_step)

    def test_bundle_receipt_binds_hash_to_exact_source_and_unsigned_state(self):
        for field in (
            "repository=${GITHUB_REPOSITORY}",
            "commit=$(git rev-parse --verify 'HEAD^{commit}')",
            "bundle_id=com.rmcclassics.app",
            "artifact=$AAB",
            "sha256=$BUNDLE_SHA256",
            "signing_state=unsigned-readiness-only",
        ):
            self.assertIn(field, WORKFLOW)
        self.assertIn(
            "frontend/android/android-readiness-metadata.txt",
            WORKFLOW,
        )
        receipt = WORKFLOW.index(
            '} > android-readiness-metadata.txt')
        retain = WORKFLOW.index(
            "      - name: Retain Android readiness evidence")
        self.assertLess(receipt, retain)

    def test_retained_evidence_set_is_verified_before_upload(self):
        verify_step = WORKFLOW.index(
            "      - name: Verify Android evidence set")
        retain_step = WORKFLOW.index(
            "      - name: Retain Android readiness evidence")
        self.assertLess(verify_step, retain_step)
        verification = WORKFLOW[verify_step:retain_step]
        self.assertIn(
            "sha256sum --check --strict app-release.aab.sha256",
            verification,
        )
        for field in (
            "repository=$GITHUB_REPOSITORY",
            "commit=$SOURCE_COMMIT",
            "bundle_id=com.rmcclassics.app",
            "artifact=app/build/outputs/bundle/release/app-release.aab",
            "signing_state=unsigned-readiness-only",
        ):
            self.assertIn(field, verification)
        self.assertIn('unzip -t "$AAB"', verification)
        self.assertIn(
            "base/manifest/AndroidManifest.xml", verification)
        self.assertIn(
            "^META-INF/[^/]+\\.(RSA|DSA|EC)$", verification)
        self.assertIn(
            "Refusing signed artifact at evidence retention boundary.",
            verification,
        )
        retained_validation = verification.index('unzip -t "$AAB"')
        retained_hash = verification.index(
            "sha256sum --check --strict app-release.aab.sha256")
        self.assertLess(retained_validation, retained_hash)
        self.assertIn('test "$RECORDED_SHA" = "$ACTUAL_SHA"', verification)

    def test_bundle_receipt_is_hashed_and_retained(self):
        compile_step = WORKFLOW.index(
            "      - name: Compile non-publishing Android App Bundle")
        hash_step = WORKFLOW.index('sha256sum "$AAB"')
        retain_step = WORKFLOW.index(
            "      - name: Retain Android readiness evidence")
        self.assertLess(compile_step, hash_step)
        self.assertLess(hash_step, retain_step)
        self.assertIn("if-no-files-found: error", WORKFLOW)
        self.assertIn("retention-days: 30", WORKFLOW)


if __name__ == "__main__":
    unittest.main()
