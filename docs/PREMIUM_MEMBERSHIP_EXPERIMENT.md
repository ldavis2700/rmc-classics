# RMC Classics Premium / Membership Experiment — Founding Member Interest Approved

The owner approved the reversible Founding Member interest phase on 2026-08-12. This phase adds an informational home-page surface and an email interest action. It does not create a paywall, subscription product, App Store in-app purchase, entitlement, or charge.

## Product principle

Keep the core classic-game experience usable without payment. A future membership should add convenience, identity, collection, and community value rather than making competitive outcomes pay-to-win.

## Candidate member benefits

Low-risk candidates for later testing:

- expanded profile customization and member badge;
- saved favorites / recently played shortcuts;
- additional cosmetic board or card themes;
- enhanced personal stats and history views;
- optional member-only classic spotlights or editorial collections;
- early access to newly added classics where platform rules permit;
- ad/sponsor-reduced experience if sponsor inventory is later approved and launched.

Avoid making win probability, matchmaking priority, competitive scoring, or required game mechanics purchasable.

## Reversible experiment architecture

Before any live subscription test:

1. Put all premium surfaces behind a server/config feature flag.
2. Keep entitlement checks separate from core gameplay state.
3. Define a control cohort that sees no membership prompt.
4. Define a treatment cohort that may see a membership value proposition only after a natural engagement moment, never during active play.
5. Make the entire test removable without data migration or account loss.

## Measurement contract

Candidate first-party events:

- `membership_offer_viewed`
- `membership_offer_dismissed`
- `membership_checkout_started`
- `membership_purchase_verified`
- `membership_restore_verified`
- `membership_cancel_signal` when available from an authorized source

Primary experiment metrics:

- offer-view rate among eligible users;
- checkout-start rate;
- verified paid conversion rate;
- verified recurring revenue;
- retention and games-completed guardrails;
- support/refund signal guardrails.

Only verified store/payment events may count as revenue.

## Launch prerequisites

A live membership experiment requires separate approval of:

- final benefits and pricing;
- Apple/Google product configuration where applicable;
- purchase, restore, refund, and entitlement behavior;
- App Store metadata/privacy implications;
- production feature flag and rollback thresholds;
- customer support and cancellation language.

## Safest first test after approval

Test the value proposition before creating a hard paywall: show a clearly labeled, dismissible membership information surface to a small eligible cohort and measure interest/checkout intent while leaving core gameplay unchanged.

The Founding Member interest surface is approved for review and deployment. Pricing, checkout, entitlements, purchases, and paid membership remain **unapproved** and require a separate APEX approval.
