const bcrypt = require('bcrypt');

const fail = (status, message) => Object.assign(new Error(message), { status });
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).{8,20}$/;

async function changePassword(user, input, options = {}) {
  const { currentPassword, newPassword, confirmPassword } = input || {};
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !passwordPattern.test(newPassword)) throw fail(400, 'Use a new password with 8–20 characters, including upper and lowercase letters, a number, and a symbol.');
  if (newPassword !== confirmPassword) throw fail(400, 'Password confirmation does not match.');
  if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) throw fail(400, 'Current password is incorrect.');
  const beforeData = { passwordUpdatedAt: user.updatedAt };
  await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) }, options);
  return beforeData;
}

module.exports = { changePassword };
