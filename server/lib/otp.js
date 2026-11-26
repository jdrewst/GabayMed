const { createHmac, randomBytes, randomInt } = require('node:crypto');
const nodemailer = require('nodemailer');
const { RequestError } = require('./provider-accounts');

// Unambiguous uppercase alphanumeric characters (excludes 0/O and 1/I/L).
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHANUM = LETTERS + DIGITS;
const OTP_TTL_SECONDS = 300; // 5 minutes
const SENDER_EMAIL = 'g1.gabaymed@gmail.com';

/**
 * Generates a cryptographically random 6-character alphanumeric OTP
 * guaranteed to contain both letters and numbers (e.g. "K7M4P9").
 */
function generateOtpCode() {
  const chars = [
    LETTERS[randomInt(0, LETTERS.length)],
    DIGITS[randomInt(0, DIGITS.length)],
  ];
  for (let i = 2; i < 6; i++) {
    chars.push(ALPHANUM[randomInt(0, ALPHANUM.length)]);
  }
  // Cryptographic Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

function hmacHex(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function challengeKey(secret, purpose, email) {
  return hmacHex(secret, `otp-key:${purpose}:${email.trim().toLowerCase()}`);
}

function codeHash(secret, purpose, email, code) {
  const normalized = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return hmacHex(secret, `otp-code:${purpose}:${email.trim().toLowerCase()}:${normalized}`);
}

function tokenHash(secret, purpose, email, token) {
  return hmacHex(secret, `otp-token:${purpose}:${email.trim().toLowerCase()}:${token}`);
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(5, local.length - 2))}@${domain}`;
}

async function defaultSendMail({ to, subject, code, purpose, context }) {
  const user = (process.env.GMAIL_USER || SENDER_EMAIL).trim();
  const rawPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!rawPass) {
    throw new RequestError(
      503,
      `Email sender is not configured yet. Add GMAIL_APP_PASSWORD for ${SENDER_EMAIL} in server/.env.`
    );
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: rawPass },
  });

  let actionTitle = 'Confirm your GabayMed Registration';
  let actionDesc = 'complete your account registration';
  if (context === 'delete_account') {
    actionTitle = 'Confirm GabayMed Account Deletion';
    actionDesc = 'confirm the permanent deletion of your GabayMed account';
  } else if (context === 'email_change') {
    actionTitle = 'Verify your new GabayMed Email';
    actionDesc = 'verify and update your email address';
  } else if (purpose === 'reset') {
    actionTitle = 'Reset your GabayMed Password';
    actionDesc = 'reset your password';
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px;">
      <h2 style="color: #4C82F7; margin-top: 0;">GabayMed Verification Code</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.5;">
        Use the One-Time Password (OTP) below to ${actionDesc}.
        This code expires in <strong>5 minutes</strong>.
      </p>
      <div style="background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
        <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0284C7; font-family: monospace;">${code}</span>
      </div>
      <p style="color: #64748B; font-size: 12px; line-height: 1.5;">
        Never share this code with anyone. If you did not request this code, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"GabayMed" <${user}>`,
      to,
      subject: `${actionTitle} (${code})`,
      text: `Your GabayMed verification code is: ${code}. It expires in 5 minutes. Never share this code with anyone.`,
      html,
    });
  } catch (err) {
    console.error('Failed to send OTP email:', err.message);
    throw new RequestError(503, 'Could not send the verification email. Check GMAIL_APP_PASSWORD in server/.env.');
  }
}

async function sendPasswordResetLinkEmail({ to, resetUrl }) {
  const user = (process.env.GMAIL_USER || SENDER_EMAIL).trim();
  const rawPass = (process.env.GMAIL_APP_PASSWORD || 'ohqmyynlxqduvbsg').replace(/\s+/g, '');
  if (!rawPass) {
    throw new RequestError(
      503,
      `Email sender is not configured yet. Add GMAIL_APP_PASSWORD for ${SENDER_EMAIL} in server/.env.`
    );
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: rawPass },
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px;">
      <h2 style="color: #4C82F7; margin-top: 0;">Reset Your GabayMed Password</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">
        We received a request to reset the password for your GabayMed account. Click the button below to choose a new password.
      </p>
      <div style="text-align: center; margin: 26px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #3BA5EC; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 999px;">
          Reset Password
        </a>
      </div>
      <p style="color: #64748B; font-size: 12px; line-height: 1.5;">
        If the button does not work, copy and paste this link into your browser:<br />
        <a href="${resetUrl}" style="color: #0284C7; word-break: break-all;">${resetUrl}</a>
      </p>
      <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin-top: 16px;">
        This link is single-use and will expire shortly. If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"GabayMed" <${user}>`,
      to,
      subject: 'Reset Your GabayMed Password',
      text: `Reset your GabayMed password using this link: ${resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.`,
      html,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err.message);
    throw new RequestError(503, 'Could not send the password reset email. Please try again later.');
  }
}

async function sendAdminPasswordResetEmail({ to, name, email, password }) {
  const user = (process.env.GMAIL_USER || SENDER_EMAIL).trim();
  const rawPass = (process.env.GMAIL_APP_PASSWORD || 'ohqmyynlxqduvbsg').replace(/\s+/g, '');
  if (!rawPass) {
    throw new RequestError(
      503,
      `Email sender is not configured yet. Add GMAIL_APP_PASSWORD for ${SENDER_EMAIL} in server/.env.`
    );
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: rawPass },
  });

  const greetingName = name ? `Hello ${name},` : 'Hello,';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px;">
      <h2 style="color: #4C82F7; margin-top: 0;">Your GabayMed Password Was Updated</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">
        ${greetingName}<br /><br />
        Your clinic IT Administrator has updated the password for your GabayMed account. You can now sign in using your updated credentials below:
      </p>
      <div style="background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; color: #334155; font-size: 13px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 0; color: #334155; font-size: 13px;"><strong>New Password:</strong> ${password}</p>
      </div>
      <p style="color: #64748B; font-size: 12px; line-height: 1.5;">
        For your security, please keep your password confidential. If you did not expect this change, contact your clinic IT Administrator immediately.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"GabayMed" <${user}>`,
    to,
    subject: 'Your GabayMed Password Has Been Updated',
    text: `${greetingName}\n\nYour clinic IT Administrator has updated your GabayMed account password.\n\nEmail: ${email}\nNew Password: ${password}\n\nIf you did not expect this change, please contact your clinic IT Administrator immediately.`,
    html,
  });
}

module.exports = {
  OTP_TTL_SECONDS,
  SENDER_EMAIL,
  generateOtpCode,
  challengeKey,
  codeHash,
  tokenHash,
  maskEmail,
  defaultSendMail,
  sendPasswordResetLinkEmail,
  sendAdminPasswordResetEmail,
};
