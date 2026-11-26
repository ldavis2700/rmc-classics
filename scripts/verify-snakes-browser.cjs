/* Compiled Snakes & Ladders lifecycle with real clocks and UI actions. */
const assert=require("node:assert/strict"),path=require("node:path");
const {chromium}=require(process.env.RMC_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright"):"playwright"));
const base=process.env.RMC_BROWSER_TEST_URL;
assert(base&&["127.0.0.1","localhost"].includes(new URL(base).hostname),"Disposable loopback backend required");
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

async function finishRound(page,won){
 const plan=won?{seed:289,you:[22,84,90,96,100],cpu:[22,25,30,33]}:
 {seed:1810,you:[6,7,12,16,18],cpu:[22,84,90,96,100]};
 await page.evaluate(seed=>{Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};},plan.seed);
 await page.getByTestId("game-reset").click();
 const pos=async side=>Number(await page.getByTestId("snakes-"+side+"-pawn")
  .evaluate(el=>el.parentElement.parentElement.firstElementChild.textContent));
 for(let i=0;i<plan.you.length;i++){
  await page.getByTestId("snakes-roll-btn").click();
  assert.equal(await pos("you"),plan.you[i],"Legal player position after roll "+i);
  if(plan.you[i]===100)break;
  await page.waitForFunction(()=>!document.querySelector('[data-testid="snakes-roll-btn"]').disabled||
   document.body.textContent.includes("// CPU WINS"));
  assert.equal(await pos("cpu"),plan.cpu[i],"Legal CPU position after roll "+i);
 }
 assert(await page.getByText(won?"// YOU WIN":"// CPU WINS",{exact:true}).isVisible());
 assert(await page.getByTestId("snakes-roll-btn").isDisabled());
 return plan.seed;
}
async function verifyResults(browser){
 for(const mode of ["guest","success","http","network","delayed-reset","delayed-exit"]){
  const email="snakes-"+require("node:crypto").randomUUID()+"@example.com";
  const registered=mode==="guest"?null:await api("/auth/register",null,{name:"Disposable Snakes Player",email,password,accepted_terms:true});
  let context;const errors=[],requests=[],routeErrors=[];
  try{
   context=await browser.newContext({viewport:{width:390,height:844}});
   await context.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==new URL(base).origin)return route.abort();
    if(url.pathname!=="/api/games/submit"||req.method()!=="POST")return route.continue();
    const item={payload:req.postDataJSON()};requests.push(item);
    try{
     if(mode==="network")return await route.abort("connectionfailed");
     if(mode==="http")return await route.fulfill({status:503,contentType:"application/json",
      body:JSON.stringify({detail:"Disposable failure",xp_gained:999,challenge_completed:true,newly_unlocked_badges:[{id:"fake",name:"Fake reward"}]})});
     const response=await route.fetch();assert.equal(response.status(),200);
     item.data=await response.json();
     if(mode.startsWith("delayed-"))await new Promise(resolve=>{item.release=resolve;});
     await route.fulfill({response});item.fulfilled=true;
    }catch(e){routeErrors.push(e.message);await route.abort().catch(()=>{});}
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on("pageerror",e=>errors.push(e.message));
   if(registered){await page.goto(base+"/login");await signIn(page,email);await page.waitForURL(base+"/profile");}
   await page.goto(base+"/play/snakes");await page.getByTestId("snakes-roll-btn").waitFor();
   for(const won of [true,false]){
    const before=requests.length,seed=await finishRound(page,won),modal=page.getByTestId("share-card-modal");
    if(mode.startsWith("delayed-")){
     for(let i=0;i<200&&!requests[before]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert.equal(requests.length,before+1);
     const item=requests[before];assert(item.release,"Real score response must be held");
     assert.deepEqual(item.payload,{game_id:"snakes",won,score:won?1:0});
     assert.equal(await modal.count(),0,"No result before the held score response");
     if(mode==="delayed-reset")await page.getByTestId("game-reset").click();
     else{
      await page.evaluate(()=>{window.__snakesDocument="preserved";});
      await page.getByTestId("game-back").click();await page.waitForURL(base+"/library");
      assert.equal(await page.evaluate(()=>window.__snakesDocument),"preserved");
     }
     const received=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/games/submit");
     item.release();await received;
     for(let i=0;i<200&&!item.fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert(item.fulfilled);
     await page.waitForTimeout(800);
     assert.equal(await modal.count(),0,"Late save cannot reopen an obsolete result");
     if(mode==="delayed-reset"){
      assert(await page.getByTestId("snakes-roll-btn").isEnabled());
      assert.equal(await page.getByTestId("snakes-you-pawn").count(),0);
      assert.equal(await page.getByTestId("snakes-cpu-pawn").count(),0);
      assert.equal((await page.getByTestId("snakes-log").innerText()).trim(),"Roll to start.");
     }else{
      assert.equal(await page.getByTestId("snakes-board").count(),0);
      await page.goto(base+"/play/snakes");await page.getByTestId("snakes-roll-btn").waitFor();
     }
     assert.equal(requests.length,before+1,"No duplicate score after reset/exit");
     assert.deepEqual(errors,[]);
     console.log("PASS: compiled Snakes legal "+mode+" "+(won?"win":"loss")+", real delayed save silent after reset/SPA exit, no duplicate; seed="+seed);
     continue;
    }
    await modal.waitFor();
    assert(await modal.getByText(won?"WIN":"PLAYED",{exact:true}).isVisible());
    if(mode==="guest")assert.equal(requests.length,0);
    else{
     assert.equal(requests.length,before+1,"Exactly one score for a complete legal round");
     assert.deepEqual(requests[before].payload,{game_id:"snakes",won,score:won?1:0});
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
    assert(await page.getByTestId("snakes-roll-btn").isEnabled());
    assert.equal(await page.getByTestId("snakes-you-pawn").count(),0);
    assert.equal(await page.getByTestId("snakes-cpu-pawn").count(),0);
    assert.equal(await modal.count(),0);
    assert.equal(requests.length,mode==="guest"?0:before+1);
    assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
    console.log("PASS: compiled Snakes legal "+mode+" "+(won?"win":"loss")+", exact move path, single score/truthful rewards, clean reset; seed="+seed);
   }
  }finally{
   for(const item of requests)if(item.release)item.release();
   if(context)await context.close();
   if(registered){
    const deleted=await fetch(base+"/api/auth/account",{method:"DELETE",headers:{"Content-Type":"application/json",Authorization:"Bearer "+registered.token},body:JSON.stringify({password})});
    assert.equal(deleted.status,200,"Disposable Snakes account cleanup");
   }
  }
 }
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const errors=[],submissions=[];
  await context.route("**/*",route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==new URL(base).origin)return route.abort();
   if(url.pathname==="/api/games/submit")submissions.push(req.postData());
   return route.continue();
  });
  await context.addInitScript(()=>{
   const pending=new Set();
   const timeout=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
   let completed=0;
   window.setTimeout=(callback,delay,...args)=>{
    if(delay!==700||typeof callback!=="function")return timeout(callback,delay,...args);
    const id=timeout((...values)=>{pending.delete(id);completed++;callback(...values);},delay,...args);
    pending.add(id);return id;
   };
   window.clearTimeout=id=>{pending.delete(id);return clear(id);};
   window.__snakesTimers=()=>({pending:pending.size,completed});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/play/snakes");
  const roll=page.getByTestId("snakes-roll-btn"),log=page.getByTestId("snakes-log");
  await roll.waitFor();
  async function fresh(){
   assert(await roll.isEnabled());
   assert.equal(await page.getByTestId("snakes-you-pawn").count(),0);
   assert.equal(await page.getByTestId("snakes-cpu-pawn").count(),0);
   assert.equal((await log.innerText()).trim(),"Roll to start.");
   assert.equal(await page.getByTestId("share-card-modal").count(),0);
  }
  await fresh();
  // Wait for React's real CPU effect, then click reset/back in that browser task.
  // Observers never replace game state, random dice or timer callbacks.
  async function interrupt(action){
   await roll.click();
   return page.evaluate(async action=>{
    const deadline=performance.now()+2000;
    while(!window.__snakesTimers().pending&&performance.now()<deadline)
     await new Promise(resolve=>requestAnimationFrame(resolve));
    const before=window.__snakesTimers();
    if(before.pending!==1)throw Error("Expected a pending CPU timer before "+action);
    document.querySelector('[data-testid="'+action+'"]').click();
    return before;
   },action);
  }
  for(let i=0;i<3;i++){
   const before=await interrupt("game-reset");
   await page.waitForFunction(()=>window.__snakesTimers().pending===0);
   await fresh();
   await page.waitForTimeout(900);
   await fresh();
   assert.equal(await page.evaluate(()=>window.__snakesTimers().completed),before.completed,
    "Reset cancels the pending CPU callback");
  }
  // A normal CPU turn must still fire once and re-enable rolling.
  const before=await page.evaluate(()=>window.__snakesTimers());
  await roll.click();
  await page.waitForFunction(previous=>window.__snakesTimers().completed===previous+1,before.completed);
  await page.waitForFunction(()=>!document.querySelector('[data-testid="snakes-roll-btn"]').disabled);
  assert.equal(await page.getByTestId("snakes-cpu-pawn").count(),1);
  assert((await log.innerText()).includes("CPU rolled"));
  await page.getByTestId("game-reset").click();await fresh();
  await page.evaluate(()=>{window.__snakesDocument="preserved";});
  const exited=await interrupt("game-back");
  await page.waitForURL(base+"/library");
  assert.equal(await page.evaluate(()=>window.__snakesDocument),"preserved");
  await page.waitForTimeout(900);
  const after=await page.evaluate(()=>window.__snakesTimers());
  assert.equal(after.pending,0);assert.equal(after.completed,exited.completed);
  assert.equal(await page.getByTestId("snakes-board").count(),0);
  assert.equal(await page.getByTestId("share-card-modal").count(),0);
  assert.deepEqual(submissions,[]);assert.deepEqual(errors,[]);
  console.log("PASS: compiled Snakes repeated pending-CPU resets, immediate fresh controls, no stale move after deadline, normal CPU turn, SPA exit cancels callback, no guest scores or errors");
  await context.close();
  await verifyResults(browser);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
