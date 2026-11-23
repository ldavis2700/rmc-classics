/* Run against a disposable local API serving frontend/build. Never production. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { chromium } = require(process.env.RMC_PLAYWRIGHT_MODULE || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright") : "playwright"));
const base = process.env.RMC_BROWSER_TEST_URL || "http://127.0.0.1:8765";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Use only a disposable local test backend");
const password = "DisposableTableTest-2026!";
const errors = [];
const tableCaptures = {};
const landscapeCaptures = {};
let unavailableStoreCapture = null;
async function captureTableState(page, name) {
  if (!process.env.RMC_APP_CAPTURE_DIR) return;
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  assert(await page.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth),
    `Horizontal overflow in ${name}`);
  await page.evaluate(() => document.fonts.ready);
  const bytes = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
  assert.equal(bytes.readUInt32BE(16), 390);
  assert.equal(bytes.readUInt32BE(20), 844);
  tableCaptures[name + ".png"] = bytes;
}
const labels = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };
const ranks = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const cardLabel = (c) => `${ranks[c.slice(1)] || c.slice(1)} of ${labels[c[0]]}`;
async function api(endpoint, token, body) {
  const response = await fetch(`${base}/api${endpoint}`, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert(response.ok, `${endpoint}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function signIn(page, email) {
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-terms-checkbox").check();
  await page.getByTestId("login-submit").click();
}
async function captureActualApp(browser, user) {
  const output = process.env.RMC_APP_CAPTURE_DIR;
  if (!output) return; // Opt-in only in the disposable CI harness.
  const candidate = process.env.RMC_CAPTURE_CANDIDATE;
  assert(/^[a-f0-9]{40}$/.test(candidate || ""), "Capture requires candidate identity");
  fs.mkdirSync(output, { recursive: false });
  const context = await browser.newContext({
    viewport: { width: 428, height: 926 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
  });
  let tabletContext;
  // Captures obey the same isolation boundary as the gameplay acceptance.
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin
    ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const files = {};
  try {
    await page.goto(`${base}/login`);
    await signIn(page, user.email);
    await page.waitForURL(`${base}/profile`);
    await page.getByTestId("profile-email").filter({ hasText: user.email }).waitFor();
    const screens = [
      ["/", "01-home", "hero-tag"],
      ["/library", "02-library", "game-card-chess"],
      ["/leaderboard", "03-leaderboard", "leaderboard-list"],
      ["/play/chess", "04-chess", "chess-board"],
      ["/play/memory", "05-memory", "memory-board"],
      ["/play/connect4", "06-connect4", "c4-board"],
      ["/profile", "07-profile", "profile-name"],
      ["/privacy", "08-privacy", "legal-title"],
    ];
    for (const [route, name, ready] of screens) {
      const response = await page.goto(`${base}${route}`);
      assert(response.ok(), "Capture route must respond successfully");
      const destination = new URL(page.url());
      assert.equal(destination.origin, new URL(base).origin);
      assert([route, route === "/" ? "/" : `${route}/`].includes(destination.pathname),
        `Unexpected capture route: ${destination.pathname}`);
      assert.equal(destination.search, "");
      assert.equal(destination.hash, "");
      await page.getByTestId(ready).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200); // Finish entrance animations.
      assert(await page.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth),
        `Horizontal overflow in phone capture ${name}`);
      const bytes = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
      assert.equal(bytes.readUInt32BE(16), 1284);
      assert.equal(bytes.readUInt32BE(20), 2778);
      fs.writeFileSync(path.join(output, name + ".png"), bytes);
      files[name + ".png"] = crypto.createHash("sha256").update(bytes).digest("hex");
    }
    // Tablet-sized Chromium evidence is layout coverage, not an iPad/native capture.
    tabletContext = await browser.newContext({
      viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true,
    });
    await tabletContext.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue() : route.abort());
    const tablet = await tabletContext.newPage();
    tablet.on("pageerror", (error) => errors.push(error.message));
    await tablet.goto(`${base}/login`);
    await signIn(tablet, user.email);
    await tablet.waitForURL(`${base}/profile`);
    await tablet.getByTestId("profile-email").filter({ hasText: user.email }).waitFor();
    fs.mkdirSync(path.join(output, "tablet"));
    const tabletFiles = {};
    for (const [route, name, ready] of screens) {
      const response = await tablet.goto(`${base}${route}`);
      assert(response.ok(), "Tablet capture route must respond successfully");
      const destination = new URL(tablet.url());
      assert.equal(destination.origin, new URL(base).origin);
      assert([route, route === "/" ? "/" : `${route}/`].includes(destination.pathname),
        `Unexpected tablet capture route: ${destination.pathname}`);
      assert.equal(destination.search, "");
      assert.equal(destination.hash, "");
      await tablet.getByTestId(ready).waitFor();
      await tablet.evaluate(() => document.fonts.ready);
      await tablet.waitForTimeout(1200);
      assert(await tablet.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth),
        `Horizontal overflow in tablet capture ${name}`);
      const bytes = await tablet.screenshot({ type: "png", fullPage: false, animations: "disabled" });
      assert.equal(bytes.readUInt32BE(16), 2064);
      assert.equal(bytes.readUInt32BE(20), 2752);
      const file = `tablet/${name}.png`;
      fs.writeFileSync(path.join(output, file), bytes);
      tabletFiles[file] = crypto.createHash("sha256").update(bytes).digest("hex");
    }
    assert.equal(Object.keys(tableCaptures).length, 3, "Require all online table states");
    const tableFiles = {};
    for (const [name, bytes] of Object.entries(tableCaptures)) {
      fs.writeFileSync(path.join(output, name), bytes);
      tableFiles[name] = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        width: 390, height: 844, scope: "actual-online-table-disposable-ci-browser-only" };
    }
    assert(unavailableStoreCapture, "Require unavailable-store fixture capture");
    const storeName = "12-store-unavailable-fixture.png";
    fs.writeFileSync(path.join(output, storeName), unavailableStoreCapture);
    const storeFixture = { file: storeName,
      sha256: crypto.createHash("sha256").update(unavailableStoreCapture).digest("hex"),
      width: 390, height: 844, scope: "simulated-android-store-unavailable-browser-only",
      real_store_validated: false };
    assert.equal(Object.keys(landscapeCaptures).length, 12, "Require all landscape routes and viewports");
    fs.mkdirSync(path.join(output, "landscape"));
    const landscapeFiles = {};
    for (const [name, { bytes, width, height, route }] of Object.entries(landscapeCaptures)) {
      fs.writeFileSync(path.join(output, name), bytes);
      landscapeFiles[name] = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        width, height, route, scope: "landscape-chromium-layout-only",
        physical_device_rotation_validated: false };
    }
    const manifest = fs.readFileSync("frontend/build/rmc-release.json");
    fs.writeFileSync(path.join(output, "capture-receipt.json"), JSON.stringify({
      scope: "actual-app-disposable-ci-browser-only", candidate_commit: candidate,
      run_id: process.env.GITHUB_RUN_ID || null,
      browser: "Chromium", width: 1284, height: 2778,
      account_type: "synthetic-disposable-test-account",
      web_manifest_sha256: crypto.createHash("sha256").update(manifest).digest("hex"),
      signed_device_validation: false, production_deployment_verified: false,
      resubmission_ready: false, landscape_captures: landscapeFiles, files_sha256: files, table_captures: tableFiles, store_fixture: storeFixture,
      tablet_captures: { scope: "tablet-sized-chromium-layout-only", width: 2064, height: 2752,
        viewport_width: 1032, viewport_height: 1376, device_scale_factor: 2,
        actual_ipad_validated: false, files_sha256: tabletFiles },
    }, null, 2) + "\n");
    console.log("PASS: eight phone and eight tablet-sized app views, three online tables, one simulated store and twelve landscape captures; dimensions and hashes; disposable CI only");
  } finally {
    if (tabletContext) await tabletContext.close();
    await context.close();
  }
}
async function verifyUnavailableStore(browser, user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const creditRequests = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/iap/")) {
      creditRequests.push(url.pathname);
      return route.abort();
    }
    return url.origin === new URL(base).origin ? route.continue() : route.abort();
  });
  // Test-only bridge: every plugin call fails, never reaches a device/store.
  await context.addInitScript(() => {
    window.__unavailableStoreCalls = [];
    window.androidBridge = { postMessage(raw) {
      const call = JSON.parse(raw);
      window.__unavailableStoreCalls.push(call.methodName);
      queueMicrotask(() => window.Capacitor?.fromNative?.({
        callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName,
        success: false, error: { message: "Disposable unavailable-store fixture", code: "UNAVAILABLE" },
      }));
    } };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android" };
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/login`);
    await signIn(page, user.email);
    await page.waitForURL(`${base}/profile`);
    const retry = page.getByTestId("freeze-buy-btn");
    await retry.filter({ hasText: "Retry store price" }).waitFor();
    assert(await retry.isEnabled());
    const balance = await page.getByTestId("freeze-balance").textContent();
    await retry.click();
    await retry.filter({ hasText: "Retry store price" }).waitFor();
    assert(await retry.isEnabled());
    await page.getByTestId("freeze-restore-btn").click();
    await page.getByText("Purchases are temporarily unavailable.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("freeze-balance").textContent(), balance);
    assert.deepEqual(creditRequests, [], "Unavailable store must not request purchase credits");
    assert.equal(await page.evaluate(() => window.__unavailableStoreCalls.includes("purchaseStoreProduct")), false);
    if (process.env.RMC_APP_CAPTURE_DIR) {
      await page.getByTestId("freeze-restore-btn").scrollIntoViewIfNeeded();
      assert(await page.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth),
        "Unavailable store must not overflow mobile width");
      for (const control of [retry, page.getByTestId("freeze-restore-btn")]) {
        const box = await control.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= 390, "Store controls must fit mobile width");
        assert(box.height >= 44, "Store controls must offer at least a 44px-high touch target");
      }
      await page.evaluate(() => document.fonts.ready);
      unavailableStoreCapture = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
      assert.equal(unavailableStoreCapture.readUInt32BE(16), 390);
      assert.equal(unavailableStoreCapture.readUInt32BE(20), 844);
    }
    console.log("PASS: unavailable native-store fixture permits price retry, reports restore failure, preserves balance and never requests purchase credits");
  } finally { await context.close(); }
}

async function verifyMemoryScoreResponses(browser) {
  const email = `memory-${crypto.randomUUID()}@example.com`;
  const registered = await api("/auth/register", null, {
    name: "Disposable Memory Player", email, password, accepted_terms: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pending = [], routeErrors = [], blockedProfileRefreshes = [];
  let holdProfileRefresh = false;
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (holdProfileRefresh && url.pathname === "/api/auth/me" && request.method() === "GET") {
      blockedProfileRefreshes.push(route);
      return; // Do not let Profile's mount refresh repair stale context before the assertion.
    }
    if (url.pathname !== "/api/games/submit" || request.method() !== "POST") return route.continue();
    try {
      assert.equal(request.postDataJSON().game_id, "memory");
      // The real disposable API processes each score once. Delay delivery only.
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      const data = await response.json();
      pending.push({ route, response, data, released: false });
    } catch (error) { routeErrors.push(error.message); await route.abort(); }
  });
  await context.addInitScript(() => {
    const timeout = window.setTimeout.bind(window);
    // Accelerate pair animation only; preserve real clicks, state and API calls.
    window.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 350 || delay === 800 ? 100 : delay, ...args);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const waitPending = async count => {
    for (let i = 0; i < 100 && pending.length < count && !routeErrors.length; i++) await page.waitForTimeout(50);
    assert.deepEqual(routeErrors, []);
    assert.equal(pending.length, count, "One score request per completed round");
  };
  const release = async index => {
    const item = pending[index];
    item.released = true;
    const delivered = page.waitForResponse(r => r.url().endsWith("/games/submit") && r.request().method() === "POST");
    await item.route.fulfill({ response: item.response });
    await delivered;
    await page.waitForTimeout(150); // Let the response promise update React state.
  };
  const finishRound = async () => {
    const symbols = [], matched = new Set();
    // Learn the shuffled deck using visible card faces, without reading React state.
    for (let i = 0; i < 16; i += 2) {
      await page.getByTestId(`memory-card-${i}`).click();
      symbols[i] = await page.getByTestId(`memory-card-${i}`).textContent();
      await page.getByTestId(`memory-card-${i + 1}`).click();
      symbols[i + 1] = await page.getByTestId(`memory-card-${i + 1}`).textContent();
      if (symbols[i] === symbols[i + 1]) { matched.add(i); matched.add(i + 1); }
      await page.waitForTimeout(150);
    }
    for (let i = 0; i < 16; i++) {
      if (matched.has(i)) continue;
      const j = symbols.findIndex((symbol, index) => index !== i && !matched.has(index) && symbol === symbols[i]);
      assert(j >= 0 && symbols[i] !== "?", "Every visible symbol has a pair");
      await page.getByTestId(`memory-card-${i}`).click();
      await page.getByTestId(`memory-card-${j}`).click();
      matched.add(i); matched.add(j);
      await page.waitForTimeout(150);
    }
    await page.getByText("// CLEARED", { exact: true }).waitFor();
  };
  try {
    await page.goto(`${base}/login`);
    await signIn(page, email); await page.waitForURL(`${base}/profile`);
    await page.goto(`${base}/play/memory`);
    await finishRound(); await waitPending(1);
    assert.equal(await page.getByTestId("share-card-modal").count(), 0);
    await page.getByTestId("game-reset").click();
    assert.equal(await page.getByTestId("memory-board").getByRole("button", { name: "?", exact: true }).count(), 16);
    await finishRound(); await waitPending(2);
    await release(1);
    const modal = page.getByTestId("share-card-modal");
    await modal.waitFor();
    assert((await modal.textContent()).includes("Victory!"));
    if (pending[1].data.xp_gained) {
      assert(await modal.getByText(`+${pending[1].data.xp_gained}`, { exact: true }).isVisible());
    }
    await page.getByTestId("share-close-btn").click();
    await modal.waitFor({ state: "hidden" });
    const reconciled = page.waitForResponse(r => r.url().endsWith("/auth/me") && r.request().method() === "GET");
    await release(0);
    const profileResponse = await reconciled;
    assert.equal(profileResponse.status(), 200);
    assert.equal((await profileResponse.json()).user.xp, pending[1].data.user.xp,
      "Settled overlapping scores reconcile authoritative profile totals");
    assert.equal(await modal.count(), 0, "Old round must not reopen the dismissed current result");
    assert.equal(pending.length, 2, "No duplicate score submission after old response");
    await page.getByText("// CLEARED", { exact: true }).waitFor();
    // Navigate through the SPA so AuthContext survives. A full reload would mask the bug.
    holdProfileRefresh = true;
    await page.getByTestId("mobile-nav-profile").click();
    await page.waitForURL(`${base}/profile`);
    await page.getByTestId("profile-email").filter({ hasText: email }).waitFor();
    for (let i = 0; i < 100 && !blockedProfileRefreshes.length; i++) await page.waitForTimeout(20);
    assert(blockedProfileRefreshes.length > 0, "Profile mount refresh was intercepted");
    const visibleXP = page.getByText("XP", { exact: true }).locator("..").locator("div").first();
    assert.equal((await visibleXP.textContent()).trim(), String(pending[1].data.user.xp),
      "Visible profile XP must already be reconciled before mount refresh responds");
    assert.deepEqual(routeErrors, []);
    console.log("PASS: two compiled Memory rounds, Reset, real score processing with reversed response delivery, current award, authoritative profile reconciliation, visible XP with mount refresh held and no stale result reopening or duplicate submissions; disposable browser only");
  } finally {
    for (const route of blockedProfileRefreshes) await route.abort().catch(() => {});
    for (const item of pending) if (!item.released) await item.route.abort().catch(() => {});
    await context.close();
    const deleted = await fetch(`${base}/api/auth/account`, { method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${registered.token}` },
      body: JSON.stringify({ password }) });
    assert.equal(deleted.status, 200, "Disposable Memory account cleanup");
  }
}

async function verifyGameHeaderControls(browser) {
  const context = await browser.newContext({ hasTouch: true });
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin
    ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const [width, height] of [[320, 844], [844, 390], [667, 375]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/play/memory`);
      await page.getByTestId("memory-board").waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert(await page.locator("html").evaluate((el) => el.scrollWidth <= innerWidth),
        `Game header must fit ${width}x${height}`);
      for (const id of ["game-back", "game-share", "game-reset"]) {
        const control = page.getByTestId(id);
        await control.click({ trial: true });
        const box = await control.boundingBox();
        assert(box && box.width >= 44 && box.height >= 44,
          `${id} touch target must be at least 44px at ${width}x${height}`);
      }
      await page.getByTestId("memory-card-0").click();
      await page.getByTestId("memory-card-1").click();
      assert.equal((await page.getByTestId("memory-moves").textContent()).trim(), "Moves: 1");
      await page.waitForTimeout(850); // Finish the game's pair-resolution animation.
      await page.getByTestId("game-reset").click();
      assert.equal((await page.getByTestId("memory-moves").textContent()).trim(), "Moves: 0");
      assert.equal(await page.getByTestId("memory-board").getByRole("button", { name: "?", exact: true }).count(), 16);
      await page.getByTestId("game-back").click();
      await page.waitForURL(`${base}/library`);
      await page.getByTestId("game-card-memory").waitFor();
    }
    console.log("PASS: game Back/Share/Reset 44px targets, no horizontal overflow, real Memory reset and Library return at 320x844, 844x390 and 667x375; share actionability only, no external share");
  } finally { await context.close(); }
}

async function verifyAnonymousOnboarding(browser) {
  // No injected token: guest play must remain available before account creation.
  for (const [width, height] of [[844, 390], [667, 375]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    let token;
    try {
      await page.goto(base);
      await page.getByTestId("hero-tag").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), null);
      const nav = await page.locator('nav [data-testid="mobile-nav-home"]').boundingBox();
      for (const id of ["hero-play-btn", "hero-secondary-btn"]) {
        const control = page.getByTestId(id);
        const box = await control.boundingBox();
        assert(box && nav && box.y >= 0 && box.y + box.height <= nav.y && box.height >= 44,
          `Guest ${id} must fit above bottom navigation at ${width}x${height}`);
        await control.click({ trial: true });
      }
      assert.equal((await page.getByTestId("hero-secondary-btn").textContent()).trim(), "Create account");
      await page.getByTestId("hero-play-btn").click();
      await page.waitForURL(`${base}/library`);
      await page.getByTestId("game-card-spades").click();
      await page.waitForURL(`${base}/play/spades`);
      await page.getByTestId("spades-board").waitFor();
      await page.getByRole("button", { name: "Bid 3", exact: true }).click();
      // A legal hand interaction proves this is playable, not just a visible board.
      await page.getByTestId("spades-hand").locator("button:enabled").first().click();
      assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), null);

      await page.goto(base);
      await page.getByTestId("hero-secondary-btn").click();
      await page.waitForURL(`${base}/register`);
      const email = `guest-${Date.now()}-${width}@example.com`;
      await page.getByTestId("register-name").fill("Disposable Guest");
      await page.getByTestId("register-email").fill(email);
      await page.getByTestId("register-password").fill(password);
      assert.equal(await page.getByTestId("register-submit").isEnabled(), false,
        "Account creation requires explicit consent");
      const popupPromise = page.waitForEvent("popup");
      await page.locator("form").getByRole("link", { name: "Privacy Policy", exact: true }).click();
      const privacy = await popupPromise;
      await privacy.waitForURL((url) => url.origin === new URL(base).origin &&
        ["/privacy", "/privacy/"].includes(url.pathname) && !url.search && !url.hash);
      await privacy.getByTestId("legal-title").waitFor();
      await privacy.close();
      assert.equal(await page.getByTestId("register-email").inputValue(), email,
        "Reading privacy policy must preserve the registration form");
      await page.getByTestId("register-terms-checkbox").check();
      assert(await page.locator("html").evaluate((el) => el.scrollWidth <= innerWidth),
        "Landscape registration must not overflow horizontally");
      const response = page.waitForResponse((r) => r.url().endsWith("/auth/register") && r.request().method() === "POST");
      await page.getByTestId("register-submit").click();
      const registered = await response;
      assert.equal(registered.status(), 200);
      token = (await registered.json()).token;
      assert(token, "Registration returns a disposable authenticated session");
      await page.waitForURL(`${base}/library`);
      await page.getByTestId("game-card-spades").waitFor();
      await page.goto(`${base}/profile`);
      await page.getByTestId("profile-email").filter({ hasText: email }).waitFor();
    } finally {
      if (token) {
        const deleted = await fetch(`${base}/api/auth/account`, { method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ password }) });
        assert.equal(deleted.status, 200, "Disposable guest account cleanup");
      }
      await context.close();
    }
  }
  console.log("PASS: anonymous Home-to-Library-to-Spades play, landscape primary/secondary controls, registration consent/privacy/form preservation, Library return, profile session and account cleanup at 844x390 and 667x375; browser-only");
}

async function verifyLandscapeLayouts(browser, user) {
  // Browser viewport resizing is not physical-device rotation or safe-area validation.
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin
    ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/login`);
    await signIn(page, user.email);
    await page.waitForURL(`${base}/profile`);
    for (const [width, height] of [[844, 390], [667, 375], [1376, 1032]]) {
      await page.setViewportSize({ width, height });
      for (const [route, ready] of [["/", "hero-tag"], ["/library", "game-card-chess"],
        ["/privacy", "legal-title"], ["/profile", "profile-name"]]) {
        const response = await page.goto(`${base}${route}`);
        assert(response.ok(), "Landscape route must respond");
        assert.equal(new URL(page.url()).pathname.replace(/\/$/, "") || "/", route);
        await page.getByTestId(ready).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert(await page.locator("html").evaluate((el) => el.scrollWidth <= innerWidth),
          `Horizontal overflow on ${route} at ${width}x${height}`);
        if (route === "/" && height <= 500) {
          await page.waitForTimeout(700); // Let the hero entrance finish before measuring.
          const play = page.getByTestId("hero-play-btn");
          const nav = await page.locator('nav [data-testid="mobile-nav-home"]').boundingBox();
          const box = await play.boundingBox();
          assert(box && nav && box.y >= 0 && box.y + box.height <= nav.y,
            `Landscape play action must be above bottom navigation without scrolling: ${width}x${height} play=${JSON.stringify(box)} nav=${JSON.stringify(nav)}`);
          assert(box.height >= 44, "Play action retains a 44px touch target");
          assert(await play.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return hit === el || el.contains(hit);
          }), "Landscape play action must not be covered");
        }
        // Trial clicks scroll and perform Playwright's visibility/stability/hit checks
        // without triggering purchases, notifications or other side effects.
        if (route === "/library") await page.getByTestId("game-card-chess").click({ trial: true });
        if (route === "/profile") {
          assert.equal(await page.getByTestId("profile-email").textContent(), user.email);
          await page.getByTestId("reminder-toggle").click({ trial: true });
        }
        await page.evaluate(() => scrollTo(0, 0));
        if (process.env.RMC_APP_CAPTURE_DIR) {
          const bytes = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
          assert.equal(bytes.readUInt32BE(16), width);
          assert.equal(bytes.readUInt32BE(20), height);
          const name = `landscape/${width}x${height}-${route === "/" ? "home" : route.slice(1)}.png`;
          landscapeCaptures[name] = { bytes, width, height, route };
        }
        if (route === "/" && height <= 500) {
          await page.getByTestId("hero-play-btn").click();
          await page.waitForURL(`${base}/library`);
          await page.getByTestId("game-card-chess").waitFor();
        }
        const profileNav = page.locator('[data-testid="mobile-nav-profile"]:visible, [data-testid="nav-profile"]:visible').first();
        await profileNav.click();
        await page.waitForURL(`${base}/profile`);
        await page.getByTestId("profile-email").filter({ hasText: user.email }).waitFor();
      }
    }
    console.log("PASS: landscape home/library/privacy/profile at 844x390, 667x375 and 1376x1032; no horizontal overflow; primary controls actionable and profile navigation preserves session; browser-only");
  } finally { await context.close(); }
}

async function verifyMobileNavigation(page) {
  const items = ["home", "library", "battles", "friends", "leaderboard", "profile"];
  // Check actual rendered labels: document width alone misses clipped fixed nav.
  for (const width of [320, 360, 390, 428]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    const links = page.locator('nav [data-testid^="mobile-nav-"]');
    assert.equal(await links.count(), items.length);
    let previousRight = 0;
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      assert(box && box.x >= -0.5 && box.x + box.width <= width + 0.5,
        `Mobile tab outside ${width}px viewport`);
      assert(box.width >= 44 && box.height >= 44, "Mobile tab touch target must be at least 44px");
      assert(box.x >= previousRight - 0.5, "Mobile tabs must not overlap");
      previousRight = box.x + box.width;
      const visible = await link.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const text = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const labelsFit = text.every((node) => {
          const range = document.createRange(); range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          return rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5;
        });
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return labelsFit && (hit === el || el.contains(hit));
      });
      assert(visible, `Mobile tab label clipped or target obscured at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  console.log("PASS: all six mobile navigation labels and touch targets fit 320/360/390/428px");
}


async function verifyChessCheckersTurnCleanup(browser) {
  for (const game of ["chess", "checkers"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let scoreRequests = 0;
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === "/api/games/submit") scoreRequests++;
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${base}/play/${game}`);
      const board = page.getByTestId(`${game}-board`);
      await board.waitFor();
      const snapshot = () => board.locator("button").evaluateAll(nodes => nodes.map(n => n.innerHTML));
      const initial = await snapshot();
      assert.equal(initial.length, 64);
      const status = page.getByTestId(game === "chess" ? "chess-status" : "checkers-turn");
      const opening = async () => {
        for (const square of game === "chess" ? ["e2", "e4"] : ["5-0", "4-1"]) {
          await page.getByTestId(`${game}-cell-${square}`).click();
        }
        await status.filter({ hasText: game === "chess" ? "CPU thinking" : "CPU…" }).waitFor();
        assert.notDeepEqual(await snapshot(), initial, "Legal opening changes the board");
      };
      await opening();
      await page.getByTestId("game-reset").click();
      await page.waitForTimeout(900);
      assert.deepEqual(await snapshot(), initial, "Cancelled CPU move cannot alter reset board");
      assert.match(await status.textContent(), /Your turn/);
      assert.equal(await page.getByTestId("share-card-modal").count(), 0);
      await opening();
      await page.getByTestId("mobile-nav-library").click();
      await page.waitForURL(`${base}/library`);
      await page.waitForTimeout(900);
      assert.equal(await page.getByTestId("share-card-modal").count(), 0);
      assert.equal(await board.count(), 0);
      assert.equal(scoreRequests, 0, "Incomplete guest games submit no scores");
      console.log(`PASS: compiled ${game} legal opening, reset during CPU turn, unchanged reset board after timer deadline, SPA exit without result or score`);
    } finally { await context.close(); }
  }
}

// Legal game from the standard board against the first legal CPU move.
async function finishCheckersBrowserGame(page) {
  const moves = [[[5,2],[4,1]],[[5,6],[4,5]],[[6,3],[4,1]],[[4,5],[3,4]],[[7,4],[5,2]],[[5,2],[4,3]],[[6,5],[5,4]],[[7,2],[6,3]],[[4,3],[3,2]],[[3,2],[2,1]],[[7,6],[6,5]],[[6,7],[4,5]],[[5,0],[4,1]],[[4,5],[3,4]],[[7,0],[6,1]]];
  for (let i = 0; i < moves.length; i++) {
    for (const square of moves[i]) await page.getByTestId(`checkers-cell-${square.join("-")}`).click();
    await page.getByTestId("checkers-turn").filter({ hasText: i === moves.length - 1 ? "CPU won" : "Your turn" }).waitFor();
  }
}

// Legal five-move loss against the current CPU with random tie-breaking fixed to zero.
async function finishChessBrowserGame(page) {
  const moves = [["g2","g4"],["a2","a3"],["f1","h3"],["a3","a4"],["f2","f4"]];
  for (let i = 0; i < moves.length; i++) {
    for (const square of moves[i]) await page.getByTestId(`chess-cell-${square}`).click();
    await page.getByTestId("chess-status").filter({ hasText: i === moves.length - 1 ? "Checkmate. CPU wins." : "Your turn." }).waitFor();
  }
}

async function verifyChessGuestCompletion(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let scores = 0;
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === "/api/games/submit") scores++;
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/play/chess`);
    await page.getByTestId("chess-board").waitFor();
    await page.evaluate(() => { Math.random = () => 0; });
    await finishChessBrowserGame(page);
    await page.getByTestId("share-card-modal").waitFor();
    assert.equal(scores, 0, "Guest completion never submits a score");
    await page.getByTestId("share-close-btn").click();
    await page.getByTestId("game-reset").click();
    assert.equal(await page.getByTestId("share-card-modal").count(), 0);
    assert.equal(await page.getByTestId("chess-status").textContent(), "Your turn (White).");
    console.log("PASS: compiled Chess guest completes legal game, receives local result, submits no score and resets");
  } finally { await context.close(); }
}

async function verifyCheckersGuestCompletion(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let scores = 0;
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === "/api/games/submit") scores++;
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/play/checkers`);
    await page.getByTestId("checkers-board").waitFor();
    await page.evaluate(() => { Math.random = () => 0; });
    await finishCheckersBrowserGame(page);
    await page.getByTestId("share-card-modal").waitFor();
    assert.equal(scores, 0, "Guest completion never submits a score");
    await page.getByTestId("share-close-btn").click();
    await page.getByTestId("game-reset").click();
    assert.equal(await page.getByTestId("share-card-modal").count(), 0);
    assert.equal(await page.getByTestId("checkers-turn").textContent(), "Your turn");
    console.log("PASS: compiled Checkers guest completes legal game, receives local result, submits no score and resets");
  } finally { await context.close(); }
}

async function verifyResetScoreLifecycles(browser) {
  for (const game of ["rps", "connect4", "checkers", "chess"]) {
    const email = `lifecycle-${game}-${crypto.randomUUID()}@example.com`;
    const registered = await api("/auth/register", null, {
      name: "Disposable Lifecycle Player", email, password, accepted_terms: true,
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pending = [], routeErrors = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname !== "/api/games/submit" || request.method() !== "POST") return route.continue();
      try {
        assert.equal(request.postDataJSON().game_id, game);
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        pending.push({ route, response, data: await response.json(), released: false });
      } catch (error) { routeErrors.push(error.message); await route.abort(); }
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const waitPending = async count => {
      for (let i = 0; i < 100 && pending.length < count && !routeErrors.length; i++) await page.waitForTimeout(20);
      assert.deepEqual(routeErrors, []);
      assert.equal(pending.length, count, "One real score submission per completed game");
    };
    const release = async index => {
      const item = pending[index];
      const delivered = page.waitForResponse(r => r.url().endsWith("/games/submit") && r.request().method() === "POST");
      item.released = true;
      await item.route.fulfill({ response: item.response });
      await delivered; await page.waitForTimeout(150);
    };
    const finish = async () => {
      if (game === "rps") {
        for (let i = 0; i < 3; i++) {
          await page.getByTestId("rps-paper").click();
          await page.waitForTimeout(750);
        }
        await page.getByTestId("rps-finished").filter({ hasText: "You dominated!" }).waitFor();
      } else if (game === "chess") {
        await finishChessBrowserGame(page);
      } else if (game === "checkers") {
        await finishCheckersBrowserGame(page);
      } else {
        for (const col of [0, 1, 0, 1]) {
          await page.getByTestId(`c4-drop-${col}`).click();
          await page.waitForTimeout(550);
        }
        await page.getByTestId("c4-turn").filter({ hasText: "CPU won" }).waitFor();
      }
    };
    try {
      await page.goto(`${base}/login`);
      await signIn(page, email); await page.waitForURL(`${base}/profile`);
      await page.goto(`${base}/play/${game}`);
      // Deterministic CPU choices only in this isolated RPS test document.
      if (game === "rps" || game === "checkers" || game === "chess") await page.evaluate(() => { Math.random = () => 0; });
      if (game === "chess") {
        await page.getByTestId("chess-cell-e2").click();
        await page.getByTestId("chess-cell-e4").click();
      } else if (game === "checkers") {
        await page.getByTestId("checkers-cell-5-0").click();
        await page.getByTestId("checkers-cell-4-1").click();
      } else await page.getByTestId(game === "rps" ? "rps-paper" : "c4-drop-0").click();
      await page.getByTestId("game-reset").click();
      await page.waitForTimeout(850);
      if (game === "rps") {
        assert.equal(await page.getByTestId("rps-round").textContent(), "Round 1");
        assert.equal(await page.getByTestId("rps-finished").count(), 0);
        assert(await page.getByTestId("rps-paper").isEnabled());
      } else if (game === "chess") {
        assert.equal(await page.getByTestId("chess-status").textContent(), "Your turn (White).");
      } else if (game === "checkers") {
        assert.equal(await page.getByTestId("checkers-turn").textContent(), "Your turn");
      } else {
        assert.equal(await page.getByTestId("c4-cell-you").count(), 0);
        assert.equal(await page.getByTestId("c4-cell-cpu").count(), 0);
        assert.equal(await page.getByTestId("c4-turn").textContent(), "Your turn");
      }
      assert.equal(pending.length, 0);
      await finish(); await waitPending(1);
      assert.equal(await page.getByTestId("share-card-modal").count(), 0);
      await page.getByTestId("game-reset").click();
      await finish(); await waitPending(2);
      await release(1);
      const modal = page.getByTestId("share-card-modal");
      await modal.waitFor();
      if (pending[1].data.xp_gained) assert(await modal.getByText(`+${pending[1].data.xp_gained}`, { exact: true }).isVisible());
      await page.getByTestId("share-close-btn").click();
      await modal.waitFor({ state: "detached" });
      await release(0);
      assert.equal(await modal.count(), 0, "Older game response cannot reopen a closed current result");
      await waitPending(2);
      // A third completed game's pending response must also remain silent after SPA exit.
      await page.getByTestId("game-reset").click();
      await finish(); await waitPending(3);
      await page.getByTestId("mobile-nav-library").click();
      await page.waitForURL(`${base}/library`);
      await release(2);
      assert.equal(await modal.count(), 0);
      await waitPending(3);
      console.log(`PASS: compiled ${game} reset during pending timer, three real games, reversed score delivery, current award, no obsolete result after reset/SPA exit, no duplicate scores`);
    } finally {
      for (const item of pending.filter(item => !item.released)) await item.route.abort().catch(() => {});
      await context.close();
      const deleted = await fetch(`${base}/api/auth/account`, { method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${registered.token}` },
        body: JSON.stringify({ password }) });
      assert.equal(deleted.status, 200, "Disposable lifecycle account cleanup");
    }
  }
}

async function verifyProfileRefreshOrdering(browser) {
  const email = `refresh-order-${crypto.randomUUID()}@example.com`;
  const registered = await api("/auth/register", null, {
    name: "Disposable Refresh Player", email, password, accepted_terms: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pending = [], routeErrors = [];
  let holdRefresh = false;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!holdRefresh || url.pathname !== "/api/auth/me" || request.method() !== "GET") return route.continue();
    try {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      pending.push({ route, response, data: await response.json(), released: false });
    } catch (error) { routeErrors.push(error.message); await route.abort(); }
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const waitPending = async count => {
    for (let i = 0; i < 100 && pending.length < count && !routeErrors.length; i++) await page.waitForTimeout(20);
    assert.deepEqual(routeErrors, []);
    assert.equal(pending.length, count, "Exactly one profile refresh per SPA mount");
  };
  const release = async (item, status) => {
    const delivered = page.waitForResponse(r => r.url().endsWith("/auth/me") && r.request().method() === "GET");
    item.released = true;
    await item.route.fulfill(status === 200 ? { response: item.response } : {
      status, contentType: "application/json", body: JSON.stringify({ detail: "Disposable stale-response fixture" }),
    });
    await delivered;
    await page.waitForTimeout(150);
  };
  try {
    await page.goto(`${base}/login`);
    await signIn(page, email); await page.waitForURL(`${base}/profile`);
    await page.getByTestId("profile-email").filter({ hasText: email }).waitFor();
    await page.waitForTimeout(150);
    const token = await page.evaluate(() => localStorage.getItem("rmc_token"));
    for (const staleStatus of [200, 401, 503]) {
      await page.getByTestId("mobile-nav-library").click();
      holdRefresh = true;
      const offset = pending.length;
      await page.getByTestId("mobile-nav-profile").click();
      await waitPending(offset + 1);
      // Advance only this disposable account through the real score API.
      const score = await api("/games/submit", token, { game_id: "memory", won: true, score: 100 });
      assert(score.user.xp > pending[offset].data.user.xp, "New profile must have distinguishable real progress");
      await page.getByTestId("mobile-nav-library").click();
      await page.getByTestId("mobile-nav-profile").click();
      await waitPending(offset + 2);
      const latest = pending[offset + 1];
      assert.equal(latest.data.user.xp, score.user.xp);
      await release(latest, 200);
      const xp = page.getByText("XP", { exact: true }).locator("..").locator("div").first();
      assert.equal(await xp.textContent(), String(score.user.xp));
      await release(pending[offset], staleStatus);
      assert.equal(new URL(page.url()).pathname, "/profile");
      assert.equal(await page.getByTestId("profile-email").textContent(), email);
      assert.equal(await xp.textContent(), String(score.user.xp), "Stale refresh cannot roll visible XP back");
      assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), token, "Stale 401 cannot remove the current session");
      assert.equal(await page.getByTestId("account-refresh-error").count(), 0, "Stale failure cannot replace successful refresh");
      assert.deepEqual(routeErrors, []);
      holdRefresh = false;
    }
    console.log("PASS: newer profile refresh survives delayed old success, 401 and 503 with current visible XP and session");
  } finally {
    for (const item of pending.filter(item => !item.released)) await item.route.abort().catch(() => {});
    await context.close();
    const deleted = await fetch(`${base}/api/auth/account`, { method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${registered.token}` },
      body: JSON.stringify({ password }) });
    assert.equal(deleted.status, 200, "Disposable refresh-order account cleanup");
  }
}

async function verifyRefreshRecovery(page, user) {
  await page.setViewportSize({ width: 1280, height: 900 });
  let failureStatus = 503;
  const failRefresh = (route) => route.fulfill({ status: failureStatus,
    contentType: "application/json", body: JSON.stringify({ detail: "Disposable failure fixture" }) });
  const token = await page.evaluate(() => localStorage.getItem("rmc_token"));
  // An established session survives a profile refresh outage.
  await page.route("**/api/auth/me", failRefresh);
  await page.getByTestId("nav-profile").click();
  await page.getByTestId("account-refresh-error").waitFor();
  assert.equal(await page.getByTestId("profile-email").textContent(), user.email);
  assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), token);
  await page.unroute("**/api/auth/me", failRefresh);
  await page.getByTestId("account-refresh-retry").click();
  await page.getByTestId("account-refresh-error").waitFor({ state: "detached" });
  // Cold startup must not expose a protected profile before verification. Retry
  // then uses the real API and original token without asking for credentials.
  await page.route("**/api/auth/me", failRefresh);
  await page.reload();
  await page.getByTestId("account-refresh-error").waitFor();
  assert.equal(await page.getByTestId("profile-email").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), token);
  assert.equal(new URL(page.url()).pathname, "/profile");
  await page.unroute("**/api/auth/me", failRefresh);
  await page.getByTestId("account-refresh-retry").click();
  await page.getByTestId("profile-email").filter({ hasText: user.email }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), token);
  for (failureStatus of [401, 403]) {
    await page.route("**/api/auth/me", failRefresh);
    await page.reload();
    await page.waitForURL(`${base}/login`);
    assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), null);
    assert.equal(await page.getByTestId("account-refresh-error").count(), 0);
    await page.unroute("**/api/auth/me", failRefresh);
    await signIn(page, user.email);
    await page.waitForURL(`${base}/profile`);
    await page.getByTestId("profile-email").filter({ hasText: user.email }).waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/tables?game=spades`);
  console.log("PASS: profile outage preserves session, cold-start retry recovers, and 401/403 require sign-in");
}
async function verifyStaleProfile(page, users) {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const switchAccount of [false, true]) {
    const originalToken = await page.evaluate(() => localStorage.getItem("rmc_token"));
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let first = true;
    const handler = async (route) => {
      if (!first) return route.continue();
      first = false;
      assert.equal(route.request().headers().authorization, `Bearer ${originalToken}`);
      // Obtain real account A data, but delay its delivery to the application.
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).user.id, users[0].user.id);
      await held;
      await route.fulfill({ response });
    };
    await page.route("**/api/auth/me", handler);
    try {
      const requested = page.waitForRequest((r) => r.url().endsWith("/api/auth/me"));
      await page.getByTestId("nav-profile").click();
      await requested;
      await page.getByTestId("profile-logout").click();
      await page.waitForURL(`${base}/login`);
      assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), null);
      let newToken = null;
      if (switchAccount) {
        await signIn(page, users[1].email);
        await page.waitForURL(`${base}/profile`);
        await page.getByTestId("profile-email").filter({ hasText: users[1].email }).waitFor();
        newToken = await page.evaluate(() => localStorage.getItem("rmc_token"));
        assert(newToken && newToken !== originalToken);
      }
      const delivered = page.waitForResponse((r) => r.url().endsWith("/api/auth/me") &&
        r.request().headers().authorization === `Bearer ${originalToken}`);
      release();
      await (await delivered).finished();
      // Allow React to commit the response handler before checking visible identity.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), newToken);
      if (switchAccount) {
        assert.equal(await page.getByTestId("profile-email").textContent(), users[1].email);
        await page.getByTestId("profile-logout").click();
      } else {
        assert.equal(new URL(page.url()).pathname, "/login");
        await page.getByTestId("header-login").waitFor();
        assert.equal(await page.getByTestId("profile-email").count(), 0);
      }
    } finally {
      release();
      await page.unroute("**/api/auth/me", handler);
    }
    await page.waitForURL(`${base}/login`);
    await signIn(page, users[0].email);
    await page.waitForURL(`${base}/profile`);
    await page.getByTestId("profile-email").filter({ hasText: users[0].email }).waitFor();
    await page.getByTestId("nav-library").click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/tables?game=spades`);
  console.log("PASS: real profile response cannot undo UI logout or replace a newer UI login");
}
async function clickMove(page, action) {
  if (action.type === "bid") await page.getByRole("button", { name: `Bid ${action.bid === 0 ? "nil" : action.bid}`, exact: true }).click();
  else if (action.card) await page.getByTestId("spades-hand").getByRole("button", { name: cardLabel(action.card), exact: true }).click();
  else if (action.tile) {
    await page.getByTestId("dominoes-hand").getByRole("button", { name: `Tile ${action.tile}`, exact: true }).click();
    await page.getByRole("button", { name: `Play ${action.side}`, exact: true }).click();
  } else await page.getByRole("button", { name: action.type === "draw" ? "Draw a tile" : action.type === "pass" ? "Pass turn" : "Deal next hand", exact: true }).click();
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.RMC_CHROMIUM_PATH ? { executablePath: process.env.RMC_CHROMIUM_PATH } : {}) });
  const pages = [];
  try {
    if (process.env.RMC_VERIFY_CONFIGURED_ANALYTICS === "1") {
      await require("./verify-configured-analytics.cjs").verifyConfiguredAnalytics(browser, base);
    }
    await verifyGameHeaderControls(browser);
    await verifyMemoryScoreResponses(browser);
    await verifyResetScoreLifecycles(browser);
    await verifyChessCheckersTurnCleanup(browser);
    await verifyCheckersGuestCompletion(browser);
    await verifyChessGuestCompletion(browser);
    await verifyProfileRefreshOrdering(browser);
    await verifyAnonymousOnboarding(browser);
    const users = [];
    const stamp = Date.now();
    for (let i = 0; i < 4; i += 1) {
      const email = `table-${stamp}-${i}@example.com`;
      // Player 3 must create the account through the real invitation UI below.
      const registered = i === 2 ? {} : await api("/auth/register", null, { name: `Test Player ${i + 1}`, email, password, accepted_terms: true });
      users.push({ ...registered, email });
      const context = await browser.newContext({ viewport: i === 0 ? { width: 390, height: 844 } : i === 2 ? { width: 667, height: 375 } : { width: 1280, height: 900 } });
      // A mistakenly production-bound bundle must fail locally, never call a live API.
      // External fonts/analytics are also unnecessary for this disposable test.
      await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin
        ? route.continue() : route.abort());
      await context.addInitScript(({ token, insert }) => {
        if (insert) localStorage.setItem("rmc_token", token);
        const timeout = window.setTimeout.bind(window);
        // Accelerate thinking/polling in the test, preserving every actual move/API call.
        window.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 650 ? 15 : delay === 2000 ? 75 : delay, ...args);
      }, { token: registered.token, insert: i === 3 });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      pages.push(page);
    }
    const [first] = pages;
    await first.goto(`${base}/tables?game=spades`);
    await first.getByTestId("login-email").fill(users[0].email);
    await first.getByTestId("login-password").fill(password);
    await first.getByTestId("login-terms-checkbox").check();
    await first.getByTestId("login-submit").click();
    await first.waitForURL("**/tables?game=spades");
    await verifyMobileNavigation(first);
    await verifyStaleProfile(first, users);
    await verifyRefreshRecovery(first, users[0]);
    await first.getByRole("button", { name: "Create private table", exact: true }).click();
    await first.waitForURL("**/table/*");
    const code = new URL(first.url()).pathname.split("/").pop();
    for (let i = 1; i < 4; i += 1) {
      const page = pages[i];
      const invitation = `${base}/table/${code}?ref=player-share#join`;
      await page.goto(invitation);
      if (i !== 3) {
        await page.waitForURL(`${base}/login`);
        assert.equal(await page.evaluate(() => localStorage.getItem("rmc_token")), null,
          "Invitation recipient starts without an injected authentication token");
        // Both links must carry the original invitation through route state.
        await page.getByTestId("link-register").click();
        await page.waitForURL(`${base}/register`);
        await page.getByTestId("link-login").click();
        await page.waitForURL(`${base}/login`);
        if (i === 1) {
          await page.getByTestId("login-email").fill(users[i].email);
          await page.getByTestId("login-password").fill(password);
          await page.getByTestId("login-terms-checkbox").check();
          await page.getByTestId("login-submit").click();
        } else {
          await page.getByTestId("link-register").click();
          await page.getByTestId("register-name").fill(`Test Player ${i + 1}`);
          await page.getByTestId("register-email").fill(users[i].email);
          await page.getByTestId("register-password").fill(password);
          await page.getByTestId("register-terms-checkbox").check();
          const response = page.waitForResponse((r) => r.url().endsWith("/auth/register") && r.request().method() === "POST");
          await page.getByTestId("register-submit").click();
          const registration = await response;
          assert.equal(registration.status(), 200);
          users[i] = { ...await registration.json(), email: users[i].email };
        }
      }
      await page.waitForURL(invitation);
      await page.getByRole("button", { name: "Leave table", exact: true }).waitFor();
      // Preserve the seat order assumed by the full-hand driver, and prove that
      // authentication returned to and joined this exact private table.
      const joined = await api(`/tables/${code}`, users[0].token);
      assert.equal(joined.members.filter(Boolean).length, i + 1);
      assert.equal(joined.members[i].id, users[i].user.id);
    }
    console.log("PASS: private invitation survives login, UI registration and auth-screen switches with query/fragment intact");
    await Promise.all(pages.map((p) => p.getByTestId("spades-board").waitFor()));
    const original = await api(`/tables/${code}`, users[0].token);
    await first.reload();
    await first.getByTestId("spades-board").waitFor();
    assert.deepEqual((await api(`/tables/${code}`, users[0].token)).state.hand, original.state.hand);
    assert(await first.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth), "Mobile horizontal overflow");
    if (process.env.RMC_SCREENSHOT_DIR) await first.screenshot({ path: path.join(process.env.RMC_SCREENSHOT_DIR, "spades-online-mobile.png"), fullPage: true });
    await captureTableState(first, "09-spades-online-bidding");
    let onlineMoves = 0;
    for (; onlineMoves < 60; onlineMoves += 1) {
      const host = await api(`/tables/${code}`, users[0].token);
      if (host.state.phase === "round_end") break;
      const actor = host.state.turn;
      const view = await api(`/tables/${code}`, users[actor].token);
      assert(!("hands" in view.state) && !("stock" in view.state));
      const action = view.state.phase === "bidding" ? { type: "bid", bid: 2 } : view.state.actions[0];
      const response = pages[actor].waitForResponse((r) => r.url().endsWith(`/tables/${code}/move`) && r.request().method() === "POST");
      await clickMove(pages[actor], action);
      assert.equal((await response).status(), 200);
    }
    assert.equal(onlineMoves, 56, "Four bids and 52 legal cards complete a Spades hand");
    await first.getByRole("button", { name: "Deal next hand", exact: true }).waitFor();
    const mobileScores = first.getByTestId("spades-mobile-scoring");
    await mobileScores.waitFor();
    const roundScores = (await api(`/tables/${code}`, users[0].token)).state.last_round;
    const pointCells = first.getByTestId("spades-mobile-points");
    assert.equal(await pointCells.count(), 2);
    for (let i = 0; i < roundScores.length; i += 1) {
      assert.equal(await pointCells.nth(i).textContent(), `${roundScores[i].delta > 0 ? "+" : ""}${roundScores[i].delta}`);
      const box = await pointCells.nth(i).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= 390, "Mobile points must fit without sideways scrolling");
    }
    await mobileScores.scrollIntoViewIfNeeded();
    await captureTableState(first, "10-spades-online-scoring");
    await first.getByRole("button", { name: "Deal next hand", exact: true }).click();
    await first.getByRole("button", { name: "Leave table", exact: true }).waitFor();
    first.once("dialog", (dialog) => dialog.accept());
    await first.getByRole("button", { name: "Leave table", exact: true }).click();
    await first.waitForURL("**/tables?game=spades");
    assert.equal((await api(`/tables/${code}`, users[1].token)).status, "ended");
    console.log("PASS: real login, private invitation, four-player Spades hand/scoring, reconnect, next hand, forfeit, mobile layout");

    await Promise.all(pages.slice(0, 2).map(async (p) => {
      await p.goto(`${base}/tables?game=dominoes`);
      await p.getByRole("button", { name: "Find players", exact: true }).click();
      await p.waitForURL("**/table/*");
      await p.getByTestId("dominoes-board").waitFor();
    }));
    const dominoCode = new URL(first.url()).pathname.split("/").pop();
    assert.equal(new URL(pages[1].url()).pathname.split("/").pop(), dominoCode);
    await captureTableState(first, "11-dominoes-online-hand");
    let finished = false;
    for (let i = 0; i < 100; i += 1) {
      const host = await api(`/tables/${dominoCode}`, users[0].token);
      if (host.status === "ended") { finished = true; break; }
      // Seats are assigned by the server, not by request arrival assumptions.
      const participant = host.members[host.state.turn].id;
      const actor = users.findIndex((u) => u.user.id === participant);
      const view = await api(`/tables/${dominoCode}`, users[actor].token);
      const response = pages[actor].waitForResponse((r) => r.url().endsWith(`/tables/${dominoCode}/move`) && r.request().method() === "POST");
      await clickMove(pages[actor], view.state.actions[0]);
      assert.equal((await response).status(), 200);
    }
    assert(finished, "Online Dominoes must finish");
    console.log("PASS: simultaneous public matchmaking and complete two-player online Dominoes");

    await first.goto(`${base}/play/spades`);
    await first.getByTestId("spades-board").waitFor();
    await first.getByRole("button", { name: "Bid 3", exact: true }).click();
    for (let i = 0; i < 400; i += 1) {
      if (await first.getByRole("button", { name: "Deal next hand", exact: true }).count()) break;
      const legal = first.getByTestId("spades-hand").locator("button:enabled");
      if (await legal.count()) await legal.first().click();
      else await first.waitForTimeout(20);
    }
    await first.getByRole("button", { name: "Deal next hand", exact: true }).waitFor();
    console.log("PASS: computer Spades bidding, all 13 tricks, hand scoring");
    await first.goto(`${base}/play/dominoes`);
    let localFinished = false;
    for (let i = 0; i < 500; i += 1) {
      const turn = await first.getByTestId("table-turn").textContent();
      if (/wins?|Draw/.test(turn)) { localFinished = true; break; }
      const tiles = first.getByTestId("dominoes-hand").locator("button:enabled");
      if (await tiles.count()) {
        await tiles.first().click();
        const left = first.getByRole("button", { name: "Play left", exact: true });
        await (await left.isEnabled() ? left : first.getByRole("button", { name: "Play right", exact: true })).click();
      } else {
        const draw = first.getByRole("button", { name: /^(Draw a tile|Pass turn)$/ });
        if (await draw.count()) await draw.click();
        else await first.waitForTimeout(20);
      }
    }
    assert(localFinished, "Computer Dominoes must finish");
    await first.goto(`${base}/tables?game=dominoes`);
    await first.getByRole("button", { name: "Create private table", exact: true }).click();
    await first.waitForURL("**/table/*");
    const safetyCode = new URL(first.url()).pathname.split("/").pop();
    await pages[1].goto(`${base}/table/${safetyCode}`);
    await first.getByTestId("dominoes-board").waitFor();
    await first.getByText("Player safety · Report or block", { exact: true }).click();
    // Polling and the one-second turn clock must not collapse safety controls.
    await first.waitForTimeout(1100);
    assert(await first.getByRole("button", { name: "Report Test Player 2", exact: true }).isVisible());
    await first.getByRole("button", { name: "Report Test Player 2", exact: true }).click();
    await first.locator("#table-report").fill("Disposable local test of table safety controls.");
    const reportResponse = first.waitForResponse((r) => r.url().endsWith("/safety/report") && r.request().method() === "POST");
    await first.getByRole("button", { name: "Send report", exact: true }).click();
    assert.equal((await reportResponse).status(), 200);
    first.once("dialog", (dialog) => dialog.accept());
    await first.getByRole("button", { name: "Block Test Player 2", exact: true }).click();
    await first.waitForURL("**/tables");
    assert.equal((await api("/tables/current", users[0].token)).room, null);
    assert.equal((await api("/tables/current", users[1].token)).room, null);
    await verifyUnavailableStore(browser, users[0]);
    await verifyLandscapeLayouts(browser, users[0]);
    await captureActualApp(browser, users[0]);
    const deleted = await fetch(`${base}/api/auth/account`, { method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${users[0].token}` }, body: JSON.stringify({ password }) });
    assert.equal(deleted.status, 200);
    const removedTable = await fetch(`${base}/api/tables/${safetyCode}`, { headers: { Authorization: `Bearer ${users[1].token}` } });
    assert.equal(removedTable.status, 404, "Account deletion removes linked table records");
    assert.deepEqual(errors, [], "No uncaught browser exceptions");
    console.log("PASS: complete computer Dominoes, in-table report/block, account-deletion cleanup, no uncaught browser exceptions");
  } catch (error) {
    if (pages[0] && process.env.RMC_SCREENSHOT_DIR) {
      await pages[0].screenshot({ path: path.join(process.env.RMC_SCREENSHOT_DIR, "table-test-failure.png"), fullPage: true });
      console.error("Browser failure state", JSON.stringify(await pages[0].evaluate(() => ({
        url: location.pathname,
        controls: [...document.querySelectorAll('button, summary')].filter((e) => e.textContent.includes('Player safety')).map((e) => ({
          html: e.outerHTML, rect: e.getBoundingClientRect().toJSON(),
          ancestors: [...(function* () { for (let p=e;p;p=p.parentElement) yield p; })()].map((p) => ({
            tag: p.tagName, class: p.className, display: getComputedStyle(p).display,
            visibility: getComputedStyle(p).visibility, contentVisibility: getComputedStyle(p).contentVisibility,
            rect: p.getBoundingClientRect().toJSON(),
          })),
        })),
      })), null, 2));
    }
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
