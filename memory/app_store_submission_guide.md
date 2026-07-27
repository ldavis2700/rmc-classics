# RMC CLASSICS — App Store Submission Guide

**Bundle ID:** `com.rmcclassics.app`
**Marketing URL:** `https://rmcclassics.com`
**Support URL:** `https://rmcclassics.com/support`
**Privacy URL:** `https://rmcclassics.com/privacy`
**Terms URL:** `https://rmcclassics.com/terms`

> Everything below has been prepared. Steps marked ⚠️ require your action on a Mac with Xcode.

---

## ✅ Already done in code

- [x] Domain swapped to `rmcclassics.com` across `index.html`, `robots.txt`, `sitemap.xml`
- [x] Trademarked game names renamed for App Store:
  - Uno → **Wild Cards**
  - Scrabble Solo → **Word Tiles**
- [x] Privacy Policy page at `/privacy`
- [x] Terms of Service page at `/terms`
- [x] Support page at `/support` (with FAQ + contact email)
- [x] Footer with legal links on every page (required by App Review Guideline 5.1.1)
- [x] Capacitor 7 installed for iOS/Android wrapping
- [x] `capacitor.config.ts` created with bundle ID, splash screen, status bar config
- [x] Native bridge module at `frontend/src/lib/native.js` (haptics, share, status bar)
- [x] Native share sheet integrated into ShareCard component
- [x] Sitemap updated with legal pages

---

## ⚠️ What YOU need to do

### 1. Buy Apple Developer Account ($99/year)
Visit https://developer.apple.com/programs/enroll/ and enroll. Individual account is fine.

### 2. Get the domain live (see previous chat instructions)
Deploy via Emergent → Link Domain → Update DNS at registrar. Apple will click your Privacy and Support URLs — they must return 200 OK.

### 3. Build the iOS app on a Mac

```bash
git clone <your repo>
cd rmc-classics/frontend
yarn install
yarn build
npx cap add ios          # first time only
npx cap sync ios
npx cap open ios         # opens Xcode
```

### 4. Configure the iOS project in Xcode

1. Select the app target → **Signing & Capabilities**
2. Team: your Apple Developer account
3. Bundle Identifier: `com.rmcclassics.app`
4. **Info.plist additions** (Xcode auto-generates most):
   - `NSAppTransportSecurity` — allow arbitrary loads: **false**
   - `UISupportedInterfaceOrientations` — Portrait + Landscape
   - `LSApplicationCategoryType` — `public.app-category.games`

### 5. Assets required (I've prepared specs — you create the artwork)

