# Dominoes and Spades release integration — October 21, 2026

## Source and integration

- Repository: `ldavis2700/rmc-classics`.
- Base main: `2a8db6c84fd0944e03c5bf69d4abec007da22d85`.
- Feature PR #58: `85a6e8e8457640e34512b46dd2b6ccb338605266`.
- Release-hardening PR #57: `70e48dc78e687c27373ec62d205a9094a5472201`.
- Combined branch: `integration/dominoes-spades-release-20261021`.

Both PR heads were rechecked before preparing this branch. Their original PRs
remain open and unmodified. The integration retains both commit ancestries.
Merge and validate this combined candidate as a unit; do not independently merge
the overlapping older release candidates #54 and #56.

Conflict decisions:

- Preserve #57's guarded iOS and Codemagic release workflows, pinned npm install,
  purchase identity handling, certificate/profile checks and release receipts.
- Retain #58's MongoDB-backed tables, real MongoDB CI service and game tests.
- Use #58's shared `ComputerTable` Dominoes implementation. #57's hook repairs
  applied to the replaced legacy Dominoes component and are superseded by the
  new engine. Other game fixes remain intact.
- The two PRs initially shared the same package manifest and lockfile. A fresh
  production dependency audit found `follow-redirects` 1.16.0 advisories; this
  integration updates the override/resolution and lockfile to 1.16.1.

Additional release corrections:

- Verify the report/block disclosure stays open across clock/poll updates.
- Repair four stale release-test assertions without relaxing the application
  identity checks; add eight executable purchase/account-session scenarios using
  the real JavaScript module with fake store and network boundaries.
- Run the complete release regression directory in PR validation, plus the
  browser → production web bundle → FastAPI → disposable MongoDB flow.
- Add a non-publishing iOS archive workflow with exact source, bundle identity
  and unsigned-output receipts. It never accesses signing secrets or stores.
- Align GitHub iOS builds to the Xcode 26.5 toolchain already used by Codemagic,
  using the standard `macos-26` runner and explicit `DEVELOPER_DIR`.
- Bind native GitHub web bundles explicitly to `https://rmcclassics.com`.
  Previously the iOS GitHub workflow supplied only the purchase key, which could
  leave a native build using a relative API URL.
- Align Android readiness's handling of third-party source-map warnings with the
  existing web/iOS build configuration.

## Validation on the combined working tree

| Check | Result |
| --- | --- |
| Clean npm 10.9.4 install from updated lockfile | Passed; 1,594 packages |
| Full Python regression collection | 177 passed; includes release, purchase, game and safety tests |
| Executable IAP/account cases within the regression collection | 8 Node.js cases passed; no real store calls |
| Complete JavaScript/Python rules parity | Passed; 20 Dominoes matches and 3 complete Spades matches |
| Integration collection with real MongoDB 7.0.17 enabled | 6 passed; 5 real-database scenarios plus 1 mocked HTTP boundary scenario |
| Disposable integration database cleanup | Verified |
| Production frontend build | Passed; 15 game and 7 public route shells |
| Production npm dependency audit | 0 reported vulnerabilities after patch |
| Capacitor iOS asset/plugin synchronization | Passed; 8 plugins including RevenueCat 11.3.0 |
| Python/YAML syntax and diff whitespace | Passed |
| Full browser/API/MongoDB verification | Passed: login, private Spades hand/scoring, reconnect, next hand/forfeit, public Dominoes matchmaking and complete match, computer play, report/block, account deletion, mobile layout; no uncaught browser exceptions |
| Existing account, progress and purchase continuity | Synthetic pre-existing records remained unchanged through real API startup and browser gameplay; production records were not accessed |
| CocoaPods/Xcode compilation, IPA/AAB signing and device validation | Not established locally; Linux runner has no Xcode/CocoaPods or Android SDK |

