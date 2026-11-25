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
// Dedicated bounded stage: real local API, disposable accounts and normal CPU timers.
async function verifySignedInResults(browser) {
  for (const mode of ["success", "http", "network", "delayed-reset", "delayed-exit"]) {
    const email = `crazy8-${crypto.randomUUID()}@example.com`;
    const registered = await api("/auth/register", null, {
      name: "Disposable Crazy Eights Player", email, password, accepted_terms: true,
    });
    let context;
    const errors = [], submissions = [], routeErrors = [];
    try {
      context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (url.pathname !== "/api/games/submit" || request.method() !== "POST") return route.continue();
        try {
          const payload = request.postDataJSON();
          assert.deepEqual(payload, { game_id: "crazy8", won: true, score: 1 });
          const item = { payload }; submissions.push(item);
          if (mode === "network") return await route.abort("connectionfailed");
          if (mode === "http") return await route.fulfill({ status: 503, contentType: "application/json",
            body: JSON.stringify({ detail: "Disposable save failure", xp_gained: 999,
              challenge_completed: true, newly_unlocked_badges: [{ id: "fake", name: "Fake reward" }] }) });
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          item.data = await response.json();
          if (mode.startsWith("delayed-")) {
            await new Promise(resolve => { item.release = resolve; });
          }
          await route.fulfill({ response });
          item.fulfilled = true;
        } catch (error) { routeErrors.push(error.message); await route.abort(); }
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/login`);
      await signIn(page, email); await page.waitForURL(`${base}/profile`);
      const seed = 9;
   await page.goto(base+'/play/crazy8');await page.getByTestId('c8-turn').waitFor();
   await page.evaluate(seed=>{Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};},seed);
   await page.getByTestId('game-reset').click();
   let actions=0,recycled=false,finalEight=false,previousDeck=37;
   while(actions<500){
    const turn=(await page.getByTestId('c8-turn').innerText()).trim();
    const deck=Number((await page.getByTestId('c8-draw').innerText()).match(/\d+/)[0]);
    if(deck>previousDeck)recycled=true;previousDeck=deck;
    if(/won/.test(turn))break;
    if(turn==='CPU'){
     await page.waitForFunction(()=>document.querySelector('[data-testid="c8-turn"]')?.textContent.trim()!=='CPU');continue;
    }
    const hand=await page.getByTestId('c8-you-hand').locator('button').evaluateAll(els=>els.map(el=>({id:el.dataset.testid,rank:el.children[0].textContent,suit:el.children[1].textContent,enabled:!el.disabled})));
    const playable=hand.find(c=>c.enabled);
    await page.mouse.move(0,0);
    if(playable){
     await page.getByTestId(playable.id).click();actions++;
     if(playable.rank==='8'){
      if(hand.length===1)finalEight=true;
      const remaining=hand.filter(c=>c.id!==playable.id),counts={};
      for(const c of remaining)counts[c.suit]=(counts[c.suit]||0)+1;
      const suit=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'♠';
      await page.getByTestId('c8-pick-'+suit).click();actions++;
     }
    }else {await page.getByTestId('c8-draw').click();actions++;}
   }
   const outcome=(await page.getByTestId('c8-turn').innerText()).trim();
   assert(actions<500,'bounded game did not finish');
   assert.equal(outcome,'You won');
   if(seed===9)assert(finalEight,'win must follow final eight suit selection');
   if(seed===2)assert(recycled,'previously stalled seed must recycle draw pile');

      const modal = page.getByTestId("share-card-modal");
      if (mode.startsWith("delayed-")) {
        for (let attempt = 0; attempt < 200 && !submissions[0]?.release && !routeErrors.length; attempt++) {
          await page.waitForTimeout(25);
        }
        assert.deepEqual(routeErrors, []);
        assert.equal(submissions.length, 1);
        assert(submissions[0].release, "Real score response must be held before reset/exit");
        assert.equal(await modal.count(), 0, "No result modal before score resolves");
        if (mode === "delayed-reset") {
          await page.getByTestId("game-reset").click();
        } else {
          await page.evaluate(() => { window.__crazy8Document = "preserved"; });
          await page.getByTestId("mobile-nav-library").click();
          await page.waitForURL(base + "/library");
          assert.equal(await page.evaluate(() => window.__crazy8Document), "preserved",
            "Exit must stay in the same SPA document");
        }
        const received = page.waitForResponse(response => new URL(response.url()).pathname === "/api/games/submit");
        submissions[0].release();
        await received;
        for (let attempt = 0; attempt < 200 && !submissions[0].fulfilled && !routeErrors.length; attempt++) {
          await page.waitForTimeout(25);
        }
        await page.waitForTimeout(300); // Let the real response update React.
        assert(submissions[0].fulfilled, "Delayed response delivered");
        assert.deepEqual(routeErrors, []);
        assert.equal(await modal.count(), 0, "Obsolete round must not reopen results");
        if (mode === "delayed-reset") {
          assert.equal(await page.getByTestId("c8-you-hand").locator("button").count(), 7);
          assert.equal((await page.getByTestId("c8-turn").innerText()).trim(), "Your turn");
        } else {
          assert.equal(new URL(page.url()).pathname, "/library");
          assert.equal(await page.getByTestId("c8-turn").count(), 0);
        }
        assert.equal(submissions.length, 1, "Reset/exit must not resubmit");
        assert.deepEqual(errors, []);
        console.log(`PASS: Crazy Eights ${mode}: real delayed score stays silent after reset/SPA exit`);
        continue;
      }
      await modal.waitFor();
      assert.deepEqual(routeErrors, []);
      assert.equal(submissions.length, 1);
      assert(await modal.getByText("WIN", { exact: true }).isVisible());
      if (mode === "success") {
        const data = submissions[0].data;
        assert(data, "Result must use a completed real API response");
        assert(data.xp_gained > 0, "Fresh account win earns confirmed XP");
        assert(await modal.getByText(`+${data.xp_gained}`, { exact: true }).isVisible());
      } else {
        assert.equal(await modal.getByText("XP earned", { exact: true }).count(), 0);
        assert.equal(await modal.getByText("Daily Challenge complete!", { exact: true }).count(), 0);
        assert.equal(await modal.getByTestId("share-badges").count(), 0);
      }
      await page.getByTestId("share-close-btn").click();
      await page.getByTestId("game-reset").click();
      await page.waitForTimeout(800);
      assert.equal(await modal.count(), 0);
      assert.equal(await page.getByTestId("c8-you-hand").locator("button").count(), 7);
      assert.equal((await page.getByTestId("c8-turn").innerText()).trim(), "Your turn");
      assert.equal(submissions.length, 1, "No duplicate score on reset");
      assert.deepEqual(errors, []);
      console.log(`PASS: Crazy Eights signed-in ${mode}: legal final-eight win, correct single score, truthful rewards and reset`);
    } finally {
      for (const item of submissions) if (item.release) item.release();
      if (context) await context.close();
      const deleted = await fetch(`${base}/api/auth/account`, { method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${registered.token}` },
        body: JSON.stringify({ password }) });
      assert.equal(deleted.status, 200, "Disposable Crazy Eights account cleanup");
    }
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.RMC_CHROMIUM_PATH ? { executablePath: process.env.RMC_CHROMIUM_PATH } : {}) });
  try { await verifySignedInResults(browser); } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
