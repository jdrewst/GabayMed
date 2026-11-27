const { randomUUID } = require('node:crypto');
const { RequestError } = require('./provider-accounts');
const vault = require('./health-records');

// Cross-app sharing (US-4.0): clinic staff and providers using the Gabay 1.0 Patient Portal may see a
// patient's Health Record Vault files and upload clinic-issued records (lab results, imaging, etc.).
//   1. the caller is signed-in clinic staff (IT Admin / Hospital Staff) assigned to a facility,
//   2. the patient is registered at that same facility,
//   3. for patient-uploaded files (source !== 'facility'): the patient turned on "Share with my care providers"
//      (share_with_providers = true) and did not explicitly disable Hospital Data Sharing,
//   4. for clinic-uploaded files (source === 'facility'): clinic staff can always see and manage them in HIS,
//      and when share_with_providers = true ("Share with patient on mobile app"), they appear in the patient's
//      mobile app Health Record Vault.

const STAFF_ROLES = ['IT Admin', 'Hospital Staff'];
const SIGNED_URL_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columns staff may see. storage_path and the owner's profile_id never leave the server.
const SHARED_COLUMNS = 'id, title, category, notes, record_date, file_name, mime_type, size_bytes, '
  + 'source, can_delete, share_with_providers, created_at, updated_at';

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
 * If the patient row is not yet linked to a profile_id, attempts to match by email or full_name
 * in `profiles` so mobile app uploads and clinic uploads always share the same vault profile.
 */
async function resolvePatient(admin, actor, patientIdInput) {
  const patientId = cleanId(patientIdInput, 'Patient ID is required.');
  const { data: patient, error } = await admin.from('patients')
    .select('*').eq('patient_id', patientId).maybeSingle();
  if (error) throw new RequestError(503, 'Could not load this patient right now.');
  if (!patient) {
    throw new RequestError(404, 'Patient not found.');
  }
  if (patient.facility_id && actor.facility_id && String(patient.facility_id) !== String(actor.facility_id)) {
    throw new RequestError(404, 'Patient not found.');
  }

  let resolvedProfileId = patient.profile_id && UUID.test(String(patient.profile_id))
    ? String(patient.profile_id)
    : null;

  // Auto-resolve or link profile_id if missing or if a newer sibling patient row exists for the same person
  if (!resolvedProfileId) {
    try {
      if (patient.email) {
        const { data: byEmail } = await admin.from('profiles')
          .select('id').ilike('email', String(patient.email).trim()).limit(1).maybeSingle();
        if (byEmail?.id) resolvedProfileId = byEmail.id;
      }
      if (!resolvedProfileId && (patient.full_name || (patient.first_name && patient.last_name))) {
        const targetName = (patient.full_name || `${patient.first_name || ''} ${patient.last_name || ''}`).trim();
        if (targetName) {
          const { data: byName } = await admin.from('profiles')
            .select('id').ilike('full_name', targetName).limit(1).maybeSingle();
          if (byName?.id) resolvedProfileId = byName.id;
        }
      }
      if (resolvedProfileId) {
        await admin.from('patients').update({ profile_id: resolvedProfileId }).eq('patient_id', patient.patient_id);
        patient.profile_id = resolvedProfileId;
      }
    } catch {}
  }

  if (!resolvedProfileId) {
    // Walk-in patient without a Gabay app account yet
    return { patient, profileId: null, accountSharing: false, linked: false };
  }

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id, data_sharing_consent').eq('id', resolvedProfileId).maybeSingle();
  if (profileError) throw new RequestError(503, 'Could not check this patient\'s privacy settings right now.');

  // Collect all profile IDs that match this patient (e.g. if a walk-in profile AND a mobile auth profile exist)
  const candidateProfileIds = new Set([resolvedProfileId]);
  try {
    if (patient.full_name || (patient.first_name && patient.last_name)) {
      const firstName = (patient.first_name || '').trim();
      const lastName = (patient.last_name || '').trim();
      if (firstName && lastName) {
        const { data: matchingProfiles } = await admin.from('profiles')
          .select('id, data_sharing_consent')
          .ilike('first_name', firstName)
          .ilike('last_name', lastName);
        for (const mp of matchingProfiles || []) {
          if (mp.id && UUID.test(String(mp.id))) {
            candidateProfileIds.add(String(mp.id));
          }
        }
      }
    }
  } catch {}

  // If the patient shared a file (`share_with_providers = true`), allow unless `data_sharing_consent` was explicitly turned false
  // OR if any matched profile has `data_sharing_consent !== false`.
  const accountSharing = profile ? profile.data_sharing_consent !== false : true;
  return {
    patient,
    profileId: resolvedProfileId,
    profileIds: Array.from(candidateProfileIds),
    accountSharing,
    linked: !!profile,
  };
}

