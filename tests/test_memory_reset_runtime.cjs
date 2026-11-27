const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/games/MemoryMatch.jsx"), "utf8");
const start = source.indexOf("export default function MemoryMatch() {");
const end = source.indexOf("\n  return (", start);
assert(start >= 0 && end > start);
function harness({ authenticated = false } = {}) {
  const slots = [], timers = new Map(), effects = [], requests = [];
  const user = authenticated ? { id: 'test-player' } : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
  let effectCursor = 0, queuedEffects = [], afterUnmountWrites = 0;
  let cursor = 0, mounted = false, nextTimer = 0, matches = 0;
  const deck = () => ["A", "A", "B", "B"].map((symbol, id) => ({ id, symbol, matched: false }));
  const run = vm.runInNewContext("(function MemoryMatch() {" + source.slice(start + "export default function MemoryMatch() {".length, end) + "\nreturn {handleFlip, reset}; })", {
    makeDeck: deck,
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
    sfx: { flip() {}, match() { matches++; }, win() {} }, toast: { success() {} },
  });
  const render = () => {
    cursor = 0; effectCursor = 0; queuedEffects = [];
    const actions = run(); mounted = true;
    queuedEffects.forEach(fn => fn());
    return actions;
  };
  render();
  return {
    flip: index => render().handleFlip(index), reset: () => render().reset(),
    flush: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    unmount: () => { effects.forEach(effect => effect.dispose?.()); mounted = false; },
    render, requests,
    get afterUnmountWrites() { return afterUnmountWrites; },
    get state() { return { deck: slots[0], flipped: slots[1], moves: slots[2], locked: slots[3], shareOpen: slots[5], xpInfo: slots[6] }; },
    get pending() { return timers.size; }, get matches() { return matches; },
  };
}
test("reset during matching animation cannot mark a new deck matched", () => {
  const h = harness(); h.flip(0); h.flip(1); assert.equal(h.pending, 1);
  h.reset(); h.flush();
  assert.equal(h.state.deck.filter(c => c.matched).length, 0);
  assert.equal(h.state.moves, 0); assert.equal(h.matches, 0);
});
test("old mismatch cannot hide a newly flipped card after reset", () => {
  const h = harness(); h.flip(0); h.flip(2); h.reset(); h.flip(0); h.flush();
  assert.equal(h.state.flipped.length, 1); assert.equal(h.state.flipped[0], 0);
});
test("unmount cancels pending pair resolution", () => {
  const h = harness(); h.flip(0); h.flip(1); h.unmount(); h.flush();
  assert.equal(h.pending, 0); assert.equal(h.matches, 0);
});
test("pair resolution blocks a third card and then unlocks", () => {
  const h = harness(); h.flip(0); h.flip(1); h.flip(2);
  assert.equal(h.state.flipped.length, 2); assert.equal(h.state.locked, true);
  h.flush(); assert.equal(h.state.deck.filter(c => c.matched).length, 2);
  assert.equal(h.state.moves, 1); assert.equal(h.state.locked, false);
  h.flip(2); assert.equal(h.state.flipped[0], 2);
});
test("normal mismatch clears both cards and unlocks", () => {
  const h = harness(); h.flip(0); h.flip(2); h.flush();
  assert.equal(h.state.flipped.length, 0); assert.equal(h.state.locked, false);
  assert.equal(h.state.moves, 1); assert.equal(h.state.deck.filter(c => c.matched).length, 0);
});

function completeRound(h) {
  h.flip(0); h.flip(1); h.flush();
  h.flip(2); h.flip(3); h.flush(); h.render(); h.render();
}
const award = { ok: true, xp_gained: 20, challenge_completed: true, newly_unlocked_badges: ["memory"] };
const settle = () => new Promise(resolve => setImmediate(resolve));
test("current round accepts its score response exactly once", async () => {
  const h = harness({ authenticated: true }); completeRound(h);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].payload.game_id, "memory");
  assert.equal(h.requests[0].payload.score, 2);
  h.requests[0].resolve(award); await settle();
  assert.equal(h.state.shareOpen, true); assert.equal(h.state.xpInfo.xp, 20);
});
test("late score response cannot reopen results after reset", async () => {
  const h = harness({ authenticated: true }); completeRound(h); h.reset(); h.render();
  h.requests[0].resolve(award); await settle();
  assert.equal(h.state.shareOpen, false); assert.equal(h.state.xpInfo.xp, 0);
  assert.equal(h.requests.length, 1);
});
test("late score response cannot write UI state after unmount", async () => {
  const h = harness({ authenticated: true }); completeRound(h); h.unmount();
  h.requests[0].resolve(award); await settle();
  assert.equal(h.afterUnmountWrites, 0);
});
test("reset clears the prior round award before another result", async () => {
  const h = harness({ authenticated: true }); completeRound(h);
  h.requests[0].resolve(award); await settle(); h.reset(); completeRound(h);
  h.requests[1].resolve({ ok: false }); await settle();
  assert.equal(h.state.shareOpen, true); assert.equal(h.state.xpInfo.xp, 0);
});
test("out-of-order old response cannot replace the new round award", async () => {
  const h = harness({ authenticated: true }); completeRound(h); h.reset(); completeRound(h);
  h.requests[1].resolve({ ...award, xp_gained: 30 }); await settle();
  h.requests[0].resolve(award); await settle();
  assert.equal(h.state.xpInfo.xp, 30); assert.equal(h.requests.length, 2);
});

test("failed score save preserves local result without claiming an award or retrying", async () => {
  const h = harness({ authenticated: true }); completeRound(h);
  h.requests[0].reject(new Error("offline")); await settle();
  assert.equal(h.state.shareOpen, true); assert.equal(h.state.xpInfo.xp, 0);
  assert.equal(h.requests.length, 1);
});
test("failed old score save stays silent after reset or unmount", async () => {
  for (const leave of ["reset", "unmount"]) {
    const h = harness({ authenticated: true }); completeRound(h); h[leave]();
    h.requests[0].reject(new Error("offline")); await settle();
    assert.equal(h.state.shareOpen, false); assert.equal(h.afterUnmountWrites, 0);
  }
});
test("guest completion opens a local result without submitting a score", () => {
  const h = harness(); completeRound(h);
  assert.equal(h.state.shareOpen, true); assert.equal(h.requests.length, 0);
});
