import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials missing! Check your .env file.');
}

// Login, registration and token refresh go through the GabayMed API (services/authApi.js).
// Database requests use the signed-in patient's access token so Row Level Security applies.
let tokenProvider = async () => null;
export function setAccessTokenProvider(provider) {
  tokenProvider = provider || (async () => null);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: () => tokenProvider(),
});

export function createPatientAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
