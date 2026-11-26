require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const claims = require('../lib/patient-claims');
const { RequestError } = require('../lib/provider-accounts');

/**
 * GET  /api/patient-claims  (optional ?status=SUBMITTED|IN_REVIEW|APPROVED|DENIED)
 * POST /api/patient-claims  (body: { ledgerId, insuranceId?, notes? })
 * Authorization: Bearer <patient access token>
 */

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

async function verifiedUser(admin, token) {
  if (!token) throw new RequestError(401, 'Please log in again.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new RequestError(401, 'Your session expired. Please log in again.');
  return data.user;
}

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const admin = client();
  if (!admin) return res.status(503).json({ error: 'Claims service is temporarily unavailable.' });

  try {
    const user = await verifiedUser(admin, bearer(req));

    if (req.method === 'GET') {
      const status = new URL(req.url, 'http://localhost').searchParams.get('status') || undefined;
      const result = await claims.getPatientClaims(admin, user.id, { status });
      return res.status(200).json(result);
    }

    const result = await claims.submitPatientClaim(admin, user.id, req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Patient Claims Error:', error.message);
    return res.status(status).json({
      error: status >= 500 ? 'Failed to process claims request.' : error.message,
    });
  }
};
