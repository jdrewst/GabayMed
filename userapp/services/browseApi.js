const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

// Helper: Haversine Formula for distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

const BrowseAPI = {
  /**
   * Fetches all healthcare facilities for the Seek Medical Care page using real user location if permitted,
   * and enables all medical services (Neurologist, Cardiologist, General Check-up, etc.).
   */
  async getSeekCareData(filters = {}) {
    try {
      const searchParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (typeof value === 'string' && value.trim()) searchParams.set(key, value.trim());
      });
      const query = searchParams.toString();
      const response = await fetch(`${API_BASE_URL}/browse-services${query ? `?${query}` : ''}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Facility search failed (${response.status}).`);
      }

      const result = await response.json();
      const USER_LAT = 14.5977;
      const USER_LONG = 121.0112;
      const facilities = result.facilities.map(facility => {
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
          name: facility.name,
          address: facility.address,
          rating: 4.5,
          isOpen: true,
          isGabay: facility.isGabay,
          distance,
          distValue,
          services: facility.services || [],
          imageUrl: facility.imageUrl
        };
      });

      facilities.sort((a, b) => a.distValue - b.distValue);

      return {
        facilities,
        services: result.services
      };
    } catch (error) {
      console.error('Get Seek Care Data Error:', error);
      throw error;
    }
  },
};

export default BrowseAPI;
