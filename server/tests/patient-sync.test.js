const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reverseSyncPatientToProfile, updatePatientRecordAndSync } = require('../lib/patient-auth');

function createMockAdmin(initialState = {}) {
  const state = {
    patients: [...(initialState.patients || [])],
    profiles: [...(initialState.profiles || [])],
    users: [...(initialState.users || [])],
    failProfileUpdate: initialState.failProfileUpdate || false,
    updates: [],
  };

  const admin = {
    state,
    from(tableName) {
      let queryTable = tableName;
      let filters = {};
      let selectedCols = '*';

      const chain = {
        select(cols) {
          selectedCols = cols;
          return chain;
        },
        eq(col, val) {
          filters[col] = String(val);
          return chain;
        },
        maybeSingle: async () => {
          const list = state[queryTable] || [];
          const found = list.find(row => {
            return Object.entries(filters).every(([k, v]) => String(row[k]) === String(v));
          });
          return { data: found ? { ...found } : null, error: null };
        },
        single: async () => {
          const res = await chain.maybeSingle();
          if (!res.data) return { data: null, error: { message: 'Row not found' } };
          return res;
        },
        update(patch) {
          const updatePatch = patch;
          const updateChain = {
            eq(col, val) {
              filters[col] = String(val);
              return updateChain;
            },
            select(cols) {
              return updateChain;
            },
            maybeSingle: async () => {
              state.updates.push({ table: queryTable, patch: updatePatch, filters: { ...filters } });
              if (queryTable === 'profiles' && state.failProfileUpdate) {
                return { data: null, error: { message: 'Database update failed' } };
              }
              const list = state[queryTable] || [];
              let lastRow = null;
              for (let i = 0; i < list.length; i++) {
                const row = list[i];
                const matches = Object.entries(filters).every(([k, v]) => String(row[k]) === String(v));
                if (matches) {
                  list[i] = { ...row, ...updatePatch };
                  lastRow = list[i];
                }
              }
              return { data: lastRow, error: null };
            },
            single: async () => {
              const res = await updateChain.maybeSingle();
              if (!res.data) return { data: null, error: { message: 'Row not found' } };
              return res;
            },
            then(resolve, reject) {
              return updateChain.maybeSingle().then(resolve, reject);
            }
          };
          return updateChain;
        }
      };
      return chain;
    },
    auth: {
      getUser: async token => {
        if (token === 'staff-token') {
          return { data: { user: { id: 'staff-user-id', app_metadata: {} } } };
        }
        return { error: { message: 'Invalid session' } };
      }
    }
  };

  return admin;
}

