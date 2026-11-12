import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Execute the application's actual module without a transpiler or copied logic.
const source = await readFile(new URL('../frontend/src/lib/routes.js', import.meta.url), 'utf8');
const { safeReturnPath } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

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
