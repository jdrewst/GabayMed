const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterFacilities } = require('../lib/browse-services');
const handler = require('../api/browse-services');

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

test('facility search filters active facilities by category, name, and location', () => {
  const result = filterFacilities([
    {
      facility_id: '1',
      name: 'Central Medical Center',
      address: 'Quezon City',
      services_offered: ['Pediatrics', 'Cardiology'],
      is_active: true,
      is_gabay: true
    },
    {
      facility_id: '2',
      name: 'North Clinic',
      address: 'Manila',
      services_offered: ['Pediatrics'],
      is_active: false
    }
  ], { category: 'pediatrics', name: 'medical', location: 'quezon' });

  assert.deepEqual(result.facilities.map(facility => facility.id), ['1']);
  assert.deepEqual(result.facilities[0].services, ['Pediatrics', 'Cardiology']);
  assert.deepEqual(result.services, ['Cardiology', 'Pediatrics']);
});

test('browse endpoint only accepts GET and requires server configuration', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const methodResponse = response();
    await handler({ method: 'POST', headers: {} }, methodResponse);
    assert.equal(methodResponse.statusCode, 405);

    const configResponse = response();
    await handler({ method: 'GET', headers: {}, url: '/api/browse-services' }, configResponse);
    assert.equal(configResponse.statusCode, 503);
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
