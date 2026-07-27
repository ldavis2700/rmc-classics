# App Store Review Notes — RMC Classics v1.0

> Copy the sections below into the matching fields in **App Store Connect → your app → App Review Information**. Then attach any demo videos in the Attachments field.

---

## Contact Information

| Field | Value |
|---|---|
| First name | *(your first name)* |
| Last name | *(your last name)* |
| Phone | *(your phone in international format, e.g. `+1 555 123 4567`)* |
| Email | `hello@rmcclassics.com` |

## Sign-in Required

- Set toggle to: **Yes, sign-in is required**

## Demo Account

Provide **both** — reviewer may test either. Both are pre-seeded on the live backend.

| Field | Value |
|---|---|
| Username | `admin@rmc.com` |
| Password | `admin123` |

Alternative account (also works):
- Username: `player1@rmc.com`
- Password: `player123`

## Notes (paste into the "Notes" field — this is the letter to the reviewer)

```
Hi Reviewer,

Thanks for taking the time to review RMC CLASSICS. Below are notes to make your review faster.

WHAT THE APP IS
A nostalgic collection of 14 timeless childhood games (Chess, Ludo, Memory Match, Connect Four, Checkers, Snakes & Ladders, Rock Paper Scissors, Crazy Eights, Wild Cards, Word Tiles, Dominoes, Go Fish, Old Maid, Tumble Tower). Users can play solo, compete on global and weekly leaderboards, complete a daily challenge, battle friends in real time over WebSocket, and unlock badges and themes.

HOW TO USE THE DEMO ACCOUNT
Email: admin@rmc.com    Password: admin123
- The account already has XP, streak history, friends, and unlocked themes so you can see the full experience without seeding data.
- All 14 games are playable immediately from Library or Home.

NATIVE FEATURES (please note for Guideline 4.2)
This is NOT a thin web wrapper. The app uses these native iOS integrations:
1. Apple Game Center — silent sign-in on launch, every game score is auto-submitted to per-game leaderboards. Leaderboard IDs match the ones we configured (rmc.chess.wins, rmc.wildcards.wins, etc.).
2. In-App Purchase — one consumable "Streak Freeze 5-Pack" ($0.99). Buy button visible on the Profile tab. Restore Purchases button included as required.
3. Haptic feedback — engaged on card flips, block pulls, move confirms, and game over.
4. Local Notifications — user can enable a daily 7pm reminder from Profile ("Turn On" button). Uses UNUserNotificationCenter, no external push service.
5. Native Share Sheet — every game-over screen has a Share button that opens iOS's native sheet, not a web share fallback.
6. Splash screen + Status Bar theming — handled natively via Capacitor.
7. Physics engine — Tumble Tower uses a real-time 2D physics simulation (matter-js) with collapse detection.

HOW TO TEST THE IN-APP PURCHASE (rmc.freeze.pack5)
1. Sign in with the demo account
2. Tap the Profile tab (bottom right)
3. Scroll to the "STORE" section
4. Tap "Buy · $0.99" — sandbox purchase sheet appears
5. Complete with your sandbox Apple ID
6. Confirm: (a) success toast, (b) freeze balance increases by 5, (c) Restore Purchases works without double-crediting

HOW TO TEST LOCAL NOTIFICATIONS
1. Profile tab → "DAILY REMINDER" section → tap "Turn On"
2. Grant notification permission when prompted
3. A daily 7:00 pm local-time reminder is scheduled via UNCalendarNotificationTrigger

HOW TO TEST GAME CENTER
1. Sign in to Game Center in Settings first
2. Play any game to completion — score auto-submits
3. Optionally we can wire a UI button to show the leaderboard sheet; happy to add if you'd like

TRADEMARK NOTE (Guideline 5.2)
We deliberately renamed three games to avoid any conflict with existing trademarks:
- "Uno" → "Wild Cards"     (original 8-suit card mechanic)
- "Scrabble" → "Word Tiles" (7-tile word-building with our own scoring)
- "Jenga" → "Tumble Tower"  (physics-based tower pulling with our own rules)
The gameplay mechanics themselves are public-domain classics. All artwork, animations, sound, and code are 100% original to us. We have no affiliation with Mattel, Hasbro, or any other rights-holder.

DATA COLLECTION (matches our Privacy Nutrition label)
- Email address (for account only, not marketing)
- Anonymous gameplay stats (scores, XP, streaks — for leaderboards)
- No location, contacts, camera, mic, health, or advertising data
Full policy at https://rmcclassics.com/privacy

WEB VERSION
The same app runs at rmcclassics.com as a Progressive Web App. The iOS app is the same codebase wrapped in Capacitor with native features added on top. This is disclosed in our Privacy policy.

TRADEMARKS WE DO USE
"Chess", "Checkers", "Dominoes", "Go Fish", "Old Maid", "Ludo", "Snakes and Ladders", "Connect Four" — these are either genuinely public-domain classics or generic descriptive game names. We are not aware of any live trademark on them for game software.

If anything is unclear or you'd like us to change something before approving, please email hello@rmcclassics.com and we'll turn a fix around within 24 hours.

Thanks!
The RMC Classics team
```

## Attachment (optional but recommended)

Attach a **1-minute screen recording** of you:
1. Signing in with the demo account
2. Playing a quick round of Tumble Tower
3. Tapping the Buy button to trigger the IAP sandbox flow
4. Enabling the Daily Reminder toggle

Save as `.mov` or `.mp4`. This dramatically speeds up first-time review.

---

## Where each section goes in App Store Connect

1. Log in → **My Apps → RMC Classics → App Store tab → 1.0 Prepare for Submission**
2. Scroll to **App Review Information**
3. **Contact Information** → paste from top section
4. **Sign-In Required** → toggle **Yes**
5. **Demo Account** → paste the credentials
6. **Notes** → paste the letter above (the code block)
7. **Attachment** → drag the .mov screen recording
8. Click **Save** at the top-right
9. Scroll back up → tap **Add for Review** → **Submit for Review**

---

## Post-submission monitoring

- **App Store Connect → App Store → your version** shows current status
- **In Review** typically takes 24-48 hours
- Watch for emails from `no_reply@email.apple.com` — these mean a decision or a question from the reviewer
- If rejected: read the message in Resolution Center, reply with a fix or explanation, then resubmit. Most first-time rejections clear on the second try.
