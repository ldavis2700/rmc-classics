const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/games/RockPaperScissors.jsx"), "utf8");
const start = source.indexOf("export default function RockPaperScissors() {");
const end = source.indexOf("\n  return (", start);
assert(start >= 0 && end > start);
function harness({ authenticated = false } = {}) {
  const slots = [], timers = new Map(), effects = [], requests = [];
  const user = authenticated ? { id: 'test-player' } : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
  let effectCursor = 0, queuedEffects = [], afterUnmountWrites = 0;
  let cursor = 0, mounted = false, nextTimer = 0, matches = 0;
  const deck = () => ["A", "A", "B", "B"].map((symbol, id) => ({ id, symbol, matched: false }));
  const run = vm.runInNewContext("(function RockPaperScissors() {" + source.slice(start + "export default function RockPaperScissors() {".length, end) + "\nreturn {play, reset}; })", {
    CHOICES: [{id:"rock"},{id:"paper"},{id:"scissors"}], BEATS: {rock:"scissors",scissors:"paper",paper:"rock"}, WIN_TARGET:3, Math: {floor:Math.floor,random:()=>0},
    useAuth: () => ({ user, submitScore }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { if (!mounted) afterUnmountWrites++; slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useMemo: fn => fn(),
    useEffect: (fn, deps) => {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        queuedEffects.push(() => { previous?.dispose?.(); effects[index] = { deps, dispose: fn() }; });
      }
    },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    sfx: {click() {},win() {},lose() {}}, toast: {success() {},error() {}},
  });
  const render = () => {
    cursor = 0; effectCursor = 0; queuedEffects = [];
    const actions = run(); mounted = true;
    queuedEffects.forEach(fn => fn());
    return actions;
  };
  render();
  return {
    play: choice => render().play(choice), reset: () => render().reset(),
    flush: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    unmount: () => { effects.forEach(effect => effect.dispose?.()); mounted = false; },
    render, requests,
    get afterUnmountWrites() { return afterUnmountWrites; },
    get state() { return { you:slots[0], cpu:slots[1], round:slots[2], finished:slots[6], busy:slots[8], shareOpen:slots[9], xpInfo:slots[10] }; },
    get pending() { return timers.size; }, get matches() { return matches; },
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const award = {ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:[]};
function finish(h){for(let i=0;i<3;i++){h.play("paper");h.flush();h.render();}h.render();}
test("reset cancels a winning round timer and immediately unlocks choices",()=>{
 const h=harness();h.play("paper");h.flush();h.play("paper");h.flush();h.play("paper");
 h.reset();assert.equal(h.state.busy,false);h.flush();h.render();assert.equal(h.state.finished,null);assert.equal(h.state.you,0);assert.equal(h.state.round,1);
});
test("unmount cancels pending round timer",()=>{const h=harness();h.play("paper");h.unmount();h.flush();assert.equal(h.afterUnmountWrites,0);});
test("current series submits once and accepts its award",async()=>{const h=harness({authenticated:true});finish(h);assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.game_id,"rps");h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,20);});
test("old success cannot reopen reset results",async()=>{const h=harness({authenticated:true});finish(h);h.reset();h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,false);assert.equal(h.state.xpInfo.xp,0);});
test("old success cannot write after exit",async()=>{const h=harness({authenticated:true});finish(h);h.unmount();h.requests[0].resolve(award);await settle();assert.equal(h.afterUnmountWrites,0);});
test("reset clears old award and late responses cannot replace newer award",async()=>{const h=harness({authenticated:true});finish(h);h.requests[0].resolve(award);await settle();h.reset();assert.equal(h.state.xpInfo.xp,0);finish(h);h.reset();finish(h);h.requests[2].resolve({...award,xp_gained:30});await settle();h.requests[1].resolve(award);await settle();assert.equal(h.state.xpInfo.xp,30);});
test("guest series opens result without score request",()=>{const h=harness();finish(h);assert.equal(h.state.shareOpen,true);assert.equal(h.requests.length,0);});

test("current failed save preserves local result without retry or invented award",async()=>{const h=harness({authenticated:true});finish(h);h.requests[0].reject(new Error("offline"));await settle();assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,0);assert.equal(h.requests.length,1);});
test("obsolete failures are silent after reset and exit",async()=>{for(const leave of ["reset","unmount"]){const h=harness({authenticated:true});finish(h);h[leave]();h.requests[0].reject(new Error("offline"));await settle();assert.equal(h.state.shareOpen,false);assert.equal(h.afterUnmountWrites,0);}});
test("draw advances round and loss completes normally",()=>{const h=harness();h.play("rock");h.flush();assert.equal(h.state.round,2);assert.equal(h.state.finished,null);for(let i=0;i<3;i++){h.play("scissors");h.flush();h.render();}assert.equal(h.state.finished,"cpu");assert.equal(h.state.shareOpen,true);});
