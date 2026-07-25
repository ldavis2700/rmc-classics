# RMC CLASSICS - PRD

## Original Problem Statement
> Build Me, a public game app, named "RMC CLASSICS", that contains and makes playable, all the most popular games from childhood. The "RMC" in the name stands for "Remembering My Childhood".

## Vision
A mobile-first, installable web app that resurrects childhood classic games in one nostalgic, app-store-worthy destination. Users compete on global leaderboards, chase daily challenges (with escalating streak multipliers), play head-to-head with friends via shareable links, and share their wins to grow the community organically.

## User Personas
- **The Nostalgic Adult (25-45)** — plays during downtime to relive childhood memories
- **The Casual Mobile Gamer** — quick 2-5 minute sessions between tasks
- **The Competitor** — chases leaderboard rank across all games
- **The Daily Grinder** — logs in every day to keep their streak alive for XP multipliers
- **The Party Host** — invites friends via link to 1v1 battles

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn/UI + framer-motion + chess.js. Web Audio API SFX. Service worker + manifest for PWA. Polling for Friend Battles.
- **Backend**: FastAPI + Motor MongoDB + PyJWT + bcrypt. In-memory battle rooms dict.
- **DB collections**: `users` (with embedded stats/xp/daily/streak), `game_events`.

## What's Been Implemented

### Iteration 1 (Feb 2026) — MVP
- Auth (JWT Bearer), 6 games, leaderboards, mobile-first layout, admin seed.

### Iteration 2 (Feb 2026)
- Added Chess, Uno, Ludo → 9 games total
- XP system + rotating daily challenges (100 XP bonus)
- Share Card modal after every game
- PWA (manifest + logo + service worker + InstallPrompt)

### Iteration 3 (Feb 2026 — this session)
- **Scrabble Solo** (5 rounds, ~1000-word bundled dictionary, tile scoring)
- **Dominoes** (double-6, chain matching, capture + boneyard, blocked-game pip tiebreak)
- **XP Streaks with multipliers**: 3d = 1.5×, 7d = 2×, 30d = 3×, 100d = 5× — applied to both per-game XP and daily-challenge bonus
- **Friend Battles**: create/join by 6-char code, shareable link, Connect Four 1v1 with 1.5s polling, turn enforcement, win detection, XP + leaderboard credit
- **11 games total** covering the full childhood nostalgia stack
- **Testing**: 17/17 backend pytest, 100% frontend E2E for iteration-3 scope

## Prioritized Backlog

### P1 - remaining games
- Go Fish / Old Maid (2-player card games)
- Jenga (needs physics)
- Obstacle Course mini-game

### P2 - retention + social
- Streak recovery items (skip one day without breaking streak)
- Achievements & badges
- XP levels + unlockable themes (retro CRT, Gameboy, arcade)
- Persistent Friend Battle history & rematch

### P3 - platform + monetization
- Persist battle rooms to MongoDB / Redis so restarts don't clear
- WebSocket instead of polling for lower latency
- Seasonal weekly leaderboards + prizes
- Cosmetic tile-set skins

## Test Credentials
See `/app/memory/test_credentials.md`.
