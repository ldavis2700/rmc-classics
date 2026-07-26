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
