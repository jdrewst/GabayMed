const { createClient } = require('@supabase/supabase-js');
const { requestPasswordReset, confirmPasswordReset } = require('../lib/password-reset');

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
  if (!url || !key) {
    return res.status(503).json({ error: 'Password reset is temporarily unavailable.' });
  }
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.timeout(10000) }) }
  };
  try {
    const admin = createClient(url, key, options);
    const action = req.body?.action === 'confirm' ? 'confirm' : 'request';
    if (action === 'confirm') {
      const auth = createClient(url, key, options);
      const result = await confirmPasswordReset({ admin, auth }, req.body);
      return res.status(200).json(result);
    }
    const inferredOrigin = origin || (req.headers.host ? `https://${req.headers.host}` : undefined);
    const result = await requestPasswordReset({ admin }, req.body, { origin: inferredOrigin });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.status ? error.message : 'Password reset is temporarily unavailable. Please try again later.'
    });
  }
};
