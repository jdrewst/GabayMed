const { RequestError } = require('./provider-accounts');

async function changeFirstPassword(admin, token, body) {
  if (!token) throw new RequestError(401, 'Please sign in again.');
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) throw new RequestError(401, 'Please sign in again.');
  if (user.app_metadata?.must_change_password !== true) {
    throw new RequestError(409, 'Your initial password has already been changed.');
  }
  const password = body?.password;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128
    || !/[a-z]/.test(password) || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new RequestError(400, 'Use 12–128 characters with uppercase, lowercase, a number, and a symbol.');
  }
  // Both values are saved in the same Auth update. User metadata is never trusted.
  const saved = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, must_change_password: false }
  });
  if (saved.error) throw new RequestError(400, 'Could not change your password. Use a different password and try again.');
  return { success: true };
}

module.exports = { changeFirstPassword };
