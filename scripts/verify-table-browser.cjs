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
      const bytes = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
      assert.equal(bytes.readUInt32BE(16), 1284);
      assert.equal(bytes.readUInt32BE(20), 2778);
      fs.writeFileSync(path.join(output, name + ".png"), bytes);
      files[name + ".png"] = crypto.createHash("sha256").update(bytes).digest("hex");
    }
    assert.equal(Object.keys(tableCaptures).length, 3, "Require all online table states");
    const tableFiles = {};
    for (const [name, bytes] of Object.entries(tableCaptures)) {
      fs.writeFileSync(path.join(output, name), bytes);
      tableFiles[name] = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        width: 390, height: 844, scope: "actual-online-table-disposable-ci-browser-only" };
    }
    const manifest = fs.readFileSync("frontend/build/rmc-release.json");
    fs.writeFileSync(path.join(output, "capture-receipt.json"), JSON.stringify({
      scope: "actual-app-disposable-ci-browser-only", candidate_commit: candidate,
      run_id: process.env.GITHUB_RUN_ID || null,
      browser: "Chromium", width: 1284, height: 2778,
      account_type: "synthetic-disposable-test-account",
      web_manifest_sha256: crypto.createHash("sha256").update(manifest).digest("hex"),
      signed_device_validation: false, production_deployment_verified: false,
      resubmission_ready: false, files_sha256: files, table_captures: tableFiles,
    }, null, 2) + "\n");
    console.log("PASS: eight app views and three online table captures, dimensions and hashes; disposable CI only");
  } finally {
    await context.close();
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
    const users = [];
    const stamp = Date.now();
    for (let i = 0; i < 4; i += 1) {
      const email = `table-${stamp}-${i}@example.com`;
      // Player 3 must create the account through the real invitation UI below.
      const registered = i === 2 ? {} : await api("/auth/register", null, { name: `Test Player ${i + 1}`, email, password, accepted_terms: true });
      users.push({ ...registered, email });
      const context = await browser.newContext({ viewport: i === 0 ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
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
