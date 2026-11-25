# Go Fish legal-play coverage audit — 2026-11-25

Source candidate: `3bf10cfac0849d5fbdf9223f4f0c8476f101ebb7`.
Run: `node tests/audit_gofish_legal_rounds.cjs`.

The opt-in audit extracts and executes the actual GoFish component callbacks in a small hook harness. It uses seeds 1–1000 for each of three legal rank-choice policies (first, last, least-held). Player requests must name a rank in their hand. No game positions are injected. CPU callbacks execute synchronously rather than waiting 900ms; this is component-level evidence, not browser/device timing evidence.

## Observed result

- 3,000 completed games: 1,140 player wins and 1,860 losses.
- Zero stalls within 1,000 player/CPU actions per game.
- All observed states conserve 52 distinct cards, including booked ranks; completed games have 13 books.
- 66 games reached an empty player hand during a CPU turn (68 distinct observed states, all with cards remaining in the pool).
- Zero observed CPU-caused empty-hand refills at the next player turn.
- 3,035 observed active-player empty-hand refill states without a preceding CPU-empty state.
- First-policy examples reaching CPU-empty state: seeds66,222,279,366,384.

A trace of seed66 finishes with player [5,5], CPU [], pool [5,5]. CPU draws a5 and takes both player cards, leaving player [], CPU [5,5,5], pool [5]. Its next callback draws the fourth5 and ends the game. This does not exercise the defensive player-turn refill.

## Evidence boundary

The finite sample does not prove that the defensive path is unreachable. The existing constructed-state test explicitly verifies CPU taking the final player card, then missing, followed by a single refill and a legal next request. All10 current Go Fish refill/lifecycle tests passed separately. Retain that test and the application guard; do not remove either based on this sample.

Existing browser coverage already verifies legal full-round guest/authenticated play, failed saves, reversed score responses, reset/exit, and final CPU-card loss. Do not relabel the constructed-state recovery case as browser-verified or inject a position and describe it as legal gameplay.

No application behavior, deployment, signing or store state changed. Main-game deployment and signed-device acceptance remain separate release gates.
