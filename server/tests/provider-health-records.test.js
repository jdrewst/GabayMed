const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharing = require('../lib/provider-health-records');
const vault = require('../lib/health-records');

// US-4.0: Gabay 1.0 staff may see a patient's vault files only with account-level consent AND a per-file share flag.

const FACILITY = 'fac-1';
const OTHER_FACILITY = 'fac-2';
const STAFF = '99999999-9999-4999-8999-999999999999';
const PROFILE = '11111111-1111-4111-8111-111111111111';
const PATIENT = '33333333-3333-4333-8333-333333333333';
const SHARED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function record(id, overrides = {}) {
  return {
    id, profile_id: PROFILE, title: `Record ${id.slice(0, 4)}`, category: 'lab_result', notes: 'Fasting', record_date: '2026-11-01',
    file_name: `${id.slice(0, 4)}.pdf`, mime_type: 'application/pdf', size_bytes: 2048, storage_path: `${PROFILE}/${id}.pdf`,
    source: 'patient', can_delete: true, share_with_providers: false,
    created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', ...overrides,
  };
}

// In-memory stand-in for the Supabase admin client covering every table these flows touch.
function fakeAdmin({
  role = 'Hospital Staff', staffFacility = FACILITY, patientFacility = FACILITY, consent = true,
  records = [record(SHARED, { share_with_providers: true }), record(PRIVATE)], mustChangePassword = false,
  profileId = PROFILE, failLog = false,
} = {}) {
  const db = {
    users: [{ id: STAFF, role, facility_id: staffFacility }],
    patients: [{ patient_id: PATIENT, profile_id: profileId, facility_id: patientFacility }],
    profiles: [{ id: PROFILE, data_sharing_consent: consent }],
    health_records: records.map(r => ({ ...r })),
    health_record_access_log: [],
  };
  const state = { db, signed: [], storageWrites: 0, queries: [] };

  function query(table) {
    const filters = [];
    let op = 'select', payload = null, cols = '';
    const run = () => {
      state.queries.push({ table, op, cols, filters: [...filters] });
      if (!db[table]) return { data: null, error: { message: 'unknown table' } };
      if (op === 'insert') {
        if (failLog && table === 'health_record_access_log') throw new Error('table missing');
        db[table].push(...payload);
        return { data: payload, error: null };
      }
      const hits = db[table].filter(row => filters.every(([c, v]) => row[c] === v));
      if (op === 'update') { hits.forEach(row => Object.assign(row, payload)); return { data: hits, error: null }; }
      if (op === 'delete') { db[table] = db[table].filter(row => !hits.includes(row)); return { data: null, error: null }; }
      // Respect the column list so tests can prove storage_path is never selected for listings.
      const picked = cols && cols !== '*' ? hits.map(row => Object.fromEntries(cols.split(',').map(c => c.trim()).map(c => [c, row[c]]))) : hits;
      return { data: picked, error: null };
    };
    const builder = {
      select(c) { if (op === 'select') cols = c || '*'; return builder; },
      insert(v) { op = 'insert'; payload = v; return builder; },
      update(v) { op = 'update'; payload = v; return builder; },
      delete() { op = 'delete'; return builder; },
      eq(c, v) { filters.push([c, v]); return builder; },
      order() { return builder; },
      async single() { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] || null : r.data }; },
      async maybeSingle() { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] || null : r.data }; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return builder;
  }

  return {
    state,
    from: query,
    auth: {
      async getUser(token) {
        if (token !== 'staff-token') return { data: null, error: { message: 'bad token' } };
        return { data: { user: { id: STAFF, app_metadata: { must_change_password: mustChangePassword } } }, error: null };
      },
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, vault.BUCKET);
        return {
          async createSignedUrl(path, seconds, options) {
            state.signed.push(path);
            return { data: { signedUrl: `https://x/${path}?exp=${seconds}${options?.download ? '&download=' + options.download : ''}` }, error: null };
          },
          async remove() { state.storageWrites++; return { data: [], error: null }; },
          async createSignedUploadUrl() { state.storageWrites++; return { data: null, error: { message: 'no' } }; },
        };
      },
    },
  };
}

