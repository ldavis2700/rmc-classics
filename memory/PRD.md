# RMC CLASSICS - PRD

## Original Problem Statement
> Build Me, a public game app, named "RMC CLASSICS", that contains and makes playable, all the most popular games from childhood. The "RMC" in the name stands for "Remembering My Childhood".

## Vision
A mobile-first, installable web app that resurrects childhood classic games in one nostalgic, app-store-worthy destination. Users compete on global leaderboards, chase daily challenges (with escalating streak multipliers and freeze protection), collect achievement badges, play real-time head-to-head battles with friends, and share their wins to grow the community organically.

## User Personas
- **The Nostalgic Adult (25-45)** — plays during downtime to relive childhood memories
- **The Casual Mobile Gamer** — quick 2-5 minute sessions
- **The Competitor** — chases leaderboard rank + badges
- **The Daily Grinder** — logs in every day; streak-freeze protects one missed day per week
- **The Party Host** — invites friends to real-time 1v1 battles

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn/UI + framer-motion + chess.js. Web Audio API SFX. Service worker + manifest for PWA. WebSocket + polling fallback for Friend Battles.
- **Backend**: FastAPI + Motor MongoDB + PyJWT + bcrypt + WebSockets. In-memory battle rooms.
- **DB collections**: `users` (with embedded stats/xp/daily/streak/freezes/badges), `game_events`.

## What's Been Implemented

### Iteration 1 — MVP (6 games + auth + leaderboards + PWA scaffold)
### Iteration 2 — Chess, Uno, Ludo + XP + Daily Challenge + Share Card + full PWA
### Iteration 3 — Scrabble, Dominoes + Streak multipliers + Friend Battles (polling)
### Iteration 4 (this session)
- **Go Fish + Old Maid** → **13 total games**
- **Streak Freeze**: 1 free skip per rolling 7 days; auto-consumed when there's a 2-day gap to preserve the streak. Shown in Profile + Share Card
- **14 Achievement Badges**: first_win, wins_5/25/100, plays_10/50, streak_3/7/30/100, chess_win, scrabble_win, battle_win, all_games — displayed as Trophy Shelf in Profile and celebrated in Share Card on new unlock
- **WebSocket Battles**: real-time Connect Four 1v1 via `wss://.../api/ws/battle/{id}?token=<jwt>` with polling fallback (3s). LIVE indicator in header, instant move sync
- **Testing**: 19/19 backend pytest ✅, 100% frontend E2E for iteration-4 scope ✅
- **Fix**: WS custom close codes (4401/4404/4403) now properly transmitted after `websocket.accept()`

## Prioritized Backlog

### P1 - more childhood classics
- Jenga (physics)
- Hopscotch (mini-game)
- Marbles (physics)
- Obstacle Course

### P2 - retention & social depth
- Weekly seasonal leaderboards + prizes
- Rematch button in Friend Battle end screen
- Friends list & battle history
- Persist battle rooms to MongoDB / Redis (currently in-memory, lost on restart)

### P3 - monetization
- Cosmetic tile-set skins (retro CRT, Gameboy, arcade)
- XP levels + unlockable themes
- Streak-freeze packs

## Test Credentials
See `/app/memory/test_credentials.md`.
