# RMC Classics TestFlight release gate

Signed RMC Classics releases use Codemagic's manually started `ios-testflight`
workflow. Repository pushes and tags do not start that signed workflow. The
manually dispatched GitHub `iOS Build & Upload to TestFlight` workflow is a
fallback and enforces the same current-main and monetization preflight gates.

## Protected Codemagic configuration

The Codemagic app must retain:

- App Store Connect integration: `RMC ASC Key`
- protected variable group: `rmc_release`
- `APP_STORE_APPLE_ID`: the real numeric App Store Connect app ID
- `REACT_APP_REVENUECAT_IOS_KEY`: the iOS public SDK key
- App Store signing access for bundle ID `com.rmcclassics.app`

Do not commit signing keys, private RevenueCat keys, or App Store credentials.

If the GitHub fallback is used, configure the equivalent repository Actions
secrets, including `APP_STORE_APPLE_ID` and `REACT_APP_REVENUECAT_IOS_KEY`.
Repository pushes and tags do not start the GitHub fallback. A manual dispatch
must explicitly confirm the TestFlight upload. That workflow validates every
named secret before installing dependencies and
injects the public RevenueCat key into the web build. It also retains a
`RMC-Classics-release-source` receipt alongside the IPA artifact. The
signed-IPA verification receipt uses an `always()` upload guard so
certificate, profile, version, and checksum evidence survives a later
TestFlight upload failure.

Before treating that receipt as evidence, download
`release-ipa-metadata.txt` and `release-ipa-metadata.txt.sha256` from the same
workflow run and verify the receipt itself:

```sh
shasum -a 256 -c release-ipa-metadata.txt.sha256
```

Proceed only when the command prints `release-ipa-metadata.txt: OK`; then bind
every critical field to the exact candidate and App Store record: `repository`,
`commit`, `app_store_apple_id`, `bundle_id`, `version`,
`reviewed_marketing_version`, `build_number`, `reserved_build_number`,
`profile_application_identifier`, `profile_top_level_team_identifier`,
`signed_application_identifier`, `signed_team_identifier`, `signing_authority`,
`signing_certificate_not_after`, `certificate_minimum_validity_days`,
`profile_certificate_sha256`, `profile_uuid`, `profile_name`,
`signed_get_task_allow`, `profile_get_task_allow`,
`profile_beta_reports_active`, `profile_expiration`,
`profile_minimum_validity_days`, `artifact`, and the lane-specific `sha256` or
`ipa_sha256`. A missing, mismatched, expired, or unexpected value—or a missing
or mismatched sidecar—invalidates the candidate.

## Required release checks

Before a signed build can continue, the workflow verifies:

1. its checked-out commit exactly equals current `origin/main`
2. the App Store app ID is a valid non-placeholder number
3. the RevenueCat iOS public SDK key is present
4. signing files can be fetched from the configured App Store Connect integration
5. the deployed release endpoints pass `scripts/verify_release_endpoints.py --match-backend-source`
6. the web bundle, Capacitor sync, CocoaPods install, and signed IPA build succeed

The current-main comparison runs first, followed by release-configuration validation, before dependency installation or the scripted signing/upload steps. Missing configuration reports variable names and the `rmc_release` group without printing values. Codemagic may perform its own signing setup before custom scripts.

If configuration validation fails, open the RMC Classics app's Codemagic environment variables and configure both values in the imported `rmc_release` group. Obtain the numeric Apple ID from **App Store Connect → RMC Classics → App Information**; it is not the bundle ID, Apple login, or API key ID. The RevenueCat value must be the **public iOS SDK key**, never a private/server key. Do not restart builds until configuration has been corrected. Presence/format checks do not prove the ID belongs to this app or that purchases work; signed build and sandbox purchase evidence are still required.

## Release sequence

1. Confirm the candidate incorporates all intended corrections and passes hosted
   PR, Android and unsigned iOS checks; then merge under the applicable review gates.
2. Identify the actual main-game hosting projects and database binding. Record
   compatible frontend/backend revisions, data-preservation/backup evidence and
   rollback identifiers; deploy the compatible pair using the verified provider.
   A founding-pilot Vercel preview or deployment check is insufficient.
3. Verify the deployed API/game metadata and direct privacy/terms/support routes.
   Run `python3 scripts/verify_release_endpoints.py --origin https://rmcclassics.com --match-backend-source`.
   This verifies availability and matching backend source, not provider provenance
   or signed-device functionality.
   Do not proceed through signing while the deployed endpoint gate fails.
4. With signed-build/upload authorization and verified App Store configuration,
   manually select current `main` in Codemagic and start `ios-testflight`;
   repository pushes and tags are intentionally ignored for this workflow.
5. Confirm **Verify release source is current main** and every remaining step
   succeeds, and independently confirm the processed build appears in TestFlight.
