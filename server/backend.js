require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const http = require('node:http');
const providerHandler = require('./api/providers');
const browseServicesHandler = require('./api/browse-services');

function createServer() {
  return http.createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const handler = pathname === '/api/providers'
      ? providerHandler
      : pathname === '/api/browse-services'
        ? browseServicesHandler
        : null;
    if (!handler) return res.status(404).json({ error: 'Not found.' });
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2 * 1024 * 1024) return res.status(413).json({ error: 'Request is too large.' });
      }
      try { req.body = body ? JSON.parse(body) : {}; }
      catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
      await handler(req, res);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Request failed.' });
    }
  });
}
// Listen on 0.0.0.0 by default so both localhost and mobile devices/emulators on the LAN can reach the API.
const host = process.env.HOST || '0.0.0.0';
if (require.main === module) createServer().listen(Number(process.env.PORT || 3000), host, () => {
  console.log('Gabay API listening on http://' + host + ':' + (process.env.PORT || 3000));
});
module.exports = { createServer };
