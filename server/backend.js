require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const http = require('node:http');
const providerHandler = require('./api/providers');

function createServer() {
  return http.createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname !== '/api/providers') return res.status(404).json({ error: 'Not found.' });
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 32768) return res.status(413).json({ error: 'Request is too large.' });
      }
      try { req.body = body ? JSON.parse(body) : {}; }
      catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
      await providerHandler(req, res);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Request failed.' });
    }
  });
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  console.log('Gabay API listening on http://127.0.0.1:' + (process.env.PORT || 3000));
});
module.exports = { createServer };
