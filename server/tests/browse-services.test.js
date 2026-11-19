const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { filterFacilities } = require('../lib/browse-services');
const handler = require('../api/browse-services');
const { createServer } = require('../backend');

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

test('facility search includes active branches and inherits parent facility services', () => {
  const result = filterFacilities([
    {
      facility_id: 'facility-1',
      name: 'Gabay Medical Center',
      location: 'Makati',
      services_offered: 'Pediatrics, Cardiology'
    }
  ], { name: 'north', location: 'quezon', category: 'pediatrics' }, [
    {
      branch_id: 'branch-1',
      facility_id: 'facility-1',
      name: 'North Branch',
      address: 'Quezon City',
      is_active: true
    },
    {
      branch_id: 'branch-2',
      facility_id: 'facility-1',
      name: 'Inactive Branch',
      address: 'Quezon City',
      is_active: false
    }
  ]);

  assert.deepEqual(result.facilities.map(facility => facility.id), ['branch-branch-1']);
  assert.equal(result.facilities[0].facilityId, 'facility-1');
  assert.equal(result.facilities[0].address, 'Quezon City');
  assert.deepEqual(result.facilities[0].services, ['Pediatrics', 'Cardiology']);
  assert.deepEqual(result.services, ['Cardiology', 'Pediatrics']);
});

test('configured specialty names match equivalent facility service labels', () => {
  const result = filterFacilities([
    {
      facility_id: 'facility-1',
      name: 'Gabay Medical Center',
      location: 'Makati',
      services_offered: 'Cardiology, Pediatrics'
    }
  ], { category: 'Cardiologist' });

  assert.deepEqual(result.facilities.map(facility => facility.id), ['facility-1']);
});

test('facilities offering everything expose and match all configured specialties', () => {
  const result = filterFacilities([
    {
      facility_id: 'facility-1',
      name: 'Gabay Medical Center',
      services_offered: 'Everything'
    }
  ], { category: 'Cardiologist' });

  assert.deepEqual(result.facilities.map(facility => facility.id), ['facility-1']);
  assert.ok(result.services.includes('General Check-up'));
  assert.ok(result.services.includes('Hematologist'));
  assert.equal(result.services.length, 13);
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

test('local backend routes /api/browse-services to the browse handler', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const statusCode = await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path: '/api/browse-services',
        method: 'POST'
      }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end();
    });

    assert.equal(statusCode, 405);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
