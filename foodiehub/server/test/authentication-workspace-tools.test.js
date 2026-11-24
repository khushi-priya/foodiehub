'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const { User, Order, RestaurantNotification } = require('../src/models');
const auth = require('../src/modules/auth/auth.controller');
const tools = require('../src/modules/restaurants/tools.controller');
const { generateOtp, otpDigest, safeEqual, issueOtp, readSmtpConfig, OTP_TTL_MS } = require('../src/services/customer-email-verification');

test('email verification OTPs are six digit values and are stored as keyed digests', (t) => {
  const priorSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-secret-with-enough-entropy';
  t.after(() => { if (priorSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = priorSecret; });
  const otp = generateOtp();
  assert.match(otp, /^\d{6}$/);
  const digest = otpDigest('customer-id', otp);
  assert.equal(digest.length, 64);
  assert.notEqual(digest, otp);
  assert.equal(safeEqual(digest, otpDigest('customer-id', otp)), true);
  assert.equal(safeEqual(digest, otpDigest('other-customer', otp)), false);
});

test('OTP issuance sends a FoodieHub email, persists only a digest, replaces old codes and enforces resend limits', async (t) => {
  const envNames = ['SESSION_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_FROM', 'OTP_EXPIRES_MINUTES'];
  const priorEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) delete process.env[name];
  for (const [name, value] of Object.entries({ SESSION_SECRET: 'unit-test-secret', SMTP_HOST: ' smtp.gmail.com ', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: ' mailer@example.test ', SMTP_PASSWORD: ' abcd efgh ijkl mnop ', SMTP_FROM: ' mailer@example.test ' })) process.env[name] = value;
  const config = readSmtpConfig();
  assert.equal(config.host, 'smtp.gmail.com');
  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(config.password, 'abcdefghijklmnop');
  assert.equal(OTP_TTL_MS, 5 * 60_000);
  const originalTransport = nodemailer.createTransport;
  const sent = [];
  let verifyCount = 0;
  nodemailer.createTransport = (options) => ({ options, verify: async () => { verifyCount += 1; return true; }, sendMail: async (message) => { sent.push(message); return { rejected: [] }; }, close() {} });
  t.after(() => {
    nodemailer.createTransport = originalTransport;
    for (const name of envNames) { if (priorEnv[name] === undefined) delete process.env[name]; else process.env[name] = priorEnv[name]; }
  });
  const user = { id: 'customer-a', firstName: 'Asha', email: 'asha@example.test', emailVerificationOtpRequestCount: 0, emailVerificationOtpRequestWindowAt: null, emailVerificationOtpSentAt: null, async update(values) { Object.assign(this, values); } };
  await issueOtp(user);
  assert.equal(sent.length, 1);
  assert.equal(verifyCount, 1);
  assert.match(sent[0].html, /Foodie/);
  assert.match(sent[0].text, /expires in 5 minutes/i);
  const firstCode = sent[0].text.match(/\b\d{6}\b/)[0];
  const firstHash = user.emailVerificationOtpHash;
  assert.equal(firstHash, otpDigest(user.id, firstCode));
  assert.notEqual(firstHash, firstCode);
  user.emailVerificationOtpSentAt = new Date(Date.now() - 46_000);
  await issueOtp(user);
  assert.equal(sent.length, 2);
  assert.notEqual(user.emailVerificationOtpHash, firstHash);
  await assert.rejects(issueOtp(user), (error) => error.status === 429 && error.retryAfterSeconds > 0);
  user.emailVerificationOtpSentAt = new Date(Date.now() - 46_000);
  for (let count = 2; count < 5; count += 1) { await issueOtp(user); user.emailVerificationOtpSentAt = new Date(Date.now() - 46_000); }
  await assert.rejects(issueOtp(user), (error) => error.status === 429 && /Too many/.test(error.message));
});

test('SMTP configuration accepts Gmail ports, trims credentials and rejects insecure port combinations safely', (t) => {
  const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS', 'SMTP_FROM'];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => { for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; } });
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'sender@gmail.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop', SMTP_FROM: 'sender@gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true' });
  assert.equal(readSmtpConfig().secure, true);
  process.env.SMTP_PORT = '587';
  process.env.SMTP_SECURE = 'false';
  assert.equal(readSmtpConfig().secure, false);
  process.env.SMTP_SECURE = 'true';
  assert.throws(readSmtpConfig, (error) => error.status === 503 && error.code === 'SMTP_CONFIG_INVALID' && !/password/i.test(error.message));
});

