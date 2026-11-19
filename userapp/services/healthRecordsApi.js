import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Session from './session';

// Health Record Vault (US-3.7). Metadata goes through the GabayMed API; the file itself is sent
// straight to private Supabase Storage using a one-time signed upload URL issued by the API.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const RECORD_CATEGORIES = [
  { id: 'lab_result', label: 'Lab Results' },
  { id: 'prescription', label: 'Prescriptions' },
  { id: 'imaging', label: 'Imaging & Scans' },
  { id: 'immunization', label: 'Immunizations' },
  { id: 'medical_certificate', label: 'Medical Certificates' },
  { id: 'consultation', label: 'Consultation Notes' },
  { id: 'insurance', label: 'Insurance & Billing' },
  { id: 'other', label: 'Other' },
];

const EXTENSION_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
};
export const SUPPORTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:3000`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

export class VaultError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function call(action, payload = {}, timeoutMs = 20000) {
  const token = await Session.getAccessToken();
  if (!token) throw new VaultError('Please log in again.', 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_URL}/api/patient-health-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, action }),
      signal: controller.signal,
    });
  } catch {
    throw new VaultError(`We couldn't reach the GabayMed server (${API_URL}). Make sure the backend is running.`);
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new VaultError(data.error || 'Something went wrong. Please try again.', response.status);
  return data;
}

/** Work out a supported MIME type from what the picker reported, falling back to the file extension. */
export function resolveMimeType(mimeType, fileName) {
  const reported = String(mimeType || '').toLowerCase().split(';')[0];
  if (reported === 'image/jpg') return 'image/jpeg';
  if (SUPPORTED_TYPES.includes(reported)) return reported;
  const ext = /\.([a-z0-9]{1,5})$/i.exec(String(fileName || ''))?.[1]?.toLowerCase();
  return EXTENSION_TYPES[ext] || null;
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value) {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Check a picked file before uploading. Returns an error message, or '' when the file is fine. */
export function validateFile(file) {
  if (!file?.uri) return 'No file was selected.';
  if (!resolveMimeType(file.mimeType, file.name)) return 'Only PDF, JPG, PNG, HEIC or WEBP files can be uploaded.';
  if (Number(file.size) > MAX_FILE_BYTES) return 'This file is larger than 10 MB. Please choose a smaller file.';
  return '';
}

async function sendToStorage(uploadUrl, file, mimeType) {
  const form = new FormData();
  form.append('cacheControl', '3600');
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', blob, file.name);
  } else {
    // React Native streams the file from its local URI.
    form.append('file', { uri: file.uri, name: file.name, type: mimeType });
  }
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'x-upsert': 'false', ...(anonKey ? { apikey: anonKey } : {}) },
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new VaultError('The upload was interrupted. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let message = '';
    try { message = (await response.json())?.message || ''; } catch {}
    if (response.status === 413 || /size/i.test(message)) throw new VaultError('This file is larger than 10 MB.', 413);
    if (/mime|type/i.test(message)) throw new VaultError('This file type is not supported.', 415);
    throw new VaultError('The file could not be uploaded. Please try again.', response.status);
  }
}

const HealthRecordsAPI = {
  /** All of the patient's records with a per-category summary. */
  list() {
    return call('list');
  },

  /**
   * Upload a picked file and save it to the vault.
   * file: { uri, name, mimeType, size }; details: { title, category, notes, recordDate, shareWithProviders }
   */
  async upload(file, details = {}) {
    const problem = validateFile(file);
    if (problem) throw new VaultError(problem, 400);
    const mimeType = resolveMimeType(file.mimeType, file.name);
    const ticket = await call('create_upload', { fileName: file.name, mimeType, sizeBytes: file.size });
    await sendToStorage(ticket.uploadUrl, file, mimeType);
    const { record } = await call('confirm_upload', {
      path: ticket.path,
      fileName: ticket.fileName || file.name,
      ...details,
    });
    return record;
  },

  /** Short-lived link to view ('view') or download ('download') a file. */
  async getFileUrl(id, mode = 'view') {
    const { url } = await call('get_url', { id, mode });
    return url;
  },

  /** Rename, re-categorize, add notes/date, or change sharing. */
  async update(id, changes) {
    const { record } = await call('update', { id, ...changes });
    return record;
  },

  async remove(id) {
    return call('delete', { id });
  },
};

export default HealthRecordsAPI;
