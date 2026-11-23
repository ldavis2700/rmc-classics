const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/pages/games/GoFish.jsx'),'utf8');
const start=source.indexOf('export default function GoFish() {');
const end=source.indexOf('  if (!state) return null;',start);
assert(start>0&&end>start);
function harness(){
  const slots=[],effects=[],callbacks=[],timers=new Map();
  let cursor=0,ec=0,cc=0,queued=[],dirty=false,nextTimer=0;
  const run=vm.runInNewContext(source.slice(source.indexOf('const RANKS'),start)+'\n(function(){'+source.slice(start+'export default function GoFish() {'.length,end)+'\nreturn {ask,init,state,turn,winner,uniqueRanks};})',{
    Math:Object.assign(Object.create(Math),{random:()=>0}),
    useAuth:()=>({user:null,submitScore(){throw new Error('Guest score submission');}}),
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
    useMemo:fn=>fn(),
    useCallback:(fn,deps)=>{const i=cc++,old=callbacks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))callbacks[i]={fn,deps};return callbacks[i].fn;},
    useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    sfx:{click(){},match(){},win(){},lose(){}},toast:{success(){},error(){}},
  });
  function render(){let result;for(let i=0;i<20;i++){cursor=ec=cc=0;queued=[];dirty=false;result=run();queued.forEach(f=>f());if(!dirty)return result;}throw new Error('Non-settling effects');}
  render();
  return {render,position(state,turn='you',winner=null){slots[0]=state;slots[1]=turn;slots[3]=winner;return render();},tick(){const pending=[...timers];timers.clear();pending.forEach(([,fn])=>fn());return render();},ask(rank){render().ask(rank);return render();},reset(){render().init();return render();}};
}
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const suits=['S','H','D','C'];
const deck=()=>ranks.flatMap(rank=>suits.map(suit=>({rank,suit,id:rank+suit})));
function fixture(){const cards=deck();const you=[cards[0]],cpu=[...cards.slice(1,4),cards[4]];const pool=[cards[8],...cards.slice(5,8),...cards.slice(9)];return {you,cpu,pool,yourBooks:[],cpuBooks:[]};}
function conserved(state){const ids=[...state.you,...state.cpu,...state.pool].map(c=>c.id);for(const r of [...state.yourBooks,...state.cpuBooks])ids.push(...suits.map(s=>r+s));assert.equal(ids.length,52);assert.equal(new Set(ids).size,52);}
test('CPU takes last player card, then misses: player refills and can ask again',()=>{const h=harness();const initial=fixture();const original=JSON.stringify(initial);h.position(initial,'cpu');let r=h.tick();assert.equal(r.turn,'cpu');assert.equal(r.state.you.length,0);conserved(r.state);r=h.tick();assert.equal(r.turn,'you');assert.equal(r.state.you.length,1);assert.equal(r.state.you[0].rank,'2');assert.equal(r.uniqueRanks.length,1);conserved(r.state);assert.equal(JSON.stringify(initial),original);r=h.ask('2');assert(r.state.you.length>0);conserved(r.state);});
test('player completing a book refills exactly once without mutating prior state',()=>{const h=harness();const s=fixture();[s.you,s.cpu]=[s.cpu.slice(0,3),[s.you[0],s.cpu[3]]];const old=JSON.stringify(s);h.position(s);let r=h.ask('A');assert.equal(r.state.yourBooks[0],'A');assert.equal(r.state.you.length,1);const poolSize=r.state.pool.length;h.render();r=h.render();assert.equal(r.state.pool.length,poolSize);conserved(r.state);assert.equal(JSON.stringify(s),old);});
test('refill only draws on an active player turn with a nonempty pool',()=>{for(const [turn,winner,pool] of [['cpu',null,[{rank:'2',id:'2S'}]],['you','cpu',[{rank:'2',id:'2S'}]],['you',null,[]]]){const h=harness();const r=h.position({you:[],cpu:[],pool,yourBooks:[],cpuBooks:[]},turn,winner);assert.equal(r.state.you.length,0);assert.equal(r.state.pool.length,pool.length);}});
test('reset during CPU turn cancels stale move and preserves a complete fresh deck',()=>{const h=harness();h.position(fixture(),'cpu');h.reset();const before=JSON.stringify(h.render().state);const r=h.tick();assert.equal(JSON.stringify(r.state),before);assert.equal(r.turn,'you');assert.equal(r.winner,null);assert.equal(r.state.you.length+r.state.cpu.length+r.state.pool.length+4*(r.state.yourBooks.length+r.state.cpuBooks.length),52);});
