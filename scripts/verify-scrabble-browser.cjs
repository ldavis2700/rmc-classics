/* Word Tiles compiled UI acceptance against a disposable loopback backend. */
const assert=require("node:assert/strict"),path=require("node:path");
const {chromium}=require(process.env.RMC_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright"):"playwright"));
const base=process.env.RMC_BROWSER_TEST_URL,password="DisposableTableTest-2026!";
assert(base&&["127.0.0.1","localhost"].includes(new URL(base).hostname));
async function register(email){
 const r=await fetch(base+"/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Disposable Word Tiles Player",email,password,accepted_terms:true})});
 assert(r.ok);return r.json();
}
async function fresh(page){
 assert.equal((await page.getByTestId("scrabble-score").innerText()).trim(),"Round 1/5 · 0 pts");
 for(const id of ["scrabble-skip","scrabble-shuffle"])assert(await page.getByTestId(id).isEnabled());
 assert.equal(await page.getByTestId("share-card-modal").count(),0);
 assert.equal((await page.getByTestId("scrabble-word").innerText()).trim(),"Tap tiles below");
}
async function terminal(page){
 assert.equal((await page.getByTestId("scrabble-score").innerText()).trim(),"Round 5/5 · 0 pts");
 for(const id of ["scrabble-skip","scrabble-shuffle","scrabble-submit"])assert(await page.getByTestId(id).isDisabled());
 for(let i=0;i<7;i++)assert(await page.getByTestId("scrabble-tile-"+i).isDisabled());
}
async function finish(page){
 await page.getByTestId("game-reset").click();await fresh(page);
 for(let i=1;i<=5;i++){
  assert.equal((await page.getByTestId("scrabble-score").innerText()).trim(),"Round "+i+"/5 · 0 pts");
  await page.getByTestId("scrabble-skip").click();
 }
 await terminal(page);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const mode of ["guest","success","http","network","delayed-reset","delayed-exit","reversed"]){
   const email="word-tiles-"+require("node:crypto").randomUUID()+"@example.com";
   const account=mode==="guest"?null:await register(email);
   let context,holdProfile=false;const requests=[],errors=[],routeErrors=[],blocked=[];
   try{
    context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route("**/*",async route=>{
     const req=route.request(),url=new URL(req.url());
     if(url.origin!==new URL(base).origin)return route.abort();
     if(holdProfile&&url.pathname==="/api/auth/me"&&req.method()==="GET"){blocked.push(route);return;}
     if(url.pathname!=="/api/games/submit"||req.method()!=="POST")return route.continue();
     const item={payload:req.postDataJSON()};requests.push(item);
     try{
      if(mode==="network")return await route.abort("connectionfailed");
      if(mode==="http")return await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"Disposable failure",xp_gained:999,challenge_completed:true,newly_unlocked_badges:[{id:"fake",name:"Fake reward"}]})});
      const response=await route.fetch();assert.equal(response.status(),200);item.data=await response.json();
      if(mode.startsWith("delayed-")||mode==="reversed")await new Promise(resolve=>{item.release=resolve;});
      await route.fulfill({response});item.fulfilled=true;
     }catch(e){routeErrors.push(e.message);await route.abort().catch(()=>{});}
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on("pageerror",e=>errors.push(e.message));
    if(account){
     await page.goto(base+"/login");await page.getByTestId("login-email").fill(email);
     await page.getByTestId("login-password").fill(password);await page.getByTestId("login-terms-checkbox").check();
     await page.getByTestId("login-submit").click();await page.waitForURL(base+"/profile");
    }
    await page.goto(base+"/play/scrabble");await page.getByTestId("scrabble-skip").waitFor();
    const modal=page.getByTestId("share-card-modal");
    const held=async count=>{
     for(let i=0;i<200&&!requests[count-1]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert.equal(requests.length,count);assert(requests[count-1].release);
     assert.equal(await modal.count(),0);
    };
    const release=async index=>{
     const item=requests[index],received=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/games/submit");
     item.release();await received;
     for(let i=0;i<200&&!item.fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
     assert.deepEqual(routeErrors,[]);assert(item.fulfilled);
    };
    const reward=async item=>{
     await modal.waitFor();assert(await modal.getByText("PLAYED",{exact:true}).isVisible());
     assert(item.data.xp_gained>0);assert(await modal.getByText("+"+item.data.xp_gained,{exact:true}).isVisible());
     for(const badge of item.data.newly_unlocked_badges||[])assert((await modal.innerText()).includes(badge.name));
    };
    await finish(page);
    if(mode==="reversed"){
     await held(1);await finish(page);await held(2);
     assert(requests[1].data.user.xp>requests[0].data.user.xp);
     await release(1);await reward(requests[1]);
     await page.getByTestId("share-close-btn").click();await modal.waitFor({state:"detached"});
     const reconciled=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/auth/me"&&r.request().method()==="GET");
     await release(0);const response=await reconciled;assert.equal(response.status(),200);
     assert.equal((await response.json()).user.xp,requests[1].data.user.xp);
     await page.waitForTimeout(300);assert.equal(await modal.count(),0);await terminal(page);
     holdProfile=true;await page.evaluate(()=>{window.__wordTilesDocument="preserved";});
     await page.locator('[data-testid="mobile-nav-profile"]:visible').click();await page.waitForURL(base+"/profile");
     assert.equal(await page.evaluate(()=>window.__wordTilesDocument),"preserved");
     await page.getByTestId("profile-email").filter({hasText:email}).waitFor();
     for(let i=0;i<100&&!blocked.length;i++)await page.waitForTimeout(20);assert(blocked.length);
     const xp=page.getByText("XP",{exact:true}).locator("..").locator("div").first();
     assert.equal((await xp.textContent()).trim(),String(requests[1].data.user.xp));
    }else if(mode.startsWith("delayed-")){
     await held(1);
     if(mode==="delayed-reset"){await page.getByTestId("game-reset").click();await fresh(page);}
     else{
      await page.evaluate(()=>{window.__wordTilesDocument="preserved";});
      await page.getByTestId("game-back").click();await page.waitForURL(base+"/library");
      assert.equal(await page.evaluate(()=>window.__wordTilesDocument),"preserved");
     }
     await release(0);await page.waitForTimeout(300);assert.equal(await modal.count(),0);
     if(mode==="delayed-reset")await fresh(page);else assert.equal(await page.getByTestId("scrabble-rack").count(),0);
    }else{
     await modal.waitFor();assert(await modal.getByText("PLAYED",{exact:true}).isVisible());
     if(mode==="success")await reward(requests[0]);else{
      assert.equal(await modal.getByText("XP earned",{exact:true}).count(),0);
      assert.equal(await modal.getByText("Daily Challenge complete!",{exact:true}).count(),0);
      assert.equal(await modal.getByTestId("share-badges").count(),0);
     }
     await page.getByTestId("share-close-btn").click();await modal.waitFor({state:"detached"});
     await terminal(page);await page.getByTestId("game-reset").click();await fresh(page);
    }
    assert.equal(requests.length,mode==="guest"?0:mode==="reversed"?2:1);
    for(const item of requests)assert.deepEqual(item.payload,{game_id:"scrabble",won:false,score:0});
    assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
    console.log("PASS: compiled Word Tiles five skipped rounds "+mode+", exact score count/payload, truthful rewards, terminal controls and result lifecycle");
   }finally{
    for(const item of requests)if(item.release)item.release();
    for(const route of blocked)await route.abort().catch(()=>{});
    if(context)await context.close();
    if(account){const r=await fetch(base+"/api/auth/account",{method:"DELETE",headers:{"Content-Type":"application/json",Authorization:"Bearer "+account.token},body:JSON.stringify({password})});assert.equal(r.status,200,"Disposable Word Tiles account cleanup");}
   }
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
