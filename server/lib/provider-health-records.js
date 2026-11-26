const { RequestError } = require('./provider-accounts');
const vault = require('./health-records');

// Cross-app sharing (US-4.0): clinic staff and providers using the Gabay 1.0 Patient Portal may see a
// patient's Health Record Vault files only when ALL of these hold, checked on every request:
//   1. the caller is signed-in clinic staff (IT Admin / Hospital Staff) assigned to a facility,
//   2. the patient is registered at that same facility,
//   3. the patient allows health data sharing on their account (profiles.data_sharing_consent = true),
//   4. the patient turned on "Share with my care providers" for that file (share_with_providers = true).
// Nothing here writes to health_records or Storage: sharing changes visibility only, never the file.

const STAFF_ROLES = ['IT Admin', 'Hospital Staff'];
const SIGNED_URL_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columns staff may see. storage_path and the owner's profile_id never leave the server.
const SHARED_COLUMNS = 'id, title, category, notes, record_date, file_name, mime_type, size_bytes, '
  + 'source, share_with_providers, created_at, updated_at';

function cleanId(value, message) {
  const id = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!id || id.length > 64 || !/^[0-9a-z-]+$/i.test(id)) throw new RequestError(400, message);
  return id;
}

/** Verify the bearer token belongs to clinic staff assigned to a facility. */
async function requireStaff(admin, token) {
  if (!token) throw new RequestError(401, 'Please sign in again.');
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity?.user) throw new RequestError(401, 'Your session expired. Please sign in again.');
  if (identity.user.app_metadata?.must_change_password === true) {
    throw new RequestError(403, 'Change your temporary password before viewing patient records.');
  }
  const { data: actor, error } = await admin.from('users')
    .select('id, role, facility_id').eq('id', identity.user.id).maybeSingle();
  if (error) throw new RequestError(503, 'Could not verify your clinic account right now.');
  if (!actor?.facility_id || !STAFF_ROLES.includes(actor.role)) {
    throw new RequestError(403, 'Only clinic staff can view patient health records.');
  }
  return actor;
}

/**
 * Resolve the patient within the caller's facility and read their account-level sharing permission.
 * Patients of other facilities are reported as "not found" so their existence is not revealed.
 */
async function resolvePatient(admin, actor, patientIdInput) {
  const patientId = cleanId(patientIdInput, 'Patient ID is required.');
  const { data: patient, error } = await admin.from('patients')
    .select('patient_id, profile_id, facility_id').eq('patient_id', patientId).maybeSingle();
  if (error) throw new RequestError(503, 'Could not load this patient right now.');
  if (!patient || String(patient.facility_id) !== String(actor.facility_id)) {
    throw new RequestError(404, 'Patient not found.');
  }
  if (!patient.profile_id || !UUID.test(String(patient.profile_id))) {
    // Walk-in patient without a Gabay app account: there is no vault to share.
    return { patient, profileId: null, accountSharing: false, linked: false };
  }
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id, data_sharing_consent').eq('id', patient.profile_id).maybeSingle();
  if (profileError) throw new RequestError(503, 'Could not check this patient\'s privacy settings right now.');
  // Only an explicit "allow" opens access. Missing or unset consent is treated as restricted.
  return { patient, profileId: patient.profile_id, accountSharing: profile?.data_sharing_consent === true, linked: !!profile };
}

function mapSharedRecord(row) {
  const record = vault.mapRecord(row);
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    categoryLabel: record.categoryLabel,
    notes: record.notes,
    recordDate: record.recordDate,
    fileName: record.fileName,
    mimeType: record.mimeType,
    kind: record.kind,
    sizeBytes: record.sizeBytes,
    source: record.source,
    sharedAt: record.updatedAt || record.createdAt,
    uploadedAt: record.createdAt,
  };
}

async function logAccess(admin, entry) {
  // Best effort: a missing audit table must never block care, and never leaks into the response.
  try { await admin.from('health_record_access_log').insert([entry]); } catch {}
}

/** Shared vault files for one patient, filtered by account-level AND per-file permissions in the query. */
async function listSharedRecords(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const categories = Object.entries(vault.CATEGORIES).map(([id, label]) => ({ id, label }));
  const base = { patientId: ctx.patient.patient_id, categories, records: [] };
  if (!ctx.linked) return { ...base, access: 'no_account' };
  if (!ctx.accountSharing) return { ...base, access: 'restricted' };

  const { data, error } = await admin.from('health_records')
    .select(SHARED_COLUMNS)
    .eq('profile_id', ctx.profileId)
    .eq('share_with_providers', true)
    .order('created_at', { ascending: false });
  if (error) throw new RequestError(503, 'Could not load shared health records right now.');

  // Defence in depth: drop anything the query should already have excluded.
  const records = (data || []).filter(row => row.share_with_providers === true).map(mapSharedRecord);
  return { ...base, access: 'granted', records };
}

/** Short-lived signed URL for one shared file. Every permission is re-checked at the moment of access. */
async function getSharedFileUrl(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const recordId = cleanId(body.recordId ?? body.id, 'Record ID is required.');
  if (!UUID.test(recordId)) throw new RequestError(400, 'Record ID is required.');
  if (!ctx.linked || !ctx.accountSharing) {
    throw new RequestError(403, 'This patient has restricted access to their health records.');
  }

  const { data: row, error } = await admin.from('health_records')
    .select('id, file_name, mime_type, storage_path, share_with_providers')
    .eq('id', recordId)
    .eq('profile_id', ctx.profileId)
    .eq('share_with_providers', true)
    .maybeSingle();
  if (error) throw new RequestError(503, 'Could not open this file right now.');
  // Unshared and non-existent files look the same, so private files are not revealed.
  if (!row || row.share_with_providers !== true) {
    throw new RequestError(404, 'This file is no longer shared by the patient.');
  }

  const mode = body.mode === 'download' ? 'download' : 'view';
  const options = mode === 'download' ? { download: row.file_name } : undefined;
  const { data, error: urlError } = await admin.storage.from(vault.BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS, options);
  if (urlError || !data?.signedUrl) throw new RequestError(503, 'Could not open this file right now.');

  await logAccess(admin, {
    record_id: row.id, profile_id: ctx.profileId, patient_id: String(ctx.patient.patient_id),
    facility_id: String(actor.facility_id), actor_id: actor.id, action: mode,
  });
  return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS, fileName: row.file_name, mimeType: row.mime_type };
}

async function handleAction(admin, token, body = {}) {
  const actor = await requireStaff(admin, token);
  const action = typeof body.action === 'string' ? body.action.trim() : 'list';
  if (action === 'list' || !action) return listSharedRecords(admin, actor, body);
  if (action === 'get_url') return getSharedFileUrl(admin, actor, body);
  throw new RequestError(400, 'Unknown action.');
}

module.exports = {
  STAFF_ROLES,
  SIGNED_URL_SECONDS,
  SHARED_COLUMNS,
  requireStaff,
  resolvePatient,
  listSharedRecords,
  getSharedFileUrl,
  handleAction,
};
