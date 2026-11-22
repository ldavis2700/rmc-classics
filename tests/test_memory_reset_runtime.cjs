const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/games/MemoryMatch.jsx"), "utf8");
const start = source.indexOf("export default function MemoryMatch() {");
const end = source.indexOf("\n  return (", start);
assert(start >= 0 && end > start);
function harness() {
  const slots = [], timers = new Map(), cleanup = [];
  let cursor = 0, mounted = false, nextTimer = 0, matches = 0;
  const deck = () => ["A", "A", "B", "B"].map((symbol, id) => ({ id, symbol, matched: false }));
  const run = vm.runInNewContext("(function MemoryMatch() {" + source.slice(start + "export default function MemoryMatch() {".length, end) + "\nreturn {handleFlip, reset}; })", {
    makeDeck: deck,
    useAuth: () => ({ user: null }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useMemo: fn => fn(),
    useEffect: fn => { if (!mounted) { const dispose = fn(); if (dispose) cleanup.push(dispose); } },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    sfx: { flip() {}, match() { matches++; }, win() {} }, toast: { success() {} },
  });
  const render = () => { cursor = 0; const actions = run(); mounted = true; return actions; };
  render();
  return {
    flip: index => render().handleFlip(index), reset: () => render().reset(),
    flush: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    unmount: () => cleanup.forEach(fn => fn()),
    get state() { return { deck: slots[0], flipped: slots[1], moves: slots[2], locked: slots[3] }; },
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
