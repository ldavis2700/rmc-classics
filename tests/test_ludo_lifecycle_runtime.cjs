const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/games/Ludo.jsx'), 'utf8');
const start = source.indexOf('export default function Ludo() {');
const end = source.indexOf('  // Build track', start);
assert(start > 0 && end > start);
const prefix = source.slice(source.indexOf('const TRACK_LEN'), start);
// Execute the actual component callbacks/effects with controlled dice and timers.
// Near-finish states are constructed fixtures, not browser or device acceptance.
function harness(authenticated = true) {
  const slots = [], effects = [], callbacks = [], timers = new Map(), requests = [];
  let cursor = 0, ec = 0, cc = 0, dirty = false, queued = [], tid = 0, mounted = true, writes = 0, die = 1, loading = false;
  let user = authenticated ? { id: 'test-player' } : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
  const run = vm.runInNewContext(prefix + '\n(function(){' +
    source.slice(start + 'export default function Ludo() {'.length, end) +
    '\nreturn {rollAndPick,moveYou,reset,you,cpu,turn,busy,dice,finished,shareOpen,xpInfo,selectable};})', {
    useAuth: () => ({ user, submitScore, loading }),
    Math: { floor: Math.floor, random: () => (die - 0.5) / 6 },
    useRef: value => { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
    useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], next => { if (!mounted) writes++; const v = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(v, slots[i])) { slots[i] = v; dirty = true; } }]; },
    useEffect: (fn, deps) => { const i = ec++, old = effects[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) queued.push(() => {
        old?.dispose?.(); effects[i] = { deps, dispose: fn() }; }); },
    useCallback: (fn, deps) => { const i = cc++, old = callbacks[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) callbacks[i] = { deps, fn };
      return callbacks[i].fn; },
    setTimeout: fn => { const id = ++tid; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    sfx: { dice() {}, drop() {}, win() {}, lose() {} }, toast: { success() {} },
  });
  function render() { for (let i = 0; i < 30; i++) { cursor = ec = cc = 0; dirty = false; queued = [];
    const result = run(); queued.forEach(f => f()); if (!dirty) return result; } throw Error('effects did not settle'); }
  render();
  return { render, requests, timers, get writes() { return writes; },
    roll(n) { die = n; render().rollAndPick(); return render(); },
    tick(n = 1) { die = n; const pending = [...timers.values()]; timers.clear(); pending.forEach(f => f()); return render(); },
    reset() { render().reset(); return render(); },
    unmount() { effects.forEach(e => e.dispose?.()); mounted = false; },
    position(you, cpu = [-1, -1]) { slots[0] = you.map(pos => ({ pos })); slots[1] = cpu.map(pos => ({ pos })); return render(); },
    authLoading(v) { loading = v; return render(); },
    refreshUser() { user = { ...user, xp: 20 }; return render(); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const award = { ok: true, xp_gained: 20, challenge_completed: true, newly_unlocked_badges: ['test'] };
function finish(h) { h.position([31, 32]); h.roll(1); }

test('current win saves once even when account data refreshes during the save', async () => {
  const h = harness(); finish(h); h.refreshUser(); assert.equal(h.requests.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].payload)), { game_id: 'ludo', won: true, score: 1 });
  h.requests[0].resolve(award); await settle(); assert.equal(h.render().shareOpen, true); assert.equal(h.render().xpInfo.xp, 20);
});
test('reset clears result and rewards', async () => {
  const h = harness(); finish(h); h.requests[0].resolve(award); await settle(); h.render();
  const r = h.reset(); assert.equal(r.shareOpen, false); assert.equal(r.xpInfo.xp, 0);
  assert.equal(r.xpInfo.done, false); assert.equal(r.xpInfo.badges.length, 0);
});
test('late success cannot reopen reset or write to an unmounted game', async () => {
  for (const action of ['reset', 'unmount']) { const h = harness(); finish(h); h[action]();
    h.requests[0].resolve(award); await settle(); assert.equal(h.writes, 0);
    if (action === 'reset') { assert.equal(h.render().shareOpen, false); assert.equal(h.render().xpInfo.xp, 0); } }
});
test('reversed score responses preserve the current round award', async () => {
  const h = harness(); finish(h); h.reset(); finish(h);
  h.requests[1].resolve({ ...award, xp_gained: 30 }); await settle(); h.render();
  h.requests[0].resolve(award); await settle(); assert.equal(h.render().xpInfo.xp, 30); assert.equal(h.requests.length, 2);
});
test('unsuccessful save preserves local win without claiming rewards', async () => {
  const h = harness(); finish(h); h.requests[0].resolve({ ok: false, ...{ xp_gained: 999, challenge_completed: true } });
  await settle(); assert.equal(h.render().shareOpen, true); assert.equal(h.render().xpInfo.xp, 0); assert.equal(h.requests.length, 1);
});
test('rejected save preserves local result, while obsolete rejections stay silent', async () => {
  for (const action of [null, 'reset', 'unmount']) {
    const h = harness(); finish(h); if (action) h[action]();
    h.requests[0].reject(Error('offline')); await settle(); assert.equal(h.writes, 0);
    if (action !== 'unmount') {
      assert.equal(h.render().shareOpen, action === null); assert.equal(h.render().xpInfo.xp, 0);
      assert.equal(h.requests.length, 1);
    }
  }
});
test('guest result opens without score requests', () => {
  const h = harness(false); finish(h); assert.equal(h.render().shareOpen, true); assert.equal(h.requests.length, 0);
});
test('scoring waits for saved-login restoration', () => {
  const h = harness(); h.authLoading(true); finish(h); assert.equal(h.requests.length, 0); assert.equal(h.render().shareOpen, false);
  h.authLoading(false); assert.equal(h.requests.length, 1);
});
test('reset and exit invalidate retained CPU callbacks', () => {
  for (const action of ['reset', 'unmount']) { const h = harness(); h.roll(1); assert.equal(h.timers.size, 1);
    const old = [...h.timers.values()][0]; h[action](); assert.equal(h.timers.size, 0); old();
    assert.equal(h.writes, 0); if (action === 'reset') assert.equal(h.render().dice, null); }
});
test('normal CPU release, bonus roll, capture and exact finish retain rules', () => {
  const h = harness(false); h.roll(1); let r = h.tick(6); assert.equal(r.cpu[0].pos, 0); assert.equal(r.turn, 'cpu');
  assert.equal(h.timers.size, 1); r = h.tick(1); assert.equal(r.cpu[0].pos, 1); assert.equal(r.turn, 'you');
  h.position([18, 32], [1, 32]); h.roll(1); r = h.tick(2); assert.equal(r.you[0].pos, -1); assert.equal(r.cpu[0].pos, 3);
  h.position([32, 31], [32, 31]); h.roll(2); r = h.tick(1); assert.equal(r.finished, 'cpu'); assert.equal(r.shareOpen, true);
});
test('player must release on six and choose a token before rolling again', () => {
  const h = harness(false); let r = h.roll(6); assert.equal(r.selectable.length, 2);
  r = h.roll(2); assert.equal(r.dice, 6); assert.equal(r.selectable.length, 2);
  r.moveYou(0, 6); r = h.render(); assert.equal(r.you[0].pos, 0); assert.equal(r.turn, 'you');
});
test('the rendered perimeter covers all 32 track positions exactly once', () => {
  const block = source.slice(source.indexOf('const row ='), source.indexOf('const tokens = trackIdx'));
  const cells = /Array.from\(\{ length: ([^}]+)\}\)\.map/.exec(source.slice(source.indexOf('{/* Track around perimeter */}')));
  assert(cells, 'Actual board cell count is available');
  const renderIndices = vm.runInNewContext(prefix + '\n(function(){return Array.from({length: ' + cells[1] +
    '}, (_, i) => {' + block + '\nreturn trackIdx;}).filter(i => i !== null);})');
  const indices = Array.from(renderIndices());
  assert.equal(indices.length, 32); assert.equal(new Set(indices).size, 32);
  assert.deepEqual(indices.sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i));
});
