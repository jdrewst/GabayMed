import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { ALL_MEDICAL_SERVICES, matchesFacilityQuery, expandServiceKeywords } from '../lib/medical-services';

const STANDARD_SERVICES = ALL_MEDICAL_SERVICES;

const UNIVERSAL_SERVICE_VALUES = new Set(['everything', 'all', 'all services']);
const EMPTY_SERVICE_VALUES = new Set(['none', 'n/a']);

function resolveApiBaseUrl() {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const configuredUrl = configuredBaseUrl || configuredApiUrl;
  if (configuredUrl) {
    const trimmedUrl = configuredUrl.replace(/\/+$/, '');
    return trimmedUrl.endsWith('/api') ? trimmedUrl : `${trimmedUrl}/api`;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)) {
    return `${window.location.origin}/api`;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    // Skip Expo tunnel domains (*.exp.direct) since they don't expose port 3000
    if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.exp.direct')) {
      return `http://${host}:3000/api`;
    }
  }

  return Platform.OS === 'android'
    ? 'http://10.0.2.2:3000/api'
    : 'http://localhost:3000/api';
}

const API_BASE_URL = resolveApiBaseUrl();

// Helper: Haversine Formula for distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// --- Direct Supabase fallback filtering helpers (mirrors server/lib/browse-services.js) ---
function normalizedText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesSearchTerm(query, value) {
  const nq = normalizeSearchValue(query);
  const nv = normalizeSearchValue(value);
  if (!nq || nv.includes(nq)) return true;
  const qTerms = nq.split(' ');
  const vTerms = nv.split(' ');
  return qTerms.every(qt => vTerms.some(vt => vt.includes(qt) || qt.includes(vt)));
}

function parseServicesOffered(value) {
  let services;
  if (Array.isArray(value)) {
    services = value.map(s => String(s || '').trim()).filter(Boolean);
  } else {
    if (typeof value !== 'string' || !value.trim()) return [];
    const text = value.trim();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        services = parsed.map(s => String(s || '').trim()).filter(Boolean);
      }
    } catch {}
    if (!services) {
      const list = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : text;
      services = list.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  const declared = services.filter(
    s => !UNIVERSAL_SERVICE_VALUES.has(normalizedText(s)) && !EMPTY_SERVICE_VALUES.has(normalizedText(s))
  );
  if (services.some(s => UNIVERSAL_SERVICE_VALUES.has(normalizedText(s)))) {
    return [...new Set([...STANDARD_SERVICES, ...declared])];
  }
  return declared;
}

function canonicalServiceName(value) {
  const name = normalizedText(value);
  const aliases = {
    cardiology: 'cardiologist',
    pediatrics: 'pediatrician',
    orthopedics: 'orthopedic',
    psychiatry: 'psychiatric',
    ophthalmology: 'ophthalmologist',
    dentistry: 'dentist',
  };
  return aliases[name] || name;
}