test('reverse synchronization propagates permitted demographic changes to linked profile', async () => {
  const initialPatient = {
    patient_id: 'pat-101',
    profile_id: 'prof-202',
    facility_id: 'fac-1',
    first_name: 'Maria',
    last_name: 'Santos',
    full_name: 'Maria Santos',
    phone_number: '+639171112233',
    date_of_birth: '1995-05-10',
    gender: 'Female',
    address: '123 Main St, Barangay 1, Manila, Metro Manila, 1000'
  };

  const initialProfile = {
    id: 'prof-202',
    first_name: 'Maria',
    middle_name: '',
    last_name: 'Santos',
    name_suffix: '',
    full_name: 'Maria Santos',
    email: 'maria@example.com',
    phone_number: '+639171112233',
    date_of_birth: '1995-05-10',
    gender: 'Female',
    street_address: '123 Main St',
    barangay: 'Barangay 1',
    city_municipality: 'Manila',
    province: 'Metro Manila',
    zip_code: '1000',
    address: '123 Main St, Barangay 1, Manila, Metro Manila, 1000',
    blood_type: 'O+',
    allergies: 'Penicillin',
    medical_history: 'Asthma',
    avatar_url: 'preset:female-1',
    insurance_consent: true,
    data_sharing_consent: true,
    terms_accepted_at: '2026-01-01T00:00:00Z',
    onboarding_completed_at: '2026-01-01T00:00:00Z'
  };

  const admin = createMockAdmin({
    patients: [initialPatient],
    profiles: [initialProfile]
  });

  const updates = {
    first_name: 'Maria Clara',
    last_name: 'Santos-Reyes',
    phone_number: '0918 999 8877',
    street_address: '456 Katipunan Ave',
    barangay: 'Loyola Heights',
    city_municipality: 'Quezon City',
    province: 'Metro Manila',
    zip_code: '1108',
    date_of_birth: '1995-05-12'
  };

  const result = await reverseSyncPatientToProfile(admin, 'pat-101', updates);

  assert.equal(result.success, true);
  assert.equal(result.synced, true);
  assert.equal(result.profileId, 'prof-202');
  assert.equal(result.profile.first_name, 'Maria Clara');
  assert.equal(result.profile.last_name, 'Santos-Reyes');
  assert.equal(result.profile.full_name, 'Maria Clara Santos-Reyes');
  assert.equal(result.profile.phone_number, '+639189998877');
  assert.equal(result.profile.city_municipality, 'Quezon City');
  assert.equal(result.profile.date_of_birth, '1995-05-12');

  const updatedProfileRow = admin.state.profiles.find(p => p.id === 'prof-202');
  assert.equal(updatedProfileRow.first_name, 'Maria Clara');
  assert.equal(updatedProfileRow.phone_number, '+639189998877');
});

test('reverse synchronization propagates permitted medical summary changes to linked profile', async () => {
  const initialPatient = {
    patient_id: 'pat-102',
    profile_id: 'prof-203',
    facility_id: 'fac-1',
    medical_history: 'None'
  };

  const initialProfile = {
    id: 'prof-203',
    first_name: 'Juan',
    last_name: 'Luna',
    full_name: 'Juan Luna',
    blood_type: 'Unknown',
    allergies: 'None',
    medical_history: 'None',
    avatar_url: 'preset:male-2',
    insurance_consent: true,
    data_sharing_consent: false
  };

  const admin = createMockAdmin({
    patients: [initialPatient],
    profiles: [initialProfile]
  });

  const medicalUpdates = {
    blood_type: 'AB+',
    allergies: 'Aspirin, Peanuts, Seafood',
    medical_history: 'Hypertension, Type 2 Diabetes'
  };

  const result = await reverseSyncPatientToProfile(admin, 'pat-102', medicalUpdates);

  assert.equal(result.success, true);
  assert.equal(result.profile.blood_type, 'AB+');
  assert.equal(result.profile.allergies, 'Aspirin, Peanuts, Seafood');
  assert.equal(result.profile.medical_history, 'Hypertension, Type 2 Diabetes');

  const updatedProfileRow = admin.state.profiles.find(p => p.id === 'prof-203');
  assert.equal(updatedProfileRow.blood_type, 'AB+');
  assert.equal(updatedProfileRow.allergies, 'Aspirin, Peanuts, Seafood');
  assert.equal(updatedProfileRow.medical_history, 'Hypertension, Type 2 Diabetes');
});

