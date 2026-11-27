import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const axiosPath = process.env.RMC_AXIOS_MODULE || require.resolve('axios');
// Exercise the actual client and locked Axios transport, with only local fixtures.
const source = (await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'))
  .replace('from "axios"', `from ${JSON.stringify(pathToFileURL(axiosPath).href)}`);
const requests = [];
const server = createServer((req, res) => {
  const received = { method: req.method, path: req.url, authorization: req.headers.authorization || null };
  requests.push(received);
  req.resume();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(received));
});
const previousUrl = process.env.REACT_APP_BACKEND_URL;
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let token = null;
let storageError = null;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.REACT_APP_BACKEND_URL = `http://127.0.0.1:${server.address().port}`;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => { if (storageError) throw storageError; return token; } },
  });
  const { default: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const config = { proxy: false };
  for (const [method, path, before, after] of [
    ['delete', '/auth/account', 'account-a', 'account-b'],
    ['post', '/games/submit', 'account-a', 'account-b'],
    ['get', '/auth/me', 'account-a', null],
    ['get', '/games/meta', null, 'account-b'],
    ['get', '/auth/me', 'account-b', 'account-b'],
  ]) {
    token = before;
    const pending = api.request({ ...config, method, url: path });
    // Change the session before queued promise callbacks can run.
    token = after;
    const { data } = await pending;
    assert.equal(data.authorization, before ? `Bearer ${before}` : null, `${method} ${path} must keep its initiating session`);
  }
  token = 'account-a';
  const first = api.get('/auth/me?first', config);
  token = 'account-b';
  const second = api.get('/auth/me?second', config);
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses.map(({ data }) => data.authorization), ['Bearer account-a', 'Bearer account-b']);
  const count = requests.length;
  storageError = new Error('fixture storage unavailable');
  await assert.rejects(api.delete('/auth/account', config), /fixture storage unavailable/);
  assert.equal(requests.length, count, 'Storage errors must reject before dispatch');
  assert.equal(count, 7, 'Each request must be sent exactly once');
  console.log('PASS: five session transitions, concurrent accounts, and storage failure preserve request identity without retries');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousUrl === undefined) delete process.env.REACT_APP_BACKEND_URL;
  else process.env.REACT_APP_BACKEND_URL = previousUrl;
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
