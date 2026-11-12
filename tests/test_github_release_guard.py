"""Execute the signed GitHub workflow's release gates without providers."""

import os
from pathlib import Path
import shutil
import re
import sys
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/ios-build.yml").read_text()
PR_WORKFLOW = (ROOT / ".github/workflows/pr-validation.yml").read_text()
ANDROID_WORKFLOW = (ROOT / ".github/workflows/android-build.yml").read_text()
FASTFILE = (ROOT / "frontend/ios/App/fastlane/Fastfile").read_text()
CODEMAGIC = (ROOT / "codemagic.yaml").read_text()
FASTLANE_INSTALLER = (ROOT / "scripts/install_fastlane_toolchain.sh").read_text()
RELEASE_GATE = (ROOT / "docs/TESTFLIGHT_RELEASE_GATE.md").read_text()


def step_script(name):
    marker = f"      - name: {name}\n"
    block = WORKFLOW.split(marker, 1)[1].split("      - name:", 1)[0]
    return textwrap.dedent(block.split("        run: |\n", 1)[1])


SOURCE_SCRIPT = step_script("Verify release source is current main")
CONFIG_SCRIPT = step_script("Validate release configuration")
NATIVE_SCRIPT = step_script("Verify native toolchain")
CLEANUP_SCRIPT = step_script("Remove temporary signing material")


