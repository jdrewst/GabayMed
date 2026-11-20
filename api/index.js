const { routes } = require('../server/backend');

/**
 * Single consolidated Vercel Serverless Function for all /api/* endpoints.
 * Keeps the deployment well within the Vercel Hobby plan's 12-function limit
 * while routing to the exact same handlers as server/backend.js.
 */
module.exports = async function handler(req, res) {
  if (typeof res.status !== 'function') {
    res.status = code => { res.statusCode = code; return res; };
  }
  if (typeof res.json !== 'function') {
    res.json = value => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(value));
    };
  }

  const parsed = new URL(req.url, 'http://localhost');
  const routeParam = parsed.searchParams.get('__route');

  let pathname = parsed.pathname;
  if (routeParam) {
    pathname = `/api/${routeParam.replace(/^\/+/, '')}`;
    parsed.searchParams.delete('__route');
    const qs = parsed.searchParams.toString();
    req.url = qs ? `${pathname}?${qs}` : pathname;
  }

  // Strip trailing slash (except root)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const target = routes[pathname];
  if (!target) {
    return res.status(404).json({ error: 'Not found.' });
  }

  // Allow requests from the mobile web deployment (Vercel or local Expo Web on 8081/19006)
  const origin = req.headers?.origin;
  if (origin) {
    const mobileOrigins = [
      process.env.MOBILE_WEB_ORIGIN,
      'http://localhost:8081',
      'http://localhost:19006',
    ].filter(Boolean);
    const isMobileWeb =
      mobileOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]*gabay[a-z0-9-]*\.vercel\.app$/i.test(origin) ||
      /^https:\/\/[^/]+\.expo\.app$/i.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1):(8081|19006)$/i.test(origin);

    if (isMobileWeb) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.status(204).end();
      delete req.headers.origin;
    }
  }

  // Vercel automatically parses req.body for JSON requests; fallback if unparsed
  if (req.body === undefined && req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 2 * 1024 * 1024) {
          return res.status(413).json({ error: 'Request is too large.' });
        }
      }
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ error: 'Invalid JSON.' });
    }
  }

  try {
    return await target(req, res);
  } catch (err) {
    console.error(`API Router Error [${pathname}]:`, err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Request failed.' });
    }
  }
};
