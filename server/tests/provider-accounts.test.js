const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderAccount, resetProviderPassword, changeOwnPassword, providerInput } = require('../lib/provider-accounts');

const input = { name: ' Test Doctor ', email: ' Doctor@Example.com ', role: 'DOCTOR',
  licenseNo: '123', schedule: { mon: '09:00-17:00' } };
const row = { provider_id: 123, name: 'Test Doctor', email: 'doctor@example.com',
  type: 'DOCTOR', NPI: '123', working_hrs: 8, schedule_details: input.schedule };

function mock(options = {}) {
  const calls = { created: [], rpc: [], deleted: [], userDeleted: [] };
  const admin = {
    auth: {
      getUser: async () => options.invalidToken ? { error: new Error('bad token') } : { data: { user: { id: 'admin-id' } } },
      admin: {
        createUser: async value => { calls.created.push(value); return options.duplicate
          ? { error: { code: 'email_exists' } } : { data: { user: { id: 'new-id' } } }; },
        deleteUser: async id => { calls.deleted.push(id); return options.cleanupError ? { error: new Error('cleanup') } : {}; }
      }
    },
    from(table) {
      let deleting = false;
      return {
        select() { return this; },
        limit: async () => ({ error: options.missingMigration ? new Error('missing column') : null }),
        delete() { deleting = true; return this; },
        eq(key, value) { if (deleting) { calls.userDeleted.push(value); return Promise.resolve({ error: null }); } return this; },
        single: async () => ({ data: { id: 'admin-id', role: options.role || 'IT Admin', facility_id: options.noClinic ? null : 'real-clinic' } }),
        maybeSingle: async () => ({ data: options.committed ? row : null, error: options.verifyError ? new Error('unavailable') : null })
      };
    },
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return options.rpcError
      ? { error: new Error('database failure') } : { data: row }; }
  };
  return { admin, calls };
}

test('requires a valid session before creating Auth users', async () => {
  for (const token of [null, 'invalid']) {
    const { admin, calls } = mock({ invalidToken: true });
    await assert.rejects(createProviderAccount(admin, token, input), error => error.status === 401);
    assert.equal(calls.created.length, 0);
  }
});

test('Hospital Staff and unassigned admins cannot create provider accounts', async () => {
  for (const options of [{ role: 'Hospital Staff' }, { role: 'admin' }, { noClinic: true }]) {
    const { admin, calls } = mock(options);
    await assert.rejects(createProviderAccount(admin, 'token', input), error => error.status === 403);
    assert.equal(calls.created.length, 0);
  }
});

test('creates a random password and ignores submitted credentials and clinic overrides', async () => {
  const { admin, calls } = mock();
  const result = await createProviderAccount(admin, 'token', { ...input, password: 'chosen', facility_id: 'fake-clinic', accountRole: 'IT Admin', working_hrs: 999 });
  assert.equal(result.credentials.role, 'Hospital Staff');
  assert.equal(result.credentials.email, 'doctor@example.com');
  assert.notEqual(result.credentials.password, 'chosen');
  assert.ok(result.credentials.password.length >= 32);
  assert.equal(calls.created[0].password, result.credentials.password);
  assert.deepEqual(calls.created[0].app_metadata, { must_change_password: true });
  assert.equal(calls.rpc[0].args.p_actor_id, 'admin-id');
  assert.equal(calls.rpc[0].args.p_user_id, 'new-id');
  assert.equal(calls.rpc[0].args.p_provider.working_hrs, 8);
  assert.equal(calls.rpc[0].args.p_provider.facility_id, undefined);
  assert.equal(calls.rpc[0].args.p_provider.password, undefined);
  assert.equal(result.provider.id, 123);
});

test('different new accounts receive different passwords', async () => {
  const first = await createProviderAccount(mock().admin, 'token', input);
  const second = await createProviderAccount(mock().admin, 'token', input);
  assert.notEqual(first.credentials.password, second.credentials.password);
});

test('rejects invalid input before creating accounts', async () => {
  for (const value of [{ ...input, email: 'bad' }, { ...input, name: '' }, { ...input, schedule: {} },
    { ...input, schedule: { mon: '17:00-09:00' } }, { ...input, schedule: { mon: '25:00-26:00' } }]) {
    const { admin, calls } = mock();
    await assert.rejects(createProviderAccount(admin, 'token', value), error => error.status === 400);
    assert.equal(calls.created.length, 0);
  }
  assert.equal(providerInput(input).email, 'doctor@example.com');
});

test('duplicate email never modifies existing accounts', async () => {
  const { admin, calls } = mock({ duplicate: true });
  await assert.rejects(createProviderAccount(admin, 'token', input), error => error.status === 409);
  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.deleted.length, 0);
});

