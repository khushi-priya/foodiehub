'use strict';

const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { User, Role } = require('../models');

const OTP_TTL_MS = 5 * 60_000;
const OTP_COOLDOWN_MS = 45_000;
const OTP_WINDOW_MS = 60 * 60_000;
const OTP_MAX_REQUESTS = 5;
const OTP_MAX_ATTEMPTS = 5;

let cachedTransport = null;
let cachedTransportKey = '';
let cachedTransportVerified = false;
let transportVerification = null;

function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function otpDigest(userId, otp) {
  const secret = String(process.env.SESSION_SECRET || '').trim();
  if (!secret) throw smtpError('OTP_SIGNING_UNAVAILABLE', 'Email verification is temporarily unavailable. Please try again later.');
  return crypto.createHmac('sha256', secret).update(`${userId}:${otp}`).digest('hex');
}

function smtpError(code, message) {
  return Object.assign(new Error(message), { status: 503, code });
}

function readSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim().toLowerCase();
  const portText = String(process.env.SMTP_PORT || '').trim();
  const port = Number(portText);
  const user = String(process.env.SMTP_USER || '').trim();
  // Accept the documented SMTP_PASSWORD name and legacy SMTP_PASS. Gmail App
  // Passwords are often copied with spaces; those spaces are not significant.
  const password = String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const from = String(process.env.SMTP_FROM || user).trim();
  const secureText = String(process.env.SMTP_SECURE ?? '').trim().toLowerCase();

  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!portText) missing.push('SMTP_PORT');
  if (!user) missing.push('SMTP_USER');
  if (!password) missing.push('SMTP_PASSWORD (or SMTP_PASS)');
  if (!from) missing.push('SMTP_FROM');
  if (missing.length) {
    throw smtpError('SMTP_NOT_CONFIGURED', 'Email delivery is not configured. Check the required SMTP environment settings.');
  }

  if (host !== 'smtp.gmail.com' || !Number.isInteger(port) || ![465, 587].includes(port)) {
    throw smtpError('SMTP_CONFIG_INVALID', 'Email delivery settings are invalid. Check the Gmail SMTP host and port.');
  }

  const inferredSecure = port === 465;
  const secure = secureText === '' ? inferredSecure : secureText === 'true';
  if ((secureText && !['true', 'false'].includes(secureText)) || secure !== inferredSecure) {
    throw smtpError('SMTP_CONFIG_INVALID', 'Email delivery settings are invalid. Port 465 requires secure=true and port 587 requires secure=false.');
  }

  return { host, port, secure, user, password, from };
}

function transportFor(config) {
  const configKey = crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
  if (cachedTransport && cachedTransportKey === configKey) return cachedTransport;

  if (cachedTransport) {
    try { cachedTransport.close(); } catch { /* Ignore errors while replacing stale SMTP configuration. */ }
  }

  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { minVersion: 'TLSv1.2' },
  });
  cachedTransportKey = configKey;
  cachedTransportVerified = false;
  transportVerification = null;
  return cachedTransport;
}

function publicSmtpFailure(error) {
  if (error?.status === 503 && error?.code) return error;

  const errorCode = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (errorCode === 'EAUTH' || errorCode === 'ELOGIN' || responseCode === 535) {
    return smtpError('SMTP_AUTH_FAILED', 'Email service authentication failed. Check the Gmail App Password and account settings.');
  }
  if (errorCode === 'EENVELOPE' || errorCode === 'EINVALIDRECIPIENT' || responseCode === 550) {
    return smtpError('SMTP_RECIPIENT_REJECTED', 'The verification email address could not be accepted. Check the email address and try again.');
  }
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EDNS'].includes(errorCode)) {
    return smtpError('SMTP_UNAVAILABLE', 'The email service is temporarily unavailable. Please try again later.');
  }
  return smtpError('SMTP_DELIVERY_FAILED', 'We could not send your verification email right now. Please try again later.');
}

