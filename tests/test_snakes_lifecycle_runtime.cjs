const {test}=require("node:test");
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../frontend/src/pages/games/SnakesLadders.jsx"),"utf8");
const start=source.indexOf("export default function SnakesLadders() {"),end=source.indexOf("  // Board rendering",start);
assert(start>0&&end>start);
// Actual component callbacks and effects; controlled dice/timers, not browser acceptance.
function harness(authenticated=true){
 const slots=[],effects=[],timers=new Map(),requests=[];
 let cursor=0,ec=0,dirty=false,queued=[],tid=0,mounted=true,writes=0,die=1,loading=false;
 const user=authenticated?{id:"test-player"}:null;
 const submitScore=payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}));
 const run=vm.runInNewContext(source.slice(source.indexOf("const LADDERS"),start)+"\n(function(){"+
 source.slice(start+"export default function SnakesLadders() {".length,end)+
 "\nreturn {rollYou,reset,you,cpu,turn,busy,finished,shareOpen,xpInfo};})",{
 useAuth:()=>({user,submitScore,loading}),Math:{floor:Math.floor,random:()=> (die-0.5)/6},
 useRef:value=>{const i=cursor++;return slots[i]||(slots[i]={current:value});},
 useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{
  if(!mounted)writes++;const v=typeof next==="function"?next(slots[i]):next;
  if(!Object.is(v,slots[i])){slots[i]=v;dirty=true;}
 }];},
 useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))
 queued.push(()=>{old?.dispose?.();effects[i]={deps,dispose:fn()};});},
 setTimeout:fn=>{const id=++tid;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
 sfx:{dice(){},win(){},lose(){}},toast:{success(){},error(){}}
 });
 function render(){for(let i=0;i<30;i++){cursor=ec=0;dirty=false;queued=[];const r=run();queued.forEach(f=>f());if(!dirty)return r;}throw Error("effects did not settle");}
 render();
 return {render,requests,timers,get writes(){return writes;},
 roll(n){die=n;render().rollYou();return render();},
 tick(n=1){die=n;const pending=[...timers.values()];timers.clear();pending.forEach(f=>f());return render();},
 reset(){render().reset();return render();},
 unmount(){effects.forEach(e=>e.dispose?.());mounted=false;},
 position(you,cpu=0){slots[0]=you;slots[1]=cpu;return render();},
 loading(v){loading=v;return render();}
 };
}
const settle=()=>new Promise(r=>setImmediate(r));
const award={ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:["test"]};
function finish(h){h.position(99);h.roll(1);}
test("reset cancels CPU timer and immediately unlocks fresh game",()=>{
 const h=harness();h.roll(1);assert.equal(h.timers.size,1);const old=[...h.timers.values()][0];
 const r=h.reset();assert.equal(h.timers.size,0);assert.equal(r.busy,false);
 old();assert.equal(h.render().cpu,0);assert.equal(h.render().turn,"you");
});
test("exit cancels CPU timer and invalidates a retained callback",()=>{
 const h=harness();h.roll(1);const old=[...h.timers.values()][0];h.unmount();
 assert.equal(h.timers.size,0);old();assert.equal(h.writes,0);
});
test("CPU timer survives busy rerender and completes a normal turn",()=>{
 const h=harness();h.roll(1);h.render();assert.equal(h.timers.size,1);
 const r=h.tick(2);assert.equal(r.cpu,2);assert.equal(r.turn,"you");assert.equal(r.busy,false);
});
test("current win submits once and displays confirmed reward",async()=>{
 const h=harness();finish(h);h.render();assert.equal(h.requests.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].payload)),{game_id:"snakes",won:true,score:1});
 h.requests[0].resolve(award);await settle();assert.equal(h.render().shareOpen,true);assert.equal(h.render().xpInfo.xp,20);
});
test("late success stays silent after reset or exit",async()=>{
 for(const action of ["reset","unmount"]){const h=harness();finish(h);h[action]();h.requests[0].resolve(award);await settle();
 assert.equal(h.writes,0);if(action==="reset"){assert.equal(h.render().shareOpen,false);assert.equal(h.render().xpInfo.xp,0);}}
});
test("reset clears rewards and reverse responses preserve newer result",async()=>{
 const h=harness();finish(h);h.requests[0].resolve(award);await settle();h.reset();
 assert.equal(h.render().xpInfo.xp,0);finish(h);h.reset();finish(h);
 h.requests[2].resolve({...award,xp_gained:30});await settle();h.requests[1].resolve(award);await settle();
 assert.equal(h.render().xpInfo.xp,30);assert.equal(h.requests.length,3);
});
test("failed score save retains local result without invented rewards",async()=>{
 const h=harness();finish(h);h.requests[0].reject(Error("offline"));await settle();
 assert.equal(h.render().shareOpen,true);assert.equal(h.render().xpInfo.xp,0);assert.equal(h.requests.length,1);
});
test("obsolete failed saves stay silent after reset and exit",async()=>{
 for(const action of ["reset","unmount"]){const h=harness();finish(h);h[action]();h.requests[0].reject(Error("offline"));await settle();
 assert.equal(h.writes,0);if(action==="reset")assert.equal(h.render().shareOpen,false);}
});
test("guest win opens result without scoring",()=>{
 const h=harness(false);finish(h);assert.equal(h.render().shareOpen,true);assert.equal(h.requests.length,0);
});
test("saved login restoration finishes before scoring",()=>{
 const h=harness();h.loading(true);finish(h);assert.equal(h.requests.length,0);assert.equal(h.render().shareOpen,false);
 h.loading(false);assert.equal(h.requests.length,1);
});
test("board ladders snakes overshoot and CPU victory retain rules",()=>{
 const h=harness(false);h.roll(3);assert.equal(h.render().you,22);h.tick(1);
 h.position(16);h.roll(1);assert.equal(h.render().you,4);h.tick(1);
 h.position(99,99);h.roll(2);assert.equal(h.render().you,99);
 const r=h.tick(1);assert.equal(r.cpu,100);assert.equal(r.finished,"cpu");assert.equal(r.shareOpen,true);
});
