const { randomBytes } = require('node:crypto');

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function providerInput(body) {
  if (!body || typeof body !== 'object') throw new RequestError(400, 'Provider details are required.');
  const text = key => typeof body[key] === 'string' ? body[key].trim() : '';
  const email = text('email').toLowerCase();
  if (text('name').length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, 'Enter a full name and a valid email address.');
  }
  const type = text('type') || text('role');
  if (!type || type.length > 80) throw new RequestError(400, 'Provider type is required.');
  const schedule = body.schedule;
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) throw new RequestError(400, 'A working schedule is required.');
  let minutes = 0;
  for (const [day, value] of Object.entries(schedule)) {
    if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(day)
      || typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new RequestError(400, 'Invalid working schedule.');
    }
    const [start, end] = value.split('-').map(time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; });
    if (end <= start) throw new RequestError(400, 'Working hours must end after they start.');
    minutes += end - start;
  }
  if (!minutes) throw new RequestError(400, 'Select at least one working day.');
  return { name: text('name'), email, type, NPI: text('licenseNo'),
    specialization: text('specialization') || null, schedule_details: schedule,
    working_hrs: Math.max(1, Math.round(minutes / 60)) };
}

function mapProvider(p) {
  return { id: p.provider_id, name: p.name, email: p.email, type: p.type, role: p.type,
    licenseNo: p.NPI, specialization: p.specialization, workingHours: p.working_hrs,
    schedule: p.schedule_details || {} };
}

async function createProviderAccount(admin, token, body) {
  if (!token) throw new RequestError(401, 'Sign in before creating a provider.');
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity?.user) throw new RequestError(401, 'Your session expired. Sign in again.');
  const { data: actor, error: actorError } = await admin.from('users')
    .select('id, role, facility_id').eq('id', identity.user.id).single();
  if (actorError || actor?.role !== 'IT Admin' || !actor.facility_id) {
    throw new RequestError(403, 'Only an IT Admin assigned to a clinic can add providers.');
  }
  const provider = providerInput(body);
  const readiness = await admin.from('providers').select('provider_id, user_id').limit(1);
  if (readiness.error) throw new RequestError(503, 'Run database/provider-accounts.sql before creating provider accounts.');
  // Generated only on the server. Never stored as plaintext in public tables.
  const password = `Gm!9${randomBytes(24).toString('base64url')}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: provider.email, password, email_confirm: true,
    user_metadata: { full_name: provider.name }
  });
  if (createError || !created?.user) {
    if (['email_exists', 'user_already_exists'].includes(createError?.code)) {
      throw new RequestError(409, 'An account with this email already exists. Use another email.');
    }
    throw new RequestError(400, createError?.message || 'Could not create the login account.');
  }
  const newId = created.user.id;
  const { data, error } = await admin.rpc('provision_provider_account', {
    p_actor_id: actor.id, p_user_id: newId, p_provider: provider
  });
  let saved = data;
  if (error) {
    // A transport failure can happen after commit. Verify before rolling back Auth.
    const check = await admin.from('providers').select('*').eq('user_id', newId).maybeSingle();
    if (check.error) throw new RequestError(500, 'Account creation could not be verified. Ask the IT Admin to check this email before retrying.');
    if (check.data) {
      saved = check.data;
    } else {
      const cleanup = await admin.auth.admin.deleteUser(newId);
      if (cleanup.error) throw new RequestError(500, 'Provider creation failed and its login needs administrator cleanup before retrying.');
      // Also remove any public.users row created by an existing Auth signup trigger.
      const userCleanup = await admin.from('users').delete().eq('id', newId);
      if (userCleanup.error) throw new RequestError(500, 'Provider creation failed. An administrator must clean up its public user record.');
      throw new RequestError(500, 'Provider creation failed. Check that the provider-accounts.sql migration is installed. No provider was saved.');
    }
  }
  return { success: true, provider: mapProvider(saved),
    credentials: { email: provider.email, password, role: 'Hospital Staff' } };
}

module.exports = { createProviderAccount, providerInput, RequestError };
