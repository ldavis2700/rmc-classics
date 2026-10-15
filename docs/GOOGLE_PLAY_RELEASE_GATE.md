# Google Play Release Gate

This runbook is the minimum evidence gate for a public RMC CLASSICS Android release.

## Current boundary

- Application ID: `com.rmcclassics.app`.
- The pull-request Android workflow creates an **unsigned, non-publishing readiness AAB**.
- Never upload that readiness artifact to Google Play.
- No workflow in this branch signs, uploads, changes a Play listing, or starts a rollout.
- Google Play requires new apps and updates to target Android 16 / API level 36 from August 31, 2026: https://support.google.com/googleplay/android-developer/answer/11926878

## Owner-only prerequisites

Before a signed candidate is built, the owner must verify in Google Play Console:

1. The correct RMC FAMILY ENTERPRISES LLC developer account owns the app record.
2. The app record uses `com.rmcclassics.app`.
3. Play App Signing is configured and the upload-key certificate fingerprint is recorded.
4. The payments profile and merchant details are complete if monetization requires them.
5. The privacy-policy, support, Data safety, content-rating, target-audience, ads, and app-access declarations are accurate for the exact candidate.
6. Any required closed-testing or production-access requirement shown by Play Console is complete.
7. The signed Android build is configured with a RevenueCat **public Android SDK key** via `REACT_APP_REVENUECAT_ANDROID_KEY`; it must use the `goog_` key for this RMC CLASSICS app and must never reuse an iOS `appl_` key.

Do not paste keystores, passwords, service-account keys, or recovery material into GitHub issues, pull requests, logs, or this repository.

## Exact-source technical gate

All items below must pass on the same 40-character commit SHA:

1. PR validation succeeds with executable job steps.
2. Android readiness succeeds and retains:
   - `app-release.aab`
   - `app-release.aab.sha256`
   - `android-readiness-metadata.txt`
   - `android-readiness-metadata.txt.sha256`
3. Verify both sidecars:
   ```bash
   sha256sum --check --strict app-release.aab.sha256
   sha256sum --check --strict android-readiness-metadata.txt.sha256
   ```
4. Require the metadata to bind:
   - repository and exact commit
   - `bundle_id=com.rmcclassics.app`
   - positive `version_code`
   - nonblank `version_name`
   - `compile_sdk=36`
   - `target_sdk=36`
   - artifact path and SHA-256
   - `signing_state=unsigned-readiness-only`
5. Confirm `version_code` is greater than every build already uploaded to Play Console.

The readiness result proves source/build viability only. It is not the signed candidate.

## Signed candidate gate

Build the signed release AAB from the already-validated exact commit using the owner-controlled upload key. The build must fail closed if purchases/restores are enabled and `REACT_APP_REVENUECAT_ANDROID_KEY` is absent or does not begin with `goog_`. Never substitute `REACT_APP_REVENUECAT_IOS_KEY` or an `appl_` key. Then:

1. Record the signed AAB SHA-256 and the RevenueCat key identifier or fingerprint without recording the full key.
2. Verify the archive:
   ```bash
   unzip -t app-release.aab
   jarsigner -verify -verbose -certs app-release.aab
   ```
3. Verify the signing certificate SHA-256 fingerprint matches the owner-recorded upload certificate.
4. Reconfirm application ID, version code/name, target SDK 36, and exact source commit.
5. Run device smoke tests for sign-in, game launch, multiplayer/rematch, sharing, purchases/restores if enabled, privacy/support links, offline/retry behavior, and account deletion.
6. Retain a release receipt containing the commit SHA, AAB SHA-256, application ID, version code/name, SDK levels, signing fingerprint, test results, and reviewer identity.

## Upload and rollout gate

Uploading, accepting Play Console declarations, choosing countries, setting pricing, and starting any rollout are owner-approved consequential actions.

Before upload:

- compare the final store listing and Data safety answers to the candidate;
- confirm no unreleased feature is advertised;
- confirm reviewer credentials and instructions work, if required;
- confirm support and privacy URLs resolve publicly;
- confirm the signed candidate receipt is complete.

After upload, resolve every Play pre-launch or policy finding. Start with a staged rollout when Play Console permits it, monitor crashes/ANRs and authentication failures, and halt expansion if release health regresses.
