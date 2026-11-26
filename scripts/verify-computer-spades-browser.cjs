/* Legal computer Spades games against a disposable loopback API only. */
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.RMC_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright'));
const base=process.env.RMC_BROWSER_TEST_URL,password='DisposableTableTest-2026!';
assert(base&&['127.0.0.1','localhost'].includes(new URL(base).hostname));
const {plans,label}=require('./plan-computer-spades.cjs');
async function seedDeal(page,seed){
 await page.evaluate(seed=>{Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};},seed);
}
async function finish(page,plan,requests){
 // This explicitly accelerates ONLY 650ms computer-turn timeouts. It is not
 // real-timer or physical-device evidence. React, scoring and HTTP stay real.
 await page.evaluate(()=>{
  const real=window.setTimeout.bind(window);window.__spadesFastTimers=0;
  window.setTimeout=(fn,delay,...args)=>{if(delay===650){window.__spadesFastTimers++;delay=10;}return real(fn,delay,...args);};
 });
 await seedDeal(page,plan.seed);
 await page.getByRole('button',{name:/^(New computer game|Play again)$/}).click();
 for(let n=0;n<plan.rounds.length;n++){
  const round=plan.rounds[n];
  if(n){assert.equal(requests.length,0,'No score submission before match completion');await seedDeal(page,round.seed);await page.getByRole('button',{name:'Deal next hand',exact:true}).click();}
  for(const step of round.actions){
   await page.getByTestId('table-turn').filter({hasText:step.phase==='bidding'?/^Your bid$/:/^Your turn$/}).waitFor();
   // Wait for the expected render; an immediate same-seat next turn can retain its status text.
   await page.waitForFunction(expected=>{
    const buttons=[...document.querySelectorAll('[data-testid="spades-hand"] button')];
    return JSON.stringify(buttons.map(b=>b.getAttribute('aria-label')))===JSON.stringify(expected.hand)
     &&JSON.stringify(buttons.filter(b=>!b.disabled).map(b=>b.getAttribute('aria-label')))===JSON.stringify(expected.legal);
   },{hand:step.hand,legal:step.legal});
   assert.equal(requests.length,0,'No score submission during a hand');
   const control=step.action.type==='bid'?page.getByRole('button',{name:'Bid '+(step.action.bid||'nil'),exact:true}):page.getByTestId('spades-hand').getByRole('button',{name:label(step.action.card),exact:true});
   assert(await control.isEnabled());await control.click();
  }
  const final=n===plan.rounds.length-1;
  await page.getByTestId('table-turn').filter({hasText:final?(plan.winner===0?/^Your team wins!$/:/^Other team wins$/):/^Hand complete$/}).waitFor();
  const board=page.getByTestId('spades-board');
  for(const [team,i] of [['Your',0],['Other',1]])assert.equal(await board.locator('span').filter({hasText:new RegExp('^'+team+' team:')}).innerText(),`${team} team: ${round.scores[i]} · ${round.bags[i]} bags`);
  assert.deepEqual(await page.getByTestId('spades-mobile-points').allTextContents(),round.points);
  assert.equal(await page.getByTestId('spades-hand').locator('button').count(),0);
  if(!final){assert.equal(requests.length,0);assert.equal(await page.getByText('Result saved to your profile.',{exact:true}).count(),0);}
 }
 assert.equal(await page.getByRole('button',{name:'Deal next hand',exact:true}).count(),0);
 assert(await page.evaluate(()=>window.__spadesFastTimers>=336));
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const scenario of [{mode:'success',plan:plans[0]},{mode:'failed-reset',plan:plans[0]},{mode:'delayed-exit',plan:plans[1]}]){
  const {mode,plan}=scenario,won=plan.winner===0,email='computer-spades-'+require('node:crypto').randomUUID()+'@example.com';let account,context;
  const requests=[],errors=[],routeErrors=[];
  try{
   {
    const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Disposable Spades Player',email,password,accepted_terms:true})});assert(r.ok);account=await r.json();
   }
   context=await browser.newContext({viewport:{width:390,height:844}});
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==new URL(base).origin)return route.abort();
    if(url.pathname!=='/api/games/submit'||req.method()!=='POST')return route.continue();
    const item={payload:req.postDataJSON()};requests.push(item);
    try{
     const failure=mode.startsWith('failed-');
     let response;if(!failure){response=await route.fetch();assert.equal(response.status(),200);item.data=await response.json();}
     if(mode.startsWith('delayed-')||mode.startsWith('failed-'))await new Promise(resolve=>{item.release=resolve;});
     if(failure)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Disposable failure'})});else await route.fulfill({response});
     item.fulfilled=true;
    }catch(e){routeErrors.push(e.message);await route.abort().catch(()=>{});}
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   if(account){await page.goto(base+'/login');await page.getByTestId('login-email').fill(email);await page.getByTestId('login-password').fill(password);await page.getByTestId('login-terms-checkbox').check();await page.getByTestId('login-submit').click();await page.waitForURL(base+'/profile');}
   await page.goto(base+'/play/spades');await page.getByTestId('spades-board').waitFor();await finish(page,plan,requests);
   const success=page.getByText('Result saved to your profile.',{exact:true}),failure=page.getByText('Result could not be saved.',{exact:true});
   if(mode.includes('-')){
    for(let i=0;i<200&&!requests[0]?.release&&!routeErrors.length;i++)await page.waitForTimeout(25);
    assert.deepEqual(routeErrors,[]);assert.equal(requests.length,1);assert(requests[0].release);
    if(mode.endsWith('reset'))await page.getByRole('button',{name:'Play again',exact:true}).click();
    else{await page.evaluate(()=>{window.__computerDocument='preserved';});await page.getByTestId('game-back').click();await page.waitForURL(base+'/library');assert.equal(await page.evaluate(()=>window.__computerDocument),'preserved');}
    const received=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/games/submit');requests[0].release();await received;
    for(let i=0;i<200&&!requests[0].fulfilled&&!routeErrors.length;i++)await page.waitForTimeout(25);
    assert(requests[0].fulfilled);await page.waitForTimeout(300);assert.equal(await success.count(),0);assert.equal(await failure.count(),0);
    if(mode.endsWith('reset'))assert(await page.getByRole('button',{name:'New computer game',exact:true}).isVisible());else assert.equal(await page.getByTestId('spades-board').count(),0);
   }else{
    if(mode==='success'){await success.waitFor();assert(requests[0].data.xp_gained>0);}
    assert.equal(await page.getByRole('button',{name:'Play again',exact:true}).count(),1);
   }
   assert.equal(requests.length,1);
   for(const item of requests)assert.deepEqual(item.payload,{game_id:'spades',won,score:plan.scores[0]});
   assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
   console.log('PASS: compiled computer Spades '+JSON.stringify({mode,won,seed:plan.seed,hands:plan.round,scores:plan.scores,cpuTimerMs:10})+' legal full 500-point match, per-hand scores/bags, exact payload, truthful status, reset/SPA-exit lifecycle; test-only accelerated CPU timers');
  }finally{
   for(const item of requests)item.release?.();if(context)await context.close();
   if(account){const r=await fetch(base+'/api/auth/account',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.token},body:JSON.stringify({password})});assert.equal(r.status,200,'Disposable Spades account cleanup');}
  }
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