test('SMTP authentication failures are mapped to a safe 503 and invalidate the undelivered OTP', async (t) => {
  const names = ['SESSION_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS', 'SMTP_FROM'];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalTransport = nodemailer.createTransport;
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { SESSION_SECRET: 'safe-error-test-secret', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'sender@gmail.com', SMTP_PASSWORD: 'test-app-password', SMTP_FROM: 'sender@gmail.com' });
  nodemailer.createTransport = () => ({ verify: async () => { throw Object.assign(new Error('private provider response and secret'), { code: 'EAUTH' }); }, sendMail: async () => assert.fail('sendMail must not run after verify failure'), close() {} });
  t.after(() => {
    nodemailer.createTransport = originalTransport;
    for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
  });
  const user = { id: 'smtp-failure-user', firstName: 'Asha', email: 'asha@example.test', emailVerificationOtpRequestCount: 0, emailVerificationOtpRequestWindowAt: null, emailVerificationOtpSentAt: null, async update(values) { Object.assign(this, values); } };
  await assert.rejects(issueOtp(user), (error) => error.status === 503 && error.code === 'SMTP_AUTH_FAILED' && !error.message.includes('private provider response'));
  assert.equal(user.emailVerificationOtpHash, null);
  assert.equal(user.emailVerificationOtpExpiresAt, null);
  assert.equal(user.emailVerifiedAt, undefined);
});

test('customer registration reuses an unverified account, sends a fresh OTP, verifies it, then permits customer login', async (t) => {
  const models = require('../src/models');
  const envNames = ['SESSION_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS', 'SMTP_FROM'];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originals = { unscoped: User.unscoped, create: User.create, findOne: User.findOne, transaction: User.sequelize.transaction, roleFindOne: models.Role.findOne, userRoleCreate: models.UserRole.create, transport: nodemailer.createTransport };
  for (const name of envNames) delete process.env[name];
  Object.assign(process.env, { SESSION_SECRET: 'registration-workflow-secret', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'sender@gmail.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop', SMTP_FROM: 'sender@gmail.com' });
  const sent = [];
  nodemailer.createTransport = () => ({ verify: async () => true, sendMail: async (message) => { sent.push(message); return { rejected: [] }; }, close() {} });
  let customer = null;
  let createdCount = 0;
  User.unscoped = () => ({ findOne: async (options = {}) => options.where?.email && customer?.email === options.where.email ? customer : options.where?.phone && customer?.phone === options.where.phone ? customer : null });
  User.create = async (values) => {
    createdCount += 1;
    customer = { ...values, id: 'registration-customer', emailVerifiedAt: null, emailVerificationOtpRequestCount: 0, emailVerificationOtpRequestWindowAt: null, emailVerificationOtpSentAt: null, roles: [{ code: 'customer', scope: 'platform' }], async update(update) { Object.assign(this, update); } };
    return customer;
  };
  User.sequelize.transaction = async () => ({ LOCK: { UPDATE: 'UPDATE' }, finished: false, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } });
  models.Role.findOne = async () => ({ id: 'customer-role' });
  models.UserRole.create = async () => ({});
  t.after(() => {
    User.unscoped = originals.unscoped; User.create = originals.create; User.findOne = originals.findOne; User.sequelize.transaction = originals.transaction;
    models.Role.findOne = originals.roleFindOne; models.UserRole.create = originals.userRoleCreate; nodemailer.createTransport = originals.transport;
    for (const name of envNames) { if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name]; }
  });

  const registrationBody = { firstName: 'Asha', lastName: 'Kumar', email: 'asha@example.test', phone: '9876543210', password: 'Example@123', confirmPassword: 'Example@123' };
  async function register() {
    let status = 200; let payload;
    await auth.registerCustomer({ body: registrationBody }, { status(value) { status = value; return this; }, json(value) { payload = value; return this; } }, (error) => { throw error; });
    return { status, payload };
  }
  const firstRegistration = await register();
  assert.equal(firstRegistration.status, 201);
  assert.equal(createdCount, 1);
  assert.equal(customer.status, 'pending');
  assert.equal(customer.emailVerifiedAt, null);
  assert.equal(firstRegistration.payload.data.email, registrationBody.email);
  assert.equal(JSON.stringify(firstRegistration.payload).includes(customer.emailVerificationOtpHash), false);

  customer.emailVerificationOtpSentAt = new Date(Date.now() - 46_000);
  const repeatedRegistration = await register();
  assert.equal(repeatedRegistration.status, 200);
  assert.equal(createdCount, 1, 'registration must resend for the existing unverified account instead of inserting a duplicate');
  assert.equal(sent.length, 2);
  const otp = sent[1].text.match(/\b\d{6}\b/)[0];

  async function verify(code) {
    let status = 200; let payload;
    await auth.verifyCustomerEmail({ body: { email: registrationBody.email, otp: code } }, { status(value) { status = value; return this; }, json(value) { payload = value; return this; } }, (error) => { throw error; });
    return { status, payload };
  }
  const verified = await verify(otp);
  assert.equal(verified.status, 200);
  assert.equal(customer.status, 'active');
  assert.ok(customer.emailVerifiedAt);
  assert.equal(customer.emailVerificationOtpHash, null);

  const loginHash = await bcrypt.hash(registrationBody.password, 4);
  customer.passwordHash = loginHash;
  User.findOne = async () => customer;
  let loginStatus = 200;
  const session = { regenerate(callback) { this.userId = undefined; callback(); }, save(callback) { callback(); } };
  const loginResponse = { status(value) { loginStatus = value; return this; }, json() { return this; } };
  await auth.login({ body: { email: registrationBody.email, password: registrationBody.password, portal: 'customer' }, session }, loginResponse, (error) => { throw error; });
  assert.equal(loginStatus, 200);
  assert.equal(session.userId, customer.id);
});

