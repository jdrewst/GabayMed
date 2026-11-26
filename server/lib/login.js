const { createHmac, randomUUID } = require('node:crypto');
const { RequestError } = require('./provider-accounts');

const MAX_ATTEMPTS = 3;
const WINDOW_MS = 30 * 60 * 1000;
const recentFailures = new Map();

function recordLocalFailure(key) {
  const now = Date.now();
  const prev = recentFailures.get(key);
  const count = prev && now - prev.startedAt < WINDOW_MS ? prev.count + 1 : 1;
  recentFailures.set(key, { count, startedAt: prev && now - prev.startedAt < WINDOW_MS ? prev.startedAt : now });
  return Math.max(0, MAX_ATTEMPTS - count);
}

function clearLocalFailures(key) {
  recentFailures.delete(key);
}

function rejected(status, message, retryAfter = 0, code = 'login_failed', attemptsRemaining = null) {
  const extra = { retryAfter, code };
  if (typeof attemptsRemaining === 'number') extra.attemptsRemaining = attemptsRemaining;
  return Object.assign(new RequestError(status, message), extra);
}

function invalidCredentialsMessage(attemptsRemaining) {
  if (typeof attemptsRemaining === 'number' && attemptsRemaining > 0) {
    return `Email or password is incorrect. ${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining before your account is locked.`;
  }
  return 'Email or password is incorrect.';
}

// Website default: only clinic staff assigned to a facility may sign in.
async function clinicAccount(admin, user) {
  const account = await admin.from('users').select('id, role, facility_id').eq('id', user.id).single();
  if (account.error) throw rejected(503, 'Login could not be completed. Please try again later.');
  if (!account.data?.facility_id || !['IT Admin', 'Hospital Staff'].includes(account.data.role)) return null;
  return {};
}

async function login({ admin, auth, secret, authorize }, body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body?.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof password !== 'string' || !password || password.length > 4096) {
    throw rejected(400, 'Enter a valid email and password.');
  }
  // Normalize the account identity so all devices share its counter.
  // Store only an HMAC, never email addresses or passwords.
  const key = createHmac('sha256', secret).update('account:' + email).digest('hex');
  const lease = randomUUID();
  const begin = await admin.rpc('mobile_begin_login', { p_key: key, p_lease: lease });
  if (begin.error || !begin.data) throw rejected(503, 'Login is temporarily unavailable. Please try again later.');
  if (!begin.data.allowed) {
    const busy = begin.data.reason === 'busy';
    throw rejected(429, busy ? 'A login is already in progress. Please try again shortly.'
      : 'Too many failed login attempts. Please try again when the cooldown ends.',
    Number(begin.data.retry_after) || 2, busy ? 'login_busy' : 'login_locked');
  }
  let completed = false;
  async function finish(outcome) {
    const result = await admin.rpc('mobile_finish_login', {
      p_key: key, p_lease: lease, p_outcome: outcome
    });
    if (result.error || !result.data?.accepted) {
      throw rejected(503, 'Login could not be completed. Please try again shortly.');
    }
    completed = true;
    return result.data;
  }
  try {
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error) {
      // Auth outages and upstream IP throttling are not wrong-password attempts.
      if (error.code !== 'invalid_credentials') {
        await finish('unavailable');
        throw rejected(error.status === 429 ? 429 : 503,
          error.status === 429 ? 'Too many login requests. Please try again later.'
            : 'Login is temporarily unavailable. Please try again later.', error.status === 429 ? 60 : 0);
      }
      const state = await finish('failure');
      if (state.locked) {
        clearLocalFailures(key);
        throw rejected(429, 'Too many failed login attempts. Please try again for this account in 30 minutes.', 1800, 'login_locked', 0);
      }
      const attemptsRemaining = typeof state.attempts_remaining === 'number'
        ? state.attempts_remaining
        : Math.max(1, recordLocalFailure(key));
      throw rejected(401, invalidCredentialsMessage(attemptsRemaining), 0, 'invalid_credentials', attemptsRemaining);
    }
    if (!data?.user || !data.session) throw rejected(503, 'Login could not be completed.');
    // authorize returns extra response fields for an allowed account, or null.
    const extra = await (authorize || clinicAccount)(admin, data.user, data.session);
    if (!extra) {
      const state = await finish('failure');
      if (state.locked) {
        clearLocalFailures(key);
        throw rejected(429, 'Too many failed login attempts for this account. Try again in 30 minutes.', 1800, 'login_locked', 0);
      }
      const attemptsRemaining = typeof state.attempts_remaining === 'number'
        ? state.attempts_remaining
        : Math.max(1, recordLocalFailure(key));
      throw rejected(401, invalidCredentialsMessage(attemptsRemaining), 0, 'invalid_credentials', attemptsRemaining);
    }
    await finish('success');
    clearLocalFailures(key);
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, ...extra };
  } finally {
    // An interrupted request holds the lease for at most 45 seconds.
    if (!completed) { try { await finish('unavailable'); } catch {} }
  }
}

module.exports = { login, rejected };
