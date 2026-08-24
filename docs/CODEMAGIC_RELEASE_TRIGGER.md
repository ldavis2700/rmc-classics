# RMC Classics Codemagic release trigger

The signed `ios-testflight` Codemagic workflow is intentionally release-gated.

## Automatic TestFlight release

Create a Git tag matching:

`rmc-testflight-*`

Example:

`rmc-testflight-2026.08.24-1`

When Codemagic's GitHub webhook is active, that tag event starts the `ios-testflight` workflow automatically. The workflow imports the protected `rmc_release` variable group, fetches App Store signing files through the configured `RMC ASC Key` integration, builds the IPA, and submits it to TestFlight.

## Safety guardrail

Ordinary pushes to `main` do not trigger signed iOS builds. Manual starts remain available as a fallback.

## One-time Codemagic UI check

If a matching tag does not trigger a build, open the RMC Classics app in Codemagic and update/repair the GitHub webhook under the app's webhook/integration settings. The repository is connected through the GitHub App, but Codemagic must receive the tag webhook for automatic triggering to work.
