function normalizedText(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function serviceList(facility) {
  return Array.isArray(facility.services_offered)
    ? facility.services_offered.filter(service => typeof service === 'string' && service.trim())
    : [];
}

function isActiveFacility(facility) {
  // Older facility records do not yet carry an is_active value; keep them visible.
  return facility.is_active !== false;
}

function matchesFilters(facility, { category, name, location }) {
  const normalizedCategory = normalizedText(category);
  const normalizedName = normalizedText(name);
  const normalizedLocation = normalizedText(location);
  const services = serviceList(facility).map(normalizedText);
  const facilityName = normalizedText(facility.name);
  const facilityLocation = normalizedText([facility.address, facility.location].filter(Boolean).join(' '));

  return (!normalizedCategory || services.includes(normalizedCategory)) &&
    (!normalizedName || facilityName.includes(normalizedName)) &&
    (!normalizedLocation || facilityLocation.includes(normalizedLocation));
}

function toFacilityPayload(facility) {
  return {
    id: facility.facility_id,
    name: facility.name,
    address: facility.address || facility.location || '',
    location: facility.location || facility.address || '',
    latitude: facility.lat ?? null,
    longitude: facility.long ?? null,
    isGabay: Boolean(facility.is_gabay),
    services: serviceList(facility),
    imageUrl: facility.image_url || null
  };
}

function filterFacilities(facilities, filters = {}) {
  const activeFacilities = facilities.filter(isActiveFacility);
  const services = [...new Set(activeFacilities.flatMap(serviceList))].sort((a, b) => a.localeCompare(b));
  return { facilities: activeFacilities.filter(facility => matchesFilters(facility, filters)).map(toFacilityPayload), services };
}

module.exports = { filterFacilities };

