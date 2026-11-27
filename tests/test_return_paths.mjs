import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Execute the application's actual module without a transpiler or copied logic.
const source = await readFile(new URL('../frontend/src/lib/routes.js', import.meta.url), 'utf8');
const { safeReturnPath, publicGameShareUrl } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('keeps game invitation paths, queries and fragments intact', () => {
  for (const path of ['/', '/profile', '/battle/abc?ref=player-share#join',
    '/play/spades', '/play/dominoes?next=https://example.invalid', '/battle/a%2Fb']) {
    assert.equal(safeReturnPath(path), path);
  }
});

test('rejects external, scheme-relative and browser-normalized authority paths', () => {
  for (const path of [null, undefined, 42, {}, '', 'profile', 'https://example.invalid',
    '//example.invalid', '/\\example.invalid', '/\t/example.invalid',
    '/\n/example.invalid', '/\r/example.invalid', '\\example.invalid']) {
    assert.equal(safeReturnPath(path), '/profile', JSON.stringify(path));
    assert.equal(safeReturnPath(path, '/library'), '/library');
  }
});

test('rejects backslashes and every ASCII control character anywhere in a return path', () => {
  for (const char of ['\\', ...Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)), '\x7f']) {
    assert.equal(safeReturnPath(`/battle/room${char}?join=1`), '/profile');
  }
});

// Result cards run under a device-local origin in Capacitor. Links sent to
// another person must still target the public site, including clipboard use.
test('public result links ignore device-local origins and reject unsafe game paths', () => {
  const previousWindow = globalThis.window;
  const previousOrigin = process.env.REACT_APP_PUBLIC_APP_URL;
  try {
    delete process.env.REACT_APP_PUBLIC_APP_URL;
    for (const origin of ['capacitor://localhost', 'http://localhost', 'https://preview.invalid']) {
      globalThis.window = { location: { origin } };
      assert.equal(publicGameShareUrl('/play/spades'), 'https://rmcclassics.com/play/spades?ref=player-share');
      assert.equal(publicGameShareUrl('//external.invalid'), 'https://rmcclassics.com/library?ref=player-share');
      assert.equal(publicGameShareUrl(undefined), 'https://rmcclassics.com/library?ref=player-share');
    }
    process.env.REACT_APP_PUBLIC_APP_URL = 'https://games.example.invalid';
    assert.equal(publicGameShareUrl('/play/dominoes'), 'https://games.example.invalid/play/dominoes?ref=player-share');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousOrigin === undefined) delete process.env.REACT_APP_PUBLIC_APP_URL;
    else process.env.REACT_APP_PUBLIC_APP_URL = previousOrigin;
  }
});

test('result card uses the public link for both share and copy, with quiet cancellation', async () => {
  const card = await readFile(new URL('../frontend/src/components/rmc/ShareCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /const shareUrl = publicGameShareUrl\(game\?\.path\);/);
  assert.doesNotMatch(card, /window\.location/);
  assert.match(card, /url: shareUrl/);
  assert.ok(card.includes('navigator.clipboard.writeText(`${shareText}\\n${shareUrl}`)'));
  assert.match(card, /if \(ok === true\) toast.success/);
  assert.match(card, /if \(ok === false\) toast.error/);
});
