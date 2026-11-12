const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/context/AuthContext.jsx'), 'utf8');
const start = source.indexOf('  const login = async');
const end = source.indexOf('  const deleteAccount = async', start);
assert(start >= 0 && end > start);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness(provider) {
  const requests = [], configured = [];
  const state = { token: null, user: null };
  const actions = vm.runInNewContext(`${source.slice(start, end)}\n({login,register,logout})`, {
    authAttempt: { current: 0 },
    api: { post: () => { const gate = deferred(); requests.push(gate); return gate.promise; } },
    localStorage: { setItem: (_, token) => { state.token = token; }, removeItem: () => { state.token = null; } },
    setUser: user => { state.user = user; },
    configureIAP: async id => { configured.push(id); if (provider) await provider.promise; },
    suspendIAP: () => configured.push('suspend'),
    formatApiErrorDetail: () => 'Failed',
  });
  return { actions, state, requests, configured };
}
const response = id => ({ data: { token: `${id}-token`, user: { id } } });
for (const first of ['login','register']) {
  for (const second of ['login','register']) {
    test(`${first} response cannot overwrite newer ${second}`, async () => {
      const h = harness();
      const older = h.actions[first]('old@example.invalid', 'fixture', 'name');
      const newer = h.actions[second]('new@example.invalid', 'fixture', 'name');
      h.requests[1].resolve(response('new')); assert.equal((await newer).ok, true);
      h.requests[0].resolve(response('old')); assert.equal((await older).ok, false);
      assert.equal(h.state.token, 'new-token'); assert.equal(h.state.user.id, 'new');
      assert.deepEqual(h.configured, ['new']);
    });
  }
  test(`${first} response after logout cannot restore a session`, async () => {
    const h = harness(); const pending = h.actions[first]('fixture');
    h.actions.logout(); h.requests[0].resolve(response('old'));
    assert.equal((await pending).ok, false);
    assert.equal(h.state.token, null); assert.equal(h.state.user, null);
    assert.deepEqual(h.configured, ['suspend']);
  });
  test(`${first} cannot report success after logout during provider setup`, async () => {
    const gate = deferred(); const h = harness(gate);
    const pending = h.actions[first]('fixture'); h.requests[0].resolve(response('old'));
    await new Promise(r => setImmediate(r));
    assert.equal(h.state.token, 'old-token');
    h.actions.logout(); gate.resolve();
    assert.equal((await pending).ok, false);
    assert.equal(h.state.token, null); assert.equal(h.state.user, null);
  });
}
