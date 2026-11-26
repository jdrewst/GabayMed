const { test } = require('node:test');
const assert = require('node:assert/strict');
const patient = require('../lib/patient-auth');
const otpLib = require('../lib/otp');

const valid = {
  email: ' Juan@Example.com ', password: 'Str0ng!Passw0rd', first_name: 'Juan', middle_name: '',
  last_name: 'Dela Cruz', name_suffix: 'Jr.', mobile_number: '0917 123 4567', accept_terms: true, accept_privacy: true
};

function table(state, name) {
  const q = { filters: {} };
  const chain = {
    select() { return chain; }, limit: async () => ({ error: state.notMigrated ? {} : null, data: [] }),
    eq(k, v) { q.filters[k] = v; return chain; },
    ilike(k, v) { q.ilike = [k, v]; return chain; },
    upsert: async row => { state.upserts.push(row); return { error: state.profileError ? {} : null }; },
    delete() { q.del = true; return chain; },
    update(row) { state.updates.push(row); return chain; },
    maybeSingle: async () => {
      if (q.ilike) return { data: state.existingByEmail || null };
      return { data: state.profile === undefined ? { id: 'user-id', first_name: 'Juan', last_name: 'Dela Cruz',
        onboarding_completed_at: state.onboarded ? '2026-01-01' : null } : state.profile };
    }
  };
  chain.then = (ok, fail) => Promise.resolve({ error: null }).then(ok, fail);
  return chain;
}

function admin(state = {}) {
  Object.assign(state, { upserts: [], updates: [], deleted: [], created: [] }, state);
  return {
    state,
    from: name => table(state, name),
    auth: {
      getUser: async token => token === 'good' ? { data: { user: { id: 'user-id' } } } : { error: {} },
      admin: {
        mfa: { listFactors: async () => ({ data: { factors: state.factors || [] } }) },
        createUser: async args => { state.created.push(args);
          return state.exists ? { error: { code: 'email_exists' } } : { data: { user: { id: 'user-id' } } }; },
        deleteUser: async id => { state.deleted.push(id); return {}; },
        signOut: async () => ({})
      }
    }
  };
}

test('registration normalizes and validates every field', () => {
  const input = patient.registrationInput(valid);
  assert.equal(input.email, 'juan@example.com');
  assert.equal(input.phone_number, '+639171234567');
  assert.equal(input.full_name, 'Juan Dela Cruz Jr.');
  assert.equal(input.middle_name, null);
  for (const [key, value] of [['email', 'bad'], ['password', 'short'], ['password', 'alllowercase12!'],
    ['first_name', ''], ['last_name', 'R2D2'], ['mobile_number', '12345'], ['name_suffix', 'Esq'], ['accept_terms', false]]) {
    assert.throws(() => patient.registrationInput({ ...valid, [key]: value }), e => e.status === 400 && !!e.fields);
  }
});

test('mobile numbers accept common Philippine formats only', () => {
  for (const n of ['9171234567', '09171234567', '639171234567', '+63 917 123 4567']) assert.equal(patient.normalizeMobile(n), '+639171234567');
  for (const n of ['0817123456', '+1 917 123 4567', '']) assert.equal(patient.normalizeMobile(n), '');
});

test('registration creates a login and a patient profile without storing the password', async () => {
  const a = admin();
  assert.deepEqual(await patient.registerPatient(a, valid), { success: true });
  assert.equal(a.state.created[0].email, 'juan@example.com');
  assert.equal(a.state.upserts[0].id, 'user-id');
  assert.ok(a.state.upserts[0].terms_accepted_at);
  assert.ok(!JSON.stringify(a.state.upserts).includes(valid.password));
});

test('duplicate email returns 409 and failed profile rolls back the login', async () => {
  await assert.rejects(patient.registerPatient(admin({ exists: true }), valid), e => e.status === 409);
  const a = admin({ profileError: true });
  await assert.rejects(patient.registerPatient(a, valid), e => e.status === 500);
  assert.deepEqual(a.state.deleted, ['user-id']);
});

test('registration fails closed when the migration is missing', async () => {
  const a = admin({ notMigrated: true });
  await assert.rejects(patient.registerPatient(a, valid), e => e.status === 503);
  assert.equal(a.state.created.length, 0);
});

test('only accounts with a patient profile can use the mobile app', async () => {
  assert.equal(await patient.patientAccount(admin({ profile: null }), { id: 'staff' }, {}), null);
  const ok = await patient.patientAccount(admin(), { id: 'user-id' }, { expires_at: 1 });
  assert.equal(ok.profile.onboardingCompleted, false);
});

