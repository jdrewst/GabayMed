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
