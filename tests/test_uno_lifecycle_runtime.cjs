const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/games/Uno.jsx'), 'utf8');
const start = source.indexOf('export default function Uno() {');
const end = source.indexOf('\n  return (', start);
assert(start >= 0 && end > start);
function harness({ authenticated = false } = {}) {
  const slots = [], effects = [], timers = new Map(), requests = [];
  let cursor = 0, effectCursor = 0, queued = [], mounted = false, afterUnmountWrites = 0, timerId = 0;
  const user = authenticated ? {id:'test-player'} : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({payload,resolve,reject}));
  const context = {
    useAuth: () => ({user,submitScore}), useCallback: (fn,deps) => { const i=cursor++,old=slots[i]; if(!old||deps.some((dep,j)=>!Object.is(dep,old.deps[j])))slots[i]={fn,deps};return slots[i].fn; },
    useState: initial => { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i],value=>{if(!mounted)afterUnmountWrites++;slots[i]=typeof value==='function'?value(slots[i]):value;}]; },
    useRef: initial => { const i=cursor++;return slots[i]||(slots[i]={current:initial}); },
    useEffect: (fn,deps)=>{const i=effectCursor++,old=effects[i];if(!old||deps.some((dep,j)=>!Object.is(dep,old.deps[j])))queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
    setTimeout: (fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    sfx:{win(){},lose(){},card(){},flip(){},click(){}},toast:{success(){},error(){}},
  };
  const run=vm.runInNewContext(source.slice(source.indexOf('const COLORS ='),start)+'\n(function Uno(){'+source.slice(start+'export default function Uno() {'.length,end)+'\nreturn {init,playCard,pickColorBtn,state:{finished,shareOpen,xpInfo}};})',context);
  const render=()=>{cursor=0;effectCursor=0;queued=[];const actions=run();mounted=true;queued.forEach(fn=>fn());return actions;};
  render();render();
  return {
    render,requests,
    finish(wild=false){slots[2]=[{id:100,color:wild?'wild':'red',value:wild?'wild':'5'}];slots[1]=[{color:'red',value:'8'}];render().playCard(0);render();if(wild){render().pickColorBtn('blue');render();}},
    stackLast(value){slots[3]=[{id:101,color:value==='+4'?'wild':'red',value}];slots[4]='cpu';slots[7]=2;render();for(const [id,t] of [...timers]){timers.delete(id);t.fn();}render();},
    reset(){render().init();render();},
    unmount(){effects.forEach(e=>e.dispose?.());mounted=false;},
    get state(){return render().state;},
    get afterUnmountWrites(){return afterUnmountWrites;},
  };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const award={ok:true,xp_gained:10,challenge_completed:true,newly_unlocked_badges:['test']};
test('normal and wild final cards submit once despite completion rerenders',async()=>{for(const wild of [false,true]){const h=harness({authenticated:true});h.finish(wild);h.render();h.render();assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.game_id,'uno');assert.equal(h.requests[0].payload.won,true);h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,10);}});
test('guest receives local result without submitting',()=>{const h=harness();h.finish();assert.equal(h.requests.length,0);assert.equal(h.state.shareOpen,true);});
test('late success and rejection cannot reopen reset result or write after exit',async()=>{for(const leave of ['reset','unmount'])for(const reject of [false,true]){const h=harness({authenticated:true});h.finish();h[leave]();reject?h.requests[0].reject(new Error('offline')):h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,false);assert.equal(h.state.xpInfo.xp,0);assert.equal(h.afterUnmountWrites,0);}});
test('rejected or unsuccessful save still shows local result without awards or retry',async()=>{for(const reject of [false,true]){const h=harness({authenticated:true});h.finish();reject?h.requests[0].reject(new Error('offline')):h.requests[0].resolve({ok:false});await settle();h.render();assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,0);assert.equal(h.requests.length,1);}});
test('reset clears awards and an older response cannot overwrite a newer round',async()=>{const h=harness({authenticated:true});h.finish();h.reset();h.finish();h.requests[1].resolve({...award,xp_gained:30});await settle();h.requests[0].resolve(award);await settle();assert.equal(h.state.xpInfo.xp,30);assert.equal(h.requests.length,2);h.reset();assert.equal(h.state.xpInfo.xp,0);assert.equal(h.state.shareOpen,false);});
test('CPU emptying its hand by stacking +2 or +4 ends and submits loss once',async()=>{for(const value of ['+2','+4']){const h=harness({authenticated:true});h.stackLast(value);h.render();assert.equal(h.state.finished,'cpu');assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.won,false);assert.equal(h.requests[0].payload.score,0);h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,true);}});