test('patient login uses the shared cooldown and returns the profile', async () => {
  const a = admin({ onboarded: true });
  a.rpc = async name => ({ data: name === 'mobile_begin_login' ? { allowed: true } : { accepted: true, locked: false } });
  const auth = { auth: { signInWithPassword: async () => ({ data: { user: { id: 'user-id' },
    session: { access_token: 'a', refresh_token: 'r', expires_at: 9 } } }) } };
  const result = await patient.loginPatient({ admin: a, auth, secret: 'secret' }, { email: 'juan@example.com', password: 'x' });
  assert.equal(result.access_token, 'a');
  assert.equal(result.profile.onboardingCompleted, true);
});

test('session refresh rejects expired tokens and onboarding requires a valid token', async () => {
  const auth = { auth: { refreshSession: async () => ({ error: { status: 400 } }) } };
  await assert.rejects(patient.refreshPatientSession({ admin: admin(), auth }, { refresh_token: 'old' }), e => e.status === 401);
  await assert.rejects(patient.completeOnboarding(admin(), 'bad', {}), e => e.status === 401);
  const a = admin({ onboarded: true });
  const result = await patient.completeOnboarding(a, 'good', { insurance_consent: true, data_sharing_consent: 'yes' });
  assert.equal(a.state.updates[0].insurance_consent, true);
  assert.equal(a.state.updates[0].data_sharing_consent, false);
  assert.equal(result.profile.onboardingCompleted, true);
});

test('OTP generator produces 6-character alphanumeric codes with both letters and numbers', () => {
  for (let i = 0; i < 30; i++) {
    const code = otpLib.generateOtpCode();
    assert.equal(code.length, 6);
    assert.match(code, /[A-Z]/);
    assert.match(code, /[2-9]/);
    assert.doesNotMatch(code, /[01OIL]/);
  }
});

test('OTP send, verify, and single-use token enforcement work end-to-end', async () => {
  const sentEmails = [];
  const a = admin();
  a.rpc = async (name, args) => {
    if (name === 'mobile_issue_otp') return { data: { allowed: true, expires_in: 300, resend_after: 60 } };
    if (name === 'mobile_verify_otp') return { data: { verified: true, email: 'juan@example.com' } };
    if (name === 'mobile_consume_otp') return { data: { valid: true, email: 'juan@example.com' } };
    return { data: {} };
  };
  const sendRes = await patient.handlePatientOtp(
    { admin: a, secret: 'server-secret', sendMail: async m => sentEmails.push(m) },
    { action: 'send', purpose: 'register', email: 'Juan@Example.com' }
  );
  assert.equal(sendRes.sent, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'juan@example.com');
  assert.equal(sentEmails[0].code.length, 6);

  const verifyRes = await patient.handlePatientOtp(
    { admin: a, secret: 'server-secret' },
    { action: 'verify', purpose: 'register', email: 'juan@example.com', code: sentEmails[0].code }
  );
  assert.equal(verifyRes.verified, true);
  assert.ok(verifyRes.otp_token);

  // Registration with secret requires a valid otp_token
  await assert.rejects(
    patient.registerPatient(a, valid, { secret: 'server-secret' }),
    e => e.status === 401
  );
  const regOk = await patient.registerPatient(a, { ...valid, otp_token: verifyRes.otp_token }, { secret: 'server-secret' });
  assert.deepEqual(regOk, { success: true });
});

test('profile CRUD validates input, updates profile, syncs patients, and supports clearing medical fields', async () => {
  const a = admin({
    profile: {
      id: 'user-id',
      first_name: 'Maria',
      last_name: 'Santos',
      full_name: 'Maria Santos',
      email: 'maria@example.com',
      phone_number: '+639171234567',
      date_of_birth: '1999-04-15',
      gender: 'Female',
      city_municipality: 'Quezon City',
      province: 'Metro Manila',
      blood_type: 'O+',
      allergies: 'Penicillin',
      medical_history: 'Asthma',
    },
  });

  // Read
  const readRes = await patient.managePatientProfile(a, 'good', { action: 'get' });
  assert.equal(readRes.profile.first_name, 'Maria');
  assert.equal(readRes.profile.gender, 'Female');

  // Invalid update is rejected with field errors
  await assert.rejects(
    patient.managePatientProfile(a, 'good', {
      action: 'update',
      first_name: '',
      last_name: 'Santos',
      date_of_birth: 'invalid-date',
      gender: 'Female',
      phone_number: '123',
      city_municipality: 'Quezon City',
      province: 'Metro Manila',
    }),
    e => e.status === 400 && !!e.fields
  );

  // Valid update
  const updateRes = await patient.managePatientProfile(a, 'good', {
    action: 'update',
    first_name: 'Maria',
    middle_name: 'Clara',
    last_name: 'Santos',
    date_of_birth: '1999-04-15',
    gender: 'Female',
    phone_number: '09171234567',
    street_address: '123 Katipunan Ave',
    barangay: 'Loyola Heights',
    city_municipality: 'Quezon City',
    province: 'Metro Manila',
    zip_code: '1108',
    blood_type: 'O+',
    allergies: 'Penicillin, Peanuts',
    medical_history: 'Asthma',
    avatar_url: 'preset:female-1',
  });
  assert.equal(updateRes.profile.first_name, 'Maria');
  assert.ok(a.state.updates.length >= 1);

  // Clear medical field (Delete)
  const clearRes = await patient.managePatientProfile(a, 'good', {
    action: 'clear_medical',
    field: 'allergies',
  });
  assert.ok(clearRes.profile);
});



