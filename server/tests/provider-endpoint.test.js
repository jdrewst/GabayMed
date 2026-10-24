const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/providers');

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

test('endpoint rejects wrong methods and disables response caching', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('endpoint rejects unexpected browser origins', async () => {
  const res = response();
  await handler({ method: 'POST', headers: { origin: 'https://other.example', host: 'clinic.example' } }, res);
  assert.equal(res.statusCode, 403);
});

test('endpoint accepts local dev preflight with Authorization header', async () => {
  const res = response();
  const before = process.env.CLIENT_ORIGIN;
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';
  try {
    await handler({ method: 'OPTIONS', headers: { origin: 'http://localhost:5173', host: 'localhost:3000' } }, res);
    assert.equal(res.statusCode, 204);
    assert.match(res.headers['Access-Control-Allow-Headers'], /Authorization/);
  } finally {
    if (before === undefined) delete process.env.CLIENT_ORIGIN; else process.env.CLIENT_ORIGIN = before;
  }
});

test('configured endpoint requires a bearer token without contacting Supabase', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder';
  try {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
