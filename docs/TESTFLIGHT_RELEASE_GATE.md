# RMC Classics TestFlight Release Gate

The signed TestFlight workflow requires these GitHub Actions secrets:
- `ASC_API_KEY_ID`
- `ASC_API_ISSUER_ID`
- `ASC_API_KEY_P8` (base64-encoded .p8 contents)
- `IOS_PROVISIONING_PROFILE_BASE64`

The workflow now keeps the App Store Connect API key inside one Fastlane lane so authentication remains available through `upload_to_testflight`.

Release sequence:
1. Confirm the four required secrets exist in repository Actions secrets.
2. Run `iOS Build & Upload to TestFlight` manually from Actions, or push an intentional `vX.Y.Z` tag.
3. Confirm the `Build iOS IPA` job succeeds and uploads the IPA artifact.
4. Confirm the build appears in App Store Connect/TestFlight.
5. Smoke-test that exact TestFlight build before App Store submission.

Do not commit any Apple signing secret to the repository.