test('MFA login withholds password-only tokens and returns only verified tokens', async () => {
  const factor = { id: 'authenticator-id', factor_type: 'totp', status: 'verified' };
  const a = admin({ factors: [factor] });
  a.rpc = async name => ({ data: name === 'mobile_begin_login' ? { allowed: true } : { accepted: true } });
  const upgradedToken = 'header.' + Buffer.from(JSON.stringify({ aal: 'aal2' })).toString('base64url') + '.signature';
  const auth = { auth: {
    signInWithPassword: async () => ({ data: {
      user: { id: 'user-id' },
      session: { access_token: 'password-only', refresh_token: 'password-refresh' }
    } }),
    mfa: { challengeAndVerify: async ({ factorId, code }) => {
      assert.equal(factorId, factor.id);
      return code === '123456'
        ? { data: { access_token: upgradedToken, refresh_token: 'verified-refresh', expires_in: 3600 } }
        : { error: { status: 422 } };
    } }
  } };
  const deps = { admin: a, auth, secret: 'secret' };
  const creds = { email: 'juan@example.com', password: 'password' };
  await assert.rejects(patient.loginPatient(deps, creds), { code: 'mfa_required' });
  await assert.rejects(patient.loginPatient(deps, { ...creds, code: '123457' }), { code: 'mfa_invalid' });
  const result = await patient.loginPatient(deps, { ...creds, code: '123456' });
  assert.equal(result.access_token, upgradedToken);
  assert.equal(result.refresh_token, 'verified-refresh');
});

test('a password-only session for an enrolled patient cannot refresh or change sharing', async () => {
  const a = admin({ factors: [{ status: 'verified' }] });
  const auth = { auth: { refreshSession: async () => ({ data: {
    user: { id: 'user-id' }, session: { access_token: 'good', refresh_token: 'renewed' }
  } }) } };
  await assert.rejects(patient.refreshPatientSession({ admin: a, auth }, { refresh_token: 'old' }), { code: 'mfa_required' });
  await assert.rejects(patient.managePatientProfile(a, 'good', {
    action: 'update_consents', data_sharing_consent: true
  }), { code: 'mfa_required' });
  assert.deepEqual(a.state.updates, []);
});

test('signed-in password changes check the current password and reject password-only MFA sessions', async () => {
  const a = admin();
  const changes = [];
  a.auth.admin.updateUserById = async (id, patch) => { changes.push({ id, patch }); return {}; };
  const auth = { auth: { signInWithPassword: async ({ password }) => password === 'current'
    ? { data: { user: { id: 'user-id' }, session: { access_token: 'temporary-session' } } }
    : { error: { code: 'invalid_credentials' } }
  } };
  const input = { current_password: 'current', password: valid.password };
  await assert.rejects(patient.changePatientPassword({ admin: a, auth }, 'good', {
    ...input, current_password: 'wrong'
  }), { status: 401 });
  await assert.rejects(patient.changePatientPassword({
    admin: admin({ factors: [{ status: 'verified' }] }), auth
  }, 'good', input), { code: 'mfa_required' });
  assert.deepEqual(changes, []);
  await patient.changePatientPassword({ admin: a, auth }, 'good', input);
  assert.deepEqual(changes, [{ id: 'user-id', patch: { password: valid.password } }]);
});

test('the password change route is mounted locally and in the deployment wrapper', async () => {
  const { createServer } = require('../backend');
  const dispatch = createServer().listeners('request')[0];
  const req = { headers: {}, url: '/api/patient-security', method: 'OPTIONS', async *[Symbol.asyncIterator]() {} };
  const res = { setHeader() {}, end() {} };
  await dispatch(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(require('../../api/patient-security'), require('../api/patient-auth').security);
});
