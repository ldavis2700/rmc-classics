"""Guard the non-publishing RMC Classics Android readiness workflow."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/android-build.yml").read_text()
RUNBOOK = (ROOT / "docs/GOOGLE_PLAY_RELEASE_GATE.md").read_text()
IAP = (ROOT / "frontend/src/lib/iap.js").read_text()


class AndroidBuildGuardTests(unittest.TestCase):
    def test_workflow_is_read_only_and_never_publishes(self):
        self.assertIn("permissions:\n  contents: read", WORKFLOW)
        self.assertIn("pull_request:", WORKFLOW)
        self.assertNotIn("google_play", WORKFLOW.lower())
        self.assertNotIn("play_store", WORKFLOW.lower())
        self.assertNotIn(
            "publish", WORKFLOW.lower().replace("non-publishing", ""))
        self.assertNotIn("secrets.", WORKFLOW)

    def test_third_party_actions_are_pinned_to_reviewed_commits(self):
        expected = (
            "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5",
            "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4",
            "actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5",
            "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4",
        )
        for action in expected:
            self.assertIn(f"uses: {action}", WORKFLOW)
        for line in WORKFLOW.splitlines():
            if "uses: actions/" in line:
                self.assertRegex(
                    line,
                    r"uses: actions/[a-z-]+@[0-9a-f]{40} # v[0-9]+$",
                )

    def test_android_iap_uses_its_own_public_revenuecat_key(self):
        self.assertIn("REACT_APP_REVENUECAT_IOS_KEY", IAP)
        self.assertIn("REACT_APP_REVENUECAT_ANDROID_KEY", IAP)
        self.assertIn("window.Capacitor.getPlatform", IAP)
        self.assertIn("revenueCatKeyForPlatform", IAP)
        self.assertIn("apiKey: revenueCatKey", IAP)
        self.assertIn('platform === "ios"', IAP)
        self.assertIn('platform === "android"', IAP)
        self.assertIn('"appl_"', IAP)
        self.assertIn('"goog_"', IAP)
        self.assertIn("key.startsWith(requiredPrefix)", IAP)
        self.assertNotIn("const REVENUECAT_KEY =", IAP)
        self.assertNotIn("only available in the iOS app", IAP)

    def test_google_play_runbook_keeps_signing_and_upload_owner_gated(self):
        for required in (
            "unsigned, non-publishing readiness AAB",
            "Never upload that readiness artifact to Google Play.",
            "com.rmcclassics.app",
            "compile_sdk=36",
            "target_sdk=36",
            "version_code",
            "sha256sum --check --strict app-release.aab.sha256",
            "jarsigner -verify -verbose -certs app-release.aab",
            "owner-approved consequential actions",
            "Do not paste keystores, passwords, service-account keys",
        ):
            self.assertIn(required, RUNBOOK)
        self.assertIn(
            "Google Play requires new apps and updates to target "
            "Android 16 / API level 36 from August 31, 2026",
            RUNBOOK,
        )

    def test_pull_request_build_is_bound_to_exact_head(self):
        source = (
            "${{ github.event.pull_request.head.sha || github.sha }}"
        )
        self.assertIn(f"SOURCE_COMMIT: {source}", WORKFLOW)
        self.assertIn("ref: ${{ env.SOURCE_COMMIT }}", WORKFLOW)
        checkout_block = WORKFLOW.split(
            "- uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5", 1)[1].split(
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
        self.assertIn("uses: actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5", WORKFLOW)
        self.assertNotIn("cache: gradle", WORKFLOW)
        self.assertIn("npm install --global npm@10.9.4", WORKFLOW)
        self.assertIn(
            'test "$(npm --version)" = "10.9.4"', WORKFLOW)
        pin_npm = WORKFLOW.index("npm install --global npm@10.9.4")
        install_dependencies = WORKFLOW.index("run: npm ci")
        self.assertLess(pin_npm, install_dependencies)
        self.assertIn("run: npm ci", WORKFLOW)
        self.assertIn("run: npm run build", WORKFLOW)
        self.assertIn("./node_modules/.bin/cap add android", WORKFLOW)
        self.assertIn("./node_modules/.bin/cap sync android", WORKFLOW)
        self.assertIn("./gradlew --no-daemon bundleRelease", WORKFLOW)
        self.assertIn(
            'applicationId "com.rmcclassics.app"', WORKFLOW)
        self.assertIn(
            "app/build/outputs/bundle/release/app-release.aab", WORKFLOW)
        self.assertIn("VERSION_CODE=\"$(sed -nE", WORKFLOW)
        self.assertIn("VERSION_NAME=\"$(sed -nE", WORKFLOW)
        self.assertIn('test "$VERSION_CODE" -gt 0', WORKFLOW)
        self.assertIn('test -n "$VERSION_NAME"', WORKFLOW)
        self.assertIn("compileSdkVersion = 36", WORKFLOW)
        self.assertIn("targetSdkVersion = 36", WORKFLOW)
        self.assertIn('COMPILE_SDK="$(sed -nE', WORKFLOW)
        self.assertIn('TARGET_SDK="$(sed -nE', WORKFLOW)
        self.assertIn('test "$COMPILE_SDK" -ge 36', WORKFLOW)
        self.assertIn('test "$TARGET_SDK" -ge 36', WORKFLOW)
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
            "version_code=$VERSION_CODE",
            "version_name=$VERSION_NAME",
            "compile_sdk=$COMPILE_SDK",
            "target_sdk=$TARGET_SDK",
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
            'test "$(git rev-parse --verify \'HEAD^{commit}\')" '
            '= "$SOURCE_COMMIT"',
            verification,
        )
        self.assertIn(
            "Retained Android evidence does not match the requested "
            "source commit.",
            verification,
        )
        self.assertIn(
            'test "$(wc -l < app-release.aab.sha256)" -eq 1',
            verification,
        )
        self.assertIn(
            "grep -Eq '^[0-9a-f]{64}  "
            "app/build/outputs/bundle/release/app-release\\.aab$'",
            verification,
        )
        self.assertIn(
            'test "$(wc -l < android-readiness-metadata.txt.sha256)" -eq 1',
            verification,
        )
        self.assertIn(
            "grep -Eq '^[0-9a-f]{64}  "
            "android-readiness-metadata\\.txt$'",
            verification,
        )
        self.assertIn(
            "sha256sum --check --strict app-release.aab.sha256",
            verification,
        )
        for field in (
            "repository=$GITHUB_REPOSITORY",
            "commit=$SOURCE_COMMIT",
            "bundle_id=com.rmcclassics.app",
            "version_code=$EXPECTED_VERSION_CODE",
            "version_name=$EXPECTED_VERSION_NAME",
            "compile_sdk=36",
            "target_sdk=36",
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
        self.assertIn(
            "grep -Eq '^version_code=[1-9][0-9]*$' \"$METADATA\"",
            verification,
        )
        self.assertIn(
            "grep -Eq '^version_name=.+$' \"$METADATA\"",
            verification,
        )
        self.assertIn(
            "grep -Eq '^sha256=[0-9a-f]{64}$' \"$METADATA\"",
            verification,
        )
        self.assertIn(
            "grep -Eq '^commit=[0-9a-f]{40}$' \"$METADATA\"",
            verification,
        )
        self.assertIn("grep -Eq '^compile_sdk=", verification)
        self.assertIn("grep -Eq '^target_sdk=", verification)
        self.assertIn('test "$RECORDED_SHA" = "$ACTUAL_SHA"', verification)

    def test_bundle_receipt_is_hashed_and_retained(self):
        compile_step = WORKFLOW.index(
            "      - name: Compile non-publishing Android App Bundle")
        hash_step = WORKFLOW.index('sha256sum "$AAB"')
        retain_step = WORKFLOW.index(
            "      - name: Retain Android readiness evidence")
        self.assertLess(compile_step, hash_step)
        self.assertLess(hash_step, retain_step)
        self.assertIn(
            "sha256sum android-readiness-metadata.txt > \\",
            WORKFLOW,
        )
        self.assertIn(
            "sha256sum --check --strict "
            "android-readiness-metadata.txt.sha256",
            WORKFLOW,
        )
        self.assertIn(
            "frontend/android/android-readiness-metadata.txt.sha256",
            WORKFLOW,
        )
        receipt_hash = WORKFLOW.index(
            "sha256sum android-readiness-metadata.txt > \\"
        )
        verify_receipt = WORKFLOW.index(
            "sha256sum --check --strict "
            "android-readiness-metadata.txt.sha256"
        )
        self.assertLess(receipt_hash, verify_receipt)
        self.assertLess(verify_receipt, retain_step)
        self.assertIn("if-no-files-found: error", WORKFLOW)
        self.assertIn("retention-days: 30", WORKFLOW)


    def test_iap_provider_errors_are_not_exposed_to_users(self):
        self.assertIn(
            'error: "Purchase could not be completed. Try again."',
            IAP,
        )
        self.assertIn(
            'error: "Restore could not be completed. Try again."',
            IAP,
        )
        self.assertNotIn("return { ok: false, error: msg }", IAP)
        self.assertNotIn('err?.message || "Restore failed"', IAP)

    def test_restore_fails_closed_before_loading_unconfigured_store(self):
        restore = IAP[IAP.index("export async function restorePurchases"):]
        key_gate = restore.index("if (!revenueCatKeyForPlatform())")
        store_load = restore.index("const Purchases = await getPurchases()")
        self.assertLess(key_gate, store_load)
        self.assertIn("Purchases are temporarily unavailable.", restore)

    def test_google_play_runbook_binds_signed_build_to_android_revenuecat_key(self):
        self.assertIn("REACT_APP_REVENUECAT_ANDROID_KEY", RUNBOOK)
        self.assertIn("goog_", RUNBOOK)
        self.assertIn("REACT_APP_REVENUECAT_IOS_KEY", RUNBOOK)
        self.assertIn("appl_", RUNBOOK)
        self.assertIn("must fail closed", RUNBOOK)
        self.assertIn("without recording the full key", RUNBOOK)


if __name__ == "__main__":
    unittest.main()