**✅ Icons already generated** (Feb 2026):
- App Store marketing icon: `/app/frontend/appstore-assets/icon-appstore-1024.png` (1024×1024, RGB, no alpha, no rounded corners)
- Xcode drop-in AppIcon.appiconset: `/app/frontend/appstore-assets/AppIcon.appiconset/` (18 icons + Contents.json — drag straight into Xcode's Assets.xcassets)
- Android launcher icons: `/app/frontend/appstore-assets/android/` (mdpi → xxxhdpi + Play Store 512×512)
- PWA/home-screen icons: `/app/frontend/public/icons/` (72–512px, wired into manifest.json)

**✅ Screenshots already generated** (Feb 2026):
Auto-captured via Playwright at all required Apple device sizes. Pick 3–6 best from each folder to upload:
- `/app/frontend/appstore-assets/screenshots/iphone-6.7/` — 1290×2796 (iPhone 15 Pro Max)
- `/app/frontend/appstore-assets/screenshots/iphone-6.5/` — 1284×2778 (iPhone 14 Plus)
- `/app/frontend/appstore-assets/screenshots/iphone-5.5/` — 1242×2208 (iPhone 8 Plus)
- `/app/frontend/appstore-assets/screenshots/ipad-pro-12.9/` — 2048×2732 (iPad Pro)
- Regenerate anytime: `python3 /app/scripts/generate_screenshots.py`

**✅ App Preview video already generated** (Feb 2026):
- 20 seconds · 1080×1920 · H.264 · 30fps · Silent · Apple-uploadable
- Location: `/app/frontend/appstore-assets/app-preview.mp4`
- Regenerate anytime: `python3 /app/scripts/generate_video.py`

**You still need to create:**

| Asset | Size | Notes |
|---|---|---|
| iPhone 6.7" screenshots | 1290×2796 | 3–10 shots. Portrait |
| iPhone 6.5" screenshots | 1242×2688 or 1284×2778 | 3–10 shots |
| iPhone 5.5" screenshots | 1242×2208 | 3–10 shots (for older devices) |
| iPad Pro 12.9" screenshots | 2048×2732 | 3–10 shots |
| Optional: App preview video | 15–30 sec | .mov, portrait |

**Screenshot suggestions:**
1. Home / HeroReel landing
2. Library — grid of 13 games
3. Chess mid-game
4. Leaderboard (global)
5. Daily Challenge complete + XP earned
6. Friend Battle in progress

### 6. App Store Connect metadata

Log in at https://appstoreconnect.apple.com → My Apps → **+ New App**.

**Copy-paste from below:**

**App Name (30 char max):**
```
RMC Classics: Childhood Games
```

**Subtitle (30 char max):**
```
Chess, Ludo, Memory & 10 more
```

**Primary Category:** Games
**Secondary Category:** Board (or Family)

**Age Rating:** 4+ (no violence, no mature content)

**Keywords (100 char max, comma-separated):**
```
chess,ludo,memory,connect four,checkers,dominoes,card game,board game,retro,arcade,classic
```

**Promotional Text (170 char max):**
```
13 childhood classics reborn. Play Chess, Ludo, Memory Match, Connect Four, Dominoes and more. Battle friends live. Climb the global leaderboards.
```

**Description (4000 char max):**
```
Remember the games that raised you? RMC CLASSICS brings 13 timeless childhood favourites into one nostalgic arcade — playable anywhere, anytime, with zero downloads-to-play friction.

🎮 EVERY CLASSIC IN ONE PLACE
• Chess — 1500 years of strategy
• Memory Match — flip, remember, match
• Connect Four — line up four in a row
• Checkers — jump, capture, crown
• Snakes & Ladders — roll big or slide down
• Rock Paper Scissors — best of five vs the AI
• Crazy Eights — the sleepover classic
• Wild Cards — colours, numbers, wild fun
• Ludo — race your tokens home
• Word Tiles — build the highest scoring words
• Dominoes — chain and block
• Go Fish — collect the whole set
• Old Maid — don't get stuck

⚔ REAL-TIME FRIEND BATTLES
Add friends and duel live in 1v1 matches. Rematch instantly when the round ends.

🏆 GLOBAL & WEEKLY LEADERBOARDS
Climb the all-time boards or race the fresh weekly reset.

🔥 DAILY CHALLENGES & STREAKS
A new challenge every day. Earn XP, keep your streak alive with weekly freeze protection.

🎖 14 ACHIEVEMENT BADGES
From "First Win" to "Collector" — unlock them all.

🎨 UNLOCKABLE THEMES
Neon, Gameboy, Retro CRT, Coin-Op Arcade — earn them with XP.

🎵 ORIGINAL 8-BIT SOUNDS
Every click, roll, and victory has that arcade crunch.

📱 MOBILE-FIRST DESIGN
Built for one-hand play. Portrait and landscape.

Made for anyone who grew up circling the arcade, playing on the school bus, or crowded around the living room floor. RMC CLASSICS is the arcade that raised us — reborn.
```

**What's New (release notes for v1.0):**
```
The launch. 13 classics. Real-time battles. Global leaderboards. Daily challenges. Unlockable themes. Welcome to the arcade.
```

### 7. Privacy Nutrition Label (App Store Connect → App Privacy)

Answer the questionnaire like this:

- **Data collected:** Yes
  - Contact Info → Email Address → Linked to user, used for App Functionality
  - Identifiers → User ID → Linked to user, used for App Functionality
  - Usage Data → Product Interaction → Linked to user, used for Analytics
- **Data used to track you:** No
- **Third-party advertising:** No

### 8. Export Compliance

When uploading a build, Apple asks about encryption. Answer:
- **Uses encryption:** Yes (HTTPS is encryption)
- **Exempt:** Yes (uses only standard iOS encryption / calls HTTPS)
This exempts you from filing an ERN.

### 9. Age Rating Questionnaire

All **None**. Result: **4+**.

### 10. Submit for review

Product → Archive → Distribute App → App Store Connect → Upload → wait ~15 min → select build in App Store Connect → Add to version → **Submit for Review**.

Review time: 24–48 hours typical. May be longer on first submission.

---

## 🚨 Guideline 4.2 mitigation (thin web wrapper)

Apple often rejects PWAs wrapped in Capacitor as "minimum functionality". We already integrated:

- ✅ Native haptics (`@capacitor/haptics`) — engaged on share
- ✅ Native share sheet (`@capacitor/share`) — engaged in ShareCard
- ✅ Native status bar styling (`@capacitor/status-bar`)
- ✅ Native splash screen (`@capacitor/splash-screen`)
- ✅ Native preferences storage available (`@capacitor/preferences`)
- ✅ 13 genuine games (not just a link viewer)
- ✅ Real user accounts, real leaderboards, real WebSocket multiplayer
- ✅ Offline PWA capability via service worker

**Extra safety net (already implemented in code):**
1. **Game Center integration** ✅ — `frontend/src/lib/gameCenter.js` auto-submits every score. Still requires Xcode: Signing & Capabilities → + Game Center, and App Store Connect: Features → Game Center → create one Leaderboard per game (IDs listed in `gameCenter.js`)
2. **Local Push reminders** ✅ — daily 7pm challenge reminder via `@capacitor/local-notifications`. Toggle exposed in Profile page. No Firebase needed
3. **In-App Purchase** ✅ — **Streak Freeze 5-Pack $0.99** consumable via RevenueCat + `@revenuecat/purchases-capacitor`. Frontend at `frontend/src/lib/iap.js`, backend endpoints `POST /api/iap/sync` and `POST /api/iap/webhook`. See "In-App Purchase Setup" below

---

## In-App Purchase setup (Streak Freeze 5-Pack)

Product: **`rmc.freeze.pack5`** — Consumable — **$0.99** — grants **5** streak freezes.

### A. App Store Connect
1. App Store Connect → your app → **Monetization → In-App Purchases → +**
2. Type: **Consumable**
3. Product ID: `rmc.freeze.pack5`
4. Reference name: `Streak Freeze 5-Pack`
5. Price: $0.99 (Tier 1)
6. Localization → English: Display Name `Streak Freeze 5-Pack`, Description `Freeze up to 5 missed days without losing your daily streak.`
7. Save. Wait ~1 hour for sandbox propagation.
8. **Users and Access → Integrations → In-App Purchase Key → +** → download the `.p8` file, note the Key ID and Issuer ID (needed by RevenueCat).

### B. RevenueCat
1. Sign up at [revenuecat.com](https://www.revenuecat.com) (free until $10K MTR)
2. **+ New App** → iOS → Bundle ID: `com.rmcclassics.app`
3. **App settings → App Store Connect API** → upload the `.p8` file + Key ID + Issuer ID
4. **Products** tab → **+ New** → Identifier: `rmc.freeze.pack5` → Type: Consumable
5. Copy the **Public SDK Key** (iOS) → paste it into `frontend/.env`:
   ```
   REACT_APP_REVENUECAT_IOS_KEY="appl_xxxxxxxxxxxxxxxxxx"
   ```
6. **Project settings → API keys → Secret key** → paste into `backend/.env`:
   ```
   REVENUECAT_SECRET_KEY="sk_xxxxxxxxxxxxxxxxxx"
   ```
7. **Integrations → Webhooks → + Add Webhook**
   - URL: `https://rmcclassics.com/api/iap/webhook`
   - Authorization header value: `Bearer <a-random-secret-you-generate>`
   - Copy that same secret into `backend/.env`:
     ```
     REVENUECAT_WEBHOOK_TOKEN="<same-secret>"
     ```

### C. Xcode
- Signing & Capabilities → **+ Capability → In-App Purchase**

### D. Sandbox testing
1. App Store Connect → **Users and Access → Sandbox Testers → +** → create a fresh Apple ID
2. On your test iPhone: **Settings → Developer → Sandbox Apple Account** → sign in with that tester
3. Run the app from Xcode → Profile → **Buy · $0.99** → complete the sandbox flow
4. Confirm: (a) toast shows `+5 streak freezes added`, (b) balance jumps by 5, (c) RevenueCat dashboard shows the transaction, (d) Mongo `db.users` has the transaction id in `processed_iap`
5. Force-quit and reopen → tap **Restore Purchases** → should NOT double-credit (idempotency test)

### E. Common pitfalls
- Product not appearing in `getProducts()`: Apple hasn't propagated yet — wait 1 hour after creation
- Restore double-crediting: our backend uses `processed_iap` array on the user doc as idempotency guard — safe by default
- 401 on webhook: `REVENUECAT_WEBHOOK_TOKEN` in backend .env must match the `Bearer <token>` string in RevenueCat's webhook settings exactly
- Sandbox testers must not have any Apple ID already signed into iCloud on the device

---

## 📋 Pre-submit checklist

Run through this before hitting Submit:

- [ ] Domain `rmcclassics.com` is live and serves the app over HTTPS
- [ ] `https://rmcclassics.com/privacy` returns 200 OK
- [ ] `https://rmcclassics.com/support` returns 200 OK
- [ ] `https://rmcclassics.com/terms` returns 200 OK
- [ ] Support email `hello@rmcclassics.com` is a working inbox (Apple emails there)
- [ ] Apple Developer account active
- [ ] Xcode project builds without warnings
- [ ] Tested on physical iPhone (Simulator alone can miss issues)
- [ ] All 13 games playable offline in the built .app
- [ ] Screenshots uploaded for all required device sizes
- [ ] App icon 1024×1024 uploaded, no transparency
- [ ] Privacy Nutrition Label filled
- [ ] Age Rating: 4+
- [ ] Version 1.0 metadata complete
- [ ] Build uploaded via Xcode Organizer
- [ ] Build attached to v1.0 in App Store Connect

---

## 🆘 If Apple rejects

Most likely reasons and fixes:

| Reason | Fix |
|---|---|
| 4.2 Minimum Functionality | Add Game Center + Push notifications |
| 5.1.1 Data collection | Update Privacy nutrition label to match reality |
| 4.0 Design | Take better screenshots, add app preview video |
| 2.1 App Completeness | Test more, fix bugs found by Apple |
| 5.2 Intellectual Property | Rename any remaining trademarked game references |

Reply to the reviewer in App Review Resolution Center — most first-time rejections are cleared with a 2-line reply + resubmit.

---

## Estimated timeline

| Task | Time |
|---|---|
| Deploy + link domain | 1 hour |
| Buy Apple Developer + verify | 24-48 hours (Apple's side) |
| Build iOS app in Xcode | 2-3 hours |
| Create screenshots + icon | 2-4 hours (design work) |
| Fill App Store Connect metadata | 1 hour |
| Submit for review | 10 min |
| Apple review | 24-48 hours |
| **Total to live** | **~4-6 days** |
