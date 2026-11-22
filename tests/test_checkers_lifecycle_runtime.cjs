const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/games/Checkers.jsx"), "utf8");
const start = source.indexOf("export default function Checkers() {");
const end = source.indexOf("\n  return (", start);
assert(start >= 0 && end > start);
function harness({ authenticated = false } = {}) {
  const slots = [], timers = new Map(), effects = [], requests = [];
  const user = authenticated ? { id: 'test-player' } : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
  let effectCursor = 0, queuedEffects = [], afterUnmountWrites = 0;
  let cursor = 0, mounted = false, nextTimer = 0;
  const run = vm.runInNewContext(source.slice(source.indexOf("const SIZE ="), start) + "\n(function Checkers() {" + source.slice(start + "export default function Checkers() {".length, end) + "\nreturn {onCell, reset}; })", {
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
    play: (r, c) => render().onCell(r, c), setPosition: board => { slots[0] = board; render(); }, reset: () => render().reset(),
    flush: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    unmount: () => { effects.forEach(effect => effect.dispose?.()); mounted = false; },
    render, requests,
    get afterUnmountWrites() { return afterUnmountWrites; },
    get state() { return { board:slots[0],turn:slots[2],winner:slots[3],shareOpen:slots[5],xpInfo:slots[6] }; },
    get pending() { return timers.size; },
  };
}


const settle = () => new Promise(resolve => setImmediate(resolve));
const award = {ok:true,xp_gained:10,challenge_completed:true,newly_unlocked_badges:["test"]};
function finish(h) { const board=Array.from({length:8},()=>Array(8).fill(0));board[5][0]=1;board[4][1]=2;h.setPosition(board);h.play(5,0);h.play(3,2);h.render();h.render();assert.equal(h.state.winner,"you"); }
test("completed game submits once and accepts current award",async()=>{const h=harness({authenticated:true});finish(h);assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.game_id,"checkers");assert.equal(h.requests[0].payload.won,true);h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,10);});
test("late success cannot reopen result after reset",async()=>{const h=harness({authenticated:true});finish(h);h.reset();h.render();h.requests[0].resolve(award);await settle();assert.equal(h.state.shareOpen,false);assert.equal(h.state.xpInfo.xp,0);assert.equal(h.state.winner,null);});
test("late success cannot write after unmount",async()=>{const h=harness({authenticated:true});finish(h);h.unmount();h.requests[0].resolve(award);await settle();assert.equal(h.afterUnmountWrites,0);});
test("reset clears previous awards",async()=>{const h=harness({authenticated:true});finish(h);h.requests[0].resolve(award);await settle();h.reset();assert.equal(h.state.xpInfo.xp,0);});
test("old response cannot overwrite a newer game award",async()=>{const h=harness({authenticated:true});finish(h);h.reset();finish(h);h.requests[1].resolve({...award,xp_gained:30});await settle();h.requests[0].resolve(award);await settle();assert.equal(h.state.xpInfo.xp,30);assert.equal(h.requests.length,2);});
test("guest game ends without score request",()=>{const h=harness();finish(h);assert.equal(h.state.shareOpen,true);assert.equal(h.requests.length,0);});
test("reset while CPU thinks cancels old move",()=>{const h=harness();h.play(5,0);h.play(4,1);h.render();assert.equal(h.pending,1);h.reset();h.render();h.flush();assert.equal(h.state.board.flat().filter(Boolean).length,24);assert.equal(h.state.turn,"you");});
test("unmount while CPU thinks cancels old move",()=>{const h=harness();h.play(5,0);h.play(4,1);h.render();h.unmount();h.flush();assert.equal(h.afterUnmountWrites,0);});

test("current rejected save retains local result without claiming awards or retrying",async()=>{const h=harness({authenticated:true});finish(h);h.requests[0].reject(new Error("offline"));await settle();assert.equal(h.state.shareOpen,true);assert.equal(h.state.xpInfo.xp,0);assert.equal(h.requests.length,1);});
test("obsolete rejected saves stay silent after reset and exit",async()=>{for(const leave of ["reset","unmount"]){const h=harness({authenticated:true});finish(h);h[leave]();h.requests[0].reject(new Error("offline"));await settle();assert.equal(h.state.shareOpen,false);assert.equal(h.afterUnmountWrites,0);}});
