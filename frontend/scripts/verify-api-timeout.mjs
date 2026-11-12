import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const axiosPath = process.env.RMC_AXIOS_MODULE || require.resolve('axios');
// Execute the real client; replace only dependency resolution for a data URL.
const source = (await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'))
  .replace('from "axios"', `from ${JSON.stringify(pathToFileURL(axiosPath).href)}`);
const requests = [];
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/api/fast') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  }
  // Other paths intentionally never respond. No real accounts or remote API.
});
const previousUrl = process.env.REACT_APP_BACKEND_URL;
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.REACT_APP_BACKEND_URL = `http://127.0.0.1:${server.address().port}`;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  const { default: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(api.defaults.timeout, 15000);
  assert.deepEqual((await api.get('/fast', { proxy: false })).data, { ok: true });
  await assert.rejects(api.get('/override', { timeout: 50, proxy: false }), { code: 'ECONNABORTED' });
  await assert.rejects(api.post('/auth/login', { email: 'timeout@example.invalid', password: 'fixture' }, { proxy: false }), { code: 'ECONNABORTED' });
  assert.deepEqual(requests, ['/api/fast', '/api/override', '/api/auth/login'], 'Timeouts must not silently retry writes');
  console.log('PASS: real API client completes normal requests, times out stalled login, preserves overrides, and does not retry');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousUrl === undefined) delete process.env.REACT_APP_BACKEND_URL;
  else process.env.REACT_APP_BACKEND_URL = previousUrl;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
