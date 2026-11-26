require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const http = require('node:http');
const providerHandler = require('./api/providers');
const firstPasswordHandler = require('./api/first-password');
const loginHandler = require('./api/login');
const patientAuth = require('./api/patient-auth');
const facilitiesMapHandler = require('./api/facilities-map');
const patientAppointmentsHandler = require('./api/patient-appointments');
const patientBillingHandler = require('./api/billing');
const patientClaimsHandler = require('./api/patient-claims');
const healthRecordsHandler = require('./api/health-records');
const providerHealthRecordsHandler = require('./api/provider-health-records');

const routes = {
  '/api/providers': providerHandler, '/api/first-password': firstPasswordHandler, '/api/login': loginHandler,
  '/api/patient-otp': patientAuth.otp, '/api/patient-register': patientAuth.register,
  '/api/patient-login': patientAuth.login, '/api/patient-session': patientAuth.session,
  '/api/patient-onboarding': patientAuth.onboarding, '/api/patient-profile': patientAuth.profile,
  '/api/patient-reset-password': patientAuth.resetPassword, '/api/patient-logout': patientAuth.logout,
  '/api/facilities-map': facilitiesMapHandler,
  '/api/patient-appointments': patientAppointmentsHandler,
  '/api/patient-billing': patientBillingHandler, '/api/billing': patientBillingHandler,
  '/api/patient-claims': patientClaimsHandler,
  '/api/patient-health-records': healthRecordsHandler,
  '/api/provider-health-records': providerHealthRecordsHandler
};

function createServer() {
  return http.createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const handler = routes[pathname];
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
