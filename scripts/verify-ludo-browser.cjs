/* Actual compiled Ludo, legal moves and real CPU timers; no component state injection. */
const assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require(process.env.RMC_PLAYWRIGHT_MODULE || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright'));
const base = process.env.RMC_BROWSER_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Disposable loopback backend required');
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


// Legal complete rounds using controlled dice, actual token buttons and normal800ms CPU timers.
async function finishRound(page,won){
 await page.getByTestId("game-reset").click();
 const roll=page.getByTestId("ludo-roll");
 async function plan(values){
  await page.evaluate(values=>{let i=0;Math.random=()=>((values[i++]??1)-0.5)/6;},values);
 }
 if(won){
  for(let token=0;token<2;token++){
   for(const [step,die] of [6,6,6,6,6,6,2].entries()){
    await plan([die,1]);await roll.click();
    const choice=page.getByTestId("ludo-you-token-"+token);
    if(await choice.isEnabled())await choice.click();
    assert.equal((await choice.innerText()).trim(),step===6?"GOAL":`${step*6}/32`);
   }
   assert.equal((await page.getByTestId("ludo-you-token-"+token).innerText()).trim(),"GOAL");
   if(token===0)await page.waitForFunction(()=>!document.querySelector('[data-testid="ludo-roll"]').disabled);
  }
 }else{
  for(let token=0;token<2;token++){
   await plan([1,6,6,6,6,6,6,2]);await roll.click();
   await page.waitForFunction(token=>document.querySelector('[data-testid="ludo-cpu-token-'+token+'"]').textContent.trim()==="GOAL",token);
   if(token===0)await page.waitForFunction(()=>!document.querySelector('[data-testid="ludo-roll"]').disabled);
  }
 }
 for(let token=0;token<2;token++){
  assert.equal((await page.getByTestId("ludo-"+(won?"you":"cpu")+"-token-"+token).innerText()).trim(),"GOAL");
  assert.equal((await page.getByTestId("ludo-"+(won?"cpu":"you")+"-token-"+token).innerText()).trim(),"HOME");
 }
 assert(await roll.isDisabled());
 return won?"two-player-tokens-home":"two-cpu-tokens-home";
}
async function verifyResults(browser){
 for(const mode of ["guest","success","http","network","delayed-reset","delayed-exit","reversed"]){
  const email="ludo-"+require("node:crypto").randomUUID()+"@example.com";
  const registered=mode==="guest"?null:await api("/auth/register",null,{name:"Disposable Ludo Player",email,password,accepted_terms:true});
  let context;const errors=[],requests=[],routeErrors=[],blockedProfileRefreshes=[];
  let holdProfileRefresh=false;
  try{
   context=await browser.newContext({viewport:{width:390,height:844}});
   await context.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==new URL(base).origin)return route.abort();
    if(holdProfileRefresh&&url.pathname==="/api/auth/me"&&req.method()==="GET"){
     blockedProfileRefreshes.push(route);return;
    }
    if(url.pathname!=="/api/games/submit"||req.method()!=="POST")return route.continue();
    const item={payload:req.postDataJSON()};requests.push(item);
    try{
     if(mode==="network")return await route.abort("connectionfailed");
     if(mode==="http")return await route.fulfill({status:503,contentType:"application/json",
      body:JSON.stringify({detail:"Disposable failure",xp_gained:999,challenge_completed:true,newly_unlocked_badges:[{id:"fake",name:"Fake reward"}]})});
     const response=await route.fetch();assert.equal(response.status(),200);
     item.data=await response.json();
     if(mode.startsWith("delayed-")||mode==="reversed")await new Promise(resolve=>{item.release=resolve;});
     await route.fulfill({response});item.fulfilled=true;
    }catch(e){routeErrors.push(e.message);await route.abort().catch(()=>{});}
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on("pageerror",e=>errors.push(e.message));
   if(registered){await page.goto(base+"/login");await signIn(page,email);await page.waitForURL(base+"/profile");}
   await page.goto(base+"/play/ludo");await page.getByTestId("ludo-roll").waitFor();
   if(mode==="reversed"){
    const modal=page.getByTestId("share-card-modal");
    const waitHeld=async count=>{
     for(let i=0;i<200&&!requests[count-1]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert.equal(requests.length,count);
     assert(requests[count-1].release,"Real API score response held");
    };
    const release=async index=>{
     const item=requests[index];
     const received=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/games/submit");
     item.release();await received;
     for(let i=0;i<200&&!item.fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert(item.fulfilled,"Held response delivered");
    };
    await finishRound(page,true);
    await waitHeld(1);assert.equal(await modal.count(),0);
    await page.getByTestId("game-reset").click();
    await finishRound(page,false);
    await waitHeld(2);assert.equal(await modal.count(),0);
    assert(requests[1].data.user.xp>requests[0].data.user.xp,
     "Real account snapshots must distinguish the completed rounds");
    for(const [index,won] of [true,false].entries()){
     assert.deepEqual(requests[index].payload,{game_id:"ludo",won,score:won?1:0});
    }
    await release(1);await modal.waitFor();
    assert(await modal.getByText("PLAYED",{exact:true}).isVisible());
    assert(requests[1].data.xp_gained>0,"Completed play awards real API XP");
    assert(await modal.getByText("+"+requests[1].data.xp_gained,{exact:true}).isVisible());
    await page.getByTestId("share-close-btn").click();await modal.waitFor({state:"detached"});
    const reconciled=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/auth/me"&&r.request().method()==="GET");
    await release(0);
    const response=await reconciled;assert.equal(response.status(),200);
    assert.equal((await response.json()).user.xp,requests[1].data.user.xp);
    await page.waitForTimeout(300);
    assert.equal(await modal.count(),0,"Old round cannot reopen dismissed current result");
    for(let i=0;i<2;i++)assert.equal((await page.getByTestId("ludo-cpu-token-"+i).innerText()).trim(),"GOAL");
    holdProfileRefresh=true;
    await page.evaluate(()=>{window.__ludoDocument="preserved";});
    await page.locator('[data-testid="mobile-nav-profile"]:visible').click();
    await page.waitForURL(base+"/profile");
    assert.equal(await page.evaluate(()=>window.__ludoDocument),"preserved");
    await page.getByTestId("profile-email").filter({hasText:email}).waitFor();
    for(let i=0;i<100&&!blockedProfileRefreshes.length;i++)await page.waitForTimeout(20);
    assert(blockedProfileRefreshes.length,"Profile mount refresh held");
    const visibleXP=page.getByText("XP",{exact:true}).locator("..").locator("div").first();
    assert.equal((await visibleXP.textContent()).trim(),String(requests[1].data.user.xp),
     "Visible account XP already reconciled before mount refresh");
    assert.equal(requests.length,2,"No duplicate scores");
    assert.deepEqual(routeErrors,[]);assert.deepEqual(errors,[]);
    console.log("PASS: compiled Ludo legal win then loss, reversed real score responses, current PLAYED result/award, no stale modal and reconciled visible XP with profile mount refresh held");
    continue;
   }
   for(const won of [true,false]){
    const before=requests.length,planLabel=await finishRound(page,won),modal=page.getByTestId("share-card-modal");
    if(mode.startsWith("delayed-")){
     for(let i=0;i<200&&!requests[before]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert.equal(requests.length,before+1);
     const item=requests[before];assert(item.release,"Real score response must be held");
     assert.deepEqual(item.payload,{game_id:"ludo",won,score:won?1:0});
     assert.equal(await modal.count(),0,"No result before the held score response");
     if(mode==="delayed-reset")await page.getByTestId("game-reset").click();
     else{
      await page.evaluate(()=>{window.__ludoDocument="preserved";});
      await page.getByTestId("game-back").click();await page.waitForURL(base+"/library");
      assert.equal(await page.evaluate(()=>window.__ludoDocument),"preserved");
     }
     const received=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/games/submit");
     item.release();await received;
     for(let i=0;i<200&&!item.fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert(item.fulfilled);
     await page.waitForTimeout(800);
     assert.equal(await modal.count(),0,"Late save cannot reopen an obsolete result");
     if(mode==="delayed-reset"){
      assert(await page.getByTestId("ludo-roll").isEnabled());
      for(const side of ["you","cpu"])for(let i=0;i<2;i++)
       assert.equal((await page.getByTestId("ludo-"+side+"-token-"+i).innerText()).trim(),"HOME");
      assert.equal((await page.getByTestId("ludo-message").innerText()).trim(),"Roll the dice. A 6 lets a token out of home.");
      assert.equal((await page.getByTestId("ludo-dice").innerText()).trim(),"Dice: —");
     }else{
      assert.equal(await page.getByTestId("ludo-roll").count(),0);
      await page.goto(base+"/play/ludo");await page.getByTestId("ludo-roll").waitFor();
     }
     assert.equal(requests.length,before+1,"No duplicate score after reset/exit");
     assert.deepEqual(errors,[]);
     console.log("PASS: compiled Ludo legal "+mode+" "+(won?"win":"loss")+", real delayed save silent after reset/SPA exit, no duplicate; plan="+planLabel);
     continue;
    }
    await modal.waitFor();
    assert(await modal.getByText(won?"WIN":"PLAYED",{exact:true}).isVisible());
    if(mode==="guest")assert.equal(requests.length,0);
    else{
     assert.equal(requests.length,before+1,"Exactly one score for a complete legal round");
     assert.deepEqual(requests[before].payload,{game_id:"ludo",won,score:won?1:0});
    }
    if(mode==="success"){
     const data=requests[before].data;assert(data&&data.xp_gained>0);
     assert(await modal.getByText("+"+data.xp_gained,{exact:true}).isVisible());
    }else{
     assert.equal(await modal.getByText("XP earned",{exact:true}).count(),0);
     assert.equal(await modal.getByText("Daily Challenge complete!",{exact:true}).count(),0);
     assert.equal(await modal.getByTestId("share-badges").count(),0);
    }
    await page.getByTestId("share-close-btn").click();await modal.waitFor({state:"detached"});
    await page.getByTestId("game-reset").click();
    await page.waitForTimeout(800);
    assert(await page.getByTestId("ludo-roll").isEnabled());
    for(const side of ["you","cpu"])for(let i=0;i<2;i++)
     assert.equal((await page.getByTestId("ludo-"+side+"-token-"+i).innerText()).trim(),"HOME");
    assert.equal(await modal.count(),0);
    assert.equal(requests.length,mode==="guest"?0:before+1);
    assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
    console.log("PASS: compiled Ludo legal "+mode+" "+(won?"win":"loss")+", exact move path, single score/truthful rewards, clean reset; plan="+planLabel);
   }
  }finally{
   for(const item of requests)if(item.release)item.release();
   for(const route of blockedProfileRefreshes)await route.abort().catch(()=>{});
   if(context)await context.close();
   if(registered){
    const deleted=await fetch(base+"/api/auth/account",{method:"DELETE",headers:{"Content-Type":"application/json",Authorization:"Bearer "+registered.token},body:JSON.stringify({password})});
    assert.equal(deleted.status,200,"Disposable Ludo account cleanup");
   }
  }
 }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [], scores = [];
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === '/api/games/submit') scores.push(request.postData());
      return route.continue();
    });
    await context.addInitScript(() => {
      const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window), pending = new Set();
      let completed = 0;
      window.setTimeout = (fn, delay, ...args) => {
        if (delay !== 800 || typeof fn !== 'function') return timeout(fn, delay, ...args);
        const id = timeout((...values) => { pending.delete(id); completed++; fn(...values); }, delay, ...args);
        pending.add(id); return id;
      };
      window.clearTimeout = id => { pending.delete(id); return clear(id); };
      window.__ludoTimers = () => ({ pending: pending.size, completed });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/play/ludo');
    const roll = page.getByTestId('ludo-roll'); await roll.waitFor();
    async function fresh() {
      assert(await roll.isEnabled());
      for (const side of ['you', 'cpu']) for (let i = 0; i < 2; i++)
        assert.equal((await page.getByTestId(`ludo-${side}-token-${i}`).innerText()).trim(), 'HOME');
      assert.equal((await page.getByTestId('ludo-dice').innerText()).trim(), 'Dice: —');
      assert.equal(await page.getByTestId('share-card-modal').count(), 0);
    }
    await fresh();
    for (const [width, height] of [[320, 640], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.locator('[data-testid^="ludo-cell-"]').count(), 32);
      for (let i = 0; i < 32; i++) {
        const cell = page.getByTestId(`ludo-cell-${i}`); assert.equal(await cell.count(), 1);
        const box = await cell.boundingBox();
        assert(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.x + box.width <= width + 1, `Visible in-width cell ${i} at ${width}`);
      }
      assert(await page.locator('html').evaluate(el => el.scrollWidth <= window.innerWidth), 'No horizontal overflow');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // Controlled dice only. Every move still uses the real UI and game rules.
    async function dice(n) {
      await page.evaluate(n => { let first = true; Math.random = () => { if (first) { first = false; return (n - 0.5) / 6; } return 0; }; }, n);
      await roll.click();
    }
    await dice(6);
    assert(await roll.isDisabled());
    await page.getByTestId('ludo-you-token-0').click();
    for (const position of [6, 12, 18, 24]) {
      await dice(6); await page.getByTestId('ludo-you-token-0').click();
      assert.equal((await page.getByTestId('ludo-you-token-0').innerText()).trim(), `${position}/32`);
    }
    for (const position of [28, 29, 30, 31]) {
      await dice(position === 28 ? 4 : 1);
      await page.waitForFunction(() => !document.querySelector('[data-testid="ludo-roll"]').disabled);
      assert.equal((await page.getByTestId('ludo-you-token-0').innerText()).trim(), `${position}/32`);
      assert.equal(await page.getByTestId(`ludo-cell-${position}`).locator('span.rounded-full').count(), 1, 'Previously invisible position renders its token');
    }
    await page.getByTestId('game-reset').click(); await fresh();
    async function interrupt(action) {
      await dice(1); // Both tokens home: no legal move, schedules CPU.
      return page.evaluate(async action => {
        const deadline = performance.now() + 2000;
        while (!window.__ludoTimers().pending && performance.now() < deadline)
          await new Promise(resolve => requestAnimationFrame(resolve));
        const before = window.__ludoTimers();
        if (before.pending !== 1) throw Error('Expected pending CPU move');
        document.querySelector(`[data-testid="${action}"]`).click(); return before;
      }, action);
    }
    for (let i = 0; i < 3; i++) {
      const before = await interrupt('game-reset');
      await page.waitForFunction(() => window.__ludoTimers().pending === 0);
      await fresh(); await page.waitForTimeout(950); await fresh();
      assert.equal(await page.evaluate(() => window.__ludoTimers().completed), before.completed);
    }
    const before = await page.evaluate(() => window.__ludoTimers().completed);
    await dice(1);
    await page.waitForFunction(previous => window.__ludoTimers().completed === previous + 1, before);
    await page.waitForFunction(() => !document.querySelector('[data-testid="ludo-roll"]').disabled);
    assert(await roll.isEnabled());
    assert.equal((await page.getByTestId('ludo-message').innerText()).trim(), 'CPU rolled 1. No moves.');
    await page.getByTestId('game-reset').click(); await fresh();
    await page.evaluate(() => { window.__ludoDocument = 'preserved'; });
    const exited = await interrupt('game-back'); await page.waitForURL(base + '/library');
    assert.equal(await page.evaluate(() => window.__ludoDocument), 'preserved');
    await page.waitForTimeout(950);
    const after = await page.evaluate(() => window.__ludoTimers());
    assert.equal(after.pending, 0); assert.equal(after.completed, exited.completed);
    assert.equal(await roll.count(), 0); assert.equal(await page.getByTestId('share-card-modal').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(scores, []);
    console.log('PASS: compiled Ludo all32 cells fit mobile/landscape; legal moves visibly reach28-31; token choice; three pending-CPU resets; normal CPU turn; SPA exit cancellation; no guest score/errors');
    await context.close();
    await verifyResults(browser);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

