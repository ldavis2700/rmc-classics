"""Execute the actual Codemagic release configuration block without providers."""

import os
from pathlib import Path
import subprocess
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "codemagic.yaml").read_text()
IAP = (ROOT / "frontend/src/lib/iap.js").read_text()
AUTH = (ROOT / "frontend/src/context/AuthContext.jsx").read_text()
GATE = "      - name: Validate monetization release configuration\n"
BLOCK = CONFIG.split(GATE, 1)[1].split("      - name:", 1)[0]
SCRIPT = textwrap.dedent(BLOCK.split("        script: |\n", 1)[1])


class ReleaseConfigurationGuardTests(unittest.TestCase):
    def test_codemagic_workflow_keys_are_unique(self):
        self.assertEqual(CONFIG.count("\n  ios-testflight:\n"), 1)
        self.assertEqual(CONFIG.count("\n  ios-unsigned:\n"), 1)

    def run_gate(self, app_id=None, sdk_key=None):
        env = {k: v for k, v in os.environ.items() if k not in (
            "APP_STORE_APPLE_ID", "REACT_APP_REVENUECAT_IOS_KEY")}
        if app_id is not None:
            env["APP_STORE_APPLE_ID"] = app_id
        if sdk_key is not None:
            env["REACT_APP_REVENUECAT_IOS_KEY"] = sdk_key
        return subprocess.run(["bash", "-c", SCRIPT], env=env,
                              text=True, capture_output=True)

    def test_gate_precedes_dependency_install_and_archive(self):
        signed = CONFIG.split("  ios-unsigned:", 1)[0]
        self.assertLess(signed.index("Verify release source is current main"), signed.index(GATE))
        for step in ("Install frontend deps", "Build the web bundle", "Build .ipa"):
            self.assertLess(signed.index(GATE), signed.index("      - name: " + step))

    def test_ios_workflows_pin_the_reviewed_xcode_toolchain(self):
        self.assertNotIn("xcode: latest", CONFIG)
        self.assertEqual(CONFIG.count("xcode: 26.5"), 2)

    def test_signed_ipa_is_verified_before_publishing(self):
        signed = CONFIG.split("  ios-unsigned:", 1)[0]
        build = signed.index("      - name: Build .ipa")
        verify = signed.index(
            "      - name: Verify signed IPA identity and record provenance")
        artifacts = signed.index("    artifacts:")
        publishing = signed.index("    publishing:")
        self.assertLess(build, verify)
        self.assertLess(verify, artifacts)
        self.assertLess(artifacts, publishing)
        verification = signed[verify:artifacts]
        self.assertIn('test "$IPA_COUNT" = "1"', verification)
        self.assertIn('codesign --verify --deep --strict "$APP_PATH"', verification)
        self.assertIn('codesign -dv --verbose=4 "$APP_PATH"', verification)
        self.assertIn('"Apple Distribution"*)', verification)
        self.assertIn(
            "Signed IPA must use an Apple Distribution certificate",
            verification,
        )
        self.assertIn('echo "signing_authority=$SIGNING_AUTHORITY"', verification)
        self.assertIn(
            'echo "app_store_apple_id=$APP_STORE_APPLE_ID"',
            verification,
        )
        self.assertIn(
            'codesign -d --extract-certificates "$CERTIFICATE_PREFIX"',
            verification,
        )
        self.assertIn("CERTIFICATE_MINIMUM_VALIDITY_DAYS=30", verification)
        self.assertIn(
            '-checkend "$((CERTIFICATE_MINIMUM_VALIDITY_DAYS * 86400))"',
            verification,
        )
        self.assertIn(
            'echo "signing_certificate_not_after='
            '$SIGNING_CERTIFICATE_NOT_AFTER"',
            verification,
        )
        self.assertIn('test "$BUNDLE_ID" = "com.rmcclassics.app"', verification)
        self.assertIn(
            'test "$PROFILE_APPLICATION_IDENTIFIER" = '
            '"$PROFILE_TEAM_IDENTIFIER.$BUNDLE_ID"',
            verification,
        )
        self.assertIn("Print :TeamIdentifier:0", verification)
        self.assertIn(
            'test "$PROFILE_TOP_LEVEL_TEAM_IDENTIFIER" = '
            '"$PROFILE_TEAM_IDENTIFIER"',
            verification,
        )
        self.assertIn(
            'echo "profile_top_level_team_identifier='
            '$PROFILE_TOP_LEVEL_TEAM_IDENTIFIER"',
            verification,
        )
        self.assertIn("security cms -D -i", verification)
        self.assertIn("verify_ios_profile_certificate.py", verification)
        self.assertIn('--certificate "$LEAF_CERTIFICATE"', verification)
        self.assertIn("profile_certificate_sha256=", verification)
        self.assertIn('echo "profile_uuid=$PROFILE_UUID"', verification)
        self.assertIn('echo "profile_name=$PROFILE_NAME"', verification)
        self.assertIn("Provisioning profile UUID is missing", verification)
        self.assertIn("Provisioning profile name is missing", verification)
        self.assertIn("codesign -d --entitlements :-", verification)
        self.assertIn(
            'test "$SIGNED_APPLICATION_IDENTIFIER" = '
            '"$PROFILE_APPLICATION_IDENTIFIER"',
            verification,
        )
        self.assertIn(
            'test "$SIGNED_TEAM_IDENTIFIER" = "$PROFILE_TEAM_IDENTIFIER"',
            verification,
        )
        self.assertIn(
            'test "$SIGNED_GET_TASK_ALLOW" = "false"',
            verification,
        )
        self.assertIn(
            'test "$PROFILE_GET_TASK_ALLOW" = "false"',
            verification,
        )
        self.assertIn(
            "Print :Entitlements:beta-reports-active", verification)
        self.assertIn(
            'test "$PROFILE_BETA_REPORTS_ACTIVE" = "true"',
            verification,
        )
        self.assertIn(
            "App Store profile must enable beta-reports-active",
            verification,
        )
        self.assertIn(
            'echo "profile_beta_reports_active='
            '$PROFILE_BETA_REPORTS_ACTIVE"',
            verification,
        )
        self.assertIn(
            'grep -Fqx "profile_beta_reports_active=true"',
            verification,
        )
        self.assertIn("Print :ProvisionedDevices", verification)
        self.assertIn(
            "App Store profile must not target provisioned devices",
            verification,
        )
        self.assertIn("Print :ProvisionsAllDevices", verification)
        self.assertIn(
            "App Store profile must not use enterprise all-device distribution",
            verification,
        )
        self.assertIn("PROFILE_MINIMUM_VALIDITY_DAYS=30", verification)
        self.assertIn(
            "Provisioning profile must remain valid for at least",
            verification,
        )
        self.assertIn("IPA build number must be numeric", verification)
        self.assertIn('shasum -a 256 "$IPA_PATH"', verification)
        self.assertIn(
            'printf \'%s\' "$REACT_APP_REVENUECAT_IOS_KEY" | shasum -a 256',
            verification,
        )
        self.assertIn(
            'echo "revenuecat_ios_key_sha256=$REVENUECAT_IOS_KEY_SHA256"',
            verification,
        )
        self.assertIn(
            "grep -Eq '^revenuecat_ios_key_sha256=[0-9a-f]{64}$'",
            verification,
        )
        self.assertIn(
            'grep -Fqx "revenuecat_ios_key_sha256='
            '$REVENUECAT_IOS_KEY_SHA256" "$RECEIPT"',
            verification,
        )
        self.assertIn(
            "- $CM_BUILD_DIR/release-ipa-metadata.txt", signed)
        self.assertIn(
            'shasum -a 256 -c "$receipt_name.sha256"', verification)
        self.assertIn(
            "- $CM_BUILD_DIR/release-ipa-metadata.txt.sha256", signed)

    def test_auth_waits_for_iap_readiness_before_success(self):
        self.assertEqual(
            AUTH.count("await configureIAP(data.user?.id);"),
            3,
        )
        self.assertNotIn("void configureIAP(data.user?.id);", AUTH)
        self.assertNotIn("\n      configureIAP(data.user?.id);", AUTH)

    def test_signed_out_sessions_disable_paid_actions_and_can_recover(self):
        self.assertIn(
            'import { configureIAP, suspendIAP } from "@/lib/iap";',
            AUTH,
        )
        self.assertEqual(AUTH.count("suspendIAP();"), 4)
        self.assertIn("export function suspendIAP()", IAP)
        self.assertIn('configuredUserId = "";', IAP)
        switch_failure = IAP.split(
            'console.warn("RevenueCat user switch failed")', 1
        )[0].rsplit("} catch {", 1)[1]
        self.assertNotIn("configured = false", switch_failure)
        self.assertIn('configuredUserId = "";', switch_failure)

    def test_missing_native_identity_or_key_disables_paid_actions(self):
        configure = IAP.split(
            "async function configureIAPRequest", 1
        )[1].split("/** Configure RevenueCat", 1)[0]
        self.assertIn("if (!isNative()) return false;", configure)
        self.assertIn("if (!normalizedUserId || !revenueCatKey) {", configure)
        self.assertIn('configuredUserId = "";', configure)

    def test_iap_identity_configuration_is_serialized_and_stale_safe(self):
        self.assertIn("let configurationQueue = Promise.resolve();", IAP)
        self.assertIn("const requestGeneration = ++configurationGeneration;", IAP)
        self.assertIn("configurationQueue.then(request, request)", IAP)
        wrapper = IAP.split(
            "export async function configureIAP", 1
        )[1].split("/** Disable paid actions", 1)[0]
        self.assertIn(
            "if (configuredUserId !== normalizedUserId)", wrapper
        )
        self.assertLess(
            wrapper.index('configuredUserId = "";'),
            wrapper.index("configurationQueue.then(request, request)"),
        )
        self.assertEqual(
            IAP.count("requestGeneration !== configurationGeneration"),
            3,
        )
        initial_configure = IAP.split(
            "await Purchases.configure", 1
        )[1].split("} catch {", 1)[0]
        self.assertLess(
            initial_configure.index("configured = true;"),
            initial_configure.index(
                "requestGeneration !== configurationGeneration"
            ),
        )
        suspend = IAP.split("export function suspendIAP()", 1)[1].split(
            "function iapSessionStillActive", 1
        )[0]
        self.assertIn("configurationGeneration += 1;", suspend)
        self.assertLess(
            suspend.index("configurationGeneration += 1;"),
            suspend.index('configuredUserId = "";'),
        )

    def test_purchase_cancellation_uses_explicit_sdk_signal(self):
        self.assertIn("err?.userCancelled === true", IAP)
        self.assertNotIn('includes("cancel")', IAP)
        self.assertNotIn("err?.message", IAP)

    def test_consumable_lookup_uses_non_subscription_category(self):
        self.assertIn("cachedProductCategory = mod.PRODUCT_CATEGORY", IAP)
        self.assertIn("cachedProductCategory?.NON_SUBSCRIPTION == null", IAP)
        self.assertIn("type: cachedProductCategory.NON_SUBSCRIPTION", IAP)

    def test_both_missing_reports_all_required_names_without_unbound_error(self):
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("APP_STORE_APPLE_ID must", result.stdout)
        self.assertIn("REACT_APP_REVENUECAT_IOS_KEY must", result.stdout)
        self.assertIn("rmc_release", result.stdout)
        self.assertNotIn("unbound variable", result.stderr)

    def test_valid_format_passes_without_printing_values(self):
        result = self.run_gate("1234567890", "appl_test_fixture_not_a_real_key")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_malformed_ids_fail_including_embedded_valid_line(self):
        for app_id in ("", "0", "0000000000", "com.rmcclassics.app", " 123", "123 ",
                       "123\ninvalid", "invalid\n123", "123\n", "１２３"):
            with self.subTest(app_id=repr(app_id)):
                result = self.run_gate(app_id, "appl_test_fixture_not_a_real_key")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("APP_STORE_APPLE_ID must", result.stdout)
                self.assertNotIn("appl_test_fixture", result.stdout + result.stderr)

    def test_absent_empty_or_whitespace_sdk_key_fails(self):
        for key in (None, "", " ", "\t\n", "sk_live_secret",
                    "test_public", "appl_bad key"):
            with self.subTest(key=repr(key)):
                result = self.run_gate("1234567890", key)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("REACT_APP_REVENUECAT_IOS_KEY must", result.stdout)
                self.assertNotIn("1234567890", result.stdout + result.stderr)


    def test_purchase_sync_stays_bound_to_the_purchasing_account(self):
        purchase = IAP.split(
            "export async function purchaseFreezePack", 1
        )[1].split("/** Restore purchases", 1)[0]
        self.assertIn("const purchaseUserId = configuredUserId;", purchase)
        self.assertIn(
            "const purchaseGeneration = configurationGeneration;", purchase
        )
        self.assertEqual(
            purchase.count(
                "iapSessionStillActive(purchaseUserId, purchaseGeneration)"
            ),
            5,
        )
        self.assertLess(
            purchase.index(
                "iapSessionStillActive(purchaseUserId, purchaseGeneration)"
            ),
            purchase.index("Purchases.getProducts"),
        )
        self.assertLess(
            purchase.index(
                "iapSessionStillActive(purchaseUserId, purchaseGeneration)",
                purchase.index("Purchases.getProducts"),
            ),
            purchase.index("Purchases.purchaseStoreProduct"),
        )
        sync_call = purchase.index('api.post("/iap/sync"')
        session_checks = [
            index for index in range(len(purchase))
            if purchase.startswith(
                "iapSessionStillActive(purchaseUserId, purchaseGeneration)",
                index,
            )
        ]
        self.assertLess(session_checks[1], sync_call)
        self.assertGreater(session_checks[2], sync_call)
        self.assertLess(
            session_checks[2], purchase.index("validatedSyncPayload(data)")
        )
        self.assertIn(
            "iapSessionStillActive(purchaseUserId, purchaseGeneration)",
            purchase.split("} catch (err) {", 1)[1],
        )
        self.assertIn("return pendingCreditSyncResult();", purchase)
        self.assertIn(
            "sign in to the purchasing account and tap Restore Purchases",
            IAP,
        )

    def test_restore_sync_aborts_if_the_local_account_changes(self):
        restore = IAP.split(
            "export async function restorePurchases", 1
        )[1]
        self.assertIn("const restoreUserId = configuredUserId;", restore)
        self.assertIn(
            "const restoreGeneration = configurationGeneration;", restore
        )
        self.assertEqual(
            restore.count(
                "iapSessionStillActive(restoreUserId, restoreGeneration)"
            ),
            4,
        )
        self.assertLess(
            restore.index(
                "iapSessionStillActive(restoreUserId, restoreGeneration)"
            ),
            restore.index('api.post("/iap/sync"'),
        )
        restore_checks = [
            index for index in range(len(restore))
            if restore.startswith(
                "iapSessionStillActive(restoreUserId, restoreGeneration)",
                index,
            )
        ]
        self.assertGreater(
            restore_checks[2], restore.index('api.post("/iap/sync"')
        )
        self.assertLess(
            restore_checks[2], restore.index("validatedSyncPayload(data)")
        )
        self.assertIn(
            "iapSessionStillActive(restoreUserId, restoreGeneration)",
            restore.split("} catch (err) {", 1)[1],
        )


if __name__ == "__main__":
    unittest.main()
