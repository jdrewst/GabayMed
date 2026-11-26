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
  if (identity.user.app_metadata?.must_change_password === true) {
    throw new RequestError(403, 'Change your temporary password before adding providers.');
  }
  const provider = providerInput(body);
  const readiness = await admin.from('providers').select('provider_id, user_id').limit(1);
  if (readiness.error) throw new RequestError(503, 'Run database/provider-accounts.sql before creating provider accounts.');
  // Generated only on the server. Never stored as plaintext in public tables.
  const password = `Gm!9${randomBytes(24).toString('base64url')}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: provider.email, password, email_confirm: true,
    app_metadata: { must_change_password: true },
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
  const { createNotification } = require('./notifications');
  await createNotification(admin, {
    facilityId: actor.facility_id,
    recipientType: 'clinic',
    type: 'admin',
    title: 'New Provider Account Created',
    message: `${provider.name} (${provider.type}) was added to your clinic.`
  });

  return { success: true, provider: mapProvider(saved),
    credentials: { email: provider.email, password, role: 'Hospital Staff' } };
}

function validateResetPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be 12 to 128 characters long.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Password needs an uppercase letter, a lowercase letter, a number, and a symbol.';
  }
  return '';
}

async function resetProviderPassword(admin, token, body, { sendMail, auth } = {}) {
  if (!token) throw new RequestError(401, 'Sign in before resetting a provider password.');
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity?.user) throw new RequestError(401, 'Your session expired. Sign in again.');
  const { data: actor, error: actorError } = await admin.from('users')
    .select('id, role, facility_id').eq('id', identity.user.id).single();
  if (actorError || actor?.role !== 'IT Admin' || !actor.facility_id) {
    throw new RequestError(403, 'Only an IT Admin assigned to a clinic can reset provider passwords.');
  }
  if (identity.user.app_metadata?.must_change_password === true) {
    throw new RequestError(403, 'Change your temporary password before managing provider accounts.');
  }

  const providerId = body?.providerId ?? body?.provider_id;
  if (providerId === undefined || providerId === null || String(providerId).trim() === '') {
    throw new RequestError(400, 'Select a provider to reset.');
  }

  const providerRes = await admin.from('providers')
    .select('provider_id, name, email, user_id, facility_id')
    .eq('provider_id', providerId)
    .eq('facility_id', actor.facility_id)
    .maybeSingle();
  if (providerRes.error) {
    throw new RequestError(503, 'Could not verify the provider record. Please try again later.');
  }
  if (!providerRes.data) {
    throw new RequestError(404, 'Provider not found in your clinic.');
  }

  const targetProvider = providerRes.data;
  let targetUserId = targetProvider.user_id || null;
  if (!targetUserId && targetProvider.email) {
    const userRes = await admin.from('users')
      .select('id')
      .ilike('email', targetProvider.email.trim())
      .eq('facility_id', actor.facility_id)
      .maybeSingle();
    if (!userRes.error && userRes.data?.id) {
      targetUserId = userRes.data.id;
    }
  }
  if (!targetUserId) {
    throw new RequestError(404, 'This provider does not have a linked login account.');
  }

  let nextPassword;
  if (typeof body?.password === 'string' && body.password.length > 0) {
    const problem = validateResetPassword(body.password);
    if (problem) throw new RequestError(400, problem);
    nextPassword = body.password;
  } else {
    nextPassword = `Gm!9${randomBytes(24).toString('base64url')}`;
  }

  // Reject if the admin-entered new password is the same as the user's current password
  if (typeof body?.password === 'string' && body.password.length > 0 && auth?.auth?.signInWithPassword) {
    let currentAuthEmail = targetProvider.email || '';
    if (admin.auth?.admin?.getUserById) {
      try {
        const existingAuth = await admin.auth.admin.getUserById(targetUserId);
        if (existingAuth?.data?.user?.email) currentAuthEmail = existingAuth.data.user.email;
      } catch {}
    }
    if (currentAuthEmail) {
      try {
        const sameCheck = await auth.auth.signInWithPassword({
          email: currentAuthEmail.trim().toLowerCase(),
          password: nextPassword
        });
        if (!sameCheck?.error && sameCheck?.data?.user) {
          throw new RequestError(400, 'Your new password must be different from the current password.');
        }
      } catch (err) {
        if (err instanceof RequestError) throw err;
      }
    }
  }

  const desiredEmail = typeof targetProvider.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetProvider.email.trim())
    ? targetProvider.email.trim().toLowerCase()
    : '';
  const authPatch = {
    password: nextPassword,
    app_metadata: { must_change_password: false }
  };
  if (desiredEmail) {
    authPatch.email = desiredEmail;
    authPatch.email_confirm = true;
  }

  let updateRes = await admin.auth.admin.updateUserById(targetUserId, authPatch);
  if (updateRes?.error && desiredEmail) {
    // If the email is already used by another Auth user, still reset the password without changing email
    updateRes = await admin.auth.admin.updateUserById(targetUserId, {
      password: nextPassword,
      app_metadata: { must_change_password: false }
    });
  }
  if (updateRes?.error) {
    throw new RequestError(503, 'Could not reset the provider password. Please try again later.');
  }

  const finalEmail = updateRes?.data?.user?.email || desiredEmail || targetProvider.email;
  if (finalEmail && desiredEmail && finalEmail.toLowerCase() === desiredEmail) {
    try {
      await admin.from('users').update({ email: finalEmail }).eq('id', targetUserId);
    } catch {}
  }

  let emailSent = false;
  if (finalEmail) {
    try {
      const mailer = sendMail || require('./otp').sendAdminPasswordResetEmail;
      await mailer({
        to: finalEmail,
        name: targetProvider.name,
        email: finalEmail,
        password: nextPassword
      });
      emailSent = true;
    } catch (err) {
      console.error('Failed to send admin password reset notification:', err.message || err);
    }
  }

  const { createNotification } = require('./notifications');
  await createNotification(admin, {
    facilityId: actor.facility_id,
    userId: targetUserId,
    recipientType: 'clinic',
    type: 'admin',
    title: 'Password Updated by Admin',
    message: `Your clinic IT Administrator updated the password for your account (${finalEmail}).`
  });

  return {
    success: true,
    emailSent,
    credentials: {
      name: targetProvider.name,
      email: finalEmail,
      password: nextPassword,
      role: 'Hospital Staff'
    }
  };
}

async function syncProviderEmail(admin, token, body) {
  if (!token) throw new RequestError(401, 'Sign in before updating a provider.');
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity?.user) throw new RequestError(401, 'Your session expired. Sign in again.');
  const { data: actor, error: actorError } = await admin.from('users')
    .select('id, role, facility_id').eq('id', identity.user.id).single();
  if (actorError || actor?.role !== 'IT Admin' || !actor.facility_id) {
    throw new RequestError(403, 'Only an IT Admin assigned to a clinic can update provider emails.');
  }

  const providerId = body?.providerId ?? body?.provider_id;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!providerId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, 'A valid provider and email address are required.');
  }

  const providerRes = await admin.from('providers')
    .select('provider_id, user_id, facility_id')
    .eq('provider_id', providerId)
    .eq('facility_id', actor.facility_id)
    .maybeSingle();
  if (providerRes.error || !providerRes.data?.user_id) {
    return { success: true, synced: false };
  }

  const targetUserId = providerRes.data.user_id;
  const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, {
    email,
    email_confirm: true
  });
  if (updateErr) {
    if (['email_exists', 'user_already_exists'].includes(updateErr.code)) {
      throw new RequestError(409, 'That email address is already used by another account.');
    }
    throw new RequestError(503, 'Could not sync the provider login email.');
  }
  try {
    await admin.from('users').update({ email }).eq('id', targetUserId);
  } catch {}
  return { success: true, synced: true, email };
}

async function changeOwnPassword(admin, auth, token, body) {
  if (!token) throw new RequestError(401, 'Sign in before changing your password.');
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity?.user?.id || !identity.user.email) {
    throw new RequestError(401, 'Your session expired. Sign in again.');
  }

  const { data: actor, error: actorError } = await admin.from('users')
    .select('id, role, facility_id').eq('id', identity.user.id).single();
  if (actorError || !actor?.facility_id || !['IT Admin', 'Hospital Staff'].includes(actor.role)) {
    throw new RequestError(403, 'Only clinic staff accounts can change their password here.');
  }

  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (!currentPassword) {
    throw new RequestError(400, 'Enter your current password.');
  }
  const problem = validateResetPassword(newPassword);
  if (problem) {
    throw new RequestError(400, problem);
  }
  if (newPassword === currentPassword) {
    throw new RequestError(400, 'Your new password must be different from your current password.');
  }

  const verifyCurrent = await auth.auth.signInWithPassword({
    email: identity.user.email.trim().toLowerCase(),
    password: currentPassword
  });
  if (verifyCurrent?.error || !verifyCurrent?.data?.user) {
    throw new RequestError(401, 'Current password is incorrect.');
  }

  const existingMeta = identity.user.app_metadata && typeof identity.user.app_metadata === 'object'
    ? identity.user.app_metadata : {};
  const { error: updateError } = await admin.auth.admin.updateUserById(identity.user.id, {
    password: newPassword,
    app_metadata: { ...existingMeta, must_change_password: false }
  });
  if (updateError) {
    throw new RequestError(503, 'Could not update your password. Please try again later.');
  }

  const { createNotification } = require('./notifications');
  await createNotification(admin, {
    facilityId: actor.facility_id,
    userId: identity.user.id,
    recipientType: 'clinic',
    type: 'admin',
    title: 'Password Changed',
    message: 'Your GabayMed account password was updated successfully.'
  });

  return { success: true };
}

module.exports = { createProviderAccount, resetProviderPassword, syncProviderEmail, changeOwnPassword, providerInput, RequestError };
