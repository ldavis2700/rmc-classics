# RMC Classics Sponsor Inventory — Prepared, Not Live

This document describes candidate UI inventory and measurement only. It does not enable any sponsor placement, external tracking, outreach, or production behavior.

## Candidate surfaces

- Home/lobby: one clearly labeled sponsor card below primary play actions.
- Results/leaderboard: compact sponsor badge below results, never over scores or controls.
- Event/tournament: optional clearly labeled event sponsor identity.
- Partner area: separate user-initiated partner/offer surface.
- Classic spotlight: clearly labeled related recommendation area.

## Product guardrails

- Never place units inside an active game board or over gameplay controls.
- Never make a sponsor element resemble a required game action, reward, or system alert.
- Keep login, privacy, support, and account-deletion screens free of sponsor inventory.
- Do not add third-party tracking SDKs as part of the initial experiment.
- Keep every future placement reversible through configuration or a feature flag.
- Require a separate privacy/compliance review before any new data collection.

## First-party measurement contract

Candidate event names for a future approved test:

- `sponsor_impression`
- `sponsor_click`
- `affiliate_outbound_click`
- `affiliate_conversion` only when independently verified

Recommended fields:

- placement ID
- partner ID
- campaign ID
- surface
- platform
- timestamp
- APEX experiment ID

Primary metrics:

- eligible sessions
- impressions
- click-through rate
- verified conversions
- verified revenue
- revenue per 1,000 eligible sessions
- retention and session-completion guardrails

## Safest first test after approval

One static, clearly labeled sponsor card on the home/lobby surface, with no behavioral targeting and no third-party tracking SDK. Measure first-party impressions/clicks and compare engagement guardrails against baseline.

Status remains **prepared only** until separately approved through APEX.
