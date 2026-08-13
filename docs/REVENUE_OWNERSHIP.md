# Revenue ownership and payout control

## Owner of record

All RMC Classics monetization must be operated for **RMC FAMILY ENTERPRISES LLC** through financial and platform accounts controlled by its authorized owner. No developer, contractor, sponsor, affiliate network, customer, or software vendor may be configured as the payout recipient without a separate written agreement explicitly approved by the owner.

Gross sales are not the same as profit or cash received. Deposits may be reduced by Apple/platform fees, refunds, disputes, reserves, taxes, fulfillment costs, commissions, and other lawful deductions.

## Current code audit

- The Streak Freeze purchase uses Apple's in-app purchase system with RevenueCat for purchase verification and entitlement synchronization.
- RevenueCat is not the payout destination; Apple remits proceeds according to App Store Connect Agreements, Tax, and Banking.
- The Founding Member destination remains an interest pilot and does not charge customers.
- Sponsor and affiliate placements remain disabled unless complete campaign configuration exists.
- The current monetization implementation contains no Stripe Connect transfer, destination charge, wallet address, or hard-coded third-party payout recipient.
- Planned merchandise, licensing, events, gifting, themes, and membership channels are not authorized to collect money until their owner-controlled merchant and payout accounts pass this gate.

## Mandatory payout gate

| Channel | Account that must be owner-controlled | Required evidence |
|---|---|---|
| Apple Streak Freeze purchases | RMC FAMILY ENTERPRISES LLC App Store Connect agreement/banking profile | Paid Applications agreement active, tax forms accepted, banking verified, and Financial Reports access |
| Future memberships/IAP | Owner-controlled Apple/Google merchant profiles | Product approval, payee identity, tax profile, bank destination, and sandbox-to-payout reconciliation |
| Direct sponsorships | Owner-approved invoicing/merchant account | Signed insertion order or contract, invoice, payment terms, and cleared deposit |
| Affiliate offers | Owner-controlled affiliate publisher account | Publisher ID, legal payee, tax form, bank/PayPal destination, and test payout where available |
| Merchandise | Owner-controlled commerce and settlement accounts | Merchant ownership, supplier agreement, refund reserve, bank destination, and reconciliation |
| Events/tournaments | Owner-controlled ticketing/IAP account | Rules and legal review, merchant identity, refund terms, and payout evidence |
| Licensing | RMC FAMILY ENTERPRISES LLC contracting/invoicing account | Signed license, rights scope, invoice, and cleared payment |

## Verification procedure

1. Sign in directly to each provider using an owner-controlled administrator account with MFA.
2. Confirm the legal payee/business name is RMC FAMILY ENTERPRISES LLC, where supported and appropriate.
3. Confirm the payout bank or approved settlement account is controlled by the owner/business.
4. Remove unknown administrators, payout destinations, forwarding rules, integrations, and API keys.
5. Rotate exposed or unrecognized secrets; store replacements only in the deployment secret manager.
6. Enable sale, payout, refund, dispute, banking-change, and administrator-change notifications to an owner-controlled email/phone.
7. Complete one low-risk transaction and reconcile provider receipt → RMC record → bank deposit.
8. Save evidence privately. Never commit bank numbers, tax IDs, identity documents, recovery codes, or live secrets to GitHub.
9. Re-verify ownership after any banking, administrator, deployment, or provider change.

## Launch rule

A passing build does not prove financial ownership. A paid RMC Classics channel may go live only after the owner verifies the external account holder, legal payee, tax profile, and final payout destination. If any recipient is unknown or not owner-controlled, keep that channel disabled.
