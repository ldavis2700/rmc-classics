# RMC Classics — Building the iOS IPA

You have **three** paths, in order of preference. Pick one.

---

## Path A (Recommended if you have any Mac): Local Xcode

You already have `frontend/ios/` scaffolded and synced — just open it in Xcode.

```bash
cd frontend
yarn install
CI=false yarn build
npx cap sync ios
npx cap open ios          # opens ios/App/App.xcworkspace in Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities**
2. Team: your Apple Developer account
3. Bundle Identifier: `com.rmcclassics.app` (should already be set)
4. Confirm capabilities: **Game Center**, **In-App Purchase**, **Push Notifications** (already declared in Info.plist for the first two)
5. Product → **Archive**
6. When archive completes: **Distribute App → App Store Connect → Upload**
7. Wait ~15 min for App Store Connect to process the build
8. In App Store Connect → **TestFlight** or **App Store** tab → select the new build

That produces an .ipa and uploads it in one step. Total time: **~15 min end-to-end**.

---

## Path B (No Mac): Codemagic Cloud CI

A `codemagic.yaml` is already committed at the repo root. Setup:

1. Push this whole repo to GitHub, GitLab, or Bitbucket
2. Sign up at [codemagic.io](https://codemagic.io) — free tier gives 500 build-minutes/month (each build takes ~15 min)
3. **Add application** → select your repo → Codemagic auto-detects `codemagic.yaml`
4. **Team settings → Integrations → App Store Connect**:
   - Get an App Store Connect API key: App Store Connect → Users and Access → Integrations → App Store Connect API → **+** → download the `.p8` file, note Key ID + Issuer ID
   - Upload the `.p8` file to Codemagic, name the integration exactly **`RMC ASC Key`** (matches the yaml)
5. Get your App Store Connect Apple ID:
   - App Store Connect → your app → **App Information** → find the numeric **Apple ID** (a big number)
   - Edit `codemagic.yaml` → replace `APP_STORE_APPLE_ID: 0000000000` with your number
   - Push the change
6. In Codemagic: pick the workflow **`ios-testflight`** → click **Start new build**
7. ~15 min later:
   - You receive an email with the signed IPA attached
   - The build is auto-uploaded to TestFlight in App Store Connect
   - Download the raw .ipa from Codemagic's artifacts UI if you want a local copy

Every push to `main` triggers a new build automatically (line 34 of the yaml).

### Codemagic — unsigned build variant

Use the `ios-unsigned` workflow (also in the yaml) if you just want an .xcarchive for offline inspection without any Apple credentials. Won't produce a distributable IPA but confirms the build compiles.

---

## Path C (No Mac, no Codemagic): GitHub Actions

Free 2000 macOS runner minutes/month on public repos, less on private. A workflow file is at `.github/workflows/ios-build.yml`. Same requirements as Path B (App Store Connect API key), but stored as GitHub Secrets instead of Codemagic integrations.

Trigger manually from the Actions tab, or on tags like `v1.0.0`.

---

## What was already prepared for you

- ✅ `frontend/ios/` — full Xcode workspace scaffolded via `npx cap add ios`
- ✅ `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/` — 18 correctly-sized icons + Contents.json
- ✅ `Info.plist` — `ITSAppUsesNonExemptEncryption=false` (skips export compliance filing), category set to `public.app-category.games`
- ✅ 8 Capacitor plugins linked (haptics, share, status-bar, splash, preferences, local-notifications, game-center, revenuecat)
- ✅ Bundle ID: `com.rmcclassics.app`

You do NOT need to run `npx cap add ios` again — it's already been done and committed.

---

## Version bumps (before every submission)

Edit `frontend/ios/App/App.xcodeproj/project.pbxproj` and change:
- `MARKETING_VERSION` → `1.0` for first submission, `1.0.1` etc. for later
- `CURRENT_PROJECT_VERSION` → increment by 1 each upload (`1`, `2`, `3`...)

Or from a Mac terminal:
```bash
cd frontend/ios/App
agvtool new-marketing-version 1.0
agvtool new-version -all 1
```

Codemagic's workflow auto-increments the build number via `agvtool new-version -all "$(($BUILD_NUMBER + 1))"` (see yaml line ~55).
