/* Compiled UI + actual Matter.js. Disposable loopback API only; no physics/state injection. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.RMC_PLAYWRIGHT_MODULE || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright") : "playwright"));
const base = process.env.RMC_BROWSER_TEST_URL;
assert(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Disposable loopback backend required");

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

async function finishRound(page) {
  const canvas = page.getByTestId("jenga-canvas");
  const gameOver = page.getByTestId("jenga-gameover");
  await canvas.waitFor();
  await page.waitForTimeout(1000);
  let attempts = 0, pulls = 0;
  async function clickWhilePlaying(locator, options = {}) {
    try {
      await locator.click({...options, timeout:1500});
      return true;
    } catch (error) {
      // Real physics can end the round after the guard but before actionability.
      // Accept only a click timeout followed by a visible terminal game state.
      // Other failures (including a blocked click during play) still fail CI.
      if (error.name !== "TimeoutError" || !await gameOver.isVisible()) throw error;
      console.log("Observed Tumble Tower collapse while awaiting a UI click");
      return false;
    }
  }
  rounds: for (let row = 0; row < 8; row++) {
    for (const col of [0, 2, 1]) {
      if (await gameOver.isVisible()) break rounds;
      const size = await canvas.boundingBox();
      assert(size);
      if (!await clickWhilePlaying(canvas, {position:{
        x:size.width*(205+45*col)/500,
        y:size.height*(659-22*row)/700,
      }})) break rounds;
      attempts++;
      if (await gameOver.isVisible()) break rounds;
      const pull = page.getByTestId("jenga-pull-btn");
      if (await pull.isEnabled()) {
        if (!await clickWhilePlaying(pull)) break rounds;
        pulls++;
        await page.waitForTimeout(1000); // Actual physics/score settling, not a fake clock.
      }
    }
  }
  await gameOver.waitFor();
  assert(pulls > 0 && attempts <= 24, "Bounded legal UI pulls must cause the collapse");
  const score = Number((await page.getByTestId("jenga-score").innerText()).trim());
  assert(Number.isInteger(score) && score >= 0 && score <= pulls);
  assert(await page.getByText("Final Score: " + score, {exact:true}).isVisible());
  return {score, pulls, attempts};
}


async function verifySignedInResults(browser) {
 for (const mode of ["success","http","network","delayed-reset","delayed-exit"]) {
  const email = "tower-"+require("node:crypto").randomUUID()+"@example.com";
  const registered = await api("/auth/register",null,{name:"Disposable Tower Player",email,password,accepted_terms:true});
  let context;
  const errors=[],submissions=[],routeErrors=[];
  try {
   context=await browser.newContext({viewport:{width:1280,height:1000}});
   await context.route("**/*",async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==new URL(base).origin)return route.abort();
    if(url.pathname!=="/api/games/submit"||request.method()!=="POST")return route.continue();
    try {
     const item={payload:request.postDataJSON()};submissions.push(item);
     if(mode==="network")return await route.abort("connectionfailed");
     if(mode==="http")return await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({
      detail:"Disposable save failure",xp_gained:999,challenge_completed:true,newly_unlocked_badges:[{id:"fake",name:"Fake"}]})});
     const response=await route.fetch();assert.equal(response.status(),200);item.data=await response.json();
     if(mode.startsWith("delayed-"))await new Promise(resolve=>{item.release=resolve;});
     await route.fulfill({response});item.fulfilled=true;
    }catch(error){routeErrors.push(error.message);await route.abort().catch(()=>{});}
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on("pageerror",error=>errors.push(error.message));
   await page.goto(base+"/login");await signIn(page,email);await page.waitForURL(base+"/profile");
   await page.goto(base+"/play/jenga");
   const result=await finishRound(page),modal=page.getByTestId("share-card-modal");
   if(mode.startsWith("delayed-")){
    for(let i=0;i<200&&!submissions[0]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
    assert.deepEqual(routeErrors,[]);assert.equal(submissions.length,1);assert(submissions[0].release);
    assert.equal(await modal.count(),0);
    if(mode==="delayed-reset")await page.getByTestId("game-reset").click();
    else {
     await page.evaluate(()=>{window.__towerDocument="preserved";});
     await page.getByTestId("game-back").click();await page.waitForURL(base+"/library");
     assert.equal(await page.evaluate(()=>window.__towerDocument),"preserved");
    }
    const received=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/games/submit");
    submissions[0].release();await received;
    for(let i=0;i<200&&!submissions[0].fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
    assert(submissions[0].fulfilled);await page.waitForTimeout(1000);
    assert.equal(await modal.count(),0,"Late response must not reopen obsolete results");
    if(mode==="delayed-reset"){
     assert.equal((await page.getByTestId("jenga-score").innerText()).trim(),"0");
     assert.equal(await page.getByTestId("jenga-gameover").count(),0);
    }else assert.equal(await page.getByTestId("jenga-canvas").count(),0);
   }else{
    await modal.waitFor();
    assert(await modal.getByText(result.score>=10?"WIN":"PLAYED",{exact:true}).isVisible());
    if(mode==="success"){
     const data=submissions[0].data;assert(data);assert(Number.isFinite(data.xp_gained)&&data.xp_gained>=0);
     if(data.xp_gained>0)assert(await modal.getByText("+"+data.xp_gained,{exact:true}).isVisible());
    }else{
     assert.equal(await modal.getByText("XP earned",{exact:true}).count(),0);
     assert.equal(await modal.getByText("Daily Challenge complete!",{exact:true}).count(),0);
     assert.equal(await modal.getByTestId("share-badges").count(),0);
    }
    await page.getByTestId("share-close-btn").click();await modal.waitFor({state:"detached"});
    await page.getByTestId("game-reset").click();await page.waitForTimeout(1000);
    assert.equal((await page.getByTestId("jenga-score").innerText()).trim(),"0");
    assert.equal(await modal.count(),0);
   }
   assert.equal(submissions.length,1,"One score per completed round");
   assert.deepEqual(submissions[0].payload,{game_id:"jenga",won:result.score>=10,score:result.score});
   assert.deepEqual(routeErrors,[]);assert.deepEqual(errors,[]);
   console.log("PASS: compiled Tumble Tower signed-in "+mode,JSON.stringify(result));
  }finally{
   for(const item of submissions)if(item.release)item.release();
   if(context)await context.close();
   const deleted=await fetch(base+"/api/auth/account",{method:"DELETE",headers:{"Content-Type":"application/json",Authorization:"Bearer "+registered.token},body:JSON.stringify({password})});
   assert.equal(deleted.status,200,"Disposable Tower account cleanup");
  }
 }
}

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
    const {score, pulls, attempts} = await finishRound(page);
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
    await verifySignedInResults(browser);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
