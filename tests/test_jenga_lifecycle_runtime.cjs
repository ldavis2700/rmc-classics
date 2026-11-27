const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/pages/games/Jenga.jsx'), 'utf8');
const start = source.indexOf('export default function Jenga() {');
const end = source.indexOf('  const meta = GAME_MAP.jenga;', start);
assert(start > 0 && end > start);
// Run actual component callbacks; Matter is a resource/event spy, not a physics simulation.
function harness(authenticated = true) {
  const slots = [], effects = [], callbacks = [], timers = new Map(), requests = [], engines = [], runners = [];
  let cursor = 0, ec = 0, cc = 0, dirty = false, queued = [], timerId = 0, mounted = true, afterUnmountWrites = 0;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 700 }) };
  const user = authenticated ? { id: 'disposable-player' } : null;
  const submitScore = payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
  const Matter = {
    Engine: { create() { const e = { world: { gravity: {}, bodies: [] } }; engines.push(e); return e; }, clear(e) { e.cleared = true; } },
    World: { add(w, bodies) { w.bodies.push(...(Array.isArray(bodies) ? bodies : [bodies])); }, clear(w) { w.bodies = []; } },
    Bodies: { rectangle(x, y, width, height, options) { return { ...options, position: { x, y }, width, height }; } },
    Render: { create: options => ({ ...options }), run(r) { r.running = true; }, stop(r) { r.running = false; } },
    Runner: { create() { const r = { running: false }; runners.push(r); return r; }, run(r) { r.running = true; }, stop(r) { r.running = false; } },
    Events: { on(e, name, fn) { e[name] = fn; }, off(e) { delete e.afterUpdate; } },
    Query: { point: bodies => bodies.slice(0, 1) },
    Body: { setStatic() {}, applyForce() {} },
  };
  const run = vm.runInNewContext(source.slice(source.indexOf('const ROWS'), start) +
    '\n(function(){' + source.slice(start + 'export default function Jenga() {'.length, end) +
    '\nreturn {resetGame,onCanvasClick,pullBlock,score,busy,gameOver,shareOpen,xpInfo};})', {
    Matter, window: { devicePixelRatio: 1 }, useAuth: () => ({ user, submitScore }),
    useRef: value => { const i = cursor++; return slots[i] || (slots[i] = { current: i === 0 ? canvas : value }); },
    useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => {
      if (!mounted) afterUnmountWrites++; const v = typeof next === 'function' ? next(slots[i]) : next;
      if (!Object.is(v, slots[i])) { slots[i] = v; dirty = true; }
    }]; },
    useCallback: (fn, deps) => { const i = cc++, old = callbacks[i]; if (!old || deps.some((v,j) => !Object.is(v,old.deps[j]))) callbacks[i] = { fn, deps }; return callbacks[i].fn; },
    useEffect: (fn, deps) => { const i = ec++, old = effects[i]; if (!old || deps.some((v,j) => !Object.is(v,old.deps[j]))) queued.push(() => { old?.dispose?.(); effects[i] = { deps, dispose: fn() }; }); },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    sfx: { click() {}, win() {}, lose() {} }, haptic() {}, toast: { error() {} },
  });
  function render() { for (let i=0;i<30;i++) { cursor=ec=cc=0; queued=[]; dirty=false; const r=run(); queued.forEach(f=>f()); if(!dirty)return r; } throw Error('Non-settling effects'); }
  render();
  return { render, requests, runners, engines, timers,
    get afterUnmountWrites() { return afterUnmountWrites; },
    reset() { render().resetGame(); return render(); },
    pull() { render().onCanvasClick({clientX:1,clientY:1}); render().pullBlock(); return render(); },
    tick() { const pending=[...timers.values()];timers.clear();pending.forEach(f=>f());return render(); },
    collapse() { const e=engines.at(-1); e.world.bodies.filter(b=>b.label.startsWith('block-')&&!b.removed).slice(0,3).forEach(b=>b.position.y+=100);e.afterUpdate();return render(); },
    unmount() { effects.forEach(e=>e.dispose?.());mounted=false; },
  };
}
const settle = () => new Promise(resolve=>setImmediate(resolve));
const award = {ok:true,xp_gained:20,challenge_completed:true,newly_unlocked_badges:['test']};
test('reset stops previous physics runner and leaves exactly one active runner',()=>{
  const h=harness();for(let i=0;i<3;i++)h.reset();
  assert.equal(h.runners.filter(r=>r.running).length,1);
  h.unmount();assert.equal(h.runners.filter(r=>r.running).length,0);
});
test('reset cancels pending pull so a fresh game receives no old score',()=>{
  const h=harness();h.pull();h.reset();assert.equal(h.timers.size,0);
  assert.equal(h.tick().score,0);assert.equal(h.render().busy,false);
});
test('unmount cancels pending pull and prevents state writes',()=>{
  const h=harness();h.pull();h.unmount();assert.equal(h.timers.size,0);
  for(const fn of h.timers.values())fn();assert.equal(h.afterUnmountWrites,0);
});
test('collapse submits correct score exactly once',async()=>{
  const h=harness();h.pull();h.tick();h.collapse();h.render();
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.game_id,'jenga');
  assert.equal(h.requests[0].payload.score,1);assert.equal(h.requests[0].payload.won,false);
  h.requests[0].resolve(award);await settle();assert.equal(h.render().shareOpen,true);
});
test('obsolete score response stays silent after reset or unmount',async()=>{
  for(const leave of ['reset','unmount']){const h=harness();h.collapse();h[leave]();
    h.requests[0].resolve(award);await settle();
    assert.equal(h.afterUnmountWrites,0);
    if(leave==='reset'){assert.equal(h.render().shareOpen,false);assert.equal(h.render().xpInfo.xp,0);}
  }
});
test('reset clears open result and all awards',async()=>{
  const h=harness();h.collapse();h.requests[0].resolve(award);await settle();
  const r=h.reset();assert.equal(r.shareOpen,false);assert.equal(r.xpInfo.xp,0);
  assert.equal(r.xpInfo.done,false);assert.equal(r.xpInfo.badges.length,0);
});
test('older score cannot replace newer round awards',async()=>{
  const h=harness();h.collapse();h.reset();h.collapse();
  h.requests[1].resolve({...award,xp_gained:30});await settle();
  h.requests[0].resolve(award);await settle();assert.equal(h.render().xpInfo.xp,30);
});
test('guest collapse opens local result without score request',()=>{
  const h=harness(false);h.collapse();assert.equal(h.requests.length,0);assert.equal(h.render().shareOpen,true);
});
test('failed score saving preserves local result without inventing rewards',async()=>{
  for(const rejected of [false,true]){const h=harness();h.collapse();
    if(rejected)h.requests[0].reject(new Error('offline'));else h.requests[0].resolve({ok:false});
    await settle();const r=h.render();assert.equal(r.shareOpen,true);assert.equal(r.xpInfo.xp,0);
    assert.equal(r.xpInfo.done,false);assert.equal(r.xpInfo.badges.length,0);
  }
});
test('obsolete rejected score cannot reopen reset results or write after unmount',async()=>{
  for(const leave of ['reset','unmount']){const h=harness();h.collapse();h[leave]();
    h.requests[0].reject(new Error('offline'));await settle();assert.equal(h.afterUnmountWrites,0);
    if(leave==='reset')assert.equal(h.render().shareOpen,false);
  }
});
test('retired engine detector cannot finish a new round',()=>{
  const h=harness();const old=h.engines.at(-1),detector=old.afterUpdate;h.reset();
  assert.equal(old.afterUpdate,undefined);
  h.engines.at(-1).world.bodies.filter(b=>b.label.startsWith('block-')).slice(0,3).forEach(b=>b.position.y+=100);
  detector();assert.equal(h.render().gameOver,false);assert.equal(h.requests.length,0);
});
test('collapse during pending pull does not award that pull',()=>{
  const h=harness();h.pull();h.collapse();h.tick();
  assert.equal(h.render().score,0);assert.equal(h.render().busy,false);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.score,0);
});
