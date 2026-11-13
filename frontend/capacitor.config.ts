import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the native iOS / Android shells.
 * App bundle ID: com.rmcclassics.app
 *
 * Build steps (run on macOS with Xcode 15+ installed):
 *   cd frontend
 *   npm ci                    # install the pinned lockfile with npm 10
 *   npm run build             # produces frontend/build
 *   ./node_modules/.bin/cap add ios           # first time only
 *   ./node_modules/.bin/cap sync ios
 *   ./node_modules/.bin/cap open ios          # opens Xcode → Product > Archive → Distribute to App Store
 *
 * Android:
 *   ./node_modules/.bin/cap add android
 *   ./node_modules/.bin/cap sync android
 *   ./node_modules/.bin/cap open android
 */
const config: CapacitorConfig = {
  appId: "com.rmcclassics.app",
  appName: "RMC CLASSICS",
  webDir: "build",
  backgroundColor: "#0B0A1A",
  ios: {
    contentInset: "always",
    scrollEnabled: true,
    preferredContentMode: "mobile",
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: "#0B0A1A",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0B0A1A",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0B0A1A",
      overlaysWebView: false,
    },
    Haptics: {},
  },
};

export default config;
