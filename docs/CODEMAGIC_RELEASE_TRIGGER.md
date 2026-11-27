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

## Read-only availability preflight

Both signed build paths run `python3 scripts/verify_release_endpoints.py --origin "$REACT_APP_BACKEND_URL" --match-backend-source` before dependency installation or signing. The configured HTTPS origin must return the RMC API identity, a Dominoes/Spades catalog, and the correct privacy/terms/support route titles and canonical URLs. Redirects, unavailable endpoints, HTML API fallbacks and home-page route fallbacks fail closed. Requests are GET-only, time-limited and size-limited; no account or payment is created.

With `--match-backend-source`, the gate also compares `/api/release` against the candidate's backend Python modules and requirements fingerprint. A stale or missing fingerprint fails. This proves a source-byte match within the fingerprint's scope, not a provider deployment ID, Git commit, database binding, health, gameplay or rollback. The result retains `provider_provenance_verified: false` and `resubmission_ready: false`. Unsigned compilation checks remain independent of production availability.

## Main-game deployment evidence required before the signed-build action

Record these in the existing PR #59 / HAE-12 receipt, without credentials:

| Evidence | Required content |
| --- | --- |
| Hosting ownership | Authenticated provider, existing main-game project/service/environment IDs, and verified domain binding for `rmcclassics.com` |
| Compatible release | Frontend and backend deployment IDs, source revisions, candidate backend fingerprint, and retained manifest from the actual deployment-specific web build |
| Account continuity | Existing database binding identified without connection secrets; recoverable backup reference and data-preservation validation |
| Rollback | Previous frontend/backend deployment IDs and restore procedure for application binaries; do not overwrite newer account/game/purchase activity with an old database snapshot |
| Serving acceptance | Public route checks, backend source match, frontend byte match, then authorized login, concurrent rematch, sharing and privacy checks against the deployed release |

Use `python3 scripts/verify_frontend_release.py --origin https://rmcclassics.com --manifest <retained-deployment-build>/rmc-release.json` for frontend byte matching. Supply the manifest from the actual web deployment build, not an unsigned native bundle or the CI test-analytics build. This verifier does not establish provider provenance or signed-device acceptance either.

As inspected November 26, 2026 Pacific, [main's commit status](https://api.github.com/repos/ldavis2700/rmc-classics/commits/452bdf529667f5a891a3a047542042a0381469da/status) reports Vercel success at the **rmc-classics-founding-pilot** project. That status must not satisfy the hosting or serving acceptance rows above. Repository `.emergent/emergent.yml` records historical job `53d31b84-1693-46a2-9ae4-b85867a81c00`; it does not establish the currently active project, domain or database. GitHub's releases list was empty at this inspection; this is not evidence about Apple distribution.

The current connected GitHub fetch interface rejected the deployments collection with HTTP 400 (endpoint not allowed). Treat deployment history as **unverified**, not empty or successful. Do not retry that unchanged interface restriction or infer hosting from a green commit status. Resolve the binding through an authenticated provider view when available; retain the accepted CI candidate while continuing independent app work.
