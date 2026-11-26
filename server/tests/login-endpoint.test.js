const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/login');

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }, end() {} };
}
test('login rejects GET and disables caching', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('login rejects cross-origin requests before credentials are processed', async () => {
  const res = response();
  await handler({ method: 'POST', headers: { origin: 'https://untrusted.example', host: 'clinic.example' } }, res);
  assert.equal(res.code, 403);
});
test('login accepts same-origin preflight', async () => {
  const res = response();
  await handler({ method: 'OPTIONS', headers: { origin: 'https://clinic.example', host: 'clinic.example' } }, res);
  assert.equal(res.code, 204);
});