test('reverse synchronization strictly protects mobile-only profile attributes', async () => {
  const initialPatient = {
    patient_id: 'pat-103',
    profile_id: 'prof-204',
    facility_id: 'fac-1',
    first_name: 'Ana',
    last_name: 'Gomez'
  };

  const initialProfile = {
    id: 'prof-204',
    first_name: 'Ana',
    last_name: 'Gomez',
    full_name: 'Ana Gomez',
    avatar_url: 'https://example.com/custom-avatar-selected-by-patient.jpg',
    insurance_consent: true,
    data_sharing_consent: false,
    terms_accepted_at: '2026-02-01T12:00:00Z',
    privacy_accepted_at: '2026-02-01T12:00:00Z',
    onboarding_completed_at: '2026-02-01T12:00:00Z'
  };

  const admin = createMockAdmin({
    patients: [initialPatient],
    profiles: [initialProfile]
  });

  // Attempt to overwrite protected mobile-only attributes
  const hostileUpdates = {
    first_name: 'Ana Maria',
    avatar_url: 'preset:corrupted-avatar',
    insurance_consent: false,
    data_sharing_consent: true,
    terms_accepted_at: 'corrupted-timestamp',
    onboarding_completed_at: null
  };

  const result = await reverseSyncPatientToProfile(admin, 'pat-103', hostileUpdates);

  assert.equal(result.success, true);
  // Permitted demographic field was updated
  assert.equal(result.profile.first_name, 'Ana Maria');

  // Mobile-only attributes MUST NOT be altered
  const profileInDb = admin.state.profiles.find(p => p.id === 'prof-204');
  assert.equal(profileInDb.avatar_url, 'https://example.com/custom-avatar-selected-by-patient.jpg');
  assert.equal(profileInDb.insurance_consent, true);
  assert.equal(profileInDb.data_sharing_consent, false);
  assert.equal(profileInDb.terms_accepted_at, '2026-02-01T12:00:00Z');
  assert.equal(profileInDb.onboarding_completed_at, '2026-02-01T12:00:00Z');
});

test('if synchronization fails during clinic save, preserves last valid saved record and raises error', async () => {
  const initialPatient = {
    patient_id: 'pat-104',
    profile_id: 'prof-205',
    facility_id: 'fac-1',
    first_name: 'Pedro',
    last_name: 'Penduko',
    full_name: 'Pedro Penduko',
    phone_number: '+639170000000'
  };

  const initialProfile = {
    id: 'prof-205',
    first_name: 'Pedro',
    last_name: 'Penduko',
    full_name: 'Pedro Penduko',
    phone_number: '+639170000000'
  };

  const admin = createMockAdmin({
    patients: [initialPatient],
    profiles: [initialProfile],
    failProfileUpdate: true
  });

  const staffActor = {
    id: 'staff-1',
    role: 'Hospital Staff',
    facility_id: 'fac-1'
  };

  const updates = {
    first_name: 'Pedro Junior',
    phone_number: '09191234567'
  };

  await assert.rejects(
    updatePatientRecordAndSync(admin, staffActor, { patientId: 'pat-104', updates }),
    err => {
      assert.equal(err.status, 503);
      assert.ok(err.message.includes('Synchronization failed'));
      assert.ok(err.message.includes('last valid saved record has been preserved'));
      return true;
    }
  );

  // Verify that the patient record was rolled back to its initial valid state
  const patientInDb = admin.state.patients.find(p => p.patient_id === 'pat-104');
  assert.equal(patientInDb.first_name, 'Pedro');
  assert.equal(patientInDb.phone_number, '+639170000000');

  // Verify that the profile record in db was not corrupted
  const profileInDb = admin.state.profiles.find(p => p.id === 'prof-205');
  assert.equal(profileInDb.first_name, 'Pedro');
  assert.equal(profileInDb.phone_number, '+639170000000');
});

test('reverse synchronization gracefully handles unlinked walk-in patients', async () => {
  const walkInPatient = {
    patient_id: 'pat-105',
    profile_id: null,
    facility_id: 'fac-1',
    first_name: 'WalkIn',
    last_name: 'Patient'
  };

  const admin = createMockAdmin({
    patients: [walkInPatient],
    profiles: []
  });

  const result = await reverseSyncPatientToProfile(admin, 'pat-105', { first_name: 'Updated WalkIn' });
  assert.equal(result.success, true);
  assert.equal(result.synced, false);
  assert.equal(result.reason, 'unlinked');
});

