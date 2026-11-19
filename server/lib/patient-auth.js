const { randomBytes } = require('node:crypto');
const { RequestError } = require('./provider-accounts');
const { login, rejected } = require('./login');
const { verifiedFactors, requirePatientMfa } = require('./patient-mfa');
const { purgeAccountFiles } = require('./health-records');
const {
  OTP_TTL_SECONDS, generateOtpCode, challengeKey, codeHash, tokenHash, maskEmail, defaultSendMail,
} = require('./otp');

// Columns added by security/patient-accounts.sql.
const PROFILE_COLUMNS = 'id, first_name, middle_name, last_name, name_suffix, full_name, email, onboarding_completed_at';
const FULL_PROFILE_COLUMNS =
  'id, first_name, middle_name, last_name, name_suffix, full_name, email, phone_number, date_of_birth, gender, street_address, barangay, city_municipality, province, zip_code, address, blood_type, allergies, medical_history, avatar_url, insurance_consent, data_sharing_consent, onboarding_completed_at';
const NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

// Same policy as the website: 12-128 characters with upper, lower, number and symbol.
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be 12 to 128 characters long.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Password needs an uppercase letter, a lowercase letter, a number and a symbol.';
  }
  return '';
}

// Accepts 9XXXXXXXXX, 09XXXXXXXXX, 639XXXXXXXXX or +639XXXXXXXXX.
function normalizeMobile(value) {
  const digits = typeof value === 'string' ? value.replace(/[\s()-]/g, '') : '';
  const match = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return match ? '+63' + match[1] : '';
}

function normalizeBirthdate(value) {
  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return '';
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return '';
  if (dt > new Date() || y < 1900) return '';
  return str;
}

function registrationInput(body) {
  if (!body || typeof body !== 'object') throw new RequestError(400, 'Registration details are required.');
  const text = key => typeof body[key] === 'string' ? body[key].trim().replace(/\s+/g, ' ') : '';
  const errors = {};
  const email = text('email').toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
  const problem = passwordProblem(body.password);
  if (problem) errors.password = problem;
  const name = (key, label, required) => {
    const value = text(key);
    if (!value) { if (required) errors[key] = `${label} is required.`; return null; }
    if (value.length > 50 || !NAME.test(value)) errors[key] = `Enter a valid ${label.toLowerCase()}.`;
    return value;
  };
  const first_name = name('first_name', 'First name', true);
  const middle_name = name('middle_name', 'Middle name', false);
  const last_name = name('last_name', 'Last name', true);
  const name_suffix = text('name_suffix') || null;
  if (name_suffix && !SUFFIXES.includes(name_suffix)) errors.name_suffix = 'Choose a valid name extension.';

  const date_of_birth = normalizeBirthdate(body.date_of_birth);
  if (date_of_birth === '') errors.date_of_birth = 'Enter a valid birth date in YYYY-MM-DD format.';

  const gender = text('gender') || null;
  if (gender && !GENDERS.includes(gender)) errors.gender = 'Choose a valid gender option.';

  const phone_number = normalizeMobile(body.mobile_number);
  if (!phone_number) errors.mobile_number = 'Enter a valid Philippine mobile number (9XX XXX XXXX).';

  const street_address = text('street_address') || null;
  const barangay = text('barangay') || null;
  const city_municipality = text('city_municipality') || null;
  const province = text('province') || null;
  const zip_code = text('zip_code') || null;
  if (zip_code && !/^\d{4}$/.test(zip_code)) errors.zip_code = 'Enter a valid 4-digit Philippine ZIP code.';

  const address = [street_address, barangay, city_municipality, province, zip_code].filter(Boolean).join(', ')
    || text('address') || null;

  const blood_type = text('blood_type') || null;
  if (blood_type && !BLOOD_TYPES.includes(blood_type)) errors.blood_type = 'Choose a valid blood type.';

  const allergies = text('allergies') ? text('allergies').slice(0, 500) : null;
  const medical_history = text('medical_history') ? text('medical_history').slice(0, 1000) : null;

  if (body.accept_terms !== true || body.accept_privacy !== true) {
    errors.consent = 'Accept the Terms of Service and Privacy Policy to continue.';
  }
  if (Object.keys(errors).length) {
    throw Object.assign(new RequestError(400, Object.values(errors)[0]), { fields: errors });
  }
  const full_name = [first_name, middle_name, last_name, name_suffix].filter(Boolean).join(' ');
  return {
    email, password: body.password, first_name, middle_name, last_name, name_suffix, full_name,
    date_of_birth, gender, phone_number,
    street_address, barangay, city_municipality, province, zip_code, address,
    blood_type, allergies, medical_history
  };
}

