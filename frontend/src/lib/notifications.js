/**
 * Local notifications for daily challenge reminders.
 * Uses @capacitor/local-notifications (no external service needed).
 *
 * Behaviour:
 *   - Once permission is granted, schedule a repeating notification every day at 19:00 local time.
 *   - If the user already completed today's challenge, no reminder fires (checked server-side by title).
 *   - Safe no-op on web - falls back to Notification API when possible.
 */

const NOTIFICATION_ID = 4242;
const NOTIFICATION_HOUR = 19;   // 7pm local
const NOTIFICATION_MINUTE = 0;

let cachedPlugin = null;
async function getPlugin() {
  if (cachedPlugin) return cachedPlugin;
  try {
    const mod = await import("@capacitor/local-notifications");
    cachedPlugin = mod.LocalNotifications;
    return cachedPlugin;
  } catch {
    return null;
  }
}

function isNative() {
  try {
    return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Ask the user for notification permission and schedule the daily reminder.
 * Called from the "Enable reminders" button in Profile.
 * @returns {Promise<'granted' | 'denied' | 'unsupported'>}
 */
export async function enableDailyReminder() {
  if (isNative()) {
    const plugin = await getPlugin();
    if (!plugin) return "unsupported";
    const perm = await plugin.requestPermissions();
    if (perm.display !== "granted") return "denied";
    await plugin.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: "RMC CLASSICS",
          body: "Your daily challenge is waiting. Keep your streak alive.",
          schedule: {
            on: { hour: NOTIFICATION_HOUR, minute: NOTIFICATION_MINUTE },
            allowWhileIdle: true,
            repeats: true,
          },
          smallIcon: "res://drawable/ic_stat_icon",
          sound: null,
        },
      ],
    });
    // Persist preference
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: "reminderEnabled", value: "1" });
    } catch {
      /* optional */
    }
    return "granted";
  }
  // Web fallback (works when app is installed as PWA on Android)
  if (typeof Notification !== "undefined") {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      localStorage.setItem("reminderEnabled", "1");
      return "granted";
    }
    return "denied";
  }
  return "unsupported";
}

export async function disableDailyReminder() {
  if (isNative()) {
    const plugin = await getPlugin();
    if (!plugin) return;
    try {
      await plugin.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key: "reminderEnabled" });
    } catch {
      /* no-op */
    }
    return;
  }
  localStorage.removeItem("reminderEnabled");
}

export async function isReminderEnabled() {
  if (isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: "reminderEnabled" });
      return value === "1";
    } catch {
      return false;
    }
  }
  return localStorage.getItem("reminderEnabled") === "1";
}