/**
 * Ensures the patient has a linked `profiles` row before clinic staff uploads a health record,
 * creating a walk-in profile row if the patient does not have one yet.
 */
async function ensurePatientProfileId(admin, ctx) {
  if (ctx.profileId && UUID.test(String(ctx.profileId))) {
    return ctx.profileId;
  }
  const p = ctx.patient;
  const firstName = (p.first_name || '').trim() || (p.full_name || 'Patient').split(' ')[0] || 'Patient';
  const lastName = (p.last_name || '').trim() || (p.full_name || '').split(' ').slice(1).join(' ') || '';
  const fullName = p.full_name || [firstName, p.middle_name, lastName].filter(Boolean).join(' ') || 'Patient';

  const { data: createdProfile, error: createErr } = await admin
    .from('profiles')
    .insert([{
      first_name: firstName,
      middle_name: p.middle_name || null,
      last_name: lastName,
      full_name: fullName,
      phone_number: p.phone_number || null,
      address: p.address || null,
      date_of_birth: p.date_of_birth || null,
      gender: p.gender || null,
      data_sharing_consent: true,
    }])
    .select('id')
    .single();

  if (createErr || !createdProfile?.id) {
    throw new RequestError(503, 'Could not initialize a health record profile for this patient.');
  }

  await admin.from('patients').update({ profile_id: createdProfile.id }).eq('patient_id', p.patient_id);
  return createdProfile.id;
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
    shareWithProviders: record.shareWithProviders,
    sharedWithPatient: record.source === 'facility' ? record.shareWithProviders : true,
    sharedAt: record.updatedAt || record.createdAt,
    uploadedAt: record.createdAt,
  };
}

async function logAccess(admin, entry) {
  // Best effort: a missing audit table must never block care, and never leaks into the response.
  try { await admin.from('health_record_access_log').insert([entry]); } catch {}
}

/**
 * Shared vault files for one patient + all clinic-uploaded files for that patient.
 * - Patient-uploaded files (`source = 'patient'`) are shown when `share_with_providers === true` and `accountSharing` is allowed.
 * - Clinic-uploaded files (`source = 'facility'`) are ALWAYS shown to clinic staff in HIS (with a toggle for whether they are shared with the patient on the mobile app).
 */
async function listSharedRecords(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const categories = Object.entries(vault.CATEGORIES).map(([id, label]) => ({ id, label }));
  const base = { patientId: ctx.patient.patient_id, categories, records: [] };
  if (!ctx.linked || !ctx.profileIds?.length) return { ...base, access: 'no_account' };

  const { data, error } = await admin.from('health_records')
    .select(SHARED_COLUMNS)
    .in('profile_id', ctx.profileIds)
    .order('created_at', { ascending: false });
  if (error) throw new RequestError(503, 'Could not load shared health records right now.');

  const allRows = data || [];
  const hasAnyPatientShared = allRows.some(row => row.source !== 'facility' && row.share_with_providers === true);

  const visibleRows = allRows.filter(row => {
    // Clinic-uploaded files are always visible to clinic staff in HIS
    if (row.source === 'facility') return true;
    // Patient-uploaded files are visible when the patient turned on "Share with my care providers"
    if (row.share_with_providers !== true) return false;
    return ctx.accountSharing || hasAnyPatientShared;
  });

  const records = visibleRows.map(mapSharedRecord);
  const access = !ctx.accountSharing && !hasAnyPatientShared && records.length === 0 ? 'restricted' : 'granted';
  return { ...base, access, accountSharing: ctx.accountSharing, records };
}

