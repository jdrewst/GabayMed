const { randomUUID } = require('node:crypto');
const { RequestError } = require('./provider-accounts');

// Health Record Vault (US-3.7): patients upload, download, organize and delete their own files.
// Files live in a private Supabase Storage bucket; the health_records table tracks metadata and permissions.

const BUCKET = 'health-records';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with security/health-records.sql
const MAX_RECORDS_PER_PATIENT = 200;
const SIGNED_URL_SECONDS = 300;

const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
};

const EXTENSION_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
};

const CATEGORIES = {
  lab_result: 'Lab Results',
  prescription: 'Prescriptions',
  imaging: 'Imaging & Scans',
  immunization: 'Immunizations',
  medical_certificate: 'Medical Certificates',
  consultation: 'Consultation Notes',
  insurance: 'Insurance & Billing',
  other: 'Other',
};

const RECORD_COLUMNS = 'id, profile_id, title, category, notes, record_date, file_name, mime_type, size_bytes, '
  + 'storage_path, source, can_delete, share_with_providers, created_at, updated_at';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function text(value, max) {
  if (typeof value !== 'string') return '';
  // Drop control characters and collapse whitespace.
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeFileName(name) {
  const base = text(String(name || '').split(/[\\/]/).pop(), 200).replace(/[<>:"|?*]/g, '');
  return base || 'health-record';
}

function extensionOf(name) {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

/** Resolve a supported MIME type from what the device reported, falling back to the file extension. */
function resolveMimeType(mimeType, fileName) {
  const reported = text(mimeType, 100).toLowerCase().split(';')[0];
  if (reported === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_TYPES[reported]) return reported;
  return EXTENSION_TYPES[extensionOf(fileName)] || null;
}

function normalizeCategory(category, { required = false } = {}) {
  const value = text(category, 40).toLowerCase();
  if (!value) {
    if (required) throw new RequestError(400, 'Choose a category for this record.');
    return 'other';
  }
  if (!CATEGORIES[value]) throw new RequestError(400, 'Choose a valid record category.');
  return value;
}

function normalizeTitle(title, fallback) {
  const value = text(title, 120) || text(String(fallback || '').replace(/\.[a-z0-9]{1,5}$/i, ''), 120);
  if (!value) throw new RequestError(400, 'Enter a name for this record.');
  return value;
}

function normalizeNotes(notes) {
  const value = text(notes, 500);
  return value || null;
}

function normalizeRecordDate(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new RequestError(400, 'Record date must use the YYYY-MM-DD format.');
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new RequestError(400, 'Enter a valid record date.');
  }
  // Allow "today" in any Philippine/UTC offset by comparing against tomorrow (UTC).
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  if (y < 1900 || date.getTime() > tomorrow) throw new RequestError(400, 'Record date cannot be in the future.');
  return raw;
}

function mapRecord(row) {
  const mime = row.mime_type || '';
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    categoryLabel: CATEGORIES[row.category] || CATEGORIES.other,
    notes: row.notes || '',
    recordDate: row.record_date || null,
    fileName: row.file_name,
    mimeType: mime,
    kind: mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : 'file',
    sizeBytes: Number(row.size_bytes) || 0,
    source: row.source || 'patient',
    canDelete: row.can_delete !== false,
    shareWithProviders: !!row.share_with_providers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireUser(userId) {
  if (!userId) throw new RequestError(401, 'Please log in again.');
}

function requireId(id) {
  const value = text(id, 64);
  if (!new RegExp(`^${UUID}$`, 'i').test(value)) throw new RequestError(400, 'Record ID is required.');
  return value;
}

async function findOwnedRecord(admin, userId, id) {
  const { data, error } = await admin
    .from('health_records')
    .select(RECORD_COLUMNS)
    .eq('id', id)
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw new RequestError(503, 'Could not load this record right now.');
  if (!data) throw new RequestError(404, 'Record not found.');
  return data;
}

/** List the patient's records, newest first, with a per-category summary. */
async function listRecords(admin, userId, { category } = {}) {
  requireUser(userId);
  let query = admin
    .from('health_records')
    .select(RECORD_COLUMNS)
    .eq('profile_id', userId)
    .order('created_at', { ascending: false });
  if (category && category !== 'all') query = query.eq('category', normalizeCategory(category));

  const { data, error } = await query;
  if (error) throw new RequestError(503, 'Could not load your health records right now.');

  const records = (data || []).map(mapRecord);
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map(key => [key, 0]));
  let totalBytes = 0;
  for (const record of records) {
    counts[record.category] = (counts[record.category] || 0) + 1;
    totalBytes += record.sizeBytes;
  }
  return {
    records,
    summary: { total: records.length, totalBytes, counts },
    categories: Object.entries(CATEGORIES).map(([id, label]) => ({ id, label })),
    limits: { maxFileBytes: MAX_FILE_BYTES, maxRecords: MAX_RECORDS_PER_PATIENT, allowedTypes: Object.keys(ALLOWED_TYPES) },
  };
}

/** Step 1 of an upload: validate the file and issue a one-time signed upload URL in the patient's folder. */
async function createUpload(admin, userId, body = {}) {
  requireUser(userId);
  const fileName = sanitizeFileName(body.fileName || body.file_name);
  const mimeType = resolveMimeType(body.mimeType || body.mime_type, fileName);
  if (!mimeType) throw new RequestError(415, 'Only PDF, JPG, PNG, HEIC or WEBP files can be uploaded.');

  const sizeBytes = Number(body.sizeBytes ?? body.size_bytes);
  if (Number.isFinite(sizeBytes) && sizeBytes > MAX_FILE_BYTES) {
    throw new RequestError(413, 'This file is larger than 10 MB. Please upload a smaller file.');
  }
  if (Number.isFinite(sizeBytes) && sizeBytes <= 0) throw new RequestError(400, 'This file is empty.');

  const { count, error: countError } = await admin
    .from('health_records')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId);
  if (countError) throw new RequestError(503, 'Could not prepare the upload right now.');
  if ((count || 0) >= MAX_RECORDS_PER_PATIENT) {
    throw new RequestError(409, `Your vault is full (${MAX_RECORDS_PER_PATIENT} files). Delete a file to upload a new one.`);
  }

  const path = `${userId}/${randomUUID()}.${ALLOWED_TYPES[mimeType]}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) throw new RequestError(503, 'Could not prepare the upload right now.');

  return { bucket: BUCKET, path, token: data.token, uploadUrl: data.signedUrl, fileName, mimeType, maxFileBytes: MAX_FILE_BYTES };
}

async function storedObjectInfo(admin, path) {
  const bucket = admin.storage.from(BUCKET);
  if (typeof bucket.info === 'function') {
    const { data, error } = await bucket.info(path);
    if (!error && data) return { size: Number(data.size), contentType: data.contentType || data.metadata?.mimetype || '' };
  }
  const slash = path.lastIndexOf('/');
  const { data, error } = await bucket.list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  const item = !error && (data || []).find(entry => entry.name === path.slice(slash + 1));
  if (!item) return null;
  return { size: Number(item.metadata?.size), contentType: item.metadata?.mimetype || '' };
}

/** Step 2 of an upload: confirm the file reached storage, then record it in the vault. */
async function confirmUpload(admin, userId, body = {}, { now = new Date() } = {}) {
  requireUser(userId);
  const path = text(body.path, 200);
  const pathPattern = new RegExp(`^${userId.replace(/[^0-9a-f-]/gi, '')}/${UUID}\\.(pdf|jpg|png|heic|heif|webp)$`, 'i');
  if (!path || !pathPattern.test(path)) throw new RequestError(403, 'This upload does not belong to your account.');

  const fileName = sanitizeFileName(body.fileName || body.file_name);
  const category = normalizeCategory(body.category, { required: true });
  const title = normalizeTitle(body.title, fileName);
  const notes = normalizeNotes(body.notes);
  const recordDate = normalizeRecordDate(body.recordDate ?? body.record_date, now);

  const { data: existing } = await admin.from('health_records').select('id').eq('storage_path', path).maybeSingle();
  if (existing) throw new RequestError(409, 'This file was already saved to your vault.');

  const info = await storedObjectInfo(admin, path);
  if (!info) throw new RequestError(400, 'The file upload did not finish. Please try again.');

  const extType = EXTENSION_TYPES[extensionOf(path)];
  const mimeType = resolveMimeType(info.contentType, '') || extType;
  const discard = async () => { try { await admin.storage.from(BUCKET).remove([path]); } catch {} };
  if (!mimeType || mimeType !== extType && !(extType === 'image/heic' && mimeType === 'image/heif')) {
    await discard();
    throw new RequestError(415, 'Only PDF, JPG, PNG, HEIC or WEBP files can be uploaded.');
  }
  if (!Number.isFinite(info.size) || info.size <= 0 || info.size > MAX_FILE_BYTES) {
    await discard();
    throw new RequestError(413, 'This file is empty or larger than 10 MB.');
  }

  const { data, error } = await admin
    .from('health_records')
    .insert([{
      profile_id: userId, title, category, notes, record_date: recordDate, file_name: fileName,
      mime_type: mimeType, size_bytes: info.size, storage_path: path,
      source: 'patient', can_delete: true, share_with_providers: !!body.shareWithProviders,
    }])
    .select(RECORD_COLUMNS)
    .single();
  if (error || !data) {
    await discard();
    throw new RequestError(503, 'Could not save this record right now. Please try again.');
  }
  return { record: mapRecord(data) };
}

/** Short-lived signed URL for viewing or downloading one of the patient's files. */
async function getFileUrl(admin, userId, body = {}) {
  requireUser(userId);
  const row = await findOwnedRecord(admin, userId, requireId(body.id));
  const options = body.mode === 'download' ? { download: row.file_name } : undefined;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_SECONDS, options);
  if (error || !data?.signedUrl) throw new RequestError(503, 'Could not open this file right now.');
  return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS, fileName: row.file_name, mimeType: row.mime_type };
}

/** Rename, re-categorize, annotate, date or change sharing for a record. Only supplied fields change. */
async function updateRecord(admin, userId, body = {}, { now = new Date() } = {}) {
  requireUser(userId);
  const id = requireId(body.id);
  const row = await findOwnedRecord(admin, userId, id);

  const changes = {};
  if (body.title !== undefined) changes.title = normalizeTitle(body.title, '');
  if (body.category !== undefined) changes.category = normalizeCategory(body.category, { required: true });
  if (body.notes !== undefined) changes.notes = normalizeNotes(body.notes);
  if (body.recordDate !== undefined) changes.record_date = normalizeRecordDate(body.recordDate, now);
  if (body.shareWithProviders !== undefined) changes.share_with_providers = !!body.shareWithProviders;
  if (!Object.keys(changes).length) return { record: mapRecord(row) };
  changes.updated_at = now.toISOString();

  const { data, error } = await admin
    .from('health_records')
    .update(changes)
    .eq('id', id)
    .eq('profile_id', userId)
    .select(RECORD_COLUMNS)
    .single();
  if (error || !data) throw new RequestError(503, 'Could not update this record right now.');
  return { record: mapRecord(data) };
}

/** Delete a record and its file, if the patient is permitted to. */
async function deleteRecord(admin, userId, body = {}) {
  requireUser(userId);
  const id = requireId(body.id);
  const row = await findOwnedRecord(admin, userId, id);
  if (row.can_delete === false) {
    throw new RequestError(403, 'This record was issued by your clinic and cannot be deleted from the app.');
  }

  // File first: if this fails nothing changes, and a retry after a later failure is safe.
  const removed = await admin.storage.from(BUCKET).remove([row.storage_path]);
  if (removed?.error) throw new RequestError(503, 'Could not delete this file right now. Please try again.');

  const { error } = await admin.from('health_records').delete().eq('id', id).eq('profile_id', userId);
  if (error) throw new RequestError(503, 'Could not delete this record right now. Please try again.');
  return { deleted: true, id };
}

/** Remove every stored file for an account (used when the patient deletes their account). */
async function purgeAccountFiles(admin, userId) {
  if (!userId) return { removed: 0 };
  const { data, error } = await admin.from('health_records').select('storage_path').eq('profile_id', userId);
  if (error) return { removed: 0 };
  const paths = (data || []).map(row => row.storage_path).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    try { await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100)); } catch {}
  }
  return { removed: paths.length };
}

async function handleAction(admin, userId, body = {}) {
  const action = text(body.action, 40) || 'list';
  if (action === 'list') return listRecords(admin, userId, body);
  if (action === 'create_upload') return createUpload(admin, userId, body);
  if (action === 'confirm_upload') return confirmUpload(admin, userId, body);
  if (action === 'get_url') return getFileUrl(admin, userId, body);
  if (action === 'update') return updateRecord(admin, userId, body);
  if (action === 'delete') return deleteRecord(admin, userId, body);
  throw new RequestError(400, 'Unknown action.');
}

module.exports = {
  BUCKET,
  MAX_FILE_BYTES,
  MAX_RECORDS_PER_PATIENT,
  CATEGORIES,
  ALLOWED_TYPES,
  sanitizeFileName,
  resolveMimeType,
  normalizeRecordDate,
  mapRecord,
  listRecords,
  createUpload,
  confirmUpload,
  getFileUrl,
  updateRecord,
  deleteRecord,
  purgeAccountFiles,
  handleAction,
};