function mapProfile(row) {
  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email || '',
    onboardingCompleted: !!row.onboarding_completed_at
  };
}

async function loadProfile(admin, userId) {
  const result = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (result.error) throw new RequestError(503, 'Your account could not be loaded. Please try again later.');
  return result.data ? mapProfile(result.data) : null;
}

/**
 * Resolves the target email for an OTP challenge.
 * - For 'register': requires a valid email address.
 * - For 'reset': accepts either email or mobile_number (looks up the registered email on the profile).
 */
async function resolveOtpEmail(admin, purpose, body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) {
    throw Object.assign(new RequestError(400, 'Enter a valid email address.'), { fields: { email: 'Enter a valid email address.' } });
  }
  if (purpose === 'register') {
    return email;
  }

  const found = await admin.from('profiles').select('id, email').ilike('email', email).maybeSingle();
  if (found.error) throw new RequestError(503, 'Password reset is temporarily unavailable. Please try again later.');
  if (!found.data?.id || !found.data.email) {
    throw new RequestError(404, 'No patient account was found with that email address.');
  }
  return found.data.email.trim().toLowerCase();
}

/**
 * Issues and emails a 6-character alphanumeric OTP, or verifies a submitted OTP code.
 */
async function handlePatientOtp({ admin, secret, sendMail = defaultSendMail }, body) {
  if (!body || typeof body !== 'object') throw new RequestError(400, 'OTP request details are required.');
  const action = body.action === 'verify' ? 'verify' : 'send';
  const purpose = body.purpose === 'reset' ? 'reset' : 'register';
  const email = await resolveOtpEmail(admin, purpose, body);
  const key = challengeKey(secret, purpose, email);

  if (action === 'send') {
    const code = generateOtpCode();
    const hashedCode = codeHash(secret, purpose, email, code);
    const issued = await admin.rpc('mobile_issue_otp', {
      p_key: key,
      p_purpose: purpose,
      p_email: email,
      p_code_hash: hashedCode,
      p_ttl_seconds: OTP_TTL_SECONDS,
    });
    if (issued.error || !issued.data) {
      throw new RequestError(503, 'OTP verification is not available yet. Run security/mobile-otp.sql in Supabase.');
    }
    if (!issued.data.allowed) {
      const wait = Number(issued.data.retry_after) || 60;
      const reason = issued.data.reason;
      const msg = reason === 'cooldown'
        ? `Please wait ${wait} seconds before requesting another code.`
        : 'Too many OTP requests for this account. Please try again later.';
      throw Object.assign(new RequestError(429, msg), { retryAfter: wait, code: `otp_${reason}` });
    }

    await sendMail({ to: email, code, purpose, context: body.context });
    return {
      sent: true,
      email,
      masked_email: maskEmail(email),
      expires_in: Number(issued.data.expires_in) || OTP_TTL_SECONDS,
      resend_after: Number(issued.data.resend_after) || 60,
    };
  }

  // action === 'verify'
  const rawCode = typeof body.code === 'string' ? body.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  if (rawCode.length !== 6) {
    throw new RequestError(400, 'Enter the 6-character OTP code sent to your email.');
  }
  const verificationToken = randomBytes(24).toString('base64url');
  const hashedCode = codeHash(secret, purpose, email, rawCode);
  const hashedToken = tokenHash(secret, purpose, email, verificationToken);

  const verified = await admin.rpc('mobile_verify_otp', {
    p_key: key,
    p_code_hash: hashedCode,
    p_token_hash: hashedToken,
  });
  if (verified.error || !verified.data) {
    throw new RequestError(503, 'Could not verify the OTP right now. Please try again.');
  }
  if (!verified.data.verified) {
    const reason = verified.data.reason;
    if (reason === 'locked') {
      const wait = Number(verified.data.retry_after) || 900;
      throw Object.assign(
        new RequestError(429, 'Too many incorrect OTP attempts. Please wait 15 minutes and request a new code.'),
        { retryAfter: wait, code: 'otp_locked' }
      );
    }
    if (reason === 'expired') {
      throw new RequestError(400, 'This OTP has expired. Tap Resend to get a new code.');
    }
    const rem = Number(verified.data.remaining);
    throw new RequestError(
      401,
      rem > 0 ? `Incorrect OTP code. ${rem} attempt${rem === 1 ? '' : 's'} remaining.` : 'Incorrect OTP code.'
    );
  }

  return {
    verified: true,
    email,
    otp_token: verificationToken,
  };
}

