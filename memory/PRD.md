# RMC CLASSICS - PRD

## Original Problem Statement
> Build Me, a public game app, named "RMC CLASSICS", that contains and makes playable, all the most popular games from childhood. The "RMC" in the name stands for "Remembering My Childhood".

## Vision
A mobile-first, installable web app that resurrects childhood classic games in one nostalgic, app-store-worthy destination. Users compete on global + weekly leaderboards, chase daily challenges (with streak multipliers and freeze protection), collect achievement badges, unlock themes with XP, add friends and battle them 1v1 in real time, and share their wins to grow the community organically.

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn/UI + framer-motion + chess.js. Web Audio API SFX. Service worker + manifest for PWA. WebSocket + polling fallback for Friend Battles. ThemeContext.
- **Backend**: FastAPI + Motor MongoDB + PyJWT + bcrypt + WebSockets. In-memory battle rooms.
- **DB collections**: `users` (stats/xp/daily/streak/freezes/badges/theme/friend_ids/last_seen), `game_events`.

## What's Been Implemented

### Iteration 1 — MVP (6 games + auth + leaderboards + PWA scaffold)
### Iteration 2 — Chess, Uno, Ludo + XP + Daily Challenge + Share Card + full PWA
### Iteration 3 — Scrabble, Dominoes + Streak multipliers + Friend Battles (polling)
### Iteration 4 — Go Fish, Old Maid + Streak Freeze + Badges + WebSocket Battles
### Iteration 9 (Feb 2026) — In-App Purchases
- **Streak Freeze 5-Pack IAP** — Consumable, $0.99, grants 5 streak freezes
- **Frontend**: `frontend/src/lib/iap.js` (RevenueCat wrapper via `@revenuecat/purchases-capacitor`). `configureIAP()` called on login (native only). `purchaseFreezePack()` + `restorePurchases()` exposed
- **UI**: New "STORE" section on Profile page — animated snowflake card, buy button (auto-disabled on web with "iOS App Only" state), restore button, live balance readout
- **Backend**: `POST /api/iap/sync` fetches authoritative subscriber state from RevenueCat with secret key, idempotently credits `freezes_available` on the user based on `non_subscriptions[rmc.freeze.pack5]` transaction IDs. `POST /api/iap/webhook` accepts RevenueCat push events with bearer-token auth + dedup via `db.iap_events`
- **DB**: added `processed_iap: []` array on user doc (idempotency guard against restore/webhook double-credits)
- **Env**: `REACT_APP_REVENUECAT_IOS_KEY`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_TOKEN` — placeholders in .env, user fills after RevenueCat setup
- **Submission guide**: Section E details Apple/RevenueCat/Xcode/sandbox testing steps

### Iteration 8 (Feb 2026) — App Store Asset Pipeline + Native Features
- **Icon set generated** — 1024×1024 App Store master (no alpha, no rounded corners), Xcode `AppIcon.appiconset` with 18 sizes + Contents.json, Android launcher icons for all densities. Reproducible via `python3 scripts/generate_icons.py`
- **App Preview video** — 20-second, 1080×1920, H.264/yuv420p/30fps at `frontend/appstore-assets/app-preview.mp4`. Auto-recorded via Playwright + re-encoded with ffmpeg. Walks through Hero → Library → Chess → Memory → Leaderboard → Hero
- **Screenshots** — 28 PNGs across all required Apple device sizes (iPhone 6.7"/6.5"/5.5" + iPad Pro 12.9") in `frontend/appstore-assets/screenshots/`. 7 screens per device: hero, library, leaderboard, chess, memory, connect4, profile. Reproducible via `python3 scripts/generate_screenshots.py`
- **Apple Game Center integration** — `frontend/src/lib/gameCenter.js` (via `@openforge/capacitor-game-services`). Silent sign-in on app launch, auto-submits every score to per-game leaderboards. Safe no-op on web
- **Local push reminders** — `frontend/src/lib/notifications.js` (via `@capacitor/local-notifications`). Schedules a repeating 7pm daily challenge reminder. Toggle exposed in Profile page
- **Additional Capacitor plugins**: `@capacitor/local-notifications`, `@openforge/capacitor-game-services`

### Iteration 7 (Feb 2026) — App Store Readiness
- **Trademark rename**: Uno → **Wild Cards**, Scrabble Solo → **Word Tiles** (across frontend `games.js`, `Uno.jsx`, `Scrabble.jsx`, `words.js`, backend `server.py` game map + badges + daily challenges, and `index.html` meta). Routes/IDs (`/play/uno`, `/play/scrabble`) unchanged to preserve leaderboards
- **Legal pages**: `/privacy`, `/terms`, `/support` at `Legal.jsx` — Apple App Review compliant (Guideline 5.1.1). Sitewide footer with links added to `Layout.jsx`
- **Capacitor 7**: installed `@capacitor/core, cli, ios, android, haptics, share, status-bar, preferences, splash-screen`. Config at `frontend/capacitor.config.ts` (bundle ID `com.rmcclassics.app`)
- **Native bridge**: `frontend/src/lib/native.js` — safe `haptic()`, `share()`, `setStatusBarStyle()` wrappers with web fallbacks
- **ShareCard**: upgraded to use native share sheet + haptic feedback on iOS
- **Sitemap**: added privacy/terms/support URLs
- **Docs**: `/app/memory/app_store_submission_guide.md` — complete submission playbook (metadata, screenshots, privacy label, review guidelines)

### Iteration 6 (Feb 2026) — Domain Swap
- Replaced placeholder `childhood-games-5.emergent.host` with production domain **`rmcclassics.com`** in `frontend/public/index.html` (canonical, og:url, og:image, twitter:image), `robots.txt` (Sitemap), and `sitemap.xml` (all 16 `<loc>` URLs)
- Verified: served HTML/robots/sitemap all resolve to `rmcclassics.com`. Ready for OG debugger validation (Twitter/Facebook) once DNS is live

### Iteration 5
- **Rematch Button**: One-tap rematch at end of battle. Backend creates new room, sets `rematch_id` on the old one, and broadcasts state — both players auto-navigate. Winner takes host role in the rematch
- **Weekly Seasons**: `/api/games/leaderboard-week` aggregates `game_events` from Monday UTC. Frontend Leaderboard has All-time / This-week scope toggle
- **Friends List**: Add mutual friends by email. Online status tracked via `last_seen` heartbeat on `/auth/me`. Battle CTA on each row
- **Skin Shop**: 4 themes (Neon, Gameboy, Retro CRT, Coin-op Arcade) unlocked at 0 / 250 / 750 / 1500 XP. Applied via CSS variables + `data-theme` attribute on `<html>`
- **13 games**, **14 badges**, **weekly + all-time leaderboards**, **friend battles with rematch**
- **Testing**: 17/17 new backend pytest ✅, 100% frontend E2E ✅

## Prioritized Backlog

### P1 - polish & retention
- Rematch two-user E2E test via dual Playwright contexts
- Persist battle rooms to MongoDB (currently lost on restart)
- Split server.py into routers (auth/games/battles/friends/themes)

### P2 - more games
- Jenga (physics)
- Hopscotch mini-game
- Marbles (physics)
- Obstacle Course

### P3 - monetization + growth
- Seasonal weekly leaderboard reset + winner badges
- XP levels + level-up cosmetics
- Streak-freeze packs for purchase
- More theme skins (Vaporwave, MS-DOS, Neo-Tokyo)

## Test Credentials
See `/app/memory/test_credentials.md`.