const list = admin => sharing.handleAction(admin, 'staff-token', { action: 'list', patientId: PATIENT });
const open = (admin, recordId = SHARED, mode = 'view') =>
  sharing.handleAction(admin, 'staff-token', { action: 'get_url', patientId: PATIENT, recordId, mode });

// ---- Who may ask -------------------------------------------------------------------------------

test('requests without a valid clinic session are rejected', async () => {
  await assert.rejects(sharing.handleAction(fakeAdmin(), '', { patientId: PATIENT }), { status: 401 });
  await assert.rejects(sharing.handleAction(fakeAdmin(), 'stolen', { patientId: PATIENT }), { status: 401 });
});

test('only IT Admin / Hospital Staff with a facility may view shared records', async () => {
  await assert.rejects(list(fakeAdmin({ role: 'Patient' })), { status: 403 });
  await assert.rejects(list(fakeAdmin({ staffFacility: null })), { status: 403 });
  await assert.rejects(list(fakeAdmin({ mustChangePassword: true })), { status: 403 });
  assert.equal((await list(fakeAdmin({ role: 'IT Admin' }))).access, 'granted');
});

test('patients of another facility are reported as not found', async () => {
  const admin = fakeAdmin({ patientFacility: OTHER_FACILITY });
  await assert.rejects(list(admin), { status: 404 });
  await assert.rejects(open(admin), { status: 404 });
  assert.equal(admin.state.signed.length, 0);
});

// ---- AC1: consent on + file shared => visible -------------------------------------------------

test('AC1: with account sharing on, only files marked "Share with care providers" are listed', async () => {
  const admin = fakeAdmin();
  const result = await list(admin);
  assert.equal(result.access, 'granted');
  assert.deepEqual(result.records.map(r => r.id), [SHARED]);
  const [shared] = result.records;
  assert.equal(shared.categoryLabel, 'Lab Results');
  assert.equal(shared.fileName, 'aaaa.pdf');
  assert.equal(shared.kind, 'pdf');
  assert.equal(shared.storage_path, undefined);
  assert.equal(shared.storagePath, undefined);
  // The filter is applied in the database query itself, not only after the fact.
  const recordQuery = admin.state.queries.find(q => q.table === 'health_records');
  assert.deepEqual(recordQuery.filters, [['profile_id', PROFILE], ['share_with_providers', true]]);
  assert.doesNotMatch(recordQuery.cols, /storage_path/);
});

test('AC1: staff can open and download a shared file through a short-lived signed URL, and access is logged', async () => {
  const admin = fakeAdmin();
  const viewed = await open(admin);
  assert.match(viewed.url, new RegExp(`${SHARED}\\.pdf\\?exp=${sharing.SIGNED_URL_SECONDS}$`));
  const downloaded = await open(admin, SHARED, 'download');
  assert.match(downloaded.url, /download=aaaa\.pdf/);
  assert.deepEqual(admin.state.db.health_record_access_log.map(e => [e.record_id, e.action, e.actor_id, e.facility_id]), [
    [SHARED, 'view', STAFF, FACILITY], [SHARED, 'download', STAFF, FACILITY],
  ]);
});

test('a missing audit table never blocks access', async () => {
  const result = await open(fakeAdmin({ failLog: true }));
  assert.ok(result.url);
});

// ---- AC2: file unshared OR account restricted => hidden ----------------------------------------

test('AC2: a file that is not shared cannot be opened, even by guessing its ID', async () => {
  const admin = fakeAdmin();
  await assert.rejects(open(admin, PRIVATE), { status: 404 });
  assert.equal(admin.state.signed.length, 0);
});

test('AC2: account-level restriction hides every file, including ones marked shared', async () => {
  for (const consent of [false, null, 'yes']) {
    const admin = fakeAdmin({ consent });
    const result = await list(admin);
    assert.equal(result.access, 'restricted', `consent=${consent}`);
    assert.deepEqual(result.records, []);
    assert.equal(admin.state.queries.some(q => q.table === 'health_records'), false);
    await assert.rejects(open(admin), { status: 403 });
    assert.equal(admin.state.signed.length, 0);
  }
});