async function consumeVerifiedOtp(admin, secret, purpose, email, rawToken) {
  if (!secret) return; // Allow unit tests that omit secret
  if (typeof rawToken !== 'string' || !rawToken) {
    throw Object.assign(new RequestError(401, 'Please complete email OTP verification first.'), {
      fields: { otp: 'Please verify the OTP sent to your email.' }
    });
  }
  const key = challengeKey(secret, purpose, email);
  const hashedToken = tokenHash(secret, purpose, email, rawToken);
  const consumed = await admin.rpc('mobile_consume_otp', { p_key: key, p_token_hash: hashedToken });
  if (consumed.error || !consumed.data?.valid) {
    throw Object.assign(new RequestError(401, 'Your OTP verification expired. Please request a new code.'), {
      fields: { otp: 'Your OTP verification expired.' }
    });
  }
}

async function registerPatient(admin, body, { secret } = {}) {
  const input = registrationInput(body);
  const readiness = await admin.from('profiles').select(PROFILE_COLUMNS).limit(1);
  if (readiness.error) throw new RequestError(503, 'Registration is not available yet. Run security/patient-accounts.sql first.');

  await consumeVerifiedOtp(admin, secret, 'register', input.email, body.otp_token);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
    app_metadata: { account_type: 'patient' },
    user_metadata: { full_name: input.full_name }
  });
  if (createError || !created?.user) {
    if (['email_exists', 'user_already_exists'].includes(createError?.code)) {
      throw Object.assign(new RequestError(409, 'An account with this email already exists. Log in instead.'),
        { fields: { email: 'This email is already registered.' } });
    }
    if (createError?.code === 'weak_password') {
      throw Object.assign(new RequestError(400, 'Choose a stronger password.'), { fields: { password: 'Choose a stronger password.' } });
    }
    throw new RequestError(503, 'Your account could not be created. Please try again later.');
  }
  const id = created.user.id;
  // Link to an existing walk-in patient profile created by a clinic (matched by email),
  // or insert a new profile row linked to this Auth user ID.
  const { password, ...profile } = input;
  const payload = {
    ...profile,
    terms_accepted_at: new Date().toISOString(),
    privacy_accepted_at: new Date().toISOString(),
  };
  const existing = await admin.from('profiles').select('id').ilike('email', input.email).maybeSingle();
  let saved;
  if (existing.data && existing.data.id !== id) {
    // Re-key the walk-in profile (and any linked patients rows) to the new Auth user ID.
    const oldId = existing.data.id;
    saved = await admin.from('profiles').update({ id, ...payload }).eq('id', oldId);
    if (!saved.error) {
      await admin.from('patients').update({ profile_id: id }).eq('profile_id', oldId);
    }
  } else {
    saved = await admin.from('profiles').upsert({ id, ...payload }, { onConflict: 'id' });
  }
  if (saved.error) {
    await admin.from('profiles').delete().eq('id', id);
    const cleanup = await admin.auth.admin.deleteUser(id);
    if (cleanup.error) throw new RequestError(500, 'Registration failed and the login needs administrator cleanup before retrying.');
    throw new RequestError(500, 'Registration failed. No account was created. Please try again.');
  }
  return { success: true };
}

/**
 * Forgot password (with verified OTP token):
 */