async function verifyTransport(transport) {
  if (cachedTransportVerified) return;
  if (!transportVerification) {
    transportVerification = transport.verify()
      .then(() => { cachedTransportVerified = true; })
      .catch((error) => { throw publicSmtpFailure(error); })
      .finally(() => { transportVerification = null; });
  }
  await transportVerification;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function sendOtpEmail(user, otp) {
  const config = readSmtpConfig();
  const transport = transportFor(config);
  const firstName = escapeHtml(user.firstName || 'there');
  try {
    await verifyTransport(transport);
    const info = await transport.sendMail({
      from: `FoodieHub <${config.from}>`,
      to: String(user.email || '').trim(),
      subject: 'Your FoodieHub verification code',
      text: `Hi ${user.firstName || 'there'}, your FoodieHub verification code is ${otp}. It expires in 5 minutes. Do not share this code.`,
      html: `<!doctype html><html><body style="margin:0;background:#fff7ed;font-family:Arial,sans-serif;color:#1e293b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 12px 36px #7c2d1214"><tr><td><div style="font-size:24px;font-weight:800;color:#f97316">Foodie<span style="color:#1e293b">Hub</span></div><h1 style="font-size:24px;margin:28px 0 8px">Verify your email</h1><p style="font-size:15px;line-height:1.6">Hi ${firstName}, use this code to finish creating your FoodieHub account:</p><div style="margin:24px 0;padding:18px;background:#fff7ed;border-radius:12px;text-align:center;font-size:32px;font-weight:800;letter-spacing:10px;color:#c2410c">${otp}</div><p style="font-size:14px;line-height:1.6">This code expires in 5 minutes. If you did not request it, you can ignore this email. Never share your verification code.</p><p style="margin-top:28px;color:#64748b;font-size:12px">FoodieHub account security</p></td></tr></table></td></tr></table></body></html>`,
    });
    if (info?.rejected?.length) throw Object.assign(new Error('Recipient rejected'), { code: 'EENVELOPE' });
    return info;
  } catch (error) {
    throw publicSmtpFailure(error);
  }
}

async function issueOtp(user) {
  const now = new Date();
  const windowStillOpen = user.emailVerificationOtpRequestWindowAt
    && now - new Date(user.emailVerificationOtpRequestWindowAt) < OTP_WINDOW_MS;
  const requestCount = windowStillOpen ? Number(user.emailVerificationOtpRequestCount || 0) : 0;

  if (user.emailVerificationOtpSentAt && now - new Date(user.emailVerificationOtpSentAt) < OTP_COOLDOWN_MS) {
    throw Object.assign(new Error('Please wait before requesting another verification code.'), {
      status: 429,
      code: 'OTP_RESEND_COOLDOWN',
      retryAfterSeconds: Math.ceil((OTP_COOLDOWN_MS - (now - new Date(user.emailVerificationOtpSentAt))) / 1000),
    });
  }
  if (requestCount >= OTP_MAX_REQUESTS) {
    throw Object.assign(new Error('Too many verification code requests. Please try again later.'), { status: 429, code: 'OTP_REQUEST_LIMIT' });
  }

  const otp = generateOtp();
  const sentAt = now;
  await user.update({
    emailVerificationOtpHash: otpDigest(user.id, otp),
    emailVerificationOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
    emailVerificationOtpAttempts: 0,
    emailVerificationOtpSentAt: sentAt,
    emailVerificationOtpRequestCount: requestCount + 1,
    emailVerificationOtpRequestWindowAt: windowStillOpen ? user.emailVerificationOtpRequestWindowAt : now,
  });

  try {
    await sendOtpEmail(user, otp);
  } catch (error) {
    // Keep the account unverified and make the failed code unusable. The sent
    // timestamp and request count still enforce cooldown and abuse limits.
    try {
      await user.update({ emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null });
    } catch {
      // The random code remains unusable to the customer; keep the provider
      // failure response safe even if the cleanup write also fails.
    }
    const safeError = publicSmtpFailure(error);
    throw Object.assign(new Error('We could not send your verification email right now. Please try again later.'), {
      status: 503,
      code: safeError.code || 'OTP_EMAIL_FAILED',
      retryAfterSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
    });
  }
}

async function findPendingCustomer(email, transaction, lock = false) {
  return User.unscoped().findOne({
    where: { email },
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    include: [{ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: ['id'], through: { attributes: [] }, required: true }],
  });
}

function safeEqual(actual, expected) {
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  issueOtp,
  sendOtpEmail,
  readSmtpConfig,
  findPendingCustomer,
  otpDigest,
  safeEqual,
  generateOtp,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS,
  OTP_TTL_MS,
};
