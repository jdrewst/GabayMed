function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  let sameHost = false;
  try {
    sameHost = new URL(origin).host === host;
  } catch {}
  if (sameHost) return true;

  const normalized = origin.trim().replace(/\/+$/, '');
  const configured = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.includes(normalized)) return true;

  // Allow standard local development origins (Vite dev server, Expo Web, localhost/127.0.0.1 on any port)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    return true;
  }

  // Allow Gabay Vercel deployments and Expo apps
  if (/^https:\/\/[a-z0-9-]*gabay[a-z0-9-]*\.vercel\.app$/i.test(normalized) ||
      /^https:\/\/[^/]+\.expo\.app$/i.test(normalized)) {
    return true;
  }

  return false;
}

module.exports = { isAllowedOrigin };