async function resetPatientPassword(admin, body, { secret } = {}) {
  if (!body || typeof body !== 'object') throw new RequestError(400, 'Reset details are required.');
  const email = await resolveOtpEmail(admin, 'reset', body);

  const problem = passwordProblem(body.password);
  if (problem) throw new RequestError(400, problem);

  await consumeVerifiedOtp(admin, secret, 'reset', email, body.otp_token);

  const found = await admin.from('profiles').select('id, email').ilike('email', email).maybeSingle();
  if (found.error || !found.data?.id) {
    throw new RequestError(404, 'No patient account was found with that email address.');
  }

  const updated = await admin.auth.admin.updateUserById(found.data.id, { password: body.password });
  if (updated.error) {
    throw new RequestError(503, 'Could not update your password. Please try again later.');
  }
  return { success: true, email: found.data.email || email };
}

// Only accounts with a patient profile may use the mobile app.
async function patientAccount(admin, user, session) {
  const profile = await loadProfile(admin, user.id);
  if (!profile) return null;
  requirePatientMfa(await verifiedFactors(admin, user.id), session.access_token);
  return { expires_at: session.expires_at, profile };
}

function loginPatient(deps, body) {
  return login({ ...deps, authorize: async (admin, user, session) => {
    const profile = await loadProfile(admin, user.id);
    if (!profile) return null;
    const factors = await verifiedFactors(admin, user.id);
    if (!factors.length) return { expires_at: session.expires_at, profile };
    const factor = factors.find(item => item.factor_type === 'totp');
    if (!factor) throw rejected(403, 'Contact support to use your enrolled authentication method.');
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      throw rejected(401, 'Enter the six-digit code from your authenticator app.', 0, 'mfa_required');
    }
    const { data, error } = await deps.auth.auth.mfa.challengeAndVerify({
      factorId: factor.id, code: body.code
    });
    if (error?.status === 429) throw rejected(429, 'Too many verification requests. Try again shortly.', 60);
    if (error && error.status >= 500) throw rejected(503, 'Verification is temporarily unavailable.');
    if (error || !data?.access_token || !data?.refresh_token) {
      throw rejected(401, 'Could not verify the authenticator code. Try a new code.', 0, 'mfa_invalid');
    }
    requirePatientMfa(factors, data.access_token);
    return {
      profile,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in
    };
  } }, body);
}

async function refreshPatientSession({ admin, auth }, body) {
  const token = body?.refresh_token;
  if (typeof token !== 'string' || !token || token.length > 4096) throw new RequestError(401, 'Please log in again.');
  const { data, error } = await auth.auth.refreshSession({ refresh_token: token });
  if (error || !data?.session || !data.user) {
    if (error && error.status !== 400 && error.status !== 401) throw new RequestError(503, 'Could not reach GabayMed. Please try again.');
    throw new RequestError(401, 'Your session expired. Please log in again.');
  }
  const extra = await patientAccount(admin, data.user, data.session);
  if (!extra) throw new RequestError(401, 'Please log in again.');
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, ...extra };
}

