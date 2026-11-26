/* Legal computer Dominoes games against a disposable loopback API only. */
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.RMC_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright'));
const base=process.env.RMC_BROWSER_TEST_URL,password='DisposableTableTest-2026!';
assert(base&&['127.0.0.1','localhost'].includes(new URL(base).hostname));
const plans={"0":{"seed":4,"actions":[{"hand":["5-6","4-6","3-3","1-1","0-0","1-3"],"action":{"type":"play","tile":"4-6","side":"right"}},{"hand":["5-6","3-3","1-1","0-0","1-3"],"action":{"type":"play","tile":"3-3","side":"right"}},{"hand":["5-6","1-1","0-0","1-3"],"action":{"type":"play","tile":"5-6","side":"left"}},{"hand":["1-1","0-0","1-3"],"action":{"type":"play","tile":"1-1","side":"left"}},{"hand":["0-0","1-3"],"action":{"type":"play","tile":"0-0","side":"right"}},{"hand":["1-3"],"action":{"type":"play","tile":"1-3","side":"left"}}],"cpu":6,"winner":0},"1":{"seed":8,"actions":[{"hand":["1-2","0-1","0-2","1-6","0-5","1-4","1-3"],"action":{"type":"play","tile":"1-4","side":"left"}},{"hand":["1-2","0-1","0-2","1-6","0-5","1-3"],"action":{"type":"play","tile":"1-2","side":"left"}},{"hand":["0-1","0-2","1-6","0-5","1-3"],"action":{"type":"play","tile":"0-5","side":"left"}},{"hand":["0-1","0-2","1-6","1-3"],"action":{"type":"play","tile":"0-1","side":"left"}},{"hand":["0-2","1-6","1-3"],"action":{"type":"play","tile":"0-2","side":"right"}},{"hand":["1-6","1-3"],"action":{"type":"play","tile":"1-6","side":"left"}}],"cpu":6,"winner":1}};
async function finish(page,won){
 const plan=plans[won?'0':'1'];
 await page.evaluate(seed=>{Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};},plan.seed);
 await page.getByRole('button',{name:/^(New computer game|Play again)$/}).click();
 for(const step of plan.actions){
  await page.getByTestId('table-turn').filter({hasText:/^Your turn$/}).waitFor();
  const hand=page.getByTestId('dominoes-hand');
  assert.deepEqual(await hand.locator('button').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label').replace('Tile ',''))),step.hand);
  const tile=hand.getByRole('button',{name:'Tile '+step.action.tile,exact:true});assert(await tile.isEnabled());await tile.click();
  await page.getByRole('button',{name:'Play '+step.action.side,exact:true}).click();
 }
 await page.getByTestId('table-turn').filter({hasText:won?/^You win!$/:/^Computer wins$/}).waitFor();
 assert.equal(await page.getByTestId('dominoes-hand').locator('button:enabled').count(),0);
 for(const side of ['left','right'])assert(await page.getByRole('button',{name:'Play '+side,exact:true}).isDisabled());
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const scenario of [...['guest','success','http','network','delayed-reset','delayed-exit','failed-reset','failed-exit'].map(mode=>({mode,won:true})),{mode:'success',won:false}]){
  const {mode,won}=scenario,email='computer-dominoes-'+require('node:crypto').randomUUID()+'@example.com';let account,context;
  const requests=[],errors=[],routeErrors=[];
  try{
   if(mode!=='guest'){
    const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Disposable Dominoes Player',email,password,accepted_terms:true})});assert(r.ok);account=await r.json();
   }
   context=await browser.newContext({viewport:{width:390,height:844}});
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==new URL(base).origin)return route.abort();
    if(url.pathname!=='/api/games/submit'||req.method()!=='POST')return route.continue();
    const item={payload:req.postDataJSON()};requests.push(item);
    try{
     if(mode==='network')return await route.abort('connectionfailed');
     const failure=mode==='http'||mode.startsWith('failed-');
     let response;if(!failure){response=await route.fetch();assert.equal(response.status(),200);item.data=await response.json();}
     if(mode.startsWith('delayed-')||mode.startsWith('failed-'))await new Promise(resolve=>{item.release=resolve;});
     if(failure)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Disposable failure'})});else await route.fulfill({response});
     item.fulfilled=true;
    }catch(e){routeErrors.push(e.message);await route.abort().catch(()=>{});}
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   if(account){await page.goto(base+'/login');await page.getByTestId('login-email').fill(email);await page.getByTestId('login-password').fill(password);await page.getByTestId('login-terms-checkbox').check();await page.getByTestId('login-submit').click();await page.waitForURL(base+'/profile');}
   await page.goto(base+'/play/dominoes');await page.getByTestId('dominoes-board').waitFor();await finish(page,won);
   const success=page.getByText('Result saved to your profile.',{exact:true}),failure=page.getByText('Result could not be saved.',{exact:true});
   if(mode.includes('-')){
    for(let i=0;i<200&&!requests[0]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
    assert.deepEqual(routeErrors,[]);assert.equal(requests.length,1);assert(requests[0].release);
    if(mode.endsWith('reset'))await page.getByRole('button',{name:'Play again',exact:true}).click();
    else{await page.evaluate(()=>{window.__computerDocument='preserved';});await page.getByTestId('game-back').click();await page.waitForURL(base+'/library');assert.equal(await page.evaluate(()=>window.__computerDocument),'preserved');}
    const received=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/games/submit');requests[0].release();await received;
    for(let i=0;i<200&&!requests[0].fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
    assert(requests[0].fulfilled);await page.waitForTimeout(300);assert.equal(await success.count(),0);assert.equal(await failure.count(),0);
    if(mode.endsWith('reset'))assert(await page.getByRole('button',{name:'New computer game',exact:true}).isVisible());else assert.equal(await page.getByTestId('dominoes-board').count(),0);
   }else{
    if(mode==='success'){await success.waitFor();assert(requests[0].data.xp_gained>0);}else if(mode!=='guest')await failure.waitFor();
    assert.equal(await page.getByRole('button',{name:'Play again',exact:true}).count(),1);
   }
   assert.equal(requests.length,mode==='guest'?0:1);
   for(const item of requests)assert.deepEqual(item.payload,{game_id:'dominoes',won,score:won?1:0});
   assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
   console.log('PASS: compiled computer Dominoes '+JSON.stringify({mode,won,seed:plans[won?'0':'1'].seed})+' legal full game, exact payload, truthful status, reset/SPA-exit lifecycle');
  }finally{
   for(const item of requests)item.release?.();if(context)await context.close();
   if(account){const r=await fetch(base+'/api/auth/account',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.token},body:JSON.stringify({password})});assert.equal(r.status,200,'Disposable Dominoes account cleanup');}
  }
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
