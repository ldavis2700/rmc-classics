const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/pages/games/CrazyEights.jsx'),'utf8');
function harness(authenticated=true){
 const slots=[],effects=[],requests=[];let cursor=0,ec=0,queued=[],dirty=false,mounted=true,writesAfterUnmount=0;
 const user=authenticated?{id:'synthetic'}:null;
 const submitScore=payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}));
 const start=source.indexOf('export default function CrazyEights() {'),end=source.indexOf('  if (!state) return null;',start);
 assert(start>0&&end>start);
 const run=vm.runInNewContext(source.slice(source.indexOf('const SUITS'),start)+'\n(function(){'+source.slice(start+'export default function CrazyEights() {'.length,end)+'\nreturn {init,shareOpen,xpInfo};})',{
 Math,useAuth:()=>({user,submitScore}),useRef:initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});},
 useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{if(!mounted)writesAfterUnmount++;if(!Object.is(v,slots[i])){slots[i]=v;dirty=true;}}];},
 useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
 setTimeout:()=>1,clearTimeout:()=>{},sfx:{win(){},lose(){}},toast:{success(){},error(){}}
 });
 function render(){for(let i=0;i<20;i++){cursor=ec=0;queued=[];dirty=false;const r=run();queued.forEach(f=>f());if(!dirty)return r;}throw Error('Effects unsettled');}
 render();return {render,requests,finish(won=true){slots[4]=won?'you':'cpu';return render();},reset(){render().init();return render();},unmount(){effects.forEach(e=>e.dispose?.());mounted=false;},get writesAfterUnmount(){return writesAfterUnmount;}};
}
const settle=()=>new Promise(setImmediate);
const award={ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:[{id:'test'}]};
test('win/loss submit correct payload exactly once and show confirmed reward',async()=>{for(const won of [true,false]){const h=harness();h.finish(won);h.render();assert.equal(h.requests.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].payload)),{game_id:'crazy8',won,score:won?1:0});h.requests[0].resolve(award);await settle();assert.equal(h.render().shareOpen,true);assert.equal(h.render().xpInfo.xp,20);assert.equal(h.requests.length,1);}});
test('guest results never submit a score or earn API rewards',()=>{for(const won of [true,false]){const h=harness(false);h.finish(won);assert.equal(h.requests.length,0);assert.equal(h.render().shareOpen,true);assert.equal(h.render().xpInfo.xp,0);}});
test('late successful response stays silent after reset or unmount',async()=>{for(const leave of ['reset','unmount']){const h=harness();h.finish();h[leave]();h.requests[0].resolve(award);await settle();assert.equal(h.render().shareOpen,false);assert.equal(h.render().xpInfo.xp,0);assert.equal(h.writesAfterUnmount,0);}});
test('older result cannot replace the newer round reward',async()=>{const h=harness();h.finish();h.reset();h.finish();h.requests[1].resolve({...award,xp_gained:30});await settle();h.requests[0].resolve(award);await settle();assert.equal(h.render().xpInfo.xp,30);assert.equal(h.requests.length,2);});
test('reset clears reward, challenge and badge state',async()=>{const h=harness();h.finish();h.requests[0].resolve(award);await settle();h.reset();const r=h.render();assert.equal(r.shareOpen,false);assert.equal(r.xpInfo.xp,0);assert.equal(r.xpInfo.done,false);assert.deepEqual(Array.from(r.xpInfo.badges),[]);});
test('unsuccessful response shows local result without invented rewards',async()=>{const h=harness();h.finish();h.requests[0].resolve({...award,ok:false});await settle();assert.equal(h.render().shareOpen,true);assert.equal(h.render().xpInfo.xp,0);});
test('rejected save preserves local result and stays silent after leaving',async()=>{for(const leave of [null,'reset','unmount']){const h=harness();h.finish();if(leave)h[leave]();h.requests[0].reject(Error('offline'));await settle();assert.equal(h.render().shareOpen,!leave);assert.equal(h.render().xpInfo.xp,0);assert.equal(h.writesAfterUnmount,0);}});
