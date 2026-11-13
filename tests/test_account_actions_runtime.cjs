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
    authAttempt: { current: 0 },
    localStorage: { getItem: () => state.token, removeItem: () => { state.token = null; calls.push('remove'); } },
    api: { delete: () => { calls.push('request'); return pending; }, post: () => { calls.push('request'); return pending; } },
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
