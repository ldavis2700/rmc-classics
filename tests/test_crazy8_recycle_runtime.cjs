const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/pages/games/CrazyEights.jsx'),'utf8');
function harness(authenticated=true,random=Math.random){
 const slots=[],effects=[],requests=[],timers=new Map();let timerId=0;let cursor=0,ec=0,queued=[],dirty=false,mounted=true,writesAfterUnmount=0;
 const user=authenticated?{id:'synthetic'}:null;
 const submitScore=payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}));
 const start=source.indexOf('export default function CrazyEights() {'),end=source.indexOf('  return (\n    <GameShell',start);
 assert(start>0&&end>start);
 const run=vm.runInNewContext(source.slice(source.indexOf('const SUITS'),start)+'\n(function(){'+source.slice(start+'export default function CrazyEights() {'.length,end)+'\nreturn {init,shareOpen,xpInfo,state,turn,winner,pickSuit,wildSuit,playCard,drawCard,pickSuitBtn,canPlay};})',{
 Math:Object.assign(Object.create(Math),{random}),useAuth:()=>({user,submitScore}),useRef:initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});},
 useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{if(!mounted)writesAfterUnmount++;if(!Object.is(v,slots[i])){slots[i]=v;dirty=true;}}];},
 useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
 setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),sfx:{win(){},lose(){},card(){},flip(){},click(){}},toast:{success(){},error(){}}
 });
 function render(){for(let i=0;i<20;i++){cursor=ec=0;queued=[];dirty=false;const r=run();queued.forEach(f=>f());if(!dirty)return r;}throw Error('Effects unsettled');}
 render();return {render,requests,tick(){const ts=[...timers.values()];timers.clear();ts.forEach(f=>f());return render();},position(state,turn,wildSuit=null){slots[0]=state;slots[1]=turn;slots[2]=wildSuit;return render();},finish(won=true){slots[4]=won?'you':'cpu';return render();},reset(){render().init();return render();},unmount(){effects.forEach(e=>e.dispose?.());mounted=false;},get writesAfterUnmount(){return writesAfterUnmount;}};
}
function seeded(seed){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
function conserved(r){const cards=[...r.state.you,...r.state.cpu,...r.state.deck,...r.state.discard];assert.equal(cards.length,52);assert.equal(new Set(cards.map(c=>c.id)).size,52);}
for(const seed of [2,17,18,26])test(`legal seed${seed} escapes exhausted-deck stall and finishes`,()=>{
 const h=harness(false,seeded(seed));let r=h.render(),recycled=0;
 for(let step=0;step<500&&!r.winner;step++){
  conserved(r);const priorDiscard=r.state.discard.length;
  if(r.pickSuit){const counts={};for(const c of r.state.you)counts[c.suit]=(counts[c.suit]||0)+1;r.pickSuitBtn(Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'♠');r=h.render();}
  else if(r.turn==='cpu')r=h.tick();
  else {const i=r.state.you.findIndex(c=>r.canPlay(c,r.state.discard.at(-1),r.wildSuit));if(i>=0)r.playCard(i);else r.drawCard();r=h.render();}
  if(r.state.discard.length<priorDiscard)recycled++;
 }
 conserved(r);assert(recycled>0,'must exercise discard recycling');assert(r.winner,'game must complete within500 actions');assert.equal(h.requests.length,0);h.unmount();
});
function exhausted(h,turn){const r=h.render();const cards=[...r.state.you,...r.state.cpu,...r.state.deck,...r.state.discard];const take=id=>cards.splice(cards.findIndex(c=>c.id===id),1)[0];const top=take('8♠'),you=[take('A♥')],cpu=[take('2♥')];return h.position({you,cpu,deck:[],discard:[...cards,top]},turn,'♣');}
test('player recycles without changing top eight or declared suit',()=>{const h=harness(false,seeded(1));let r=exhausted(h,'you');const before=JSON.stringify(r.state);r.drawCard();r=h.render();conserved(r);assert.equal(r.state.you.length,2);assert.equal(r.state.deck.length,48);assert.equal(r.state.discard.length,1);assert.equal(r.state.discard[0].id,'8♠');assert.equal(r.wildSuit,'♣');assert.notEqual(JSON.stringify(r.state),before);h.unmount();});
test('CPU draws from recycled cards and respects declared suit',()=>{const h=harness(false,seeded(1));exhausted(h,'cpu');const r=h.tick();conserved(r);assert.equal(r.state.discard.length,2);assert.equal(r.state.discard[0].id,'8♠');const played=r.state.discard.at(-1);assert(played.rank==='8'||played.suit==='♣');assert(r.state.deck.length>0);assert.equal(r.turn,'you');h.unmount();});
