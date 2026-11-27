const { createClient } = require('@supabase/supabase-js');
const sharing = require('../lib/provider-health-records');
const { isAllowedOrigin } = require('../lib/origin');

// Gabay 1.0 Patient Portal access to patient-shared and clinic-uploaded Health Record Vault files (US-4.0).
// POST { action: 'list' | 'get_url' | 'create_upload' | 'confirm_upload' | 'update' | 'delete', patientId, recordId?, mode?, ... }
// with the clinic user's bearer token.

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.timeout(10000) }) },
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
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

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token) return res.status(401).json({ error: 'Please sign in again.' });
  const admin = client();
  if (!admin) return res.status(503).json({ error: 'Shared health records are temporarily unavailable.' });

  try {
    const result = await sharing.handleAction(admin, token, req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.status ? error.message : 'Shared health records are temporarily unavailable. Please try again later.',
    });
  }
};
