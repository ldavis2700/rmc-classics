const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/pages/games/OldMaid.jsx'),'utf8');
const start=source.indexOf('export default function OldMaid() {');
const end=source.indexOf('  if (!state) return null;',start);
assert(start>0&&end>start);
function seededRandom(seed){
  return ()=>{
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    return seed / 2**32;
  };
}
function harness(authenticated=false, random=seededRandom(1)){
  const slots=[],effects=[],callbacks=[],timers=new Map(),requests=[];
  let mounted=true,afterUnmountWrites=0;
  const user=authenticated?{id:"test-player"}:null;
  const submitScore=payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}));
  let cursor=0,ec=0,cc=0,queued=[],dirty=false,nextTimer=0;
  const run=vm.runInNewContext(source.slice(source.indexOf('const RANKS'),start)+'\n(function(){'+source.slice(start+'export default function OldMaid() {'.length,end)+'\nreturn {drawFromCpu,init,state,turn,winner,shareOpen,xpInfo};})',{
    Math:Object.assign(Object.create(Math),{random}),
    useAuth:()=>({user,submitScore}),
    useRef:initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{if(!mounted)afterUnmountWrites++;const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
    useMemo:fn=>fn(),
    useCallback:(fn,deps)=>{const i=cc++,old=callbacks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))callbacks[i]={fn,deps};return callbacks[i].fn;},
    useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    sfx:{card(){},click(){},match(){},win(){},lose(){}},toast:{success(){},error(){}},
  });
  function render(){let result;for(let i=0;i<20;i++){cursor=ec=cc=0;queued=[];dirty=false;result=run();queued.forEach(f=>f());if(!dirty)return result;}throw new Error('Non-settling effects');}
  render();
  return {render,requests,unmount(){effects.forEach(e=>e.dispose?.());mounted=false;},get afterUnmountWrites(){return afterUnmountWrites;},get result(){return {shareOpen:slots[5],xpInfo:slots[6]};},position(state,turn='you',winner=null){slots[0]=state;slots[1]=turn;slots[3]=winner;return render();},tick(){const pending=[...timers];timers.clear();pending.forEach(([,fn])=>fn());return render();},draw(i){render().drawFromCpu(i);return render();},reset(){render().init();return render();}};
}

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const award={ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:['test']};
function finish(h,won=true){
 const card=(rank,suit)=>({rank,suit,id:rank+suit});
 h.position(won?{you:[card('A','H')],cpu:[card('A','S'),card('Q','H')]}:{you:[card('A','H'),card('Q','H')],cpu:[card('A','S')]});
 const r=h.draw(0);assert.equal(r.winner,won?'you':'cpu');
}
test('win and loss submit correct result once',async()=>{for(const won of [true,false]){const h=harness(true);finish(h,won);h.render();h.draw(0);assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.game_id,'oldmaid');assert.equal(h.requests[0].payload.won,won);assert.equal(h.requests[0].payload.score,won?1:0);h.requests[0].resolve(award);await settle();h.render();assert.equal(h.requests.length,1);assert.equal(h.result.shareOpen,true);}});
test('guest result sends no score',()=>{const h=harness();finish(h);assert.equal(h.requests.length,0);assert.equal(h.result.shareOpen,true);});
test('late success after reset or unmount cannot update prior result',async()=>{for(const leave of ['reset','unmount']){const h=harness(true);finish(h);h[leave]();h.requests[0].resolve(award);await settle();assert.equal(h.result.shareOpen,false);assert.equal(h.result.xpInfo.xp,0);assert.equal(h.afterUnmountWrites,0);}});
test('unsuccessful response preserves result without false award',async()=>{const h=harness(true);finish(h);h.requests[0].resolve({...award,ok:false});await settle();assert.equal(h.result.shareOpen,true);assert.equal(h.result.xpInfo.xp,0);});
test('older response cannot replace newer round reward',async()=>{const h=harness(true);finish(h);h.reset();finish(h);h.requests[1].resolve({...award,xp_gained:30});await settle();h.requests[0].resolve(award);await settle();assert.equal(h.result.xpInfo.xp,30);});
test('reset clears previous award and modal',async()=>{const h=harness(true);finish(h);h.requests[0].resolve(award);await settle();h.reset();assert.equal(h.result.shareOpen,false);assert.equal(h.result.xpInfo.xp,0);assert.equal(h.result.xpInfo.done,false);assert.equal(h.result.xpInfo.badges.length,0);});

test('rejected save preserves local result and remains silent after leaving',async()=>{for(const leave of [null,'reset','unmount']){const h=harness(true);finish(h);if(leave)h[leave]();h.requests[0].reject(new Error('offline'));await settle();assert.equal(h.result.shareOpen,!leave);assert.equal(h.result.xpInfo.xp,0);assert.equal(h.afterUnmountWrites,0);}});
test('reset during CPU turn cancels move and card flash timer',()=>{const h=harness();h.draw(0);h.reset();const before=JSON.stringify(h.render().state);h.tick();assert.equal(JSON.stringify(h.render().state),before);assert.equal(h.render().winner,null);});

test('a legal opening deal with an empty player hand wins immediately on every round',async()=>{
  let random=seededRandom(21);
  const h=harness(true,()=>random());
  for(let round=0;round<2;round++){
    if(round>0){
      random=seededRandom(21);
      h.reset();
    }
    const result=h.render();
    assert.equal(result.state.you.length,0);
    assert.equal(result.state.cpu.length,1);
    assert.equal(result.state.cpu[0].rank,'Q');
    assert.equal(result.winner,'you');
    assert.equal(h.requests.length,round+1);
    assert.equal(h.requests[round].payload.game_id,'oldmaid');
    assert.equal(h.requests[round].payload.won,true);
    assert.equal(h.requests[round].payload.score,1);
    h.requests[round].resolve(award);
    await settle();
    h.render();
    assert.equal(h.result.shareOpen,true);
  }
});
