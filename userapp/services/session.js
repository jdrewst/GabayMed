import * as SecureStore from 'expo-secure-store';
import { supabase, setAccessTokenProvider } from '../lib/supabase';
import AuthAPI from './authApi';

// Only the refresh token is kept on the device, in the encrypted keystore/keychain.
const REFRESH_KEY = 'gabay_refresh_token';

let current = null; // { accessToken, refreshToken, expiresAt, profile }
let refreshing = null;
const listeners = new Set();

function notify() {
  listeners.forEach(listener => listener(current));
}

async function store(result) {
  current = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Number(result.expires_at) || Math.floor(Date.now() / 1000) + 3600,
    profile: result.profile,
  };
  await SecureStore.setItemAsync(REFRESH_KEY, result.refresh_token);
  notify();
  return current;
}

async function forget() {
  current = null;
  try { await SecureStore.deleteItemAsync(REFRESH_KEY); } catch {}
  notify();
}

// Refresh once at a time; a 401 means the session is gone and the user must log in again.
async function refresh(refreshToken) {
  if (!refreshing) {
    refreshing = AuthAPI.refresh(refreshToken)
      .then(store)
      .catch(async error => {
        if (error.status === 401) await forget();
        throw error;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

setAccessTokenProvider(async () => {
  if (!current) return null;
  if (current.expiresAt - Date.now() / 1000 > 60) return current.accessToken;
  try { return (await refresh(current.refreshToken)).accessToken; } catch { return current?.accessToken ?? null; }
});

const Session = {
  /** Subscribe to sign-in / sign-out changes. Returns an unsubscribe function. */
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Restore a saved session on app start. Returns the session, or null when the user must log in. */
  async restore() {
    const saved = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!saved) return null;
    return refresh(saved);
  },

  /** Save the result of a successful login. */
  start(loginResult) {
    return store(loginResult);
  },

  current() {
    return current;
  },

  /** Update the cached profile (e.g. after onboarding). */
  setProfile(profile) {
    if (!current) return;
    current = { ...current, profile };
    notify();
  },

  async getAccessToken() {
    if (!current) return null;
    if (current.expiresAt - Date.now() / 1000 > 60) return current.accessToken;
    return (await refresh(current.refreshToken)).accessToken;
  },

  /** The signed-in patient's profile ID (same as their account ID). */
  getUserId() {
    return current?.profile?.id ?? null;
  },

  /** Sign out on this device and revoke the session on the server. */
  async signOut({ requireLocalRemoval = false } = {}) {
    if (requireLocalRemoval && refreshing) await refreshing.catch(() => {});
    const token = current?.accessToken;
    if (requireLocalRemoval) await SecureStore.deleteItemAsync(REFRESH_KEY);
    await forget();
    if (token) { try { await AuthAPI.logout(token); } catch {} }
  },

  async getProfile() {
    try {
      const id = this.getUserId();
      if (!id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, date_of_birth')
        .eq('id', id)
        .single();

      if (error) throw error;

      return {
        firstName: data.first_name,
        lastName: data.last_name,
        initials: `${data.first_name?.[0] || ''}${data.last_name?.[0] || ''}`,
        avatar: null,
      };
    } catch (error) {
      console.error('Get Profile Error:', error.message);
      return null;
    }
  },

  /** All patient_ids linked to this user profile (one per facility). */
  async getAssociatedPatientIds() {
    try {
      const userId = this.getUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from('patients')
        .select('patient_id')
        .eq('profile_id', userId);

      if (error) throw error;
      return data.map(row => row.patient_id);
    } catch (error) {
      console.error('Get Patient IDs Error:', error.message);
      return [];
    }
  },

  async getUnreadCounts() {
    try {
      const patientIds = await this.getAssociatedPatientIds();
      if (patientIds.length === 0) {
        return { messages: 0, notifications: 0 };
      }

      const { count: notifCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .in('patient_id', patientIds)
        .eq('status', 'PENDING');

      return { messages: 0, notifications: notifCount || 0 };
    } catch (error) {
      console.error('Get Counts Error:', error);
      return { messages: 0, notifications: 0 };
    }
  },
};

export default Session;
