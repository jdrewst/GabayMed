function normalizedText(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function matchesSearchTerm(query, value) {
  const normalizedQuery = normalizeSearchValue(query);
  const normalizedValue = normalizeSearchValue(value);
  if (!normalizedQuery || normalizedValue.includes(normalizedQuery)) return true;

  const queryTerms = normalizedQuery.split(' ');
  const valueTerms = normalizedValue.split(' ');
  return queryTerms.every(queryTerm => valueTerms.some(valueTerm => {
    if (valueTerm.includes(queryTerm) || queryTerm.includes(valueTerm)) return true;
    if (queryTerm.length < 3 || valueTerm.length < 3) {
      return valueTerm.startsWith(queryTerm) || queryTerm.startsWith(valueTerm);
    }
    const allowedDistance = Math.max(queryTerm.length, valueTerm.length) >= 8 ? 2 : 1;
    return Math.abs(queryTerm.length - valueTerm.length) <= allowedDistance &&
      editDistance(queryTerm, valueTerm) <= allowedDistance;
  }));
}

const STANDARD_SERVICES = [
  'General Check-up',
  'General Physician',
  'Neurologist',
  'Psychiatric',
  'Cardiologist',
  'Orthopedic',
  'Dermatologist',
  'Pediatrician',
  'Ophthalmologist',
  'ENT Specialist',
  'Pulmonologist',
  'Dentist',
  'Hematologist'
];

const UNIVERSAL_SERVICE_VALUES = new Set(['everything', 'all', 'all services']);
const EMPTY_SERVICE_VALUES = new Set(['none', 'n/a']);

function parseServicesOffered(value) {
  let services;
  if (Array.isArray(value)) {
    services = value.map(service => String(service || '').trim()).filter(Boolean);
  } else {
    if (typeof value !== 'string' || !value.trim()) return [];

    const text = value.trim();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        services = parsed.map(service => String(service || '').trim()).filter(Boolean);
      }
    } catch {}

    if (!services) {
      const list = text.startsWith('{') && text.endsWith('}')
        ? text.slice(1, -1)
        : text;
      services = list.split(',').map(service => service.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  const declaredServices = services.filter(service =>
    !UNIVERSAL_SERVICE_VALUES.has(normalizedText(service)) &&
    !EMPTY_SERVICE_VALUES.has(normalizedText(service))
  );
  if (services.some(service => UNIVERSAL_SERVICE_VALUES.has(normalizedText(service)))) {
    return [...new Set([...STANDARD_SERVICES, ...declaredServices])];
  }
  return declaredServices;
}

function isActiveFacility(facility) {
  return facility.is_active !== false;
}

function canonicalServiceName(value) {
  const name = normalizedText(value);
  const aliases = {
    cardiology: 'cardiologist',
    pediatrics: 'pediatrician',
    orthopedics: 'orthopedic',
    psychiatry: 'psychiatric',
    ophthalmology: 'ophthalmologist',
    dentistry: 'dentist'
  };
  return aliases[name] || name;
}

function createFacilityRecords(facilities, branches) {
  const activeFacilities = facilities.filter(isActiveFacility);
  const facilitiesById = new Map(activeFacilities.map(facility => [facility.facility_id, facility]));
  const facilityRecords = activeFacilities.map(facility => ({ facility, branch: null }));
  const branchRecords = branches
    .filter(branch => branch.is_active !== false)
    .map(branch => ({
      facility: facilitiesById.get(branch.facility_id),
      branch
    }))
    .filter(record => record.facility);

  return [...facilityRecords, ...branchRecords];
}

function servicesFor(record) {
  return parseServicesOffered(record.facility.services_offered);
}

function matchesSearchFilters(record, { name, location }) {
  const normalizedName = normalizedText(name);
  const normalizedLocation = normalizedText(location);
  const facilityName = normalizedText([
    record.facility.name,
    record.branch && record.branch.name
  ].filter(Boolean).join(' '));
  const facilityLocation = normalizedText([
    record.branch && record.branch.address,
    record.facility.address,
    record.facility.location
  ].filter(Boolean).join(' '));

  return matchesSearchTerm(normalizedName, facilityName) &&
    matchesSearchTerm(normalizedLocation, facilityLocation);
}

function matchesCategory(record, category) {
  const normalizedCategory = canonicalServiceName(category);
  return !normalizedCategory ||
    servicesFor(record).some(service => canonicalServiceName(service) === normalizedCategory);
}

function toFacilityPayload(record) {
  const { facility, branch } = record;
  const parentName = facility.name || 'Healthcare Facility';
  const branchName = branch && branch.name;
  const name = branch
    ? branchName && normalizedText(branchName).includes(normalizedText(parentName))
      ? branchName
      : `${parentName} - ${branchName || 'Clinic Branch'}`
    : parentName;
  const address = branch?.address || facility.location || facility.address || '';

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
    services: servicesFor(record),
    imageUrl: branch?.logo_path || facility.logo_path || facility.image_url || null
  };
}

function filterFacilities(facilities, filters = {}, branches = []) {
  const records = createFacilityRecords(facilities || [], branches || []);
  const searchedRecords = records.filter(record => matchesSearchFilters(record, filters));
  const services = [...new Set(searchedRecords.flatMap(servicesFor))]
    .sort((a, b) => a.localeCompare(b));
  const matchedFacilities = searchedRecords
    .filter(record => matchesCategory(record, filters.category))
    .map(toFacilityPayload);

  return { facilities: matchedFacilities, services };
}

module.exports = { filterFacilities };