class GitHubReleaseGuardTests(unittest.TestCase):
    def test_signed_and_unsigned_builds_use_same_native_toolchain(self):
        unsigned = (ROOT / ".github/workflows/ios-readiness.yml").read_text()
        for setting in ("runs-on: macos-26",
                        "DEVELOPER_DIR: /Applications/Xcode_26.5.app/Contents/Developer",
                        "COCOAPODS_VERSION: 1.16.2"):
            self.assertIn(setting, WORKFLOW)
            self.assertIn(setting, unsigned)
        self.assertLess(WORKFLOW.index("Verify deployed release endpoints"),
                        WORKFLOW.index("Verify native toolchain"))
        self.assertLess(WORKFLOW.index("Verify native toolchain"),
                        WORKFLOW.index("Sync Capacitor iOS"))
        self.assertIn('>> "$GITHUB_PATH"', NATIVE_SCRIPT)

    def test_wrong_xcode_stops_before_installing_native_dependencies(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, script in {
                "xcodebuild": "printf 'Xcode 16.4\\nBuild version fixture\\n'",
                "gem": 'touch "$RUNNER_TEMP/gem-invoked"',
            }.items():
                executable = root / name
                executable.write_text("#!/bin/sh\n" + script + "\n")
                executable.chmod(0o755)
            result = subprocess.run(["bash", "-c", NATIVE_SCRIPT],
                                    env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                                         "RUNNER_TEMP": temp},
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "gem-invoked").exists())

    @unittest.skipUnless(shutil.which("ruby"), "Ruby is required for gem activation regression")
    def test_pod_wrapper_activates_pinned_library_with_newer_gem_installed(self):
        # Exercise the actual generated wrapper against two isolated fixture gems.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            gem_home = root / "gems"
            (gem_home / "specifications").mkdir(parents=True)
            for version in ("1.16.2", "1.17.0"):
                package = gem_home / "gems" / f"cocoapods-{version}"
                (package / "lib").mkdir(parents=True)
                (package / "bin").mkdir()
                (package / "lib/cocoapods.rb").write_text(f'puts "{version}"\n')
                (package / "bin/pod").write_text('require "cocoapods"\n')
                (gem_home / "specifications" / f"cocoapods-{version}.gemspec").write_text(
                    'Gem::Specification.new do |s|\n'
                    f'  s.name = "cocoapods"; s.version = "{version}"\n'
                    '  s.summary = "fixture"; s.authors = ["fixture"]\n'
                    '  s.files = ["lib/cocoapods.rb", "bin/pod"]\n'
                    '  s.executables = ["pod"]\nend\n')
            for name, script in {
                "xcodebuild": "printf 'Xcode 26.5\\nBuild version fixture\\n'",
                "gem": "exit 0",
            }.items():
                executable = root / name
                executable.write_text("#!/bin/sh\n" + script + "\n")
                executable.chmod(0o755)
            result = subprocess.run(["bash", "-c", NATIVE_SCRIPT],
                                    env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                                         "RUNNER_TEMP": temp, "GITHUB_PATH": str(root / "path"),
                                         "GEM_HOME": str(gem_home), "GEM_PATH": str(gem_home),
                                         "COCOAPODS_VERSION": "1.16.2"},
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("1.16.2", result.stdout)
            self.assertNotIn("1.17.0", result.stdout)

    def test_cocoapods_toolchain_is_exactly_pinned(self):
        self.assertIn("COCOAPODS_VERSION: 1.16.2", WORKFLOW)
        self.assertIn(
            'gem install cocoapods --no-document --version "$COCOAPODS_VERSION"',
            WORKFLOW,
        )
        self.assertIn(
            'test "$(pod --version)" = "$COCOAPODS_VERSION"',
            WORKFLOW,
        )
        self.assertEqual(CODEMAGIC.count('cocoapods: "1.16.2"'), 2)
        self.assertNotIn("cocoapods: default", CODEMAGIC)

    def test_fastlane_toolchain_is_exactly_pinned_and_verified(self):
        unsigned = (ROOT / ".github/workflows/ios-readiness.yml").read_text()
        for workflow in (WORKFLOW, unsigned):
            self.assertIn("FASTLANE_VERSION: 2.222.0", workflow)
            self.assertIn("run: bash scripts/install_fastlane_toolchain.sh", workflow)
        self.assertIn('gem install fastlane --no-document --version "$FASTLANE_VERSION"', FASTLANE_INSTALLER)
        self.assertIn('Fastlane::VERSION == ENV.fetch("FASTLANE_VERSION")', FASTLANE_INSTALLER)
        self.assertLess(FASTLANE_INSTALLER.index('gem "fastlane",'),
                        FASTLANE_INSTALLER.index('load Gem.bin_path'))
        self.assertIn('>> "$GITHUB_PATH"', FASTLANE_INSTALLER)
        self.assertIn('fastlane --version', FASTLANE_INSTALLER)
        self.assertNotIn('fastlane testflight', FASTLANE_INSTALLER)
        self.assertNotIn('ASC_', FASTLANE_INSTALLER)

    def test_github_release_actions_are_immutable_commit_pins(self):
        expected = {
            "actions/checkout": {
                "08c6903cd8c0fde910a37f88322edcfb5dd907a8",
                "11bd71901bbe5b1630ceea73d27597364c9af683",
                "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09",
            },
            "actions/setup-node": {
                "49933ea5288caeca8642d1e84afbd3f7d6820020",
            },
            "actions/setup-java": {
                "b6effb05e454b25005698d916606bdc6ffcbf961",
            },
            "actions/setup-python": {
                "a26af69be951a213d495a4c3e4e4022e16d87065",
            },
            "actions/upload-artifact": {
                "ea165f8d65b6e75b540449e92b4886f43607fa02",
            },
        }
        uses = [
            line.strip().split("uses:", 1)[1].strip().split()[0]
            for workflow in (WORKFLOW, PR_WORKFLOW, ANDROID_WORKFLOW)
            for line in workflow.splitlines()
            if line.strip().startswith(("- uses:", "uses:"))
        ]
        self.assertTrue(uses)
        for use in uses:
            action, ref = use.split("@", 1)
            ref = ref.split("#", 1)[0].strip()
            self.assertIn(action, expected)
            self.assertIn(ref, expected[action])
            self.assertRegex(ref, r"^[0-9a-f]{40}$")

    def test_pr_validation_pins_pytest_runtime(self):
        self.assertIn(
            "python -m pip install --disable-pip-version-check pytest==8.3.5",
            PR_WORKFLOW,
        )
        self.assertNotIn(
            "python -m pip install --disable-pip-version-check pytest\n",
            PR_WORKFLOW,
        )

    def test_fastlane_release_receipt_is_self_verified_before_upload(self):
        for guard in (
            '"artifact=#{ipa_path}"',
            "required_receipt_keys.each do |key|",
            "Release receipt must contain exactly one",
            "Release receipt #{key} binding mismatch",
            '"asc_key_id_sha256" => asc_key_id_sha256',
            '"asc_issuer_id_sha256" => asc_issuer_id_sha256',
            "App Store Connect key ID is invalid",
            "App Store Connect issuer ID is invalid",
            '"profile_certificate_sha256" => profile_certificate_digest',
            '"certificate_minimum_validity_days" => certificate_minimum_validity_days.to_s',
            '"signed_application_identifier" => signed_application_identifier',
            '"profile_expiration" => profile_expiration_time.utc.iso8601',
            '"profile_minimum_validity_days" => profile_minimum_validity_days.to_s',
            "Release receipt profile certificate digest is invalid",
            "Release receipt IPA digest is invalid",
            "Release receipt IPA digest mismatch",
            "Digest::SHA256.file(ipa_path).hexdigest",
            'receipt_checksum_path = "#{receipt_path}.sha256"',
            "Release receipt checksum is invalid",
            "Release receipt checksum path is invalid",
            "Release receipt checksum mismatch",
        ):
            self.assertIn(guard, FASTFILE)
        verify = FASTFILE.index(
            "required_receipt_keys.each do |key|")
        upload = FASTFILE.index("upload_to_testflight(")
        self.assertLess(verify, upload)

    def test_codemagic_final_ipa_matches_reserved_build_number(self):
        self.assertIn(
            'printf \'%s\\n\' "$NEXT_BUILD_NUMBER" > '
            '"$CM_BUILD_DIR/reserved-build-number.txt"',
            CODEMAGIC,
        )
        self.assertIn(
            'RESERVED_BUILD_NUMBER="$(cat '
            '"$CM_BUILD_DIR/reserved-build-number.txt")"',
            CODEMAGIC,
        )
        self.assertIn(
            'test "$BUILD_NUMBER" = "$RESERVED_BUILD_NUMBER"',
            CODEMAGIC,
        )
        self.assertIn(
            'echo "reserved_build_number=$RESERVED_BUILD_NUMBER"',
            CODEMAGIC,
        )

    def test_codemagic_final_ipa_matches_reviewed_marketing_version(self):
        self.assertIn('IOS_MARKETING_VERSION: "1.0"', CODEMAGIC)
        self.assertIn(
            'test "$VERSION" = "$IOS_MARKETING_VERSION"', CODEMAGIC)
        self.assertIn(
            'echo "reviewed_marketing_version=$IOS_MARKETING_VERSION"',
            CODEMAGIC,
        )

    def test_codemagic_ipa_verification_workspace_is_private_and_removed(self):
        verify = CODEMAGIC.split(
            "      - name: Verify signed IPA identity and record provenance\n",
            1,
        )[1].split("\n    artifacts:", 1)[0]
        self.assertIn("umask 077", verify)
        self.assertIn(
            'VERIFY_DIR="$(mktemp -d "$CM_BUILD_DIR/ipa-verify.XXXXXX")"',
            verify,
        )
        self.assertIn("trap 'rm -rf \"$VERIFY_DIR\"' EXIT", verify)
        self.assertNotIn(
            'VERIFY_DIR="$CM_BUILD_DIR/ipa-verify"\n'
            '          mkdir -p "$VERIFY_DIR"',
            verify,
        )

    def test_codemagic_signed_ipa_receipt_is_self_verified(self):
        verify = CODEMAGIC.split(
            "      - name: Verify signed IPA identity and record provenance\n",
            1,
        )[1].split("\n    artifacts:", 1)[0]
        self.assertIn('echo "artifact=$IPA_PATH"', verify)
        self.assertIn('echo "ipa_sha256=$IPA_SHA256"', verify)
        self.assertIn(
            'test "$(grep -c "^$key=" "$RECEIPT")" -eq 1',
            verify,
        )
        self.assertIn(
            'grep -Fqx "commit=$ACTUAL_COMMIT" "$RECEIPT"',
            verify,
        )
        self.assertIn(
            "grep -Eq '^ipa_sha256=[0-9a-f]{64}$' \"$RECEIPT\"",
            verify,
        )
        self.assertIn('RECORDED_IPA_SHA256="$(sed -n', verify)
        self.assertIn("CERTIFICATE_MINIMUM_VALIDITY_DAYS=30", verify)
        self.assertIn(
            '-checkend "$((CERTIFICATE_MINIMUM_VALIDITY_DAYS * 86400))"',
            verify,
        )
        self.assertIn(
            'grep -Fqx "certificate_minimum_validity_days='
            '$CERTIFICATE_MINIMUM_VALIDITY_DAYS" "$RECEIPT"',
            verify,
        )
        self.assertIn(
            'grep -Fqx "profile_minimum_validity_days='
            '$PROFILE_MINIMUM_VALIDITY_DAYS" "$RECEIPT"',
            verify,
        )
        self.assertIn(
            'grep -Fqx "signing_certificate_not_after='
            '$SIGNING_CERTIFICATE_NOT_AFTER" "$RECEIPT"',
            verify,
        )
        self.assertIn(
            'grep -Fqx "profile_expiration=$PROFILE_EXPIRATION" "$RECEIPT"',
            verify,
        )

    def test_guards_precede_setup_install_build_and_signing(self):
        source = WORKFLOW.index("      - name: Verify release source is current main")
        config = WORKFLOW.index("      - name: Validate release configuration")
        self.assertLess(source, config)
        for step in ("Setup Node 20", "Install frontend deps", "Build web bundle",
                     "Install Apple Distribution certificate", "Build & upload via fastlane"):
            self.assertLess(config, WORKFLOW.index("      - name: " + step))

    def test_manual_upload_requires_explicit_confirmation(self):
        self.assertIn("confirm_testflight:", WORKFLOW)
        self.assertIn("required: true", WORKFLOW)
        self.assertIn("type: boolean", WORKFLOW)
        self.assertIn("default: false", WORKFLOW)
        self.assertIn("if: ${{ inputs.confirm_testflight }}", WORKFLOW)
        self.assertNotIn("  push:\n", WORKFLOW)
        self.assertNotIn("v*.*.*", WORKFLOW)

    def test_signed_upload_is_serialized_and_environment_protected(self):
        self.assertIn("permissions:\n  contents: read", WORKFLOW)
        self.assertIn("group: rmc-classics-testflight-upload", WORKFLOW)
        self.assertIn("cancel-in-progress: false", WORKFLOW)
        self.assertIn("environment: app-store-production", WORKFLOW)
        self.assertIn("SOURCE_COMMIT: ${{ github.sha }}", WORKFLOW)
        checkout = WORKFLOW.split(
            "- uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
            1,
        )[1]
        checkout = checkout.split("- name:", 1)[0]
        self.assertIn("ref: ${{ env.SOURCE_COMMIT }}", checkout)
        self.assertIn("persist-credentials: false", checkout)
        self.assertIn('"$current_commit" != "$SOURCE_COMMIT"', SOURCE_SCRIPT)

    def test_revenuecat_release_keys_match_client_validation_bounds(self):
        for release_config in (WORKFLOW, CODEMAGIC):
            self.assertIn(r"^appl_[!-~]+$", release_config)
            self.assertIn('"${#sdk_key}" -gt 512', release_config)

    def test_revenuecat_key_is_injected_into_web_build(self):
        build = WORKFLOW.split("      - name: Build web bundle\n", 1)[1]
        build = build.split("      - name:", 1)[0]
        self.assertIn("REACT_APP_REVENUECAT_IOS_KEY: ${{ secrets.REACT_APP_REVENUECAT_IOS_KEY }}", build)

    def test_fastlane_certificate_helper_resolves_before_provider_actions(self):
        match = re.search(
            r'certificate_verifier = File\.expand_path\(\s*"([^"]+)", (__dir__)\s*\)',
            FASTFILE,
        )
        self.assertIsNotNone(match, "Verifier must resolve relative to the Fastfile")
        fastfile_dir = ROOT / "frontend/ios/App/fastlane"
        helper = (fastfile_dir / match.group(1)).resolve()
        self.assertEqual(helper, ROOT / "scripts/verify_ios_profile_certificate.py")
        self.assertTrue(helper.is_file())
        # Exercise the actual helper entry point from an unrelated working directory.
        with tempfile.TemporaryDirectory() as temp:
            result = subprocess.run([sys.executable, str(helper), "--help"],
                                    cwd=temp, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--profile", result.stdout)
        self.assertIn("--certificate", result.stdout)
        guard = FASTFILE.index('File.file?(certificate_verifier)')
        self.assertLess(guard, FASTFILE.index('app_store_connect_api_key('))
        self.assertLess(guard, FASTFILE.index('build_app('))

    def test_fastlane_verifies_profile_identity_and_expiry_before_upload(self):
        profile = FASTFILE.index(
            'profile_path = File.join(app_path, "embedded.mobileprovision")')
        identity = FASTFILE.index(
            "Provisioning profile does not authorize the IPA bundle identifier")
        expiry = FASTFILE.index(
            "Provisioning profile must remain valid for at least")
        upload = FASTFILE.index("upload_to_testflight(")
        self.assertLess(profile, identity)
        self.assertLess(identity, upload)
        self.assertLess(expiry, upload)
        self.assertIn("security cms -D -i", FASTFILE)
        self.assertIn("certificate_minimum_validity_days = 30", FASTFILE)
        self.assertIn(
            "-checkend #{certificate_minimum_validity_days * 86_400}",
            FASTFILE,
        )
        self.assertIn("verify_ios_profile_certificate.py", FASTFILE)
        self.assertIn("--certificate", FASTFILE)
        self.assertIn("profile_certificate_sha256=", FASTFILE)
        self.assertIn('"profile_uuid=#{profile_uuid}"', FASTFILE)
        self.assertIn('"profile_name=#{profile_name}"', FASTFILE)
        self.assertIn("Provisioning profile UUID is missing", FASTFILE)
        self.assertIn("Provisioning profile name is missing", FASTFILE)
        self.assertIn(
            'key: "Entitlements:application-identifier"', FASTFILE)
        self.assertIn("profile_minimum_validity_days = 30", FASTFILE)
        self.assertIn(
            "profile_expiration_time > Time.now + "
            "(profile_minimum_validity_days * 86_400)", FASTFILE)
        self.assertIn("codesign -d --entitlements :-", FASTFILE)
        self.assertIn(
            "signed_application_identifier == profile_application_identifier",
            FASTFILE,
        )
        self.assertIn(
            "signed_team_identifier == profile_team_identifier",
            FASTFILE,
        )
        self.assertIn("Print :TeamIdentifier:0", FASTFILE)
        self.assertIn(
            "profile_top_level_team_identifier == profile_team_identifier",
            FASTFILE,
        )
        self.assertIn(
            '"profile_top_level_team_identifier=#{profile_top_level_team_identifier}"',
            FASTFILE,
        )
        self.assertIn("expected_build_number = latest_build + 1", FASTFILE)
        self.assertIn(
            "verified_version.to_s == app_version.to_s", FASTFILE)
        self.assertIn(
            "verified_build.to_s == expected_build_number.to_s", FASTFILE)
        self.assertIn(
            '"reviewed_marketing_version=#{app_version}"', FASTFILE)
        self.assertIn(
            '"reserved_build_number=#{expected_build_number}"', FASTFILE)
        self.assertIn(
            "Signed App Store IPA must disable get-task-allow",
            FASTFILE,
        )
        self.assertIn(
            "App Store profile must disable get-task-allow",
            FASTFILE,
        )
        self.assertIn(
            'key: "Entitlements:beta-reports-active"', FASTFILE)
        self.assertIn(
            "App Store profile must enable beta-reports-active",
            FASTFILE,
        )
        self.assertIn(
            '"profile_beta_reports_active=#{profile_beta_reports_active}"',
            FASTFILE,
        )
        self.assertIn("Print :ProvisionedDevices", FASTFILE)
        self.assertIn(
            "App Store profile must not target provisioned devices",
            FASTFILE,
        )
        self.assertIn("Print :ProvisionsAllDevices", FASTFILE)
        self.assertIn(
            "App Store profile must not use enterprise all-device distribution",
            FASTFILE,
        )
        self.assertLess(
            FASTFILE.index("codesign -d --entitlements :-"),
            upload,
        )
        self.assertIn(
            '"profile_application_identifier=#{profile_application_identifier}"',
            FASTFILE,
        )
        self.assertIn(
            '"app_store_apple_id=#{app_store_apple_id}"',
            FASTFILE,
        )
        self.assertIn('ENV.fetch("SOURCE_COMMIT")', FASTFILE)
        self.assertIn(
            "TestFlight checkout does not match the pinned source commit",
            FASTFILE,
        )
        self.assertLess(
            FASTFILE.index("TestFlight checkout does not match"),
            upload,
        )
        upload_block = FASTFILE.split("upload_to_testflight(", 1)[1]
        self.assertIn("app_identifier: bundle_id", upload_block)
        self.assertIn("apple_id: app_store_apple_id", upload_block)
        self.assertIn("ipa: ipa_path", upload_block)
        self.assertNotIn('ipa: "build/ios/ipa/App.ipa"', upload_block)
        self.assertIn(
            'APP_STORE_APPLE_ID: ${{ secrets.APP_STORE_APPLE_ID }}',
            WORKFLOW,
        )

    def test_source_receipt_is_retained_after_later_failures(self):
        upload = WORKFLOW.split("      - name: Upload release-source receipt\n", 1)[1]
        self.assertIn("if: ${{ always() }}", upload)
        self.assertIn("path: release-source.txt", upload)

    def test_ipa_verification_receipt_survives_upload_failure(self):
        receipt = WORKFLOW.split(
            "      - name: Retain IPA verification receipt\n", 1)[1]
        receipt = receipt.split(
            "      - name: Upload release-source receipt\n", 1)[0]
        self.assertIn("if: ${{ always() }}", receipt)
        self.assertIn(
            "frontend/ios/App/build/ios/ipa/"
            "release-ipa-metadata.txt",
            receipt,
        )
        self.assertIn(
            "frontend/ios/App/build/ios/ipa/"
            "release-ipa-metadata.txt.sha256",
            receipt,
        )
        self.assertIn("if-no-files-found: ignore", receipt)

    def test_release_runbook_verifies_receipt_checksum(self):
        self.assertIn(
            "shasum -a 256 -c release-ipa-metadata.txt.sha256",
            RELEASE_GATE,
        )
        self.assertIn("release-ipa-metadata.txt: OK", RELEASE_GATE)
        self.assertIn(
            "`release-ipa-metadata.txt` and "
            "`release-ipa-metadata.txt.sha256` from the same",
            RELEASE_GATE,
        )
        for field in (
            "repository", "commit", "app_store_apple_id", "bundle_id",
            "version", "reviewed_marketing_version", "build_number",
            "reserved_build_number", "profile_application_identifier",
            "profile_top_level_team_identifier",
            "signed_application_identifier", "signed_team_identifier",
            "signing_authority", "signing_certificate_not_after",
            "certificate_minimum_validity_days",
            "profile_certificate_sha256", "profile_uuid", "profile_name",
            "signed_get_task_allow", "profile_get_task_allow",
            "profile_beta_reports_active", "profile_expiration",
            "profile_minimum_validity_days", "artifact", "sha256",
            "ipa_sha256",
        ):
            self.assertIn(f"`{field}`", RELEASE_GATE)
        self.assertIn(
            "or mismatched sidecar—invalidates the candidate",
            RELEASE_GATE,
        )

    def test_ephemeral_signing_keychain_uses_fresh_password(self):
        signing = WORKFLOW.split(
            "      - name: Install Apple Distribution certificate\n", 1)[1]
        signing = signing.split("      - name:", 1)[0]
        self.assertIn(
            'KEYCHAIN_PASSWORD="$(openssl rand -hex 32)"', signing)
        self.assertIn('test "${#KEYCHAIN_PASSWORD}" -eq 64', signing)
        self.assertNotIn("rmc-ci-keychain", signing)
        self.assertLess(
            signing.index("openssl rand -hex 32"),
            signing.index("security create-keychain"),
        )

    def test_temporary_signing_files_have_restrictive_permissions(self):
        signing = WORKFLOW.split(
            "      - name: Install Apple Distribution certificate\n", 1)[1]
        signing = signing.split("      - name:", 1)[0]
        profile = WORKFLOW.split(
            "      - name: Install provisioning profile\n", 1)[1]
        profile = profile.split("      - name:", 1)[0]
        for block in (signing, profile):
            self.assertIn("umask 077", block)
            self.assertIn("chmod 600", block)
            self.assertIn("stat -f '%Lp'", block)
        self.assertIn('chmod 700 "$PROFILE_DIR"', profile)

    def test_signing_material_cleanup_is_explicit_and_always_runs(self):
        cleanup = WORKFLOW.split(
            "      - name: Remove temporary signing material\n", 1)[1]
        self.assertIn("if: ${{ always() }}", cleanup)
        for path in (
            "$RUNNER_TEMP/distribution.p12",
            "$RUNNER_TEMP/rmc-build.keychain-db",
            "$HOME/Library/MobileDevice/Provisioning Profiles/"
            "RMC_Classics_App_Store_2026.mobileprovision",
        ):
            self.assertIn(path, CLEANUP_SCRIPT)
        self.assertIn('security delete-keychain "$KEYCHAIN_PATH" || true',
                      CLEANUP_SCRIPT)
        self.assertIn('rm -f "$CERTIFICATE_PATH" "$PROFILE_PATH"',
                      CLEANUP_SCRIPT)
        self.assertNotIn("rm -rf", CLEANUP_SCRIPT)
        self.assertGreater(
            WORKFLOW.index("      - name: Remove temporary signing material"),
            WORKFLOW.index("      - name: Upload release-source receipt"),
        )

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
        for sdk_key in (
            "", " ", "\t\n", "appl_", "sk_live_secret",
            "test_public", "appl_bad key", "appl_bad\x1fkey",
            "appl_" + ("x" * 508),
        ):
            with self.subTest(sdk_key=repr(sdk_key)):
                result = self.run_config(**{
                    **valid, "REACT_APP_REVENUECAT_IOS_KEY": sdk_key})
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
                   "GITHUB_REPOSITORY": "ldavis2700/rmc-classics",
                   "SOURCE_COMMIT": first}
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
