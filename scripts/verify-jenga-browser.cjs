/* Compiled UI + actual Matter.js. Disposable loopback API only; no physics/state injection. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.RMC_PLAYWRIGHT_MODULE || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright") : "playwright"));
const base = process.env.RMC_BROWSER_TEST_URL;
assert(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Disposable loopback backend required");

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:1000}});
    const errors = [], submissions = [];
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === "/api/games/submit") submissions.push(request.postData());
      return route.continue();
    });
    await context.addInitScript(() => {
      // Observe browser resources without replacing Matter, clocks, callbacks or game state.
      const frames = new Set(), pulls = new Set();
      const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        const id = raf(time => { frames.delete(id); callback(time); });
        frames.add(id); return id;
      };
      window.cancelAnimationFrame = id => { frames.delete(id); return cancel(id); };
      const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        if (delay !== 650 || typeof callback !== "function") return timeout(callback, delay, ...args);
        const id = timeout((...values) => { pulls.delete(id); callback(...values); }, delay, ...args);
        pulls.add(id); return id;
      };
      window.clearTimeout = id => { pulls.delete(id); return clear(id); };
      let draws = 0;
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function(...args) {
        if (this.canvas.dataset.testid === "jenga-canvas") draws++;
        return fill.apply(this, args);
      };
      window.__towerObservation = () => ({frames:frames.size,pulls:pulls.size,draws});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/play/jenga");
    const canvas = page.getByTestId("jenga-canvas");
    await canvas.waitFor();
    await page.evaluate(() => { window.__towerDocument = "same-document"; });
    await page.waitForTimeout(1000);
    const observe = () => page.evaluate(() => window.__towerObservation());
    const initial = await observe();
    assert(initial.frames >= 2, "Actual render and physics loops must be running");
    assert(initial.draws > 0, "Actual canvas must draw");
    for (let i=0;i<3;i++) {
      await page.getByTestId("game-reset").click();
      await page.waitForTimeout(1000);
      assert.equal((await observe()).frames,initial.frames,"Reset must not accumulate animation loops");
      assert.equal((await page.getByTestId("jenga-score").innerText()).trim(),"0");
      assert.equal(await page.getByTestId("jenga-gameover").count(),0);
    }
    async function selectTopBlock() {
      const size = await canvas.boundingBox();
      assert(size);
      // Center of the original top-left block, in the 500x700 world.
      await canvas.click({position:{x:size.width*205/500,y:size.height*417/700}});
      assert(await page.getByTestId("jenga-pull-btn").isEnabled(),"Real canvas hit test selected a block");
    }
    await selectTopBlock();
    // Two UI actions in one task ensure the real 650ms pull timer is still pending.
    const resetPending = await page.evaluate(() => {
      document.querySelector('[data-testid="jenga-pull-btn"]').click();
      const before = window.__towerObservation();
      document.querySelector('[data-testid="game-reset"]').click();
      return {before,after:window.__towerObservation()};
    });
    assert.equal(resetPending.before.pulls,1);
    assert.equal(resetPending.after.pulls,0,"Reset cancels pending pull");
    await page.waitForTimeout(1000);
    assert.equal((await page.getByTestId("jenga-score").innerText()).trim(),"0");
    assert.equal(await page.getByTestId("share-card-modal").count(),0);
    assert.equal((await observe()).frames,initial.frames);
    await selectTopBlock();
    const exitPending = await page.evaluate(() => {
      document.querySelector('[data-testid="jenga-pull-btn"]').click();
      const before = window.__towerObservation();
      document.querySelector('[data-testid="game-back"]').click();
      return before;
    });
    assert.equal(exitPending.pulls,1);
    await page.waitForURL(base + "/library");
    await canvas.waitFor({state:"detached"});
    assert.equal(await page.evaluate(() => window.__towerDocument),"same-document","SPA exit must preserve document");
    await page.waitForTimeout(1000);
    const exited = await observe();
    assert.equal(exited.pulls,0);
    await page.waitForTimeout(1000);
    assert.equal((await observe()).draws,exited.draws,"Detached tower canvas must stop drawing");
    assert.equal(await page.getByTestId("share-card-modal").count(),0);
    assert.deepEqual(submissions,[],"Guest/reset must not submit a score");
    assert.deepEqual(errors,[]);
    console.log("PASS: compiled Tumble Tower real canvas hit testing, repeated-reset animation-loop stability, pending-pull reset/SPA-exit cancellation and stopped detached-canvas drawing; no guest scores");

    // A separate complete guest round: only rendered canvas clicks and PULL UI actions.
    // No body-position edits, React state access, clock acceleration or forced collapse.
    await page.goto(base + "/play/jenga");
    await canvas.waitFor();
    await page.waitForTimeout(1000);
    let attempts = 0, pulls = 0;
    for (let row=0;row<8 && !await page.getByTestId("jenga-gameover").count();row++) {
      for (const col of [0,2,1]) {
        if (await page.getByTestId("jenga-gameover").count()) break;
        const size = await canvas.boundingBox();
        assert(size);
        await canvas.click({position:{
          x:size.width*(205+45*col)/500,
          y:size.height*(659-22*row)/700,
        }});
        attempts++;
        const pull = page.getByTestId("jenga-pull-btn");
        if (await pull.isEnabled()) {
          await pull.click();
          pulls++;
          await page.waitForTimeout(1000); // Actual physics/score settling, not a fake clock.
        }
      }
    }
    await page.getByTestId("jenga-gameover").waitFor();
    assert(pulls>0 && attempts<=24,"Bounded legal UI pulls must cause the collapse");
    const score = Number((await page.getByTestId("jenga-score").innerText()).trim());
    assert(Number.isInteger(score) && score>=0 && score<=pulls);
    assert(await page.getByText("Final Score: "+score,{exact:true}).isVisible());
    const modal = page.getByTestId("share-card-modal");
    await modal.waitFor();
    assert(await modal.getByText(score>=10?"WIN":"PLAYED",{exact:true}).isVisible());
    assert.deepEqual(submissions,[],"Completed guest round must not submit a score");
    await page.getByTestId("share-close-btn").click();
    await modal.waitFor({state:"detached"});
    await page.getByTestId("game-reset").click();
    await page.waitForTimeout(1000);
    assert.equal((await page.getByTestId("jenga-score").innerText()).trim(),"0");
    assert.equal(await page.getByTestId("jenga-gameover").count(),0);
    assert.equal(await modal.count(),0);
    assert.deepEqual(errors,[]);
    console.log("PASS: compiled Tumble Tower guest legal-collapse result and reset",JSON.stringify({attempts,pulls,score}));

    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
