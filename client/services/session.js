// Verified account context for UI filtering. Database RLS remains the access boundary.
let facilityId = null;
export const Session = {
  getFacilityId() {
    if (!facilityId) throw new Error('Sign in with an account assigned to a clinic.');
    return facilityId;
  },
  setFacilityId(id) { facilityId = id || null; },
  clear() {
    facilityId = null;
    for (const key of ['gabay_auth', 'gabay_facility_id', 'gabay_facility_data', 'gabay_last_activity']) localStorage.removeItem(key);
  }
};
