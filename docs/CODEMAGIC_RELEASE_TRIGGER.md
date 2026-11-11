# RMC Classics Codemagic release trigger

The signed `ios-testflight` workflow in `codemagic.yaml` is manually started only. It has no automatic branch, tag, or pull-request trigger. Creating `rmc-testflight/*` branches or `rmc-testflight-*` tags does not start a signed build; do not create them to work around this gate or repair a webhook for that purpose.

## Current-main source gate

Before installing dependencies or fetching signing files, every signed run fetches `origin/main` and stops unless its checked-out commit exactly matches current `main`. A manual run selected from a stale branch, tag or SHA fails this check. Select the current main revision after all intended release changes are merged and validated.

The workflow records the verified repository and commit in `release-source.txt`. A successful unsigned GitHub Actions archive is separate compilation evidence: it is not a signed IPA or a processed TestFlight build.

## Final-candidate sequence

1. Verify the main-game hosting destination and deploy compatible frontend/backend revisions with health, data-preservation and rollback evidence. The founding-pilot Vercel project does not establish main-game availability. Confirm the configured `https://rmcclassics.com` backend and privacy route work before building a candidate for device testing.
2. Confirm the intended release changes are merged into current `main` and required validation passed for that revision.
3. In the existing Codemagic app, verify access to the `RMC ASC Key` App Store Connect integration, the `com.rmcclassics.app` App Store signing configuration and protected `rmc_release` variable group. The group must contain the real numeric `APP_STORE_APPLE_ID` and public iOS `REACT_APP_REVENUECAT_IOS_KEY`; never paste private keys into repository files or receipts.
4. When the action-specific release gate is satisfied, deliberately start `ios-testflight` manually from current `main`. This workflow signs and uploads to TestFlight; it is not a read-only readiness check. Do not start it merely to discover whether credentials are configured.
5. Verify **Verify release source is current main**, signing/provenance checks and upload all succeed. Retain `release-source.txt`, the signed IPA and the workflow's provenance receipt. Confirm App Store Connect has processed the matching build.
6. Validate that exact signed build on devices against the deployed backend, using [TESTFLIGHT_RELEASE_GATE.md](TESTFLIGHT_RELEASE_GATE.md). Match screenshots, review recording, purchase/restore evidence and App Store metadata to the actual candidate before declaring resubmission readiness.

No step here submits the app to Apple review. Store submission is a separate authorized action. If Codemagic or App Store Connect authentication is unavailable, record provider state as unverified and continue independent release work; do not infer signing readiness from repository configuration.
