# Dominoes and Spades

The collection now contains 15 games. Dominoes previously supported only local
computer play; this change replaces its state handling and adds Spades and a
shared online-table experience.

## Player flows

- `/play/dominoes`: two-player double-six draw Dominoes against a computer.
- `/play/spades`: four-player partnership Spades with a computer partner and two
  computer opponents, bidding, nil, bags, and a 500-point target.
- `/tables?game=dominoes` or `game=spades`: authenticated public matchmaking,
  private table creation, room-code joining, and resuming an active table.
- `/table/:roomId`: authenticated invitations, private hands, turn timer,
  reconnect, next-hand scoring, and report/block controls.

Online Dominoes requires two humans; online Spades requires four. Public
matchmaking waits for real players. Private tables are not in the public queue.
Players have 90 seconds per action. A timeout makes one legal computer-selected
action, and the human can resume on the next turn. Leaving an active table
forfeits the match for that player's side. Leaving a waiting table frees its seat.
Computer matches can be played without a login or network after the page loads.

Spades uses a standard 52-card deck without jokers or blind nil. Opposite seats
are partners. Failed-nil tricks count as bags, not toward a partner's contract.
Ten cumulative bags cost 100 points; ties at or above 500 continue to another
hand. Rule reference: https://www.pagat.com/auctionwhist/spades.html

## Server and persistence

Deploy `backend/game_tables.py`, `backend/table_rules.py`, and the updated
`backend/server.py` with the frontend. The existing MongoDB connection is reused;
no new hosted service or paid dependency is required by the feature.

Startup creates indexes on the new `game_tables` collection. A partial unique
multikey index enforces one active table per account. Versioned atomic document
replacement protects joins, moves, timeouts, and forfeits across workers. A
short-lived MongoDB lease serializes matchmaking decisions per game. Authenticated
per-seat projections exclude every opponent hand and the undealt stock.

Waiting tables expire after 15 minutes; playing tables after an hour without a
move. MongoDB's TTL monitor removes table documents 24 hours after creation or
the latest move (TTL removal is asynchronous). Account deletion removes linked
table documents. Blocking closes shared active tables and prevents new matches.

API endpoints: `GET /api/tables/current`, `POST /api/tables/match`,
`POST /api/tables/{code}/join`, `GET /api/tables/{code}`,
`POST /api/tables/{code}/move`, and `POST /api/tables/{code}/leave`.
Moves include the last received `version`; stale requests receive HTTP 409 and
must refresh rather than replay. Online states are polled every two seconds,
with visibility-aware reconnect and monotonic client version handling.

Computer results use the existing profile/leaderboard submission path. Online
results and Spades scores are displayed at the table; this change does not award
online XP or update the profile leaderboard for table matches.

## Build and verification

The release integration combines the feature with PR #57's native purchase,
signing and Android safeguards. Install with npm 10.9.4 (the lockfile's version).
See `docs/DOMINOES_SPADES_RELEASE_2026-10-21.md` for the source revisions,
production-target evidence and remaining gates. The integration also pins
`follow-redirects` to the patched 1.16.1 release in both package-manager overrides.

```sh
cd frontend
npx --yes npm@10.9.4 ci
npm run build
```

```sh
python -m pytest -q backend/tests/test_table_rules.py backend/tests/test_game_tables.py
# For the actual MongoDB concurrency/index behavior, use a disposable test server:
RMC_TEST_MONGO_URL=mongodb://127.0.0.1:27017 python -m pytest -q backend/tests/test_game_tables.py
```

Game tests exercise complete matches, JS/Python transition parity, legal bids,
follow-suit/trump rules, nil scoring, bag penalties, blocked Dominoes, private
hands, auth, reconnect, stale writes, concurrent matchmaking, and timeouts.
`scripts/verify-table-browser.cjs` tests the full browser/API/database flow
against a disposable local backend serving `frontend/build`. It refuses remote
targets. Install Playwright separately to run it; it creates only test accounts
in the supplied disposable database.

The reproducible full-stack wrapper creates and cleans up its own database and
signing secret, and verifies synthetic pre-existing account, progress and purchase
records survive startup and game activity:

```sh
RMC_TEST_MONGO_URL=mongodb://127.0.0.1:27017 python scripts/run_table_browser_test.py
```

Build the web bundle with `REACT_APP_BACKEND_URL` unset for this loopback test.
The PR workflow installs the pinned browser and backend test dependencies. Local
runners may specify `RMC_PLAYWRIGHT_MODULE` and `RMC_CHROMIUM_PATH` for installed
test tools. This does not change the application dependencies or hosted targets.

## Release boundary

The frontend and backend must be released together to the confirmed RMC CLASSICS
application. A frontend-only pilot preview does not establish online availability.
Native App Store/Google Play release requires signed builds, device validation,
and the existing store submission gates. No signed store release is produced by
these changes alone.
