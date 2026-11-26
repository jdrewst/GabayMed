const { test } = require('node:test');
const assert = require('node:assert/strict');
const { changeFirstPassword } = require('../lib/first-password');

function mock(options = {}) {
  const calls = [];
  const admin = { auth: {
    getUser: async () => options.invalid ? { error: {} } : { data: { user: {
      id: 'verified-id', app_metadata: { must_change_password: !options.completed, preserved: 'yes' }
    } } },
    admin: { updateUserById: async (...args) => { calls.push(args); return { error: options.failed ? {} : null }; } }
  } };
  return { admin, calls };
}
test('first password change requires a verified session and server flag', async () => {
  for (const [token, options, status] of [[null, {}, 401], ['token', { invalid: true }, 401], ['token', { completed: true }, 409]]) {
    const { admin, calls } = mock(options);
    await assert.rejects(changeFirstPassword(admin, token, { password: 'ValidPassword1!' }), e => e.status === status);
    assert.equal(calls.length, 0);
  }
});
test('rejects weak passwords without clearing requirement', async () => {
  for (const password of ['short', 'lowercaseonly123!', 'NOLOWERCASE123!', 'NoNumbersHere!', 'NoSymbolsHere123', 'a'.repeat(129)]) {
    const { admin, calls } = mock();
    await assert.rejects(changeFirstPassword(admin, 'token', { password }), e => e.status === 400);
    assert.equal(calls.length, 0);
  }
});
test('updates only verified user password and flag together, preserving other metadata', async () => {
  const { admin, calls } = mock();
  await changeFirstPassword(admin, 'token', { password: 'ValidPassword1!', userId: 'attacker-choice' });
  assert.deepEqual(calls, [['verified-id', { password: 'ValidPassword1!', app_metadata: { must_change_password: false, preserved: 'yes' } }]]);
});
test('failed Auth update never reports success', async () => {
  const { admin } = mock({ failed: true });
  await assert.rejects(changeFirstPassword(admin, 'token', { password: 'ValidPassword1!' }), e => e.status === 400);
});
