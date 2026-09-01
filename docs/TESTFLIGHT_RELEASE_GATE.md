# RMC Classics TestFlight release gate

Signed RMC Classics releases use Codemagic's `ios-testflight` workflow.

## Protected Codemagic configuration

The Codemagic app must retain:

- App Store Connect integration: `RMC ASC Key`
- protected variable group: `rmc_release`
- `APP_STORE_APPLE_ID`: the real numeric App Store Connect app ID
- `REACT_APP_REVENUECAT_IOS_KEY`: the iOS public SDK key
- App Store signing access for bundle ID `com.rmcclassics.app`

Do not commit signing keys, private RevenueCat keys, or App Store credentials.

## Required release checks

Before a signed build can continue, the workflow verifies:

1. its checked-out commit exactly equals current `origin/main`
2. the App Store app ID is a valid non-placeholder number
3. the RevenueCat iOS public SDK key is present
4. signing files can be fetched from the configured App Store Connect integration
5. the web bundle, Capacitor sync, CocoaPods install, and signed IPA build succeed

The current-main comparison runs first, followed by release-configuration validation, before dependency installation or the scripted signing/upload steps. Missing configuration reports variable names and the `rmc_release` group without printing values. Codemagic may perform its own signing setup before custom scripts.

If configuration validation fails, open the RMC Classics app's Codemagic environment variables and configure both values in the imported `rmc_release` group. Obtain the numeric Apple ID from **App Store Connect → RMC Classics → App Information**; it is not the bundle ID, Apple login, or API key ID. The RevenueCat value must be the **public iOS SDK key**, never a private/server key. Do not restart builds until configuration has been corrected. Presence/format checks do not prove the ID belongs to this app or that purchases work; signed build and sandbox purchase evidence are still required.

## Release sequence

1. Merge all intended corrections into `main`.
2. Wait for GitHub validation and the Vercel deployment check to pass.
3. Create a fresh `rmc-testflight/*` branch or `rmc-testflight-*` tag from that exact `main` commit, or manually select current `main` in Codemagic.
4. Confirm **Verify release source is current main** succeeds.
5. Confirm the remaining Codemagic steps succeed and the build appears in TestFlight.
6. Retain the generated `release-source.txt` artifact as commit evidence.
7. Smoke-test that exact TestFlight build before App Store submission.

A stale trigger must be replaced with a new trigger from current `main`; it must not be forced past the gate.
