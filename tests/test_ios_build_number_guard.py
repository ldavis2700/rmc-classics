"""Keep both TestFlight paths on App Store-derived build numbering."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FASTFILE = (ROOT / "frontend/ios/App/fastlane/Fastfile").read_text()
CODEMAGIC = (ROOT / "codemagic.yaml").read_text()


class IOSBuildNumberGuardTests(unittest.TestCase):
    def test_fastlane_reads_marketing_version_from_xcode_project(self):
        self.assertIn("app_version = get_version_number(", FASTFILE)
        self.assertIn('xcodeproj: "App.xcodeproj"', FASTFILE)
        self.assertIn('target: "App"', FASTFILE)
        self.assertIn("version: app_version", FASTFILE)
        self.assertNotIn('version: "1.0"', FASTFILE)

    def test_fastlane_increments_latest_testflight_build(self):
        self.assertIn("latest_testflight_build_number(", FASTFILE)
        self.assertIn("build_number: latest_build + 1", FASTFILE)

    def test_fastlane_verifies_signed_ipa_before_upload(self):
        build = FASTFILE.index("    build_app(")
        verify = FASTFILE.index(
            'sh("codesign --verify --deep --strict ')
        upload = FASTFILE.index("    upload_to_testflight(")
        self.assertLess(build, verify)
        self.assertLess(verify, upload)
        self.assertIn(
            'bundle_id == "com.rmcclassics.app"', FASTFILE)
        self.assertIn("IPA build number must be numeric", FASTFILE)
        self.assertIn("Digest::SHA256.file(ipa_path).hexdigest", FASTFILE)
        self.assertIn("release-ipa-metadata.txt", FASTFILE)

    def test_signed_codemagic_release_is_manual_only(self):
        signed = CODEMAGIC.split("  ios-unsigned:", 1)[0]
        self.assertNotIn("    triggering:", signed)
        self.assertNotIn("rmc-testflight/*", signed)
        self.assertNotIn("rmc-testflight-*", signed)
        self.assertIn(
            "Automatic branch/tag triggers are intentionally disabled",
            signed,
        )

    def test_codemagic_uses_app_store_not_runner_sequence(self):
        signed = CODEMAGIC.split("  ios-unsigned:", 1)[0]
        self.assertIn(
            'app-store-connect get-latest-app-store-build-number '
            '"$APP_STORE_APPLE_ID"',
            signed,
        )
        self.assertIn('NEXT_BUILD_NUMBER="$((LATEST_BUILD_NUMBER + 1))"', signed)
        self.assertIn('agvtool new-version -all "$NEXT_BUILD_NUMBER"', signed)
        self.assertNotIn('$BUILD_NUMBER + 1', signed)

    def test_codemagic_rejects_non_numeric_provider_response(self):
        signed = CODEMAGIC.split("  ios-unsigned:", 1)[0]
        self.assertIn("''|*[!0-9]*)", signed)
        self.assertIn(
            "App Store Connect returned an invalid latest build number",
            signed,
        )
        self.assertIn(
            'test "$NEXT_BUILD_NUMBER" -gt "$LATEST_BUILD_NUMBER"',
            signed,
        )


if __name__ == "__main__":
    unittest.main()
