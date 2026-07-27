/**
 * Apple Game Center + Google Play Games leaderboard bridge.
 *
 * Uses @openforge/capacitor-game-services which wraps GameKit (iOS) and Play Games (Android).
 * Safe no-op on web - our own MongoDB leaderboards still work.
 *
 * Setup steps AFTER App Store Connect is provisioned:
 *   1. In Xcode: Signing & Capabilities → + Capability → Game Center
 *   2. In App Store Connect: Features → Game Center → Enable
 *      - Create one Leaderboard per game (Ids below), Score Format: Integer
 *   3. On Android (later): Google Play Console → Play Games Services
 */

const LEADERBOARD_IDS = {
  memory:   { ios: "rmc.memory.wins",   android: "" },
  snakes:   { ios: "rmc.snakes.wins",   android: "" },
  connect4: { ios: "rmc.connect4.wins", android: "" },
  checkers: { ios: "rmc.checkers.wins", android: "" },
  rps:      { ios: "rmc.rps.wins",      android: "" },
  crazy8:   { ios: "rmc.crazy8.wins",   android: "" },
  chess:    { ios: "rmc.chess.wins",    android: "" },
  uno:      { ios: "rmc.wildcards.wins",android: "" },
  ludo:     { ios: "rmc.ludo.wins",     android: "" },
  scrabble: { ios: "rmc.wordtiles.high",android: "" },
  dominoes: { ios: "rmc.dominoes.wins", android: "" },
  gofish:   { ios: "rmc.gofish.wins",   android: "" },
  oldmaid:  { ios: "rmc.oldmaid.wins",  android: "" },
  global:   { ios: "rmc.global.wins",   android: "" },
};

let signedIn = false;
let cachedPlugin = null;

async function getPlugin() {
  if (cachedPlugin) return cachedPlugin;
  try {
    const mod = await import("@openforge/capacitor-game-services");
    cachedPlugin = mod.CapacitorGameServices || mod.default;
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

/** Sign in silently on app launch. Called once from ThemeProvider. */
export async function signInGameCenter() {
  if (!isNative() || signedIn) return false;
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    await plugin.signIn();
    signedIn = true;
    return true;
  } catch (err) {
    console.warn("GameCenter sign-in failed:", err);
    return false;
  }
}

/** Submit a score to Apple Game Center / Play Games. Fire-and-forget. */
export async function submitLeaderboardScore(gameId, score) {
  if (!isNative()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  const cfg = LEADERBOARD_IDS[gameId] || LEADERBOARD_IDS.global;
  const platform = window.Capacitor?.getPlatform?.() || "ios";
  const leaderboardId = platform === "android" ? cfg.android : cfg.ios;
  if (!leaderboardId) return;
  try {
    if (!signedIn) await signInGameCenter();
    await plugin.submitScore({
      leaderboardID: leaderboardId,
      score: Math.max(0, Math.round(score)),
    });
  } catch (err) {
    console.warn(`GameCenter submitScore(${gameId}=${score}) failed:`, err);
  }
}

/** Open the native leaderboard UI. */
export async function showLeaderboard(gameId = "global") {
  if (!isNative()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  const cfg = LEADERBOARD_IDS[gameId] || LEADERBOARD_IDS.global;
  const platform = window.Capacitor?.getPlatform?.() || "ios";
  const leaderboardId = platform === "android" ? cfg.android : cfg.ios;
  if (!leaderboardId) return;
  try {
    if (!signedIn) await signInGameCenter();
    await plugin.showLeaderboard({ leaderboardID: leaderboardId });
  } catch (err) {
    console.warn("GameCenter showLeaderboard failed:", err);
  }
}
