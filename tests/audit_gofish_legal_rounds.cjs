const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/pages/games/GoFish.jsx'),'utf8');
const start=source.indexOf('export default function GoFish() {');
const end=source.indexOf('  if (!state) return null;',start);
assert(start>0&&end>start);
function harness(seed, observe){
  const slots=[],effects=[],callbacks=[],timers=new Map();
  let cursor=0,ec=0,cc=0,queued=[],dirty=false,nextTimer=0;
  const run=vm.runInNewContext(source.slice(source.indexOf('const RANKS'),start)+'\n(function(){'+source.slice(start+'export default function GoFish() {'.length,end)+'\nreturn {ask,init,state,turn,winner,uniqueRanks};})',{
    Math:Object.assign(Object.create(Math),{random:()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}}),
    useAuth:()=>({user:null,submitScore(){throw new Error('Guest score submission');}}),
    useRef:initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
    useMemo:fn=>fn(),
    useCallback:(fn,deps)=>{const i=cc++,old=callbacks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))callbacks[i]={fn,deps};return callbacks[i].fn;},
    useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    sfx:{click(){},match(){},win(){},lose(){}},toast:{success(){},error(){}},
  });
  function render(){let result;for(let i=0;i<20;i++){cursor=ec=cc=0;queued=[];dirty=false;result=run();if(result.state)observe(result);queued.forEach(f=>f());if(!dirty)return result;}throw new Error('Non-settling effects');}
  render();
  return {render,tick(){assert(timers.size,'CPU must schedule a move');const pending=[...timers];timers.clear();pending.forEach(([,fn])=>fn());return render();},ask(rank){assert(render().uniqueRanks.includes(rank),'Only ask a held rank');render().ask(rank);return render();}};
}

const suits=['♠','♥','♦','♣'];
function conserved(state){
 const ids=[...state.you,...state.cpu,...state.pool].map(c=>c.id);
 for(const rank of [...state.yourBooks,...state.cpuBooks])ids.push(...suits.map(s=>rank+s));
 assert.equal(ids.length,52);assert.equal(new Set(ids).size,52);
}
// Finite legal-play audit of actual component callbacks; not a proof of all reachable states.
// CPU timers execute synchronously here. Browser/device timing is not covered.
const summary={cpuEmptyExamples:[],cpuEmptyWithPoolStates:0,cpuEmptyWithoutPoolStates:0,games:0,wins:0,losses:0,stalls:[],cpuEmptied:0,defensiveRefills:0,playerBookRefills:0,examples:[]};
for(const policy of ['first','last','least-held'])for(let seed=1;seed<=1000;seed++){
 let step=0,refilled=false,emptied=false,refillSteps=[],lastSignature='';
 const h=harness(seed,r=>{
  conserved(r.state);
  const sig=JSON.stringify([r.state,r.turn,r.winner]);if(sig===lastSignature)return;lastSignature=sig;
  if(r.turn==='cpu'&&!r.state.you.length&&!r.winner){emptied=true;summary[r.state.pool.length?'cpuEmptyWithPoolStates':'cpuEmptyWithoutPoolStates']++;}
  if(r.turn==='you'&&!r.state.you.length&&r.state.pool.length&&!r.winner){
   if(emptied){refilled=true;refillSteps.push(step);}else summary.playerBookRefills++;
  }
 });
 let r=h.render();
 for(;step<1000&&!r.winner;step++){
  if(r.turn==='cpu')r=h.tick();
  else {
   if(!r.uniqueRanks.length)break;
   let rank=policy==='last'?r.uniqueRanks.at(-1):r.uniqueRanks[0];
   if(policy==='least-held')rank=[...r.uniqueRanks].sort((a,b)=>r.state.you.filter(c=>c.rank===a).length-r.state.you.filter(c=>c.rank===b).length)[0];
   r=h.ask(rank);
  }
 }
 summary.games++;
 if(!r.winner)summary.stalls.push({policy,seed,step,turn:r.turn,hand:r.state.you.length,cpu:r.state.cpu.length,pool:r.state.pool.length});
 else {assert.equal(r.state.yourBooks.length+r.state.cpuBooks.length,13);summary[r.winner==='you'?'wins':'losses']++;}
 if(emptied){summary.cpuEmptied++;if(summary.cpuEmptyExamples.length<5)summary.cpuEmptyExamples.push({policy,seed,step});}
 if(refilled){summary.defensiveRefills++;if(summary.examples.length<12)summary.examples.push({policy,seed,step,refillSteps});}
}
console.log(JSON.stringify(summary,null,2));
assert.equal(summary.stalls.length,0,'Bounded sample must finish every legal game');
