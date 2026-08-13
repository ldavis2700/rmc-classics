# RMC Classics Monetization Channel Register

Updated 2026-08-13. Core games remain playable without payment. Competitive outcomes, matchmaking priority, and scores are not for sale.

| Channel | Implementation state | Activation dependency |
| --- | --- | --- |
| Streak Freeze 5-Pack | Implemented | Existing App Store / RevenueCat product |
| Founding Membership | Interest experiment live | Approve price, benefits, entitlement, and store product |
| Direct sponsorships | Code-ready, disabled by default | Signed advertiser, approved creative/link, env configuration |
| Affiliate offers | Code-ready, disabled by default | Approved program/link and disclosure review |
| Cosmetic theme packs | Planned | Art, product IDs, entitlements, restore behavior |
| Tournament/event passes | Planned | Event rules, product IDs, eligibility and prize compliance |
| Physical merchandise | Planned | Supplier, fulfillment, returns, external checkout |
| Gift memberships | Planned | Membership launch plus gifting/refund design |
| Game/brand licensing | Lead capture ready | Contract, scope, pricing, rights review |

## Sponsor and affiliate configuration

The home placement renders only when a complete campaign is configured. No third-party ad SDK is installed.

- `REACT_APP_SPONSOR_ENABLED=true`
- `REACT_APP_SPONSOR_NAME`
- `REACT_APP_SPONSOR_COPY`
- `REACT_APP_SPONSOR_URL`
- `REACT_APP_AFFILIATE_ENABLED=true`
- `REACT_APP_AFFILIATE_NAME`
- `REACT_APP_AFFILIATE_COPY`
- `REACT_APP_AFFILIATE_URL`

Direct sponsorship takes precedence when both are enabled. All external links use `rel="sponsored"`. Personalized advertising remains off unless the player explicitly opts in. The initial implementation does not transmit the preference to a third party and does not enable cross-app tracking.
