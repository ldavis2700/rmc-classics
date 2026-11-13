/* Run against a disposable local API serving frontend/build. Never production. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.RMC_PLAYWRIGHT_MODULE || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright") : "playwright"));
const base = process.env.RMC_BROWSER_TEST_URL || "http://127.0.0.1:8765";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Use only a disposable local test backend");
const password = "DisposableTableTest-2026!";
const errors = [];
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
      const registered = await api("/auth/register", null, { name: `Test Player ${i + 1}`, email, password, accepted_terms: true });
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
      }, { token: registered.token, insert: i !== 0 });
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
    await first.getByRole("button", { name: "Create private table", exact: true }).click();
    await first.waitForURL("**/table/*");
    const code = new URL(first.url()).pathname.split("/").pop();
    for (let i = 1; i < 4; i += 1) await pages[i].goto(`${base}/table/${code}`);
    await Promise.all(pages.map((p) => p.getByTestId("spades-board").waitFor()));
    const original = await api(`/tables/${code}`, users[0].token);
    await first.reload();
    await first.getByTestId("spades-board").waitFor();
    assert.deepEqual((await api(`/tables/${code}`, users[0].token)).state.hand, original.state.hand);
    assert(await first.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth), "Mobile horizontal overflow");
    if (process.env.RMC_SCREENSHOT_DIR) await first.screenshot({ path: path.join(process.env.RMC_SCREENSHOT_DIR, "spades-online-mobile.png"), fullPage: true });
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
