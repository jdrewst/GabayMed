const { createClient } = require('@supabase/supabase-js');
const { filterFacilities } = require('../lib/browse-services');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch { /* Invalid origin is rejected. */ }
    if (!sameHost && origin !== (process.env.CLIENT_ORIGIN || 'http://localhost:8081')) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Facility browsing is not configured on the server.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: facilities, error } = await supabase.from('facilities').select('*');
    if (error) throw error;

    const searchParams = new URL(req.url, 'http://localhost').searchParams;
    const result = filterFacilities(facilities || [], {
      category: searchParams.get('category'),
      name: searchParams.get('name'),
      location: searchParams.get('location')
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Browse Facilities Error:', error.message);
    return res.status(500).json({ error: 'Unable to load facilities right now.' });
  }
};
