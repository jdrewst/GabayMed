const { RequestError } = require('./provider-accounts');

// In-memory geocode cache so repeated map requests are instant
const geocodeCache = new Map();

// Known Philippine healthcare/area landmarks fallback dictionary
const PH_LANDMARKS = [
  { match: /pgh|philippine general hospital|taft|ermita/i, lat: 14.5784, lng: 120.9856 },
  { match: /uerm|aurora blvd|sta\.?\s*mesa|santa mesa|pup/i, lat: 14.6042, lng: 121.0204 },
  { match: /st\.?\s*luke.*bgc|taguig|bonifacio global/i, lat: 14.5549, lng: 121.0482 },
  { match: /st\.?\s*luke.*quezon|cathedral heights|e\.?\s*rodriguez/i, lat: 14.6227, lng: 121.0234 },
  { match: /makati med|makati/i, lat: 14.5591, lng: 121.0145 },
  { match: /medical city|ortigas|pasig/i, lat: 14.5896, lng: 121.0692 },
  { match: /asian hospital|alabang|muntinlupa/i, lat: 14.4139, lng: 121.0439 },
  { match: /chinese general|blumentritt|santa cruz/i, lat: 14.6219, lng: 120.9885 },
  { match: /ust|espana|españa|sampaloc/i, lat: 14.6105, lng: 120.9894 },
  { match: /manila doctors|united nations|un ave/i, lat: 14.5818, lng: 120.9830 },
  { match: /veterans|north ave|diliman|quezon city|\bqc\b/i, lat: 14.6488, lng: 121.0437 },
  { match: /cardinal santos|greenhills|san juan/i, lat: 14.6022, lng: 121.0442 },
  { match: /mandaluyong/i, lat: 14.5794, lng: 121.0359 },
  { match: /pasay/i, lat: 14.5378, lng: 121.0014 },
  { match: /paranaque|parañaque/i, lat: 14.4793, lng: 121.0198 },
  { match: /las pinas|las piñas/i, lat: 14.4445, lng: 120.9939 },
  { match: /marikina/i, lat: 14.6507, lng: 121.1029 },
  { match: /caloocan/i, lat: 14.6571, lng: 120.9841 },
  { match: /valenzuela/i, lat: 14.7011, lng: 120.9830 },
  { match: /malabon/i, lat: 14.6681, lng: 120.9658 },
  { match: /navotas/i, lat: 14.6667, lng: 120.9417 },
  { match: /antipolo|rizal/i, lat: 14.5866, lng: 121.1754 },
  { match: /cavite|bacoor|imus|dasmarinas|dasmariñas/i, lat: 14.4297, lng: 120.9367 },
  { match: /laguna|calamba|santa rosa|biñan/i, lat: 14.2691, lng: 121.1113 },
  { match: /bulacan|malolos|meycauayan/i, lat: 14.7942, lng: 120.8799 },
  { match: /cebu/i, lat: 10.3157, lng: 123.8854 },
  { match: /davao/i, lat: 7.1907, lng: 125.4553 },
  { match: /manila/i, lat: 14.5995, lng: 120.9842 },
];

/**
 * Parses explicit coordinate strings like "14.5977, 121.0112" if present.
 */
function parseCoordinateString(text) {
  if (typeof text !== 'string') return null;
  const match = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{2,3}\.\d{3,})/.exec(text);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { lat, lng };
  }
  return null;
}

/**
 * Resolves coordinates from explicit numeric columns, coordinate string, OpenStreetMap Nominatim, or PH landmark dictionary.
 */
