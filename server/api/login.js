const { createClient } = require('@supabase/supabase-js');
const { login } = require('../lib/login');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch {}
    if (!sameHost && origin !== (process.env.CLIENT_ORIGIN || 'http://localhost:5173')) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Login is temporarily unavailable.' });
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }) } };
  try {
    // Separate clients prevent signInWithPassword replacing the admin credential.
    const result = await login({ admin: createClient(url, key, options),
      auth: createClient(url, key, options), secret: key }, req.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    return res.status(error.status || 503).json({
      error: error.status ? error.message : 'Login is temporarily unavailable. Please try again later.',
      code: error.code || 'login_unavailable', retry_after: error.retryAfter || 0
    });
  }
};