The production build emits missing source-map warnings from third-party game
service/chess packages. These are not compile failures. Capacitor's Linux sync
explicitly skips pod installation and Xcode; sync is not native-build evidence.
The local browser used Playwright 1.58.2 with Chromium 153 and system fonts;
the committed CI path installs Playwright's matching Chromium. An initial local
failure came from the extracted browser's missing fonts; correcting its font
configuration made the original report/block interface pass. No speculative
interface change is retained. The browser harness blocks requests outside its
disposable loopback origin, including accidentally production-bound API calls.

The original heads' GitHub jobs failed before steps: #58 PR validation run
`39477442089`, and #57 Android readiness run `39160169373`, reported `steps: null`.
The Vercel success status belongs to the founding pilot. Neither signal proves
native compilation or production release. Record fresh combined-head CI results
on the integration PR before merging.

## Deployment and native targets

| Target | Confirmed evidence | Remaining gap |
| --- | --- | --- |
| Production web/API address | Repository/Codemagic use `https://rmcclassics.com`; `www` CNAME points to the apex | Both public host requests returned HTTP 503 from this execution environment; active hosting project and serving commit unconfirmed |
| Existing hosting path | Repository domain notes identify Emergent and legacy `childhood-games-5.emergent.host`; prior project context identifies `main` | Current authenticated RMC hosting dashboard/project not accessible or confirmed |
| Vercel | `rmc-classics-founding-pilot`, project `prj_6VTKBUxDau92IOD5XTBdNuSE3rfb`, generated Vercel domains only | A pilot preview, not proof of the application's production frontend/backend |
| Railway | Connected projects inventoried; existing services are HAEVEN | No confirmed RMC CLASSICS service; no HAEVEN service was repurposed |
| MongoDB | Existing backend selects `MONGO_URL` and `DB_NAME`; table feature reuses that connection | Current production database/project, backup and account continuity not verified |
| iOS identity | `com.rmcclassics.app`; RMC CLASSICS; existing Fastlane/Codemagic paths and `RMC ASC Key` integration named in source | Numeric App Store Connect record, active signing material and current distributed build not independently verified |
| Android identity | Capacitor/package gate uses `com.rmcclassics.app`; unsigned readiness AAB workflow retained | Existing Play record, upload certificate, uploaded version codes and signed release target not verified |

No production environment, DNS, database, payment configuration or store record
was changed. No additional paid infrastructure was provisioned.

## Coordinated release sequence

1. Identify the existing RMC hosting project and its database. Verify the
   production database binding and recoverable backup before any migration or
   hosting change. Preserve the existing JWT secret, account IDs, password hashes,
   progress collections, purchase event IDs, RevenueCat project and store identity.
   Never attach an empty database as a replacement for the existing application.
2. Require passing combined-head web/regression/integration and unsigned iOS/
   Android readiness checks. Keep the current-main checks on signed upload paths.
3. Record existing frontend/backend deployment IDs and configurations for rollback.
   Deploy the matching backend first, verify startup/index creation and authenticated
   table routes, then the frontend from the same candidate in one coordinated window.
   The additive table routes allow old clients to keep working during that window.
4. Verify actual public origin, both serving commits, authentication, legacy profile
   and purchase continuity, matchmaking, private invitations, complete games and
   reconnect. Roll back application binaries if necessary; do not restore an old
   database snapshot over newer account/game/purchase activity as a routine rollback.
5. Build signed native candidates only after binding the existing store app record,
   provisioning/upload certificates and RevenueCat public keys. Validate IPA/AAB
   identity, version monotonicity, signatures and receipts; run device and sandbox
   purchase/restore checks before distribution.
6. Independently verify processed TestFlight/Play candidate status, approved store
   version and public availability. Keep 'tested', 'deployed', and 'store available'
   as separate states. This document establishes no public release.

Online match results remain table-local under #58; online XP/profile leaderboard
awards are not part of this candidate. Existing profile progress is not migrated
or reset. New table TTL indexes apply only to the new `game_tables` collection.

Toolchain reference: https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md

Dependency advisory: https://github.com/advisories/GHSA-q3jh-wrc6-jgq8
