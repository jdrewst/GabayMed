import { supabase } from './gabayApi';

// Patient-shared and clinic-uploaded Health Record Vault files (US-4.0).
// Every request goes through /api/provider-health-records, which enforces the patient's
// permissions and handles clinic staff uploads (source = 'facility').

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env[key];
  if (typeof process !== 'undefined' && process.env) return process.env[key];
  return '';
};

const API_BASE = getEnv('VITE_API_BASE_URL') || '/api';

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

export const SUPPORTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
];

const EXTENSION_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

export function resolveMimeType(mimeType, fileName) {
  const reported = String(mimeType || '').toLowerCase().split(';')[0];
  if (reported === 'image/jpg') return 'image/jpeg';
  if (SUPPORTED_TYPES.includes(reported)) return reported;
  const ext = /\.([a-z0-9]{1,5})$/i.exec(String(fileName || ''))?.[1]?.toLowerCase();
  return EXTENSION_TYPES[ext] || null;
}

export function validateFile(file) {
  if (!file) return 'Please choose a file to upload.';
  if (!resolveMimeType(file.type, file.name)) {
    return 'Only PDF, JPG, PNG, HEIC or WEBP files can be uploaded.';
  }
  if (Number(file.size) > MAX_FILE_BYTES) {
    return 'This file is larger than 10 MB. Please choose a smaller file.';
  }
  if (Number(file.size) <= 0) {
    return 'This file is empty.';
  }
  return '';
}

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

async function sendToStorage(uploadUrl, file, mimeType) {
  const form = new FormData();
  form.append('cacheControl', '3600');
  const typed = file.type && file.type !== 'application/octet-stream'
    ? file
    : new Blob([file], { type: mimeType });
  form.append('file', typed, file.name);

  const anonKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'x-upsert': 'false', ...(anonKey ? { apikey: anonKey } : {}) },
      body: form,
    });
  } catch {
    throw new SharedRecordsError('The file upload was interrupted. Check your connection and try again.');
  }

  if (!response.ok) {
    let message = '';
    try { message = (await response.json())?.message || ''; } catch {}
    if (response.status === 413 || /size/i.test(message)) {
      throw new SharedRecordsError('This file is larger than 10 MB.', 413);
    }
    if (/mime|type/i.test(message)) {
      throw new SharedRecordsError('This file type is not supported.', 415);
    }
    throw new SharedRecordsError('The file could not be uploaded. Please try again.', response.status);
  }
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

  /**
   * Upload a new clinic health record (e.g., lab result, imaging, prescription) for a patient.
   * file: Browser File object
   * details: { title, category, recordDate, notes, shareWithPatient }
   */
  async uploadClinicRecord(patientId, file, details = {}) {
    const problem = validateFile(file);
    if (problem) throw new SharedRecordsError(problem, 400);
    const mimeType = resolveMimeType(file.type, file.name);
    const ticket = await call('create_upload', {
      patientId,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    });
    await sendToStorage(ticket.uploadUrl, file, mimeType);
    const { record } = await call('confirm_upload', {
      patientId,
      profileId: ticket.profileId,
      path: ticket.path,
      fileName: ticket.fileName || file.name,
      mimeType,
      sizeBytes: file.size,
      ...details,
    });
    return record;
  },

  /** Update a clinic-uploaded record (e.g. toggle shareWithPatient or update metadata). */
  async updateClinicRecord(patientId, recordId, changes = {}) {
    const { record } = await call('update', { patientId, recordId, ...changes });
    return record;
  },

  /** Delete a clinic-uploaded record. */
  async deleteClinicRecord(patientId, recordId) {
    return call('delete', { patientId, recordId });
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
