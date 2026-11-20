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
planned App Store version. This historical run retained only the executable checksum. Later candidate
`29de5ea8bf86eadd9463d3375d47e265fb730fce` retains the unsigned archive for
inspection (see the privacy evidence below), not signed distribution. Production, signed-device
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

## Overlapping release jobs and retries

The GitHub concurrency group serializes only this repository's GitHub signed
workflow. It does not lock Codemagic, local uploads or App Store Connect.
Both release paths read a latest build number and select the next number.
The existing `reserved_build_number` receipt field and
`reserved-build-number.txt` are records of that local selection, **not an atomic
provider reservation**. Two jobs that read N before either upload becomes visible
can both select N+1. No collision was observed in production; this is a verified
gap in the source-level coordination.

Before any authorized signed release, the connected operator must:

1. Inspect both providers' current queued/running signed jobs and unresolved
   upload attempts for this app. Use one release provider for the attempt and
   record its run ID, source commit and chosen number in the canonical receipt.
   If either provider's state is inaccessible, do not infer that it is idle.
2. Do not start the fallback while Codemagic is queued/running, uploading or
   awaiting reconciliation, or vice versa. The same applies to overlapping
   Codemagic starts. Do not cancel an upload merely to switch providers.
3. After a timeout, cancellation or ambiguous upload result, inspect App Store
   Connect for the app/version/build and processing state before retrying.
   A successful transport response alone does not prove processed TestFlight
   availability. A failed client response does not prove Apple received nothing.
4. If that exact build is already present, reconcile its candidate/receipt and
   processing state. Do not upload it again or label it successful without that
   evidence. If a new authorized build is necessary, reread the latest provider
   state and rebuild with the newly selected number; never edit an existing IPA
   or its receipt to relabel it.

These are release-operation checks, not new owner-only work. They reduce
operational overlap but do not create a distributed lock. Automated concurrent
signed releases remain unsupported until a shared atomic allocator/lock is
implemented and tested across both providers. A late pre-upload read alone would
still have a race and must not be described as a fix.


## Privacy disclosure reconciliation — November 19, 2026

Source audited: `29de5ea8bf86eadd9463d3375d47e265fb730fce`.
This is a source and retained-artifact audit, not a live data-flow measurement
or a completed App Store privacy questionnaire.

The three hosted checks for that candidate passed:
[PR validation](https://github.com/ldavis2700/rmc-classics/actions/runs/44687479958),
[iOS readiness](https://github.com/ldavis2700/rmc-classics/actions/runs/44687480157),
and [Android readiness](https://github.com/ldavis2700/rmc-classics/actions/runs/44687480063).
The [independent archive receipt](https://github.com/ldavis2700/rmc-classics/pull/59#issuecomment-7032376901)
confirms the app and CapacitorPreferences framework both contain the
UserDefaults/CA92.1 declaration. Artifact `14607397177` expires December 4,
2026 at 06:29:14 UTC. Provider ZIP SHA-256:
`4c33f2cc87e6d4cd466a7869c0ce404fc038395f3f845447cf913f9a9933c557`.
Preserve this distinction: required-reason declarations explain API use;
they do not establish complete app data-collection disclosures.

| Source evidence | Remaining release acceptance |
| --- | --- |
| `frontend/src/lib/iap.js` configures RevenueCat and calls logIn with the signed-in user's stable appUserID. `backend/server.py` queries the subscriber by that ID and records transaction IDs in the user's processed_iap field. | Reconcile account-linked identifiers and purchase history in the app-level privacy disclosures and actual App Store Connect answers. Do not copy a vendor manifest's unlinked-data flag as proof that this app's purchase data is unlinked. Verify provider configuration and runtime behavior before finalizing answers. |
| `frontend/src/pages/Legal.jsx` names RevenueCat but does not explicitly list the account-linked purchase/transaction data in What we collect. | Add an accurate, source-supported explanation of purchase verification and account linkage to the canonical policy, then verify the deployed and native views show that policy. No store answer has been changed by this audit. |
| `frontend/public/privacy.html` is a separate static policy mentioning possible Firebase analytics; `frontend/src/App.js` renders Legal.jsx at /privacy. The static file lacks the detailed account deletion, online-table and purchase-provider content in Legal.jsx. | Determine which URLs are used by the actual hosting provider and App Store record. Reconcile the static and routed policies, retaining a usable direct public route. Do not infer the deployed response from source files alone. |
| Legal.jsx asserts MongoDB encryption at rest and names MongoDB Atlas and Cloudflare. Current main-game provider/database provenance is unverified. | Verify those infrastructure claims against the actual main-game configuration before publication. Repository assertions and the founding-pilot preview are not evidence of production encryption or provider identity. |

Next independent work is policy-content/routing reconciliation and verification
of the actual provider/store configuration. Complete privacy questionnaire and
signed-device acceptance remain separate release gates. Do not infer no data
collection, no tracking, or Apple approval from successful compilation or the
absence of an API name in a binary-string search.
