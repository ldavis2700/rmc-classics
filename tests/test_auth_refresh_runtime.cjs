const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/context/AuthContext.jsx'), 'utf8');
// Run the actual callback, with network/storage/UI boundaries replaced. No
// JSX transformation, React rendering or native provider behavior is claimed.
const start = source.indexOf('  const refresh = useCallback(');
const end = source.indexOf('\n  useEffect(', start);
assert(start >= 0 && end > start);
const callback = source.slice(start, end);
function harness(token = 'old-token') {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const calls = [];
  const state = { token, user: null, loading: true };
  const context = {
    useCallback: (fn) => fn,
    localStorage: { getItem: () => state.token, removeItem: () => { state.token = null; calls.push('remove'); } },
    api: { get: (url) => { assert.equal(url, '/auth/me'); return pending; } },
    setUser: (user) => { state.user = user; calls.push('user'); },
    setLoading: (loading) => { state.loading = loading; },
    configureIAP: async (id) => calls.push(`configure:${id}`),
    suspendIAP: () => calls.push('suspend'),
  };
  const refresh = vm.runInNewContext(`${callback}\nrefresh`, context);
  return { state, calls, refresh, resolve, reject };
}
for (const outcome of ['success', 'failure']) {
  for (const nextToken of [null, 'new-token']) {
    test(`stale refresh ${outcome} cannot overwrite ${nextToken ? 'new login' : 'logout'}`, async () => {
      const h = harness();
      const pending = h.refresh();
      h.state.token = nextToken;
      h.state.user = nextToken ? { id: 'new-user' } : null;
      h.state.loading = false;
      if (outcome === 'success') h.resolve({ data: { user: { id: 'old-user' } } });
      else h.reject(new Error('Old request failed'));
      await pending;
      assert.equal(h.state.token, nextToken);
      assert.equal(h.state.user?.id || null, nextToken ? 'new-user' : null);
      assert.deepEqual(h.calls, []);
    });
  }
}
test('current refresh still loads user and configures purchases', async () => {
  const h = harness(); const pending = h.refresh();
  h.resolve({ data: { user: { id: 'current' } } }); await pending;
  assert.equal(h.state.user.id, 'current');
  assert.equal(h.state.loading, false);
  assert.deepEqual(h.calls, ['user', 'configure:current']);
});
test('current refresh failure still clears invalid session', async () => {
  const h = harness(); const pending = h.refresh();
  h.reject(new Error('Unauthorized')); await pending;
  assert.equal(h.state.token, null); assert.equal(h.state.user, null);
  assert.equal(h.state.loading, false);
  assert.deepEqual(h.calls, ['remove', 'suspend', 'user']);
});