test('missing migration is detected before an Auth account is created', async () => {
  const { admin, calls } = mock({ missingMigration: true });
  await assert.rejects(createProviderAccount(admin, 'token', input), error => error.status === 503);
  assert.equal(calls.created.length, 0);
});

test('failed database provisioning cleans up only the newly created account', async () => {
  const { admin, calls } = mock({ rpcError: true });
  await assert.rejects(createProviderAccount(admin, 'token', input), /No provider was saved/);
  assert.deepEqual(calls.deleted, ['new-id']);
  assert.deepEqual(calls.userDeleted, ['new-id']);
});

test('ambiguous committed response does not delete the successful account', async () => {
  const { admin, calls } = mock({ rpcError: true, committed: true });
  const result = await createProviderAccount(admin, 'token', input);
  assert.equal(result.success, true);
  assert.equal(calls.deleted.length, 0);
});

test('unverifiable result and cleanup failure produce recovery errors', async () => {
  const check = mock({ rpcError: true, verifyError: true });
  await assert.rejects(createProviderAccount(check.admin, 'token', input), /could not be verified/);
  assert.equal(check.calls.deleted.length, 0);
  await assert.rejects(createProviderAccount(mock({ rpcError: true, cleanupError: true }).admin, 'token', input), /administrator cleanup/);
});

test('IT Admin can manually reset a provider password permanently', async () => {
  const updates = [];
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-id', app_metadata: {} } } }),
      admin: {
        updateUserById: async (id, patch) => { updates.push({ id, patch }); return {}; }
      }
    },
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        ilike() { return this; },
        single: async () => ({ data: { id: 'admin-id', role: 'IT Admin', facility_id: 'real-clinic' } }),
        maybeSingle: async () => ({
          data: table === 'providers'
            ? { provider_id: 123, name: 'Test Doctor', email: 'doctor@example.com', user_id: 'prov-user-id', facility_id: 'real-clinic' }
            : null
        })
      };
    }
  };

  const sentEmails = [];
  const res = await resetProviderPassword(admin, 'token', { providerId: 123 }, {
    sendMail: async m => sentEmails.push(m)
  });
  assert.equal(res.success, true);
  assert.equal(res.emailSent, true);
  assert.equal(res.credentials.email, 'doctor@example.com');
  assert.ok(res.credentials.password.length >= 32);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'prov-user-id');
  assert.equal(updates[0].patch.app_metadata.must_change_password, false);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'doctor@example.com');
  assert.equal(sentEmails[0].password, res.credentials.password);

  await assert.rejects(
    resetProviderPassword(admin, 'token', { providerId: 123, password: 'short' }),
    e => e.status === 400
  );

  const auth = {
    auth: {
      signInWithPassword: async ({ password }) =>
        password === 'OldStr0ng!Pass' ? { data: { user: { id: 'prov-user-id' } } } : { error: { code: 'invalid_credentials' } }
    }
  };
  await assert.rejects(
    resetProviderPassword(admin, 'token', { providerId: 123, password: 'OldStr0ng!Pass' }, { auth }),
    e => e.status === 400 && /different from the current password/i.test(e.message)
  );
});

test('logged-in clinic user can change only their own password after verifying current password', async () => {
  const updates = [];
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'staff-id', email: 'staff@clinic.ph', app_metadata: {} } } }),
      admin: {
        updateUserById: async (id, patch) => { updates.push({ id, patch }); return {}; }
      }
    },
    from: () => ({
      select() { return this; },
      eq() { return this; },
      single: async () => ({ data: { id: 'staff-id', role: 'Hospital Staff', facility_id: 'real-clinic' } })
    })
  };
  const auth = {
    auth: {
      signInWithPassword: async ({ password }) =>
        password === 'Curr3nt!Pass99' ? { data: { user: { id: 'staff-id' } } } : { error: { code: 'invalid_credentials' } }
    }
  };

  await assert.rejects(
    changeOwnPassword(admin, auth, 'token', { currentPassword: 'wrong', newPassword: 'NewStr0ng!Pass1' }),
    e => e.status === 401
  );
  await assert.rejects(
    changeOwnPassword(admin, auth, 'token', { currentPassword: 'Curr3nt!Pass99', newPassword: 'Curr3nt!Pass99' }),
    e => e.status === 400
  );
  const ok = await changeOwnPassword(admin, auth, 'token', { currentPassword: 'Curr3nt!Pass99', newPassword: 'NewStr0ng!Pass1' });
  assert.deepEqual(ok, { success: true });
  assert.equal(updates[0].id, 'staff-id');
  assert.equal(updates[0].patch.password, 'NewStr0ng!Pass1');
});
