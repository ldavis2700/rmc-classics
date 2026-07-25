# RMC CLASSICS - PRD

## Original Problem Statement
> Build Me, a public game app, named "RMC CLASSICS", that contains and makes playable, all the most popular games from childhood. The "RMC" in the name stands for "Remembering My Childhood".

## Vision
A mobile-first, installable web app that resurrects childhood classic games in one nostalgic, app-store-worthy destination. Users compete on global leaderboards, chase daily challenges, and share their wins to grow the community organically.

## User Personas
- **The Nostalgic Adult (25-45)** — plays during downtime to relive childhood memories
- **The Casual Mobile Gamer** — quick 2-5 minute sessions between tasks
- **The Competitor** — chases leaderboard rank across all games
- **The Daily Grinder** — logs in every day for the daily challenge & XP

## Core Requirements
- Mobile-first responsive design (bottom nav on mobile, top nav on desktop)
- User accounts + global leaderboards (overall + per-game)
- Daily challenge rotation with bonus XP
- Share Card for organic growth (Web Share API)
- Installable PWA (add to home screen)
- Retro / modern / cartoon fusion aesthetic
- 8-bit sound effects via Web Audio API
- JWT Bearer auth (token in localStorage)

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn/UI + framer-motion + chess.js. Web Audio API for SFX. Service worker + manifest for PWA.
- **Backend**: FastAPI + Motor MongoDB + PyJWT + bcrypt.
- **DB collections**: `users` (with embedded stats/xp/daily), `game_events` (history).

## What's Been Implemented

### Iteration 1 (Feb 2026)
- Auth: register/login/me/logout with JWT Bearer
- Seeded admin (`admin@rmc.com` / `admin123`)
- 6 games: Memory Match, Snakes & Ladders, Connect Four, Checkers, Rock Paper Scissors, Crazy Eights
- Overall + per-game leaderboards
- Mobile-first layout with bottom nav + sound toggle

### Iteration 2 (Feb 2026 — this session)
- **3 new games**: Chess (chess.js + greedy AI), Uno (all specials + wild-color picker + +2/+4 stacking), Ludo (simplified 2-token perimeter track with capture)
- **XP system**: 5 XP/play, 25 XP/win, 100 XP daily-challenge bonus
- **Daily Challenge**: 10 rotating challenges deterministic per UTC day, auto-tracked on score submission, shown on Home page for logged-in users
- **Share Card modal**: opens after every finished game with Web Share API + Copy fallback
- **PWA**: manifest.json, logo.svg, service worker, InstallPrompt banner (triggers on beforeinstallprompt)
- **Testing**: 18/18 backend tests pass, ~95% frontend E2E (all issues resolved before finish)

## Prioritized Backlog

### P1 - grow the library (remaining childhood picks)
- Scrabble
- Dominoes
- Card games: Go Fish, Old Maid
- Jenga (needs physics)
- Obstacle course mini-game

### P2 - engagement + retention
- Streaks (consecutive days with a daily challenge completed)
- XP levels + level-up cosmetics
- Achievements & badges
- Themes / skins (retro CRT, Gameboy, arcade)

### P3 - viral / social
- Friends & private lobbies (WebSocket real-time)
- Weekly seasonal leaderboards with prizes
- Downloadable/OG-shareable score card image (html2canvas)

## Test Credentials
See `/app/memory/test_credentials.md`.
