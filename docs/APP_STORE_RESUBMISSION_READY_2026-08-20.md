# RMC Classics — App Store Resubmission Readiness

Date: 2026-08-20

## Code remediation completed

The current `main` codebase addresses the Apple review blockers identified in the latest review:

- **Guideline 1.2 — User Generated Content / social safety**
  - New account registration requires explicit acceptance of the Terms of Use and Privacy Policy.
  - Player/friend surfaces provide **Report** and **Block** actions.
  - Blocking immediately removes the blocked player from the user's friends/social surface.
  - Report and block events are recorded for developer moderation.
- **Guideline 5.1.1(v) — Account deletion**
  - Signed-in users have an in-app **Permanently delete account** flow under Account Settings.
  - The flow requires typing `DELETE` plus a final confirmation.
  - The authenticated backend permanently removes the user account and associated account-linked data.
- **Guideline 2.1(b) — In-App Purchase submission**
  - Existing consumable product ID remains `rmc.freeze.pack5`.
  - Server-side purchase fulfillment remains protected against duplicate crediting.
  - The release lane now automatically selects a build number newer than the latest TestFlight build for version 1.0.

## Required App Store Connect completion gate

These are App Store Connect / physical-device evidence steps and cannot be satisfied by source-code changes alone:

1. Open the existing consumable IAP **`rmc.freeze.pack5`** in App Store Connect.
2. Confirm its metadata is complete and add Apple's required **App Review screenshot** showing where the Streak Freeze purchase appears in the app (Profile → Store).
3. Attach/submit the IAP with the RMC Classics 1.0 app version as required by App Store Connect.
4. Upload a **new binary newer than build 14**. The Fastlane release lane now retrieves the latest TestFlight build number and increments it automatically.
5. Select that new processed build for version 1.0.
6. On a physical iPhone, capture a short reviewer recording showing, in this order:
   - Create Account → Terms of Use / Privacy Policy acceptance checkbox.
   - Friends/social surface → **Report** another test user.
   - Friends/social surface → **Block** that user and show their immediate removal.
   - Account Settings → Permanently delete account → type `DELETE` → confirm deletion.
7. Attach the recording in **App Review Information** (or provide a reviewer-accessible link if App Store Connect requests a link).
8. Verify the demo/reviewer account still works on the production backend before resubmission.
9. Save, add version 1.0 for review, and submit.

## Recommended App Review Notes

Paste/adapt this concise note into App Review Information:

> Hi App Review,
>
> Thank you for the prior feedback. This new RMC Classics build specifically addresses the cited issues:
>
> **Guideline 1.2:** Account creation now requires acceptance of our Terms of Use and Privacy Policy. Social player surfaces include Report and Block actions. Blocking immediately removes the blocked account from the user's social/friends surface, and report/block events are recorded for developer moderation.
>
> **Guideline 5.1.1(v):** Signed-in users can permanently delete their account in Account Settings → Permanently delete account. The app requires typing DELETE plus a final confirmation; deletion permanently removes the account and associated account-linked data from the server.
>
> **Guideline 2.1(b):** Consumable IAP `rmc.freeze.pack5` is included with its App Review metadata/screenshot and attached to this new binary.
>
> A physical-device reviewer recording is attached demonstrating Terms acceptance, Report, Block, and permanent account deletion. The demo-account credentials are entered in the App Review Information fields.
>
> Thank you for reviewing the remediation.

## Final validation before pressing Submit for Review

- New binary is processed and selectable.
- Reviewer login succeeds against production.
- Terms acceptance is visible on registration.
- Report succeeds.
- Block succeeds and immediately hides/removes the blocked user from the relevant social surface.
- Permanent account deletion succeeds end-to-end.
- `rmc.freeze.pack5` appears with completed review metadata and screenshot.
- IAP is associated with the submitted app version where required.
- Privacy Policy and Terms URLs open publicly.
- Physical-device evidence is attached.

Do not describe RMC Classics as App Store accepted until Apple returns an approval decision. Completing this checklist makes the build **resubmission-ready**, not pre-approved.
