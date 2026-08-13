# Streak Freeze Revenue Launch Checklist

This checklist activates the existing **Streak Freeze 5-Pack** as a real, server-verified iOS revenue channel. Never commit live credentials to GitHub.

## 1. App Store Connect

- Create or verify a **Consumable** in-app purchase for the RMC Classics app.
- Product ID must be exactly `rmc.freeze.pack5`.
- Customer benefit: five streak freezes.
- Confirm the United States storefront price is **$0.99** and review Apple's localized prices.
- Add the required review screenshot and description.
- Complete Agreements, Tax, and Banking in App Store Connect.
- Submit the in-app purchase with the app version if Apple requires it.
- Do not advertise the product as live until its App Store status permits sandbox testing and sale.

## 2. RevenueCat

- Connect the exact RMC Classics App Store app and bundle identifier.
- Import `rmc.freeze.pack5` as a consumable product.
- Use the stable authenticated RMC user ID as RevenueCat's App User ID.
- Copy the **public iOS SDK key** into the iOS frontend build environment:
  - `REACT_APP_REVENUECAT_IOS_KEY`
- Copy the **secret RevenueCat API key** into the backend runtime only:
  - `REVENUECAT_SECRET_KEY`
- Create a long random webhook authorization token in the backend runtime:
  - `REVENUECAT_WEBHOOK_TOKEN`
- Configure the RevenueCat webhook URL:
  - `https://<BACKEND_ORIGIN>/api/iap/webhook`
- Configure the webhook authorization header to be:
  - `Authorization: Bearer <REVENUECAT_WEBHOOK_TOKEN>`

The public iOS SDK key is intended for the app build. The RevenueCat secret key and webhook token are server-only and must never use a `REACT_APP_` name.

## 3. Build and deployment

- Confirm `REACT_APP_BACKEND_URL` points to the production backend origin.
- Rebuild the Capacitor iOS app after adding the public RevenueCat key.
- Deploy the backend after adding both server-only values.
- Confirm the backend can reach `https://api.revenuecat.com/v1`.
- Confirm the production database permits creation of the unique `iap_events.event_id` index.

## 4. Sandbox acceptance test

Use an Apple sandbox tester and a fresh RMC account.

1. Open Profile in the iOS app and confirm the Buy button is enabled.
2. Buy one pack and confirm Apple's sheet shows the configured localized price.
3. Confirm the freeze balance increases by exactly five.
4. Tap Restore Purchases and confirm the same transaction is not credited again.
5. Trigger sync twice quickly and confirm the balance still increases only once.
6. Temporarily make RevenueCat verification unavailable after an Apple-confirmed purchase; confirm the app says payment was received and fulfillment is pending.
7. Restore connectivity, tap Restore Purchases, and confirm the paid pack is credited exactly once.
8. Replay the same webhook and confirm it creates no additional credit.
9. Confirm an invalid webhook bearer token receives HTTP 401.
10. Confirm an unknown product ID receives HTTP 400.

## 5. Go-live evidence

Before marking this channel live, retain:

- App Store Connect product status screenshot
- successful sandbox receipt timestamp
- RevenueCat customer event showing `rmc.freeze.pack5`
- backend webhook HTTP 200 event
- before/after balance proving exactly five credits
- duplicate webhook/sync test proving no second credit

## Launch gate

The channel is ready for customers only when every item above passes. The app now fails closed when RevenueCat configuration or server verification is unavailable: it will not claim that five freezes were delivered unless the server verifies the purchase.
