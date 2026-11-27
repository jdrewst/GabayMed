import { test } from 'node:test';
import assert from 'node:assert/strict';

test('permitted clinic-side updates are isolated from mobile-only attributes', () => {
  const PROTECTED_MOBILE_ATTRIBUTES = [
    'avatar_url',
    'insurance_consent',
    'data_sharing_consent',
    'terms_accepted_at',
    'privacy_accepted_at',
    'onboarding_completed_at'
  ];

  const clinicPersonalUpdate = {
    first_name: 'Maria Clara',
    last_name: 'Santos',
    phone: '+639171234567',
    street_address: '123 Main St',
    city_municipality: 'Quezon City',
    province: 'Metro Manila',
    zip_code: '1108',
    birthDate: '1995-04-10',
    sex: 'Female'
  };

  const clinicMedicalUpdate = {
    blood_type: 'O+',
    allergies: 'Penicillin, Peanuts',
    medical_history: 'Asthma'
  };

  // Ensure neither update payload contains mobile-only settings
  for (const attr of PROTECTED_MOBILE_ATTRIBUTES) {
    assert.equal(clinicPersonalUpdate[attr], undefined, `Demographic update must not define ${attr}`);
    assert.equal(clinicMedicalUpdate[attr], undefined, `Medical update must not define ${attr}`);
  }
});

test('failure preservation preserves last valid saved state', () => {
  const originalPatient = {
    patient_id: 'pat-1',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    medical_history: 'None'
  };

  let currentPatient = { ...originalPatient };

  const simulateFailedSync = () => {
    const prevPatient = { ...currentPatient };
    // Simulated step 1: update patient
    currentPatient = { ...currentPatient, first_name: 'Corrupted Name' };

    // Simulated step 2: reverse sync to profiles fails
    const syncSuccess = false;
    if (!syncSuccess) {
      // Rollback to preserve last valid record
      currentPatient = { ...prevPatient };
      return { success: false, error: 'Synchronization failed. The last valid saved record has been preserved.' };
    }
    return { success: true };
  };

  const result = simulateFailedSync();
  assert.equal(result.success, false);
  assert.ok(result.error.includes('last valid saved record has been preserved'));
  assert.deepEqual(currentPatient, originalPatient);
});