6. Retain `release-source.txt`, `release-ipa-metadata.txt`, and
   `release-ipa-metadata.txt.sha256` from the same run. Verify the receipt sidecar
   and bind every recorded identity field to the candidate and App Store record.
7. Test that exact signed build against the recorded deployed backend: login,
   invitations, concurrent rematch, native sharing, privacy routing, Game Center,
   safety/account deletion, sandbox purchase and restore. Record actual device
   results, candidate screenshots/recording and IAP/version association.
8. Assess resubmission readiness from those receipts. Submission to Apple remains
   a separate authorized action; preparing this checklist does not submit the app.

## Native integration evidence — November 18, 2026

PR #57 head `70e48dc78e687c27373ec62d205a9094a5472201` is an ancestor of PR #58
candidate `4ca9a4b28774ff3028f4cc69c6dc5e56858b48fa`. Verify with:

```sh
git merge-base --is-ancestor 70e48dc78e687c27373ec62d205a9094a5472201 4ca9a4b28774ff3028f4cc69c6dc5e56858b48fa
```

The candidate retains the current-main/configuration checks, RevenueCat key
injection, lockfile, Android setup and native signing verification. Later changes
add deployed-endpoint gating and pinned Xcode/CocoaPods/Fastlane startup checks.
Do not reapply an older native branch over these later safeguards.

Exact-candidate hosted results:

- [PR validation](https://github.com/ldavis2700/rmc-classics/actions/runs/44357078561): passed, including production-bundle/API/MongoDB browser checks.
- [Android readiness](https://github.com/ldavis2700/rmc-classics/actions/runs/44357078357): passed.
- [iOS readiness](https://github.com/ldavis2700/rmc-classics/actions/runs/44357078505): passed, including locked frontend sync, tool startup and unsigned native archive.

The unsigned readiness receipt records the compiled app's version/build number,
source tree, workflow run/attempt, bundle identifier, toolchain versions and
native API origin. Versions come from the archived app's Info.plist, not a
planned App Store version. Its executable checksum is a build record only:
the unsigned archive is not retained for distribution. Production, signed-device
and TestFlight flags remain false; a configured API origin is not a live check.

The iOS workflow explicitly sets `CODE_SIGNING_ALLOWED=NO` and rejects signed
output. Its readiness receipt is not a signed IPA, TestFlight upload, device test
or App Store approval. These results apply to the named commit; rerun applicable
checks after candidate changes. Production rollout and signed-device evidence
remain separate gates.

A stale manual selection must be replaced with current `main`; it must not be forced past the gate.

## Backend source identity

### Frontend artifact verification

`npm run build` also writes `frontend/build/rmc-release.json`, recording SHA-256
hashes of the completed HTML, JavaScript and CSS assets. Retain this manifest
with the exact web deployment artifact and its provider deployment/commit record.
Successful PR validation retains `rmc-web-evidence-<candidate>` for 14 days:
the tested `frontend-build.tar.gz`, `rmc-release.json`, source receipt and
`SHA256SUMS`. Verify `sha256sum -c SHA256SUMS` before using the downloaded files.
The receipt records both candidate and actual checkout/tree because pull-request
CI can test a synthetic merge commit. This artifact uses same-origin API routing
and is isolated CI evidence, not a signed native build or approved production
deployment. Check the recorded source tree, runtime configuration and full
deployment/rollback gates before any use beyond validation. Preserve the artifact
through the actual deployment provider when releasing; CI retention is finite.
After deploying that artifact, run:

```sh
python3 scripts/verify_frontend_release.py --origin https://rmcclassics.com --manifest frontend/build/rmc-release.json
```

The verifier compares the deployed manifest and independently downloads/hashes
every listed asset. Missing/stale assets, pilot HTML fallbacks, unsafe paths,
redirects and unavailable responses cannot pass. Use the retained deployed-web
artifact manifest, not a rebuild with different native/web configuration.
This complements the backend source check; it does not prove provider provenance,
database health, runtime configuration correctness, or signed-device acceptance.
Images/media are outside this manifest's scope and still require visual checks.

Both signed-build lanes require `/api/release` to return the same SHA-256
fingerprint as the candidate checkout. The API captures its fingerprint at process
startup from runtime Python files and `requirements.txt`; it excludes tests,
bytecode, `.env`, database contents and credentials. Missing identity, an older
backend, HTML fallback or a mismatched digest blocks signing. A documentation-only
commit does not require redeploying identical backend source.

The digest is a diagnostic source match, not a signed attestation. Independently
record provider deployment IDs/commits, frontend artifact identity, installed
dependencies, database binding, backup and rollback before release. The endpoint
does not establish database health, frontend compatibility, signing, purchases or
device acceptance. Keep `resubmission_ready` and `provider_provenance_verified`
false until those separate evidence gates are satisfied.
