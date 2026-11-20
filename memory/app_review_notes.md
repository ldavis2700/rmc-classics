# App Store Review Notes — RMC Classics candidate

Updated November 11, 2026. Preparation only: **not ready to paste or submit** until
all evidence gates below pass for the selected signed build and deployed backend.
This replaces the legacy 14-game draft and its unverified seeded-account claims.
Never put reviewer passwords in this repository; enter fresh, verified credentials
only in the private App Store Connect App Review Information fields.

## Candidate facts checked against source

- The catalog contains 15 games: Memory Match, Snakes & Ladders, Connect Four,
  Checkers, Rock Paper Scissors, Crazy Eights, Chess, Wild Cards, Ludo, Word Tiles,
  Dominoes, Spades, Go Fish, Old Maid and Tumble Tower.
- Dominoes supports computer play and two-player online tables. Spades supports
  computer play and four-player partnership tables. Public tables need real players;
  private invitations allow coordinated testing. Online XP/profile leaderboard
  awards are not included; online results remain at the table.
- Spades has no native Game Center leaderboard ID. Do not promise that every game
  submits a native score. Provisioning and device verification remain separate.
- Account Settings requires the current password, typing DELETE and a final
  confirmation before permanent deletion. Use disposable test accounts for this.
- The existing consumable identifier is `rmc.freeze.pack5`. Confirm localized
  store price and availability on the selected build; do not hardcode an old price.

Source: `frontend/src/lib/games.js`, `frontend/src/lib/gameCenter.js`,
`frontend/src/pages/AccountSettings.jsx`, `frontend/src/lib/iap.js`,
`docs/DOMINOES_SPADES.md`.

## Release evidence required before completing review fields

| Requirement | Evidence to record privately or in the release receipt |
| --- | --- |
| Candidate identity | Commit, IPA hash, bundle `com.rmcclassics.app`, version/build and processed App Store Connect build ID |
| Compatible production rollout | Actual hosting project, database binding/backup, backend/frontend revisions and rollback IDs; founding-pilot preview is insufficient |
| Public legal routes | Successful HTTPS content checks for `/privacy` and `/terms`, including direct navigation and no home-page fallback |
| Reviewer access | Fresh production login on the selected signed build, current Terms acceptance and a restricted reviewer account; no assumed seeded credentials |
| Sharing and rematches | Native share sheet/public invite, signed-out invite → login → same battle, concurrent rematch requests create one successor |
| Social safety | Terms acceptance, Report, Block with immediate removal, and password-confirmed permanent deletion on a disposable account |
| Purchases | Sandbox purchase fulfillment exactly once, account-switch isolation and restore without duplicate credit; record observed consumable behavior without promising replenishment |
| IAP submission | `rmc.freeze.pack5` review metadata/screenshot and association with the selected version verified in App Store Connect |
| Visual evidence | Screenshots from the actual candidate/device sizes, correct 15-game catalog, reviewer recording covering safety, sharing and deletion |
| Disclosures | Privacy labels, public policy and actual collected/account-linked data reconciled; do not call account-linked gameplay anonymous |

Retain the original review requirements in `docs/APPLE_REVIEW_2026-08-20.md`.
The historical build-14 reference is not a current build-number authority: query
App Store Connect and use the guarded release lane's monotonic build number.

## Reviewer note draft — complete only after the evidence above exists

> RMC CLASSICS contains 15 classic games, including Dominoes and Spades with
> computer play and online tables. Online Dominoes requires two players and
> partnership Spades requires four; private invitations support coordinated play.
>
> Sign in using the verified credentials in App Review Information. Registration
> and login require acceptance of our current Terms and Privacy Policy. In Friends,
> use Report or Block on a test player. Account Settings provides permanent account
> deletion with the current password, DELETE confirmation and a final prompt.
>
> For invitations, create a Friend Battle, use Share, and open the public invite
> while signed out. After authentication, the invite should return to that battle.
>
> The consumable Streak Freeze 5-Pack uses product ID rmc.freeze.pack5. The purchase
> control is in Profile → Store. Test purchase and restore in Apple's sandbox.
> Online table results do not award profile leaderboard XP, and Spades does not
> currently submit scores to a native Game Center board.

Before use, add the verified version/build, IAP review association and recording
location. Do not say attachments exist, store settings are complete or production
works until separately observed. Put contact details and reviewer credentials in
App Store Connect's private fields. Do not reuse the removed legacy passwords.

## Submission boundary

This document neither submits an app nor authorizes submission. Keep the draft
release gates until native compilation, signing, production acceptance and device
receipts support the candidate. Apple approval is a later, separate result.
