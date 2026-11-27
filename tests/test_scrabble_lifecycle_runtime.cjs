const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.RMC_SCRABBLE_SOURCE||path.join(__dirname,'../frontend/src/pages/games/Scrabble.jsx'),'utf8');
const start=source.indexOf('export default function Scrabble() {'),end=source.indexOf('  return (',start);
assert(start>0&&end>start);
// Actual component callbacks/effects; constructed racks are component fixtures, not device evidence.
function harness(authenticated=true){
 const slots=[],effects=[],callbacks=[],requests=[];let cursor=0,ec=0,cc=0,dirty=false,queued=[],mounted=true,writes=0,loading=false;
 let user=authenticated?{id:'fixture'}:null;
 const submitScore=payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}));
 const run=vm.runInNewContext(source.slice(source.indexOf('const TILE_VALUES'),start)+'\n(function(){'+
 source.slice(start+'export default function Scrabble() {'.length,end)+
 '\nreturn {reset,skipRound,submitWord,pickTile,shuffleRack,round,totalScore,rack,placed,finished,shareOpen,xpInfo};})',{
 useAuth:()=>({user,submitScore,loading}),Math,WORDS:new Set(['cat']),
 useMemo:fn=>fn(),
 useRef:v=>{const i=cursor++;return slots[i]||(slots[i]={current:v});},
 useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],next=>{
 if(!mounted)writes++;const n=typeof next==='function'?next(slots[i]):next;if(!Object.is(n,slots[i])){slots[i]=n;dirty=true;}}];},
 useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queued.push(()=>{
 old?.dispose?.();effects[i]={deps,dispose:fn()};});},
 useCallback:(fn,deps)=>{const i=cc++,old=callbacks[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))callbacks[i]={deps,fn};return callbacks[i].fn;},
 sfx:{win(){},lose(){},click(){},flip(){}},toast:{success(){},error(){}}
 });
 function render(){for(let i=0;i<30;i++){cursor=ec=cc=0;dirty=false;queued=[];const r=run();queued.forEach(f=>f());if(!dirty)return r;}throw Error('effects did not settle');}
 render();return{render,requests,get writes(){return writes;},
 skip(){render().skipRound();return render();},reset(){render().reset();return render();},
 refresh(){user={...user,xp:20};return render();},loading(v){loading=v;return render();},
 unmount(){effects.forEach(e=>e.dispose?.());mounted=false;},
 rack(){slots[1]=['C','A','T','X','X','X','X'];return render();},
 score(n){slots[4]=n;return render();}
 };
}
const settle=()=>new Promise(r=>setImmediate(r));
const award={ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:['fixture']};
function finish(h){for(let i=0;i<5;i++)h.skip();}
test('five skipped rounds save once, including account refresh while pending',async()=>{
 const h=harness();finish(h);h.refresh();assert.equal(h.requests.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].payload)),{game_id:'scrabble',won:false,score:0});
 h.requests[0].resolve(award);await settle();assert(h.render().shareOpen);assert.equal(h.render().xpInfo.xp,20);
});
test('legal word scores and advances a round',()=>{
 const h=harness();h.rack();for(const i of [0,1,2]){h.render().pickTile(i);h.render();}
 h.render().submitWord();const r=h.render();assert.equal(r.totalScore,5);assert.equal(r.round,2);assert.equal(r.placed.length,0);assert.equal(h.requests.length,0);
});
test('par score is a win and final score is submitted',()=>{
 const h=harness();h.score(60);finish(h);assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].payload.won,true);assert.equal(h.requests[0].payload.score,60);
});
test('reset clears confirmed rewards',async()=>{
 const h=harness();finish(h);h.requests[0].resolve(award);await settle();h.render();const r=h.reset();
 assert.equal(r.xpInfo.xp,0);assert.equal(r.xpInfo.done,false);assert.equal(r.xpInfo.badges.length,0);assert.equal(r.shareOpen,false);assert.equal(r.round,1);
});
for(const action of ['reset','unmount'])test('late save is silent after '+action,async()=>{
 const h=harness();finish(h);h[action]();h.requests[0].resolve(award);await settle();
 if(action==='reset'){assert.equal(h.render().shareOpen,false);assert.equal(h.render().xpInfo.xp,0);}else assert.equal(h.writes,0);
});
for(const result of ['http','reject'])test(result+' save failure retains local result without rewards',async()=>{
 const h=harness();finish(h);if(result==='reject')h.requests[0].reject(Error('fixture'));else h.requests[0].resolve({ok:false,xp_gained:999});
 await settle();assert(h.render().shareOpen);assert.equal(h.render().xpInfo.xp,0);
});
test('auth restoration delays save until resolved',()=>{
 const h=harness();h.loading(true);finish(h);assert.equal(h.requests.length,0);assert.equal(h.render().shareOpen,false);
 h.loading(false);assert.equal(h.requests.length,1);
});
test('guest result opens without score request',async()=>{
 const h=harness(false);finish(h);await settle();assert(h.render().shareOpen);assert.equal(h.requests.length,0);
});
test('terminal controls cannot change score, rack or selected tiles',()=>{
 const h=harness();finish(h);const before=h.render();before.pickTile(0);before.shuffleRack();before.skipRound();before.submitWord();
 const after=h.render();assert.equal(after.totalScore,before.totalScore);assert.equal(after.round,before.round);
 assert.deepEqual(after.rack,before.rack);assert.equal(after.placed.length,0);
});
test('new round wins over older delayed response',async()=>{
 const h=harness();finish(h);h.reset();finish(h);assert.equal(h.requests.length,2);
 h.requests[1].resolve({...award,xp_gained:30});await settle();h.render();
 h.requests[0].resolve(award);await settle();assert.equal(h.render().xpInfo.xp,30);
});