async function fetchSeekCareFromSupabase(filters = {}) {
  const [facilityResult, branchResult] = await Promise.all([
    supabase.from('facilities').select('*'),
    supabase.from('clinic_branches').select('*'),
  ]);

  if (facilityResult.error) throw facilityResult.error;
  const rawFacilities = (facilityResult.data || []).filter(f => f.is_active !== false);
  const rawBranches = branchResult.error ? [] : (branchResult.data || []).filter(b => b.is_active !== false);

  const facilitiesById = new Map(rawFacilities.map(f => [f.facility_id, f]));
  const records = [
    ...rawFacilities.map(facility => ({ facility, branch: null })),
    ...rawBranches
      .map(branch => ({ facility: facilitiesById.get(branch.facility_id), branch }))
      .filter(r => r.facility),
  ];

  const searched = records.filter(({ facility, branch }) => {
    const branchServices = parseServicesOffered(branch?.services_offered);
    const resolvedServices = branchServices.length > 0 ? branchServices : parseServicesOffered(facility.services_offered);
    const candidate = {
      name: [facility.name, branch?.name].filter(Boolean).join(' '),
      address: [branch?.address, facility.address, facility.location].filter(Boolean).join(' '),
      services: resolvedServices,
    };
    const nameOrServiceOk = !filters.name || matchesFacilityQuery(candidate, filters.name);
    const locOk = !filters.location || matchesSearchTerm(filters.location, candidate.address);
    return nameOrServiceOk && locOk;
  });

  const services = [
    ...new Set(
      searched.flatMap(r => {
        const bs = parseServicesOffered(r.branch?.services_offered);
        return bs.length > 0 ? bs : parseServicesOffered(r.facility.services_offered);
      })
    ),
  ].sort((a, b) => a.localeCompare(b));

  const wantedCategory = normalizedText(filters.category);
  const expandedCat = wantedCategory ? expandServiceKeywords(wantedCategory) : [];
  const matchedFacilities = searched
    .filter(r => {
      if (!wantedCategory) return true;
      const bs = parseServicesOffered(r.branch?.services_offered);
      const svcs = bs.length > 0 ? bs : parseServicesOffered(r.facility.services_offered);
      return svcs.some(s => {
        const ns = normalizedText(s);
        return (
          canonicalServiceName(s) === canonicalServiceName(wantedCategory) ||
          ns.includes(wantedCategory) ||
          expandedCat.some(kw => ns.includes(kw))
        );
      });
    })
    .map(({ facility, branch }) => {
      const parentName = facility.name || 'Healthcare Facility';
      const branchName = branch?.name;
      const name = branch
        ? branchName && normalizedText(branchName).includes(normalizedText(parentName))
          ? branchName
          : `${parentName} - ${branchName || 'Clinic Branch'}`
        : parentName;
      const address = branch?.address || facility.location || facility.address || '';
      const bs = parseServicesOffered(branch?.services_offered);

      return {
        id: branch ? `branch-${branch.branch_id}` : facility.facility_id,
        facilityId: facility.facility_id,
        branchId: branch?.branch_id || null,
        type: branch ? 'branch' : 'facility',
        name,
        address,
        location: address,
        latitude: branch?.lat ?? facility.lat ?? null,
        longitude: branch?.long ?? facility.long ?? null,
        isGabay: facility.is_gabay !== false,
        services: bs.length > 0 ? bs : parseServicesOffered(facility.services_offered),
        imageUrl: branch?.logo_path || facility.logo_path || facility.image_url || null,
      };
    });

  return { facilities: matchedFacilities, services };
}

const BrowseAPI = {
  /**
   * Fetches all healthcare facilities for the Seek Medical Care page.
   * Tries the backend API first, and falls back directly to Supabase if unreachable.
   */
  async getSeekCareData(filters = {}) {
    try {
      let result = null;

      // 1. Try backend API with a short timeout
      try {
        const searchParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (typeof value === 'string' && value.trim()) searchParams.set(key, value.trim());
        });
        const query = searchParams.toString();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${API_BASE_URL}/browse-services${query ? `?${query}` : ''}`, {
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const parsed = await response.json();
          if (parsed && Array.isArray(parsed.facilities)) {
            result = parsed;
          }
        }
      } catch (apiErr) {
        console.warn('Browse API unreachable, falling back to Supabase:', apiErr.message);
      }

      // 2. Direct Supabase fallback
      if (!result) {
        result = await fetchSeekCareFromSupabase(filters);
      }

      const USER_LAT = 14.5977;
      const USER_LONG = 121.0112;
      // Browse by Services & Facility Results ONLY includes Gabay-supported hospitals & clinics
      const facilities = (result.facilities || [])
        .filter(facility => facility.isGabay !== false)
        .map(facility => {
          let distance = 'N/A';
          let distValue = 99999;

          if (facility.latitude != null && facility.longitude != null) {
            const km = getDistanceFromLatLonInKm(
              USER_LAT,
              USER_LONG,
              parseFloat(facility.latitude),
              parseFloat(facility.longitude)
            );
            distValue = km;
            distance = km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(1)} km`;
          }

          return {
            id: facility.id,
            facilityId: facility.facilityId || facility.id,
            branchId: facility.branchId || null,
            type: facility.type || 'facility',
            name: facility.name,
            address: facility.address,
            phone: facility.phone || '',
            rating: 4.5,
            isOpen: true,
            isGabay: true,
            distance,
            distValue,
            latitude: facility.latitude,
            longitude: facility.longitude,
            services: facility.services || [],
            imageUrl: facility.imageUrl,
          };
        });

      facilities.sort((a, b) => a.distValue - b.distValue);

      return {
        facilities,
        services: result.services || [],
      };
    } catch (error) {
      console.error('Get Seek Care Data Error:', error);
      throw error;
    }
  },
};

export default BrowseAPI;
