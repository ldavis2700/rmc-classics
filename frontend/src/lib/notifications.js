/**
 * Local notifications for daily challenge reminders.
 * Uses @capacitor/local-notifications (no external service needed).
 *
 * Behaviour:
 *   - Once permission is granted, schedule a repeating notification every day at 19:00 local time.
 *   - Reminders are device-local and continue until explicitly disabled.
 *   - Web has no background scheduler: do not request permission or claim a reminder.
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
  return "unsupported";
}

export async function disableDailyReminder() {
  if (isNative()) {
    const plugin = await getPlugin();
    if (!plugin) throw new Error("Reminder service unavailable");
    // Cancellation must succeed before the UI reports that reminders are off.
    await plugin.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key: "reminderEnabled" });
    } catch {
      /* Actual pending notifications, not this legacy marker, determine state. */
    }
    return;
  }
  try { localStorage.removeItem("reminderEnabled"); } catch { /* optional legacy cleanup */ }
}

export async function isReminderEnabled() {
  if (!isNative()) return false;
  try {
    const plugin = await getPlugin();
    if (!plugin) return false;
    const permission = await plugin.checkPermissions();
    if (permission.display !== "granted") return false;
    const pending = await plugin.getPending();
    return pending.notifications.some((notification) => notification.id === NOTIFICATION_ID);
  } catch {
    return false;
  }
}
