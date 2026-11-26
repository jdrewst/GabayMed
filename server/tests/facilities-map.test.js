const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listMapFacilities, resolveCoordinates, parseCoordinateString } = require('../lib/facilities-map');

test('parseCoordinateString extracts lat/lng from text when present', () => {
  assert.deepEqual(parseCoordinateString('14.5977, 121.0112'), { lat: 14.5977, lng: 121.0112 });
  assert.equal(parseCoordinateString('Aurora Blvd, Quezon City'), null);
});

test('resolveCoordinates uses explicit lat/lng or landmark matching', async () => {
  const explicit = await resolveCoordinates({ lat: 14.61, lng: 121.02, name: 'Test', address: 'Anywhere' });
  assert.deepEqual(explicit, { lat: 14.61, lng: 121.02 });

  const landmark = await resolveCoordinates({
    lat: null,
    lng: null,
    name: 'UERM Medical Center',
    address: 'Aurora Blvd, Sta. Mesa, Manila',
    geocodeFetch: async () => ({ ok: false }),
  });
  assert.equal(landmark.lat, 14.6042);
  assert.equal(landmark.lng, 121.0204);
});

test('listMapFacilities returns registered facilities with coordinates and basic details', async () => {
  const mockAdmin = {
    from: table => ({
      select: () => {
        if (table === 'facilities') {
          return Promise.resolve({
            data: [
              {
                facility_id: 'fac-1',
                name: 'Philippine General Hospital',
                abbreviation: 'PGH',
                location: 'Taft Ave, Ermita, Manila',
                contact_num: '02-8554-8400',
                email: 'info@pgh.gov.ph',
                services_offered: ['General Medicine', 'Cardiology'],
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({
          data: [{ branch_id: 'b-1', facility_id: 'fac-1', name: 'Taft Branch', address: 'Manila', is_active: true }],
          error: null,
        });
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  };

  const result = await listMapFacilities(mockAdmin, { geocodeFetch: async () => ({ ok: false }) });
  assert.equal(result.facilities.length, 2);
  const f = result.facilities[0];
  assert.equal(f.name, 'Philippine General Hospital');
  assert.equal(f.address, 'Taft Ave, Ermita, Manila');
  assert.equal(f.latitude, 14.5784);
  assert.equal(f.longitude, 120.9856);
  assert.equal(f.branchCount, 1);
  assert.equal(result.facilities[1].type, 'branch');
});