test('walk-in patients without an app account have no vault to share', async () => {
  const result = await list(fakeAdmin({ profileId: null }));
  assert.equal(result.access, 'no_account');
  assert.deepEqual(result.records, []);
});

// ---- AC3: toggling changes visibility only ------------------------------------------------------

test('AC3: toggling a file\'s sharing in the patient app updates staff visibility without touching the file', async () => {
  const admin = fakeAdmin();
  const before = JSON.stringify(admin.state.db.health_records.map(({ updated_at, share_with_providers, ...rest }) => rest));

  // Patient turns sharing OFF for the shared file (Gabay 2.0 vault).
  await vault.updateRecord(admin, PROFILE, { id: SHARED, shareWithProviders: false });
  assert.deepEqual((await list(admin)).records, []);
  await assert.rejects(open(admin, SHARED), { status: 404 });

  // Patient turns sharing ON for both files.
  await vault.updateRecord(admin, PROFILE, { id: SHARED, shareWithProviders: true });
  await vault.updateRecord(admin, PROFILE, { id: PRIVATE, shareWithProviders: true });
  assert.deepEqual((await list(admin)).records.map(r => r.id).sort(), [SHARED, PRIVATE].sort());

  const after = JSON.stringify(admin.state.db.health_records.map(({ updated_at, share_with_providers, ...rest }) => rest));
  assert.equal(after, before, 'file metadata and storage paths are unchanged');
  assert.equal(admin.state.db.health_records.length, 2, 'no record was deleted');
  assert.equal(admin.state.storageWrites, 0, 'storage was never written or deleted');
});

test('AC3: turning account-level sharing off and on again restores the same files', async () => {
  const admin = fakeAdmin();
  assert.equal((await list(admin)).records.length, 1);
  admin.state.db.profiles[0].data_sharing_consent = false;
  assert.equal((await list(admin)).access, 'restricted');
  admin.state.db.profiles[0].data_sharing_consent = true;
  assert.deepEqual((await list(admin)).records.map(r => r.id), [SHARED]);
  assert.equal(admin.state.db.health_records.length, 2);
  assert.equal(admin.state.storageWrites, 0);
});

test('patient vault list reports what clinics can currently see', async () => {
  const on = await vault.listRecords(fakeAdmin(), PROFILE);
  assert.deepEqual(on.sharing, { accountSharing: true, sharedCount: 1, visibleToProviders: 1 });
  const off = await vault.listRecords(fakeAdmin({ consent: false }), PROFILE);
  assert.deepEqual(off.sharing, { accountSharing: false, sharedCount: 1, visibleToProviders: 0 });
});

// ---- Input handling & endpoint -----------------------------------------------------------------

test('invalid IDs and unknown actions are rejected', async () => {
  await assert.rejects(sharing.handleAction(fakeAdmin(), 'staff-token', { action: 'list' }), { status: 400 });
  await assert.rejects(sharing.handleAction(fakeAdmin(), 'staff-token', { action: 'list', patientId: "1' OR 1=1" }), { status: 400 });
  await assert.rejects(open(fakeAdmin(), 'not-a-uuid'), { status: 400 });
  await assert.rejects(sharing.handleAction(fakeAdmin(), 'staff-token', { action: 'delete', patientId: PATIENT }), { status: 400 });
});

test('endpoint enforces POST, bearer token, allowed origin and no caching', async () => {
  const handler = require('../api/provider-health-records');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const call = async req => {
    const res = { headers: {}, statusCode: 0, body: null };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.body = value; return res; };
    res.end = () => res;
    await handler({ headers: {}, body: {}, ...req }, res);
    return res;
  };
  try {
    assert.equal((await call({ method: 'GET' })).statusCode, 405);
    const unauth = await call({ method: 'POST', body: { action: 'list', patientId: PATIENT } });
    assert.equal(unauth.statusCode, 401);
    assert.equal(unauth.headers['Cache-Control'], 'no-store');
    assert.equal((await call({ method: 'POST', headers: { origin: 'https://evil.example', host: 'gabay.app' } })).statusCode, 403);
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});