async function verifiedUser(admin, token) {
  if (!token) throw new RequestError(401, 'Please log in again.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new RequestError(401, 'Your session expired. Please log in again.');
  requirePatientMfa(await verifiedFactors(admin, data.user.id), token);
  return data.user;
}

async function changePatientPassword({ admin, auth }, token, body) {
  const user = await verifiedUser(admin, token);
  if (!await loadProfile(admin, user.id)) throw new RequestError(403, 'This account is not a patient account.');
  const problem = passwordProblem(body?.password);
  if (problem) throw new RequestError(400, problem);
  const current = body?.current_password;
  if (typeof current !== 'string' || !current || current.length > 4096 || current === body.password) {
    throw new RequestError(400, 'Enter your current password and a different new password.');
  }
  const { data, error } = await auth.auth.signInWithPassword({ email: user.email, password: current });
  if (error?.status === 429) throw rejected(429, 'Too many attempts. Try again shortly.', 60);
  if (error && error.code !== 'invalid_credentials') throw new RequestError(503, 'Could not verify your password.');
  if (error || data?.user?.id !== user.id) throw new RequestError(401, 'Your current password is incorrect.');

  try {
    const updated = await admin.auth.admin.updateUserById(user.id, { password: body.password });
    if (updated.error) throw new RequestError(503, 'Could not update your password. Please try again.');
  } finally {
    await logoutPatient(admin, data.session?.access_token);
  }
  return { success: true };
}

async function completeOnboarding(admin, token, body) {
  const user = await verifiedUser(admin, token);
  const consent = key => body?.[key] === true;
  const update = await admin.from('profiles').update({
    insurance_consent: consent('insurance_consent'),
    data_sharing_consent: consent('data_sharing_consent'),
    onboarding_completed_at: new Date().toISOString()
  }).eq('id', user.id).select(PROFILE_COLUMNS).maybeSingle();
  if (update.error) throw new RequestError(503, 'Your preferences could not be saved. Please try again.');
  if (!update.data) throw new RequestError(403, 'This account is not a patient account.');
  return { profile: mapProfile(update.data) };
}

async function logoutPatient(admin, token) {
  if (!token) return { success: true };
  // Revokes this device's refresh token. A failure must not block signing out locally.
  try { await admin.auth.admin.signOut(token, 'local'); } catch {}
  return { success: true };
}

function calculateAgeYears(dobString) {
  if (!dobString || !/^\d{4}-\d{2}-\d{2}/.test(String(dobString))) return null;
  const [y, m, d] = String(dobString).slice(0, 10).split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

function mapFullProfile(row) {
  const ageYears = calculateAgeYears(row.date_of_birth);
  const fullName =
    row.full_name ||
    [row.first_name, row.middle_name, row.last_name, row.name_suffix].filter(Boolean).join(' ') ||
    'Patient';
  return {
    id: row.id,
    first_name: row.first_name || '',
    middle_name: row.middle_name || '',
    last_name: row.last_name || '',
    name_suffix: row.name_suffix || '',
    full_name: fullName,
    email: row.email || '',
    phone_number: row.phone_number || '',
    date_of_birth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : '',
    age: ageYears != null ? String(ageYears) : 'N/A',
    gender: row.gender || '',
    street_address: row.street_address || '',
    barangay: row.barangay || '',
    city_municipality: row.city_municipality || '',
    province: row.province || '',
    zip_code: row.zip_code || '',
    address:
      row.address ||
      [row.street_address, row.barangay, row.city_municipality, row.province, row.zip_code]
        .filter(Boolean)
        .join(', '),
    blood_type: row.blood_type || '',
    allergies: row.allergies || '',
    medical_history: row.medical_history || '',
    avatar_url: row.avatar_url || '',
    insurance_consent: !!row.insurance_consent,
    data_sharing_consent: !!row.data_sharing_consent,
    onboardingCompleted: !!row.onboarding_completed_at,
  };
}

function validateProfileUpdateInput(body) {
  if (!body || typeof body !== 'object') {
    throw new RequestError(400, 'Profile update details are required.');
  }
  const text = key => (typeof body[key] === 'string' ? body[key].trim().replace(/\s+/g, ' ') : '');
  const errors = {};

  const name = (key, label, required) => {
    const value = text(key);
    if (!value) {
      if (required) errors[key] = `${label} is required.`;
      return null;
    }
    if (value.length > 50 || !NAME.test(value)) {
      errors[key] = `Enter a valid ${label.toLowerCase()}.`;
    }
    return value;
  };

  const first_name = name('first_name', 'First name', true);
  const middle_name = name('middle_name', 'Middle name', false);
  const last_name = name('last_name', 'Last name', true);
  const name_suffix = text('name_suffix') || null;
  if (name_suffix && !SUFFIXES.includes(name_suffix)) {
    errors.name_suffix = 'Choose a valid name extension.';
  }

  const date_of_birth = normalizeBirthdate(body.date_of_birth);
  if (!date_of_birth) {
    errors.date_of_birth = 'Please select a valid date of birth.';
  }

  const gender = text('gender') || null;
  if (!gender || !GENDERS.includes(gender)) {
    errors.gender = 'Please select your gender.';
  }

  const phone_number = normalizeMobile(body.phone_number ?? body.mobile_number ?? body.phone);
  if (!phone_number) {
    errors.phone_number = 'Enter a valid Philippine mobile number (9XX XXX XXXX).';
  }

  const street_address = text('street_address') || null;
  const barangay = text('barangay') || null;
  const city_municipality = text('city_municipality') || null;
  const province = text('province') || null;
  const zip_code = text('zip_code') || null;
  if (!city_municipality) errors.city_municipality = 'City or municipality is required.';
  if (!province) errors.province = 'Province is required.';
  if (zip_code && !/^\d{4}$/.test(zip_code)) {
    errors.zip_code = 'Enter a valid 4-digit Philippine ZIP code.';
  }

  const address =
    [street_address, barangay, city_municipality, province, zip_code].filter(Boolean).join(', ') ||
    text('address') ||
    null;

  const blood_type = text('blood_type') || null;
  if (blood_type && !BLOOD_TYPES.includes(blood_type)) {
    errors.blood_type = 'Choose a valid blood type.';
  }

  const allergies = text('allergies') ? text('allergies').slice(0, 500) : null;
  const medical_history = text('medical_history') ? text('medical_history').slice(0, 1000) : null;
  const avatar_url = typeof body.avatar_url === 'string' && body.avatar_url.trim()
    ? body.avatar_url.trim().slice(0, 1500000)
    : null;

  if (Object.keys(errors).length) {
    throw Object.assign(new RequestError(400, Object.values(errors)[0]), { fields: errors });
  }

  const full_name = [first_name, middle_name, last_name, name_suffix].filter(Boolean).join(' ');
  return {
    first_name,
    middle_name,
    last_name,
    name_suffix,
    full_name,
    date_of_birth,
    gender,
    phone_number,
    street_address,
    barangay,
    city_municipality,
    province,
    zip_code,
    address,
    blood_type,
    allergies,
    medical_history,
    avatar_url,
  };
}

/**
 * Handles full CRUD on the signed-in patient's profile
 * (`action: 'get' | 'update' | 'update_avatar' | 'update_medical' | 'update_consents' | 'clear_medical'`).
 * Also syncs updated demographic & medical details to any linked `patients` rows across facilities.
 */
async function managePatientProfile(admin, token, body = {}, { secret } = {}) {
  const user = await verifiedUser(admin, token);
  const action = body?.action || 'get';

  if (action === 'get') {
    const res = await admin.from('profiles').select(FULL_PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
    if (res.error) throw new RequestError(503, 'Could not load your profile right now.');
    if (!res.data) throw new RequestError(404, 'Patient profile not found.');
    return { profile: mapFullProfile(res.data) };
  }

  if (action === 'clear_medical') {
    const field = body.field;
    const patch =
      field === 'allergies'
        ? { allergies: null }
        : field === 'medical_history'
          ? { medical_history: null }
          : { blood_type: null, allergies: null, medical_history: null };
    const updated = await admin
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select(FULL_PROFILE_COLUMNS)
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new RequestError(503, 'Could not update your medical record.');
    }
    return { profile: mapFullProfile(updated.data) };
  }

  if (action === 'update_avatar') {
    const avatar_url =
      typeof body.avatar_url === 'string' && body.avatar_url.trim()
        ? body.avatar_url.trim().slice(0, 1500000)
        : null;
    const updated = await admin
      .from('profiles')
      .update({ avatar_url })
      .eq('id', user.id)
      .select(FULL_PROFILE_COLUMNS)
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new RequestError(503, 'Could not save your profile picture.');
    }
    return { profile: mapFullProfile(updated.data) };
  }

  if (action === 'update_consents') {
    const patch = {};
    if (typeof body.insurance_consent === 'boolean') {
      patch.insurance_consent = body.insurance_consent;
    }
    if (typeof body.data_sharing_consent === 'boolean') {
      patch.data_sharing_consent = body.data_sharing_consent;
    }
    const updated = await admin
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select(FULL_PROFILE_COLUMNS)
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new RequestError(503, 'Could not save your permission settings.');
    }
    return { profile: mapFullProfile(updated.data) };
  }

  if (action === 'delete_account') {
    const targetEmail = (user.email || body.email || '').trim().toLowerCase();
    if (!targetEmail) {
      throw new RequestError(400, 'Could not determine account email for verification.');
    }
    await consumeVerifiedOtp(admin, secret, 'register', targetEmail, body.otp_token);

    try {
      await admin
        .from('patients')
        .update({ profile_id: null })
        .eq('profile_id', user.id);
    } catch {}

    // Health Record Vault files are removed with the account (rows cascade with the profile).
    try { await purgeAccountFiles(admin, user.id); } catch {}

    const delProfile = await admin.from('profiles').delete().eq('id', user.id);
    if (delProfile.error) {
      throw new RequestError(503, 'Could not delete your profile right now. Please try again.');
    }

    if (admin.auth?.admin?.deleteUser) {
      const delAuth = await admin.auth.admin.deleteUser(user.id);
      if (delAuth?.error) {
        throw new RequestError(503, 'Could not delete your account login right now.');
      }
    }

    return { deleted: true };
  }

  if (action === 'update_medical') {
    const blood_type =
      typeof body.blood_type === 'string' && BLOOD_TYPES.includes(body.blood_type.trim())
        ? body.blood_type.trim()
        : null;
    const allergies =
      typeof body.allergies === 'string' && body.allergies.trim()
        ? body.allergies.trim().slice(0, 500)
        : null;
    const medical_history =
      typeof body.medical_history === 'string' && body.medical_history.trim()
        ? body.medical_history.trim().slice(0, 1000)
        : null;

    const updated = await admin
      .from('profiles')
      .update({ blood_type, allergies, medical_history })
      .eq('id', user.id)
      .select(FULL_PROFILE_COLUMNS)
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new RequestError(503, 'Could not save your medical records.');
    }
    try {
      await admin
        .from('patients')
        .update({ medical_history })
        .eq('profile_id', user.id);
    } catch {}
    return { profile: mapFullProfile(updated.data) };
  }

  // action === 'update' (Personal & Demographics, with optional OTP-verified email change)
  const updates = validateProfileUpdateInput(body);
  const requestedEmail =
    typeof body.new_email === 'string' ? body.new_email.trim().toLowerCase() : '';
  const currentEmail = (user.email || '').trim().toLowerCase();

  if (requestedEmail && requestedEmail !== currentEmail) {
    if (!EMAIL.test(requestedEmail) || requestedEmail.length > 254) {
      throw Object.assign(new RequestError(400, 'Enter a valid email address.'), {
        fields: { email: 'Enter a valid email address.' },
      });
    }
    const existingEmail = await admin
      .from('profiles')
      .select('id')
      .ilike('email', requestedEmail)
      .neq('id', user.id)
      .maybeSingle();
    if (existingEmail.data?.id) {
      throw Object.assign(
        new RequestError(409, 'That email address is already registered to another account.'),
        { fields: { email: 'This email is already in use.' } }
      );
    }

    await consumeVerifiedOtp(admin, secret, 'register', requestedEmail, body.otp_token);

    if (admin.auth?.admin?.updateUserById) {
      const authUpdate = await admin.auth.admin.updateUserById(user.id, {
        email: requestedEmail,
        email_confirm: true,
      });
      if (authUpdate?.error) {
        if (['email_exists', 'user_already_exists'].includes(authUpdate.error.code)) {
          throw Object.assign(
            new RequestError(409, 'That email address is already registered to another account.'),
            { fields: { email: 'This email is already in use.' } }
          );
        }
        throw new RequestError(503, 'Could not update your login email right now. Please try again.');
      }
    }
    updates.email = requestedEmail;
  }

  const saved = await admin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select(FULL_PROFILE_COLUMNS)
    .maybeSingle();
  if (saved.error || !saved.data) {
    throw new RequestError(503, 'Could not save your profile changes. Please try again.');
  }

  // Keep linked hospital `patients` rows in sync so healthcare providers always see the latest record
  const ageYears = calculateAgeYears(updates.date_of_birth);
  try {
    const patientSync = {
      full_name: updates.full_name,
      first_name: updates.first_name,
      middle_name: updates.middle_name,
      last_name: updates.last_name,
      phone_number: updates.phone_number,
      address: updates.address,
      date_of_birth: updates.date_of_birth,
      gender: updates.gender,
      age: ageYears,
      medical_history: updates.medical_history,
    };
    if (updates.email) patientSync.email = updates.email;
    await admin
      .from('patients')
      .update(patientSync)
      .eq('profile_id', user.id);
  } catch {}

  return { profile: mapFullProfile(saved.data) };
}

module.exports = {
  registrationInput, normalizeMobile, passwordProblem, handlePatientOtp, registerPatient,
  resetPatientPassword, loginPatient, refreshPatientSession, completeOnboarding,
  validateProfileUpdateInput, managePatientProfile, logoutPatient, patientAccount, verifiedUser, changePatientPassword, rejected
};
