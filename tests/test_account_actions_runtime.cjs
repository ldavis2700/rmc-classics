const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/context/AuthContext.jsx'), 'utf8');
const start = source.indexOf('  const deleteAccount = async');
const end = source.indexOf('\n  return (', start);
assert(start >= 0 && end > start);
// Actual account-action bodies, fake only transport/storage/UI/native edges.
function harness(token = 'original-token') {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const calls = [];
  const state = { token, user: { id: 'original-user' } };
  const actions = vm.runInNewContext(`${source.slice(start, end)}\n({ deleteAccount, submitScore })`, {
    authAttempt: { current: 0 }, scoreBatch: { current: null },
    localStorage: { getItem: () => state.token, removeItem: () => { state.token = null; calls.push('remove'); } },
    api: { delete: () => { calls.push('request'); return pending; }, post: () => { calls.push('request'); return pending; } },
    setRefreshError: error => { state.refreshError = error; },
    setUser: (user) => { state.user = user; calls.push('user'); },
    suspendIAP: () => calls.push('suspend'),
    submitLeaderboardScore: () => calls.push('leaderboard'),
    formatApiErrorDetail: () => 'Request failed',
  });
  return { state, calls, actions, resolve, reject };
}
const score = { game_id: 'spades', score: 100 };
for (const action of ['deleteAccount', 'submitScore']) {
  for (const token of [null, 'new-token']) {
    test(`${action} delayed completion preserves ${token ? 'new login' : 'logout'}`, async () => {
      const h = harness();
      const pending = h.actions[action](action === 'submitScore' ? score : 'fixture');
      h.state.token = token; h.state.user = token ? { id: 'new-user' } : null;
      h.resolve({ data: { user: { id: 'original-user' }, xp_gained: 20 } });
      const result = await pending;
      assert.equal(result.ok, false);
      assert.match(result.error, /Account changed/);
      assert.equal(h.state.token, token);
      assert.equal(h.state.user?.id || null, token ? 'new-user' : null);
      assert.deepEqual(h.calls, ['request']);
    });
  }
  test(`${action} without a session does not send a request`, async () => {
    const h = harness(null);
    assert.equal((await h.actions[action](score)).ok, false);
    assert.deepEqual(h.calls, []);
  });
  test(`${action} failed request leaves session intact`, async () => {
    const h = harness(); const pending = h.actions[action](score);
    h.reject(new Error('Network failure'));
    assert.equal((await pending).ok, false);
    assert.equal(h.state.token, 'original-token');
    assert.deepEqual(h.calls, ['request']);
  });
}
test('current successful deletion still signs out and suspends purchases', async () => {
  const h = harness(); const pending = h.actions.deleteAccount('fixture');
  h.resolve({}); assert.equal((await pending).ok, true);
  assert.equal(h.state.token, null); assert.equal(h.state.user, null);
  assert.deepEqual(h.calls, ['request', 'remove', 'suspend', 'user']);
});
test('current successful score still updates profile, awards and leaderboard', async () => {
  const h = harness(); const pending = h.actions.submitScore(score);
  h.resolve({ data: { user: { id: 'original-user', xp: 120 }, xp_gained: 20 } });
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(result.xp_gained, 20);
  assert.equal(h.state.user.xp, 120);
  assert.deepEqual(h.calls, ['request', 'user', 'leaderboard']);
});

test('overlapping scores cannot roll profile back when responses arrive out of order', async () => {
  const requests = [], state = { user: { id: 'player', xp: 0 } };
  const actions = vm.runInNewContext(`${source.slice(start, end)}\n({submitScore})`, {
    localStorage: { getItem: () => 'same-token' },
    api: { post: () => new Promise(resolve => requests.push(resolve)) },
    setRefreshError() {}, setUser: user => { state.user = user; },
    submitLeaderboardScore() {}, formatApiErrorDetail() {},
    scoreBatch: { current: null },
    refresh: async () => { state.user = { id: 'player', xp: 40 }; },
  });
  const first = actions.submitScore(score), second = actions.submitScore(score);
  requests[1]({ data: { user: { id: 'player', xp: 40 }, xp_gained: 20 } });
  assert.equal((await second).xp_gained, 20);
  requests[0]({ data: { user: { id: 'player', xp: 20 }, xp_gained: 20 } });
  assert.equal((await first).xp_gained, 20);
  assert.equal(state.user.xp, 40);
});

function overlappingHarness() {
  const posts = [], gets = [], state = { token: 'original', user: { xp: 0 } };
  const refreshStart = source.indexOf('  const refresh = useCallback');
  const refreshEnd = source.indexOf('\n  useEffect(', refreshStart);
  const actions = vm.runInNewContext(`${source.slice(refreshStart, refreshEnd)}\n${source.slice(start, end)}\n({submitScore})`, {
    useCallback: fn => fn, scoreBatch: { current: null },
    localStorage: { getItem: () => state.token },
    api: {
      post: () => new Promise((resolve, reject) => posts.push({resolve, reject})),
      get: () => new Promise((resolve, reject) => gets.push({resolve, reject})),
    },
    setUser: user => { state.user = user; }, setRefreshError: e => { state.error = e; },
    setLoading() {}, configureIAP: async () => {}, suspendIAP() {},
    submitLeaderboardScore() {}, formatApiErrorDetail: () => 'failed',
  });
  return { posts, gets, state, actions };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('overlap reconciles once even when one score request fails', async () => {
  const h = overlappingHarness(), a = h.actions.submitScore(score), b = h.actions.submitScore(score);
  h.posts[0].reject(new Error('offline')); assert.equal((await a).ok, false);
  h.posts[1].resolve({data:{user:{xp:20},xp_gained:20}}); await tick();
  assert.equal(h.gets.length, 1); assert.equal(h.state.user.xp, 0);
  h.gets[0].resolve({data:{user:{xp:20}}}); assert.equal((await b).ok, true);
  assert.equal(h.state.user.xp,20); assert.equal(h.posts.length,2);
});
test('old reconciliation cannot replace a subsequent score batch', async () => {
  const h = overlappingHarness(), a = h.actions.submitScore(score), b = h.actions.submitScore(score);
  h.posts[0].resolve({data:{user:{xp:20}}}); await a;
  h.posts[1].resolve({data:{user:{xp:40}}}); await tick();
  const c = h.actions.submitScore(score);
  h.posts[2].resolve({data:{user:{xp:60}}}); await c;
  h.gets[0].resolve({data:{user:{xp:40}}}); await b;
  assert.equal(h.state.user.xp,60);
});
test('failed reconciliation preserves existing profile and surfaces retry state', async () => {
  const h = overlappingHarness(), a = h.actions.submitScore(score), b = h.actions.submitScore(score);
  h.posts[0].resolve({data:{user:{xp:20},xp_gained:20}}); await a;
  h.posts[1].resolve({data:{user:{xp:40},xp_gained:20}}); await tick();
  h.gets[0].reject(new Error('offline'));
  assert.equal((await b).xp_gained,20); assert.equal(h.state.user.xp,0);
  assert.match(h.state.error,/Unable to refresh/); assert.equal(h.posts.length,2);
});
test('account change during reconciliation preserves the new account', async () => {
  const h = overlappingHarness(), a = h.actions.submitScore(score), b = h.actions.submitScore(score);
  h.posts[0].resolve({data:{user:{xp:20}}}); await a;
  h.posts[1].resolve({data:{user:{xp:40}}}); await tick();
  h.state.token='new';h.state.user={xp:99};
  h.gets[0].resolve({data:{user:{xp:40}}});await b;
  assert.equal(h.state.user.xp,99);
});
