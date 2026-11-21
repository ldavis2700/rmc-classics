import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const source = await readFile(new URL("../frontend/src/lib/notifications.js", import.meta.url), "utf8");
function fixture({ native = true, permission = "granted", pending = [], failure } = {}) {
  const calls = [];
  const plugin = {
    requestPermissions: async () => { calls.push("request"); return { display: permission }; },
    checkPermissions: async () => { calls.push("check"); return { display: permission }; },
    getPending: async () => ({ notifications: pending }),
    schedule: async (value) => { calls.push(["schedule", value]); if (failure === "schedule") throw Error("schedule failed"); },
    cancel: async (value) => { calls.push(["cancel", value]); if (failure === "cancel") throw Error("cancel failed"); },
  };
  const preferences = { set: async () => calls.push("set"), remove: async () => calls.push("remove") };
  const code = source.replaceAll('export ', '')
    .replaceAll('import("@capacitor/local-notifications")', 'Promise.resolve({ LocalNotifications: plugin })')
    .replaceAll('import("@capacitor/preferences")', 'Promise.resolve({ Preferences: preferences })');
  const api = new Function("window", "Notification", "localStorage", "plugin", "preferences",
    code + "; return { enableDailyReminder, disableDailyReminder, isReminderEnabled };")(
    { Capacitor: { isNativePlatform: () => native } },
    { requestPermission: () => assert.fail("Web must not request unschedulable permission") },
    { getItem: () => "1", setItem: () => assert.fail("No false web preference"), removeItem: () => calls.push("legacy-remove") },
    plugin, preferences);
  return { ...api, calls };
}
test("web neither requests permission nor claims a scheduled reminder, including stale flags", async () => {
  const f = fixture({ native: false });
  assert.equal(await f.enableDailyReminder(), "unsupported");
  assert.equal(await f.isReminderEnabled(), false);
  await f.disableDailyReminder();
  assert.deepEqual(f.calls, ["legacy-remove"]);
});
test("native denial never schedules or persists opt-in", async () => {
  const f = fixture({ permission: "denied" });
  assert.equal(await f.enableDailyReminder(), "denied");
  assert.deepEqual(f.calls, ["request"]);
});
test("native opt-in schedules only the daily local 19:00 reminder", async () => {
  const f = fixture(); assert.equal(await f.enableDailyReminder(), "granted");
  const n = f.calls[1][1].notifications;
  assert.equal(n.length, 1); assert.equal(n[0].id, 4242);
  assert.deepEqual(n[0].schedule.on, { hour: 19, minute: 0 });
  assert.equal(n[0].schedule.repeats, true); assert.equal(n[0].sound, null);
  assert.equal(f.calls.at(-1), "set");
});
test("failed scheduling does not persist success", async () => {
  const f = fixture({ failure: "schedule" }); await assert.rejects(f.enableDailyReminder());
  assert(!f.calls.includes("set"));
});
test("failed cancellation propagates and does not clear the preference", async () => {
  const f = fixture({ failure: "cancel" }); await assert.rejects(f.disableDailyReminder());
  assert(!f.calls.includes("remove"));
});
test("cancellation targets only RMC's reminder before preference cleanup", async () => {
  const f = fixture(); await f.disableDailyReminder();
  assert.deepEqual(f.calls, [["cancel", { notifications: [{ id: 4242 }] }], "remove"]);
});
test("enabled state requires current permission and our actual pending notification without prompting", async () => {
  for (const [permission, pending, expected] of [
    ["granted", [{ id: 4242 }], true],
    ["granted", [], false],
    ["granted", [{ id: 999 }], false],
    ["denied", [{ id: 4242 }], false],
  ]) {
    const f = fixture({ permission, pending });
    assert.equal(await f.isReminderEnabled(), expected);
    assert(!f.calls.includes("request"));
  }
});
