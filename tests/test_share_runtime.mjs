import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Execute the actual application module. Only browser capabilities are faked;
// no Capacitor/plugin behavior or signed-device acceptance is asserted here.
const source = await readFile(new URL('../frontend/src/lib/native.js', import.meta.url), 'utf8');
const { share } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const payload = { title: 'Spades result', text: 'Play with me', url: 'https://rmcclassics.com/play/spades?ref=player-share' };
async function withNavigator(value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    if (value === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
    await run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
}

test('successful Web Share sends the exact payload and does not copy', async () => {
  const calls = [];
  await withNavigator({ share: async (data) => calls.push(data), clipboard: {
    writeText: async () => assert.fail('Successful sharing must not also copy'),
  } }, async () => assert.equal(await share(payload), true));
  assert.deepEqual(calls, [payload]);
});

test('cancelling Web Share never falls back to copying', async () => {
  for (const error of [new DOMException('User dismissed share sheet', 'AbortError'), new Error('Share CANCELED')]) {
    await withNavigator({ share: async () => { throw error; }, clipboard: {
      writeText: async () => assert.fail('Cancellation must not write to the clipboard'),
    } }, async () => assert.equal(await share(payload), null));
  }
});

test('denied Web Share falls back to the exact text and public URL', async () => {
  const copied = [];
  await withNavigator({ share: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
    clipboard: { writeText: async (text) => copied.push(text) },
  }, async () => assert.equal(await share(payload), true));
  assert.deepEqual(copied, [`${payload.text} ${payload.url}`]);
});

test('clipboard alone works when Web Share is unavailable', async () => {
  const copied = [];
  await withNavigator({ clipboard: { writeText: async (text) => copied.push(text) } }, async () => {
    assert.equal(await share({ url: payload.url }), true);
  });
  assert.deepEqual(copied, [payload.url]);
});

test('failure of both sharing and clipboard returns false', async () => {
  let attempts = 0;
  await withNavigator({ share: async () => { throw new Error('Unavailable'); }, clipboard: {
    writeText: async () => { attempts += 1; throw new Error('Clipboard denied'); },
  } }, async () => assert.equal(await share(payload), false));
  assert.equal(attempts, 1);
});

test('missing browser capabilities fail safely without exceptions', async () => {
  for (const navigator of [undefined, {}, { clipboard: {} }]) {
    await withNavigator(navigator, async () => assert.equal(await share(payload), false));
  }
});
