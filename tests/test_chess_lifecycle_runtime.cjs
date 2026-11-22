const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/games/Chess.jsx"), "utf8");
const start = source.indexOf("export default function Chess() {");
const end = source.indexOf("\n  return (", start);
assert(start >= 0 && end > start);
function harness({ authenticated = false } = {}) {
  const slots = [], timers = new Map(), effects = [], requests = [];
  const user = authenticated ? { id: 'test-player' } : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
  let effectCursor = 0, queuedEffects = [], afterUnmountWrites = 0;
  let cursor = 0, mounted = false, nextTimer = 0;
  const run = vm.runInNewContext("(function Chess() {" + source.slice(start + "export default function Chess() {".length, end) + "\nreturn {submitGameScore, checkEnd, reset}; })", {
    ChessEngine: class { board() { return []; } turn() { return "w"; } },
    useCallback: fn => fn,
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
    sfx: {click() {},drop() {},win() {},lose() {}}, toast: {success() {},error() {}},
  });
  const render = () => {
    cursor = 0; effectCursor = 0; queuedEffects = [];
    const actions = run(); mounted = true;
    queuedEffects.forEach(fn => fn());
    return actions;
  };
  render();
  return {
    score: won => render().submitGameScore(won), end: position => render().checkEnd(position), reset: () => render().reset(),
    flush: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    unmount: () => { effects.forEach(effect => effect.dispose?.()); mounted = false; },
    render, requests,
    get afterUnmountWrites() { return afterUnmountWrites; },
    get state() { return { finished:slots[3],submitted:slots[4],shareOpen:slots[5],xpInfo:slots[6] }; },
    get pending() { return timers.size; },
  };
}



const settle = () => new Promise(resolve => setImmediate(resolve));
const award = {ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:["test"]};
// Controlled engine outcomes exercise the real completion callback, not chess rules.
const position = outcome => ({isCheckmate:()=>outcome!=="draw",turn:()=>outcome==="you"?"b":"w",isDraw:()=>outcome==="draw",isStalemate:()=>false,isThreefoldRepetition:()=>false,isInsufficientMaterial:()=>false});
test("current score accepts real returned award",async()=>{const h=harness({authenticated:true});const p=h.score(true);assert.equal(h.requests[0].payload.game_id,"chess");h.requests[0].resolve(award);await p;assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,20);});
test("old success cannot reopen reset result",async()=>{const h=harness({authenticated:true});const p=h.score(true);h.reset();h.requests[0].resolve(award);await p;assert.equal(h.state.shareOpen,false);assert.equal(h.state.xpInfo.xp,0);});
test("old success cannot write after exit",async()=>{const h=harness({authenticated:true});const p=h.score(true);h.unmount();h.requests[0].resolve(award);await p;assert.equal(h.afterUnmountWrites,0);});
test("reset closes result and clears award",async()=>{const h=harness({authenticated:true});const p=h.score(true);h.requests[0].resolve(award);await p;h.reset();assert.equal(h.state.shareOpen,false);assert.equal(h.state.xpInfo.xp,0);});
test("older response cannot replace newer award",async()=>{const h=harness({authenticated:true});const a=h.score(true);h.reset();const b=h.score(false);h.requests[1].resolve({...award,xp_gained:5});await b;h.requests[0].resolve(award);await a;assert.equal(h.state.xpInfo.xp,5);assert.equal(h.requests.length,2);});
test("failed current save shows local result without award or retry",async()=>{const h=harness({authenticated:true});const p=h.score(true);h.requests[0].reject(new Error("offline"));await p;assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,0);assert.equal(h.requests.length,1);});
test("obsolete rejected saves stay silent",async()=>{for(const leave of ["reset","unmount"]){const h=harness({authenticated:true});const p=h.score(true);h[leave]();h.requests[0].reject(new Error("offline"));await p;assert.equal(h.state.shareOpen,false);assert.equal(h.afterUnmountWrites,0);}});
test("unsuccessful score response still permits local result without XP",async()=>{const h=harness({authenticated:true});const p=h.score(false);h.requests[0].resolve({ok:false});await p;assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,0);});
for(const outcome of ["you","cpu","draw"]) test("guest completion opens local "+outcome+" result",async()=>{const h=harness();assert.equal(h.end(position(outcome)),true);await settle();assert.equal(h.state.finished,outcome);assert.equal(h.state.shareOpen,true);assert.equal(h.requests.length,0);});
test("completion submits once across rerenders",async()=>{const h=harness({authenticated:true});h.end(position("you"));h.render();h.end(position("you"));assert.equal(h.requests.length,1);h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,true);});
