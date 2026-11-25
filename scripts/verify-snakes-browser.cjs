/* Compiled Snakes & Ladders lifecycle with real clocks and UI actions. */
const assert=require("node:assert/strict"),path=require("node:path");
const {chromium}=require(process.env.RMC_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright"):"playwright"));
const base=process.env.RMC_BROWSER_TEST_URL;
assert(base&&["127.0.0.1","localhost"].includes(new URL(base).hostname),"Disposable loopback backend required");
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
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
