import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import ProfileAPI from './profileApi';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)) {
    return window.location.origin;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:3000`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

// Fallback landmark lookup if the backend API is unreachable and DB lacks lat/long
const LOCAL_LANDMARKS = [
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
  { match: /marikina/i, lat: 14.6507, lng: 121.1029 },
  { match: /caloocan/i, lat: 14.6571, lng: 120.9841 },
  { match: /cebu/i, lat: 10.3157, lng: 123.8854 },
  { match: /davao/i, lat: 7.1907, lng: 125.4553 },
];

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

function inferCoords(facility, index = 0) {
  const numLat = parseFloat(facility.lat ?? facility.latitude);
  const numLng = parseFloat(facility.long ?? facility.lng ?? facility.longitude);
  if (Number.isFinite(numLat) && Number.isFinite(numLng) && numLat !== 0 && numLng !== 0) {
    return { latitude: numLat, longitude: numLng };
  }
  const text = `${facility.address || facility.location || ''} ${facility.name || ''}`;
  const coordMatch = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{2,3}\.\d{3,})/.exec(text);
  if (coordMatch) {
    return { latitude: parseFloat(coordMatch[1]), longitude: parseFloat(coordMatch[2]) };
  }
  for (const lm of LOCAL_LANDMARKS) {
    if (lm.match.test(text)) {
      return { latitude: lm.lat, longitude: lm.lng };
    }
  }
  // Slight offset around Metro Manila center so multiple un-geocoded pins don't overlap on the exact same pixel
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = 0.008 * ((index % 5) + 1);
  return {
    latitude: 14.5995 + Math.cos(angle) * radius,
    longitude: 120.9842 + Math.sin(angle) * radius,
  };
}

export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

let cachedFacilitiesResult = null;

const MapAPI = {
  /**
   * Clears the facilities in-memory cache to force a fresh fetch.
   */
  clearFacilitiesCache() {
    cachedFacilitiesResult = null;
  },

  /**
   * Requests foreground location permission from the user, respecting the in-app Location Access toggle.
   * If disabled in Settings or denied, returns `{ granted: false, coords: null }`
   * so the map displays only the registered clinics without a user marker.
   */
  async requestUserLocation({ forceEnable = false } = {}) {
    try {
      const perms = await ProfileAPI.getPermissions();
      if (!forceEnable && perms.locationAllowed === false) {
        return { granted: false, disabledInApp: true, coords: null };
      }

      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' && perm.canAskAgain !== false) {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        return { granted: false, coords: null };
      }

      if (forceEnable) {
        await ProfileAPI.setPermissions({ locationAllowed: true });
      }

      // Try last known position first for speed, then current position
      let pos = await Location.getLastKnownPositionAsync({});
      if (!pos) {
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }
      if (!pos?.coords) {
        return { granted: true, coords: null };
      }
      return {
        granted: true,
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        },
      };
    } catch (error) {
      console.warn('Location permission/fetch error:', error.message);
      return { granted: false, coords: null };
    }
  },

  /**
   * Fetches all registered facilities with coordinates and basic details from the backend
   * `/api/facilities-map` endpoint (with direct Supabase fallback).
   */
  async getFacilitiesLocations(userCoords = null) {
    if (cachedFacilitiesResult && cachedFacilitiesResult.length > 0) {
      if (!userCoords) return cachedFacilitiesResult;
      return cachedFacilitiesResult.map(f => {
        const km = getDistanceKm(userCoords.latitude, userCoords.longitude, f.latitude, f.longitude);
        return { ...f, distanceKm: km, distanceLabel: formatDistance(km) };
      }).sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    }

    let rawList = [];

    // 1. Try backend endpoint `/api/facilities-map`
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_URL}/api/facilities-map`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.facilities) && json.facilities.length > 0) {
          rawList = json.facilities;
        }
      }
    } catch {}

    // 2. Fallback: query `facilities` AND active `clinic_branches` directly from Supabase
    if (rawList.length === 0) {
      try {
        const [{ data: facData }, { data: branchData }] = await Promise.all([
          supabase.from('facilities').select('*'),
          supabase.from('clinic_branches').select('*').eq('is_active', true),
        ]);
        const facMap = new Map();
        const combined = [];

        if (Array.isArray(facData)) {
          facData.forEach((f, idx) => {
            facMap.set(f.facility_id, f);
            const c = inferCoords(f, idx);
            combined.push({
              id: `facility-${f.facility_id}`,
              facilityId: f.facility_id,
              branchId: null,
              type: 'facility',
              name: f.name || 'Healthcare Facility',
              abbreviation: f.abbreviation || '',
              address: f.location || f.address || 'Metro Manila, Philippines',
              phone: f.contact_num || '',
              email: f.email || '',
              services: parseServicesOffered(f.services_offered),
              isGabay: f.is_gabay !== false,
              imageUrl: f.image_url || null,
              latitude: c.latitude,
              longitude: c.longitude,
            });
          });
        }

        if (Array.isArray(branchData)) {
          branchData.forEach((b, j) => {
            const parent = facMap.get(b.facility_id);
            const branchName =
              parent?.name && !b.name?.toLowerCase().includes(parent.name.toLowerCase())
                ? `${parent.name} – ${b.name}`
                : b.name || 'Clinic Branch';
            const c = inferCoords(
              { ...b, name: b.name || branchName, location: b.address || parent?.location },
              (facData?.length || 0) + j + 1
            );
            combined.push({
              id: `branch-${b.branch_id}`,
              facilityId: b.facility_id,
              branchId: b.branch_id,
              type: 'branch',
              name: branchName,
              abbreviation: b.abbreviation || parent?.abbreviation || '',
              address: b.address || parent?.location || 'Metro Manila, Philippines',
              phone: b.contact_num || parent?.contact_num || '',
              email: b.email || parent?.email || '',
              services: parseServicesOffered(parent?.services_offered),
              isGabay: parent ? parent.is_gabay !== false : true,
              imageUrl: parent?.image_url || null,
              latitude: c.latitude,
              longitude: c.longitude,
            });
          });
        }

        rawList = combined;
      } catch (err) {
        console.error('MapAPI Supabase fallback error:', err.message);
      }
    }

    // 3. Deconflict identical coordinates and attach distance
    const usedCoords = [];
    const mapped = rawList.map((f, idx) => {
      const baseCoords = inferCoords(f, idx);
      let { latitude, longitude } = baseCoords;
      const collision = usedCoords.some(
        u => Math.abs(u.latitude - latitude) < 0.0002 && Math.abs(u.longitude - longitude) < 0.0002
      );
      if (collision) {
        const angle = ((idx + 1) * 137.5 * Math.PI) / 180;
        latitude += Math.cos(angle) * 0.0025;
        longitude += Math.sin(angle) * 0.0025;
      }
      usedCoords.push({ latitude, longitude });

      const distKm = userCoords
        ? getDistanceKm(userCoords.latitude, userCoords.longitude, latitude, longitude)
        : null;
      return {
        id: String(f.id ?? f.facilityId ?? idx),
        facilityId: f.facilityId ?? f.facility_id ?? f.id,
        branchId: f.branchId ?? f.branch_id ?? null,
        type: f.type || (f.branchId || f.branch_id ? 'branch' : 'facility'),
        title: f.name || f.title || 'Healthcare Facility',
        name: f.name || f.title || 'Healthcare Facility',
        abbreviation: f.abbreviation || '',
        address: f.address || f.location || 'Address not specified',
        location: f.address || f.location || 'Address not specified',
        phone: f.phone || f.contact_num || '',
        email: f.email || '',
        services: parseServicesOffered(f.services ?? f.services_offered),
        isGabay: f.isGabay !== false,
        imageUrl: f.imageUrl || null,
        latitude,
        longitude,
        distanceKm: distKm,
        distanceLabel: formatDistance(distKm),
      };
    });

    if (mapped.length > 0) {
      cachedFacilitiesResult = mapped;
    }

    if (userCoords) {
      mapped.sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    }

    return mapped;
  },

  /**
   * Fetches road route geometry and turn-by-turn steps between `origin` and `destination`
   * using the public OSRM routing API (with a clean straight-line fallback if offline).
   */
  async getInAppRoute(origin, destination) {
    if (!origin || !destination) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const route = json?.routes?.[0];
        if (route?.geometry?.coordinates?.length) {
          const coordinates = route.geometry.coordinates.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }));
          const rawSteps = route.legs?.[0]?.steps || [];
          const steps = rawSteps
            .filter(s => s.distance > 5 || s.maneuver?.type === 'arrive')
            .map((s, idx) => {
              const type = s.maneuver?.type || 'continue';
              const mod = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : '';
              const road = s.name ? ` onto ${s.name}` : '';
              let instruction = `Continue${road}`;
              if (type === 'depart') instruction = `Head${mod}${road}`;
              else if (type === 'arrive') instruction = 'Arrive at your destination';
              else if (type === 'turn') instruction = `Turn${mod}${road}`;
              else if (type === 'roundabout') instruction = `Take the roundabout${road}`;
              else if (type === 'merge') instruction = `Merge${mod}${road}`;
              else if (type === 'fork') instruction = `Keep${mod} at the fork${road}`;
              return {
                id: `${idx}-${s.name || type}`,
                instruction,
                distanceLabel:
                  s.distance < 1000
                    ? `${Math.round(s.distance)} m`
                    : `${(s.distance / 1000).toFixed(1)} km`,
              };
            });

          const distKm = route.distance / 1000;
          const durationMin = Math.max(1, Math.round(route.duration / 60));
          return {
            coordinates,
            distanceLabel: distKm < 1 ? `${Math.round(route.distance)} m` : `${distKm.toFixed(1)} km`,
            durationLabel: durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`,
            steps,
          };
        }
      }
    } catch {}

    // Fallback if offline: direct path + estimated time
    const distKm = getDistanceKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
    const estMinutes = Math.max(2, Math.round((distKm / 25) * 60));
    return {
      coordinates: [origin, { latitude: destination.latitude, longitude: destination.longitude }],
      distanceLabel: formatDistance(distKm)?.replace(' away', '') || `${distKm.toFixed(1)} km`,
      durationLabel: `${estMinutes} min`,
      steps: [
        {
          id: 'step-direct',
          instruction: `Proceed toward ${destination.name || 'the selected facility'}`,
          distanceLabel: formatDistance(distKm)?.replace(' away', '') || '',
        },
        {
          id: 'step-arrive',
          instruction: `Arrive at ${destination.name || 'destination'}`,
          distanceLabel: '0 m',
        },
      ],
    };
  },
};

export default MapAPI;
