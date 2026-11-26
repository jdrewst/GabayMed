const { createClient } = require('@supabase/supabase-js');
const patient = require('../lib/patient-auth');
const { isAllowedOrigin } = require('../lib/origin');

// Native mobile requests send no Origin header. Browsers must match the website origin.
function guard(req, res, allowHeaders) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin, req.headers.host)) {
      res.status(403).json({ error: 'Origin is not allowed.' });
      return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', allowHeaders);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return false;
  }
  return true;
}

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.timeout(10000) }) } });
}

function bearer(req) {
  return /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
}

function endpoint(run, { headers = 'Content-Type', unavailable = 'GabayMed is temporarily unavailable. Please try again later.' } = {}) {
  return async function handler(req, res) {
    if (!guard(req, res, headers)) return;
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: unavailable });
    try {
      return res.status(200).json(await run(req));
    } catch (error) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(error.status || 503).json({
        error: error.status ? error.message : unavailable,
        code: error.code || undefined,
        fields: error.fields || undefined,
        retry_after: error.retryAfter || 0,
        attempts_remaining: typeof error.attemptsRemaining === 'number' ? error.attemptsRemaining : undefined
      });
    }
  };
}

module.exports = {
  otp: endpoint(req => patient.handlePatientOtp({ admin: client(), secret: process.env.SUPABASE_SERVICE_ROLE_KEY }, req.body),
    { unavailable: 'OTP verification is temporarily unavailable. Please try again later.' }),
  register: endpoint(req => patient.registerPatient(client(), req.body, { secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    { unavailable: 'Registration is temporarily unavailable. Please try again later.' }),
  // Separate clients prevent signInWithPassword replacing the admin credential.
  login: endpoint(req => patient.loginPatient({ admin: client(), auth: client(), secret: process.env.SUPABASE_SERVICE_ROLE_KEY }, req.body),
    { unavailable: 'Login is temporarily unavailable. Please try again later.' }),
  session: endpoint(req => patient.refreshPatientSession({ admin: client(), auth: client() }, req.body)),
  onboarding: endpoint(req => patient.completeOnboarding(client(), bearer(req), req.body), { headers: 'Authorization, Content-Type' }),
  profile: endpoint(req => patient.managePatientProfile(client(), bearer(req), req.body, { secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    { headers: 'Authorization, Content-Type', unavailable: 'Profile service is temporarily unavailable. Please try again later.' }),
  resetPassword: endpoint(req => patient.resetPatientPassword(client(), req.body, { secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    { unavailable: 'Password reset is temporarily unavailable. Please try again later.' }),
  security: endpoint(req => patient.changePatientPassword({ admin: client(), auth: client() }, bearer(req), req.body),
    { headers: 'Authorization, Content-Type', unavailable: 'Password changes are temporarily unavailable.' }),
  logout: endpoint(req => patient.logoutPatient(client(), bearer(req)), { headers: 'Authorization, Content-Type' })
};
