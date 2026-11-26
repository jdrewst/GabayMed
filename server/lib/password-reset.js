const { RequestError } = require('./provider-accounts');
const { sendPasswordResetLinkEmail } = require('./otp');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be 12 to 128 characters long.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Password needs an uppercase letter, a lowercase letter, a number, and a symbol.';
  }
  return '';
}

function resolveBaseUrl(origin) {
  if (typeof origin === 'string' && /^https?:\/\//i.test(origin.trim())) {
    return origin.trim().replace(/\/+$/, '');
  }
  return (process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
}

async function requestPasswordReset({ admin, sendMail = sendPasswordResetLinkEmail }, body, { origin } = {}) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new RequestError(400, 'Enter a valid email address.');
  }

  const genericOk = {
    success: true,
    message: 'If an account is registered with that email, a password reset link has been sent.'
  };

  const baseUrl = resolveBaseUrl(origin);
  // Look up directly in Supabase Auth first (works even if public.users.email is null or differs in casing)
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${baseUrl}/reset-password` }
  });

  // If Auth doesn't have this email yet, check if a provider's email was edited in Settings -> Providers
  if ((linkError || !linkData?.properties) && (linkError?.code === 'user_not_found' || linkError?.status === 404 || /not found/i.test(linkError?.message || ''))) {
    const provLookup = await admin.from('providers')
      .select('provider_id, user_id, email')
      .ilike('email', email)
      .not('user_id', 'is', null)
      .maybeSingle();
    if (!provLookup.error && provLookup.data?.user_id) {
      const syncAuth = await admin.auth.admin.updateUserById(provLookup.data.user_id, {
        email,
        email_confirm: true
      });
      if (!syncAuth?.error) {
        try {
          await admin.from('users').update({ email }).eq('id', provLookup.data.user_id);
        } catch {}
        const retry = await admin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${baseUrl}/reset-password` }
        });
        linkData = retry.data;
        linkError = retry.error;
      }
    }
  }

  if (linkError || !linkData?.properties) {
    if (linkError?.code === 'user_not_found' || linkError?.status === 404 || /not found/i.test(linkError?.message || '')) {
      return genericOk;
    }
    console.error('generateLink failed:', linkError?.message || linkError);
    throw new RequestError(503, 'Could not generate a password reset link. Please try again later.');
  }

  const authUserId = linkData.user?.id;
  if (authUserId) {
    const account = await admin.from('users')
      .select('id, role, facility_id')
      .eq('id', authUserId)
      .maybeSingle();
    if (account.error) {
      throw new RequestError(503, 'Password reset is temporarily unavailable. Please try again later.');
    }
    if (!account.data?.id || !account.data.facility_id || !['IT Admin', 'Hospital Staff'].includes(account.data.role)) {
      return genericOk;
    }
  }

  const targetEmail = linkData.user?.email || email;
  const hashedToken = linkData.properties.hashed_token;
  const resetUrl = hashedToken
    ? `${baseUrl}/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&email=${encodeURIComponent(targetEmail)}`
    : linkData.properties.action_link;

  if (!resetUrl) {
    throw new RequestError(503, 'Could not generate a password reset link. Please try again later.');
  }

  await sendMail({ to: targetEmail, resetUrl });
  return genericOk;
}

async function confirmPasswordReset({ admin, auth }, body) {
  const tokenHash = typeof body?.token_hash === 'string' ? body.token_hash.trim() : '';
  if (!tokenHash || tokenHash.length > 2048) {
    throw new RequestError(400, 'This password reset link is invalid or has expired. Please request a new one.');
  }

  const problem = passwordProblem(body?.password);
  if (problem) {
    throw new RequestError(400, problem);
  }

  // If email is present on the reset link, check if the new password matches the current password
  // BEFORE verifying/consuming the single-use recovery token so the user can retry with a new password.
  const preEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (preEmail && auth?.auth?.signInWithPassword) {
    try {
      const sameCheck = await auth.auth.signInWithPassword({ email: preEmail, password: body.password });
      if (!sameCheck?.error && sameCheck?.data?.user) {
        throw new RequestError(400, 'Your new password must be different from your current password.');
      }
    } catch (err) {
      if (err instanceof RequestError) throw err;
    }
  }

  const { data: verified, error: verifyError } = await auth.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery'
  });
  if (verifyError || !verified?.user?.id) {
    throw new RequestError(400, 'This password reset link is invalid or has expired. Please request a new one.');
  }

  if (!preEmail && verified.user.email && auth?.auth?.signInWithPassword) {
    try {
      const sameCheck = await auth.auth.signInWithPassword({ email: verified.user.email, password: body.password });
      if (!sameCheck?.error && sameCheck?.data?.user) {
        throw new RequestError(400, 'Your new password must be different from your current password.');
      }
    } catch (err) {
      if (err instanceof RequestError) throw err;
    }
  }

  const existingMeta = verified.user.app_metadata && typeof verified.user.app_metadata === 'object'
    ? verified.user.app_metadata : {};
  const { error: updateError } = await admin.auth.admin.updateUserById(verified.user.id, {
    password: body.password,
    app_metadata: { ...existingMeta, must_change_password: false }
  });
  if (updateError) {
    throw new RequestError(503, 'Could not update your password. Please try again later.');
  }

  return { success: true };
}

module.exports = { requestPasswordReset, confirmPasswordReset, passwordProblem };
