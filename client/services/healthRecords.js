import { createClient } from '@supabase/supabase-js';

// Patient-shared Health Record Vault files (US-4.0), read-only for clinic staff.
// Every request goes through /api/provider-health-records, which enforces the patient's account-level
// "Hospital Data Sharing" permission and each file's "Share with my care providers" flag.
// The health_records table and storage bucket are never queried directly from the website.

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env[key];
  if (typeof process !== 'undefined' && process.env) return process.env[key];
  return '';
};

const supabase = createClient(
  getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL'),
  getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY')
);

const API_BASE = getEnv('VITE_API_BASE_URL') || '/api';

export class SharedRecordsError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

const FRIENDLY = {
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to view this patient\'s health records.',
  404: 'This file is no longer shared by the patient.',
};

async function call(action, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new SharedRecordsError(FRIENDLY[401], 401);
  let response;
  try {
    response = await fetch(`${API_BASE}/provider-health-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...payload, action }),
    });
  } catch {
    throw new SharedRecordsError('Could not reach the Gabay server. Check that the backend is running.');
  }
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    throw new SharedRecordsError(data.error || FRIENDLY[response.status] || 'Shared health records are unavailable right now.', response.status);
  }
  return data;
}

export const healthRecordsAPI = {
  /** { access: 'granted' | 'restricted' | 'no_account', records: [...], categories: [...] } */
  listShared(patientId) {
    return call('list', { patientId });
  },

  /** Short-lived signed link to view ('view') or download ('download') one shared file. */
  async getFileUrl(patientId, recordId, mode = 'view') {
    const { url } = await call('get_url', { patientId, recordId, mode });
    return url;
  },
};

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