/** Short-lived signed URL for one shared or clinic-uploaded file. */
async function getSharedFileUrl(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const recordId = cleanId(body.recordId ?? body.id, 'Record ID is required.');
  if (!UUID.test(recordId)) throw new RequestError(400, 'Record ID is required.');
  if (!ctx.linked || !ctx.profileIds?.length) {
    throw new RequestError(403, 'This patient does not have any health records.');
  }

  const { data: row, error } = await admin.from('health_records')
    .select('id, file_name, mime_type, storage_path, source, share_with_providers')
    .eq('id', recordId)
    .in('profile_id', ctx.profileIds)
    .maybeSingle();
  if (error) throw new RequestError(503, 'Could not open this file right now.');
  if (!row) {
    throw new RequestError(404, 'This file is no longer available.');
  }
  if (row.source !== 'facility' && row.share_with_providers !== true) {
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

/** Step 1 of a clinic upload: issue a signed upload URL in the patient's vault folder. */
async function createClinicUpload(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const targetProfileId = await ensurePatientProfileId(admin, ctx);
  const ticket = await vault.createUpload(admin, targetProfileId, body);
  return { ...ticket, profileId: targetProfileId };
}

/** Step 2 of a clinic upload: confirm the file in storage and insert with source = 'facility'. */
async function confirmClinicUpload(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const targetProfileId = body.profileId && UUID.test(String(body.profileId))
    ? String(body.profileId)
    : await ensurePatientProfileId(admin, ctx);

  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!path || !path.startsWith(`${targetProfileId}/`)) {
    throw new RequestError(403, 'This upload does not match the selected patient.');
  }

  const fileName = vault.sanitizeFileName(body.fileName || body.file_name);
  const categoryRaw = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  if (!categoryRaw || !vault.CATEGORIES[categoryRaw]) {
    throw new RequestError(400, 'Choose a valid record category.');
  }
  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim().slice(0, 120)
    : fileName.replace(/\.[a-z0-9]{1,5}$/i, '').slice(0, 120) || 'Health Record';
  const notes = typeof body.notes === 'string' && body.notes.trim()
    ? body.notes.trim().slice(0, 500)
    : null;
  const recordDate = vault.normalizeRecordDate(body.recordDate ?? body.record_date);
  const shareWithPatient = body.shareWithPatient !== undefined
    ? !!body.shareWithPatient
    : (body.shareWithProviders !== undefined ? !!body.shareWithProviders : true);

  const bucket = admin.storage.from(vault.BUCKET);
  const slash = path.lastIndexOf('/');
  const { data: listData, error: listErr } = await bucket.list(path.slice(0, slash), {
    search: path.slice(slash + 1),
    limit: 1,
  });
  const item = !listErr && (listData || []).find(entry => entry.name === path.slice(slash + 1));
  const sizeBytes = Number(item?.metadata?.size || body.sizeBytes || 1024);
  const mimeType = vault.resolveMimeType(item?.metadata?.mimetype || body.mimeType || '', fileName) || 'application/pdf';

  const { data, error } = await admin
    .from('health_records')
    .insert([{
      profile_id: targetProfileId,
      title,
      category: categoryRaw,
      notes,
      record_date: recordDate,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes > 0 ? sizeBytes : 1024,
      storage_path: path,
      source: 'facility',
      can_delete: false,
      share_with_providers: shareWithPatient,
    }])
    .select(SHARED_COLUMNS)
    .single();

  if (error || !data) {
    try { await bucket.remove([path]); } catch {}
    throw new RequestError(503, 'Could not save this health record right now. Please try again.');
  }

  return { record: mapSharedRecord(data) };
}

/** Toggle whether a clinic-uploaded record is visible to the patient on the mobile app, or update its details. */
async function updateClinicRecord(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const recordId = cleanId(body.recordId ?? body.id, 'Record ID is required.');
  if (!UUID.test(recordId) || !ctx.profileIds?.length) throw new RequestError(400, 'Record ID is required.');

  const { data: existing, error: findErr } = await admin.from('health_records')
    .select('id, profile_id, source')
    .eq('id', recordId)
    .in('profile_id', ctx.profileIds)
    .maybeSingle();
  if (findErr || !existing) throw new RequestError(404, 'Health record not found.');
  if (existing.source !== 'facility') {
    throw new RequestError(403, 'Only clinic-uploaded records can be modified by clinic staff.');
  }

  const changes = { updated_at: new Date().toISOString() };
  if (body.shareWithPatient !== undefined) changes.share_with_providers = !!body.shareWithPatient;
  else if (body.shareWithProviders !== undefined) changes.share_with_providers = !!body.shareWithProviders;
  if (typeof body.title === 'string' && body.title.trim()) changes.title = body.title.trim().slice(0, 120);
  if (typeof body.category === 'string' && vault.CATEGORIES[body.category.trim().toLowerCase()]) {
    changes.category = body.category.trim().toLowerCase();
  }
  if (body.notes !== undefined) {
    changes.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;
  }
  if (body.recordDate !== undefined) {
    changes.record_date = vault.normalizeRecordDate(body.recordDate);
  }

  const { data: updated, error: updErr } = await admin.from('health_records')
    .update(changes)
    .eq('id', recordId)
    .select(SHARED_COLUMNS)
    .single();
  if (updErr || !updated) throw new RequestError(503, 'Could not update this record right now.');
  return { record: mapSharedRecord(updated) };
}

/** Delete a clinic-uploaded record. */
async function deleteClinicRecord(admin, actor, body = {}) {
  const ctx = await resolvePatient(admin, actor, body.patientId);
  const recordId = cleanId(body.recordId ?? body.id, 'Record ID is required.');
  if (!UUID.test(recordId) || !ctx.profileIds?.length) throw new RequestError(400, 'Record ID is required.');

  const { data: existing, error: findErr } = await admin.from('health_records')
    .select('id, storage_path, source')
    .eq('id', recordId)
    .in('profile_id', ctx.profileIds)
    .maybeSingle();
  if (findErr || !existing) throw new RequestError(404, 'Health record not found.');
  if (existing.source !== 'facility') {
    throw new RequestError(403, 'Patient-uploaded records cannot be deleted by clinic staff.');
  }

  try { await admin.storage.from(vault.BUCKET).remove([existing.storage_path]); } catch {}
  const { error: delErr } = await admin.from('health_records').delete().eq('id', recordId);
  if (delErr) throw new RequestError(503, 'Could not delete this health record right now.');
  return { deleted: true, id: recordId };
}

async function handleAction(admin, token, body = {}) {
  const actor = await requireStaff(admin, token);
  const action = typeof body.action === 'string' ? body.action.trim() : 'list';
  if (action === 'list' || !action) return listSharedRecords(admin, actor, body);
  if (action === 'get_url') return getSharedFileUrl(admin, actor, body);
  if (action === 'create_upload') return createClinicUpload(admin, actor, body);
  if (action === 'confirm_upload') return confirmClinicUpload(admin, actor, body);
  if (action === 'update') return updateClinicRecord(admin, actor, body);
  if (action === 'delete') return deleteClinicRecord(admin, actor, body);
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
  createClinicUpload,
  confirmClinicUpload,
  updateClinicRecord,
  deleteClinicRecord,
  handleAction,
};
