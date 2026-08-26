# RMC Classics Codemagic release trigger

The signed `ios-testflight` Codemagic workflow is intentionally release-gated.

## Accepted starts

Start the workflow with one of these deliberate choices:

- push a branch matching `rmc-testflight/*`
- create a tag matching `rmc-testflight-*`
- manually start the workflow in Codemagic

Ordinary pushes to `main` never start a signed build.

## Current-main source gate

Every signed run fetches `origin/main` before installing dependencies or fetching signing files. The workflow stops immediately unless its checked-out commit exactly matches current `main`.

This prevents an old release branch, tag, or manual selection from uploading a candidate that predates the latest safety or App Review corrections. Failed source verification happens before expensive release work and produces no TestFlight upload.

A successful run stores `release-source.txt` with the repository and verified commit alongside the build artifacts.

## Recommended final-candidate sequence

1. Confirm the intended release changes are merged into `main` and all GitHub/Vercel checks passed.
2. Create a fresh trigger from that exact commit, for example:
   - branch: `rmc-testflight/app-review-resubmission-YYYY-MM-DD`
   - tag: `rmc-testflight-YYYY.MM.DD-1`
3. Confirm Codemagic's first step, **Verify release source is current main**, succeeds.
4. Confirm the IPA uploads to TestFlight and retain `release-source.txt`.
5. Smoke-test that exact TestFlight build before selecting it in App Store Connect.

Never reuse an older trigger after `main` advances. Create a new trigger from the new `main` commit instead.

## One-time Codemagic UI check

If an accepted branch or tag does not trigger a build, open the RMC Classics app in Codemagic and repair the GitHub webhook under the app's webhook/integration settings. Manual starts remain available, but they must select current `main`.
