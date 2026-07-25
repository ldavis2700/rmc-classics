# RMC CLASSICS - PRD

## Original Problem Statement
> Build Me, a public game app, named "RMC CLASSICS", that contains and makes playable, all the most popular games from childhood. The "RMC" in the name stands for "Remembering My Childhood".

## Vision
A mobile-first web app that resurrects childhood classic games in one nostalgic, app-store-worthy destination. Users compete on global leaderboards while enjoying retro-arcade fusion visuals and 8-bit sound effects.

## User Personas
- **The Nostalgic Adult (25-45)** — plays during downtime to relive childhood memories
- **The Casual Mobile Gamer** — quick 2-5 minute sessions between tasks
- **The Competitor** — chases leaderboard rank across all games

## Core Requirements (locked)
- Mobile-first responsive design (bottom nav on mobile, top nav on desktop)
- User accounts + global leaderboards (overall + per-game)
- Retro / modern / cartoon fusion aesthetic (Unbounded + Outfit + Silkscreen fonts, neon pink/cyan/yellow on midnight indigo)
- 8-bit sound effects via Web Audio API (no external audio files)
- JWT Bearer auth (token in localStorage)

## Architecture
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn/UI + framer-motion. Sonner for toasts. Sound helper using Web Audio API.
- **Backend**: FastAPI + Motor MongoDB. JWT (PyJWT) + bcrypt. All endpoints under `/api`.
- **DB collections**: `users` (with embedded per-game stats), `game_events` (history).

## What's Been Implemented (Feb 2026 - Iteration 1)
- Auth: register, login, /me, logout with JWT Bearer
- Seeded admin (`admin@rmc.com` / `admin123`)
- Score submission `/api/games/submit` with best-score tracking (asc for memory, desc for others)
- Overall + per-game leaderboards (`/api/games/leaderboard`, `/api/games/leaderboard/{id}`)
- 6 fully-playable games:
  1. Memory Match (single-player, moves-based scoring)
  2. Snakes & Ladders (vs CPU, dice-based, 100-square board)
  3. Connect Four (vs AI with win/block logic)
  4. Checkers (vs random AI with kings & multi-jump)
  5. Rock Paper Scissors (best-of-5 vs CPU)
  6. Crazy Eights (vs CPU, wild 8s with suit picker)
- Pages: Home (hero + game grid), Library, Leaderboard (7 tabs), Profile (stats + per-game breakdown), Login, Register
- Layout with top nav (desktop) + bottom nav (mobile) + sound toggle
- 100% backend test pass, 100% frontend E2E pass, deployment readiness ✅

## Prioritized Backlog

### P0 - launch polish
- Custom favicon + PWA manifest with icons (add-to-home-screen)
- SEO meta tags for shareability

### P1 - additional games (user's original list)
- Ludo (4-player vs CPU)
- Uno
- Chess (with chess.js engine)
- Scrabble
- Dominoes
- Go Fish / Old Maid card games
- Jenga (physics)
- Obstacle course mini-game

### P2 - engagement + monetization
- Daily challenges & streaks
- Friends / private lobbies (multiplayer via WebSocket)
- Achievements & badges
- Themes / skins unlocks (retro CRT, Gameboy, arcade)
- Share result cards (referral loop for app-store discovery)

## Next Tasks
- Ship a PWA manifest so users can install to home screen
- Add daily-challenge rotation to drive retention
- Design & ship 3 more classics (Chess, Uno, Ludo) as Phase 2

## Test Credentials
See `/app/memory/test_credentials.md`.