async function resolveCoordinates({ lat, lng, name = '', address = '', geocodeFetch, offsetIndex = 0 }) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (Number.isFinite(numLat) && Number.isFinite(numLng) && numLat !== 0 && numLng !== 0) {
    return { lat: numLat, lng: numLng };
  }

  const fromText = parseCoordinateString(address) || parseCoordinateString(name);
  if (fromText) return fromText;

  const queryKey = `${name} | ${address}`.trim().toLowerCase();
  if (geocodeCache.has(queryKey)) {
    return geocodeCache.get(queryKey);
  }

  // Try live geocoding via OpenStreetMap Nominatim first when an address is provided
  const doFetch = geocodeFetch || (typeof fetch === 'function' ? fetch : null);
  const searchQuery = (address || name).trim();
  if (doFetch && searchQuery && searchQuery !== 'Metro Manila, Philippines') {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(searchQuery)}`;
      const res = await doFetch(url, {
        headers: { 'User-Agent': 'GabayMed-PatientApp/1.0' },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results[0]?.lat && results[0]?.lon) {
          const coords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
          geocodeCache.set(queryKey, coords);
          return coords;
        }
      }
    } catch {}
  }

  // Fallback to landmark dictionary
  const combined = `${name} ${address}`;
  for (const item of PH_LANDMARKS) {
    if (item.match.test(combined)) {
      const coords = { lat: item.lat, lng: item.lng };
      geocodeCache.set(queryKey, coords);
      return coords;
    }
  }

  // Default fallback in Metro Manila with slight offset so multiple pins don't overlap
  const angle = (offsetIndex * 137.5 * Math.PI) / 180;
  const radius = 0.006 * ((offsetIndex % 5) + 1);
  const fallback = {
    lat: 14.5995 + Math.cos(angle) * radius,
    lng: 120.9842 + Math.sin(angle) * radius,
  };
  geocodeCache.set(queryKey, fallback);
  return fallback;
}

function parseServicesOffered(raw) {
  if (Array.isArray(raw)) return raw.map(s => String(s || '').trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(s => String(s || '').trim()).filter(Boolean);
    } catch {}
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Fetches ALL registered facilities AND active clinic branches, resolves their coordinates,
 * and returns a unified list of map pins so patients see every hospital and clinic branch.
 */
async function listMapFacilities(admin, { geocodeFetch } = {}) {
  if (!admin) throw new RequestError(503, 'Map service is temporarily unavailable.');

  const { data: facilities, error: facError } = await admin.from('facilities').select('*');
  if (facError) throw new RequestError(503, 'Could not load registered facilities.');

  let branches = [];
  try {
    const branchRes = await admin.from('clinic_branches').select('*');
    if (!branchRes.error && Array.isArray(branchRes.data)) {
      branches = branchRes.data.filter(b => b.is_active !== false);
    }
  } catch {}

  const facilityMap = new Map();
  const items = [];
  const usedCoords = [];

  // Prevents a branch pin from sitting on the exact same pixel as its main facility pin
  function deconflictCoords(coords, index) {
    let { lat, lng } = coords;
    const collision = usedCoords.some(
      u => Math.abs(u.lat - lat) < 0.0002 && Math.abs(u.lng - lng) < 0.0002
    );
    if (collision) {
      const angle = ((index + 1) * 137.5 * Math.PI) / 180;
      const offset = 0.0025; // ~250m offset so both pins are clearly visible side-by-side
      lat += Math.cos(angle) * offset;
      lng += Math.sin(angle) * offset;
    }
    usedCoords.push({ lat, lng });
    return { lat, lng };
  }

  for (let i = 0; i < (facilities || []).length; i++) {
    const f = facilities[i];
    facilityMap.set(f.facility_id, f);
    const address = f.location || f.address || 'Metro Manila, Philippines';
    const rawCoords = await resolveCoordinates({
      lat: f.lat ?? f.latitude,
      lng: f.long ?? f.lng ?? f.longitude,
      name: f.name,
      address,
      geocodeFetch,
      offsetIndex: i,
    });
    const coords = deconflictCoords(rawCoords, i);

    if ((f.lat == null || f.long == null) && rawCoords) {
      try {
        await admin.from('facilities').update({ lat: rawCoords.lat, long: rawCoords.lng }).eq('facility_id', f.facility_id);
      } catch {}
    }

    const facilityBranches = branches.filter(b => b.facility_id === f.facility_id);

    items.push({
      id: `facility-${f.facility_id}`,
      facilityId: f.facility_id,
      branchId: null,
      type: 'facility',
      name: f.name || 'Healthcare Facility',
      parentFacilityName: null,
      abbreviation: f.abbreviation || '',
      address,
      phone: f.contact_num || '',
      email: f.email || '',
      services: parseServicesOffered(f.services_offered),
      isGabay: f.is_gabay !== false,
      imageUrl: f.image_url || null,
      latitude: coords.lat,
      longitude: coords.lng,
      branchCount: facilityBranches.length,
    });
  }

  // Also include every active clinic branch as its own pin on the map
  for (let j = 0; j < branches.length; j++) {
    const b = branches[j];
    const parent = facilityMap.get(b.facility_id);
    const branchAddress = b.address || parent?.location || 'Metro Manila, Philippines';
    const branchName = parent?.name && !b.name?.toLowerCase().includes(parent.name.toLowerCase())
      ? `${parent.name} – ${b.name}`
      : b.name || 'Clinic Branch';

    const rawCoords = await resolveCoordinates({
      lat: b.lat ?? b.latitude,
      lng: b.long ?? b.lng ?? b.longitude,
      name: b.name || branchName,
      address: branchAddress,
      geocodeFetch,
      offsetIndex: (facilities?.length || 0) + j + 1,
    });
    const coords = deconflictCoords(rawCoords, (facilities?.length || 0) + j + 1);

    if ((b.lat == null || b.long == null) && rawCoords) {
      try {
        await admin.from('clinic_branches').update({ lat: rawCoords.lat, long: rawCoords.lng }).eq('branch_id', b.branch_id);
      } catch {}
    }

    items.push({
      id: `branch-${b.branch_id}`,
      facilityId: b.facility_id,
      branchId: b.branch_id,
      type: 'branch',
      name: branchName,
      parentFacilityName: parent?.name || null,
      abbreviation: b.abbreviation || parent?.abbreviation || '',
      address: branchAddress,
      phone: b.contact_num || parent?.contact_num || '',
      email: b.email || parent?.email || '',
      services: parseServicesOffered(parent?.services_offered),
      isGabay: parent ? parent.is_gabay !== false : true,
      imageUrl: parent?.image_url || null,
      latitude: coords.lat,
      longitude: coords.lng,
      branchCount: 0,
    });
  }

  return { facilities: items };
}

module.exports = {
  listMapFacilities,
  resolveCoordinates,
  parseCoordinateString,
};
