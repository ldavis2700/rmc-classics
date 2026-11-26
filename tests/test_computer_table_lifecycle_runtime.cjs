const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.RMC_COMPUTER_TABLE_SOURCE||path.join(__dirname,'../frontend/src/components/rmc/ComputerTable.jsx'),'utf8');
const start=source.indexOf('export default function ComputerTable({ game }) {'),end=source.indexOf('  const members =',start);
assert(start>0&&end>start);
// Execute actual component effects/callbacks with controlled state, promises and timers.
// Rules-engine fixtures here are not full-game or signed-device evidence.
function harness(game,authenticated=true){
 const slots=[],effects=[],requests=[],timers=new Map();let cursor=0,ec=0,dirty=false,queued=[],mounted=true,writes=0,loading=false,seq=0;
 let user=authenticated?{id:'fixture'}:null;
 const submitScore=payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}));
 const run=vm.runInNewContext('(function(){'+source.slice(start+'export default function ComputerTable({ game }) {'.length,end)+'\nreturn {state,saved,reset};})',{
 game,newGame:g=>({game:g,phase:g==='spades'?'bidding':'playing',turn:0}),
 applyAction:s=>({...s,turn:0}),computerAction:()=>({type:'fixture'}),
 useAuth:()=>({user,submitScore,loading}),
 setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
 useRef:v=>{const i=cursor++;return slots[i]||(slots[i]={current:v});},
 useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],next=>{
 if(!mounted)writes++;const n=typeof next==='function'?next(slots[i]):next;if(!Object.is(n,slots[i])){slots[i]=n;dirty=true;}}];},
 useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queued.push(()=>{
 old?.dispose?.();effects[i]={deps,dispose:fn()};});}
 });
 function render(){for(let i=0;i<20;i++){cursor=ec=0;dirty=false;queued=[];const r=run();queued.forEach(f=>f());if(!dirty)return r;}throw Error('effects did not settle');}
 render();return{render,requests,timers,get writes(){return writes;},
 finish(winner=0){slots[0]={game,phase:'ended',turn:0,winner,scores:[501,300]};return render();},
 reset(){render().reset();return render();},refresh(){user={...user,xp:20};return render();},
 loading(v){loading=v;return render();},cpu(){slots[0]={game,phase:'playing',turn:1};return render();},
 unmount(){effects.forEach(e=>e.dispose?.());mounted=false;}
 };
}
const settle=()=>new Promise(r=>setImmediate(r));
for(const game of ['dominoes','spades']){
 test(game+' saves a win once despite profile refresh',async()=>{
  const h=harness(game);h.finish();h.refresh();assert.equal(h.requests.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].payload)),{game_id:game,won:true,score:game==='spades'?501:1});
  h.requests[0].resolve({ok:true});await settle();assert.equal(h.render().saved,'Result saved to your profile.');
 });
 for(const action of ['reset','unmount'])for(const outcome of ['resolve','reject'])test(game+' late '+outcome+' after '+action+' is silent',async()=>{
  const h=harness(game);h.finish();h[action]();h.requests[0][outcome](outcome==='resolve'?{ok:true}:Error('fixture'));await settle();
  if(action==='reset')assert.equal(h.render().saved,'');else assert.equal(h.writes,0);
 });
 test(game+' delays saving while auth is loading',()=>{
  const h=harness(game);h.loading(true);h.finish();assert.equal(h.requests.length,0);h.loading(false);assert.equal(h.requests.length,1);
 });
 test(game+' failure preserves terminal board and reset clears status',async()=>{
  const h=harness(game);h.finish(1);h.requests[0].resolve({ok:false});await settle();assert.equal(h.render().state.phase,'ended');
  assert.equal(h.render().saved,'Result could not be saved.');assert.equal(h.reset().saved,'');
 });
 test(game+' older save cannot replace newer failure status',async()=>{
  const h=harness(game);h.finish();h.reset();h.finish();h.requests[1].resolve({ok:false});await settle();h.render();
  h.requests[0].resolve({ok:true});await settle();assert.equal(h.render().saved,'Result could not be saved.');
 });
 test(game+' guest ends without a score request',()=>{const h=harness(game,false);h.finish();assert.equal(h.requests.length,0);});
 for(const action of ['reset','unmount'])test(game+' cancels queued CPU move on '+action,()=>{
  const h=harness(game);h.cpu();assert.equal(h.timers.size,1);h[action]();assert.equal(h.timers.size,0);
 });
}