test('customer login refuses an unverified customer before creating a session', async (t) => {
  const originalFindOne = User.findOne;
  const passwordHash = await bcrypt.hash('Example@123', 4);
  User.findOne = async () => ({ passwordHash, status: 'pending', emailVerifiedAt: null, roles: [{ code: 'customer', scope: 'platform' }] });
  t.after(() => { User.findOne = originalFindOne; });
  let status = 200; let payload; let sessionCreated = false;
  const req = { body: { email: 'pending@example.com', password: 'Example@123', portal: 'customer' }, session: { regenerate() { sessionCreated = true; } } };
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await auth.login(req, res, (error) => { throw error; });
  assert.equal(status, 403);
  assert.equal(payload.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(sessionCreated, false);
});

test('customer credentials cannot create restaurant or admin sessions', async (t) => {
  const originalFindOne = User.findOne;
  const originalMembershipFindOne = require('../src/models').RestaurantMember.findOne;
  const passwordHash = await bcrypt.hash('Example@123', 4);
  User.findOne = async () => ({ id: 'customer-a', passwordHash, status: 'active', emailVerifiedAt: new Date(), roles: [{ code: 'customer', scope: 'platform' }] });
  require('../src/models').RestaurantMember.findOne = async () => null;
  t.after(() => { User.findOne = originalFindOne; require('../src/models').RestaurantMember.findOne = originalMembershipFindOne; });
  for (const portal of ['restaurant', 'admin']) {
    let status = 200; let sessionCreated = false;
    const req = { body: { email: 'customer@example.com', password: 'Example@123', portal }, session: { regenerate() { sessionCreated = true; } } };
    const res = { status(value) { status = value; return this; }, json() { return this; } };
    await auth.login(req, res, (error) => { throw error; });
    assert.equal(status, 403, `${portal} portal must reject a customer-only account`);
    assert.equal(sessionCreated, false, `${portal} portal must not create a customer session`);
  }
});

test('a valid portal login replaces an existing session only after credential and role checks', async (t) => {
  const originalFindOne = User.findOne;
  const passwordHash = await bcrypt.hash('Example@123', 4);
  User.findOne = async () => ({ id: 'customer-a', passwordHash, status: 'active', emailVerifiedAt: new Date(), roles: [{ code: 'customer', scope: 'platform' }], async update() {} });
  t.after(() => { User.findOne = originalFindOne; });
  let regenerated = false; let status = 200; let payload;
  const req = {
    body: { email: 'customer@example.com', password: 'Example@123', portal: 'customer' },
    session: {
      userId: 'restaurant-user',
      regenerate(callback) { regenerated = true; this.userId = undefined; callback(); },
      save(callback) { callback(); },
    },
  };
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await auth.login(req, res, (error) => { throw error; });
  assert.equal(status, 200);
  assert.equal(regenerated, true);
  assert.equal(req.session.userId, 'customer-a');
  assert.equal(payload.success, true);
});

test('email verification activates an account once, rejects expired codes and locks after five guesses', async (t) => {
  const priorSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'verification-controller-test-secret';
  const originalUnscoped = User.unscoped;
  const originalTransaction = User.sequelize.transaction;
  t.after(() => {
    User.unscoped = originalUnscoped;
    User.sequelize.transaction = originalTransaction;
    if (priorSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = priorSecret;
  });
  let currentUser;
  User.unscoped = () => ({ findOne: async () => currentUser });
  User.sequelize.transaction = async () => ({ LOCK: { UPDATE: 'UPDATE' }, finished: false, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } });
  const makeUser = (otp, expiresAt) => ({ id: 'customer-a', status: 'pending', emailVerifiedAt: null, emailVerificationOtpHash: otpDigest('customer-a', otp), emailVerificationOtpExpiresAt: expiresAt, emailVerificationOtpAttempts: 0, async update(values) { Object.assign(this, values); } });
  async function verify(otp) {
    let status = 200; let payload;
    await auth.verifyCustomerEmail({ body: { email: 'asha@example.test', otp } }, { status(value) { status = value; return this; }, json(value) { payload = value; return this; } }, (error) => { throw error; });
    return { status, payload };
  }

  currentUser = makeUser('123456', new Date(Date.now() + 60_000));
  const verified = await verify('123456');
  assert.equal(verified.status, 200);
  assert.equal(currentUser.status, 'active');
  assert.ok(currentUser.emailVerifiedAt);
  assert.equal(currentUser.emailVerificationOtpHash, null);
  const reused = await verify('123456');
  assert.equal(reused.status, 400);

  currentUser = makeUser('123456', new Date(Date.now() - 1000));
  const expired = await verify('123456');
  assert.equal(expired.payload.code, 'OTP_EXPIRED');
  assert.equal(currentUser.emailVerificationOtpHash, null);

  currentUser = makeUser('123456', new Date(Date.now() + 60_000));
  let last;
  for (let attempt = 0; attempt < 5; attempt += 1) last = await verify('654321');
  assert.equal(last.payload.code, 'OTP_ATTEMPTS_EXCEEDED');
  assert.equal(currentUser.emailVerificationOtpHash, null);
});

test('restaurant search scopes order and customer lookups to authenticated tenant and branches', async (t) => {
  const originalFindAll = Order.findAll;
  const captured = [];
  Order.findAll = async (options) => { captured.push(options); return []; };
  t.after(() => { Order.findAll = originalFindAll; });
  let response;
  await tools.search({ restaurant: { id: 'restaurant-a' }, restaurantBranchIds: ['branch-a'], restaurantGrantedPermissions: ['orders.view'], query: { q: 'Ravi' } }, { json(value) { response = value; return this; } }, (error) => { throw error; });
  assert.equal(response.success, true);
  assert.equal(captured.length, 2);
  for (const options of captured) {
    assert.equal(options.where.restaurantId, 'restaurant-a');
    assert.deepEqual(options.where.branchId, { [Op.in]: ['branch-a'] });
    assert.equal(options.limit <= 20, true);
  }
});

test('restaurant notification inbox is scoped to the authenticated membership and branch list', async (t) => {
  const originals = { findAll: RestaurantNotification.findAll, count: RestaurantNotification.count };
  const wheres = [];
  RestaurantNotification.findAll = async ({ where }) => { wheres.push(where); return []; };
  RestaurantNotification.count = async ({ where }) => { wheres.push(where); return 0; };
  t.after(() => { RestaurantNotification.findAll = originals.findAll; RestaurantNotification.count = originals.count; });
  let response;
  await tools.notifications({ restaurant: { id: 'restaurant-a' }, restaurantMembership: { id: 'member-a' }, restaurantBranchIds: ['branch-a'], query: { page: '1', limit: '20' } }, { json(value) { response = value; return this; } }, (error) => { throw error; });
  assert.equal(response.success, true);
  assert.equal(wheres.length, 3);
  for (const where of wheres) {
    assert.equal(where.restaurantId, 'restaurant-a');
    assert.equal(where.restaurantMemberId, 'member-a');
    assert.deepEqual(where[Op.or], [{ branchId: null }, { branchId: { [Op.in]: ['branch-a'] } }]);
  }
});
