const { test } = require('node:test');
const assert = require('node:assert/strict');
const vault = require('../lib/health-records');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Minimal in-memory stand-in for the Supabase admin client (table + storage).
function fakeAdmin({ rows = [], objects = {}, failRemove = false, failInsert = false } = {}) {
  const state = { rows: rows.map(r => ({ ...r })), objects: { ...objects }, removed: [], signedUploads: [] };

  function query(table) {
    const filters = [];
    let op = 'select', payload = null, head = false, countMode = null, single = false, maybe = false;
    const run = () => {
      if (table !== 'health_records') return { data: null, error: { message: 'unknown table' } };
      const match = row => filters.every(([col, val]) => row[col] === val);
      if (op === 'insert') {
        if (failInsert) return { data: null, error: { message: 'insert failed' } };
        const row = { id: REC_ID, created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z', ...payload[0] };
        state.rows.push(row);
        return { data: single ? row : [row], error: null };
      }
      if (op === 'update') {
        const hits = state.rows.filter(match);
        hits.forEach(row => Object.assign(row, payload));
        return { data: single ? hits[0] || null : hits, error: single && !hits[0] ? { message: 'none' } : null };
      }
      if (op === 'delete') {
        state.rows = state.rows.filter(row => !match(row));
        return { data: null, error: null };
      }
      const hits = state.rows.filter(match);
      if (head) return { data: null, count: hits.length, error: null };
      if (single || maybe) return { data: hits[0] || null, error: null };
      return { data: hits, error: null };
    };
    const builder = {
      select(_cols, opts = {}) { if (op === 'select') { head = !!opts.head; countMode = opts.count; } return builder; },
      insert(value) { op = 'insert'; payload = value; return builder; },
      update(value) { op = 'update'; payload = value; return builder; },
      delete() { op = 'delete'; return builder; },
      eq(col, val) { filters.push([col, val]); return builder; },
      order() { return builder; },
      single() { single = true; return Promise.resolve(run()); },
      maybeSingle() { maybe = true; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  }

  return {
    state,
    from: query,
    storage: {
      from: bucket => {
        assert.equal(bucket, vault.BUCKET);
        return {
          async createSignedUploadUrl(path) { state.signedUploads.push(path); return { data: { token: 'tok', signedUrl: `https://x/${path}?token=tok`, path }, error: null }; },
          async info(path) { return state.objects[path] ? { data: state.objects[path], error: null } : { data: null, error: { message: 'not found' } }; },
          async createSignedUrl(path, seconds, options) { return { data: { signedUrl: `https://x/${path}?exp=${seconds}${options?.download ? '&download=' + options.download : ''}` }, error: null }; },
          async remove(paths) {
            if (failRemove) return { data: null, error: { message: 'storage down' } };
            state.removed.push(...paths); paths.forEach(p => delete state.objects[p]);
            return { data: [], error: null };
          },
        };
      },
    },
  };
}

function storedRow(overrides = {}) {
  return {
    id: REC_ID, profile_id: USER, title: 'CBC Result', category: 'lab_result', notes: null, record_date: '2026-11-01',
    file_name: 'cbc.pdf', mime_type: 'application/pdf', size_bytes: 2048,
    storage_path: `${USER}/${REC_ID}.pdf`, source: 'patient', can_delete: true, share_with_providers: false,
    created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', ...overrides,
  };
}

test('resolveMimeType accepts supported types and falls back to the file extension', () => {
  assert.equal(vault.resolveMimeType('application/pdf', 'x.pdf'), 'application/pdf');
  assert.equal(vault.resolveMimeType('image/jpg', 'x'), 'image/jpeg');
  assert.equal(vault.resolveMimeType('application/octet-stream', 'scan.HEIC'), 'image/heic');
  assert.equal(vault.resolveMimeType('application/zip', 'virus.exe'), null);
});

test('sanitizeFileName strips folders and unsafe characters', () => {
  assert.equal(vault.sanitizeFileName('../../etc/pa<ss>wd.pdf'), 'passwd.pdf');
  assert.equal(vault.sanitizeFileName(''), 'health-record');
});

test('normalizeRecordDate rejects invalid and future dates', () => {
  const now = new Date('2026-11-19T05:00:00Z');
  assert.equal(vault.normalizeRecordDate('2026-11-19', now), '2026-11-19');
  assert.equal(vault.normalizeRecordDate('', now), null);
  assert.throws(() => vault.normalizeRecordDate('2026-02-30', now), /valid record date/);
  assert.throws(() => vault.normalizeRecordDate('2027-01-01', now), /future/);
  assert.throws(() => vault.normalizeRecordDate('11/19/2026', now), /YYYY-MM-DD/);
});

test('listRecords returns only the patient\'s records with a category summary', async () => {
  const admin = fakeAdmin({ rows: [storedRow(), storedRow({ id: 'b', profile_id: OTHER, storage_path: 'other' })] });
  const result = await vault.listRecords(admin, USER);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].categoryLabel, 'Lab Results');
  assert.equal(result.records[0].kind, 'pdf');
  assert.equal(result.summary.counts.lab_result, 1);
  assert.equal(result.summary.totalBytes, 2048);
});

test('createUpload rejects unsupported and oversized files', async () => {
  const admin = fakeAdmin();
  await assert.rejects(vault.createUpload(admin, USER, { fileName: 'a.exe', mimeType: 'application/x-msdownload' }), { status: 415 });
  await assert.rejects(vault.createUpload(admin, USER, { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: vault.MAX_FILE_BYTES + 1 }), { status: 413 });
  assert.equal(admin.state.signedUploads.length, 0);
});

test('createUpload issues a signed URL inside the patient\'s own folder', async () => {
  const admin = fakeAdmin();
  const result = await vault.createUpload(admin, USER, { fileName: 'xray.png', mimeType: 'image/png', sizeBytes: 5000 });
  assert.match(result.path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.png$`));
  assert.equal(result.token, 'tok');
  assert.equal(result.mimeType, 'image/png');
});

test('confirmUpload refuses paths outside the patient\'s folder', async () => {
  const admin = fakeAdmin();
  await assert.rejects(vault.confirmUpload(admin, USER, { path: `${OTHER}/${REC_ID}.pdf`, category: 'lab_result' }), { status: 403 });
});

test('confirmUpload saves the record using the stored file size', async () => {
  const path = `${USER}/${REC_ID}.pdf`;
  const admin = fakeAdmin({ objects: { [path]: { size: 4096, contentType: 'application/pdf' } } });
  const { record } = await vault.confirmUpload(admin, USER, {
    path, fileName: 'CBC Nov.pdf', category: 'lab_result', recordDate: '2026-11-01', notes: 'Fasting',
  }, { now: new Date('2026-11-19T00:00:00Z') });
  assert.equal(record.title, 'CBC Nov');
  assert.equal(record.sizeBytes, 4096);
  assert.equal(record.canDelete, true);
  assert.equal(admin.state.rows.length, 1);
});

test('confirmUpload discards files that exceed the size limit', async () => {
  const path = `${USER}/${REC_ID}.pdf`;
  const admin = fakeAdmin({ objects: { [path]: { size: vault.MAX_FILE_BYTES + 1, contentType: 'application/pdf' } } });
  await assert.rejects(vault.confirmUpload(admin, USER, { path, category: 'other', fileName: 'big.pdf' }), { status: 413 });
  assert.deepEqual(admin.state.removed, [path]);
});

test('confirmUpload removes the file when saving the record fails', async () => {
  const path = `${USER}/${REC_ID}.jpg`;
  const admin = fakeAdmin({ objects: { [path]: { size: 10, contentType: 'image/jpeg' } }, failInsert: true });
  await assert.rejects(vault.confirmUpload(admin, USER, { path, category: 'imaging', fileName: 'scan.jpg' }), { status: 503 });
  assert.deepEqual(admin.state.removed, [path]);
});

test('getFileUrl only serves the owner\'s files and supports download mode', async () => {
  const admin = fakeAdmin({ rows: [storedRow()] });
  const result = await vault.getFileUrl(admin, USER, { id: REC_ID, mode: 'download' });
  assert.match(result.url, /download=cbc\.pdf/);
  await assert.rejects(vault.getFileUrl(admin, OTHER, { id: REC_ID }), { status: 404 });
});

test('updateRecord renames, re-categorizes and changes sharing', async () => {
  const admin = fakeAdmin({ rows: [storedRow()] });
  const { record } = await vault.updateRecord(admin, USER, {
    id: REC_ID, title: '  CBC   (Nov) ', category: 'consultation', shareWithProviders: true,
  });
  assert.equal(record.title, 'CBC (Nov)');
  assert.equal(record.category, 'consultation');
  assert.equal(record.shareWithProviders, true);
  await assert.rejects(vault.updateRecord(admin, USER, { id: REC_ID, category: 'memes' }), { status: 400 });
});

test('deleteRecord removes the file and the row', async () => {
  const admin = fakeAdmin({ rows: [storedRow()] });
  const result = await vault.deleteRecord(admin, USER, { id: REC_ID });
  assert.equal(result.deleted, true);
  assert.equal(admin.state.rows.length, 0);
  assert.deepEqual(admin.state.removed, [`${USER}/${REC_ID}.pdf`]);
});

test('deleteRecord blocks clinic-issued records and other patients', async () => {
  const locked = fakeAdmin({ rows: [storedRow({ source: 'facility', can_delete: false })] });
  await assert.rejects(vault.deleteRecord(locked, USER, { id: REC_ID }), { status: 403 });
  assert.equal(locked.state.rows.length, 1);
  const admin = fakeAdmin({ rows: [storedRow()] });
  await assert.rejects(vault.deleteRecord(admin, OTHER, { id: REC_ID }), { status: 404 });
});

test('deleteRecord keeps the row when the file cannot be removed', async () => {
  const admin = fakeAdmin({ rows: [storedRow()], failRemove: true });
  await assert.rejects(vault.deleteRecord(admin, USER, { id: REC_ID }), { status: 503 });
  assert.equal(admin.state.rows.length, 1);
});

test('handleAction rejects unknown actions', async () => {
  await assert.rejects(vault.handleAction(fakeAdmin(), USER, { action: 'hack' }), { status: 400 });
});

test('endpoint rejects non-POST methods and requests without a bearer token', async () => {
  const handler = require('../api/health-records');
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
    const unauth = await call({ method: 'POST', body: { action: 'list' } });
    assert.equal(unauth.statusCode, 401);
    assert.equal(unauth.headers['Cache-Control'], 'no-store');
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});
