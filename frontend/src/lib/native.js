/**
 * Native bridge - safe wrappers around Capacitor plugins.
 * Falls back to no-op / Web API when running in the browser (PWA).
 * This module lazy-imports Capacitor so it doesn't add weight to the web bundle.
 */

let cachedIsNative = null;

export function isNative() {
  if (cachedIsNative !== null) return cachedIsNative;
  try {
    cachedIsNative = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  } catch {
    cachedIsNative = false;
  }
  return cachedIsNative;
}

/**
 * Trigger a haptic tap. Style: "light" | "medium" | "heavy" | "success" | "warning" | "error"
 */
export async function haptic(style = "light") {
  if (!isNative()) {
    // Web fallback - use Vibration API if available (Android Chrome, some iOS PWAs)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      const ms = style === "heavy" ? 25 : style === "medium" ? 15 : 8;
      navigator.vibrate(ms);
    }
    return;
  }
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (style === "success") return Haptics.notification({ type: NotificationType.Success });
    if (style === "warning") return Haptics.notification({ type: NotificationType.Warning });
    if (style === "error") return Haptics.notification({ type: NotificationType.Error });
    const impact =
      style === "heavy" ? ImpactStyle.Heavy : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
    return Haptics.impact({ style: impact });
  } catch {
    /* plugin missing - no-op */
  }
}

/**
 * Native share sheet. Falls back to navigator.share on web, then clipboard.
 * @param {{ title?: string, text?: string, url?: string }} payload
 */
export async function share(payload) {
  const { title = "RMC CLASSICS", text = "", url = "" } = payload || {};
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url, dialogTitle: "Share your win" });
      return true;
    } catch (error) {
      if ((error?.message || "").toLowerCase().includes("cancel")) return false;
      /* plugin unavailable: fall through to web sharing */
    }
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      /* user cancelled - not an error */
      return false;
    }
  }
  // Last resort: clipboard
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(`${text} ${url}`.trim());
    return true;
  }
  return false;
}

/**
 * Set the native status bar style to match the current theme background.
 * Safe no-op on web.
 */
export async function setStatusBarStyle(backgroundColor = "#0B0A1A", dark = true) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color: backgroundColor });
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    /* plugin missing */
  }
}
