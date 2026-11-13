// Execute the real ESM module with fake store/network boundaries. Never charge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/iap.js'), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function harness(overrides = {}) {
  const calls = [];
  const store = Object.fromEntries(['configure', 'logIn', 'purchaseStoreProduct', 'restorePurchases'].map(
    (name) => [name, async (args) => { calls.push([name, args]); }],
  ));
  store.getProducts = async () => ({ products: [{ identifier: 'rmc.freeze.pack5' }] });
  Object.assign(store, overrides);
  const api = { post: async (url, body) => {
    calls.push(['sync', url, body]);
    return { data: { freezes_available: 5, credited: 5 } };
  } };
  const context = vm.createContext({
    process: { env: { REACT_APP_REVENUECAT_IOS_KEY: 'appl_test_only_not_a_real_key' } },
    window: { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } },
    console: { warn() {} },
  });
  const provider = new vm.SyntheticModule(['Purchases', 'PRODUCT_CATEGORY'], function () {
    this.setExport('Purchases', store);
    this.setExport('PRODUCT_CATEGORY', { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' });
  }, { context });
  const apiModule = new vm.SyntheticModule(['default'], function () {
    this.setExport('default', api);
  }, { context });
  const module = new vm.SourceTextModule(source, {
    context,
    importModuleDynamically: async (specifier) => {
      assert.equal(specifier, '@revenuecat/purchases-capacitor');
      if (provider.status === 'unlinked') await provider.link(() => {});
      if (provider.status === 'linked') await provider.evaluate();
      return provider;
    },
  });
  await module.link((specifier) => { assert.equal(specifier, '@/lib/api'); return apiModule; });
  await module.evaluate();
  return { iap: module.namespace, calls, api, store };
}

test('invalid identities never configure the store or enable purchases', async () => {
  const { iap, calls } = await harness();
  for (const id of ['', null, ' account', 'account ', 'a b', 'a\u200bb', 'e\u0301', 'x'.repeat(257)]) {
    assert.equal(await iap.configureIAP(id), false);
    assert.equal((await iap.purchaseFreezePack()).ok, false);
    assert.equal((await iap.restorePurchases()).ok, false);
  }
  assert.equal(calls.length, 0);
});

test('account switches use provider login, never anonymous identity or a second configure', async () => {
  const { iap, calls } = await harness();
  assert.equal(await iap.configureIAP('account-A'), true);
  assert.equal(await iap.configureIAP('account-B'), true);
  assert.deepEqual(calls.map(([name, args]) => [name, args.appUserID]), [
    ['configure', 'account-A'], ['logIn', 'account-B'],
  ]);
});

test('overlapping configurations serialize and keep the newest account', async () => {
  const gate = deferred();
  const entered = deferred();
  const { iap, calls } = await harness({ configure: async (args) => {
    calls.push(['configure', args]); entered.resolve(); await gate.promise;
  } });
  const first = iap.configureIAP('account-A');
  await entered.promise;
  const second = iap.configureIAP('account-B');
  gate.resolve();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(calls.map(([name, args]) => [name, args.appUserID]), [
    ['configure', 'account-A'], ['logIn', 'account-B'],
  ]);
});

test('switch during product lookup prevents starting a purchase', async () => {
  const gate = deferred();
  const { iap, calls } = await harness({ getProducts: () => gate.promise });
  await iap.configureIAP('account-A');
  const purchase = iap.purchaseFreezePack();
  await tick();
  await iap.configureIAP('account-B');
  gate.resolve({ products: [{ identifier: 'rmc.freeze.pack5' }] });
  assert.equal((await purchase).ok, false);
  assert(!calls.some(([name]) => ['purchaseStoreProduct', 'sync'].includes(name)));
});

test('switch during payment leaves credit pending without syncing through the next account', async () => {
  const gate = deferred();
  const entered = deferred();
  const { iap, calls } = await harness({ purchaseStoreProduct: async () => {
    entered.resolve(); await gate.promise;
  } });
  await iap.configureIAP('account-A');
  const purchase = iap.purchaseFreezePack();
  await entered.promise;
  await iap.configureIAP('account-B');
  gate.resolve();
  const result = await purchase;
  assert.equal(result.ok, true);
  assert.equal(result.pending, true);
  assert.equal(result.credited, 0);
  assert(!calls.some(([name]) => name === 'sync'));
});

test('logout during credit sync never displays the old account balance', async () => {
  const gate = deferred();
  const entered = deferred();
  const { iap, api } = await harness();
  api.post = () => { entered.resolve(); return gate.promise; };
  await iap.configureIAP('account-A');
  const purchase = iap.purchaseFreezePack();
  await entered.promise;
  iap.suspendIAP();
  gate.resolve({ data: { freezes_available: 999, credited: 5 } });
  const result = await purchase;
  assert.equal(result.pending, true);
  assert.equal(result.freezes_available, undefined);
});

test('switch during restore prevents syncing to the next account', async () => {
  const gate = deferred();
  const entered = deferred();
  const { iap, calls } = await harness({ restorePurchases: async () => {
    entered.resolve(); await gate.promise;
  } });
  await iap.configureIAP('account-A');
  const restore = iap.restorePurchases();
  await entered.promise;
  await iap.configureIAP('account-B');
  gate.resolve();
  assert.equal((await restore).ok, false);
  assert(!calls.some(([name]) => name === 'sync'));
});

test('matching product and valid balance complete one store purchase and one credit sync', async () => {
  const { iap, calls } = await harness();
  await iap.configureIAP('account-A');
  const result = await iap.purchaseFreezePack();
  assert.equal(result.ok, true);
  assert.equal(result.freezes_available, 5);
  assert.equal(result.credited, 5);
  assert.deepEqual(calls.map(([name]) => name), ['configure', 'purchaseStoreProduct', 'sync']);
});
