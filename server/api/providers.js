const { createClient } = require('@supabase/supabase-js');
const { createProviderAccount } = require('../lib/provider-accounts');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch { /* Invalid origin is rejected. */ }
    if (!sameHost && origin !== (process.env.CLIENT_ORIGIN || 'http://localhost:5173')) {
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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Provider account creation is not configured on the server.' });
  }
  try {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await createProviderAccount(admin, token, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Provider account creation failed.' });
  }
};
