const { test } = require('node:test');
const assert = require('node:assert/strict');
const { login } = require('../lib/login');
const credentials = { email: ' Test@Example.com ', password: 'test-password' };

function mock(options = {}) {
  const calls = { rpc: [], passwords: [] };
  const admin = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'mobile_begin_login') return options.storageError ? { error: {} }
        : { data: options.locked ? { allowed: false, reason: 'locked', retry_after: 800 }
          : options.busy ? { allowed: false, reason: 'busy', retry_after: 2 } : { allowed: true } };
      return options.finishError ? { error: {} } : { data: { accepted: !options.staleLease, locked: !!options.third } };
    },
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: {
      role: options.noClinic ? 'Patient' : 'Hospital Staff', facility_id: options.noClinic ? null : 'clinic-id'
    } }) })
  };
  const auth = { auth: { signInWithPassword: async args => {
    calls.passwords.push(args);
    if (options.outage) throw new Error('network');
    if (options.invalid) return { error: { code: 'invalid_credentials', status: 400 } };
    if (options.throttled) return { error: { code: 'over_request_rate_limit', status: 429 } };
    return { data: { user: { id: 'user-id' }, session: { access_token: 'access', refresh_token: 'refresh' } } };
  } } };
  return { deps: { admin, auth, secret: 'test-server-secret', deviceId: options.deviceId || 'test-device' }, calls };
}

test('locked or concurrent account requests never verify the password', async () => {
  for (const options of [{ locked: true }, { busy: true }]) {
    const { deps, calls } = mock(options);
    await assert.rejects(login(deps, credentials), e => e.status === 429 && e.retryAfter > 0);
    assert.equal(calls.passwords.length, 0);
  }
});
test('missing limiter setup fails closed before password verification', async () => {
  const { deps, calls } = mock({ storageError: true });
  await assert.rejects(login(deps, credentials), e => e.status === 503);
  assert.equal(calls.passwords.length, 0);
});
test('wrong password records failure and third failure returns lock popup information', async () => {
  for (const third of [false, true]) {
    const { deps, calls } = mock({ invalid: true, third });
    await assert.rejects(login(deps, credentials), e => e.status === (third ? 429 : 401));
    assert.equal(calls.rpc[1].args.p_outcome, 'failure');
  }
});
test('valid clinic login resets failures before returning session', async () => {
  const { deps, calls } = mock();
  assert.deepEqual(await login(deps, credentials), { access_token: 'access', refresh_token: 'refresh' });
  assert.deepEqual(calls.passwords, [{ email: 'test@example.com', password: 'test-password' }]);
  assert.equal(calls.rpc[1].args.p_outcome, 'success');
  assert.equal(calls.rpc[0].args.p_lease, calls.rpc[1].args.p_lease);
  assert.equal(calls.rpc[0].args.p_key.length, 64);
  assert.ok(!JSON.stringify(calls.rpc).includes(credentials.password));
  assert.ok(!JSON.stringify(calls.rpc).includes('test@example.com'));
});
test('different accounts have separate cooldown buckets', async () => {
  const first = mock(), second = mock();
  await login(first.deps, credentials);
  await login(second.deps, { ...credentials, email: 'other@example.com' });
  assert.notEqual(first.calls.rpc[0].args.p_key, second.calls.rpc[0].args.p_key);
});

test('email case and whitespace cannot bypass the account cooldown', async () => {
  const first = mock(), second = mock();
  await login(first.deps, credentials);
  await login(second.deps, { ...credentials, email: 'test@example.com' });
  assert.equal(first.calls.rpc[0].args.p_key, second.calls.rpc[0].args.p_key);
});
test('upstream throttle and outages release lease without counting password failure', async () => {
  for (const options of [{ outage: true }, { throttled: true }]) {
    const { deps, calls } = mock(options);
    await assert.rejects(login(deps, credentials));
    assert.equal(calls.rpc[1].args.p_outcome, 'unavailable');
  }
});
test('non-clinic account never receives a website session', async () => {
  const { deps } = mock({ noClinic: true });
  await assert.rejects(login(deps, credentials), e => e.status === 401);
});
test('failed or stale completion cannot release an untracked session', async () => {
  for (const options of [{ finishError: true }, { staleLease: true }]) {
    const { deps } = mock(options);
    await assert.rejects(login(deps, credentials), e => e.status === 503);
  }
});
test('invalid input never touches limiter or Auth', async () => {
  const { deps, calls } = mock();
  await assert.rejects(login(deps, { email: 'bad', password: '' }), e => e.status === 400);
  assert.equal(calls.rpc.length, 0);
});

test('same account shares the cooldown across devices', async () => {
  const first = mock({ deviceId: 'device-one' }), second = mock({ deviceId: 'device-two' });
  await login(first.deps, credentials);
  await login(second.deps, credentials);
  assert.equal(first.calls.rpc[0].args.p_key, second.calls.rpc[0].args.p_key);
});