test('patient sync endpoint enforces POST, authentication, and origin rules', async () => {
  const handler = require('../api/patient-sync');

  const makeRes = () => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
      end() { return this; }
    };
    return res;
  };

  // Method check
  const resGet = makeRes();
  await handler({ method: 'GET', headers: {} }, resGet);
  assert.equal(resGet.statusCode, 405);

  // OPTIONS preflight check
  const resOpt = makeRes();
  await handler({ method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }, resOpt);
  assert.equal(resOpt.statusCode, 204);
  assert.equal(resOpt.headers['access-control-allow-origin'], 'http://localhost:5173');

  // Disallowed origin check
  const resBadOrigin = makeRes();
  await handler({ method: 'POST', headers: { origin: 'http://malicious-site.com' } }, resBadOrigin);
  assert.equal(resBadOrigin.statusCode, 403);

  // Missing bearer token
  const resNoAuth = makeRes();
  await handler({ method: 'POST', headers: {} }, resNoAuth);
  assert.equal(resNoAuth.statusCode, 401);
});

test('AC1 & AC2: clinic-side updates appear accurately upon refresh/login without overwriting mobile settings', async () => {
  const patientRow = {
    patient_id: 'pat-verify',
    profile_id: 'prof-verify',
    facility_id: 'fac-1',
    first_name: 'Original',
    last_name: 'Name',
    full_name: 'Original Name',
    phone_number: '+639170001111',
    date_of_birth: '1990-01-01',
    gender: 'Male',
    medical_history: 'None'
  };

  const mobileProfile = {
    id: 'prof-verify',
    first_name: 'Original',
    middle_name: '',
    last_name: 'Name',
    name_suffix: '',
    full_name: 'Original Name',
    email: 'patient@example.com',
    phone_number: '+639170001111',
    date_of_birth: '1990-01-01',
    gender: 'Male',
    street_address: 'Original St',
    barangay: 'Brgy 1',
    city_municipality: 'Manila',
    province: 'Metro Manila',
    zip_code: '1000',
    address: 'Original St, Brgy 1, Manila, Metro Manila, 1000',
    blood_type: 'O+',
    allergies: 'None',
    medical_history: 'None',
    avatar_url: 'preset:custom-avatar-123',
    insurance_consent: true,
    data_sharing_consent: true,
    terms_accepted_at: '2026-01-01T00:00:00Z',
    onboarding_completed_at: '2026-01-01T00:00:00Z'
  };

  const admin = createMockAdmin({
    patients: [patientRow],
    profiles: [mobileProfile]
  });

  // Clinic staff updates demographic & medical summary in Gabay 1.0
  const clinicUpdates = {
    first_name: 'ClinicVerified',
    last_name: 'Patient',
    phone_number: '0917 555 4321',
    blood_type: 'B+',
    allergies: 'Amoxicillin, Pollen',
    medical_history: 'Mild Asthma, GERD'
  };

  const syncResult = await reverseSyncPatientToProfile(admin, 'pat-verify', clinicUpdates);
  assert.equal(syncResult.success, true);
  assert.equal(syncResult.synced, true);

  // When patient fetches/refreshes their profile in Gabay 2.0 mobile:
  const profileFetch = await admin.from('profiles').select('*').eq('id', 'prof-verify').maybeSingle();
  const patientProfile = profileFetch.data;

  // 1. Permitted demographic and medical summary fields reflect clinic edits:
  assert.equal(patientProfile.first_name, 'ClinicVerified');
  assert.equal(patientProfile.last_name, 'Patient');
  assert.equal(patientProfile.full_name, 'ClinicVerified Patient');
  assert.equal(patientProfile.phone_number, '+639175554321');
  assert.equal(patientProfile.blood_type, 'B+');
  assert.equal(patientProfile.allergies, 'Amoxicillin, Pollen');
  assert.equal(patientProfile.medical_history, 'Mild Asthma, GERD');

  // 2. Mobile-only attributes are completely intact:
  assert.equal(patientProfile.avatar_url, 'preset:custom-avatar-123');
  assert.equal(patientProfile.insurance_consent, true);
  assert.equal(patientProfile.data_sharing_consent, true);
  assert.equal(patientProfile.terms_accepted_at, '2026-01-01T00:00:00Z');
  assert.equal(patientProfile.onboarding_completed_at, '2026-01-01T00:00:00Z');
});
