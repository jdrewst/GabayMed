const { createClient } = require('@supabase/supabase-js');
const vault = require('../lib/health-records');
const { isAllowedOrigin } = require('../lib/origin');

// Health Record Vault endpoint (US-3.7). Every request is POST { action, ... } with the patient's bearer token.
// Files themselves never pass through this function: uploads go straight to Storage via a signed upload URL,
// which keeps requests well under the serverless body limit.

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.timeout(10000) }) },
  });
}

function bearer(req) {
  return /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Native mobile requests send no Origin header. Browsers must match the website origin.
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin, req.headers.host)) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const admin = client();
  if (!admin) return res.status(503).json({ error: 'Health Record Vault is temporarily unavailable.' });

  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'Please log in again.' });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Your session expired. Please log in again.' });

    const result = await vault.handleAction(admin, data.user.id, req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.status ? error.message : 'Health Record Vault is temporarily unavailable. Please try again later.',
    });
  }
};
