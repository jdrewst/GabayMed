const { rejected } = require('./login');

async function verifiedFactors(admin, userId) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error || !Array.isArray(data?.factors)) {
    throw rejected(503, 'Could not check account security. Please try again.');
  }
  return data.factors.filter(factor => factor.status === 'verified');
}

function requirePatientMfa(factors, token) {
  if (!factors.length) return;
  // Callers first validate this exact token with Supabase Auth.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {}
  if (claims?.aal !== 'aal2') {
    throw rejected(401, 'Verify with your authenticator app to continue.', 0, 'mfa_required');
  }
}

module.exports = { verifiedFactors, requirePatientMfa };
