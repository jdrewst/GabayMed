const { createClient } = require('@supabase/supabase-js');
const { changeFirstPassword } = require('../lib/first-password');

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
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Password changes are temporarily unavailable.' });
  }
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    return res.status(200).json(await changeFirstPassword(admin, token, req.body));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Password change failed. Please try again.' });
  }
};
